// Base Set (base1) Pokémon Powers, by card id. Each stops working while its Pokémon is Asleep,
// Confused, Paralyzed, Poisoned or Burned (agreed; checked in powerError, and by Strikes Back itself).
import { lookupCard, typeName, type EnergyType } from '../cards.js';
import { isEnergyCardOf, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { energyFromHand, ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { clearOnLeavingActive, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';

const def = (s: PowerSituation, p: InPlayPokemon) => inPlayDef(s.cards, p);
const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;

/**
 * Damage Swap: the most damage counters that can go from one Pokémon to another without Knocking Out the one taking
 * them (`most`), and whether that's all of them (`all`).
 */
function swapLimit(from: InPlayPokemon, to: InPlayPokemon, hp: number) {
  const counters = Math.floor(from.damage / 10);
  const room = Math.floor((hp - 1 - to.damage) / 10);
  return { most: Math.max(0, Math.min(counters, room)), all: room >= counters };
}
const swappable = (s: PowerSituation, from: Target, to: Target) => swapLimit(at(s, from), at(s, to), def(s, at(s, to)).hp);
/** A basic Energy card of `type` (Rain Dance and Energy Trans move Energy cards, not Buzzap'd Electrodes). */
const isEnergyCard = (s: PowerSituation, c: CardInstance, type: EnergyType) => {
  const d = lookupCard(s.cards, c.defId);
  return !c.provides && d.kind === 'energy' && d.energyType === type;
};

/** Types Buzzap can turn Electrode into. */
const ENERGY_TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal'];

export const BASE1_POWERS: Record<string, PowerEffect> = {
  // Alakazam – Damage Swap: move 1 damage counter between your Pokémon, as long as it doesn't Knock Out the one receiving it.
  // As it can be used as often as you like, moving several at once is the same as using it several times: once both
  // Pokémon are picked, if more than 1 counter can go, it asks whether to move them all (or as many as the receiving
  // Pokémon can take without being Knocked Out), or just 1.
  'base1-1': {
    blocked: (s) => (ownTargets(s.me).some((t) => at(s, t).damage >= 10) ? null : 'None of your Pokémon have damage counters'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => at(s, t).damage >= 10), prompt: 'Move a damage counter from' },
      ];
      if (c.from === undefined) return specs;
      const to = ownTargets(s.me).filter((t) => t !== c.from && at(s, t).damage + 10 < def(s, at(s, t)).hp);
      specs.push({ kind: 'ownPokemon', field: 'to', options: to, prompt: 'Move it to' });
      if (c.to === undefined || !to.includes(c.to)) return specs;
      const { all, most } = swappable(s, c.from, c.to);
      if (most < 2) return specs;
      const name = def(s, at(s, c.to)).name;
      const prompt = all ? `Move all ${most} damage counters to ${name}` : `Move as many damage counters as ${name} can take (${most} of ${at(s, c.from).damage / 10})`;
      return [...specs, { kind: 'counters', field: 'counters', options: [most, 1], all, prompt }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      // Never more than can go (the question is only asked when more than 1 can).
      const n = Math.min(Math.max(1, ctx.choices.counters ?? 1), swapLimit(from, to, inPlayDef(ctx.state.cards, to).hp).most);
      from.damage -= 10 * n;
      to.damage += 10 * n;
      ctx.log(`Moved ${n === 1 ? 'a damage counter' : `${n} damage counters`} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Blastoise – Rain Dance: attach a Water Energy card from your hand to a Water Pokémon, without using the turn's attachment.
  'base1-2': {
    blocked(s) {
      if (!s.me.hand.some((c) => isEnergyCard(s, c, 'water'))) return 'No Water Energy in your hand';
      return ownTargets(s.me).some((t) => def(s, at(s, t)).type === 'water') ? null : 'No Water Pokémon to attach to';
    },
    choices: (s) => [
      { kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => isEnergyCard(s, c, 'water')), prompt: 'Choose a Water Energy from your hand' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => def(s, at(s, t)).type === 'water'), prompt: 'Attach it to' },
    ],
    use(ctx) {
      const i = ctx.me.hand.findIndex((c) => c.uid === ctx.choices.cardUid);
      const [energy] = ctx.me.hand.splice(i, 1);
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      to.energy.push(energy!);
      ctx.log(`Attached a Water Energy to ${pokemonName(ctx.state, to)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, energy!);
    },
  },

  // Charizard – Energy Burn: all Energy attached to Charizard is Fire for the rest of the turn.
  'base1-4': {
    blocked: (s) => (at(s, s.source).effects?.energyBurn !== undefined ? "Charizard's Energy is already Fire this turn" : null),
    use(ctx) {
      (ctx.source.effects ??= {}).energyBurn = ctx.state.turn;
      ctx.log('All Energy attached to Charizard is Fire Energy this turn.');
    },
  },

  // Machamp – Strikes Back: 10 damage to the attacking Pokémon whenever an attack damages Machamp (no weakness or resistance).
  'base1-8': {
    onAttackDamage(ctx, machamp) {
      if (hasSpecialCondition(machamp)) return; // Already affected by a Special Condition when attacked.
      ctx.attacker.damage += 10;
      ctx.log(`Strikes Back: ${ctx.attackerDef.name} took 10 damage.`);
    },
  },

  // Venusaur – Energy Trans: move a Grass Energy card from one of your Pokémon to another.
  'base1-15': {
    blocked(s) {
      if (ownTargets(s.me).length < 2) return 'You need another Pokémon to move Energy to';
      return ownTargets(s.me).some((t) => at(s, t).energy.some((e) => isEnergyCardOf(e, s.cards, 'grass'))) ? null : 'None of your Pokémon have Grass Energy';
    },
    choices(s, c) {
      // Rainbow Energy counts as Grass while attached.
      const grass = (t: Target) => at(s, t).energy.filter((e) => isEnergyCardOf(e, s.cards, 'grass'));
      const specs: PowerChoiceSpec[] = [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => grass(t).length > 0), prompt: 'Take a Grass Energy from' },
      ];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: grass(c.from), prompt: 'Choose the Grass Energy' },
        { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Attach it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved a Grass Energy from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Electrode – Buzzap: Knock Out Electrode and attach it to another of your Pokémon as an Energy card providing 2 of a chosen type.
  'base1-21': {
    blocked: (s) => (ownTargets(s.me).length < 2 ? 'You need another Pokémon to attach Electrode to' : null),
    choices: (s) => [
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== s.source), prompt: 'Attach Electrode to' },
      { kind: 'type', field: 'type', options: ENERGY_TYPES, prompt: 'Choose the type of Energy it becomes' },
    ],
    use(ctx) {
      const electrode = ctx.source;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const type = ctx.choices.type!;
      // Electrode is Knocked Out: the cards under it and its Energy go to the discard pile, and the opponent takes a prize.
      ctx.me.discard.push(...electrode.evolvedFrom, ...electrode.energy, ...(electrode.attached ?? []).map((a) => a.card));
      clearOnLeavingActive(electrode);
      to.energy.push({ ...electrode.card, provides: { type, amount: 2 } });
      if (ctx.sourceTarget === 'active') ctx.me.active = null;
      else ctx.me.bench[ctx.sourceTarget] = null;
      const prize = ctx.opp.prizes.pop();
      if (prize) ctx.opp.hand.push(prize);
      ctx.log(`Electrode was Knocked Out and attached to ${pokemonName(ctx.state, to)} as 2 ${typeName(type)} Energy.`);
    },
  },
};
