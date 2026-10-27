// Pokémon Platinum's Super Contests (README: Super Contests), ported from the pret/pokeplatinum decompilation: a Visual
// Competition (dressing up with accessories, judged on condition and the theme), a Dance Competition (each contestant
// leading a dance the others copy, judged on the beat) and an Acting Competition (4 turns of moves shown to 3 judges,
// with Voltage), their scores combined into the placing; the winner takes the rank's ribbon. The player is contestant
// 0 and the 3 CPU entrants 1-3, as in the game. The function names in the comments are the decompilation's.
//
// Randomness is the game's: one LCRNG (LCRNG_Next, s·1103515245 + 24691, the high 16 bits) for the contest, and each CPU
// dancer's own (Contest_GetSeededRNGNext, s·1812433253 + 1), seeded from it at each lead's turn. The game also advances
// its LCRNG once a frame through the dance and reseeds it from the clock (Contest_Init); here it's seeded once from the
// server, so the numbers match the game's rules, not its exact draws.
import { CONTEST_EFFECTS, CONTEST_ENTRANTS, CONTEST_MOVES, CONTEST_SCARVES, ACTING_AI, THEME_POINTS, type ContestEntrantData } from './contest-data.js';
import { conditionOf, type Condition } from './condition.js';

export const CONTEST_CATEGORIES = ['Cool', 'Beauty', 'Cute', 'Smart', 'Tough'] as const;
export const CONTEST_RANKS = ['Normal', 'Great', 'Ultra', 'Master'] as const;
/** The judges in their seats (sub_020954F0 always seats them so): 0 Jordan, 1 Dexter (the main judge, unk_10E), 2 Keira. */
export const JUDGES = ['Jordan', 'Dexter', 'Keira'] as const;
export const MAIN_JUDGE = 1;
export const CONTESTANTS = 4;
/** The player's contestant id (playerContestantID: offline, always 0). */
export const PLAYER = 0;

/** The game's LCRNG: the next 16-bit number, and the state after it. */
export function lcrng(state: number): [number, number] {
  const next = (Math.imul(state, 1103515245) + 24691) >>> 0;
  return [next >>> 16, next];
}

/** A CPU dancer's own RNG (Contest_GetSeededRNGNext). */
function seededNext(state: number): [number, number] {
  const next = (Math.imul(state, 1812433253) + 1) >>> 0;
  return [next >>> 16, next];
}

/** A move's contest category and effect (CONTEST_MOVES), by the Idle Adventure's key or Platinum's. */
const MOVE_ALIASES: Record<string, string> = { smokescreen: 'smoke-screen', 'self-destruct': 'selfdestruct', 'soft-boiled': 'softboiled' };
export function contestMove(key: string): { name: string; category: number; effect: number } | null {
  const m = CONTEST_MOVES[MOVE_ALIASES[key] ?? key];
  return m ? { name: m[0], category: m[1], effect: m[2] } : null;
}

const E = Object.fromEntries(CONTEST_EFFECTS.map((e, i) => [e.id, i])) as Record<string, number>;
const effectPoints = (effect: number) => CONTEST_EFFECTS[effect]?.points ?? 0;

export interface ContestEntrant {
  species: number;
  /** Its nickname (the CPU's; the player's Pokémon goes by its species' name). */
  name: string;
  trainer: string;
  /** 1-4 moves (a dex entry's chosen contest moves, a CPU's record's). */
  moves: string[];
  condition: Condition;
  /** The CPU's AI level (unk_FC, 0-3); the player's 0. */
  ai: number;
  /** Its accessories worn in the Visual Competition (the CPU's dress set; the player's chosen in the dressing room). */
  outfit: number[];
  /** The CPU's record (CONTEST_ENTRANTS' index), for its outfit's places. */
  npc?: number;
  /** Its held item (a CONTEST_SCARVES key, the player's choice; the CPUs hold none, sub_02095380). */
  item?: string | null;
}

export interface VisualScore {
  /** ov17_0223F374: the primary condition plus half the two next to it and the sheen. */
  condition: number;
  /** ov17_0223F334: the outfit's points for the theme. */
  themePoints: number;
  hearts: number;
  stars: number;
}

export interface DanceStep {
  contestant: number;
  /** The frame in its cycle (30 a second) it was pressed on. */
  frame: number;
  /** 1 Jump, 2 Front, 3 Left, 4 Right (ov17_0224DD28). */
  move: number;
  /** Its half-beat in the cycle (ov17_0224DDE4), as the game keeps it (a byte). */
  index: number;
  grade: 'excellent' | 'good' | 'miss';
}

/** What each acting performance did, for the screen. */
export interface Performance {
  contestant: number;
  move: string;
  judge: number;
  /** The move's own appeal (its effect's base and what the effect added, doubled by a Double Next Turn), in tenths of a heart. */
  appeal: number;
  /** The judge's Voltage after it (before a full one empties). */
  voltage: number;
  /** +10 or −10 for its category, 0 for neither or when stopped. */
  voltageChange: number;
  /** The Voltage bonus (5 hearts, 8 for the main judge). */
  maxVoltage: number;
}

export interface ActingTurn {
  order: number[];
  performances: Performance[];
  /** The bonus for each contestant's judge being chosen by fewer of the others (+3/+2/+1/0 hearts). */
  judgeBonus: number[];
  /** The effects scored at the turn's end (Doubled Judge, Unique Judge, All Same Judge, Pity Points). */
  endBonus: number[];
  /** Each contestant's score this turn. */
  scores: number[];
}

/** One turn's state carried into the next (unk_220.unk_30's flags: who doubles, who may repeat a move, where they go). */
interface TurnFlags {
  /** unk_28_12: Double Next Turn used. */
  doubled: number[];
  /** unk_A0's move: the move a Consecutive Use made repeatable. */
  repeatable: (string | null)[];
  /** unk_28_4 (0 none, 1 first, 2 last, 3 random) and unk_28_6 (its slot). */
  orderKind: number[];
  orderSlot: number[];
}

export interface ActingState {
  turn: number;
  /** This turn's performing order (unk_220.unk_01). */
  order: number[];
  /** Each judge's Voltage (unk_220.unk_22): 0-40 in tens. */
  voltage: number[];
  /** Each contestant's acting total (unk_220.unk_12). */
  totals: number[];
  /** Last turn's scores (unk_220.unk_1A) and moves (unk_220.unk_26). */
  lastScores: number[];
  lastMoves: (string | null)[];
  /** unk_220.unk_0E: last turn's judges. */
  lastJudges: number[];
  /** Last turn's flags (unk_220.unk_30); the turn before's doubling (the AI's condition 2 reads it a turn late). */
  flags: TurnFlags | null;
  doubledBefore: number[];
  turns: ActingTurn[];
}

