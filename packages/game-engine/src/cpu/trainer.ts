import type { GameAction, GameState, PlayerId } from '../engine.js';
import {
  attackOptions,
  attackWith,
  attachTarget,
  benchAttackers,
  benchBasic,
  benched,
  chooseActive,
  damages,
  energyInHand,
  evolve,
  hpLeft,
  keepsBestAttack,
  play,
  resolveSearch,
  spareEnergy,
  strongestOf,
  stuckActive,
  switchOrRetreat,
  trainer,
  turnOf,
  type AttackOption,
  type Turn,
} from './shared.js';

/**
 * The 'trainer' CPU, for the fights that aren't gym leaders: a simpler gym leader that develops its
 * board and attacks, but doesn't plan around the player. On its turn, in order:
 *
 * 1. Bill (keeping cards to draw).
 * 2. Bench Basics and evolve (no Pokémon Breeder or Clefairy Doll).
 * 3. The turn's Energy attachment, aimed like the gym leader's. Then Professor Oak once the hand is down to 2 other cards.
 * 4. Potion on the Active Pokémon at 20+ damage, Super Potion at 40+ if it can still use its best attack.
 * 5. Retreat or Switch only when the Active Pokémon can't attack this turn or next and a benched one can now.
 * 6. Attack with whatever does the most damage, even if it costs Energy or hurts itself.
 *
 * Unlike the gym leader it never uses Pokémon Powers, searches its deck, plays Energy Removal, Gust of
 * Wind, PlusPower, Defender or the other Trainers, never thinks about what the player will do next turn,
 * and doesn't look for the cheapest Knock Out. After a Knock Out it promotes the Pokémon with the most HP left.
 */
export function trainerCpu(state: GameState, cpuId: PlayerId): GameAction | null {
  const cpu = state.players[cpuId];
  if (!cpu) throw new Error(`Unknown CPU player ${cpuId}`);

  switch (state.phase) {
    case 'setup':
      return chooseActive(state, cpu);
    case 'promote':
      return state.pendingPromotion === cpuId ? { type: 'PROMOTE', slot: promotion(state, cpuId) } : null;
    case 'playing': {
      // A choice can be the CPU's during the other player's turn (Computer Error, Chain Reaction).
      if (state.pendingChoice) {
        if (state.pendingChoice.player !== cpuId) return null;
        // After the player's Whirlwind, Ram…: the Pokémon it would promote after a Knock Out comes in.
        if (state.pendingChoice.kind === 'switchIn') return { type: 'RESOLVE_CHOICE', target: promotion(state, cpuId) };
        return resolveSearch(turnOf(state, cpuId));
      }
      if (state.currentPlayer !== cpuId) return null;
      const t = turnOf(state, cpuId);
      for (const step of STEPS) {
        const action = step(t);
        if (action) return action;
      }
      return { type: 'END_TURN' };
    }
    case 'finished':
      return null;
  }
}

const STEPS: ((t: Turn) => GameAction | null)[] = [bill, develop, attachEnergy, professorOak, heal, retreat, attack];

function bill(t: Turn): GameAction | null {
  return t.me.deck.length > 2 ? play(t, trainer(t, 'bill')) : null;
}

function develop(t: Turn): GameAction | null {
  return benchBasic(t) ?? evolve(t);
}

function attachEnergy(t: Turn): GameAction | null {
  if (t.state.energyAttachedThisTurn) return null;
  const pick = attachTarget(t, energyInHand(t), () => true);
  return pick ? { type: 'ATTACH_ENERGY', cardUid: pick.card.uid, target: pick.target } : null;
}

function professorOak(t: Turn): GameAction | null {
  const oak = trainer(t, 'professoroak');
  return oak && t.me.hand.length - 1 <= 2 && t.me.deck.length > 7 ? play(t, oak) : null;
}

/** Only the Active Pokémon gets healed. */
function heal(t: Turn): GameAction | null {
  const active = t.me.active;
  if (!active) return null;
  const superPotion = trainer(t, 'superpotion');
  if (superPotion && active.damage >= 40 && active.energy.length && keepsBestAttack(t, active)) {
    const action = play(t, superPotion, { target: 'active', energyUids: spareEnergy(t.state.cards, active, 1)!.map((e) => e.uid) });
    if (action) return action;
  }
  return active.damage >= 20 ? play(t, trainer(t, 'potion'), { target: 'active' }) : null;
}

function retreat(t: Turn): GameAction | null {
  if (!t.me.active || !benched(t).length || !stuckActive(t)) return null;
  const bench = benchAttackers(t);
  const ready = bench.filter((b) => damages(b.best));
  return ready.length ? switchOrRetreat(t, strongestOf(t.state.cards, ready).slot, bench) : null;
}

/** The most damage on average, whatever the attack costs. With no damage to do, any attack beats passing. */
function attack(t: Turn): GameAction | null {
  const options = attackOptions(t.state, t.id);
  if (!options.length) return null;
  return attackWith(options.reduce((a: AttackOption, b) => (b.expected > a.expected || (b.expected === a.expected && b.koChance > a.koChance) ? b : a)));
}

function promotion(state: GameState, id: PlayerId): number {
  const t = turnOf(state, id);
  return benched(t).reduce((a, b) => (hpLeft(state.cards, b[1]) > hpLeft(state.cards, a[1]) ? b : a))[0];
}
