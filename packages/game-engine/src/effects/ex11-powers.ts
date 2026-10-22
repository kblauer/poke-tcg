// EX Delta Species (ex11) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Delta Moon works as Darkest Impulse does (on every Special Energy card attached from the hand, one
// Delta Moon however many Umbreon); Holon's Pokémon aren't owners.
// From the text: Final Sting Knocks Out Beedrill first, then the opponent's Active Pokémon is Paralyzed and Poisoned (2 damage
// counters between turns) unless it can't be; Delta Charge, Crush Draw and Metal Navigation's Energy cards go where the card
// says (Metal Navigation: a basic or Special Metal Energy card); Delta Control's other 3 cards go on the bottom, in the order
// they were; Prize Shift takes one of the face-down Prize cards at random; Duplicate finds another Ditto, which takes this
// one's place with everything on it, this one shuffled into the deck (one Duplicate a turn, whichever Ditto); Delta Switch,
// Prowl and the Evolutionary powers work as the card is played from the hand (onto the Bench, or evolving); Body Odor counts
// the opponent's Pokémon with a Poké-Body printed; Beacon Protection and Extra Protection work while their partner is in play
// (attacks.ts); Beldum's Conductive Body is as printed ("[C] less", as its player's Active Pokémon; TCGdex leaves both out).
import { lookupCard } from '../cards.js';
import { afflictBetweenTurns, isEnergyCardOf, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { nextRandom } from '../rng.js';
import { effectId, inPlayDef, pokemonName } from '../status.js';
import { powerEffect } from './index.js';
import { babyEvolution, POKE_BODY } from './ex2-powers.js';
import { EX5_POWERS } from './ex5-powers.js';
import { countersBetween, healBetween } from './ex6-powers.js';
import { EX10_POWERS } from './ex10-powers.js';

/** The Lightning Energy cards in the discard pile (Delta Charge). */
const lightningInDiscard = (s: PowerSituation) => s.me.discard.filter((c) => isEnergyCardOf(c, s.cards, 'lightning') && lookupCard(s.cards, c.defId).kind === 'energy');

/** The player's Pokémon with an Energy card attached (Energy Jump). */
const withEnergy = (s: PowerSituation) => ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.energy.some((e) => !e.provides));

/** Where the Pokémon is (for a choice about it). */
const targetOf = (owner: { active: unknown; bench: unknown[] }, pokemon: unknown): Target => (owner.active === pokemon ? 'active' : owner.bench.indexOf(pokemon));