export interface ContestResult {
  /** Each round's points (ov17_02251930), each contestant's bars summed (unk_7A), and the placings (0 the winner). */
  points: number[][];
  total: number[];
  placing: number[];
}

export interface ContestState {
  version: number;
  rank: number;
  category: number;
  /** The Visual Competition's theme (sub_02095A74). */
  theme: number;
  /** The contest's LCRNG state. */
  rng: number;
  entrants: ContestEntrant[];
  phase: 'visual' | 'dance' | 'acting' | 'results';
  visual?: VisualScore[];
  /** The dance's CPU seeds per lead's turn (unk_A6C.unk_14), then its steps and scores once danced. */
  danceSeeds?: number[][];
  dance?: { steps: DanceStep[][]; score: number[] };
  acting?: ActingState;
  result?: ContestResult;
}

function draw(state: ContestState): number {
  const [v, s] = lcrng(state.rng);
  state.rng = s;
  return v;
}

// --- Entering --------------------------------------------------------------------------------------------------------

/** A Pokémon may enter a rank of a category with as many ribbons of the category as the rank's index, knowing 2 moves (party_menu/main.c). */
export function canEnter(ribbons: readonly string[], category: number, rank: number, moves: number) {
  if (moves < 2) return 'It must know at least 2 moves';
  for (let r = 0; r < rank; r++) if (!ribbons.includes(ribbonId(category, r))) return `It needs the ${CONTEST_CATEGORIES[category]} ${CONTEST_RANKS[r]} Rank ribbon first`;
  return null;
}

/** A ribbon's id ("cool-normal"), as IdleDex.ribbons keeps them. */
export const ribbonId = (category: number, rank: number) => `${CONTEST_CATEGORIES[category]!.toLowerCase()}-${CONTEST_RANKS[rank]!.toLowerCase()}`;

/**
 * The 3 CPU entrants (sub_02094F04, an official contest): the records of the rank and category, neither practice nor
 * single-round ones, past the post-game gate (after the game: no pre-game-only records; before: no post-game ones), three
 * at random, and a post-game special one (Fantina, Johanna, Jasmine) put in one of their places at random when any can be.
 */
export function pickEntrants(state: ContestState, postgame: boolean): number[] {
  const list = CONTEST_ENTRANTS.flatMap((n, i) => {
    if (n.rank !== state.rank) return [];
    if (postgame ? n.postgame === 1 : n.postgame === 2 || n.postgame === 3) return [];
    if (n.practice || n.official) return [];
    return n.categories >> state.category & 1 ? [i] : [];
  });
  if (list.length < 3) throw new Error('Not enough entrants for that contest');
  const specials = list.filter((i) => CONTEST_ENTRANTS[i]!.postgame === 3);
  const special = specials.length ? specials[draw(state) % specials.length]! : null;
  const picked: number[] = [];
  const left = [...list];
  while (picked.length < 3) {
    const at = draw(state) % left.length;
    if (CONTEST_ENTRANTS[left[at]!]!.postgame === 3) continue;
    picked.push(left.splice(at, 1)[0]!);
  }
  if (special !== null) picked[draw(state) % 3] = special;
  return picked;
}

const npcEntrant = (i: number): ContestEntrant => {
  const n: ContestEntrantData = CONTEST_ENTRANTS[i]!;
  return { species: n.species, name: n.nickname, trainer: n.trainer, moves: [...n.moves], condition: conditionOf(n.condition), ai: n.ai, outfit: n.outfit.map((o) => o[0]), npc: i };
};

/** The Visual Competition's theme (sub_02095A74): any at Master; otherwise Created, Natural or Colorful, more from Great and Ultra up. */
function pickTheme(state: ContestState): number {
  if (state.rank === 3) return draw(state) % 12;
  const pool = [2, 3, 4, ...(state.rank >= 1 ? [0, 1, 5] : []), ...(state.rank >= 2 ? [6, 7, 8] : [])];
  return pool[draw(state) % pool.length]!;
}

/** A new contest: the CPU entrants picked and the theme drawn; the player dresses up first. */
export function createContest(opts: { rank: number; category: number; player: Omit<ContestEntrant, 'ai' | 'outfit' | 'npc'>; postgame: boolean }, seed: number): ContestState {
  const state: ContestState = { version: 0, rank: opts.rank, category: opts.category, theme: 0, rng: seed >>> 0, entrants: [], phase: 'visual' };
  const npcs = pickEntrants(state, opts.postgame);
  state.entrants = [{ ...opts.player, ai: 0, outfit: [] }, ...npcs.map(npcEntrant)];
  state.theme = pickTheme(state);
  return state;
}

// --- The Visual Competition ------------------------------------------------------------------------------------------

/** How many accessories may be worn at each rank (ov22_02255D44). */
export const ACCESSORY_LIMIT = [5, 10, 15, 20] as const;
/** How long the dressing lasts, in seconds (ov22_0225A428: 60 × 30 frames). */
export const DRESS_SECONDS = 60;
/** Accessories 0-60 come up to 9 to a Fashion Case, 61-99 one each. */
export const accessoryCopies = (id: number) => (id < 61 ? 9 : 1);

/** Why an outfit can't be worn, or null. */
export function outfitError(rank: number, outfit: readonly number[]) {
  if (outfit.length > ACCESSORY_LIMIT[rank]!) return `At most ${ACCESSORY_LIMIT[rank]} accessories`;
  const counts = new Map<number, number>();
  for (const id of outfit) {
    if (!Number.isInteger(id) || id < 0 || id > 99) return 'Unknown accessory';
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (counts.get(id)! > accessoryCopies(id)) return 'Too many of one accessory';
  }
  return null;
}

/** The condition next to each category's on either side (ov17_0223F374): Cool's Tough and Beauty, Beauty's Cool and Cute… */
const SECONDARY = [[4, 1], [0, 2], [1, 3], [2, 4], [3, 0]] as const;
const HEARTS = [[10, 20, 30, 40, 50, 60, 70, 80], [90, 110, 130, 150, 170, 190, 210, 230], [170, 200, 230, 260, 290, 320, 350, 380], [320, 360, 400, 440, 480, 520, 560, 600]];
const STARS = [[3, 5, 8], [5, 10, 15], [7, 15, 23], [10, 20, 30]];

