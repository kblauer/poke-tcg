// Triumphant (hgss4) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Pheromone Stamina (hpPlus), Heal Block, Tangling Tendrils (`stickyGoo`), Dittobolic (`benchLimit`), Lonely Bone, Eye of
// Disaster, Catastrophe, Lost Link and Insight are the engine's own rules. Spooky Whirlpool and CURE (as their Pokémon is
// benched) and Mapping (as Porygon2 evolves) are asked then (mayUse).
// From the text: Heal Block stops every removal of damage counters, either player's, while its player has Lunatone in play,
// checked once each action is done (moving damage counters still works); Natural Remedy works each time; Forest Breath's
// Energy card counts as attached from the hand; Energymite Knocks Electrode Out first (its Prize card taken), then the Energy
// cards among the top 7 are attached to the player's Pokémon one at a time; Fighting Tag needs a Fighting Energy on the
// Active Pokémon; Dittobolic's discard is asked whenever it applies (agreed 2026-10-25), once an action is done.
import { lookupCard } from '../cards.js';
import { activeLock, afflictBetweenTurns, resolveKnockouts } from '../engine.js';
import { energyFromHand, ownTargets, pokemonAt, type PowerEffect } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { onlyActive, onlyBenched, POKE_BODY, targetOf } from './common.js';
import { onBench } from './dp5-powers.js';
import { energyCardOf } from './ex2.js';
import { EX5_POWERS } from './ex5-powers.js';
import { EX8_POWERS } from './ex8-powers.js';
import { HGSS1_POWERS } from './hgss1-powers.js';

