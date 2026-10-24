// Voltorb Flip (the Extras page), as HeartGold and SoulSilver play it at the Goldenrod Game Corner: ported from the
// pret/pokeheartgold decompilation's src/voltorb_flip/voltorb_flip_game.c. A 5x5 board of face-down cards, each a 1,
// a 2, a 3 or a Voltorb, with each row's and column's totals beside it; the first card flipped gives its number of
// coins, every one after multiplies them; a Voltorb loses them, Quit keeps them, and finding every 2 and 3 clears the
// board. The level (1-8) follows how the last rounds went. The game is played in the browser; the board is made and
// each round settled by the API (`settleRound`), which keeps the session's history and board (User.voltorbFlip).

/** A card: the game's CardType (CARD_TYPE_ONE … CARD_TYPE_VOLTORB). */
export type VoltorbCard = 1 | 2 | 3 | 4;
export const VOLTORB = 4;
/** RoundOutcome: how a round ended. */
export type RoundOutcome = 'none' | 'quit' | 'won' | 'lost';

/** RoundSummary: a past round, as the level's rules read it. `level` is the game's (0 is Lv. 8 … 7 is Lv. 1). */
export interface RoundSummary {
  outcome: RoundOutcome;
  cardsFlipped: number;
  boardId: number;
  level: number;
}

/** A board being played: its id (sBoardConfigs's), its level and its 25 cards (row by row). */
export interface VoltorbBoard {
  boardId: number;
  level: number;
  cards: VoltorbCard[];
}

/** A session's state (from entering the game to leaving it): the last 5 rounds (a ring, `head` the next to write) and the board in play. */
export interface VoltorbFlipState {
  history: RoundSummary[];
  head: number;
  board: VoltorbBoard | null;
}

/** The most coins a round can collect (VoltorbFlipGameState_MultiplyPayoutAndUpdateCardsFlipped's cap). */
export const MAX_PAYOUT = 50000;

const EMPTY_ROUND: RoundSummary = { outcome: 'none', cardsFlipped: 0, boardId: 0, level: 0 };
/** A new session (VoltorbFlip_CreateGameState: everything zeroed). */
export const newVoltorbFlipState = (): VoltorbFlipState => ({ history: Array.from({ length: 5 }, () => ({ ...EMPTY_ROUND })), head: 0, board: null });

/** The level as shown (Lv. 1-8) from the game's (VoltorbFlip_FormatGameLevel). */
export const displayLevel = (level: number) => 8 - level;

/**
 * sBoardConfigs: each board's Voltorbs, 2s and 3s, and how many "free" multipliers (2s and 3s in a row or column with no
 * Voltorb) a row or column, and the whole board, must stay under. 10 a level, Lv. 1 first; the second 5 of each level
 * allow one fewer free multiplier.
 */
export const BOARD_CONFIGS: [voltorbs: number, twos: number, threes: number, maxFreePerRowCol: number, maxFree: number][] = [
  [6, 3, 1, 3, 3], [6, 0, 3, 2, 2], [6, 5, 0, 3, 4], [6, 2, 2, 3, 3], [6, 4, 1, 3, 4],
  [6, 3, 1, 3, 3], [6, 0, 3, 2, 2], [6, 5, 0, 3, 4], [6, 2, 2, 3, 3], [6, 4, 1, 3, 4],
  [7, 1, 3, 2, 3], [7, 6, 0, 3, 4], [7, 3, 2, 2, 3], [7, 0, 4, 2, 3], [7, 5, 1, 3, 4],
  [7, 1, 3, 2, 2], [7, 6, 0, 3, 3], [7, 3, 2, 2, 2], [7, 0, 4, 2, 2], [7, 5, 1, 3, 3],
  [8, 2, 3, 2, 3], [8, 7, 0, 3, 4], [8, 4, 2, 3, 4], [8, 1, 4, 2, 3], [8, 6, 1, 4, 3],
  [8, 2, 3, 2, 2], [8, 7, 0, 3, 3], [8, 4, 2, 3, 3], [8, 1, 4, 2, 2], [8, 6, 1, 3, 3],
  [8, 3, 3, 4, 3], [8, 0, 5, 2, 3], [10, 8, 0, 4, 5], [10, 5, 2, 3, 4], [10, 2, 4, 3, 4],
  [8, 3, 3, 3, 3], [8, 0, 5, 2, 2], [10, 8, 0, 4, 4], [10, 5, 2, 3, 3], [10, 2, 4, 3, 3],
  [10, 7, 1, 4, 5], [10, 4, 3, 3, 4], [10, 1, 5, 3, 4], [10, 9, 0, 4, 5], [10, 6, 2, 4, 5],
  [10, 7, 1, 4, 4], [10, 4, 3, 3, 3], [10, 1, 5, 3, 3], [10, 9, 0, 4, 4], [10, 6, 2, 4, 4],
  [10, 3, 4, 3, 4], [10, 0, 6, 3, 4], [10, 8, 1, 4, 5], [10, 5, 3, 4, 5], [10, 2, 5, 3, 4],
  [10, 3, 4, 3, 3], [10, 0, 6, 3, 3], [10, 8, 1, 4, 4], [10, 5, 3, 4, 4], [10, 2, 5, 3, 3],
  [10, 7, 2, 4, 5], [10, 4, 4, 4, 5], [13, 1, 6, 3, 4], [13, 9, 1, 5, 6], [10, 6, 3, 4, 5],
  [10, 7, 2, 4, 4], [10, 4, 4, 4, 4], [13, 1, 6, 3, 3], [13, 9, 1, 5, 5], [10, 6, 3, 4, 4],
  [10, 0, 7, 3, 4], [10, 8, 2, 5, 6], [10, 5, 4, 4, 5], [10, 2, 6, 4, 5], [10, 7, 3, 5, 6],
  [10, 0, 7, 3, 3], [10, 8, 2, 5, 5], [10, 5, 4, 4, 4], [10, 2, 6, 4, 4], [10, 7, 3, 5, 5],
];