/**
 * A held scarf's share of the condition score (ov17_0223F374): ×1.10 for the contest's own category's, ×1.05 for the
 * two categories beside it (Cool's Blue and Yellow, Beauty's Red and Pink…), else ×1.
 */
export function scarfModifier(category: number, item: string | null | undefined) {
  const i = CONTEST_SCARVES.findIndex((s) => s.key === item);
  if (i < 0) return 100;
  return i === category ? 110 : SCARF_NEIGHBOURS[category]!.includes(i) ? 105 : 100;
}
const SCARF_NEIGHBOURS = [[1, 4], [0, 2], [1, 3], [2, 4], [3, 0]];

/** A contestant's Visual Competition score: its condition's hearts (sub_02095928, its scarf's share in) and its outfit's stars (sub_0209598C). */
export function visualScore(rank: number, category: number, theme: number, condition: Condition, outfit: readonly number[], item?: string | null): VisualScore {
  const [a, b] = SECONDARY[category]!;
  const score = Math.trunc(((condition[category]! + Math.trunc((condition[a]! + condition[b]! + condition[5]) / 2)) * scarfModifier(category, item)) / 100);
  const themePoints = outfit.reduce((sum, id) => sum + (THEME_POINTS[theme]?.[id] ?? 0), 0);
  const hearts = HEARTS[rank]!.filter((t) => score >= t).length;
  const [s1, s2, s3] = STARS[rank]!;
  const stars = !themePoints ? 0 : themePoints <= s1! ? 1 : themePoints <= s2! ? 2 : themePoints <= s3! ? 3 : 4;
  return { condition: score, themePoints, hearts, stars };
}

const visualRaw = (v: VisualScore) => v.hearts + v.stars;

/** The player has dressed up: every contestant's Visual Competition score, and on to the dance (its CPU seeds drawn). */
export function finishVisual(state: ContestState, outfit: readonly number[]): ContestState | { error: string } {
  if (state.phase !== 'visual') return { error: 'The Visual Competition is over' };
  const error = outfitError(state.rank, outfit);
  if (error) return { error };
  const next: ContestState = structuredClone(state);
  next.entrants[PLAYER]!.outfit = [...outfit];
  next.visual = next.entrants.map((e) => visualScore(next.rank, next.category, next.theme, e.condition, e.outfit, e.item));
  // ov17_0223EBB0, at each lead's turn: a seed for each CPU dancer.
  next.danceSeeds = Array.from({ length: CONTESTANTS }, () => Array.from({ length: CONTESTANTS }, (_, c) => (c === PLAYER ? 0 : draw(next))));
  next.phase = 'dance';
  next.version++;
  return next;
}

// --- The Dance Competition -------------------------------------------------------------------------------------------

/** Unk_ov17_02253084's tempos: the song, its BPM, cycles a turn, steps a lead dances, intro and gap beats, and the grading's frames. */
export const DANCE_SONGS = [
  { song: 'SEQ_CO_KASHI', bpm: 120, cycles: 2, steps: 3, intro: 4, gap: 4, grades: [2, 2, 3, 3] },
  { song: 'SEQ_CO_TAKUMA', bpm: 120, cycles: 2, steps: 4, intro: 4, gap: 4, grades: [2, 2, 3, 3] },
  { song: 'SEQ_PL_MTKAKKO', bpm: 100, cycles: 2, steps: 4, intro: 3, gap: 3, grades: [1, 1, 2, 2] },
  { song: 'SEQ_PL_MTUTSUK', bpm: 60, cycles: 2, steps: 4, intro: 3, gap: 3, grades: [2, 2, 3, 3] },
  { song: 'SEQ_PL_MTKAWA', bpm: 150, cycles: 2, steps: 4, intro: 4, gap: 4, grades: [1, 1, 2, 2] },
  { song: 'SEQ_PL_MTKASHI', bpm: 132, cycles: 2, steps: 4, intro: 4, gap: 4, grades: [1, 1, 2, 2] },
  { song: 'SEQ_PL_MTTAKMA', bpm: 140, cycles: 2, steps: 4, intro: 4, gap: 4, grades: [1, 1, 2, 2] },
] as const;
/** Unk_ov17_02252FC4: beats a cycle (half the lead's, half the copy). */
const STAGE_BEATS = [16, 12];
/** Unk_ov17_0225312C: the tempo and stage of each rank and category (Normal and Great one each; Ultra and Master by category). */
const DANCE_PICK = [[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]], [[2, 1], [3, 1], [4, 0], [5, 0], [6, 0]], [[2, 1], [3, 1], [4, 0], [5, 0], [6, 0]]];
/** The order the contestants lead in (unk_A3C.unk_00: 3, 2, 1, then the player). */
export const DANCE_LEADS = [3, 2, 1, 0];

export interface DanceTiming {
  song: string;
  bpm: number;
  stage: number;
  /** Steps a dancer may make a cycle. */
  steps: number;
  /** A beat, in frames × 10000 (unk_A3C.unk_18). */
  beat: number;
  /** A cycle, in frames (unk_A3C.unk_1C). */
  cycleFrames: number;
  /** Half-beats a cycle. */
  halfBeats: number;
  cycles: number;
  /** Each lead's turn's first frame from the song's start (ov17_0224C660). */
  turnStarts: number[];
  /** Frames after a press before the next (ov17_0224DC1C's unk_05, the CPUs' unk_34). */
  cooldown: number;
  /** The last frame a press counts on, of the lead's half and the copy's (ov17_0224CFB8: a quarter beat before each half's end). */
  leadUntil: number;
  copyUntil: number;
  grades: readonly number[];
}

/** The dance's tempo and timeline for a rank and category (ov17_0223E9A4). */
export function danceTiming(rank: number, category: number): DanceTiming {
  const [row, stage] = DANCE_PICK[rank]![category]! as [number, number];
  const t = DANCE_SONGS[row]!;
  const beat = Math.trunc((60 * 30 * 10000) / t.bpm);
  const cycleFrames = Math.trunc((beat * STAGE_BEATS[stage]! + 5000) / 10000);
  const intro = beat * t.intro;
  const gap = beat * t.gap;
  const quarter = Math.trunc(Math.trunc(Math.trunc(beat / 2) / 2) / 10000);
  return {
    song: t.song,
    bpm: t.bpm,
    stage,
    steps: t.steps,
    beat,
    cycleFrames,
    halfBeats: STAGE_BEATS[stage]! * 2,
    cycles: t.cycles,
    turnStarts: [0, 1, 2, 3].map((r) => cycleFrames * t.cycles * r + Math.trunc(((intro + gap) * r + intro) / 10000)),
    cooldown: Math.trunc(beat / 10000) - 2,
    leadUntil: Math.trunc(cycleFrames / 2) - quarter,
    copyUntil: cycleFrames - quarter,
    grades: t.grades,
  };
}

