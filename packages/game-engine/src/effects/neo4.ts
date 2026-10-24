// Neo Destiny (neo4) attack effects, by card id and attack name. Rulings follow the card text (the Neo-era rulebook);
// `text` has the printed wording where TCGdex drops an Energy symbol (Shock Bolt, Dark Fire, Rushing Flames, Ball of Flame,
// Tentacle Wrap, Warm Up, Burning Flame, Fire Blast, Ember, White-Hot Flame, Psyburst) or a word (Beatdown). Shining
// Tyranitar's attacks, which TCGdex leaves unnamed and blank, come from the seed's TCGDEX_FIXES. Attacks that only deal
// damage need no entry; Hidden Power is here for every Unown.
// Rulings (agreed, as for Hatch): Explosive Evolution and Sunbathe do their "Then…" part only on heads.
// Rulings (from the text): questions whose answer depends on a flip are asked before it (Crushing Blow, Bubble Jump, Ball
// of Flame, Wash Away, Healing Water…), as in Neo Genesis. "Your opponent may…, either way you may do the same" attacks ask the
// opponent first (Flipper Stroke, Fish Out, Mysterious Wing, Evolution Song); Searchlight asks the attacking player first.
// Pull In's switch is a Benched Pokémon or none (-1, the Defending Pokémon clicked). Call Back can't be used while the opponent's Bench is full
// (the card's "your Bench" means theirs). Bubble Jump's heads moves 2 Energy cards and returns Light Azumarill; tails does
// only the damage. Rushing Flames may discard Fire Energy cards from any of the attacking player's Pokémon. Reflect Shield's
// 20 damage gets Weakness and Resistance, as Fire Wall's does. Charm lowers every attack damage the Defending Pokémon does.
import { pokemonOn, targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicPokemon, isPokemonCard, isTrainerCard, lookupCard } from '../cards.js';
import { energyPool, isEnergyCardOf, isSpecialEnergy, type CardInstance, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { clearOnLeavingActive, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { pokemonTower } from '../trainers.js';
import { benchTarget, discardToUse, flipToInflict, flipToProtect, headsUntilTails, inflicts, opponentBenchChoice, opponentSwitches, perHeads, recoil } from './common.js';
import { smokescreen } from './fossil.js';
import { discardFromAttacker, healEach, noRetreat } from './gym1.js';
import { discardStadium } from './gym2.js';
import { flipForMore } from './jungle.js';
import { damageOpponent, hold, opponentTargets, swift } from './neo1.js';
import { evolutionsOf, hiddenPower, hiddenPowerOf } from './neo2.js';
import { discardFree, energyCanGo, notNextTurn, reachesDefender } from './neo3.js';
import { flipOrNothing, shuffleIntoDeck } from './rocket.js';
import { eitherCondition, healUpTo } from './si1.js';

/** The opponent's Pokémon in play, by target, the Defending Pokémon first. */
const opponentInPlay = (ctx: AttackContext) => targetsIn(ctx.opp.active, ctx.opp.bench).map((t) => [t, pokemonOn(ctx.opp.active, ctx.opp.bench, t)!] as const);

/** Fire (or Lightning…) Energy cards attached to the attacker, plain ones before Rainbow Energy. */
const cardsOf = (ctx: Pick<AttackContext, 'attacker' | 'state'>, type: 'fire' | 'lightning' | 'darkness') => {
  const cards = ctx.attacker.energy.filter((e) => (type === 'darkness' ? lookupCard(ctx.state.cards, e.defId).name === 'Darkness Energy' || isEnergyCardOf(e, ctx.state.cards, type) : isEnergyCardOf(e, ctx.state.cards, type)));
  return [...cards.filter((e) => lookupCard(ctx.state.cards, e.defId).name !== 'Rainbow Energy'), ...cards.filter((e) => lookupCard(ctx.state.cards, e.defId).name === 'Rainbow Energy')];
};

/** Energy attached to a Pokémon beyond `cost` symbols, up to `cap` (Ink Blast, Water Gun, Water Slash: any type). */
const spareEnergy = (ctx: AttackContext, cost: number, cap = Infinity) => Math.min(cap, Math.max(0, energyPool(ctx.attacker, ctx.state.cards).length - cost));

/** Discards the top `n` cards of `player`'s deck (Mountain Smasher, Mountain Crush). */
function discardTop(ctx: AttackContext, player: PlayerState, n: number) {
  const gone = player.deck.splice(0, n);
  player.discard.push(...gone);
  if (gone.length) ctx.log(`Discarded ${gone.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the top of the deck.`, player.id);
}

/** Discards `n` Energy cards from the Defending Pokémon: at once when there's nothing to choose, otherwise the attacking player picks after the attack. */
function discardFromDefender(ctx: AttackContext, n: number, source: string) {
  const defender = ctx.opp.active;
  if (!n || !defender || defender.damage >= inPlayDef(ctx.state.cards, defender).hp) return;
  const energy = defender.energy.filter((e) => !e.provides);
  if (!energy.length || !reachesDefender(ctx) || !energyCanGo(ctx, defender)) return;
  if (energy.length <= n || new Set(energy.map((e) => e.defId)).size === 1) {
    const gone = energy.slice(0, n);
    for (const e of gone) ctx.discardDefenderEnergy(e.uid);
    return;
  }
  ctx.pend({ kind: 'removeEach', source, targets: Array<Target>(n).fill('active') });
}

/** Damage to the opponent's Pokémon at `t`, without Weakness and Resistance; the damage done. */
function damageWithout(ctx: AttackContext, t: Target, amount: number): number {
  const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t);
  if (!p) return 0;
  const before = p.damage;
  damageOpponent(ctx, t, amount);
  return Math.max(0, p.damage - before);
}

/** An evolved Pokémon of the opponent's (Prehistoric Water). */
const evolvedOpponents = (s: AttackSituation) => targetsIn(s.defender, s.opponentBench).filter((t) => pokemonOn(s.defender, s.opponentBench, t)!.evolvedFrom.length > 0);

/** Basic or Baby Pokémon cards in a discard pile (Call Back, Guiding Flame). */
const basicsIn = (s: Pick<AttackSituation, 'cards'>, pile: CardInstance[] = []) => pile.filter((c) => isBasicPokemon(lookupCard(s.cards, c.defId)));

/** Energy cards (not a Pokémon attached as Energy) on a Pokémon. */
const energyCards = (p: InPlayPokemon) => p.energy.filter((e) => !e.provides);

/** The player's (`me`) Pokémon names in play (Evolution Song: what may evolve). */
const namesInPlay = (ctx: AttackContext, player: PlayerState) => [...new Set([player.active, ...player.bench].flatMap((p) => (p ? [lookupCard(ctx.state.cards, p.card.defId).name] : [])))];

export const NEO4: Record<string, Record<string, AttackEffect>> = {
  // Dark Ampharos
  'neo4-1': {
    'Shock Bolt': {
      text: 'Discard all Lightning Energy cards attached to Dark Ampharos or this attack does nothing.',
      run(ctx) {
        const lightning = cardsOf(ctx, 'lightning');
        if (!lightning.length) return ctx.log('Shock Bolt did nothing.');
        discardFromAttacker(ctx, lightning);
        ctx.hit(50);
      },
    },
  },
  // Dark Crobat: damage counters removed equal to the damage done.
  'neo4-2': {
    'Dark Drain': {
      run(ctx) {
        let done = 0;
        for (const [t] of opponentInPlay(ctx)) if (ctx.flip()) done += damageWithout(ctx, t, 10);
        ctx.heal(done);
      },
    },
  },
  // Dark Donphan
  'neo4-3': {
    'Tusk Toss': {
      run(ctx) {
        if (!ctx.opp.bench.some(Boolean)) return ctx.log('Tusk Toss did nothing.');
        if (ctx.flip()) ctx.returnDefender();
        else opponentSwitches(ctx, 'Tusk Toss');
      },
    },
  },
  // Dark Espeon
  'neo4-4': {
    Gouge: flipForMore(10, 10),
    Psysplash: {
      run(ctx) {
        for (const [t, p] of opponentInPlay(ctx)) if (energyCards(p).length) damageOpponent(ctx, t, 10 * energyCards(p).length);
      },
    },
  },
  // Dark Feraligatr
  'neo4-5': {
    'Crushing Blow': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        ctx.hit(50);
        const uid = ctx.choices.defenderEnergyUid;
        if (uid && ctx.opp.active?.energy.some((e) => e.uid === uid) && ctx.flip()) ctx.discardDefenderEnergy(uid);
      },
    },
  },
  // Dark Gengar: the switch first, then the damage and Sleep to the new Defending Pokémon.
  'neo4-6': {
    'Pull In': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(null, s.opponentBench) as number[];
        return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
        ctx.hit(30);
        ctx.inflict('asleep');
      },
    },
  },
  // Dark Houndoom
  'neo4-7': {
    'Eerie Howl': {
      blocked: (s) => (openBenchSlot(s.opponentBench, s.cards, s.stadium) < 0 ? "Your opponent's Bench is full" : null),
      run: (ctx) => ctx.pend({ kind: 'oppHandToActive', source: 'Eerie Howl' }),
    },
    'Dark Fire': {
      text: "If there are any Darkness Energy cards attached to Dark Houndoom, discard 1 of them and this attack does 30 damage plus 20 more damage (plus 10 more damage for the Darkness Energy you discarded). If there aren't any, this attack does 30 damage.",
      run(ctx) {
        const dark = ctx.attacker.energy.find((e) => !e.provides && lookupCard(ctx.state.cards, e.defId).name === 'Darkness Energy');
        if (!dark) return void ctx.hit(30);
        discardFromAttacker(ctx, [dark]);
        ctx.hit(60);
      },
    },
  },
  // Dark Porygon2
  'neo4-8': {
    'Curve Attack': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.protect('preventDamage');
      },
    },
  },
  // Dark Scizor
  'neo4-9': {
    Threaten: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Threaten did nothing.');
        ctx.pend({ kind: 'oppHandTrainer', source: 'Threaten' });
      },
    },
  },
  // Dark Typhlosion
  'neo4-10': {
    'Rushing Flames': {
      text: 'You may discard any number of Fire Energy cards attached to your Pokémon. Flip a coin for each Fire Energy card discarded in this way. This attack does 40 damage times the number of heads.',
      choices(s): ChoiceSpec[] {
        const options = [s.attacker, ...s.ownBench].flatMap((p) => (p ? p.energy.filter((e) => isEnergyCardOf(e, s.cards, 'fire')) : []));
        return options.length ? [{ kind: 'ownEnergyAny', options, prompt: 'Choose any number of Fire Energy cards attached to your Pokémon to discard: a coin for each, 40 damage per heads' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        let discarded = 0;
        for (const p of [ctx.me.active, ...ctx.me.bench]) {
          if (!p) continue;
          const gone = p.energy.filter((e) => uids.has(e.uid) && isEnergyCardOf(e, ctx.state.cards, 'fire'));
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          ctx.log(`Discarded ${gone.length} Fire Energy from ${pokemonName(ctx.state, p)}.`);
          discarded += gone.length;
        }
        ctx.hit(40 * ctx.flips(discarded));
      },
    },
  },
  // Dark Tyranitar
  'neo4-11': {
    'Mountain Smasher': {
      run(ctx) {
        const heads = ctx.flips(energyCards(ctx.attacker).length);
        ctx.hit(20 * heads);
        discardTop(ctx, ctx.opp, heads);
      },
    },
    'Fling Away': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 30 damage to"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot]) return void ctx.hit(50);
        ctx.hit(30);
        ctx.damageBenched(ctx.opp, slot, 30);
      },
    },
  },
  // Light Arcanine
  'neo4-12': {
    'Gentle Flames': { run: (ctx) => void ctx.hit(ctx.defenderDef.baby ? 10 : ctx.defenderDef.stage === 'basic' ? 30 : 50) },
  },
  // Light Azumarill
  'neo4-13': {
    Bubble: flipToInflict(10, 'paralyzed'),
    'Bubble Jump': {
      choices(s): ChoiceSpec[] {
        const bench = targetsIn(null, s.ownBench) as number[];
        if (!bench.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'ownBench', options: bench, prompt: 'Choose a Benched Pokémon to move 2 Energy cards to (if heads)' }];
        const energy = energyCards(s.attacker);
        if (energy.length > 2 && new Set(energy.map((e) => e.defId)).size > 1) specs.push({ kind: 'ownEnergy', count: 2, options: energy, prompt: 'Choose the 2 Energy cards to move (if heads)' });
        return specs;
      },
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        const to = slot === undefined ? null : ctx.me.bench[slot];
        if (!to || ctx.me.active !== ctx.attacker || !ctx.flip()) return;
        const chosen = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        const moved = (chosen.length ? chosen : energyCards(ctx.attacker)).slice(0, 2);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !moved.includes(e));
        to.energy.push(...moved);
        ctx.log(`Moved ${moved.length} Energy card${moved.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, to)}.`);
        const p = ctx.attacker;
        ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
        ctx.me.active = null;
        ctx.log(`${ctx.attackerDef.name} and all cards attached to it returned to the hand.`);
      },
    },
  },
  // Light Dragonite
  'neo4-14': {
    'Light Wave': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).effectProof = ctx.turn + 1;
        ctx.log(`Attacks do nothing to ${ctx.attackerDef.name} but damage next turn.`);
      },
    },
  },
  // Light Togetic
  'neo4-15': {
    'Sweet Kiss': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.opp.deck.length) ctx.opponentChooses({ kind: 'drawCount', source: 'Sweet Kiss', max: 1 });
      },
    },
  },
  // Dark Ariados
  'neo4-17': {
    Entangle: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch with the Defending Pokémon"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot]) return ctx.log('Entangle did nothing.');
        ctx.switchDefender(slot);
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
    'Poison Bind': {
      run(ctx) {
        ctx.hit(30);
        ctx.inflict('poisoned');
        if (ctx.flip()) hold(ctx, ctx.turn + 1);
      },
    },
  },
  // Dark Magcargo
  'neo4-18': {
    'Ball of Flame': {
      text: "You may discard a Fire Energy card attached to Dark Magcargo when you use this attack. If you do and if your opponent has any Benched Pokémon, choose 1 of them and this attack does 20 damage to it. (Don't apply Weakness and Resistance for Benched Pokémon.)",
      choices(s, c): ChoiceSpec[] {
        if (!s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'fire')) || !s.opponentBench.some(Boolean)) return [];
        const ask: ChoiceSpec = { kind: 'boost', options: [true, false], prompt: "Discard a Fire Energy card for 20 damage to one of your opponent's Benched Pokémon?" };
        return c.boost ? [ask, ...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to")] : [ask];
      },
      run(ctx) {
        ctx.hit(20);
        const slot = ctx.choices.benchSlot;
        const fire = cardsOf(ctx, 'fire')[0];
        if (!ctx.choices.boost || slot === undefined || !fire || ctx.me.active !== ctx.attacker) return;
        discardFromAttacker(ctx, [fire]);
        ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Dark Omastar
  'neo4-19': {
    'Prehistoric Water': {
      choices(s): ChoiceSpec[] {
        const options = evolvedOpponents(s);
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Evolved Pokémon (if heads, its top Evolution card is shuffled into their deck)" }] : [];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        if (t === undefined) return ctx.log('Your opponent has no Evolved Pokémon.');
        if (!ctx.flip()) return ctx.log('Prehistoric Water did nothing.');
        const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t)!;
        if (!p.evolvedFrom.length || !(t === 'active' ? reachesDefender(ctx) : ctx.canAffect(ctx.opp, p))) return;
        const top = p.card;
        p.card = p.evolvedFrom.pop()!;
        clearOnLeavingActive(p);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, top], ctx.state.rngState);
        ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} was shuffled into the deck; it's ${pokemonName(ctx.state, p)} again.`, ctx.opp.id);
      },
    },
    'Dark Tentacle': {
      run(ctx) {
        ctx.hit(30);
        ctx.affectDefender((e) => {
          e.noEvolve = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't evolve next turn, but by attacks and Pokémon Powers.`, ctx.opp.id);
        });
      },
    },
  },
  // Dark Slowking
  'neo4-20': { 'Mind Shock': { run: (ctx) => void ctx.hit(30, { weakness: false, resistance: false }) } },
  // Dark Ursaring
  'neo4-21': {
    Provoke: {
      run(ctx) {
        // The attacking player puts the opponent's Basic Pokémon down, then the opponent puts theirs.
        ctx.pend({ kind: 'oppHandBasics', source: 'Provoke' });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Provoke', kind: 'oppHandBasics' });
      },
    },
    'Battle Frenzy': {
      run(ctx) {
        if (ctx.flip()) ctx.selfDamage(20);
        ctx.me.bench.forEach((p, slot) => p && ctx.flip() && ctx.damageBenched(ctx.me, slot, 20));
        for (const [t] of opponentInPlay(ctx)) if (ctx.flip()) damageOpponent(ctx, t, 20);
      },
    },
  },
  // Light Dragonair
  'neo4-22': {
    'Healing Light': { run: (ctx) => healEach(ctx, 10) },
    'Protective Wave': flipToProtect(20, 'preventAll'),
  },
  // Light Lanturn
  'neo4-23': {
    Searchlight: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Searchlight did nothing.');
        if (pokemonTower({ stadium: ctx.state.stadium?.card, cards: ctx.state.cards })) return ctx.log('Pokémon Tower: cards in discard piles stay there.');
        if (!discardFree(ctx)) return;
        const choice = { source: 'Searchlight', kind: 'discardToHand', count: 1, filter: 'any' } as const;
        if (ctx.me.discard.length) ctx.pend({ ...choice, then: ctx.opp.id });
        else if (ctx.opp.discard.length) ctx.opponentChooses(choice);
      },
    },
    Spark: benchTarget(30, 10),
  },
  // Light Ledian
  'neo4-24': {
    'Flash Touch': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(null, s.ownBench) as number[];
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose a Benched Pokémon to switch with Light Ledian' }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || !ctx.me.bench[slot]) return ctx.log('Flash Touch did nothing.');
        ctx.switchOwn(slot);
        const active = ctx.me.active;
        if (!active || active === ctx.attacker) return;
        (active.effects ??= {}).flashTouch = true;
        ctx.log(`${pokemonName(ctx.state, active)} can't become Asleep, Confused, Paralyzed or Poisoned while it's the Active Pokémon.`);
      },
    },
    'Comet Punch': perHeads(4, 20),
  },
  // Light Machamp
  'neo4-25': {
    Beatdown: {
      text: 'If the Defending Pokémon has Dark in its name or is a Darkness Pokémon, flip a coin. If heads, this attack does 100 damage instead of 50.',
      run(ctx) {
        const dark = /\bDark\b/.test(ctx.defenderDef.name) || ctx.defenderDef.type === 'darkness';
        ctx.hit(dark && ctx.flip() ? 100 : 50);
      },
    },
  },
  // Light Piloswine
  'neo4-26': {
    'Knock Over': {
      choices: (s): ChoiceSpec[] => (s.stadium ? [{ kind: 'boost', options: [true, false], prompt: 'Discard the Stadium card in play?' }] : []),
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.boost) discardStadium(ctx);
      },
    },
  },
  // Unown G, H, W, X
  'neo4-27': { 'Hidden Power': hiddenPower },
  'neo4-28': { 'Hidden Power': hiddenPower },
  'neo4-29': { 'Hidden Power': hiddenPower },
  'neo4-30': { 'Hidden Power': hiddenPower },
  // Chansey
  'neo4-31': {
    'Double Slap': perHeads(2, 20),
    'Egg Toss': { run: (ctx) => (ctx.flips(2) === 2 ? void ctx.hit(80) : ctx.log('Egg Toss did nothing.')) },
  },
  // Dark Croconaw
  'neo4-32': {
    'Clamping Jaw': {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          e.smokescreen = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn, and its attacks need heads.`, ctx.opp.id);
        });
      },
    },
  },
  // Dark Exeggutor
  'neo4-33': {
    'Triple Headbutt': perHeads(3, 10),
    'MAX Burst': { run: (ctx) => void ctx.hit(20 * ctx.flips(opponentInPlay(ctx).reduce((n, [, p]) => n + energyCards(p).length, 0))) },
  },
  // Dark Flaaffy
  'neo4-34': {
    'High Voltage': {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.opp.noTrainersUntil = Math.max(ctx.opp.noTrainersUntil ?? 0, ctx.turn + 1);
        ctx.log("Your opponent can't play Trainer cards next turn.");
      },
    },
    'Stun Wave': {
      run(ctx) {
        ctx.hit(30);
        const defender = ctx.opp.active;
        if (!defender || !inPlayDef(ctx.state.cards, defender).power) return;
        ctx.affectDefender(() => {
          defender.powerOffUntil = ctx.turn + 2;
          ctx.log(`${inPlayDef(ctx.state.cards, defender).power!.name} stops working until the end of your next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Dark Forretress
  'neo4-35': {
    'Armor Up': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).armorUp = ctx.turn + 2;
        ctx.log(`If an attack would Knock Out ${ctx.attackerDef.name} until the end of your next turn, a heads leaves it with 10 HP.`);
      },
    },
    Explosion: recoil(60, 60),
  },
  // Dark Haunter
  'neo4-36': {
    'Call Back': {
      blocked: (s) => (openBenchSlot(s.opponentBench, s.cards, s.stadium) < 0 ? "Your opponent's Bench is full" : null),
      choices(s): ChoiceSpec[] {
        const options = s.discardsLocked ? [] : basicsIn(s, s.opponentDiscard);
        return options.length ? [{ kind: 'oppDiscard', options, prompt: "Choose a Baby or Basic Pokémon from your opponent's discard pile to put onto their Bench" }] : [];
      },
      run(ctx) {
        const card = ctx.opp.discard.find((c) => c.uid === ctx.choices.oppDiscardUid);
        const slot = openBenchSlot(ctx.opp.bench, ctx.state.cards, ctx.state.stadium?.card);
        if (!card || slot < 0 || !discardFree(ctx)) return ctx.log('Call Back did nothing.');
        ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
        ctx.opp.bench[slot] = { card, evolvedFrom: [], damage: 10, energy: [], playedTurn: ctx.turn };
        ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} onto the Bench with a damage counter.`, ctx.opp.id);
      },
    },
    Surround: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) return ctx.inflict('asleep');
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Dark Omanyte: at most 30.
  'neo4-37': {
    'Water Cannon': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do the damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', Math.min(30, 10 * energyCards(ctx.attacker).length)),
    },
  },
  // Dark Pupitar
  'neo4-38': {
    'Rock Tackle': {
      run(ctx) {
        ctx.hit(40);
        ctx.selfDamage(10);
        notNextTurn(ctx, 'Rock Tackle');
      },
    },
    'Explosive Evolution': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Explosive Evolution did nothing.');
        for (const [t] of opponentInPlay(ctx)) damageOpponent(ctx, t, 10);
        if (ctx.me.active !== ctx.attacker) return;
        if (ctx.me.deck.some((c) => lookupCard(ctx.state.cards, c.defId).name === 'Dark Tyranitar')) return ctx.pend({ kind: 'evolveFromDeck', source: 'Explosive Evolution', target: 'active', names: ['Dark Tyranitar'] });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Found nothing in the deck.');
      },
    },
  },
  // Dark Quilava
  'neo4-39': {
    Incinerate: {
      run(ctx) {
        const top = ctx.opp.deck[0];
        if (!top) return ctx.log("Your opponent's deck is empty.");
        const d = lookupCard(ctx.state.cards, top.defId);
        ctx.log(`The top card of the deck is ${d.name}.`, ctx.opp.id);
        if (!isTrainerCard(d)) return;
        ctx.opp.deck.shift();
        ctx.opp.discard.push(top);
        ctx.log(`Discarded ${d.name}.`, ctx.opp.id);
      },
    },
    'Rushing Magma': {
      run(ctx) {
        const gone = ctx.me.deck.splice(0, 5);
        ctx.me.discard.push(...gone);
        ctx.log(`Discarded the top ${gone.length} card${gone.length === 1 ? '' : 's'} of the deck.`);
        ctx.hit(20 * gone.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length);
      },
    },
  },
  // Dark Wigglytuff
  'neo4-40': {
    'Dark Song': eitherCondition(0, 'asleep', 'confused'),
    'Slap Awake': {
      run(ctx) {
        const defender = ctx.opp.active!;
        const was = defender.condition === 'asleep' || defender.condition === 'confused';
        ctx.hit(was ? 40 : 20);
        if (!was || ctx.opp.active !== defender) return;
        ctx.affectDefender(() => {
          defender.condition = null;
          ctx.log(`${pokemonName(ctx.state, defender)} is no longer Asleep or Confused.`, ctx.opp.id);
        });
      },
    },
  },
  // Heracross
  'neo4-41': { 'Charging Horn': flipForMore(30, 30) },
  // Hitmonlee
  'neo4-42': { 'One-Two Kick': perHeads(2, 20), 'Heel Drop': flipOrNothing(60) },
  // Houndour
  'neo4-43': { Corner: noRetreat(0), Lunge: flipOrNothing(30) },
  // Jigglypuff
  'neo4-44': {
    Expand: {
      run(ctx) {
        ctx.hit(10);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 10, until: ctx.turn + 1 };
        ctx.log(`Damage to ${ctx.attackerDef.name} is 10 less next turn.`);
      },
    },
  },
  // Light Dewgong
  'neo4-45': {
    'Freezing Breath': eitherCondition(10, 'paralyzed', 'asleep'),
    'Ice Pillar': {
      run(ctx) {
        ctx.hit(40);
        ctx.me.icePillar = { until: ctx.turn + 1, by: ctx.attacker.card.uid };
        ctx.log(`While ${ctx.attackerDef.name} is the Active Pokémon, attack damage to your Benched Pokémon is prevented next turn.`);
      },
    },
  },
  // Light Flareon
  'neo4-46': {
    'Warm Up': {
      text: 'If you have any benched Pokémon, search your deck for a Fire Energy card and attach it to 1 of them. Then shuffle your deck.',
      blocked: (s) => (s.ownBench.some(Boolean) ? null : 'You have no Benched Pokémon'),
      run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Warm Up', filter: 'energyType', type: 'fire', attach: true, attachOnly: { bench: true } }),
    },
    'Burning Flame': {
      text: 'Flip 2 coins. For each heads, discard a Fire Energy card attached to Light Flareon or this attack does nothing. This attack does 30 damage plus 20 damage for each heads.',
      run(ctx) {
        const heads = ctx.flips(2);
        const fire = cardsOf(ctx, 'fire');
        if (fire.length < heads) return ctx.log('Burning Flame did nothing: not enough Fire Energy cards to discard.');
        discardFromAttacker(ctx, fire.slice(0, heads));
        ctx.hit(30 + 20 * heads);
      },
    },
  },
  // Light Golduck
  'neo4-47': {
    'Flipper Stroke': {
      run(ctx) {
        const choice = { source: 'Flipper Stroke', kind: 'pickFromTop', take: 3, basicEnergy: true } as const;
        if (ctx.opp.deck.length) ctx.opponentChooses({ ...choice, looked: ctx.opp.deck.slice(0, 3).map((c) => c.uid), then: ctx.me.id });
        else if (ctx.me.deck.length) ctx.pend({ ...choice, looked: ctx.me.deck.slice(0, 3).map((c) => c.uid) });
      },
    },
    'Core Blast': { run: (ctx) => void ctx.hit(30 + 20 * ctx.defender.energy.filter((e) => isSpecialEnergy(ctx.state.cards, e)).length) },
  },
  // Light Jolteon
  'neo4-48': {
    'Pulse Guard': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).pulseGuard = ctx.turn + 1;
        ctx.log(`Attack damage of 30 or more to ${ctx.attackerDef.name} is prevented next turn.`);
      },
    },
    'Thunder Needle': {
      run(ctx) {
        const heads = ctx.flips(3);
        ctx.hit(20 * heads);
        if (heads >= 2) ctx.inflict('paralyzed');
      },
    },
  },
  // Light Machoke
  'neo4-49': {
    'Return Home': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(null, s.ownBench) as number[];
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose a Benched Pokémon to shuffle into your deck with its cards' }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || !ctx.me.bench[slot]) return ctx.log('Return Home did nothing.');
        shuffleIntoDeck(ctx, ctx.me, slot, false);
      },
    },
    'Gentle Kick': { run: (ctx) => void ctx.hit(ctx.defender.damage ? 20 : 40) },
  },
  // Light Ninetales
  'neo4-50': {
    'Guiding Flame': {
      blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      choices(s): ChoiceSpec[] {
        const options = basicsIn(s, s.ownDiscard);
        return options.length ? [{ kind: 'ownDiscard', min: 1, max: 1, options, prompt: 'Choose a Baby or Basic Pokémon from your discard pile to put onto your Bench' }] : [];
      },
      run(ctx) {
        ctx.hit(50);
        const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids?.[0]);
        const slot = openBenchSlot(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card);
        if (!card || slot < 0 || !discardFree(ctx)) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        ctx.me.bench[slot] = { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: ctx.turn };
        ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} onto the Bench.`);
      },
    },
    'Fire Blast': discardToUse(50, 1, 'fire', 'Discard a Fire Energy card attached to Light Ninetales in order to use this attack.'),
  },
  // Light Slowbro
  'neo4-51': {
    'Fish Out': {
      run(ctx) {
        if (!discardFree(ctx)) return;
        const has = (p: PlayerState) => p.discard.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
        const choice = { source: 'Fish Out', kind: 'discardToDeck', count: 3, of: 3 } as const;
        if (has(ctx.opp)) ctx.opponentChooses({ ...choice, then: ctx.me.id });
        else if (has(ctx.me)) ctx.pend(choice);
      },
    },
    'Slash About': { run: (ctx) => void ctx.hit(energyCards(ctx.defender).length > energyCards(ctx.attacker).length ? 40 : 20) },
  },
  // Light Vaporeon
  'neo4-52': {
    'Wash Away': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(null, s.ownBench) as number[];
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose a Benched Pokémon to heal and discard the Energy from (if heads)' }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        const p = slot === undefined ? null : ctx.me.bench[slot];
        if (!p || !ctx.flip()) return ctx.log('Wash Away did nothing.');
        healUpTo(ctx, ctx.me, p, p.damage);
        ctx.me.discard.push(...p.energy.map(({ provides: _, ...c }) => c));
        p.energy = [];
        ctx.log(`Discarded the Energy attached to ${pokemonName(ctx.state, p)}.`);
      },
    },
    'Hypno Shower': {
      run(ctx) {
        ctx.hit(30);
        ctx.inflict('asleep');
        ctx.me.bench.forEach((p) => p && healUpTo(ctx, ctx.me, p, 10));
        ctx.opp.bench.forEach((p) => p && p.damage && ctx.canAffect(ctx.opp, p) && healUpTo(ctx, ctx.opp, p, 10));
      },
    },
  },
  // Light Venomoth
  'neo4-53': {
    'Mysterious Wing': {
      run(ctx) {
        if (pokemonTower({ stadium: ctx.state.stadium?.card, cards: ctx.state.cards })) return ctx.log('Pokémon Tower: cards in discard piles stay there.');
        if (!discardFree(ctx)) return;
        const has = (p: PlayerState) => p.discard.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
        const choice = { source: 'Mysterious Wing', kind: 'discardToHand', count: 1 } as const;
        if (has(ctx.opp)) ctx.opponentChooses({ ...choice, then: ctx.me.id });
        else if (has(ctx.me)) ctx.pend(choice);
      },
    },
    Synchronize: {
      run(ctx) {
        if (energyCards(ctx.attacker).length !== energyCards(ctx.defender).length) return ctx.log('Synchronize did nothing.');
        ctx.hit(40);
      },
    },
  },
  // Light Wigglytuff: the opponent first, then the attacking player, may each evolve 1 Pokémon from the deck.
  'neo4-54': {
    'Evolution Song': {
      run(ctx) {
        const mine = namesInPlay(ctx, ctx.me);
        ctx.opponentChooses({ kind: 'evolveMany', source: 'Evolution Song', names: namesInPlay(ctx, ctx.opp), done: [], once: true, then: ctx.me.id, thenNames: mine });
      },
    },
    'Body Slam': flipToInflict(20, 'paralyzed'),
  },
  // Scyther
  'neo4-55': { Agility: flipToProtect(10, 'preventAll') },
  // Togepi
  'neo4-56': {
    Charm: {
      run(ctx) {
        ctx.affectDefender((e) => {
          e.charm = { amount: 10, until: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name}'s attacks do 10 less damage next turn.`, ctx.opp.id);
        });
      },
    },
    'Spike Ball Tackle': recoil(20, 10),
  },
  // Unown C, P, Q, Z
  'neo4-57': { 'Hidden Power': hiddenPower },
  'neo4-58': { 'Hidden Power': hiddenPower },
  'neo4-59': { 'Hidden Power': hiddenPower },
  'neo4-60': { 'Hidden Power': hiddenPower },
  // Cyndaquil
  'neo4-61': { Smokescreen: smokescreen(10) },
  // Dark Octillery
  'neo4-62': {
    'Ink Blast': { run: (ctx) => void ctx.hit(20 + 10 * spareEnergy(ctx, 1, 2)) },
    'Tentacle Wrap': {
      text: "Flip a coin. If heads, the Defending Pokémon is now Paralyzed. If tails, during your opponent's next turn, your opponent pays Colorless more to retreat the Defending Pokémon.",
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) return ctx.inflict('paralyzed');
        ctx.affectDefender((e) => {
          e.heavier = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} costs 1 more to retreat next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Dratini
  'neo4-63': { Shed: { run: (ctx) => ctx.heal(10) }, 'Fury Attack': perHeads(2, 10) },
  // Exeggcute
  'neo4-64': { 'Sleep Power': inflicts(10, 'asleep'), Psyshock: flipToInflict(10, 'paralyzed') },
  // Gastly
  'neo4-65': { Nightmare: inflicts(10, 'asleep') },
  // Girafarig
  'neo4-66': { 'Tail Bite': flipForMore(10, 20), Psychic: { run: (ctx) => void ctx.hit(10 + 10 * ctx.defender.energy.length) } },
  // Gligar
  'neo4-67': {
    'Stun Poison': {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Hitmonchan
  'neo4-69': {
    Dodge: {
      run(ctx) {
        (ctx.attacker.effects ??= {}).dodge = ctx.turn + 1;
        ctx.log(`If an attack would damage ${ctx.attackerDef.name} next turn, a heads prevents the damage.`);
      },
    },
  },
  // Larvitar
  'neo4-70': {
    Leer: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Leer did nothing.');
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Ledyba
  'neo4-71': { Swift: swift(20) },
  // Light Sunflora
  'neo4-72': {
    'Reflected Sunlight': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to attach up to 2 Energy cards from your hand to' }],
      run(ctx) {
        if (!ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) return ctx.log('No Energy cards in the hand.');
        ctx.pend({ kind: 'attachFromHand', source: 'Reflected Sunlight', count: 2, target: ctx.choices.ownTarget ?? 'active' });
      },
    },
  },
  // Mantine
  'neo4-74': {
    'Giant Wave': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
      },
    },
  },
  // Phanpy
  'neo4-76': { 'Crushing Step': flipForMore(10, 10) },
  // Psyduck
  'neo4-79': {
    Migraine: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.inflict('confused');
        else ctx.confuseSelf();
      },
    },
  },
  // Remoraid
  'neo4-80': { 'Fury Strikes': perHeads(3, 10) },
  // Seel
  'neo4-81': { 'Take Down': recoil(30, 10) },
  // Sunkern (as Hatch: the "Then…" part only on heads)
  'neo4-83': {
    Sunbathe: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Sunbathe did nothing.');
        ctx.heal('all');
        const names = evolutionsOf(ctx, ctx.attackerDef.name);
        if (ctx.me.deck.some((c) => names.includes(lookupCard(ctx.state.cards, c.defId).name))) return ctx.pend({ kind: 'evolveFromDeck', source: 'Sunbathe', target: 'active', names });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Found nothing in the deck.');
      },
    },
  },
  // Swinub
  'neo4-84': { 'Generate Cold': flipToInflict(20, 'paralyzed') },
  // Totodile
  'neo4-85': { 'Water Gun': { run: (ctx) => void ctx.hit(10 + 10 * spareEnergy(ctx, 1, 2)) } },
  // Unown L, S, T, V (S and T: 20)
  'neo4-86': { 'Hidden Power': hiddenPower },
  'neo4-87': { 'Hidden Power': hiddenPowerOf(20) },
  'neo4-88': { 'Hidden Power': hiddenPowerOf(20) },
  'neo4-89': { 'Hidden Power': hiddenPower },
  // Venonat
  'neo4-90': { Poisonpowder: inflicts(40, 'poisoned') },
  // Vulpix
  'neo4-91': { Ember: discardToUse(30, 1, 'fire', 'Discard 1 Fire Energy card attached to Vulpix in order to use this attack.') },
  // Shining Celebi
  'neo4-106': {
    'Healing Water': {
      choices(s): ChoiceSpec[] {
        const options = (targetsIn(null, s.ownBench) as number[]).filter((i) => s.ownBench[i]!.damage >= 10);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to heal' }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        const p = slot === undefined ? null : ctx.me.bench[slot];
        if (!p) return ctx.log('Healing Water did nothing.');
        healUpTo(ctx, ctx.me, p, 10 * energyCards(ctx.attacker).length);
      },
    },
    'Miracle Leaf': {
      choices: (): ChoiceSpec[] => [{ kind: 'condition', options: ['asleep', 'confused', 'poisoned'], prompt: 'Choose what the Defending Pokémon becomes (with 1 or more heads)' }],
      run(ctx) {
        ctx.hit(10);
        if (ctx.opp.active && ctx.flips(energyPool(ctx.opp.active, ctx.state.cards).length) && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Shining Charizard
  'neo4-107': {
    'White-Hot Flame': {
      text: 'Discard 1 Fire Energy card and 1 Lightning Energy card attached to Shining Charizard or this attack does nothing. Flip a coin. If tails, Shining Charizard does 30 damage to itself.',
      run(ctx) {
        const fire = cardsOf(ctx, 'fire')[0];
        const lightning = cardsOf(ctx, 'lightning').find((e) => e !== fire);
        if (!fire || !lightning) return ctx.log('White-Hot Flame did nothing.');
        discardFromAttacker(ctx, [fire, lightning]);
        ctx.hit(100);
        if (!ctx.flip()) ctx.selfDamage(30);
      },
    },
  },
  // Shining Kabutops
  'neo4-108': {
    'Lightning Cut': {
      run(ctx) {
        if (ctx.flip()) {
          ctx.hit(40);
          ctx.benchDamage(ctx.opp, 10);
        } else {
          ctx.hit(30);
          ctx.selfDamage(10);
        }
      },
    },
    'Water Slash': { run: (ctx) => void ctx.hit(50 + 10 * spareEnergy(ctx, 4), { resistance: false }) },
  },
  // Shining Mewtwo
  'neo4-109': {
    'Reflect Shield': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).reflectShield = ctx.turn + 1;
        ctx.log(`If an attack damages ${ctx.attackerDef.name} next turn, a heads prevents it and does 20 damage to the attacker.`);
      },
    },
    Psyburst: {
      text: 'Discard a Fire Energy card attached to Shining Mewtwo or this attack does nothing. This attack does 40 damage plus 10 damage for each Energy attached to the Defending Pokémon.',
      discard: { count: 1, type: 'fire' },
      run: (ctx) => void ctx.hit(40 + 10 * energyPool(ctx.defender, ctx.state.cards).length),
    },
  },
  // Shining Noctowl
  'neo4-110': {
    'Flashing Eyes': {
      run(ctx) {
        ctx.hit(30);
        const heads = ctx.flips(3);
        if (heads) ctx.inflict((['asleep', 'confused', 'paralyzed'] as const)[heads - 1]!);
      },
    },
  },
  // Shining Raichu
  'neo4-111': {
    Thundersquall: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to damage"),
      run(ctx) {
        ctx.hit(40);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined) ctx.damageBenched(ctx.opp, slot, 10 * energyPool(ctx.attacker, ctx.state.cards).length);
      },
    },
  },
  // Shining Steelix: can't attack next turn either way.
  'neo4-112': {
    'Crushing Earth': {
      run(ctx) {
        if (ctx.flip()) {
          ctx.hit(80);
          ctx.benchDamage(ctx.opp, 10);
          ctx.benchDamage(ctx.me, 10);
        } else ctx.log('Crushing Earth did nothing.');
        (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
      },
    },
  },
  // Shining Tyranitar
  'neo4-113': {
    'Mountain Crush': {
      run(ctx) {
        ctx.hit(30);
        discardTop(ctx, ctx.opp, headsUntilTails(ctx));
      },
    },
    'Destructive Fire': {
      run(ctx) {
        const fire = cardsOf(ctx, 'fire');
        const heads = ctx.flips(fire.length);
        discardFromAttacker(ctx, fire.slice(0, heads));
        ctx.hit(50);
        discardFromDefender(ctx, heads, 'Destructive Fire');
      },
    },
  },
};
