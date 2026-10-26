// Great Encounters (dp4) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Toxic Virus (betweenTurns), Anger Point, Marvel Scale, Sunlight and Dark
// Shadow (attacks.ts), LINK (usableAttacks), Wild Growth (as Neo Genesis Meganium's), Serene Grace (asked as it evolves, mayUse).
// From the text: Wash Out can be used any number of times; Cosmic Power puts the cards on the bottom one at a time, in the
// order picked; Time Skip's coins are flipped by the engine for the opponent; Restructure asks the opponent which of the
// player's Benched Pokémon comes in, then the player picks the opponent's; FAKE's coin side is random and the opponent guesses
// (the CPU at random); GUARD attaches Unown G as Unown E's EQUIP does, keeping attacks' effects other than damage off.
import { isBasicEnergy, lookupCard, namesMatch } from '../cards.js';
import { afflictBetweenTurns, type InPlayPokemon } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { nextRandom } from '../rng.js';
import { addLog, clearSpecialConditions, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { inPlay, onlyActive, onlyBenched, POKE_BODY, targetOf } from './common.js';
import { ECARD1_POWERS } from './ecard1-powers.js';
import { EX12_POWERS } from './ex12-powers.js';
import { energyCardOf } from './ex2.js';
import { babyEvolution } from './ex2-powers.js';
import { EX9_POWERS } from './ex9-powers.js';
import { trainerEffect } from './index.js';

/** The named Pokémon are all on the player's Bench (the Unown). */
const benchHas = (s: PowerSituation, names: string[]) => names.every((n) => s.me.bench.some((p) => p && inPlayDef(s.cards, p).name === n));
/** The player has a Pokémon of this name in play (Gravity Change, Light Conduct). */
const hasInPlay = (s: Pick<PowerSituation, 'me' | 'cards'>, name: string) => inPlay(s.me).some((p) => namesMatch(inPlayDef(s.cards, p).name, name));
const allergic = (s: PowerSituation) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : null);
/** Emerge, Pupate: as EX Legend Maker Cascoon's Emerge, by this Pokémon's name. */
const emerge = (name: string): PowerEffect => ({ ...EX12_POWERS['ex12-30']!, blocked: (s) => onlyActive(s, name) ?? (s.counts.deck ? null : 'Your deck is empty') });
/** Water and Fighting Energy cards on one of the player's Benched Pokémon (Wash Out). */
const washable = (s: PowerSituation, p: InPlayPokemon) => p.energy.filter((e) => energyCardOf(s.cards, e, 'water') || energyCardOf(s.cards, e, 'fighting'));