/** The nearest half-beat to a frame and how far it is (ov17_0224DDE4). */
function nearestHalfBeat(frame: number, beat: number): { distance: number; index: number } {
  const at = frame * 10000;
  const half = Math.trunc(beat / 2);
  let before = 0;
  let count = 0;
  let g = 0;
  for (; g < at; g += half) {
    before = g;
    count++;
  }
  const b = Math.trunc((before + 5000) / 10000);
  const a = Math.trunc((g + 5000) / 10000);
  const db = Math.abs(frame - b);
  const da = Math.abs(frame - a);
  return db <= da ? { distance: db, index: count - 1 } : { distance: da, index: count };
}

/**
 * A step judged (ov17_0224DE54): Excellent within the grades' second frame count of a half-beat, Good within the
 * fourth, otherwise a Miss. A copying dancer must step on the lead's step's half-beat a half cycle on, the same way.
 */
function judgeStep(t: DanceTiming, contestant: number, frame: number, move: number, lead: readonly DanceStep[] | null): DanceStep {
  const { distance, index } = nearestHalfBeat(frame, t.beat);
  let d = distance;
  let match: DanceStep | undefined;
  if (lead) {
    const want = (index - t.halfBeats / 2) >>> 0;
    match = lead.find((s) => s.index === want);
    if (!match) d = 0xff;
  }
  let grade: DanceStep['grade'] = d <= t.grades[1]! ? 'excellent' : d <= t.grades[3]! ? 'good' : 'miss';
  if (match && grade !== 'miss' && match.move !== move) grade = 'miss';
  return { contestant, frame, move, index: index & 0xff, grade };
}

const STEP_POINTS = { excellent: 2, good: 1, miss: 0 } as const;
const AI_JITTER = [1, 2, 3, 4];
const REPEAT_CHANCE = [90, 40, 0, 0];

/** A CPU lead's steps for a cycle (ov17_0224E990): its frames and moves, from its RNG. */
function cpuLeadPlan(t: DanceTiming, rank: number, ai: number, seed: { s: number }): { frame: number; move: number }[] {
  const next = () => {
    const [v, s] = seededNext(seed.s);
    seed.s = s;
    return v;
  };
  const slots = t.halfBeats;
  const limit = t.stage === 0 ? Math.trunc((Math.trunc(t.beat / 4) + 5000) / 10000) : Math.trunc((Math.trunc(t.beat / 6) + 5000) / 10000);
  const offBeat = rank >= 2;
  const n = offBeat ? Math.trunc(slots / 2) : Math.trunc(slots / 2 / 2);
  const spacing = offBeat ? Math.trunc(t.beat / 2) : t.beat;
  // v5: 16 bytes, read one past its end at Ultra and Master's 16-beat cycles (slot 15's right neighbour): taken as empty.
  const used: number[] = Array(Math.trunc(slots / 2) + 1).fill(0);
  for (let chosen = 0; ; ) {
    const v = next() % n;
    if (v === 0 || used[v]) continue;
    if (offBeat) {
      if (v === n - 1 && used[v - 1] === 1) continue;
      if (used[v - 1] === 1 || used[v + 1] === 1) continue;
      if (v & 1 && (next() & 0xff) < 128) continue;
    }
    used[v] = 1;
    if (++chosen >= t.steps) break;
  }
  const targets = used.flatMap((u, i) => (u && i < Math.trunc(slots / 2) ? [Math.trunc((i * spacing + 5000) / 10000)] : []));
  let jitter = AI_JITTER[ai]!;
  jitter = rank === 0 ? jitter * 2 : rank === 1 ? jitter : rank === 2 ? Math.trunc(jitter / 2) : Math.trunc(jitter / 3);
  const frames = targets.map((target) => {
    let f = target + (next() % (2 + jitter)) - (1 + Math.trunc(jitter / 2));
    if (f < 0) f = 0;
    // An unsigned comparison: a step drawn early is pushed late.
    if ((f - target) >>> 0 >= limit) f = target + limit - 1;
    return f;
  });
  const moves = [next() % 4];
  for (let i = 1; i < t.steps; i++) moves.push(i < t.steps - 1 && REPEAT_CHANCE[rank]! > next() % 100 ? moves[i - 1]! : next() % 4);
  return frames.map((frame, i) => ({ frame, move: moves[i]! + 1 }));
}

/** A copying CPU's timing spread (ov17_0224EC24: its first sums are overwritten, as in the game). */
function copyNoise(rank: number, ai: number) {
  const v = AI_JITTER[ai]!;
  return Math.max(0, rank <= 1 ? v * 2 : rank === 2 ? v + Math.trunc(v / 2) : v);
}

/** A copying CPU's chance in 100 of a wrong step (ov17_0224ECC4). */
function copyError(rank: number, ai: number, index: number, prevIndex: number, move: number, prevMove: number) {
  let v = 0;
  if ((ai === 0 && move === 1) || (ai === 1 && move === 2) || (ai === 2 && move === 4) || (ai === 3 && move === 3)) v += 3;
  if (prevMove !== 0 && move !== prevMove) v += 8;
  if (prevIndex !== -1) {
    if ((index & 1) !== (prevIndex & 1)) v += 2;
    if (index - prevIndex >= 8) v += 5;
  }
  return rank <= 1 ? v * 2 : rank === 2 ? v + Math.trunc(v / 2) : v;
}

/** A press the player made: the cycle (0-7: two a lead's turn), its frame in the cycle and its move (1-4). */
export interface DancePress {
  cycle: number;
  frame: number;
  move: number;
}

/**
 * The player's presses that count (ov17_0224CFB8, ov17_0224DC1C): in their half of the cycle (the lead's first, the
 * copy's second), before its last quarter beat, at most a cycle's steps, each at least the cooldown after the last.
 */
