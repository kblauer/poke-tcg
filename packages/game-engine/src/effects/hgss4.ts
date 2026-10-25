// Triumphant (hgss4) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Toxic Fang's Poison is 2 damage counters between turns; Color Tag's type is picked before the attack; Astonish's
// cards are picked at random (without looking); Tail Spank does nothing with fewer than 2 cards in the hand, its 2 picked once
// the attack is over; Vicious Claw's Pokémon is picked once the attack is over; Lost Crush's Pokémon is picked before the attack, its Energy card once it's over when they differ;
// Legend Ceremony's Pokémon LEGEND is picked when two or more have both halves in the deck (agreed); Thunder Shot does its 50 to the Active
// Pokémon with Weakness and Resistance; Top Burner counts the Fire Energy Magmortar provides; Tentavolve checks that Tentacruel
// evolved from Tentacool this turn; Messenger's search comes first, then Pidgey is shuffled away; Tripping Headbutt's two
// Pokémon (the opponent's for heads, the player's for tails) are picked before the attack, the player's Active Pokémon taking
// the 30 with its Weakness and Resistance (agreed 2026-10-25); Hurl into Darkness looks at the hand even with nothing to take; Lost Crisis's Knocked Out Pokémon go
// to the Lost Zone with their cards; Moon's Invite's damage counters are moved one at a time once the attack is over.
import { applyWeaknessResistance, type AttackContext, type AttackEffect, type ChoiceSpec } from '../attacks.js';
import { hasType, isPokemonCard, lookupCard, namesMatch, typesOf, type EnergyType } from '../cards.js';
import { legendNames, takeLegend } from '../trainers.js';
import { counts, energyPool, type CardInstance, type Target } from '../engine.js';
import { nextRandom, shuffle } from '../rng.js';
import { inPlayDef } from '../status.js';
import { benchedSlots, damageChosen, energyCards, inPlay, opponentBenchChoice, opponentTargets, same } from './common.js';
import { DP1, discardOwnEnergy, removeDefenderEnergy, shuffleIntoDeck } from './dp1.js';
import { DP2 } from './dp2.js';
import { discardOwn, energyCardOf, EX2, putCounters } from './ex2.js';
import { EX3 } from './ex3.js';
import { EX7 } from './ex7.js';
import { EX10 } from './ex10.js';
import { EX16 } from './ex16.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
const name = (ctx: AttackContext, c: CardInstance) => lookupCard(ctx.state.cards, c.defId).name;
const boosted = (ctx: AttackContext, attack: string) => ctx.attacker.effects?.boostedAttack?.attack === attack && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
const TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless'];

/** Damage to the player's own Active Pokémon (the attacker) with its own Weakness and Resistance (agreed 2026-10-25: Tripping Headbutt, Destructive Tsunami). */
export const ownActiveDamage = (ctx: AttackContext, amount: number) => applyWeaknessResistance(amount, typesOf(ctx.attackerDef), ctx.attackerDef, ctx.attacker.effects);

/** `n` cards from the opponent's hand at random, shuffled into their deck (Astonish). */
function astonish(ctx: AttackContext, n: number) {
  const picked: CardInstance[] = [];
  for (let i = 0; i < n && ctx.opp.hand.length; i++) {
    const [r, next] = nextRandom(ctx.state.rngState);
    ctx.state.rngState = next;
    picked.push(...ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1));
  }
  if (!picked.length) return;
  ctx.log(`Astonish chose ${picked.map((c) => name(ctx, c)).join(', ')}.`);
  [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, ...picked], ctx.state.rngState);
  ctx.log(`Shuffled ${picked.length} card${picked.length === 1 ? '' : 's'} from the hand into the deck.`, ctx.opp.id);
}