/** "When you play this from your hand to evolve 1 of your Pokémon, you may …": a yes-or-no question about the power. */
const onEvolveMay = (power: 'evoFlame' | 'evoThunder' | 'evoSwirl', source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

/** Duplicate: once a turn (whichever Ditto), another Ditto from the deck takes this one's place, with everything on it. */
const duplicate: PowerEffect = {
  blocked: (s) => (s.me.powerTurns?.Duplicate === s.turn ? 'Duplicate has already been used this turn' : s.counts.deck ? null : 'Your deck is empty'),
  use(ctx) {
    (ctx.me.powerTurns ??= {}).Duplicate = ctx.state.turn;
    // The Castform switch, with its own once-a-turn marker (not Temperamental Weather's).
    ctx.pend({ kind: 'castform', source: 'Duplicate', target: ctx.sourceTarget, names: ['Ditto'], formChange: true });
  },
};

export const EX11_POWERS: Record<string, PowerEffect> = {
  // Beedrill δ – Final Sting: Beedrill is Knocked Out; the opponent's Active Pokémon is Paralyzed and Poisoned (2 damage counters).
  'ex11-1': {
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      const target = ctx.opp.active;
      ctx.source.damage = Math.max(ctx.source.damage, inPlayDef(ctx.state.cards, ctx.source).hp);
      ctx.log(`Final Sting: ${pokemonName(ctx.state, ctx.source)} is Knocked Out.`);
      if (!target) return;
      afflictBetweenTurns(ctx.state, ctx.opp.id, target, 'paralyzed');
      afflictBetweenTurns(ctx.state, ctx.opp.id, target, 'poisoned');
      if (target.poison) target.poison = 20;
    },
  },
  // Dragonite δ – Delta Charge: once a turn, a Lightning Energy card from the discard pile to one of the player's Benched Pokémon.
  'ex11-3': {
    oncePerTurn: true,
    blocked(s) {
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      if (!s.me.bench.some(Boolean)) return 'You have no Benched Pokémon';
      return lightningInDiscard(s).length ? null : 'No Lightning Energy cards in your discard pile';
    },
    choices: (s) => [
      { kind: 'discardCard', field: 'cardUid', options: lightningInDiscard(s), prompt: 'Choose a Lightning Energy card from your discard pile' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== 'active'), prompt: 'Choose one of your Benched Pokémon to attach it to' },
    ],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!card || !p) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      p.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Espeon δ – Delta Heal: once a turn (one Delta Heal a turn), a damage counter off each of the player's δ Pokémon.
  'ex11-4': {
    blocked: (s) => (s.me.powerTurns?.['Delta Heal'] === s.turn ? 'Delta Heal has already been used this turn' : null),
    use(ctx) {
      (ctx.me.powerTurns ??= {})['Delta Heal'] = ctx.state.turn;
      for (const p of [ctx.me.active, ...ctx.me.bench]) if (p && / δ$/.test(inPlayDef(ctx.state.cards, p).name)) healBetween(ctx.state, ctx.me, p, 10, 'Delta Heal');
    },
  },
  // Gardevoir δ – Energy Jump: once a turn, an Energy card from one of the player's Pokémon to another.
  'ex11-6': {
    oncePerTurn: true,
    blocked: (s) => (withEnergy(s).length && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon has an Energy card to move'),
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: withEnergy(s), prompt: 'Choose the Pokémon to move an Energy card from' },
      ...(c.from !== undefined
        ? [
            { kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: pokemonAt(s.me, c.from)?.energy.filter((e) => !e.provides) ?? [], prompt: 'Choose the Energy card to move' },
            { kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' },
          ]
        : []),
    ],
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !to || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Latias δ, Latios δ – Delta Aura: the attack's cost changes (its costNow, ex11.ts).
  'ex11-8': { ...POKE_BODY },
  'ex11-9': { ...POKE_BODY },
  // Metagross δ – Delta Control: once a turn, 1 of the top 4 cards into the hand, the other 3 on the bottom of the deck.
  'ex11-11': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Delta Control', looked: ctx.me.deck.slice(0, 4).map((c) => c.uid), take: 1, shuffleRest: true, toBottom: true }),
  },
  // Mewtwo δ – Delta Switch: put onto the Bench from the hand, basic Energy cards may move between the player's Pokémon (not to Mewtwo).
  'ex11-12': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length || !owner.bench.includes(pokemon)) return;
      const others = [owner.active, ...owner.bench].filter((p) => p && p !== pokemon);
      if (others.length) state.pendingChoice = { player: owner.id, source: 'Delta Switch', kind: 'deltaSwitch', exclude: pokemon.card.uid };
    },
  },
  // Rayquaza δ – Delta Guard: with a Holon Energy card attached, Lightning Storm's damage counters don't go on it (ex11.ts).
  'ex11-13': { ...POKE_BODY },
  // Starmie δ – Metal Navigation: once a turn, a Metal Energy card from the deck attached to it.
  'ex11-15': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Metal Navigation', filter: 'energyNamed', name: 'Metal Energy', attachTo: ctx.sourceTarget, optional: true }),
  },
  // Tyranitar δ – Crush Draw: once a turn, the top card shown; a basic Energy card is attached to one of the player's Pokémon.
  'ex11-16': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const top = ctx.me.deck[0];
      if (!top) return;
      const d = lookupCard(ctx.state.cards, top.defId);
      ctx.log(`Crush Draw: the top card is ${d.name}.`);
      if (d.kind !== 'energy' || d.basic === false) return;
      ctx.me.deck.shift();
      ctx.pend({ kind: 'attachCard', card: top, source: 'Crush Draw' });
    },
  },
  // Umbreon δ – Delta Moon (ATTACH_ENERGY).
  'ex11-17': { ...POKE_BODY, deltaMoon: true },
  // Azurill – Baby Evolution.
  'ex11-20': babyEvolution('Marill'),
  // Hypno – Binding Aura (evolveError, attachBlocked).
  'ex11-23': { ...POKE_BODY, bindingAura: true },
  // Porygon2 – Backup: once a turn, with fewer than 6 cards in the hand, cards drawn up to 6.
  'ex11-25': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length >= 6 ? 'You already have 6 or more cards in your hand' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const n = Math.min(6 - ctx.me.hand.length, ctx.me.deck.length);
      ctx.me.hand.push(...ctx.me.deck.splice(0, n));
      ctx.log(`Drew ${n} card${n === 1 ? '' : 's'}.`);
    },
  },
  // Rain, Snow-cloud and Sunny Castform, Castform – Temperamental Weather: as EX Hidden Legends'.
  'ex11-26': EX5_POWERS['ex5-23']!,
  'ex11-29': EX5_POWERS['ex5-25']!,
  'ex11-31': EX5_POWERS['ex5-26']!,
  'ex11-34': EX5_POWERS['ex5-30']!,
  // Sandslash δ – Delta Storm: as its player's Active Pokémon, a damage counter on each of the opponent's Pokémon-ex between turns.
  'ex11-27': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const p of [opp.active, ...opp.bench]) if (p && inPlayDef(state.cards, p).ex) countersBetween(state, opp, p, 1, 'Delta Storm');
    },
  },
  // Slowking – Prize Shift: once a turn, a card from the hand becomes a face-up Prize card, and a face-down one (at random) goes into the hand.
  'ex11-28': {
    oncePerTurn: true,
    blocked(s) {
      if (!s.counts.prizes || (s.counts.faceUpPrizes ?? 0) >= s.counts.prizes) return 'All of your Prize cards are face up';
      return s.me.hand.length ? null : 'Your hand is empty';
    },
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card from your hand to put face up as a Prize card' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const faceDown = ctx.me.prizes.flatMap((c, i) => (ctx.me.faceUpPrizes?.includes(c.uid) ? [] : [i]));
      if (!card || !faceDown.length) return;
      const [r, next] = nextRandom(ctx.state.rngState);
      ctx.state.rngState = next;
      const i = faceDown[Math.floor(r * faceDown.length)]!;
      const prize = ctx.me.prizes[i]!;
      ctx.me.prizes[i] = card;
      ctx.me.hand = [...ctx.me.hand.filter((c) => c !== card), prize];
      (ctx.me.faceUpPrizes ??= []).push(card.uid);
      ctx.log(`Prize Shift: ${lookupCard(ctx.state.cards, card.defId).name} is now a face-up Prize card, and a face-down Prize card went into the hand.`);
    },
  },
  // Weezing – Body Odor: as its player's Active Pokémon, a damage counter on each of the opponent's Pokémon with a Poké-Body between turns.
  'ex11-33': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const p of [opp.active, ...opp.bench]) if (p && inPlayDef(state.cards, p).power && powerEffect(effectId(p))?.body) countersBetween(state, opp, p, 1, 'Body Odor');
    },
  },
  // Ditto – Duplicate.
  'ex11-35': duplicate,
  'ex11-36': duplicate,
  'ex11-37': duplicate,
  'ex11-38': duplicate,
  'ex11-39': duplicate,
  'ex11-40': duplicate,
  'ex11-61': duplicate,
  'ex11-62': duplicate,
  'ex11-63': duplicate,
  'ex11-64': duplicate,
  // Hariyama – Reversal Aura (attacks.ts).
  'ex11-44': { ...POKE_BODY, reversalAura: 20 },
  // Illumise – Beacon Protection: with Volbeat in play, attacks by the opponent's Pokémon with Dark in their names don't affect it.
  'ex11-45': { ...POKE_BODY, guardFrom: 'dark', guardPartner: 'Volbeat' },
  // Persian – Prowl: evolving from the hand, any card from the deck into the hand.
  'ex11-50': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length && owner.deck.length) state.pendingChoice = { player: owner.id, source: 'Prowl', kind: 'pickFromDeck', filter: 'any', optional: true };
    },
  },
  // Shelgon δ – Exoskeleton: 10 less damage from attacks.
  'ex11-54': { ...POKE_BODY, damageReduction: 10 },
  // Skarmory – Shining Horn (attackError).
  'ex11-55': { ...POKE_BODY, shiningHorn: true },
  // Volbeat – Extra Protection: with Illumise in play, attacks by the opponent's Pokémon-ex don't affect it.
  'ex11-56': { ...POKE_BODY, guardFrom: 'ex', guardPartner: 'Illumise' },
  // Beldum δ – Conductive Body: as its player's Active Pokémon, 1 less to retreat for each Beldum on the Bench.
  'ex11-59': {
    ...POKE_BODY,
    text: 'As long as Beldum is your Active Pokémon, you pay [C] less to retreat Beldum for each Beldum on your Bench.',
    retreatChange: (pokemon, cards, owner) => (owner.active === pokemon ? -owner.bench.filter((q) => q && inPlayDef(cards, q).name.startsWith('Beldum')).length : 0),
  },
  // Flareon ex – Evolutionary Flame; Jolteon ex – Evolutionary Thunder; Vaporeon ex – Evolutionary Swirl.
  'ex11-108': onEvolveMay('evoFlame', 'Evolutionary Flame'),
  'ex11-109': onEvolveMay('evoThunder', 'Evolutionary Thunder'),
  'ex11-110': onEvolveMay('evoSwirl', 'Evolutionary Swirl'),
  // Azumarill – Thick Fat: as EX Unseen Forces Miltank's.
  'ex11-114': EX10_POWERS['ex10-42']!,
};

