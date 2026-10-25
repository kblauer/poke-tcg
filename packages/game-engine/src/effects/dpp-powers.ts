// DP Black Star Promos (dpp) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies
// never do. The reprints play as their earlier prints. Several are the engine's own rules, named by a flag: Multitype
// (inPlayDef), Bind Eye (EVOLVE), Invisible Tentacles (attackError, attackAction), Revenge Seed (attacks.ts).
// From the text: Darkrai's Enigma Berry (left out by TCGdex, from the printed card: a held item, kept as a Poké-Body) heals at
// the end of the turn it was damaged by a Fighting Pokémon's attack, while it's still Active; Invisible Tentacles' card is
// discarded once the attack is over; Dragon Spirit always takes the first Energy card in the discard pile; Healing Breath
// heals the Pokémon SP (G, GL, C, FB, E4, 4 in their names).
import { hasType, lookupCard, namesMatch } from '../cards.js';
import { type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { inPlay, onlyActive, POKE_BODY } from './common.js';
import { DP1_POWERS } from './dp1-powers.js';
import { DP2_POWERS } from './dp2-powers.js';
import { DP4_POWERS } from './dp4-powers.js';
import { onLevelUp } from './dp5-powers.js';
import { DP6_POWERS } from './dp6-powers.js';
import { DP7_POWERS } from './dp7-powers.js';
import { babyEvolution } from './ex2-powers.js';
import { trainerEffect } from './index.js';

/** The player has a Pokémon of this name in play (Lunar Aura, Darkness Aura). */
const hasInPlay = (side: Parameters<typeof inPlay>[0], cards: Parameters<typeof inPlayDef>[0], name: string) => inPlay(side).some((p) => namesMatch(inPlayDef(cards, p).name, name));
/** The player's Pokémon with a Technical Machine attached (Install). */
const withMachine = (s: PowerSituation): Target[] => ownTargets(s.me).filter((t) => (pokemonAt(s.me, t)!.attached ?? []).some((a) => trainerEffect(a.card.defId)?.technicalMachine));

export const DPP_POWERS: Record<string, PowerEffect> = {
  // Torterra LV.X – Forest Murmurs; Infernape LV.X – Burning Head; Empoleon LV.X – Supreme Command: as Diamond & Pearl's.
  'dpp-DP09': DP1_POWERS['dp1-122']!,
  'dpp-DP10': DP1_POWERS['dp1-121']!,
  'dpp-DP11': DP1_POWERS['dp1-120']!,
  // Lucario LV.X – Stance; Pikachu – Electro Recycle: as Mysterious Treasures'.
  'dpp-DP12': DP2_POWERS['dp2-122']!,
  'dpp-DP16': DP2_POWERS['dp2-94']!,
  // Dialga LV.X – Time Skip; Palkia LV.X – Restructure; Darkrai LV.X – Dark Shadow: as Great Encounters'.
  'dpp-DP17': DP4_POWERS['dp4-105']!,
  'dpp-DP37': DP4_POWERS['dp4-105']!,
  'dpp-DP18': DP4_POWERS['dp4-106']!,
  'dpp-DP19': DP4_POWERS['dp4-104']!,
  // Mime Jr. – Baby Evolution.
  'dpp-DP22': babyEvolution('Mr. Mime'),
  // Darkrai – Enigma Berry: damaged by an attack from the opponent's Fighting Pokémon, 4 damage counters off at the end of that turn.
  'dpp-DP24': {
    ...POKE_BODY,
    name: 'Enigma Berry',
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon || !hasType(ctx.attackerDef, 'fighting')) return;
      (pokemon.effects ??= {}).delayed = { turn: ctx.turn, heal: 40 };
    },
  },
  // Mewtwo LV.X – Psybarrier: as Legends Awakened's. Regigigas LV.X – Sacrifice; Heatran LV.X – Heat Metal: as Stormfront's.
  'dpp-DP28': DP6_POWERS['dp6-144']!,
  'dpp-DP30': DP7_POWERS['dp7-100']!,
  'dpp-DP31': DP7_POWERS['dp7-97']!,
  // Dusknoir – Dark Hide: heads, a Pokémon in the opponent's hand (shown) on the bottom of their deck.
  'dpp-DP33': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppHand ? null : "Your opponent's hand is empty"),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Dark Hide did nothing.');
      ctx.pend({ kind: 'oppHandTrainer', source: 'Dark Hide', filter: 'pokemon', place: 'bottom' });
    },
  },
  // Porygon-Z – Install: any number of times, a Technical Machine moved from one of the player's Pokémon to another.
  'dpp-DP35': {
    blocked: (s) => (withMachine(s).length && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon has a Technical Machine attached'),
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: withMachine(s), prompt: 'Choose one of your Pokémon to move a Technical Machine from' },
      ...(c.from !== undefined ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' }] : []),
    ],
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      const machine = from?.attached?.find((a) => trainerEffect(a.card.defId)?.technicalMachine);
      if (!from || !to || !machine || from === to) return;
      from.attached = from.attached!.filter((a) => a !== machine);
      (to.attached ??= []).push(machine);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, machine.card.defId).name} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Gliscor – Bind Eye; Giratina LV.X – Invisible Tentacles; Shaymin LV.X – Revenge Seed; Arceus LV.X – Multitype.
  'dpp-DP36': { ...POKE_BODY, bindEye: true },
  'dpp-DP38': { ...POKE_BODY, invisibleTentacles: true },
  'dpp-DP39': { ...POKE_BODY, revengeSeed: true },
  'dpp-DP53': { ...POKE_BODY, multitype: true },
  'dpp-DP56': { ...POKE_BODY, multitype: true },
  // Toxicroak G – Leap Away: as the Active Pokémon, heads: it and its cards back into the hand (with a Benched Pokémon to take its place).
  'dpp-DP41': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Toxicroak') ?? (s.me.bench.some(Boolean) ? null : 'You have no Benched Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Leap Away did nothing.');
      const p = ctx.source;
      ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
      ctx.me.active = null;
      ctx.log('Toxicroak and its cards went back into the hand.');
    },
  },
  // Charizard G LV.X – Call for Power: any number of times, an Energy card moved from another of the player's Pokémon to it.
  'dpp-DP45': {
    blocked: (s) => (donors(s).length ? null : 'None of your other Pokémon has Energy attached'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: donors(s), prompt: 'Choose one of your Pokémon to move an Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => !e.provides), prompt: 'Choose the Energy card to move' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !card || from === ctx.source) return;
      from.energy = from.energy.filter((e) => e !== card);
      ctx.source.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },
  // Garchomp C LV.X – Healing Breath (as it levels up).
  'dpp-DP46': onLevelUp('healingBreath', 'Healing Breath'),
  // Rayquaza C LV.X – Dragon Spirit: as the Active Pokémon damaged but not Knocked Out by the opponent's attack, an Energy card from the discard pile attached to it.
  'dpp-DP47': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon || pokemon.damage >= inPlayDef(ctx.state.cards, pokemon).hp || discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return;
      const card = ctx.opp.discard.find((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
      if (!card) return;
      ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
      pokemon.energy.push(card);
      ctx.log(`Dragon Spirit: attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, pokemon)}.`, ctx.opp.id);
    },
  },
  // Cresselia – Lunar Aura: with Darkrai in play, a damage counter off it between turns.
  'dpp-DP51': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (!pokemon.damage || !hasInPlay(owner, state.cards, 'Darkrai')) return;
      pokemon.damage -= 10;
      addLog(state, 'Lunar Aura: removed a damage counter from Cresselia.', owner.id);
    },
  },
  // Darkrai – Darkness Aura: with Cresselia in play, its attacks do 20 more to the Defending Pokémon.
  'dpp-DP52': { ...POKE_BODY, defendingMore: { more: 20, when: (_p, owner, cards) => hasInPlay(owner, cards, 'Cresselia') } },
};

/** The player's other Pokémon with Energy cards attached (Call for Power). */
function donors(s: PowerSituation): Target[] {
  return ownTargets(s.me).filter((t) => t !== s.source && pokemonAt(s.me, t)!.energy.some((e) => !e.provides));
}