export const DP4_POWERS: Record<string, PowerEffect> = {
  // Porygon-Z – Conversion: a basic Energy card from the hand discarded; Porygon-Z is its type until the end of the turn.
  'dp4-6': {
    oncePerTurn: true,
    blocked: (s) => (basicInHand(s).length ? null : 'You have no basic Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: basicInHand(s), prompt: 'Choose a basic Energy card to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const d = card && lookupCard(ctx.state.cards, card.defId);
      if (!card || d?.kind !== 'energy') return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      ctx.source.typesCopied = [d.energyType];
      ctx.log(`Discarded ${d.name}: Porygon-Z is ${d.energyType} type until the end of the turn.`);
    },
  },
  // Sceptile – Wild Growth: as Neo Genesis Meganium's, as a Poké-Body.
  'dp4-8': { ...POKE_BODY, wildGrowth: true },
  // Swampert – Wash Out: any number of times, a Water or Fighting Energy card moved from a Benched Pokémon to the Active one.
  'dp4-9': {
    blocked: (s) => (!s.me.active ? 'You have no Active Pokémon' : s.me.bench.some((p) => p && washable(s, p).length) ? null : 'None of your Benched Pokémon has Water or Fighting Energy attached'),
    choices(s, c) {
      const from = s.me.bench.flatMap((p, i) => (p && washable(s, p).length ? [i] : []));
      const p = typeof c.from === 'number' ? s.me.bench[c.from] : null;
      return [
        { kind: 'ownPokemon', field: 'from', options: from, prompt: 'Choose one of your Benched Pokémon to move a Water or Fighting Energy card from' },
        ...(p ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: washable(s, p), prompt: 'Choose the Energy card to move to your Active Pokémon' }] : []),
      ];
    },
    use(ctx) {
      const from = typeof ctx.choices.from === 'number' ? ctx.me.bench[ctx.choices.from] : null;
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !card || !ctx.me.active) return;
      from.energy = from.energy.filter((e) => e !== card);
      ctx.me.active.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, ctx.me.active)}.`);
    },
  },
  // Togekiss – Serene Grace: evolving from the hand, basic Energy cards from the top 10 attached to the player's Pokémon (mayUse).
  'dp4-11': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || !owner.deck.length) return;
      state.pendingChoice = { player: owner.id, source: 'Serene Grace', kind: 'mayUse', power: 'sereneGrace', target: targetOf(owner, pokemon) };
    },
  },
  // Claydol – Cosmic Power: up to 2 cards from the hand on the bottom of the deck, then cards drawn until 6.
  'dp4-15': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length ? null : 'Your hand is empty'),
    use: (ctx) => ctx.pend({ kind: 'handToDeck', source: 'Cosmic Power', bottom: true, count: 2, optional: true, drawTo: 6 }),
  },
  // Milotic – Marvel Scale; Primeape – Anger Point; Weezing – Toxic Virus; Solrock – Sunlight; Unown L – LINK; Darkrai LV.X – Dark Shadow.
  'dp4-25': { ...POKE_BODY, marvelScale: true },
  'dp4-27': { ...POKE_BODY, angerPoint: true },
  'dp4-31': { ...POKE_BODY, toxicVirus: true },
  'dp4-85': { ...POKE_BODY, sunlight: true },
  'dp4-91': { ...POKE_BODY, link: true },
  'dp4-104': { ...POKE_BODY, darkShadow: true },
  // Slowking – Trump Card: one of the player's Pokémon Knocked Out last turn, any card from the deck.
  'dp4-28': {
    oncePerTurn: true,
    blocked: (s) => (s.me.knockedOutTurn !== s.turn - 1 ? "None of your Pokémon were Knocked Out during your opponent's last turn" : s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Trump Card', filter: 'any', optional: true }),
  },
  // Unown H – HEAL: with Unown H, E, A and L on the Bench, every Special Condition off the Active Pokémon.
  'dp4-29': {
    oncePerTurn: true,
    blocked: (s) => (!benchHas(s, ['Unown H', 'Unown E', 'Unown A', 'Unown L']) ? 'You need Unown H, Unown E, Unown A and Unown L on your Bench' : s.me.active && hasSpecialCondition(s.me.active) ? null : 'Your Active Pokémon has no Special Condition'),
    use(ctx) {
      if (!ctx.me.active) return;
      clearSpecialConditions(ctx.me.active);
      ctx.log(`${pokemonName(ctx.state, ctx.me.active)} has no Special Conditions now.`);
    },
  },
  // Wailord – Sleeping Pulse: still Asleep after the checkup, a damage counter off.
  'dp4-30': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (pokemon.condition !== 'asleep' || !pokemon.damage) return;
      pokemon.damage -= 10;
      addLog(state, `Sleeping Pulse: removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Wigglytuff – Good Night Melody: both Active Pokémon Asleep.
  'dp4-32': {
    oncePerTurn: true,
    use(ctx) {
      for (const side of [ctx.me, ctx.opp]) if (side.active) afflictBetweenTurns(ctx.state, side.id, side.active, 'asleep');
    },
  },
  // Magcargo – Magma Armor: as EX Emerald's.
  'dp4-45': EX9_POWERS['ex9-92']!,
  // Metapod – Emerge; Caterpie – Pupate: as EX Legend Maker Cascoon's Emerge.
  'dp4-47': emerge('Metapod'),
  'dp4-63': emerge('Caterpie'),
  // Porygon2 – Download: a Supporter card from the hand discarded and its effect used.
  'dp4-49': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => trainerEffect(c.defId)?.supporter) ? null : 'You have no Supporter cards in your hand'),
    use: (ctx) => ctx.pend({ kind: 'supernatural', source: 'Download', ownHand: true }),
  },
  // Unown F – FAKE: from the Bench, the opponent guesses a hidden coin; wrong, the player draws a card.
  'dp4-56': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown F') ?? (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const [r, next] = nextRandom(ctx.state.rngState);
      ctx.state.rngState = next;
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'FAKE: your opponent has put a coin down, hidden. Heads or tails? (Wrong: they draw a card)', kind: 'guess', card: ctx.source.card, labels: ['Heads', 'Tails'], answer: r < 0.5 ? 0 : 1, draw: 1, onlyWrong: true };
    },
  },
  // Unown G – GUARD: from the Bench, its cards discarded and itself attached to another of the player's Pokémon as a Pokémon Tool.
  'dp4-57': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown G') ?? (guardTargets(s).length ? null : 'None of your other Pokémon can take a Pokémon Tool'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: guardTargets(s), prompt: 'Choose one of your Pokémon to attach Unown G to' }],
    use(ctx) {
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!to || to === ctx.source || (to.attached ?? []).some((a) => a.tool)) return;
      const unown = ctx.source;
      ctx.me.discard.push(...unown.energy.map(({ provides: _, ...card }) => card), ...(unown.attached ?? []).map((a) => a.card));
      ctx.me.bench = ctx.me.bench.map((p) => (p === unown ? null : p));
      (to.attached ??= []).push({ card: unown.card, until: Number.MAX_SAFE_INTEGER, tool: true, equip: true });
      ctx.log(`Attached Unown G to ${pokemonName(ctx.state, to)} as a Pokémon Tool.`);
    },
  },
  // Igglybuff – Baby Evolution.
  'dp4-70': babyEvolution('Jigglypuff'),
  // Illumise – Scent Conduct: heads, a Grass Basic Pokémon from the deck onto the Bench.
  'dp4-71': {
    oncePerTurn: true,
    blocked: (s) => (!s.me.bench.some((p) => !p) ? 'Your Bench is full' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Scent Conduct did nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Scent Conduct', filter: 'basicType', type: 'grass', toBench: true, optional: true });
    },
  },
  // Lunatone – Gravity Change: a card from the hand discarded; with Solrock in play, a card drawn.
  'dp4-76': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length ? null : 'Your hand is empty'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name}.`);
      if (!hasInPlay({ me: ctx.me, cards: ctx.state.cards }, 'Solrock') || !ctx.me.deck.length) return;
      ctx.me.hand.push(ctx.me.deck.shift()!);
      ctx.log('Drew a card.');
    },
  },
  // Volbeat – Light Conduct: with Illumise in play, a Supporter card from the discard pile on top of the deck, shown.
  'dp4-92': {
    oncePerTurn: true,
    blocked: (s) => (!hasInPlay(s, 'Illumise') ? "You don't have Illumise in play" : allergic(s) ?? (supportersIn(s).length ? null : 'No Supporter cards in your discard pile')),
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: supportersIn(s), prompt: 'Choose a Supporter card to put on top of your deck' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.deck.unshift(card);
      ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} on top of the deck.`);
    },
  },
  // Cresselia LV.X – Full Moon Dance: a damage counter moved from any Pokémon to another (as Expedition Gengar's Chaos Move, any time).
  'dp4-103': {
    ...ECARD1_POWERS['ecard1-13']!,
    blocked(s) {
      const all = [...inPlay(s.me), ...inPlay(s.opp)];
      return all.some((p) => p.damage >= 10) && all.length > 1 ? null : 'No Pokémon in play has damage counters to move';
    },
  },
  // Dialga LV.X – Time Skip: 2 coins for the opponent; 2 heads, the player's turn ends; 2 tails, the opponent's next turn ends once they draw.
  'dp4-105': {
    oncePerTurn: true,
    use(ctx) {
      const coins = [ctx.flip(), ctx.flip()];
      if (coins.every(Boolean)) {
        ctx.state.endTurnNow = true;
        return ctx.log('Time Skip: 2 heads, your turn ends.');
      }
      if (coins.some(Boolean)) return ctx.log('Time Skip did nothing.');
      ctx.opp.turnSkipped = ctx.state.turn + 1;
      ctx.log("Time Skip: 2 tails, your opponent's next turn ends once they draw.");
    },
  },
  // Palkia LV.X – Restructure: the opponent switches the player's Active Pokémon with one of their Benched Pokémon, then the player switches the opponent's.
  'dp4-106': {
    oncePerTurn: true,
    blocked: (s) => (s.me.bench.some(Boolean) || s.opp.bench.some(Boolean) ? null : 'Neither player has Benched Pokémon'),
    use(ctx) {
      const theirs = ctx.opp.bench.some(Boolean) ? [{ player: ctx.me.id, source: 'Restructure', kind: 'oppBenchPick' as const, purpose: 'gust' as const }] : [];
      if (!ctx.me.bench.some(Boolean)) return void (theirs[0] && (ctx.state.pendingChoice = theirs[0]));
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Restructure', kind: 'oppBenchPick', purpose: 'gust' };
      if (theirs[0]) (ctx.state.queuedChoices ??= []).push(theirs[0]);
    },
  },
};

/** Basic Energy cards in the player's hand (Conversion). */
function basicInHand(s: PowerSituation) {
  return s.me.hand.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));
}

/** Supporter cards in the player's discard pile (Light Conduct). */
function supportersIn(s: PowerSituation) {
  return s.me.discard.filter((c) => trainerEffect(c.defId)?.supporter);
}

/** The player's Pokémon Unown G can be attached to: any other without a Pokémon Tool. */
function guardTargets(s: PowerSituation) {
  return ownTargets(s.me).filter((t) => t !== s.source && !(pokemonAt(s.me, t)!.attached ?? []).some((a) => a.tool));
}
