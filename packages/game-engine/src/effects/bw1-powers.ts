// Black & White (bw1) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY): it works whatever its
// Pokémon's Special Conditions, and the older effects that stop Pokémon Powers, Poké-Powers or Poké-Bodies don't stop it.
// Agreed: Damage Swap may Knock Out the Pokémon a damage counter is moved to (as printed; Base Set Alakazam's limit isn't on it).
// From the text: Royal Heal heals each of its player's Pokémon between every two turns, once a Serperior; Inferno Fandango and
// Shift Gear take an Energy card of their type, basic or Special (energyCardOf), and can be used as often as the player likes.
import { lookupCard, type EnergyType } from '../cards.js';
import type { CardInstance, InPlayPokemon, Target } from '../engine.js';
import { energyFromHand, ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, countersMoved, inPlayDef, pokemonName } from '../status.js';
import { ABILITY } from './common.js';
import { energyCardOf } from './ex2.js';

const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;

/** An Energy card of `type` (basic or Special) in the hand. */
const handEnergy = (s: PowerSituation, type: EnergyType) => s.me.hand.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy' && energyCardOf(s.cards, c, type));

/** "Move a [type] Energy attached to 1 of your Pokémon to another of your Pokémon" (Shift Gear), as often as the player likes. */
function moveTyped(type: EnergyType, label: string): PowerEffect {
  const typed = (s: PowerSituation, t: Target) => at(s, t).energy.filter((e: CardInstance) => energyCardOf(s.cards, e, type));
  return {
    ...ABILITY,
    blocked(s) {
      if (ownTargets(s.me).length < 2) return 'You need another Pokémon to move Energy to';
      return ownTargets(s.me).some((t) => typed(s, t).length) ? null : `None of your Pokémon have ${label} Energy`;
    },
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => typed(s, t).length), prompt: `Take a ${label} Energy from` }];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: typed(s, c.from), prompt: `Choose the ${label} Energy` },
        { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Move it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved a ${label} Energy from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  };
}

export const BW1_POWERS: Record<string, PowerEffect> = {
  // Serperior – Royal Heal: between turns, 10 damage off each of its player's Pokémon.
  'bw1-6': {
    ...ABILITY,
    checkup(state, owner) {
      const healed = [owner.active, ...owner.bench].filter((p): p is InPlayPokemon => !!p && p.damage > 0);
      for (const p of healed) p.damage = Math.max(0, p.damage - 10);
      if (healed.length) addLog(state, 'Royal Heal: healed 10 damage from each of your Pokémon.', owner.id);
    },
  },

  // Emboar – Inferno Fandango: a Fire Energy card from the hand onto any of the player's Pokémon, as often as they like.
  'bw1-20': {
    ...ABILITY,
    blocked: (s) => (handEnergy(s, 'fire').length ? null : 'No Fire Energy in your hand'),
    choices: (s) => [
      { kind: 'handCard', field: 'cardUid', options: handEnergy(s, 'fire'), prompt: 'Choose a Fire Energy from your hand' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me), prompt: 'Attach it to' },
    ],
    use(ctx) {
      const i = ctx.me.hand.findIndex((c) => c.uid === ctx.choices.cardUid);
      const [energy] = ctx.me.hand.splice(i, 1);
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      to.energy.push(energy!);
      ctx.log(`Attached a Fire Energy to ${pokemonName(ctx.state, to)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, energy!);
    },
  },

  // Samurott – Shell Armor: attack damage to it 20 less, after Weakness and Resistance.
  'bw1-32': { ...ABILITY, damageReduction: 20 },

  // Reuniclus – Damage Swap: a damage counter from one of the player's Pokémon to another, as often as they like; it may
  // Knock Out the one taking it (agreed). Once both are picked, all of them or 1 (moving several is using it several times).
  'bw1-57': {
    ...ABILITY,
    blocked: (s) => (ownTargets(s.me).some((t) => at(s, t).damage >= 10) ? null : 'None of your Pokémon have damage counters'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => at(s, t).damage >= 10), prompt: 'Move a damage counter from' }];
      if (c.from === undefined) return specs;
      specs.push({ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Move it to' });
      if (c.to === undefined) return specs;
      const counters = Math.floor(at(s, c.from).damage / 10);
      if (counters < 2) return specs;
      return [...specs, { kind: 'counters', field: 'counters', options: [counters, 1], all: true, prompt: `Move all ${counters} damage counters to ${inPlayDef(s.cards, at(s, c.to)).name}` }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const n = Math.min(Math.max(1, ctx.choices.counters ?? 1), Math.floor(from.damage / 10));
      from.damage -= 10 * n;
      countersMoved(ctx.state, from, 10 * n);
      to.damage += 10 * n;
      ctx.log(`Moved ${n === 1 ? 'a damage counter' : `${n} damage counters`} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Klinklang – Shift Gear: a Metal Energy from one of the player's Pokémon to another, as often as they like.
  'bw1-76': moveTyped('metal', 'Metal'),
};