export function playerSteps(t: DanceTiming, cycle: number, presses: readonly DancePress[]): { frame: number; move: number }[] {
  const lead = DANCE_LEADS[Math.trunc(cycle / t.cycles)] === PLAYER;
  const from = lead ? 0 : t.cycleFrames >> 1;
  const until = lead ? t.leadUntil : t.copyUntil;
  const out: { frame: number; move: number }[] = [];
  for (const p of [...presses].filter((p) => p.cycle === cycle).sort((a, b) => a.frame - b.frame)) {
    if (out.length >= t.steps || p.frame < from || p.frame >= until || p.move < 1 || p.move > 4) continue;
    if (out.length && p.frame < out.at(-1)!.frame + t.cooldown) continue;
    out.push({ frame: p.frame, move: p.move });
  }
  return out;
}

/**
 * One cycle danced (ov17_0224CFB8, ov17_0224E930): the lead's steps (the player's presses, or a CPU's plan pressed as
 * its cooldown allows), then each copying dancer's (the player's presses, or each CPU copying the lead's steps in turn,
 * with its timing spread and its chance of a wrong move), every step judged. `seeds` are the CPU dancers' RNGs, kept
 * through the lead's turn.
 */
export function danceCycle(state: ContestState, cycle: number, presses: readonly DancePress[], seeds: { s: number }[]): DanceStep[] {
  const t = danceTiming(state.rank, state.category);
  const leader = DANCE_LEADS[Math.trunc(cycle / t.cycles)]!;
  const half = t.cycleFrames >> 1;
  const lead: DanceStep[] = [];
  if (leader === PLAYER) {
    for (const p of playerSteps(t, cycle, presses)) lead.push(judgeStep(t, PLAYER, p.frame, p.move, null));
  } else {
    const plan = cpuLeadPlan(t, state.rank, state.entrants[leader]!.ai, seeds[leader]!);
    let cool = 0;
    for (let frame = 0; frame < half && lead.length < t.steps; frame++) {
      if (cool > 0) {
        cool--;
        continue;
      }
      const step = plan[lead.length];
      if (step && step.frame <= frame) {
        lead.push(judgeStep(t, leader, frame, step.move, null));
        cool = t.cooldown;
      }
    }
  }
  const out = [...lead];
  for (let c = 0; c < CONTESTANTS; c++) {
    if (c === leader) continue;
    if (c === PLAYER) {
      for (const p of playerSteps(t, cycle, presses)) out.push(judgeStep(t, PLAYER, p.frame, p.move, lead));
      continue;
    }
    const seed = seeds[c]!;
    const next = () => {
      const [v, s] = seededNext(seed.s);
      seed.s = s;
      return v;
    };
    const ai = state.entrants[c]!.ai;
    let cool = 0;
    let count = 0;
    let plan: { frame: number; move: number } | null = null;
    for (let frame = half; frame < t.cycleFrames && count < t.steps && lead[count]; frame++) {
      if (cool > 0) {
        cool--;
        continue;
      }
      const step = lead[count]!;
      if (!plan) {
        const prevIndex = count ? lead[count - 1]!.index : -1;
        const prevMove = count ? lead[count - 1]!.move : 0;
        const spread = copyNoise(state.rank, ai);
        const wrong = copyError(state.rank, ai, step.index, prevIndex, step.move, prevMove);
        let target = Math.trunc((step.index * Math.trunc(t.beat / 2) + 5000) / 10000);
        const jitter = (next() % (2 + spread)) - (1 + Math.trunc(spread / 2));
        target = jitter + target < 0 ? 0 : target + jitter;
        let move = step.move;
        if (next() % 100 < spread + wrong) {
          do move = (next() % 4) + 1;
          while (move === step.move);
        }
        plan = { frame: target, move };
      }
      if (plan.frame <= frame - half) {
        out.push(judgeStep(t, c, frame, plan.move, lead));
        plan = null;
        count++;
        cool = t.cooldown;
      }
    }
  }
  return out;
}

/** The whole dance (all 8 cycles) danced with the player's presses: every step, and each contestant's score (Excellent 2, Good 1). */
export function danceAll(state: ContestState, presses: readonly DancePress[]): { steps: DanceStep[][]; score: number[] } {
  const t = danceTiming(state.rank, state.category);
  const steps: DanceStep[][] = [];
  for (let turn = 0; turn < DANCE_LEADS.length; turn++) {
    const seeds = (state.danceSeeds?.[turn] ?? [0, 0, 0, 0]).map((s) => ({ s }));
    for (let c = 0; c < t.cycles; c++) steps.push(danceCycle(state, turn * t.cycles + c, presses, seeds));
  }
  const score = [0, 0, 0, 0];
  for (const cycle of steps) for (const s of cycle) score[s.contestant]! += STEP_POINTS[s.grade];
  return { steps, score };
}

/** The dance is over: its scores kept and the acting's first order set (by the visual and dance points, best first). */
export function finishDance(state: ContestState, presses: readonly DancePress[]): ContestState | { error: string } {
  if (state.phase !== 'dance') return { error: 'The Dance Competition is over' };
  const next: ContestState = structuredClone(state);
  next.dance = danceAll(next, presses);
  const v = roundPoints(next.visual!.map(visualRaw), 3333);
  const d = roundPoints(next.dance.score, 3333);
  const sum = v.map((x, i) => x + d[i]!);
  const order = [0, 1, 2, 3];
  for (let i = 0; i < 3; i++)
    for (let j = 3; j > i; j--)
      if (sum[j - 1]! < sum[j]!) {
        [sum[j - 1], sum[j]] = [sum[j]!, sum[j - 1]!];
        [order[j - 1], order[j]] = [order[j]!, order[j - 1]!];
      }
  next.acting = { turn: 0, order, voltage: [0, 0, 0], totals: [0, 0, 0, 0], lastScores: [0, 0, 0, 0], lastMoves: [null, null, null, null], lastJudges: [MAIN_JUDGE, MAIN_JUDGE, MAIN_JUDGE, MAIN_JUDGE], flags: null, doubledBefore: [0, 0, 0, 0], turns: [] };
  next.phase = 'acting';
  next.version++;
  return next;
}

// --- The Acting Competition ------------------------------------------------------------------------------------------

export const ACTING_TURNS = 4;
const MAX_VOLTAGE = 50;
/** Unk_ov17_022539C8: a judge's Voltage change for a move's category in a contest's (+10 its own, −10 the two opposite). */
const VOLTAGE_TABLE = [[10, 0, -10, -10, 0], [0, 10, 0, -10, -10], [-10, 0, 10, 0, -10], [-10, -10, 0, 10, 0], [0, -10, -10, 0, 10]];
const voltageFor = (category: number, move: string) => VOLTAGE_TABLE[category]![contestMove(move)?.category ?? 0]!;
const effectOf = (move: string | null) => (move ? (contestMove(move)?.effect ?? 0) : 0);