/** "When you play this from your hand to evolve 1 of your Pokémon, you may …": a yes-or-no question as it evolves. */
const onEvolve = (power: 'mapping', source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

export const HGSS4_POWERS: Record<string, PowerEffect> = {
  // Nidoking – Pheromone Stamina: 20 more HP for each Nidoqueen its player has in play (refreshHideout).
  'hgss4-6': { ...POKE_BODY, pheromoneStamina: true },
  // Porygon-Z – Dimension Transfer: heads, a Trainer card from the discard pile on top of the deck, shown.
  'hgss4-7': {
    oncePerTurn: true,
    blocked: (s) => (s.me.discard.some((c) => lookupCard(s.cards, c.defId).kind === 'trainer') ? null : 'You have no Trainer cards in your discard pile'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Dimension Transfer did nothing.');
      ctx.pend({ kind: 'pickFromDiscard', source: 'Dimension Transfer', filter: 'trainer' });
    },
  },
  // Rapidash – Fiery Spirit: as EX Deoxys Rapidash's.
  'hgss4-8': EX8_POWERS['ex8-32']!,
  // Solrock – Heal Block: with Lunatone in play, no damage counters can be removed from any Pokémon (engine.ts).
  'hgss4-9': { ...POKE_BODY, healBlock: true },
  // Spiritomb – Spooky Whirlpool: as it's benched from the hand, the opponent shuffles their hand into their deck and draws 6.
  'hgss4-10': onBench('spookyWhirlpool', 'Spooky Whirlpool'),
  // Venomoth – Poison Moth Wind: heads, the opponent's Active Pokémon is Poisoned; tails, the player's.
  'hgss4-11': {
    oncePerTurn: true,
    use(ctx) {
      const heads = ctx.flip();
      const side = heads ? ctx.opp : ctx.me;
      if (side.active) afflictBetweenTurns(ctx.state, side.id, side.active, 'poisoned');
    },
  },
  // Victreebel – Tangling Tendrils: as the Active Pokémon, the opponent's Active Pokémon retreats for 2 more (stickyGoo).
  'hgss4-12': { ...POKE_BODY, stickyGoo: 2 },
  // Ditto – Dittobolic: the opponent can have only 4 Benched Pokémon; with 5, they discard one (benchLimit).
  'hgss4-17': { ...POKE_BODY, dittobolic: true },
  // Elekid, Magby – Sweet Sleeping Face: as HeartGold & SoulSilver's.
  'hgss4-21': HGSS1_POWERS['hgss1-17']!,
  'hgss4-41': HGSS1_POWERS['hgss1-17']!,
  // Golduck – Natural Remedy: a Water Energy card attached to it from the hand takes 2 damage counters off.
  'hgss4-22': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (state.currentPlayer !== owner.id || !energyCardOf(state.cards, energy, 'water') || !pokemon.damage) return;
      pokemon.damage = Math.max(0, pokemon.damage - 20);
      addLog(state, `Natural Remedy removed damage counters from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Porygon2 – Mapping: as it evolves, a Stadium card from the deck, shown.
  'hgss4-49': onEvolve('mapping', 'Mapping'),
  // Unown – CURE: as it's benched from the hand, every Special Condition off the Active Pokémon.
  'hgss4-51': onBench('unownCure', 'CURE'),
  // Cubone – Lonely Bone: 20 less damage from the opponent's attacks for each Marowak in its player's discard pile (attacks.ts).
  'hgss4-60': { ...POKE_BODY, lonelyBone: true },
  // Yanma – Free Flight: as EX Hidden Legends Yanma's.
  'hgss4-84': EX5_POWERS['ex5-77']!,
  // Absol – Eye of Disaster: as the Active Pokémon, 2 damage counters on each Basic Pokémon the opponent benches from their hand (engine.ts).
  'hgss4-91': { ...POKE_BODY, eyeOfDisaster: true },
  // Celebi – Forest Breath: as the Active Pokémon, a Grass Energy card from the hand attached to one of the player's Pokémon.
  'hgss4-92': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Celebi') ?? (s.me.hand.some((c) => energyCardOf(s.cards, c, 'grass')) ? null : 'You have no Grass Energy cards in your hand'),
    choices: (s) => [
      { kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => energyCardOf(s.cards, c, 'grass')), prompt: 'Forest Breath: choose a Grass Energy card to attach' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me), prompt: 'Forest Breath: choose one of your Pokémon to attach it to' },
    ],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!card || !to) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      to.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, card);
    },
  },
  // Electrode – Energymite: Electrode is Knocked Out; any Energy cards among the top 7 attached to the player's Pokémon, the rest discarded.
  'hgss4-93': {
    oncePerTurn: true,
    use(ctx) {
      ctx.source.damage = Math.max(ctx.source.damage, inPlayDef(ctx.state.cards, ctx.source).hp);
      ctx.log(`Energymite: ${pokemonName(ctx.state, ctx.source)} is Knocked Out.`);
      resolveKnockouts(ctx.state, ctx.opp.id);
      if (ctx.state.phase === 'finished' || !ctx.me.deck.length) return;
      const looked = ctx.me.deck.slice(0, 7).map((c) => c.uid);
      ctx.log(`Energymite shows ${ctx.me.deck.slice(0, 7).map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
      ctx.pend({ kind: 'pickFromTop', source: 'Energymite', looked, take: 7, basicEnergy: true, anyEnergy: true, anyTarget: true, discardRest: true });
    },
  },
  // Gengar – Catastrophe: as the Active Pokémon, the opponent's Knocked Out Pokémon go to the Lost Zone (engine.ts).
  'hgss4-94': { ...POKE_BODY, catastrophe: true },
  // Machamp – Fighting Tag: on the Bench, every Fighting Energy on the Active Pokémon moved to Machamp, then the two switched.
  'hgss4-95': {
    oncePerTurn: true,
    blocked: (s) =>
      onlyBenched(s, 'Machamp') ?? (s.me.active?.energy.some((e) => energyCardOf(s.cards, e, 'fighting')) ? activeLock(s.me, [s.me, s.opp], s.cards) : 'Your Active Pokémon has no Fighting Energy'),
    use(ctx) {
      const active = ctx.me.active;
      const slot = ctx.sourceTarget;
      if (!active || typeof slot !== 'number') return;
      const fighting = active.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'fighting'));
      active.energy = active.energy.filter((e) => !fighting.includes(e));
      ctx.source.energy.push(...fighting);
      ctx.log(`Moved ${fighting.length} Fighting Energy to ${pokemonName(ctx.state, ctx.source)}.`);
      swapActive(ctx.state, ctx.me, slot);
    },
  },
  // Magnezone – Magnetic Draw: cards drawn until the hand has 6.
  'hgss4-96': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length >= 6 ? 'You already have 6 or more cards in your hand' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const drawn = ctx.me.deck.splice(0, 6 - ctx.me.hand.length);
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },
  // Mew – Lost Link: the attacks of every Pokémon in the Lost Zone, either player's (usableAttacks).
  'hgss4-97': { ...POKE_BODY, lostLink: true },
  // Yanmega – Insight: with as many cards in the hand as the opponent, its attacks cost nothing (attackError).
  'hgss4-98': { ...POKE_BODY, insight: true },
};
