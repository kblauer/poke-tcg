// Unleashed (hgss2) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Psychic Float is the engine's own rule (retreatBodies). The powers that work as their Pokémon is benched are asked then
// (mayUse): Stardust Song, Celebration Wind, Hot Snort.
// From the text: Magical Trans and Wash Out move one Energy card at a time (Wash Out from the Bench to the Active Pokémon only);
// Leap Frog switches in a Benched Water Pokémon; Water Acceleration attaches a Water Energy card from the hand to Floatzel as
// an attachment from the hand; Energy Signal works by itself as a Grass or Psychic Energy card is attached to Roserade from
// the hand (agreed as "you may": it always helps); Spray Splash's counter goes on the Pokémon clicked.
import { hasType, lookupCard } from '../cards.js';
import { afflictBetweenTurns, type Target } from '../engine.js';
import { energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { POKE_BODY } from './common.js';
import { onBench } from './dp5-powers.js';
import { energyCardOf } from './ex2.js';
import { EX3_POWERS } from './ex3-powers.js';

type Type = 'psychic' | 'water';
/** "Move a [type] Energy attached to 1 of your (Benched) Pokémon to another of your Pokémon (your Active Pokémon)". */
const moveTyped = (type: Type, label: string, toActive: boolean, once: boolean): PowerEffect => ({
  ...(once && { oncePerTurn: true }),
  blocked: (s) => (donors(s, type, toActive).length && (toActive ? s.me.active : ownTargets(s.me).length > 1) ? null : `None of your ${toActive ? 'Benched ' : ''}Pokémon has a ${label} Energy card`),
  choices(s, c) {
    const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
    return [
      { kind: 'ownPokemon', field: 'from', options: donors(s, type, toActive), prompt: `Choose one of your Pokémon to move a ${label} Energy card from` },
      ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => energyCardOf(s.cards, e, type)), prompt: `Choose the ${label} Energy card to move` }] : []),
      ...(from && !toActive ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' }] : []),
    ];
  },
  use(ctx) {
    const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
    const to = toActive ? ctx.me.active : ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
    const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
    if (!from || !to || !card || from === to) return;
    from.energy = from.energy.filter((e) => e !== card);
    to.energy.push(card);
    ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
  },
});
const donors = (s: PowerSituation, type: Type, benchOnly: boolean): Target[] =>
  ownTargets(s.me).filter((t) => (!benchOnly || t !== 'active') && pokemonAt(s.me, t)!.energy.some((e) => energyCardOf(s.cards, e, type)));

export const HGSS2_POWERS: Record<string, PowerEffect> = {
  // Jirachi – Stardust Song: as it's benched from the hand, 3 coins, a Psychic Energy card from the discard pile attached to it for each heads.
  'hgss2-1': onBench('stardustSong', 'Stardust Song'),
  // Metagross – Psychic Float: its player's Active Pokémon with a Psychic Energy attached retreats for free (retreatBodies).
  'hgss2-4': { ...POKE_BODY, psychicFloat: true },
  // Mismagius – Magical Trans: a Psychic Energy card moved from one of the player's Pokémon to another.
  'hgss2-5': moveTyped('psychic', 'Psychic', false, true),
  // Politoed – Leap Frog: a Benched Water Pokémon switched with the Active Pokémon.
  'hgss2-7': {
    oncePerTurn: true,
    blocked: (s) => (s.me.active && s.me.bench.some((p) => p && hasType(inPlayDef(s.cards, p), 'water')) ? null : 'You have no Water Pokémon on your Bench'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== 'active' && hasType(inPlayDef(s.cards, pokemonAt(s.me, t)!), 'water')), prompt: 'Leap Frog: choose a Benched Water Pokémon to switch in' }],
    use(ctx) {
      if (typeof ctx.choices.to === 'number' && ctx.me.bench[ctx.choices.to]) swapActive(ctx.state, ctx.me, ctx.choices.to);
    },
  },
  // Shaymin – Celebration Wind: as it's benched from the hand, any Energy cards moved among the player's Pokémon.
  'hgss2-8': onBench('celebrationWind', 'Celebration Wind'),
  // Blastoise – Wash Out: any number of times, a Water Energy card moved from a Benched Pokémon to the Active Pokémon.
  'hgss2-13': moveTyped('water', 'Water', true, false),
  // Floatzel – Water Acceleration: a Water Energy card from the hand attached to Floatzel.
  'hgss2-16': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => energyCardOf(s.cards, c, 'water')) ? null : 'You have no Water Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => energyCardOf(s.cards, c, 'water')), prompt: 'Water Acceleration: choose a Water Energy card to attach to Floatzel' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.source.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, ctx.source)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.sourceTarget, card);
    },
  },
  // Roserade – Energy Signal: a Grass Energy card attached from the hand, the Defending Pokémon Confused; a Psychic one, Poisoned.
  'hgss2-23': {
    onEnergyFromHand(state, owner, _pokemon, _target, energy) {
      const opp = state.players[state.playerOrder.find((id) => id !== owner.id)!]!;
      if (!opp.active || state.currentPlayer !== owner.id) return;
      if (energyCardOf(state.cards, energy, 'grass')) afflictBetweenTurns(state, opp.id, opp.active, 'confused');
      else if (energyCardOf(state.cards, energy, 'psychic')) afflictBetweenTurns(state, opp.id, opp.active, 'poisoned');
    },
  },
  // Torkoal – Hot Snort: as it's benched from the hand, heads, the Defending Pokémon is now Burned.
  'hgss2-25': onBench('hotSnort', 'Hot Snort'),
  // Cherrim – Sunny Heal: a damage counter off the Active Pokémon.
  'hgss2-28': {
    oncePerTurn: true,
    blocked: (s) => (s.me.active?.damage ? null : 'Your Active Pokémon has no damage counters'),
    use(ctx) {
      if (!ctx.me.active?.damage) return;
      ctx.me.active.damage -= 10;
      ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, ctx.me.active)}.`);
    },
  },
  // Pupitar – Boost Gas: with any Energy attached, no Retreat Cost.
  'hgss2-38': { ...POKE_BODY, retreatChange: (p) => (p.energy.length ? -99 : 0) },
  // Onix – Energy Healer: an Energy card attached to it from the hand, a damage counter off it.
  'hgss2-56': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon) {
      if (!pokemon.damage) return;
      pokemon.damage -= 10;
      addLog(state, `Energy Healer removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Kingdra – Spray Splash: a damage counter on one of the opponent's Pokémon.
  'hgss2-85': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active || s.opp.bench.some(Boolean) ? null : 'Your opponent has no Pokémon in play'),
    use: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Spray Splash', count: 1, active: true }),
  },
  // Lanturn – Underwater Dive: Water type until the end of the turn.
  'hgss2-86': {
    oncePerTurn: true,
    use(ctx) {
      ctx.source.typesCopied = ['water'];
      ctx.log(`${pokemonName(ctx.state, ctx.source)} is Water type until the end of the turn.`);
    },
  },
  // Steelix – Perfect Metal: as EX Dragon Seviper's Thick Skin.
  'hgss2-87': EX3_POWERS['ex3-9']!,
  // Ursaring – Berserk: with damage counters on it, its attacks do 60 more (attacks.ts).
  'hgss2-89': { ...POKE_BODY, berserk: true },
};