/** Whether a contestant may use a move this turn (ov17_02243A98): not the move it used last, unless a Consecutive Use let it. */
export function canUseMove(acting: ActingState, contestant: number, move: string) {
  return !(move === acting.lastMoves[contestant] && acting.flags?.repeatable[contestant] !== move);
}

/** The CPU's choice of move and judge (ov17_02246F9C): its acting table's weights for its position, then the best of each. */
function cpuChoice(state: ContestState, acting: ActingState, c: number, playerJudge: number): { move: string; judge: number } {
  const e = state.entrants[c]!;
  // A move it can't use is no move, of effect 0 and category 0 (ov17_02246F24 clears it).
  const moves = [0, 1, 2, 3].map((i) => {
    const key = e.moves[i];
    const ok = !!key && canUseMove(acting, c, key);
    const m = ok ? contestMove(key!) : null;
    return { key: ok ? key! : null, effect: m?.effect ?? 0, category: m?.category ?? 0, score: 0, judges: [0, 0, 0] };
  });
  const position = acting.order.indexOf(c) + 1;
  const v = acting.voltage;
  const has = (pred: (m: (typeof moves)[number]) => boolean) => moves.some(pred);
  const hasEffect = (id: string) => has((m) => m.effect === E[id]);
  const ofType = () => has((m) => m.category === state.category);
  const flagWhere = (flags: number[], pred: (x: number) => boolean) => {
    let n = 0;
    v.forEach((x, j) => {
      if (pred(x)) {
        flags[j] = 1;
        n++;
      }
    });
    return n;
  };
  // Unk_ov17_02253BBC's conditions (the table's 1 and 0xD test turn 4, never reached while choosing).
  const cond = (id: number, flags: number[]): boolean => {
    switch (id) {
      case 1: return acting.turn === 4;
      case 2: return acting.doubledBefore[c] !== 0;
      case 3: return hasEffect('BASIC');
      case 4: return hasEffect('ALL_SAME_JUDGE');
      case 5: return hasEffect('STEAL_VOLTAGE');
      case 6: return hasEffect('DOUBLE_FINAL_ACT');
      case 7: return hasEffect('FIRST_PERFORMANCE_ADVANTAGE');
      case 8: return hasEffect('FINAL_PERFORMANCE_ADVANTAGE');
      case 9: return hasEffect('NO_VOLTAGE_DOWN');
      case 10: return hasEffect('TWO_VOLTAGE_IN_A_ROW_ADVANTAGE');
      case 11: return hasEffect('HIGH_SCORE_LATER_TURN');
      case 12: return acting.totals.every((t) => !(acting.totals[c]! > t));
      case 13: return acting.turn === 4 && acting.totals.every((t) => !(acting.totals[c]! > t));
      case 14: return has((m) => m.effect === E['2_HEARTS_WHEN_VOLTAGE_UP'] && m.category === state.category);
      case 15: return ofType();
      case 16: case 28: return ofType() && flagWhere(flags, (x) => x === 40) > 0;
      case 17: return ofType() && flagWhere(flags, (x) => x === 30) > 0;
      case 18: return hasEffect('VOLTAGE');
      case 19: return hasEffect('SUPPRESS_VOLTAGE');
      case 20: return flagWhere(flags, (x) => x === 40) > 0;
      case 21: return flagWhere(flags, (x) => x === 30) > 0;
      case 22: return flagWhere(flags, (x) => x <= 10) > 0;
      case 23: return v.every((x) => x >= 20) && (flags.fill(1), true);
      case 24: return v.every((x) => x <= 20) && (flags.fill(1), true);
      case 25: return flagWhere(flags, (x) => x <= 20) === 1;
      case 26: return flagWhere(flags, (x) => x === 40) === 2;
      case 27: return flagWhere(flags, (x) => x === 0) === 1;
    }
    return false;
  };
  for (const row of ACTING_AI) {
    if (row[0] !== position) continue;
    const flags = [0, 0, 0];
    if (!cond(row[1]!, flags)) continue;
    if (row[3] === 0) flags.fill(0);
    else if (row[3] === 2 || row[3] === 3) for (let j = 0; j < 3; j++) flags[j]! ^= 1;
    const w = row[4 + e.ai]! + (e.ai !== 0 ? row[4]! : 0);
    const target = row[2]!;
    for (const m of moves) {
      const hit = target === 240 ? m.category === state.category : target === 241 ? effectPoints(m.effect) >= 20 : m.effect === target;
      if (!hit) continue;
      m.score += w;
      for (let j = 0; j < 3; j++) if (flags[j]) m.judges[j]! += w;
    }
  }
  const moveDraws = [draw(state), draw(state), draw(state), draw(state)];
  const judgeDraws = [draw(state), draw(state), draw(state)];
  let best = moves.findIndex((m) => m.key);
  for (let i = best + 1; i < 4; i++) {
    const m = moves[i]!;
    if (m.key && (m.score > moves[best]!.score || (m.score === moves[best]!.score && moveDraws[i]! > moveDraws[best]!))) best = i;
  }
  const chosen = moves[best]!;
  // Offline, when no judge is favoured, it's likelier to avoid the player's judge the lower the rank.
  if (chosen.judges.every((j) => j === 0) && (draw(state) & 0xff) < [230, 128, 51, 0][state.rank]!) chosen.judges[playerJudge]! -= 100;
  let judge = 0;
  for (let j = 1; j < 3; j++) if (chosen.judges[j]! > chosen.judges[judge]! || (chosen.judges[j] === chosen.judges[judge] && judgeDraws[j]! > judgeDraws[judge]!)) judge = j;
  return { move: chosen.key!, judge };
}

/** The keys the next turn's order is sorted by for a first, last or random place (Unk_ov17_022539C0, …B0, …B8). */
const FIRST_KEYS = [-30000, -29990, -29980, -29970];
const LAST_KEYS = [29970, 29980, 29990, 30000];
const RANDOM_KEYS = [-10000, -500, 500, 10000];

/**
 * One turn of the Acting Competition with the player's move and judge (ov17_0223C100, ov17_0223C350, ov17_02245F14.c):
 * the CPUs choose, each contestant performs in order (its effect's appeal and what the effect adds, a Double Next Turn's
 * doubling, the judge's Voltage up or down for its category and a full one's bonus), then everyone's bonus for a judge
 * fewer chose, the effects scored at the end, and the next turn's order (the lowest score first, unless an effect says).
 */
