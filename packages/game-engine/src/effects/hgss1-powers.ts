// HeartGold & SoulSilver (hgss1) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition,
// Poké-Bodies never do. Several are the engine's own rules, named by a flag: Sweet Sleeping Face and Green Shield (attacks.ts).
// The powers that work as their Pokémon is benched, evolves or comes into play are asked then (mayUse): RETURN, FLASH,
// Blissful Nurse, Ocean Grow.
// From the text: Second Sight asks whose deck; Roast Reveal's Fire Energy card is picked when they differ; Afterburner's
// Fire Energy card is basic, its damage counter on the Pokémon it goes to; Ocean Grow attaches every Energy card among the
// top 5 to Lugia LEGEND and discards the rest.
import { lookupCard } from '../cards.js';
import { afflictBetweenTurns } from '../engine.js';
import { discardsLocked, type PowerEffect } from '../powers.js';
import { BASE1_POWERS } from './base1-powers.js';
import { POKE_BODY, targetOf } from './common.js';
import { onBench } from './dp5-powers.js';
import { DP7_POWERS } from './dp7-powers.js';
import { EX2_POWERS } from './ex2-powers.js';
import { energyCardOf } from './ex2.js';
import { EX3_POWERS } from './ex3-powers.js';
import { EX8_POWERS } from './ex8-powers.js';
import { EX9_POWERS } from './ex9-powers.js';
import { PL2_POWERS } from './pl2-powers.js';

const sleepingFace: PowerEffect = { ...POKE_BODY, sleepingFace: true };

export const HGSS1_POWERS: Record<string, PowerEffect> = {
  // Ninetales – Roast Reveal: a Fire Energy card discarded from the hand, 3 cards drawn.
  'hgss1-7': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => energyCardOf(s.cards, c, 'fire')) ? null : 'You have no Fire Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => energyCardOf(s.cards, c, 'fire')), prompt: 'Roast Reveal: choose a Fire Energy card to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      const drawn = ctx.me.deck.splice(0, 3);
      ctx.me.hand.push(...drawn);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name}; drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },
  // Noctowl – Night Sight: as EX Deoxys Dodrio's Echo Draw.
  'hgss1-8': EX8_POWERS['ex8-10']!,
  // Shuckle – Shell Barricade: as EX Emerald Lanturn's Submerge.
  'hgss1-11': EX9_POWERS['ex9-49']!,
  // Slowking – Second Sight: the top 3 cards of either deck rearranged.
  'hgss1-12': {
    oncePerTurn: true,
    choices: () => [{ kind: 'side', field: 'fromSide', options: ['own', 'opp'], prompt: 'Second Sight: whose deck?' }],
    use(ctx) {
      const owner = ctx.choices.fromSide === 'opp' ? ctx.opp : ctx.me;
      if (owner.deck.length) ctx.pend({ kind: 'arrangeTop', source: 'Second Sight', count: Math.min(3, owner.deck.length), deckOwner: owner.id });
    },
  },
  // Cleffa, Pichu, Smoochum, Tyrogue, Igglybuff – Sweet Sleeping Face: while Asleep, no damage from attacks (attacks.ts).
  'hgss1-17': sleepingFace,
  'hgss1-28': sleepingFace,
  'hgss1-30': sleepingFace,
  'hgss1-33': sleepingFace,
  'hgss1-44': sleepingFace,
  // Hypno – Sleep Pendulum: heads, the Defending Pokémon is now Asleep.
  'hgss1-23': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (ctx.opp.active && ctx.flip()) afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active, 'asleep');
    },
  },
  // Sunflora – Sunshine Grace: as Rising Rivals Beedrill's Flutter Wings.
  'hgss1-31': PL2_POWERS['pl2-15']!,
  // Metapod – Green Shield: its player's Grass Pokémon have no Weakness (attacks.ts).
  'hgss1-46': { ...POKE_BODY, greenShield: true },
  // Unown – RETURN: as it's benched from the hand, every Energy card on one of the player's Pokémon back into the hand.
  'hgss1-54': onBench('unownReturn', 'RETURN'),
  // Unown – FLASH: as it's benched from the hand, the top 5 cards of the deck rearranged.
  'hgss1-55': onBench('unownFlash', 'FLASH'),
  // Ampharos – Conductivity: as EX Dragon Ampharos ex's.
  'hgss1-105': EX3_POWERS['ex3-89']!,
  // Blissey – Blissful Nurse: as it evolves from the hand, every damage counter off the player's Pokémon, the damaged ones' Energy discarded.
  'hgss1-106': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || pokemon.levelUpFrom || ![owner.active, ...owner.bench].some((p) => p?.damage)) return;
      state.pendingChoice = { player: owner.id, source: 'Blissful Nurse', kind: 'mayUse', power: 'blissfulNurse', target: targetOf(owner, pokemon) };
    },
  },
  // Donphan – Exoskeleton: as EX Sandstorm Kakuna's.
  'hgss1-107': EX2_POWERS['ex2-39']!,
  // Feraligatr – Rain Dance: as Base Set Blastoise's. Meganium – Leaf Trans: as Base Set Venusaur's Energy Trans.
  'hgss1-108': BASE1_POWERS['base1-2']!,
  'hgss1-109': BASE1_POWERS['base1-15']!,
  // Typhlosion – Afterburner: a basic Fire Energy card from the discard pile attached to one of the player's Pokémon, then a damage counter on it.
  'hgss1-110': {
    oncePerTurn: true,
    blocked: (s) => (s.me.discard.some((c) => energyCardOf(s.cards, c, 'fire') && lookupCard(s.cards, c.defId).kind === 'energy' && (lookupCard(s.cards, c.defId) as { basic?: boolean }).basic !== false) ? null : 'You have no Fire Energy cards in your discard pile'),
    use(ctx) {
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'attachFromDiscard', source: 'Afterburner', count: 1, type: 'fire', countersAfter: 1 });
    },
  },
  // Ho-Oh LEGEND – Sacred Rainbow: as Stormfront Moltres's.
  'hgss1-111': DP7_POWERS['dp7-103']!,
  'hgss1-112': DP7_POWERS['dp7-103']!,
  // Lugia LEGEND – Ocean Grow: as it comes into play, the Energy cards among the top 5 attached to it, the rest discarded.
  'hgss1-113': { onPlayFromHand: oceanGrow },
  'hgss1-114': { onPlayFromHand: oceanGrow },
};

function oceanGrow(state: Parameters<NonNullable<PowerEffect['onPlayFromHand']>>[0], owner: Parameters<NonNullable<PowerEffect['onPlayFromHand']>>[1], pokemon: Parameters<NonNullable<PowerEffect['onPlayFromHand']>>[2]) {
  if (!owner.deck.length) return;
  state.pendingChoice = { player: owner.id, source: 'Ocean Grow', kind: 'mayUse', power: 'oceanGrow', target: targetOf(owner, pokemon) };
}
