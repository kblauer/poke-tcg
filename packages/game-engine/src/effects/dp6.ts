// Legends Awakened (dp6) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play,
// and the two Technical Machines' (TCGdex has no attacks for them; from the printed cards: TS-1's Evoluter, TS-2's Devoluter).
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded are picked when the cards that
// fit differ (the same-card rule, agreed); Dragon
// Pump's 2 cards are picked after the damage; Aqua Pump discards the first Water Energy cards in the hand; Gliscor, Starmie
// and Uxie go back only with a Benched Pokémon to take their place; Cradily heals on a Knock Out by itself; Tentacle Strike's
// first card goes to the first Pokémon picked, its second to the second; Energy Dissolve's Energy card is picked by the
// attacking player between turns when they differ (agreed: removeEach, betweenTurns);
// Gut Kick's Benched Pokémon is the opponent's; Doom Desire and Energy Dissolve need the Pokémon still Active then (as Dark
// Slumber); Mach Descent counts Swellow as Benched this turn when it wasn't the Active Pokémon as the turn began.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch } from '../cards.js';
import { counts, energyPool, type InPlayPokemon, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { baseUid, devolvable, evolvedFromName, inPlayDef, pokemonName, removeTopEvolution } from '../status.js';
import { BASE1 } from './base1.js';
import { benchedSlots, damageOpponent, energyCards, inPlay, opponentBenchChoice, opponentSwitches, opponentTargets, same } from './common.js';
import { discardOwnEnergy } from './dp1.js';
import { DP2 } from './dp2.js';
import { DP5 } from './dp5.js';
import { energyAmount, EX1 } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX7 } from './ex7.js';
import { trainerEffect } from './index.js';
import { JUNGLE } from './jungle.js';
import { notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

/** A yes-or-no question asked before the attack: yes first. */
const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const ownTargets = (s: { ownBench: (InPlayPokemon | null)[] }): Target[] => ['active', ...benchedSlots(s.ownBench)];
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const typed = (ctx: AttackContext, type: Parameters<typeof energyCardOf>[2]) => ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, type));
const hasEnergy = (ctx: AttackContext, p: InPlayPokemon, type: Parameters<typeof counts>[1]) => energyPool(p, ctx.state.cards).filter((e) => counts(e, type)).length;
const boosted = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
const setBoost = (ctx: AttackContext, name: string) => void ((ctx.attacker.effects ??= {}).boostedAttack = { attack: name, turn: ctx.turn + 2 });
/** Damage counters on one of the opponent's Pokémon (not attack damage), if the attack can affect it. */
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}
/** The attacker and its cards back into the hand (with a Benched Pokémon to take its place). */
function backToHand(ctx: AttackContext) {
  if (!ctx.me.bench.some(Boolean)) return;
  const p = ctx.attacker;
  ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
  ctx.me.active = null;
  ctx.log(`${ctx.attackerDef.name} and its cards went back into the hand.`);
}
/** "You may switch 1 of the Defending Pokémon with 1 of your opponent's Benched Pokémon" before the attack. */
const maySwitchIn = (s: Parameters<NonNullable<AttackEffect['choices']>>[0]): ChoiceSpec[] => {
  const options = benchedSlots(s.opponentBench);
  return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : [];
};
const switchedIn = (ctx: AttackContext) => {
  const slot = ctx.choices.benchSlot;
  if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
};
/** "Choose up to 2 basic [type] Energy cards from your hand and attach them to 1 of your Pokémon" (Drought, Drizzle). */
const rain = (type: 'water' | 'fighting', source: string): AttackEffect => ({
  choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: `Choose one of your Pokémon to attach basic ${type === 'water' ? 'Water' : 'Fighting'} Energy cards to` }],
  run(ctx) {
    const t = ctx.choices.ownTarget ?? 'active';
    if (mine(ctx, t) && ctx.me.hand.some((c) => energyCardOf(ctx.state.cards, c, type))) ctx.pend({ kind: 'attachFromHand', source, type, basic: true, count: 2, target: t });
  },
});
/** Discard 2 Energy of a type, then `then` (Major Earthquake, High Tide). */
const discardTwo = (type: 'water' | 'fighting', damage: number, then: (ctx: AttackContext) => void): AttackEffect => ({
  run(ctx) {
    discardOwnEnergy(ctx, 2, type === 'water' ? 'High Tide' : 'Major Earthquake', [type]);
    ctx.hit(damage);
    then(ctx);
  },
});
/** Tyrogue anywhere under it (Gut Strike, Gut Kick, Gut Spin). */
const tyrogue = (ctx: { state: { cards: Parameters<typeof evolvedFromName>[0] }; attacker: InPlayPokemon }) => evolvedFromName(ctx.state.cards, ctx.attacker, 'Tyrogue');