export function actingTurn(state: ContestState, move: string, judge: number): ContestState | { error: string } {
  if (state.phase !== 'acting' || !state.acting) return { error: 'The Acting Competition is over' };
  const a0 = state.acting;
  if (!state.entrants[PLAYER]!.moves.includes(move)) return { error: "Your Pokémon doesn't know that move" };
  if (!canUseMove(a0, PLAYER, move)) return { error: "That move can't be used twice in a row" };
  if (!Number.isInteger(judge) || judge < 0 || judge > 2) return { error: 'Unknown judge' };
  const next: ContestState = structuredClone(state);
  const acting = next.acting!;
  const moves: string[] = [move, '', '', ''];
  const judges = [judge, 0, 0, 0];
  for (let c = 1; c < CONTESTANTS; c++) {
    const choice = cpuChoice(next, acting, c, judge);
    moves[c] = choice.move;
    judges[c] = choice.judge;
  }
  const effect = moves.map((m) => effectOf(m));
  const others = judges.map((j) => judges.filter((x) => x === j).length - 1);
  // The turn's struct (ov17_02245F44): last turn's doubling carried in; everything else fresh.
  const doubledNow = acting.flags?.doubled ?? [0, 0, 0, 0];
  const flags: TurnFlags = { doubled: [0, 0, 0, 0], repeatable: [null, null, null, null], orderKind: [0, 0, 0, 0], orderSlot: [0, 0, 0, 0] };
  const score = [0, 0, 0, 0];
  const maxBonus = [0, 0, 0, 0];
  const noUp = [false, false, false, false];
  const noDown = [false, false, false, false];
  // unk_1A: each contestant's score when it was last looked at (ov17_02246090), which Pity Points compares.
  const seen = [0, 0, 0, 0];
  const touch = (c: number) => (seen[c] = score[c]!);
  let voltage = [...acting.voltage];
  const order = acting.order;
  const performances: Performance[] = [];
  const setFirst = (c: number) => {
    const slots = flags.orderKind.map((k, i) => (k === 0 ? 0xff : flags.orderSlot[i]!));
    slots[c] = 0xff;
    for (let s = 0; s < 4; s++) {
      let i = 0;
      for (; i < 4; i++)
        if (slots[i] !== 0xff && s === slots[i] && slots[i] === flags.orderSlot[i]) {
          slots[i]!++;
          break;
        }
      if (i === 4) break;
    }
    slots.forEach((s, i) => s !== 0xff && (flags.orderSlot[i] = s));
    flags.orderKind[c] = 1;
    flags.orderSlot[c] = 0;
  };
  const setLast = (c: number) => {
    const slots = flags.orderKind.map((k, i) => (k === 0 ? 0xff : flags.orderSlot[i]!));
    slots[c] = 0xff;
    for (let s = 3; s > -1; s--) {
      let i = 0;
      for (; i < 4; i++)
        if (slots[i] !== 0xff && s === slots[i] && slots[i] === flags.orderSlot[i]) {
          slots[i]!--;
          break;
        }
      if (i === 4) break;
    }
    slots.forEach((s, i) => s !== 0xff && (flags.orderSlot[i] = s));
    flags.orderKind[c] = 2;
    flags.orderSlot[c] = 3;
  };
  for (let pos = 0; pos < 4; pos++) {
    const c = order[pos]!;
    const before = [...voltage];
    let after = [...voltage];
    const j = judges[c]!;
    const prev = pos > 0 ? order[pos - 1]! : -1;
    touch(c);
    score[c] = effectPoints(effect[c]!);
    touch(c);
    // The effects scored as it performs (class 3, Unk_ov17_02253AF8).
    let add = 0;
    switch (effect[c]) {
      case E.FIRST_NEXT_TURN: setFirst(c); break;
      case E.LAST_NEXT_TURN: setLast(c); break;
      case E['2_HEARTS_WHEN_VOLTAGE_UP']: if (voltageFor(next.category, moves[c]!) > 0 && !noUp[c]) add += 20; break;
      case E.CONSECUTIVE_USE: if (moves[c] !== acting.lastMoves[c]) flags.repeatable[c] = moves[c]!; break;
      case E.VOLTAGE: add += before[j]!; break;
      case E.LOWERS_VOLTAGE:
        if (!noDown[c] && after.some((x) => x !== 0)) after = after.map((x) => (x > 0 ? x - 10 : x));
        break;
      case E.DOUBLE_NEXT_TURN: flags.doubled[c] = effect[c]!; break;
      case E.STEAL_VOLTAGE: if (pos > 0 && maxBonus[prev]) add += maxBonus[prev]!; break;
      case E.SUPPRESS_VOLTAGE: for (let p = pos; p < 4; p++) noUp[order[p]!] = true; break;
      case E.RANDOM_ORDER: {
        const slot = [0, 1, 2, 3];
        const free = [true, true, true, true];
        for (let k = 0; k < 4; k++) {
          let r = draw(next) % (4 - k);
          for (let i = 0; i < 4; i++)
            if (free[i]) {
              if (r === 0) {
                slot[i] = k;
                free[i] = false;
                break;
              }
              r--;
            }
        }
        for (let i = 0; i < 4; i++) {
          flags.orderKind[i] = 3;
          flags.orderSlot[i] = slot[i]!;
        }
        break;
      }
      case E.DOUBLE_FINAL_ACT: if (pos === 3) add += score[c]!; break;
      case E.LOW_VOLTAGE_ADVANTAGE: add += [40, 30, 20, 10, 0, 0][Math.trunc(before[j]! / 10)]!; break;
      case E.FIRST_PERFORMANCE_ADVANTAGE: if (pos === 0) add += 20; break;
      case E.FINAL_PERFORMANCE_ADVANTAGE: if (pos === 3) add += 20; break;
      case E.NO_VOLTAGE_DOWN: for (let p = pos; p < 4; p++) noDown[order[p]!] = true; break;
      case E.TWO_VOLTAGE_IN_A_ROW_ADVANTAGE:
        if (pos > 0 && !noUp[c] && !noUp[prev] && voltageFor(next.category, moves[c]!) > 0 && voltageFor(next.category, moves[prev]!) > 0) add += 30;
        break;
      case E.HIGH_SCORE_LATER_TURN: add += [10, 20, 30, 40][pos]!; break;
      case E.MAX_VOLTAGE_ADVANTAGE: if (pos > 0 && maxBonus[prev]! >= 50) add += 30; break;
    }
    score[c]! += add;
    touch(c);
    // Doubled by a Double Next Turn used last turn (ov17_02246228).
    if (doubledNow[c]) score[c]! += score[c]!;
    const appeal = score[c]!;
    touch(c);
    // The judge's Voltage (ov17_022463C4).
    let change = voltageFor(next.category, moves[c]!);
    if (change > 0 && !noUp[c]) after[j] = Math.min(after[j]! + change, MAX_VOLTAGE);
    else if (change < 0 && !noDown[c] && after[j]! > 0) after[j] = Math.max(after[j]! + change, 0);
    else change = 0;
    if (after[j]! >= MAX_VOLTAGE) maxBonus[c] = j === MAIN_JUDGE ? 80 : 50;
    score[c]! += maxBonus[c]!;
    performances.push({ contestant: c, move: moves[c]!, judge: j, appeal, voltage: after[j]!, voltageChange: change, maxVoltage: maxBonus[c]! });
    voltage = after.map((x) => (x >= MAX_VOLTAGE ? 0 : x));
  }
  // Everyone's bonus for a judge fewer chose (ov17_02246518), in contestant order.
  const judgeBonus = [0, 1, 2, 3].map((c) => {
    touch(c);
    const b = [30, 20, 10, 0][others[c]!]!;
    score[c]! += b;
    return b;
  });
  const endBonus = [0, 0, 0, 0];
  // The judge effects (class 5), in performing order.
  for (const c of order) {
    touch(c);
    let b = 0;
    if (effect[c] === E.DOUBLED_JUDGE) b = others[c]! * 20;
    else if (effect[c] === E.UNIQUE_JUDGE && others[c] === 0) b = 30;
    else if (effect[c] === E.ALL_SAME_JUDGE && others[c] === 3) b = 150;
    score[c]! += b;
    endBonus[c]! += b;
  }
  // Pity Points (class 6), after the scores are noted (unk_1C): +3 if no other's noted score (unk_1A) is below its.
  const noted = [...score];
  for (const c of order) {
    touch(c);
    if (effect[c] !== E.PITY_POINTS) continue;
    if ([0, 1, 2, 3].some((o) => o !== c && seen[o]! < noted[c]!)) continue;
    score[c]! += 30;
    endBonus[c]! += 30;
  }
  // The turn's end (ov17_02246044, ov17_02243B0C): totals, and the next order, the lowest score first (a tie to who went later).
  const keys = [0, 1, 2, 3].map((c) => (flags.orderKind[c] === 1 ? FIRST_KEYS[flags.orderSlot[c]!]! : flags.orderKind[c] === 2 ? LAST_KEYS[flags.orderSlot[c]!]! : flags.orderKind[c] === 3 ? RANDOM_KEYS[flags.orderSlot[c]!]! : score[c]!));
  const ids = [0, 1, 2, 3];
  const went = [0, 1, 2, 3].map((c) => order.indexOf(c));
  for (let i = 0; i < 3; i++)
    for (let k = 3; k > i; k--)
      if (keys[k - 1]! > keys[k]! || (keys[k - 1] === keys[k] && went[k - 1]! < went[k]!)) {
        [keys[k - 1], keys[k]] = [keys[k]!, keys[k - 1]!];
        [ids[k - 1], ids[k]] = [ids[k]!, ids[k - 1]!];
        [went[k - 1], went[k]] = [went[k]!, went[k - 1]!];
      }
  acting.turns.push({ order: [...order], performances, judgeBonus, endBonus, scores: [...score] });
  acting.totals = acting.totals.map((t, c) => t + score[c]!);
  acting.lastScores = [...score];
  acting.lastMoves = [...moves];
  acting.lastJudges = [...judges];
  acting.doubledBefore = doubledNow;
  acting.flags = flags;
  acting.voltage = voltage;
  acting.order = ids;
  acting.turn++;
  if (acting.turn >= ACTING_TURNS) {
    next.result = contestResult(next);
    next.phase = 'results';
  }
  next.version++;
  return next;
}