/** Lost Crisis: 2 Energy cards on it to the Lost Zone; the opponent's Pokémon its damage Knocks Out go to the Lost Zone. */
const lostCrisis: AttackEffect = {
  choices(s): ChoiceSpec[] {
    const energy = energyCards(s.attacker);
    return energy.length > 2 ? [{ kind: 'ownEnergy', count: 2, options: energy, prompt: 'Lost Crisis: choose 2 Energy cards to put in the Lost Zone' }] : [];
  },
  run(ctx) {
    const energy = energyCards(ctx.attacker);
    const gone = energy.length > 2 ? energy.filter((e) => ctx.choices.energyUids?.includes(e.uid)).slice(0, 2) : energy;
    ctx.attacker.energy = ctx.attacker.energy.filter((e) => !gone.includes(e));
    (ctx.me.lostZone ??= []).push(...gone.map(({ converted: _c, windless: _w, ...c }) => c));
    if (gone.length) ctx.log(`Put ${gone.map((e) => name(ctx, e)).join(', ')} in the Lost Zone.`);
    ctx.hit(100);
    for (const p of inPlay(ctx.opp)) if (p.damage >= inPlayDef(ctx.state.cards, p).hp) p.lostZone = ctx.turn;
  },
};
/** Moon's Invite: any number of damage counters moved among the opponent's Pokémon. */
const moonsInvite: AttackEffect = {
  run(ctx) {
    if (inPlay(ctx.opp).length > 1 && inPlay(ctx.opp).some((p) => p.damage > 0)) ctx.pend({ kind: 'moveCounters', source: "Moon's Invite", fromSide: 'opp' });
  },
};
/** Sudden Delete: one of the opponent's Benched Pokémon and its cards back into their hand. */
const suddenDelete: AttackEffect = {
  choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to return to their hand"),
  run(ctx) {
    const slot = ctx.choices.benchSlot;
    const p = slot === undefined ? null : ctx.opp.bench[slot];
    if (!p || !ctx.canAffect(ctx.opp, p)) return;
    ctx.opp.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
    ctx.opp.bench[slot!] = null;
    ctx.log(`${inPlayDef(ctx.state.cards, p).name} and all cards attached to it went back into the hand.`, ctx.opp.id);
  },
};
/** Time Control: every Metal Energy card on it discarded; the opponent's top 2 cards added to their Prize cards. */
const timeControl: AttackEffect = {
  run(ctx) {
    discardOwn(ctx, energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, 'metal')));
    const top = ctx.opp.deck.splice(0, 2);
    ctx.opp.prizes.push(...top);
    if (top.length) ctx.log(`The top ${top.length} card${top.length === 1 ? '' : 's'} of the deck went to the Prize cards.`, ctx.opp.id);
  },
};

