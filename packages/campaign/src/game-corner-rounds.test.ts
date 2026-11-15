import { describe, expect, it } from 'vitest';
import { drawSlotSpin, gameCornerOf, keepGameCorner, leaveSlotSpin, rollRouletteBall, seededRandom16, settleSlotSpin, sitAtRoulette, sitAtSlots, withGameCorner, type RouletteSitting, type SlotSitting } from './game-corner-rounds.js';
import { MAX_COINS, slotMachineId } from './game-corner.js';
import { newRouletteGame, ROULETTE_GRID, rouletteFrame, type RouletteGame, type RouletteInput } from './roulette.js';
import { SLOT_KEYS, sitAtSlotMachine, slotAwaitingBet, slotAwaitingStop, slotFrame, slotRecord, slotSpinStarting, type SlotMachine } from './slot-machine.js';

/** The test's own choices (bets, when to press): mulberry32. */
function chooser(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % n) >>> 0;
  };
}

const noRandom = () => {
  throw new Error('Random() asked for outside a spin the API drew');
};

/**
 * A sitting at a slot machine played as the screen plays it, against the API's functions: the bet put in a coin at a time
 * (or R), the frames held at each spin's start for its seed (drawSlotSpin, or a Replay's from the settle), each reel
 * stopped some frames later, its `stop` event kept, and each `round` settled (settleSlotSpin). Checks, spin by spin, that
 * the API pays what the screen's reels show and keeps the screen's record and coins.
 */
function playSlots(machine: number, day: number, coins: number, spins: number, seed: number) {
  const choose = chooser(seed);
  const server = { sitting: sitAtSlots(machine, day, choose(2) === 1), coins };
  const m: SlotMachine = sitAtSlotMachine(server.sitting.record.machineId, coins, server.sitting.record.luckyGame);
  let random = noRandom as () => number;
  let next: number | null = null;
  let stops: number[] = [];
  let bet: number[] = [];
  let wait = 0;
  let seeds = 1;
  let reelTime = 0;
  let lotteries = 0;
  let inLottery = false;
  const settled: { bet: number; payout: number; free: boolean }[] = [];
  for (let frame = 0; frame < spins * 4000 && settled.length < spins && !m.exited; frame++) {
    if (slotSpinStarting(m)) {
      if (m.spinBet > 0) {
        const drawn = drawSlotSpin(server.sitting, m.bet, server.coins, seed * 1000 + seeds++);
        if ('error' in drawn) throw new Error(drawn.error);
        server.sitting = drawn.sitting;
        server.coins = drawn.coins;
        // The draw's answer is the seed and the coins: nothing the stops haven't decided yet.
        random = seededRandom16(drawn.sitting.spin!.seed);
      } else {
        expect(next).not.toBeNull();
        random = seededRandom16(next!);
        next = null;
      }
      stops = [];
    }
    let pressed = 0;
    if (m.message) pressed = SLOT_KEYS.a;
    else if (slotAwaitingBet(m)) {
      if (!bet.length) {
        expect(m.coins).toBe(server.coins);
        const coinsIn = 1 + choose(3);
        bet = coinsIn === 3 && choose(2) ? [SLOT_KEYS.r] : [...Array(coinsIn - 1).fill(SLOT_KEYS.down), coinsIn === 3 ? SLOT_KEYS.down : SLOT_KEYS.down | SLOT_KEYS.a];
      }
      pressed = bet.shift()!;
    } else if (!slotAwaitingBet(m) && !slotSpinStarting(m)) {
      // A in every state of a spin now and then (the frames between random): the stops, and presses that stop nothing,
      // some on the frame a reel comes to rest (the next reel's stop is decided in that frame).
      if (wait-- <= 0) {
        pressed = SLOT_KEYS.a;
        wait = slotAwaitingStop(m) ? choose(40) : choose(4);
      }
    }
    let ended = false;
    for (const e of slotFrame(m, { pressed, held: 0 }, random)) {
      if ('stop' in e) stops[e.stop.reel] = e.stop.offset;
      if ('round' in e) {
        const free = server.sitting.spin!.free;
        const result = settleSlotSpin(server.sitting, stops, server.coins, seed * 1000 + seeds++);
        if ('error' in result) throw new Error(result.error);
        expect(result.payout).toBe(e.round.payout);
        server.sitting = result.sitting;
        server.coins = result.coins;
        next = result.next;
        settled.push({ bet: e.round.bet, payout: result.payout, free });
        random = noRandom;
        ended = true;
      }
    }
    // What the API keeps between spins is the machine's own state, as the frame that ended the spin left it.
    if (ended) expect(server.sitting.record).toEqual(slotRecord(m));
    if (ended && server.sitting.record.reelTimeSpinsLeft) reelTime++;
    if (m.reelTime && !inLottery) lotteries++;
    inLottery = !!m.reelTime;
  }
  return { settled, server, m, reelTime, lotteries };
}

/**
 * A sitting at a roulette table played as the screen plays it: A every other frame, a bet clicked on an unhit square or
 * line, and at each spin's start the ball asked of the API (rollRouletteBall, with the wheel's angle then), its draws
 * the only Random() the screen's roll gets. Checks that the API pays what the screen's ball does.
 */