// --- The results -----------------------------------------------------------------------------------------------------

/** A round's points (ov17_02251930): each score times the round's weight over its best, rounded to hundredths. */
export function roundPoints(raw: readonly number[], weight: number): number[] {
  const best = Math.max(...raw);
  // The game divides by the best score without a check (a round all at 0 would crash it): all 0 here.
  if (best <= 0) return raw.map(() => 0);
  const mult = Math.trunc(weight / best);
  return raw.map((r) => Math.trunc((r * mult + 50) / 100));
}

/** The placing (ov17_02251A1C): each round's points as a share of its best, a bar 64 wide each, summed; a tie to a random draw. */
export function contestResult(state: ContestState): ContestResult {
  const raw = [state.visual!.map(visualRaw), state.dance!.score, state.acting!.totals];
  const points = raw.map((r) => roundPoints(r, 3333));
  const bar = Math.trunc((24 * 8 * 3333 + 5000) / 10000);
  const total = [0, 1, 2, 3].map((c) =>
    points.reduce((sum, p) => {
      const best = Math.max(...p);
      return sum + (best ? Math.trunc((bar * Math.trunc((100 * p[c]!) / best)) / 100) : 0);
    }, 0),
  );
  const draws = [0, 1, 2, 3].map(() => draw(state));
  const ids = [0, 1, 2, 3];
  const t = [...total];
  for (let i = 0; i < 3; i++)
    for (let k = 3; k > i; k--)
      if (t[k - 1]! < t[k]! || (t[k - 1] === t[k] && draws[k - 1]! < draws[k]!)) {
        [t[k - 1], t[k]] = [t[k]!, t[k - 1]!];
        [ids[k - 1], ids[k]] = [ids[k]!, ids[k - 1]!];
        [draws[k - 1], draws[k]] = [draws[k]!, draws[k - 1]!];
      }
  const placing = [0, 0, 0, 0];
  ids.forEach((c, place) => (placing[c] = place));
  return { points, total, placing };
}

/** The first-win accessory of each category and rank (Contest_CalcFirstTimeVictoryAccessoryReward), by accessory id. */
export const FIRST_WIN_ACCESSORY = [
  [72, 77, 83, 88],
  [73, 78, 84, 89],
  [74, 79, 82, 87],
  [75, 80, 86, 91],
  [76, 81, 85, 90],
];