export const DP6: Record<string, Record<string, AttackEffect>> = {
  // Dragonite – Draco Meteor: a coin for each of the opponent's Pokémon, 50 to it on heads.
  'dp6-2': {
    'Draco Meteor': {
      run(ctx) {
        for (const t of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) if (ctx.flip()) damageOpponent(ctx, t, 50);
      },
    },
  },
  // Froslass – Destiny Bond: as Base Set Gastly's. Icy Breath: Asleep, a damage counter on each of the opponent's Benched Pokémon.
  'dp6-3': {
    'Destiny Bond': same(() => BASE1['base1-50']?.['Destiny Bond']),
    'Icy Breath': {
      run(ctx) {
        ctx.hit(40);
        ctx.inflict('asleep');
        for (const p of ctx.opp.bench) putCounters(ctx, p, 1);
      },
    },
  },
  // Giratina – Shadow Force: 20 to one of the opponent's Benched Pokémon; heads, nothing from attacks next turn.
  'dp6-4': {
    'Shadow Force': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
        if (ctx.flip()) ctx.protect('preventAll');
      },
    },
  },
  // Gliscor – Burning Poison: Burned or Poisoned, picked; may return Gliscor and its cards to the hand.
  'dp6-5': {
    'Burning Poison': {
      choices: (s): ChoiceSpec[] => [
        { kind: 'condition', options: ['burned', 'poisoned'], prompt: 'Burning Poison: Burned or Poisoned?' },
        ...(s.ownBench.some(Boolean) ? [may('Return Gliscor and all cards attached to it to your hand?')] : []),
      ],
      run(ctx) {
        ctx.inflict(ctx.choices.condition === 'poisoned' ? 'poisoned' : 'burned');
        if (ctx.choices.boost) backToHand(ctx);
      },
    },
  },
  // Heatran – Magma Storm: any number of basic Energy cards discarded, 20 more for each.
  'dp6-6': {
    'Magma Storm': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownEnergyUpTo', options: s.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId))), prompt: 'Magma Storm: discard any basic Energy cards (20 more damage each)' }],
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && isBasicEnergy(lookupCard(ctx.state.cards, e.defId)));
        discardOwn(ctx, gone);
        ctx.hit(40 + 20 * gone.length);
      },
    },
  },
  // Kingdra – Aqua Stream: any Water Energy cards from the discard pile shown, 10 for each, then shuffled into the deck. Dragon
  // Pump: may discard 2 cards from the hand for 20 more and 20 to one of the opponent's Benched Pokémon.
  'dp6-7': {
    'Aqua Stream': {
      choices: (s): ChoiceSpec[] => {
        const options = (s.ownDiscard ?? []).filter((c) => energyCardOf(s.cards, c, 'water'));
        return options.length && !s.discardsLocked ? [{ kind: 'ownDiscard', min: 0, max: options.length, options, prompt: 'Aqua Stream: choose Water Energy cards from your discard pile (10 damage each)' }] : [];
      },
      run(ctx) {
        const picked = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid) && energyCardOf(ctx.state.cards, c, 'water'));
        ctx.hit(10 * picked.length);
        if (!picked.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !picked.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...picked], ctx.state.rngState);
        ctx.log(`Shuffled ${picked.length} Water Energy card${picked.length === 1 ? '' : 's'} into the deck.`);
      },
    },
    'Dragon Pump': {
      choices: (s): ChoiceSpec[] => (s.ownHand && s.ownHand.length >= 2 ? [may('Dragon Pump: discard 2 cards from your hand for 20 more damage and 20 to a Benched Pokémon?'), ...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to")] : []),
      run(ctx) {
        if (!ctx.choices.boost || ctx.me.hand.length < 2) return void ctx.hit(40);
        ctx.hit(60);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
        ctx.pend({ kind: 'discardFromHand', source: 'Dragon Pump', count: 2 });
      },
    },
  },
  // Mamoswine – Charge Through: may do 40 more and 40 to a Benched Pokémon, then 40 to itself.
  'dp6-9': {
    'Charge Through': {
      choices: (s): ChoiceSpec[] => [may('Charge Through: 40 more damage and 40 to a Benched Pokémon (Mamoswine takes 40)?'), ...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 40 damage to")],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(60);
        ctx.hit(100);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 40);
        ctx.selfDamage(40);
      },
    },
  },
  // Metagross – Extra Comet Punch: base 100 next turn.
  'dp6-10': {
    'Extra Comet Punch': {
      run(ctx) {
        ctx.hit(boosted(ctx, 'Extra Comet Punch') ? 100 : 50);
        setBoost(ctx, 'Extra Comet Punch');
      },
    },
  },
  // Probopass – Metal Bomber: 20 to as many of the opponent's Benched Pokémon as it has Metal Energy.
  'dp6-13': {
    'Metal Bomber': {
      choices(s): ChoiceSpec[] {
        const n = energyPool(s.attacker, s.cards).filter((e) => counts(e, 'metal')).length;
        const options = benchedSlots(s.opponentBench);
        return n && options.length ? [{ kind: 'opponentBenchMany', count: Math.min(n, options.length), options, prompt: `Choose up to ${n} of your opponent's Benched Pokémon to do 20 damage to` }] : [];
      },
      run(ctx) {
        ctx.hit(60);
        const n = hasEnergy(ctx, ctx.attacker, 'metal');
        for (const slot of [...new Set(ctx.choices.benchSlots ?? [])].slice(0, n)) if (slot >= 0) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Spiritomb – Transfer Pain: a damage counter moved from one of the player's Pokémon to one of the opponent's.
  'dp6-16': {
    'Transfer Pain': {
      choices(s): ChoiceSpec[] {
        const from = ownTargets(s).filter((t) => ((t === 'active' ? s.attacker : s.ownBench[t])?.damage ?? 0) >= 10);
        return from.length ? [{ kind: 'ownPokemon', options: from, prompt: 'Choose one of your Pokémon to move a damage counter from' }, ...opponentTargets(s, "Choose one of your opponent's Pokémon to move it to")] : [];
      },
      run(ctx) {
        const from = ctx.choices.ownTarget === undefined ? null : mine(ctx, ctx.choices.ownTarget);
        const to = theirs(ctx, ctx.choices.oppTarget ?? 'active');
        if (!from || from.damage < 10 || !to || !ctx.canAffect(ctx.opp, to)) return ctx.log('Transfer Pain did nothing.');
        from.damage -= 10;
        to.damage += 10;
        ctx.log(`Moved a damage counter to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Yanmega – Sonic Wave: 10 to each of the opponent's Benched Pokémon too, then they switch. Pursue and Turn: 20 more against
  // 2 or more damage counters, and Yanmega is switched with a Benched Pokémon.
  'dp6-17': {
    'Sonic Wave': {
      run(ctx) {
        ctx.hit(10);
        ctx.benchDamage(ctx.opp, 10);
        opponentSwitches(ctx, 'Sonic Wave');
      },
    },
    'Pursue and Turn': {
      choices: (s): ChoiceSpec[] => (s.defender.damage >= 20 && benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Choose one of your Benched Pokémon to switch Yanmega with' }] : []),
      run(ctx) {
        const more = ctx.defender.damage >= 20;
        ctx.hit(more ? 80 : 60);
        if (more && ctx.choices.ownBenchSlot !== undefined && ctx.me.bench[ctx.choices.ownBenchSlot]) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Bellossom – Blend Pollen: 20 more for each Vileplume and Bellossom in play; heads, Burned.
  'dp6-20': {
    'Blend Pollen': {
      run(ctx) {
        const n = inPlay(ctx.me).filter((p) => ['Vileplume', 'Bellossom'].some((name) => namesMatch(inPlayDef(ctx.state.cards, p).name, name))).length;
        ctx.hit(40 + 20 * n);
        if (ctx.flip()) ctx.inflict('burned');
      },
    },
  },
  // Cradily – Drain Down: may switch in a Benched Pokémon first; a Knock Out heals Cradily.
  'dp6-21': {
    'Drain Down': {
      choices: maySwitchIn,
      run(ctx) {
        switchedIn(ctx);
        ctx.hit(30);
        if (ctx.defender.damage >= inPlayDef(ctx.state.cards, ctx.defender).hp) healUpTo(ctx, ctx.me, ctx.attacker, ctx.attacker.damage);
      },
    },
  },
  // Crawdaunt – Prop-up Pinchers: 30 more with a Technical Machine attached.
  'dp6-22': { 'Prop-up Pinchers': { run: (ctx) => void ctx.hit((ctx.attacker.attached ?? []).some((a) => trainerEffect(a.card.defId)?.technicalMachine) ? 80 : 50) } },
  // Delcatty – Energy Assist: a basic Energy card from the discard pile attached to one of the player's Benched Pokémon.
  'dp6-23': {
    'Energy Assist': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length && !s.discardsLocked ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Choose one of your Benched Pokémon to attach a basic Energy card to' }] : []),
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && ctx.me.bench[slot] && ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Assist', count: 1, target: slot });
      },
    },
  },
  // Deoxys Attack Forme – Psychic Boost: base 20 next turn.
  'dp6-24': {
    'Psychic Boost': {
      run(ctx) {
        ctx.hit(boosted(ctx, 'Psychic Boost') ? 20 : 80);
        setBoost(ctx, 'Psychic Boost');
      },
    },
  },
  // Deoxys Defense Forme – Psychic Defense: next turn, no effects of attacks and 20 less damage.
  'dp6-25': {
    'Psychic Defense': {
      run(ctx) {
        ctx.hit(40);
        const e = (ctx.attacker.effects ??= {});
        e.effectProof = ctx.turn + 1;
        e.reduceDamage = { amount: 20, until: ctx.turn + 1 };
      },
    },
  },
  // Groudon – Drought; Kyogre – Drizzle: up to 2 basic Energy cards from the hand to one Pokémon. Major Earthquake, High Tide.
  'dp6-29': { Drought: rain('fighting', 'Drought'), 'Major Earthquake': discardTwo('fighting', 100, (ctx) => ctx.benchDamage(ctx.me, 10)) },
  'dp6-32': { Drizzle: rain('water', 'Drizzle'), 'High Tide': discardTwo('water', 60, (ctx) => ctx.benchDamage(ctx.opp, 20)) },
  // Jirachi – One Desire: any card from the deck put on top after the shuffle. Doom Desire: all its Energy discarded; the
  // Defending Pokémon Knocked Out at the end of the opponent's next turn.
  'dp6-31': {
    'One Desire': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'One Desire', filter: 'any', toTop: true, optional: true })) },
    'Doom Desire': {
      run(ctx) {
        discardOwn(ctx, energyCards(ctx.attacker));
        ctx.affectDefender((e) => {
          e.delayed = { turn: ctx.turn + 1, knockOut: true };
          ctx.log(`${ctx.defenderDef.name} will be Knocked Out at the end of your opponent's next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Poliwrath – Focus Punch: nothing if it was damaged by an attack during the opponent's last turn.
  'dp6-35': {
    'Focus Punch': {
      run(ctx) {
        const hurt = ctx.attacker.effects?.attackedOn;
        if (hurt && hurt.turn === ctx.turn - 1 && hurt.damage > 0) return ctx.log('Focus Punch did nothing.');
        ctx.hit(60);
      },
    },
  },
  // Regigigas – Gigaton Punch: heads, 20 more and 20 to one of the opponent's Benched Pokémon.
  'dp6-37': {
    'Gigaton Punch': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to (if heads)"),
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(60);
        ctx.hit(80);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
      },
    },
  },
  // Registeel – Rotating Claws: as EX Team Rocket Returns'.
  'dp6-39': { 'Rotating Claws': same(() => EX7['ex7-101']?.['Rotating Claws']) },
  // Shedinja – Curse and Deceive: 3 damage counters on the Defending Pokémon; with damage counters on Shedinja, Confused.
  'dp6-40': {
    'Curse and Deceive': {
      run(ctx) {
        putCounters(ctx, ctx.defender, 3);
        if (ctx.attacker.damage) ctx.inflict('confused');
      },
    },
  },
  // Unown ! – Hidden Power: heads, 10 more; tails, 10 to itself and no Weakness or Resistance.
  'dp6-42': {
    'Hidden Power': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(20);
        ctx.hit(10, { weakness: false, resistance: false });
        ctx.selfDamage(10);
      },
    },
  },
  // Uxie – Psychic Restore: may put Uxie and its cards on the bottom of the deck.
  'dp6-43': {
    'Psychic Restore': {
      choices: (s) => (s.ownBench.some(Boolean) ? [may('Psychic Restore: put Uxie and all cards attached to it on the bottom of your deck?')] : []),
      run(ctx) {
        ctx.hit(20);
        if (!ctx.choices.boost || !ctx.me.bench.some(Boolean)) return;
        const p = ctx.attacker;
        ctx.me.deck.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
        ctx.me.active = null;
        ctx.log('Uxie and its cards went on the bottom of the deck.');
      },
    },
  },
  // Victreebel – Burning Scent: may switch in a Benched Pokémon first; Burned and Poisoned. Energy Dissolve: an Energy card of
  // the Defending Pokémon discarded at the end of the opponent's next turn.
  'dp6-44': {
    'Burning Scent': {
      choices: maySwitchIn,
      run(ctx) {
        switchedIn(ctx);
        ctx.inflict('burned');
        ctx.inflict('poisoned');
      },
    },
    'Energy Dissolve': {
      run(ctx) {
        ctx.hit(60);
        ctx.affectDefender((e) => (e.delayed = { turn: ctx.turn + 1, discardEnergy: true }));
      },
    },
  },
  // Vileplume – Disturbing Pollen: heads, no Trainer, Supporter or Stadium cards next turn.
  'dp6-45': {
    'Disturbing Pollen': {
      run(ctx) {
        ctx.hit(60);
        if (!ctx.flip()) return;
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer, Supporter or Stadium cards next turn.", ctx.opp.id);
      },
    },
  },
  // Camerupt – Eruption: each player's top card discarded, 30 more for each Energy card.
  'dp6-47': {
    Eruption: {
      run(ctx) {
        let energy = 0;
        for (const side of [ctx.me, ctx.opp]) {
          const top = side.deck.shift();
          if (!top) continue;
          side.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, side.id);
          if (lookupCard(ctx.state.cards, top.defId).kind === 'energy') energy++;
        }
        ctx.hit(30 + 30 * energy);
      },
    },
  },
  // Castform – Weather Ball: with the player's Stadium in play, 3 damage counters off it; with the opponent's, 30 more.
  'dp6-48': {
    'Weather Ball': {
      run(ctx) {
        const owner = ctx.state.stadium?.owner;
        ctx.hit(owner === ctx.opp.id ? 60 : 30);
        if (owner === ctx.me.id) healUpTo(ctx, ctx.me, ctx.attacker, 30);
      },
    },
  },
  // Exeggutor – Psychic Strategy: hands shuffled away, each player draws as many as the other had. Super Eggsplosion: any
  // Energy cards on the player's Pokémon discarded, a coin for each, 50 for each heads.
  'dp6-54': {
    'Psychic Strategy': {
      run(ctx) {
        const [mineN, theirN] = [ctx.me.hand.length, ctx.opp.hand.length];
        for (const side of [ctx.me, ctx.opp]) {
          [side.deck, ctx.state.rngState] = shuffle([...side.deck, ...side.hand], ctx.state.rngState);
          side.hand = [];
        }
        ctx.me.hand.push(...ctx.me.deck.splice(0, theirN));
        ctx.opp.hand.push(...ctx.opp.deck.splice(0, mineN));
        ctx.log(`Both hands were shuffled away: you drew ${theirN}, your opponent ${mineN}.`);
      },
    },
    'Super Eggsplosion': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownEnergyAny', options: [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p) : [])), prompt: 'Super Eggsplosion: discard any Energy cards attached to your Pokémon (a coin for each)' }],
      run(ctx) {
        let n = 0;
        for (const p of inPlay(ctx.me)) {
          const gone = p.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && !e.provides);
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          n += gone.length;
        }
        if (n) ctx.log(`Discarded ${n} Energy card${n === 1 ? '' : 's'}.`);
        ctx.hit(50 * ctx.flips(n));
      },
    },
  },
  // Grumpig – Magical Step: Confused, 6 damage counters instead of 3 when it hurts itself.
  'dp6-56': {
    'Magical Step': {
      run(ctx) {
        ctx.inflict('confused');
        if (ctx.defender.condition === 'confused') ctx.affectDefender((e) => (e.magicalStep = true));
      },
    },
  },
  // Houndoom – Burning Sensation: Burned if it already had damage counters. Bright Flame: tails, 2 Fire Energy discarded.
  'dp6-57': {
    'Burning Sensation': {
      run(ctx) {
        const hurt = ctx.defender.damage > 0;
        ctx.hit(20);
        if (hurt) ctx.inflict('burned');
      },
    },
    'Bright Flame': {
      run(ctx) {
        ctx.hit(60);
        if (!ctx.flip()) discardOwnEnergy(ctx, 2, 'Bright Flame', ['fire']);
      },
    },
  },
  // Lanturn – Energy Split: 30 to each of the opponent's Pokémon with Energy cards attached.
  'dp6-59': {
    'Energy Split': {
      run(ctx) {
        for (const t of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) if (energyCards(theirs(ctx, t)!).length) damageOpponent(ctx, t, 30);
      },
    },
  },
  // Marowak – Heavy Bone: tails, not next turn.
  'dp6-63': {
    'Heavy Bone': {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.flip()) notNextTurn(ctx, 'Heavy Bone');
      },
    },
  },
  // Mightyena – Bite On: a Defending Pokémon that isn't Evolved can't attack, retreat or use Poké-Powers next turn. Harass:
  // 10 for each of the player's Pokémon in play.
  'dp6-66': {
    'Bite On': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.defender.evolvedFrom.length) return;
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          e.noRetreat = ctx.turn + 1;
          e.noPokePowers = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack, retreat or use Poké-Powers next turn.`, ctx.opp.id);
        });
      },
    },
    Harass: { run: (ctx) => void ctx.hit(10 * inPlay(ctx.me).length) },
  },
  // Seadra – Aqua Pump: may discard up to 2 Water Energy cards from the hand, 10 more for each.
  'dp6-70': {
    'Aqua Pump': {
      choices(s): ChoiceSpec[] {
        const n = Math.min(2, (s.ownHand ?? []).filter((c) => energyCardOf(s.cards, c, 'water')).length);
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Aqua Pump: how many Water Energy cards do you discard from your hand (10 more damage each)?' }] : [];
      },
      run(ctx) {
        const gone = ctx.me.hand.filter((c) => energyCardOf(ctx.state.cards, c, 'water')).slice(0, ctx.choices.amount ?? 0);
        ctx.me.hand = ctx.me.hand.filter((c) => !gone.includes(c));
        ctx.me.discard.push(...gone);
        if (gone.length) ctx.log(`Discarded ${gone.length} Water Energy card${gone.length === 1 ? '' : 's'} from the hand.`);
        ctx.hit(30 + 10 * gone.length);
      },
    },
  },
  // Starmie – Star Boomerang: may return Starmie and its cards to the hand. Core Flash: 50 to one of the opponent's Pokémon with a Poké-Power or Poké-Body.
  'dp6-71': {
    'Star Boomerang': {
      choices: (s) => (s.ownBench.some(Boolean) ? [may('Star Boomerang: return Starmie and all cards attached to it to your hand?')] : []),
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.boost) backToHand(ctx);
      },
    },
    'Core Flash': {
      choices(s): ChoiceSpec[] {
        const options = (['active', ...benchedSlots(s.opponentBench)] as Target[]).filter((t) => inPlayDef(s.cards, (t === 'active' ? s.defender : s.opponentBench[t])!).power);
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon with a Poké-Power or Poké-Body" }] : [];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : theirs(ctx, t);
        if (!p || !inPlayDef(ctx.state.cards, p).power) return ctx.log('Core Flash did nothing.');
        damageOpponent(ctx, t!, 50);
      },
    },
  },
  // Swellow – Mach Descent: base 60 if it was on the Bench this turn.
  'dp6-73': { 'Mach Descent': { run: (ctx) => void ctx.hit(ctx.me.turnStartActive !== baseUid(ctx.attacker) ? 60 : 30) } },
  // Tauros – Herd Charge: a coin for each Tauros in play, 20 for each heads.
  'dp6-74': { 'Herd Charge': { run: (ctx) => void ctx.hit(20 * ctx.flips(inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Tauros')).length)) } },
  // Tentacruel – Tentacle Strike: up to 2 Energy cards from the opponent's discard pile attached to their Pokémon, 20 for each.
  // Dangerous Poison: with less Energy than the Defending Pokémon, Paralyzed and Poisoned.
  'dp6-75': {
    'Tentacle Strike': {
      choices(s): ChoiceSpec[] {
        const options = (s.opponentDiscard ?? []).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');
        if (!options.length || s.discardsLocked) return [];
        const targets = ['active', ...benchedSlots(s.opponentBench)] as Target[];
        return [
          { kind: 'ownDiscard', min: 0, max: Math.min(2, options.length), options, prompt: "Tentacle Strike: choose up to 2 Energy cards in your opponent's discard pile" },
          { kind: 'opponentPokemon', options: targets, prompt: "Choose the Pokémon to attach the first Energy card to" },
          { kind: 'opponentPokemonTo', options: targets, prompt: 'Choose the Pokémon to attach the second Energy card to' },
        ];
      },
      run(ctx) {
        const picked = (ctx.choices.discardUids ?? []).map((uid) => ctx.opp.discard.find((c) => c.uid === uid)).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 2);
        const targets = [ctx.choices.oppTarget ?? 'active', ctx.choices.oppTo ?? ctx.choices.oppTarget ?? 'active'] as Target[];
        const damage = new Map<Target, number>();
        picked.forEach((card, i) => {
          const t = targets[i]!;
          const p = theirs(ctx, t);
          if (!p || !ctx.canAffect(ctx.opp, p)) return;
          ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
          p.energy.push(card);
          ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
          damage.set(t, (damage.get(t) ?? 0) + 20);
        });
        for (const [t, amount] of damage) damageOpponent(ctx, t, amount);
      },
    },
    'Dangerous Poison': {
      run(ctx) {
        const less = energyAmount(ctx, ctx.attacker) < energyAmount(ctx, ctx.defender);
        ctx.hit(60);
        if (!less) return;
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Unown J – Hidden Power: the Defending Pokémon wakes up.
  'dp6-76': {
    'Hidden Power': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.defender.condition !== 'asleep') return;
        ctx.affectDefender(() => {
          ctx.defender.condition = null;
          ctx.log(`${ctx.defenderDef.name} is no longer Asleep.`, ctx.opp.id);
        });
      },
    },
  },
  // Unown R – Hidden Power: any basic Energy cards moved among the player's Pokémon.
  'dp6-77': { 'Hidden Power': { run: (ctx) => void (inPlay(ctx.me).length > 1 && ctx.pend({ kind: 'deltaSwitch', source: 'Hidden Power', exclude: '' })) } },
  // Unown U – Hidden Power: any card from the deck discarded.
  'dp6-78': { 'Hidden Power': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Hidden Power', filter: 'any', toDiscard: true, optional: true })) } },
  // Unown Y – Hidden Power: up to 2 Trainer cards from the deck, shown.
  'dp6-81': { 'Hidden Power': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Hidden Power', filter: 'trainer', count: 2, reveal: true, optional: true })) } },
  // Unown ? – Hidden Power: up to 2 cards from the hand discarded, as many drawn.
  'dp6-82': { 'Hidden Power': { run: (ctx) => void (ctx.me.hand.length && ctx.pend({ kind: 'discardDraw', source: 'Hidden Power', discarded: 0, max: 2 })) } },
  // Bellsprout – Vine Bind: heads, the Defending Pokémon can't use Poké-Powers next turn.
  'dp6-85': { 'Vine Bind': { run: (ctx) => void (ctx.flip() ? ctx.affectDefender((e) => (e.noPokePowers = ctx.turn + 1)) : ctx.log('Vine Bind did nothing.')) } },
  // Corphish – Knock Off: as EX Ruby & Sapphire's.
  'dp6-89': { 'Knock Off': same(() => EX1['ex1-64']?.['Knock Off']) },
  // Exeggcute – Call for Family: up to 2 Grass and Psychic Basic Pokémon from the deck onto the Bench.
  'dp6-93': { 'Call for Family': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicTypes', types: ['grass', 'psychic'], toBench: true, optional: true, count: 2 })) } },
  // Gloom – Space Out: 2 damage counters off, then Asleep.
  'dp6-97': {
    'Space Out': {
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 20);
        ctx.sleepSelf();
      },
    },
  },
  // Hitmonchan – Counter Punch: as Mysterious Treasures Hitmonchan's Spike Armor. Gut Strike: base 60 with Tyrogue under it.
  'dp6-99': { 'Counter Punch': same(() => DP2['dp2-61']?.['Spike Armor']), 'Gut Strike': { run: (ctx) => void ctx.hit(tyrogue(ctx) ? 60 : 30) } },
  // Hitmonlee – Gut Kick: with Tyrogue under it, may do 30 to one of the opponent's Benched Pokémon instead.
  'dp6-100': {
    'Gut Kick': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.opponentBench);
        return evolvedFromName(s.cards, s.attacker, 'Tyrogue') && options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to do the 30 damage to instead" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (tyrogue(ctx) && slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) return ctx.damageBenched(ctx.opp, slot, 30);
        ctx.hit(30);
      },
    },
  },
  // Hitmontop – Gut Spin: with Tyrogue under it, may switch with a Benched Pokémon.
  'dp6-101': {
    'Gut Spin': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench);
        return evolvedFromName(s.cards, s.attacker, 'Tyrogue') && options.length ? [{ kind: 'ownBench', options: [-1, ...options], optional: true, prompt: 'You may choose one of your Benched Pokémon to switch Hitmontop with' }] : [];
      },
      run(ctx) {
        ctx.hit(50);
        const slot = ctx.choices.ownBenchSlot;
        if (tyrogue(ctx) && slot !== undefined && slot >= 0 && ctx.me.bench[slot]) ctx.switchOwn(slot);
      },
    },
  },
  // Meowth – Pay Day: as Jungle's.
  'dp6-106': { 'Pay Day': same(() => JUNGLE['base2-56']?.['Pay Day']) },
  // Misdreavus – Payback: 20 more while the opponent has 1 Prize card left.
  'dp6-107': { Payback: { run: (ctx) => void ctx.hit(ctx.opp.prizes.length === 1 ? 30 : 10) } },
  // Nosepass – Nose Poke: 20 more with Probopass on the Bench.
  'dp6-109': { 'Nose Poke': { run: (ctx) => void ctx.hit(ctx.me.bench.some((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Probopass')) ? 40 : 20) } },
  // Pineco – Selfdestruct: 10 to each Benched Pokémon, both players', and 50 to itself.
  'dp6-113': {
    Selfdestruct: {
      run(ctx) {
        ctx.hit(40);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
        ctx.selfDamage(50);
      },
    },
  },
  // Sneasel – Rob: the opponent's hand shown; its Pokémon Tools and Technical Machines shuffled into their deck.
  'dp6-120': {
    Rob: {
      run(ctx) {
        const hand = ctx.opp.hand;
        ctx.log(`Your opponent's hand: ${hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
        const gone = hand.filter((c) => trainerEffect(c.defId)?.tool || trainerEffect(c.defId)?.technicalMachine);
        if (!gone.length) return;
        ctx.opp.hand = hand.filter((c) => !gone.includes(c));
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, ...gone], ctx.state.rngState);
        ctx.log(`Shuffled ${gone.length} card${gone.length === 1 ? '' : 's'} into the deck.`, ctx.opp.id);
      },
    },
  },
  // Staryu – Recover: an Energy card discarded, 3 damage counters off.
  'dp6-122': { Recover: { discard: { count: 1 }, run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 30) } },
  // Swinub – Sniff Out: as Majestic Dawn Drifloon's Delivery.
  'dp6-123': { 'Sniff Out': same(() => DP5['dp5-61']?.Delivery) },
  // Taillow – Focus Energy: Peck's base damage is 30 next turn.
  'dp6-124': {
    'Focus Energy': { run: (ctx) => setBoost(ctx, 'Peck') },
    Peck: { run: (ctx) => void ctx.hit(boosted(ctx, 'Peck') ? 30 : (ctx.attackerDef.attacks.find((a) => a.name === 'Peck')?.damage ?? 10)) },
  },
  // Tyrogue – Gut Blow: against an Evolved Pokémon, 20 more and 10 to itself.
  'dp6-126': {
    'Gut Blow': {
      run(ctx) {
        if (!ctx.defender.evolvedFrom.length) return void ctx.hit(10);
        ctx.hit(30);
        ctx.selfDamage(10);
      },
    },
  },
  // Technical Machine TS-1 – Evoluter: a card from the deck that evolves from one of the player's Pokémon put onto it.
  'dp6-136': {
    Evoluter: {
      run(ctx) {
        const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
        if (ctx.me.deck.length) ctx.pend({ kind: 'evolveMany', source: 'Evoluter', names, done: [], once: true, limits: true });
      },
    },
  },
  // Technical Machine TS-2 – Devoluter: the highest Stage Evolution card of one of the opponent's Evolved Pokémon (not a Pokémon LV.X) back into their hand.
  'dp6-137': {
    Devoluter: {
      choices(s): ChoiceSpec[] {
        const options = (['active', ...benchedSlots(s.opponentBench)] as Target[]).filter((t) => {
          const p = (t === 'active' ? s.defender : s.opponentBench[t])!;
          return devolvable(s.cards, p) && inPlayDef(s.cards, p).stage !== 'levelUp';
        });
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Evolved Pokémon (not a Pokémon LV.X)" }] : [];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : theirs(ctx, t);
        if (!p || !devolvable(ctx.state.cards, p) || inPlayDef(ctx.state.cards, p).stage === 'levelUp' || !ctx.canAffect(ctx.opp, p)) return ctx.log('Devoluter did nothing.');
        const top = removeTopEvolution(ctx.state, ctx.opp, p);
        ctx.opp.hand.push(top);
        ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} went back into the hand.`, ctx.opp.id);
      },
    },
  },
  // Azelf LV.X – Deep Balance: a damage counter on one of the opponent's Pokémon for each Energy on all of their Pokémon.
  'dp6-140': {
    'Deep Balance': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to put damage counters on"),
      run: (ctx) => putCounters(ctx, theirs(ctx, ctx.choices.oppTarget ?? 'active'), inPlay(ctx.opp).reduce((n, p) => n + energyAmount(ctx, p), 0)),
    },
  },
  // Magnezone LV.X – Cyber Shock: a Lightning and a Metal Energy discarded; Paralyzed.
  'dp6-142': {
    'Cyber Shock': {
      run(ctx) {
        discardOwnEnergy(ctx, 1, 'Cyber Shock', ['lightning']);
        discardOwnEnergy(ctx, 1, 'Cyber Shock', ['metal']);
        ctx.hit(80);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Mesprit LV.X – Supreme Blast: nothing without Uxie LV.X and Azelf LV.X in play; all its Energy discarded.
  'dp6-143': {
    'Supreme Blast': {
      run(ctx) {
        const lvx = (name: string) => inPlay(ctx.me).some((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, name) && inPlayDef(ctx.state.cards, p).stage === 'levelUp');
        if (!lvx('Uxie') || !lvx('Azelf')) return ctx.log('Supreme Blast did nothing.');
        ctx.hit(200);
        discardOwn(ctx, energyCards(ctx.attacker));
      },
    },
  },
  // Rhyperior LV.X – Hard Crush: the top 5 cards discarded, 50 for each Energy card. Upthrow: every Fighting Energy card in the discard pile shuffled into the deck.
  'dp6-145': {
    'Hard Crush': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 5);
        ctx.me.discard.push(...top);
        ctx.log(`Discarded the top ${top.length} cards of the deck.`);
        ctx.hit(50 * top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length);
      },
    },
    Upthrow: {
      run(ctx) {
        ctx.hit(60);
        const fighting = ctx.me.discard.filter((c) => energyCardOf(ctx.state.cards, c, 'fighting'));
        if (!fighting.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !fighting.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...fighting], ctx.state.rngState);
        ctx.log(`Shuffled ${fighting.length} Fighting Energy card${fighting.length === 1 ? '' : 's'} into the deck.`);
      },
    },
  },
};