export const HGSS4: Record<string, Record<string, AttackEffect>> = {
  // Altaria – Stadium Power: 30 more with a Stadium in play.
  'hgss4-2': { 'Stadium Power': { run: (ctx) => void ctx.hit(ctx.state.stadium ? 70 : 40) } },
  // Drapion – Toxic Fang: heads, Poisoned, 2 damage counters between turns.
  'hgss4-4': {
    'Toxic Fang': {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.flip()) return;
        ctx.inflict('poisoned');
        if (ctx.defender.poison) ctx.defender.poison = 20;
      },
    },
  },
  // Porygon-Z – Suspicious Beam β: with no Rainbow Energy attached, 20 to itself and Confused.
  'hgss4-7': {
    'Suspicious Beam β': {
      run(ctx) {
        ctx.hit(80);
        if (ctx.attacker.energy.some((e) => !e.provides && !e.windless && name(ctx, e) === 'Rainbow Energy')) return;
        ctx.selfDamage(20);
        ctx.confuseSelf();
      },
    },
  },
  // Spiritomb – Color Tag: a damage counter on each of the opponent's Pokémon of the type chosen.
  'hgss4-10': {
    'Color Tag': {
      choices: () => [{ kind: 'type', options: TYPES, prompt: "Color Tag: choose a type (a damage counter on each of your opponent's Pokémon of that type)" }],
      run(ctx) {
        const type = ctx.choices.type;
        if (!type) return;
        for (const p of inPlay(ctx.opp)) if (hasType(inPlayDef(ctx.state.cards, p), type)) putCounters(ctx, ctx.opp, p, 1);
      },
    },
  },
  // Victreebel – Acidic Drain: Burned and Poisoned, 3 damage counters off Victreebel.
  'hgss4-12': {
    'Acidic Drain': {
      run(ctx) {
        ctx.hit(30);
        ctx.inflict('burned');
        ctx.inflict('poisoned');
        ctx.heal(30);
      },
    },
  },
  // Ambipom – Astonish: 2 cards from the opponent's hand at random shuffled into their deck. Tail Spank: 2 cards discarded from the hand.
  'hgss4-13': {
    Astonish: {
      run(ctx) {
        ctx.hit(20);
        astonish(ctx, 2);
      },
    },
    'Tail Spank': {
      run(ctx) {
        if (ctx.me.hand.length < 2) return ctx.log('Tail Spank did nothing.');
        ctx.hit(60);
        ctx.pend({ kind: 'discardFromHand', source: 'Tail Spank', count: 2 });
      },
    },
  },
  // Banette – Lost Crush: heads, an Energy card on one of the opponent's Pokémon to the Lost Zone. Breakdown: as EX Sandstorm Wobbuffet's Feedback.
  'hgss4-14': {
    'Lost Crush': {
      choices(s): ChoiceSpec[] {
        const options = ['active' as Target, ...benchedSlots(s.opponentBench)].filter((t) => {
          const p = t === 'active' ? s.defender : s.opponentBench[t];
          return !!p && energyCards(p).length > 0;
        });
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Lost Crush: choose one of your opponent's Pokémon (on heads, one of its Energy cards goes to the Lost Zone)" }] : [];
      },
      run(ctx) {
        const target = ctx.choices.oppTarget;
        if (target === undefined || !ctx.flip()) return;
        removeDefenderEnergy(ctx, 1, 'Lost Crush', { toLostZone: true, target });
      },
    },
    Breakdown: same(() => EX2['ex2-96']?.['Feedback']),
  },
  // Bronzong – Legend Ceremony: both halves of a Pokémon LEGEND from the deck into the hand, shown.
  'hgss4-15': {
    'Legend Ceremony': {
      run(ctx) {
        const names = legendNames(ctx.state.cards, ctx.me.deck);
        if (names.length > 1) ctx.pend({ kind: 'legendPick', source: 'Legend Ceremony', names });
        else takeLegend(ctx.state, ctx.me, names[0] ?? '', 'Legend Ceremony');
      },
    },
  },
  // Dragonite – Dragon Stamp: 2 coins; both tails, nothing; both heads, Paralyzed.
  'hgss4-18': {
    'Dragon Stamp': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Dragon Stamp did nothing.');
        ctx.hit(80);
        if (heads === 2) ctx.inflict('paralyzed');
      },
    },
  },
  // Electivire – Thunder Shot: 50 to each of the opponent's Pokémon with any Energy cards attached.
  'hgss4-20': {
    'Thunder Shot': {
      run(ctx) {
        if (energyCards(ctx.defender).length) ctx.hit(50);
        for (const slot of benchedSlots(ctx.opp.bench)) if (energyCards(ctx.opp.bench[slot]!).length) ctx.damageBenched(ctx.opp, slot, 50);
      },
    },
  },
  // Elekid – Sparking Ball: 20 to one of the opponent's Pokémon, no Weakness or Resistance; Elekid is now Asleep.
  'hgss4-21': {
    'Sparking Ball': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to"),
      run(ctx) {
        const target = ctx.choices.oppTarget ?? 'active';
        if (target === 'active') ctx.hit(20, { weakness: false, resistance: false });
        else ctx.damageBenched(ctx.opp, target, 20);
        ctx.sleepSelf();
      },
    },
  },
  // Grumpig – Psychic Lock: no Poké-Powers for the opponent next turn. Bench Manipulation: as EX Power Keepers Banette's.
  'hgss4-23': {
    'Psychic Lock': {
      run(ctx) {
        ctx.hit(20);
        ctx.opp.powerTurns = { ...ctx.opp.powerTurns, 'Psychic Lock': ctx.turn + 1 };
        ctx.log("Your opponent can't use Poké-Powers next turn.", ctx.opp.id);
      },
    },
    'Bench Manipulation': same(() => EX16['ex16-4']?.['Bench Manipulation']),
  },
  // Kricketune – Fury Cutter: 3 coins; 20, 40 or 100 more for 1, 2 or 3 heads.
  'hgss4-24': { 'Fury Cutter': { run: (ctx) => void ctx.hit(20 + [0, 20, 40, 100][ctx.flips(3)]!) } },
  // Lunatone – Selfdestruct: 10 to each Benched Pokémon, both players', and 60 to itself.
  'hgss4-25': {
    Selfdestruct: {
      run(ctx) {
        ctx.hit(60);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
        ctx.selfDamage(60);
      },
    },
  },
  // Magmortar – Top Burner: the opponent's top card discarded for each Fire Energy on it; tails, every Fire Energy card on it discarded.
  'hgss4-27': {
    'Top Burner': {
      run(ctx) {
        const fire = energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'fire')).length;
        const top = ctx.opp.deck.splice(0, fire);
        ctx.opp.discard.push(...top);
        if (top.length) ctx.log(`Discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck.`, ctx.opp.id);
        if (!ctx.flip()) discardOwn(ctx, energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, 'fire')));
      },
    },
  },
  // Pidgeot – Headwind: the Defending Pokémon's attacks cost 2 Colorless more next turn.
  'hgss4-29': {
    Headwind: {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => (e.headwind = ctx.turn + 1));
      },
    },
  },
  // Sharpedo – Strip Bare: 2 heads, the opponent discards their hand.
  'hgss4-30': {
    'Strip Bare': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flips(2) < 2 || !ctx.opp.hand.length) return;
        ctx.opp.discard.push(...ctx.opp.hand);
        ctx.opp.hand = [];
        ctx.log('Discarded the whole hand.', ctx.opp.id);
      },
    },
  },
  // Wailord – Underwater Dive: 2 coins, 3 damage counters off it for each heads. Swallow Up: 50 more against less HP left than Wailord's.
  'hgss4-31': {
    'Underwater Dive': { run: (ctx) => ctx.heal(30 * ctx.flips(2)) },
    'Swallow Up': { run: (ctx) => void ctx.hit(ctx.defenderDef.hp - ctx.defender.damage < ctx.attackerDef.hp - ctx.attacker.damage ? 100 : 50) },
  },
  // Dragonair – Search and Invite: up to 2 Pokémon from the deck, shown.
  'hgss4-32': { 'Search and Invite': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Search and Invite', filter: 'pokemon', reveal: true, optional: true, count: 2 })) } },
  // Electrode – Lightning Strike: may discard every Lightning Energy card on it for 60 more.
  'hgss4-34': {
    'Lightning Strike': {
      choices: (s) => (s.attacker.energy.some((e) => !e.provides && energyCardOf(s.cards, e, 'lightning')) ? [may('Lightning Strike: discard all Lightning Energy for 60 more damage?')] : []),
      run(ctx) {
        const gone = ctx.choices.boost ? energyCards(ctx.attacker).filter((e) => energyCardOf(ctx.state.cards, e, 'lightning')) : [];
        discardOwn(ctx, gone);
        ctx.hit(gone.length ? 100 : 40);
      },
    },
  },
  // Haunter – Sneaky Placement: 2 damage counters on one of the opponent's Pokémon.
  'hgss4-35': {
    'Sneaky Placement': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to put 2 damage counters on"),
      run(ctx) {
        const p = theirs(ctx, ctx.choices.oppTarget ?? 'active');
        if (p) putCounters(ctx, ctx.opp, p, 2);
      },
    },
  },
  // Lickilicky – Licking Shot: 10 to one of the opponent's Pokémon for each Energy on Lickilicky.
  'hgss4-38': {
    'Licking Shot': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon (10 damage for each Energy on Lickilicky)"),
      run: (ctx) => damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 10 * energyPool(ctx.attacker, ctx.state.cards).length),
    },
  },
  // Luvdisc – Rendezvous Draw: each player draws their top card, shown. Distorted Wave: as Mysterious Treasures Teddiursa's Sweet Palm.
  'hgss4-39': {
    'Rendezvous Draw': {
      run(ctx) {
        for (const player of [ctx.me, ctx.opp]) {
          const [top] = player.deck.splice(0, 1);
          if (!top) continue;
          player.hand.push(top);
          ctx.log(`Drew ${name(ctx, top)}.`, player.id);
        }
      },
    },
    'Distorted Wave': same(() => DP2['dp2-105']?.['Sweet Palm']),
  },
  // Machoke – Knuckle Down: nothing on the Defending Pokémon but Weakness and Resistance changes the damage.
  'hgss4-40': { 'Knuckle Down': { run: (ctx) => void ctx.hit(30, { swift: true, keepWeakness: true, keepResistance: true }) } },
  // Magby – Play with Fire: Burned; Magby is now Asleep.
  'hgss4-41': {
    'Play with Fire': {
      run(ctx) {
        ctx.inflict('burned');
        ctx.sleepSelf();
      },
    },
  },
  // Magmar – Eruption: each player's top card discarded, 20 for each Energy card.
  'hgss4-42': {
    Eruption: {
      run(ctx) {
        let energy = 0;
        for (const player of [ctx.me, ctx.opp]) {
          const [top] = player.deck.splice(0, 1);
          if (!top) continue;
          player.discard.push(top);
          if (lookupCard(ctx.state.cards, top.defId).kind === 'energy') energy++;
          ctx.log(`Discarded ${name(ctx, top)} from the top of the deck.`, player.id);
        }
        ctx.hit(20 * energy);
      },
    },
  },
  // Pidgeotto – Twister: 2 coins, both tails nothing; an Energy card of the Defending Pokémon discarded for each heads.
  'hgss4-47': {
    Twister: {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Twister did nothing.');
        ctx.hit(30);
        removeDefenderEnergy(ctx, heads, 'Twister');
      },
    },
  },
  // Piloswine – Blizzard: heads, 10 to each of the opponent's Benched Pokémon; tails, to each of the player's.
  'hgss4-48': {
    Blizzard: {
      run(ctx) {
        ctx.hit(40);
        if (ctx.flip()) ctx.benchDamage(ctx.opp, 10);
        else ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Tentacruel – Tentavolve: evolved from Tentacool this turn, Paralyzed and Poisoned.
  'hgss4-50': {
    Tentavolve: {
      run(ctx) {
        ctx.hit(20);
        const below = ctx.attacker.evolvedFrom[ctx.attacker.evolvedFrom.length - 1];
        if (ctx.attacker.playedTurn !== ctx.turn || !below || !namesMatch(name(ctx, below), 'Tentacool')) return;
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Weepinbell – Corrode Target: heads, the opponent's hand looked at and a card from it discarded.
  'hgss4-53': {
    'Corrode Target': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip() && ctx.opp.hand.length) ctx.pend({ kind: 'oppHandTrainer', source: 'Corrode Target', any: true, place: 'discard' });
      },
    },
  },
  // Aipom – Imitate: cards drawn until the hand is as big as the opponent's.
  'hgss4-55': { Imitate: { run: (ctx) => ctx.draw(Math.max(0, ctx.opp.hand.length - ctx.me.hand.length)) } },
  // Aron – Mountain Eater: the top card of the deck discarded, then 2 damage counters off Aron.
  'hgss4-56': {
    'Mountain Eater': {
      run(ctx) {
        const [top] = ctx.me.deck.splice(0, 1);
        if (top) {
          ctx.me.discard.push(top);
          ctx.log(`Discarded ${name(ctx, top)} from the top of the deck.`);
        }
        ctx.heal(20);
      },
    },
  },
  // Carvanha – Focus Energy: Bite's base damage is 40 next turn.
  'hgss4-59': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Bite', turn: ctx.turn + 2 };
        ctx.log("Carvanha's Bite's base damage is 40 next turn.");
      },
    },
    Bite: { run: (ctx) => void ctx.hit(boosted(ctx, 'Bite') ? 40 : 10) },
  },
  // Gastly – Sneaky Placement: as EX Dragon's Night Attack.
  'hgss4-63': { 'Sneaky Placement': same(() => EX3['ex3-43']?.['Night Attack']) },
  // Illumise – Vulcan Beat: a coin for each Volbeat the player has in play, 30 for each heads.
  'hgss4-64': { 'Vulcan Beat': { run: (ctx) => void ctx.hit(30 * ctx.flips(inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Volbeat')).length)) } },
  // Nidoran ♀ – Friend Search: as EX Team Rocket Returns Sentret's.
  'hgss4-69': { 'Friend Search': same(() => EX7['ex7-75']?.['Friend Search']) },
  // Nidoran ♂ – Pheromone Poison: with Nidoran ♀ on the Bench, Poisoned.
  'hgss4-70': {
    'Pheromone Poison': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.me.bench.some((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Nidoran ♀'))) ctx.inflict('poisoned');
      },
    },
  },
  // Pidgey – Messenger: a Pokémon from the deck, shown; then Pidgey and its cards shuffled into the deck.
  'hgss4-71': {
    Messenger: {
      run(ctx) {
        const pokemon = ctx.me.deck.filter((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
        // The search first (picked now: Pidgey isn't in the deck yet), then Pidgey shuffled away.
        if (pokemon.length) ctx.pend({ kind: 'pickFromDeck', source: 'Messenger', filter: 'pokemon', reveal: true, optional: true, thenShuffleActive: true });
        else {
          ctx.log('Messenger found no Pokémon.');
          ctx.after(() => ctx.me.active === ctx.attacker && shuffleIntoDeck(ctx, ctx.me, ctx.attacker));
        }
      },
    },
  },
  // Porygon – Recover: an Energy card on it discarded, 4 damage counters off it.
  'hgss4-73': {
    Recover: {
      run(ctx) {
        discardOwnEnergy(ctx, 1, 'Recover');
        ctx.heal(40);
      },
    },
  },
  // Psyduck – Tripping Headbutt: heads, 30 to one of the opponent's Pokémon; tails, 30 to one of the player's.
  'hgss4-74': {
    'Tripping Headbutt': {
      choices: (s): ChoiceSpec[] => [
        ...opponentTargets(s, "Choose one of your opponent's Pokémon to do 30 damage to (on heads)"),
        { kind: 'ownPokemon', options: ['active', ...benchedSlots(s.ownBench)], prompt: 'Choose one of your Pokémon to take 30 damage (on tails)' },
      ],
      run(ctx) {
        if (ctx.flip()) return damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 30);
        const own = ctx.choices.ownTarget ?? 'active';
        if (own === 'active') ctx.selfDamage(ownActiveDamage(ctx, 30));
        else if (mine(ctx, own)) ctx.damageBenched(ctx.me, own, 30);
      },
    },
  },
  // Shuppet – Disable: as Diamond & Pearl Spoink's. Haunt: as EX Sandstorm's.
  'hgss4-75': { Disable: same(() => DP1['dp1-80']?.Disable), Haunt: same(() => EX2['ex2-62']?.Haunt) },
  // Spoink – Sleep Pearl: Asleep, then Spoink switched with a Benched Pokémon.
  'hgss4-77': {
    'Sleep Pearl': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Sleep Pearl: choose one of your Benched Pokémon to switch Spoink with' }] : []),
      run(ctx) {
        ctx.inflict('asleep');
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined) ctx.after(() => ctx.me.active === ctx.attacker && ctx.me.bench[slot] && ctx.switchOwn(slot));
      },
    },
  },
  // Volbeat – Illumisile: with Illumise in play, 30 to one of the opponent's Benched Pokémon.
  'hgss4-82': {
    Illumisile: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 30 damage to"),
      run(ctx) {
        const illumise = inPlay(ctx.me).some((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Illumise'));
        if (!illumise || ctx.choices.benchSlot === undefined) return ctx.log('Illumisile did nothing.');
        ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 30);
      },
    },
  },
  // Absol – Vicious Claw: a Pokémon from the hand to the Lost Zone, or nothing.
  'hgss4-91': {
    'Vicious Claw': {
      run(ctx) {
        if (!ctx.me.hand.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)))) return ctx.log('Vicious Claw did nothing.');
        ctx.hit(70);
        ctx.pend({ kind: 'discardFromHand', source: 'Vicious Claw', count: 1, only: 'pokemon', toLostZone: true });
      },
    },
  },
  // Celebi – Time Circle: no damage from the opponent's Stage 1 or Stage 2 Pokémon next turn.
  'hgss4-92': {
    'Time Circle': {
      run(ctx) {
        ctx.hit(30);
        (ctx.attacker.effects ??= {}).timeCircle = ctx.turn + 1;
      },
    },
  },
  // Gengar – Hurl into Darkness: up to as many Pokémon from the opponent's hand as Psychic Energy on Gengar to the Lost Zone. Cursed Drop: as EX Unseen Forces' Pure Power.
  'hgss4-94': {
    'Hurl into Darkness': {
      run(ctx) {
        const n = energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'psychic')).length;
        const pokemon = ctx.opp.hand.some((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
        if (n && pokemon) ctx.pend({ kind: 'oppHandTrainer', source: 'Hurl into Darkness', filter: 'pokemon', count: n, place: 'lostZone' });
        else ctx.pend({ kind: 'lookOppHand', source: 'Hurl into Darkness' });
      },
    },
    'Cursed Drop': same(() => EX10['ex10-28']?.['Pure Power']),
  },
  // Machamp – Crushing Punch: a Special Energy card on the Defending Pokémon discarded. Champ Buster: 10 more for each damaged Benched Pokémon.
  'hgss4-95': {
    'Crushing Punch': {
      run(ctx) {
        ctx.hit(60);
        removeDefenderEnergy(ctx, 1, 'Crushing Punch', { onlySpecial: true });
      },
    },
    'Champ Buster': { run: (ctx) => void ctx.hit(100 + 10 * ctx.me.bench.filter((p) => p && p.damage > 0).length) },
  },
  // Magnezone – Lost Burn: any Energy cards on the player's Pokémon to the Lost Zone, 50 for each.
  'hgss4-96': {
    'Lost Burn': {
      choices: (s): ChoiceSpec[] => {
        const energy = [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p) : []));
        return energy.length ? [{ kind: 'ownEnergyAny', options: energy, prompt: 'Lost Burn: choose any Energy cards on your Pokémon to put in the Lost Zone (50 damage each)' }] : [];
      },
      run(ctx) {
        let gone = 0;
        for (const p of inPlay(ctx.me)) {
          const lost = energyCards(p).filter((e) => ctx.choices.energyUids?.includes(e.uid));
          if (!lost.length) continue;
          p.energy = p.energy.filter((e) => !lost.includes(e));
          (ctx.me.lostZone ??= []).push(...lost.map(({ converted: _c, windless: _w, ...c }) => c));
          gone += lost.length;
        }
        if (gone) ctx.log(`Put ${gone} Energy card${gone === 1 ? '' : 's'} in the Lost Zone.`);
        ctx.hit(50 * gone);
      },
    },
  },
  // Mew – See Off: a Pokémon from the deck to the Lost Zone.
  'hgss4-97': { 'See Off': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'See Off', filter: 'pokemon', toLostZone: true })) } },
  // Darkrai & Cresselia LEGEND – Lost Crisis, Moon's Invite (on both halves; one prints a curly apostrophe).
  'hgss4-99': { 'Lost Crisis': lostCrisis, "Moon's Invite": moonsInvite },
  'hgss4-100': { 'Lost Crisis': lostCrisis, 'Moon’s Invite': moonsInvite },
  // Palkia & Dialga LEGEND – Sudden Delete, Time Control (on both halves).
  'hgss4-101': { 'Sudden Delete': suddenDelete, 'Time Control': timeControl },
  'hgss4-102': { 'Sudden Delete': suddenDelete, 'Time Control': timeControl },
};
