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
  professorOak,
  resolveSearch,
  borrowedTrainerMove,
  spareEnergy,
  strongestOf,
  stuckActive,
  switchOrRetreat,
  trainer,
  tryAction,
  turnOf,
  withAttackMemo,
  type AttackOption,
  type Turn,
} from './shared.js';
import { bestMove, plainEnergy, specialAttachment, type Allowed } from './evaluate.js';

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
 * After step 2 it also plays a short list of simple Trainers (TRAINER_CPU_PLAYS: draw, search, healing, Pokémon Tools, from
 * each generation, enough for its random decks) whenever the generic judgement (evaluate.ts) finds they leave a better
 * position, and in step 3 its special Energy (TRAINER_CPU_ENERGY) where that does better than basic Energy.
 *
 * Unlike the gym leader it never uses Pokémon Powers or Stadiums, plays Energy Removal, Gust of Wind, PlusPower,
 * Defender, Technical Machines or the other Trainers, never thinks about what the player will do next turn, and doesn't
 * look for the cheapest Knock Out. After a Knock Out it promotes the Pokémon with the most HP left.
 */
export function trainerCpu(state: GameState, cpuId: PlayerId): GameAction | null {
  return withAttackMemo(() => decide(state, cpuId));
}

function decide(state: GameState, cpuId: PlayerId): GameAction | null {
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
        if (state.pendingChoice.kind === 'borrowedTrainer') return borrowedTrainerMove(state, cpuId, trainerCpu);
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

/**
 * The Trainers it plays besides its own rules (agreed with the user: the Trainer CPU gets the simple ones, by nameKey).
 * Gen 1 first, then Gen 2, then Gen 3.
 */
export const TRAINER_CPU_PLAYS = new Set([
  'fullheal', 'energyretrieval', 'energysearch', 'pokeball', 'maintenance', 'revive', 'pokemontrader', 'brock', 'erika',
  'masterball', 'goodmanners', 'mistystears', 'fervor',
  'professorelm', 'professoroaksresearch', 'billsteleporter', 'mary', 'mailfrombill', 'energyark', 'moomoomilk', 'berry',
  'goldberry', 'miracleberry', 'focusband', 'hyperpotion', 'superenergyretrieval', 'copycat', 'marysimpulse',
  'pokemonfanclub', 'professorelmstrainingmethod', 'dualball', 'fastball', 'energyswitch', 'healingberry',
  'billsmaintenance', 'energyrestore',
  'professorbirch', 'stevensadvice', 'greatball', 'lanettesnetsearch', 'tvreporter', 'celiosnetwork', 'oranberry', 'lumberry',
  'sitrusberry', 'doublefullheal', 'bufferpiece',
]);

/** The Trainers its own rules play (steps 1, 3, 4 and 5), by nameKey. */
export const TRAINER_CPU_RULES = new Set(['bill', 'professoroak', 'potion', 'superpotion', 'switch']);

/** The special Energy it attaches besides Double Colorless, by nameKey. */
export const TRAINER_CPU_ENERGY = new Set(['potionenergy', 'fullhealenergy', 'rainbowenergy', 'recycleenergy', 'multienergy', 'healenergy']);

const ALLOWED: Allowed = { trainers: (key) => TRAINER_CPU_PLAYS.has(key) };

const STEPS: ((t: Turn) => GameAction | null)[] = [bill, develop, others, attachEnergy, professorOak, heal, retreat, attack];

function bill(t: Turn): GameAction | null {
  return t.me.deck.length > 2 ? play(t, trainer(t, 'bill')) : null;
}

function develop(t: Turn): GameAction | null {
  return benchBasic(t) ?? evolve(t);
}

/** Its other Trainers, when they leave a better position. */
function others(t: Turn): GameAction | null {
  return bestMove(t, ALLOWED);
}

function attachEnergy(t: Turn): GameAction | null {
  if (t.state.energyAttachedThisTurn) return null;
  const pick = attachTarget(t, energyInHand(t).filter((c) => plainEnergy(t, c)), () => true);
  const action: GameAction | null = pick && { type: 'ATTACH_ENERGY', cardUid: pick.card.uid, target: pick.target };
  return specialAttachment(t, action && tryAction(t.state, t.id, action) ? action : null, (key) => TRAINER_CPU_ENERGY.has(key));
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