/** The newest round in the history (VoltorbFlipGameState_GetBoardHistoryTop). */
const lastRound = (s: VoltorbFlipState) => s.history[s.head === 0 ? 4 : s.head - 1]!;
/** Whether a board is of level `level` (Lv. 1-8) or higher (LEVEL_AT_LEAST). */
const atLeast = (boardId: number, level: number) => boardId >= 10 * (level - 1);

/**
 * The next round's level (VoltorbFlipGameState_CalcNextLevel), the game's (0 Lv. 8 … 7 Lv. 1): Lv. 8 again after a won
 * Lv. 8 round, or from Lv. 5 up when each of the last 5 rounds flipped 8 or more cards and none was lost; otherwise the
 * last round's level or the one above if it was won, or as many levels as it flipped cards, whichever is higher.
 */
export function nextLevel(s: VoltorbFlipState): number {
  const prev = lastRound(s);
  const won = prev.outcome === 'won';
  const id = prev.boardId;
  if (won && atLeast(id, 8)) return 0;
  if (atLeast(id, 5) && s.history.every((r) => r.cardsFlipped >= 8 && r.outcome !== 'lost')) return 0;
  const flipped = prev.cardsFlipped;
  if ((atLeast(id, 7) && flipped >= 7) || (atLeast(id, 6) && won)) return 1;
  if ((atLeast(id, 6) && flipped >= 6) || (atLeast(id, 5) && won)) return 2;
  if ((atLeast(id, 5) && flipped >= 5) || (atLeast(id, 4) && won)) return 3;
  if ((atLeast(id, 4) && flipped >= 4) || (atLeast(id, 3) && won)) return 4;
  if ((atLeast(id, 3) && flipped >= 3) || (atLeast(id, 2) && won)) return 5;
  if ((atLeast(id, 2) && flipped >= 2) || won) return 6;
  return 7;
}

/** How many levels the board in play is above the last round's (VoltorbFlipGameState_CalculateLevelsGained; negative if it dropped). */
export const levelsGained = (s: VoltorbFlipState) => lastRound(s).level - (s.board?.level ?? lastRound(s).level);

/**
 * A new board for the session (VoltorbFlipGameState_NewBoard): its level from the history, one of the level's 10
 * boards at random, its cards laid out until no more multipliers are free than the board allows (at most 1000 tries,
 * the last kept). `rand` gives 32-bit numbers (the game's MTRandom).
 */
export function newBoard(s: VoltorbFlipState, rand: () => number): VoltorbBoard {
  // VoltorbFlipGameState_SelectBoardId: sBoardIdDistribution gives each of the level's 10 boards 10%.
  const roll = (rand() >>> 0) % 100;
  const level = nextLevel(s);
  const boardId = 10 * (7 - level) + Math.floor(roll / 10);
  const [voltorbs, twos, threes] = BOARD_CONFIGS[boardId]!;
  let cards: VoltorbCard[] = [];
  for (let i = 0; i < 1000; i++) {
    cards = Array<VoltorbCard>(25).fill(1);
    place(cards, VOLTORB, voltorbs, rand);
    place(cards, 2, twos, rand);
    place(cards, 3, threes, rand);
    if (!tooManyFree(cards, boardId)) break;
  }
  return { boardId, level, cards };
}

/** VoltorbFlipGameState_PlaceCardsOnBoard: `n` cards on random 1s, a card given up after 100 misses in all. */
function place(cards: VoltorbCard[], card: VoltorbCard, n: number, rand: () => number) {
  let misses = 0;
  for (let i = 0; i < n; ) {
    const id = (rand() >>> 0) % 25;
    if (cards[id] === 1) {
      cards[id] = card;
      i++;
    } else if (++misses >= 100) break;
  }
}