function playRoulette(table: 0 | 1, hours: number, coins: number, balls: number, seed: number) {
  const choose = chooser(seed);
  const serverRandom = seededRandom16(seed);
  const server = { sitting: sitAtRoulette(table, hours) as RouletteSitting, coins };
  const g: RouletteGame = newRouletteGame(table, coins, hours);
  let draws: number[] = [];
  const random = () => {
    if (!draws.length) throw new Error('the roll asked for more than the API drew');
    return draws.shift()!;
  };
  const rounds: { payout: number; square: number }[] = [];
  let landed = 0;
  for (let frame = 0; frame < balls * 3000 && landed < balls && g.task !== 'gone'; frame++) {
    if (g.task === 'startSpin') {
      expect(g.coins).toBe(server.coins - g.minBet);
      const rolled = rollRouletteBall(server.sitting, g.betSelection, g.wheelAngle, server.coins, serverRandom);
      if ('error' in rolled) throw new Error(rolled.error);
      server.sitting = rolled.sitting;
      server.coins = rolled.coins;
      draws = [...rolled.draws];
      rounds.push({ payout: rolled.payout, square: -1 });
    }
    const input: RouletteInput = { a: frame % 2 === 0 };
    if (g.task === 'handleBetGridInput' && frame % 2 === 0) {
      const open = Array.from({ length: 19 }, (_, i) => i + 1).filter((s) => !(g.hitFlags & ROULETTE_GRID[s]!.flag));
      input.select = open[choose(open.length)];
    }
    for (const e of rouletteFrame(g, input, random)) {
      if (e.type !== 'round') continue;
      const last = rounds[rounds.length - 1]!;
      expect(e.payout).toBe(last.payout);
      // Every draw the API made was the roll's, in order.
      expect(draws).toEqual([]);
      last.square = g.hitSquares[g.ballNum - 1]!;
      landed++;
      expect(server.sitting.board).toEqual({ ballNum: g.ballNum, totalBallNum: g.totalBallNum, hitFlags: g.hitFlags, hitSquares: g.hitSquares, pokeHits: g.pokeHits, colorHits: g.colorHits });
    }
  }
  return { rounds, server, g };
}

