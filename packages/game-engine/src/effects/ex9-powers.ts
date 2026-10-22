// EX Emerald (ex9) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// From the text: Green Essence works while Sceptile is anywhere in play, for its player's Active Pokémon with Grass Energy
// attached (refreshHideout); Feebas's Submerge stops every attack's damage on the Bench, Swablu's Feathery only the
// opponent's; Dark Hole works from the Bench (attacks.ts); Wise Aura stops the Poké-Powers of every Pokémon but Pokémon-ex,
// both players' (powerActive); Mystic Scale stops Technical Machines being played and discards those in play (trainerError,
// refreshHideout); Rai-shield takes 30 off the opponent's Pokémon-ex's attacks on each of its player's Raichu ex, once each.
import { lookupCard } from '../cards.js';
import { isEnergyCardOf } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect } from '../powers.js';
import { pokemonName } from '../status.js';
import { babyEvolution, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { EX3_POWERS } from './ex3-powers.js';
import { EX5_POWERS } from './ex5-powers.js';
import { formChange } from './ex8-powers.js';

export const EX9_POWERS: Record<string, PowerEffect> = {
  // Blaziken – Blaze: with 40 HP or less left, 40 more to the Defending Pokémon.
  'ex9-1': { ...POKE_BODY, lowHpBoost: { hpLeft: 40, more: 40 } },
  // Deoxys, Deoxys ex – Form Change.
  'ex9-2': formChange('Deoxys'),
  'ex9-93': formChange('Deoxys ex'),
  // Gardevoir – Heal Dance: as Hidden Legends Bellossom's (one Heal Dance a turn, whichever).
  'ex9-4': EX5_POWERS['ex5-16']!,
  // Sceptile – Green Essence.
  'ex9-10': { ...POKE_BODY, greenEssence: 'grass' },
  // Swampert – Water Cyclone: any number of times, a Water Energy card from the Active Pokémon to one of the player's Benched Pokémon.
  'ex9-11': {
    blocked: (s) => (s.me.active?.energy.some((e) => !e.provides && isEnergyCardOf(e, s.cards, 'water')) && s.me.bench.some(Boolean) ? null : 'Your Active Pokémon has no Water Energy cards to move'),
    choices: (s) => [
      { kind: 'attachedEnergy', field: 'energyUid', options: s.me.active!.energy.filter((e) => !e.provides && isEnergyCardOf(e, s.cards, 'water')), prompt: 'Choose a Water Energy card attached to your Active Pokémon' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== 'active'), prompt: 'Choose the Benched Pokémon to move it to' },
    ],
    use(ctx) {
      const from = ctx.me.active;
      const to = ctx.choices.to === undefined || ctx.choices.to === 'active' ? null : pokemonAt(ctx.me, ctx.choices.to);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !to || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Claydol – Levitate: with any Energy attached, its Retreat Cost is 0.
  'ex9-24': freeRetreat((pokemon) => pokemon.energy.length > 0),
  // Minun – Electro-guard: with Lightning Energy attached, no Weakness.
  'ex9-37': { ...POKE_BODY, noWeaknessWith: 'lightning' },
  // Feebas – Submerge: on the Bench, no damage from any attack.
  'ex9-49': { ...POKE_BODY, benchImmuneAll: true },
  // Pichu – Baby Evolution.
  'ex9-59': babyEvolution('Pikachu'),
  // Swablu – Feathery: on the Bench, no damage from the opponent's attacks (as EX Dragon Whiscash's Submerge).
  'ex9-67': EX3_POWERS['ex3-48']!,
  // Altaria ex – Mist: 30 less from Stage 2 Pokémon's attacks, either player's.
  'ex9-90': { ...POKE_BODY, stage2Guard: 30 },
  // Cacturne ex – Cursed Glare (attachBlocked).
  'ex9-91': { ...POKE_BODY, cursedGlare: true },
  // Camerupt ex – Magma Armor: it can't be Asleep or Paralyzed.
  'ex9-92': { ...POKE_BODY, immuneTo: ['asleep', 'paralyzed'] },
  // Dusclops ex – Dark Hole.
  'ex9-94': { ...POKE_BODY, darkHole: true },
  // Medicham ex – Wise Aura.
  'ex9-95': { ...POKE_BODY, wiseAura: true },
  // Milotic ex – Mystic Scale.
  'ex9-96': { ...POKE_BODY, mysticScale: true },
  // Raichu ex – Rai-shield: 30 less from the opponent's Pokémon-ex.
  'ex9-97': { ...POKE_BODY, exReduction: 30 },
};