/** VoltorbFlipGameState_RetryBoardGen: whether the board has as many free multipliers as its config's limits, or more. */
function tooManyFree(cards: VoltorbCard[], boardId: number) {
  const [, , , maxPerRowCol, maxFree] = BOARD_CONFIGS[boardId]!;
  const { voltorbsPerRow, voltorbsPerCol } = boardTotals(cards);
  const perRow = [0, 0, 0, 0, 0];
  const perCol = [0, 0, 0, 0, 0];
  let free = 0;
  cards.forEach((c, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    if ((c === 2 || c === 3) && (voltorbsPerRow[row] === 0 || voltorbsPerCol[col] === 0)) {
      perRow[row]!++;
      perCol[col]!++;
      free++;
    }
  });
  return maxFree <= free || perRow.some((n) => maxPerRowCol <= n) || perCol.some((n) => maxPerRowCol <= n);
}

/** The numbers beside the board: each row's and column's points (a Voltorb counts 0) and Voltorbs. */
export function boardTotals(cards: VoltorbCard[]) {
  const pointsPerRow = [0, 0, 0, 0, 0];
  const pointsPerCol = [0, 0, 0, 0, 0];
  const voltorbsPerRow = [0, 0, 0, 0, 0];
  const voltorbsPerCol = [0, 0, 0, 0, 0];
  cards.forEach((c, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    if (c === VOLTORB) {
      voltorbsPerRow[row]!++;
      voltorbsPerCol[col]!++;
    } else {
      pointsPerRow[row]! += c;
      pointsPerCol[col]! += c;
    }
  });
  return { pointsPerRow, pointsPerCol, voltorbsPerRow, voltorbsPerCol };
}

/** A round's coins after flipping `card` (not a Voltorb): the first number gives its coins, each after multiplies them. */
export const afterFlip = (payout: number, card: VoltorbCard) => (payout === 0 ? card : Math.min(MAX_PAYOUT, payout * card));

/** Every card's coins: what flipping all the 1s, 2s and 3s gives (VoltorbFlipGameState_CalcBoardMaxPayout). */
export const maxPayout = (cards: VoltorbCard[]) => Math.min(MAX_PAYOUT, cards.reduce<number>((p, c) => (c === VOLTORB ? p : p * c), 1));

/** How many 2s and 3s a board has: finding them all clears it. */
export const multiplierCards = (cards: VoltorbCard[]) => cards.filter((c) => c === 2 || c === 3).length;

/**
 * A round's end, checked against the board: the cards flipped, in order, and how it ended (lost on a Voltorb, the last
 * card flipped; won on finding the last 2 or 3; quit before either). The coins it pays and its summary for the history,
 * or why it can't be.
 */
export function settleRound(board: VoltorbBoard, flips: number[], outcome: 'quit' | 'won' | 'lost'): { payout: number; summary: RoundSummary } | { error: string } {
  if (new Set(flips).size !== flips.length || flips.some((id) => !Number.isInteger(id) || id < 0 || id > 24)) return { error: 'Each card can be flipped once' };
  const max = maxPayout(board.cards);
  let payout = 0;
  let cardsFlipped = 0;
  for (const [i, id] of flips.entries()) {
    const card = board.cards[id]!;
    const last = i === flips.length - 1;
    if (card === VOLTORB) {
      if (!last || outcome !== 'lost') return { error: 'The round was over at the Voltorb' };
      return { payout: 0, summary: { outcome, cardsFlipped, boardId: board.boardId, level: board.level } };
    }
    payout = afterFlip(payout, card);
    cardsFlipped++;
    if (payout === max && !last) return { error: 'The round was won before that card' };
  }
  if (outcome === 'lost') return { error: 'No Voltorb was flipped' };
  if ((outcome === 'won') !== (payout === max)) return { error: outcome === 'won' ? "Not every 2 and 3 was found" : 'The round was won' };
  return { payout, summary: { outcome, cardsFlipped, boardId: board.boardId, level: board.level } };
}

/** The session after a round (VoltorbFlipGameState_UpdateHistoryAndReset): its summary in the history, no board. */
export function afterRoundSummary(s: VoltorbFlipState, summary: RoundSummary): VoltorbFlipState {
  const history = s.history.map((r, i) => (i === s.head ? summary : r));
  return { history, head: (s.head + 1) % 5, board: null };
}

/** A session from its saved JSON (User.voltorbFlip), or a new one if there's none or it's malformed. */
export function voltorbFlipStateOf(json: unknown): VoltorbFlipState {
  const s = json as Partial<VoltorbFlipState> | null;
  if (!s || !Array.isArray(s.history) || s.history.length !== 5 || typeof s.head !== 'number') return newVoltorbFlipState();
  return { history: s.history, head: s.head, board: s.board ?? null };
}