describe("the Game Corner's rounds, drawn by the API", () => {
  it('pays each slot spin what the screen played from the same seed and stops, keeping its record, its coins and its free spins', () => {
    let free = 0;
    let paid = 0;
    for (const [machine, day, seed] of [
      [0, 1, 1],
      [6, 3, 2],
      [11, 7, 3],
      [9, 20000, 4],
      [4, 12, 5],
    ] as const) {
      const { settled, server, m } = playSlots(machine, day, 3000, 120, seed);
      expect(settled.length).toBe(120);
      expect(server.sitting.record.machineId).toBe(slotMachineId(machine, day));
      free += settled.filter((s) => s.free).length;
      paid += settled.filter((s) => s.payout > 0).length;
      for (const s of settled) expect(s.bet === 0).toBe(s.free);
      // The screen counts its coins in as it pays; once paid, they're the API's.
      for (let i = 0; i < 2000 && !slotAwaitingBet(m) && !slotSpinStarting(m) && !m.exited; i++) slotFrame(m, { pressed: m.message ? SLOT_KEYS.a : 0, held: 0 }, noRandom);
      if (slotAwaitingBet(m)) expect(m.coins).toBe(server.coins);
    }
    // Replays (free spins) and wins both came up.
    expect(free).toBeGreaterThan(5);
    expect(paid).toBeGreaterThan(30);
  });

  it('plays Reel Time and the luckiest machines the same on the API', () => {
    // The luckiest machine at a 3-coin bet draws Reel Time and the 7s now and then; many spins to meet them.
    const day = [...Array(12).keys()].find((d) => slotMachineId(11, d) === 5)!;
    const { settled, server, reelTime, lotteries } = playSlots(11, day, MAX_COINS - 1000, 3000, 99);
    expect(settled.length).toBe(3000);
    expect(settled.some((s) => s.payout >= 90)).toBe(true);
    // Reel Time's lottery drawn, and spins won in it played (their reels stopping where they're pressed).
    expect(lotteries).toBeGreaterThan(0);
    expect(reelTime).toBeGreaterThan(0);
    expect(server.coins).toBeGreaterThanOrEqual(0);
  });

  it("doesn't pay a spin by its seed alone: the stops decide it, as the player's presses do in the game", () => {
    const sitting = sitAtSlots(11, 4, false);
    let decidedByStops = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const drawn = drawSlotSpin(sitting, 3, 100, seed);
      if ('error' in drawn) throw new Error(drawn.error);
      expect(drawn.coins).toBe(97);
      expect(Object.keys(drawn.sitting.spin!)).toEqual(['seed', 'bet', 'free']);
      const payouts = new Set<number>();
      for (let stop = 0; stop < 504; stop += 8) {
        const settled = settleSlotSpin(drawn.sitting, [stop, (stop * 5) % 504, (stop * 11) % 504], drawn.coins, 1);
        if ('error' in settled) throw new Error(settled.error);
        payouts.add(settled.payout);
      }
      if (payouts.size > 1) decidedByStops++;
    }
    // Some of the same spins, their reels stopped elsewhere, pay differently: the seed is the machine's bias, not the payout.
    expect(decidedByStops).toBeGreaterThan(0);
  });

  it('refuses a forged settle: no spin under way, a stop the reels never reach, a second settle, a free spin asked for, a bet without the coins', () => {
    const sitting: SlotSitting = sitAtSlots(2, 0, true);
    expect(settleSlotSpin(sitting, [0, 0, 0], 50, 1)).toEqual({ error: 'No spin is under way' });
    expect(drawSlotSpin(sitting, 0, 50, 1)).toHaveProperty('error');
    expect(drawSlotSpin(sitting, 4, 50, 1)).toHaveProperty('error');
    expect(drawSlotSpin(sitting, 3, 2, 1)).toEqual({ error: "You don't have enough coins" });
    const drawn = drawSlotSpin(sitting, 1, 50, 777);
    if ('error' in drawn) throw new Error(drawn.error);
    expect(drawSlotSpin(drawn.sitting, 1, 49, 2)).toEqual({ error: 'A spin is under way' });
    // The reels turn 8 pixels a frame from a symbol's edge: an odd offset is never a stop.
    expect(settleSlotSpin(drawn.sitting, [3, 0, 0], drawn.coins, 1)).toEqual({ error: "The reels don't stop there" });
    const settled = settleSlotSpin(drawn.sitting, [0, 0, 0], drawn.coins, 1);
    if ('error' in settled) throw new Error(settled.error);
    if (!settled.next) expect(settleSlotSpin(settled.sitting, [0, 0, 0], settled.coins, 1)).toEqual({ error: 'No spin is under way' });
  });

  it('plays a spin left without its stops as if each reel were stopped at once, and pays it', () => {
    const drawn = drawSlotSpin(sitAtSlots(0, 0, false), 2, 10, 4242);
    if ('error' in drawn) throw new Error(drawn.error);
    const left = leaveSlotSpin(drawn.sitting, drawn.coins);
    expect(left.sitting.spin).toBeNull();
    expect(left.coins).toBeGreaterThanOrEqual(8);
    expect(leaveSlotSpin(left.sitting, left.coins)).toEqual(left);
  });

  it('pays each roulette ball what the screen rolls with the draws it was given, and keeps the board', () => {
    for (const [table, hours, seed] of [
      [0, 8, 1],
      [1, 15, 2],
      [0, 22, 3],
      [1, 5, 4],
    ] as const) {
      const { rounds, server, g } = playRoulette(table, hours, 2000, 30, seed);
      expect(rounds.length).toBe(30);
      expect(rounds.some((r) => r.payout > 0)).toBe(true);
      expect(server.sitting.board.totalBallNum).toBe(30);
      for (let i = 0; i < 2000 && g.task !== 'handleBetGridInput' && g.task !== 'gone'; i++) rouletteFrame(g, { a: i % 2 === 0, b: g.task === 'keepPlayingYesNo' }, noRandom);
      if (g.task === 'handleBetGridInput') expect(g.coins).toBe(server.coins);
    }
  });

  it('refuses a ball without the coins, on a selection already hit, or with a wheel that has no such angle', () => {
    const sitting = sitAtRoulette(1, 12);
    expect(rollRouletteBall(sitting, 6, 0, 2, seededRandom16(1))).toEqual({ error: "You don't have enough coins" });
    expect(rollRouletteBall(sitting, 0, 0, 50, seededRandom16(1))).toHaveProperty('error');
    expect(rollRouletteBall(sitting, 6, 360, 50, seededRandom16(1))).toHaveProperty('error');
    const rolled = rollRouletteBall(sitting, 6, 100, 50, seededRandom16(1));
    if ('error' in rolled) throw new Error(rolled.error);
    // Decided and paid in the one call: the draws come back with the coins already settled.
    expect(rolled.coins).toBe(50 - 3 + rolled.payout);
    const square = rolled.sitting.board.hitSquares[0]!;
    expect(rollRouletteBall(rolled.sitting, square, 100, rolled.coins, seededRandom16(2))).toEqual({ error: "That's been hit already" });
  });

  it("keeps its sittings beside Voltorb Flip's session in the one JSON", () => {
    const corner = { slots: sitAtSlots(3, 1, false), roulette: sitAtRoulette(0, 9) };
    const voltorb = { history: [0, 0, 0, 0, 0], head: 0, board: null, flips: [] };
    const saved = JSON.parse(JSON.stringify(withGameCorner(voltorb, corner)));
    expect(gameCornerOf(saved)).toEqual(corner);
    expect(saved.history).toEqual(voltorb.history);
    expect(gameCornerOf(keepGameCorner(saved, { ...voltorb, head: 1 }))).toEqual(corner);
    expect(gameCornerOf({})).toEqual({ slots: null, roulette: null });
    expect(gameCornerOf(null)).toEqual({ slots: null, roulette: null });
  });
});
