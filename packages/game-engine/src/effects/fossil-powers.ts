// Fossil (base3) Pokémon Powers, by card id. Powers that are used stop working while their Pokémon is
// Asleep, Confused, Paralyzed, Poisoned or Burned (agreed; checked in powerError); the rest are flags the engine checks with
// powerActive, which also handles Toxic Gas. Cards 16–30 are the non-holo prints of 1–15.
// Rulings (agreed): a Transformed Ditto copies the Defending Pokémon's power too; Transparency flips
// against any attack, even its owner's; Kabuto Armor halves after weakness, resistance, PlusPower and Defender.
import { activeLock, type InPlayPokemon, type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { clearOnLeavingActive, inPlayDef, pokemonName } from '../status.js';

const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;
const theirs = (s: PowerSituation, t: Target) => pokemonAt(s.opp, t)!;
const hasDamage = (p: InPlayPokemon) => p.damage >= 10;

const HOLO: Record<string, PowerEffect> = {
  // Aerodactyl – Prehistoric Power: no more Evolution cards can be played.
  'base3-1': { blocksEvolution: true },

  // Ditto – Transform: as the active, a copy of the Defending Pokémon whose Energy counts as any type (refreshTransforms).
  'base3-3': { transform: true },

  // Dragonite – Step In: once during your turn, if Dragonite is on your Bench, switch it with your Active Pokémon.
  'base3-4': {
    oncePerTurn: true,
    blocked: (s) => (s.source === 'active' ? 'Dragonite must be on your Bench' : !s.me.active ? 'No Active Pokémon to switch with' : activeLock(s.me, [s.me, s.opp], s.cards)),
    use(ctx) {
      const old = ctx.me.active!;
      clearOnLeavingActive(old);
      ctx.me.bench[ctx.sourceTarget as number] = old;
      ctx.me.active = ctx.source;
      ctx.log(`${pokemonName(ctx.state, ctx.source)} switched in for ${pokemonName(ctx.state, old)}.`);
    },
  },

  // Gengar – Curse: once during your turn, move 1 damage counter from one of the opponent's Pokémon to another (it can Knock Out).
  'base3-5': {
    oncePerTurn: true,
    blocked(s) {
      const targets = ownTargets(s.opp);
      if (targets.length < 2) return 'Your opponent needs 2 Pokémon in play';
      return targets.some((t) => hasDamage(theirs(s, t))) ? null : "None of your opponent's Pokémon have damage counters";
    },
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [
        { kind: 'oppPokemon', field: 'oppFrom', options: ownTargets(s.opp).filter((t) => hasDamage(theirs(s, t))), prompt: 'Move a damage counter from' },
      ];
      if (c.oppFrom === undefined) return specs;
      return [...specs, { kind: 'oppPokemon', field: 'oppTo', options: ownTargets(s.opp).filter((t) => t !== c.oppFrom), prompt: 'Move it to' }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.opp, ctx.choices.oppFrom!)!;
      const to = pokemonAt(ctx.opp, ctx.choices.oppTo!)!;
      from.damage -= 10;
      to.damage += 10;
      ctx.log(`Moved a damage counter from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Haunter – Transparency: whenever an attack does anything to Haunter, flip; heads prevents all of it. Only Sleep stops it.
  'base3-6': { transparency: true, stopsOnlyWhileAsleep: true },

  // Muk – Toxic Gas: ignore all Pokémon Powers other than Toxic Gases.
  'base3-13': { toxicGas: true },
};

export const FOSSIL_POWERS: Record<string, PowerEffect> = {
  ...HOLO,
  ...Object.fromEntries(Object.entries(HOLO).map(([id, effect]) => [`base3-${Number(id.slice(6)) + 15}`, effect])),

  // Slowbro – Strange Behavior: as often as you like, move 1 damage counter from one of your Pokémon to Slowbro, if it doesn't Knock Out Slowbro.
  'base3-43': {
    blocked(s) {
      const slowbro = at(s, s.source);
      if (slowbro.damage + 10 >= inPlayDef(s.cards, slowbro).hp) return 'That would Knock Out Slowbro';
      return ownTargets(s.me).some((t) => t !== s.source && hasDamage(at(s, t))) ? null : 'None of your other Pokémon have damage counters';
    },
    choices: (s) => [
      { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => t !== s.source && hasDamage(at(s, t))), prompt: 'Move a damage counter to Slowbro from' },
    ],
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      from.damage -= 10;
      ctx.source.damage += 10;
      ctx.log(`Moved a damage counter from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },

  // Kabuto – Kabuto Armor: attack damage to Kabuto is halved, rounded down to the nearest 10.
  'base3-50': { halvesDamage: true },

  // Omanyte – Clairvoyance: your opponent plays with their hand face up.
  'base3-52': { revealsHand: true },

  // Tentacool – Cowardice: return Tentacool to your hand, discarding the cards attached to it. Not the turn it was put into play.
  'base3-56': {
    blocked(s) {
      if (at(s, s.source).playedTurn === s.turn) return "Tentacool can't use Cowardice the turn it was put into play";
      if (ownTargets(s.me).length < 2) return "You can't return your only Pokémon in play";
      return s.source === 'active' ? activeLock(s.me, [s.me, s.opp], s.cards) : null;
    },
    use(ctx) {
      const tentacool = ctx.source;
      // A Buzzap'd Electrode attached as Energy goes back to being a Pokémon card.
      ctx.me.discard.push(...tentacool.energy.map(({ provides: _, ...card }) => card), ...(tentacool.attached ?? []).map((a) => a.card), ...tentacool.evolvedFrom);
      ctx.me.hand.push(tentacool.card);
      if (ctx.sourceTarget === 'active') ctx.me.active = null;
      else ctx.me.bench[ctx.sourceTarget] = null;
      ctx.log(`${pokemonName(ctx.state, tentacool)} returned to the hand.`);
    },
  },
};
