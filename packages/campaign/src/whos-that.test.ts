import { describe, expect, it } from 'vitest';
import { expandDeck, STARTER_DECK } from './decks.js';
import { rngFrom } from './random.js';
import { applyRunAction, createRun, eventInfo, runView, type RunAction, type RunState, type RunSystemAction } from './run.js';
import { TEST_POOL } from './test-pool.js';
import {
  answerKey,
  dailyPlaylist,
  isSkip,
  namesPokemon,
  rotationCard,
  shapeFromMask,
  shapePixels,
  WHOS_THAT_CARDS,
  WHOS_THAT_EXP,
  WHOS_THAT_PASS_MS,
  WHOS_THAT_REVEAL_MS,
  WHOS_THAT_ROTATION,
  WHOS_THAT_ROUNDS,
  whosThatAnswer,
  whosThatDay,
  whosThatGame,
  whosThatStep,
  whosThatTimes,
  type WhosThatCard,
  type WhosThatProgress,
} from './whos-that.js';

describe("Who's That Pokémon? answers", () => {
  it("is the Pokémon's own name, without owners, Dark/Light/Shining, ex, δ, ☆ or Unown's letter", () => {
    expect(whosThatAnswer("Rocket's Hitmonchan ex")).toBe('Hitmonchan');
    expect(whosThatAnswer("Lt. Surge's Raichu")).toBe('Raichu');
    expect(whosThatAnswer("Team Magma's Groudon")).toBe('Groudon');
    expect(whosThatAnswer('Dark Porygon2')).toBe('Porygon2');
    expect(whosThatAnswer('Charizard ☆ δ')).toBe('Charizard');
    expect(whosThatAnswer('Unown [A]')).toBe('Unown');
    expect(whosThatAnswer("___________'s Pikachu")).toBe('Pikachu');
    expect(whosThatAnswer("Farfetch'd")).toBe("Farfetch'd");
    expect(whosThatAnswer('Mr. Mime')).toBe('Mr. Mime');
  });

  it('matches whatever the case, spacing, accents and punctuation', () => {
    expect(namesPokemon('mr mime', 'Mr. Mime')).toBe(true);
    expect(namesPokemon('FARFETCHD', "Farfetch'd")).toBe(true);
    expect(namesPokemon('ho oh', 'Ho-oh')).toBe(true);
    expect(namesPokemon('Pokémon', 'Pokemon')).toBe(true);
    expect(namesPokemon('Hitmonchan', "Rocket's Hitmonchan ex")).toBe(true);
    expect(namesPokemon('Hitmonlee', 'Hitmonchan')).toBe(false);
    expect(namesPokemon('  ', 'Pikachu')).toBe(false);
    expect(answerKey('Nidoran ♀')).toBe('nidoran');
  });

  it('"skip" passes, whatever the case; no Pokémon is called that', () => {
    expect(isSkip('skip')).toBe(true);
    expect(isSkip(' SKIP ')).toBe(true);
    expect(isSkip('Skiploom')).toBe(false);
    expect(namesPokemon('skip', 'Skiploom')).toBe(false);
  });
});

const cards: WhosThatCard[] = [
  ...['Pikachu', 'Raichu', 'Charizard', 'Blastoise', 'Venusaur', 'Mewtwo', 'Zapdos', 'Moltres', 'Articuno', 'Lugia', 'Ho-Oh', 'Umbreon'].map((name, i) => ({ id: `c${i}`, name })),
  { id: 'dark', name: 'Dark Raichu' },
  { id: 'rocket', name: "Rocket's Mewtwo ex" },
];

describe('picks', () => {
  it('a game is 10 different Pokémon', () => {
    const game = whosThatGame(rngFrom(7), cards);
    const names = game.map((id) => answerKey(whosThatAnswer(cards.find((c) => c.id === id)!.name)));
    expect(game).toHaveLength(WHOS_THAT_ROUNDS);
    expect(new Set(names).size).toBe(WHOS_THAT_ROUNDS);
  });

  it('the daily playlist is the same all day and changes with the day', () => {
    const day = whosThatDay(Date.UTC(2026, 9, 26, 3));
    expect(day).toBe('2026-10-26');
    expect(whosThatDay(Date.UTC(2026, 9, 26, 23, 59))).toBe(day);
    expect(dailyPlaylist(day, cards)).toEqual(dailyPlaylist(day, cards));
    expect(dailyPlaylist(day, cards)).not.toEqual(dailyPlaylist('2026-10-27', cards));
  });

  it("the rotating list's cards all have a silhouette, one a day in turn", () => {
    for (const id of WHOS_THAT_ROTATION) expect(WHOS_THAT_CARDS).toContain(id);
    expect(rotationCard('2026-10-26')).not.toBe(rotationCard('2026-10-27'));
    expect(WHOS_THAT_ROTATION).toContain(rotationCard('2026-10-26'));
  });
});

describe('times', () => {
  it('the fastest leaves passes out; the average counts them', () => {
    expect(whosThatTimes([1200, 30_000, 800], [false, true, false])).toEqual({ fastestMs: 800, averageMs: 10_667 });
    expect(whosThatTimes([30_000], [true])).toEqual({ fastestMs: null, averageMs: 30_000 });
  });
});

describe("a game's moves (whosThatStep)", () => {
  const game: WhosThatProgress = { rounds: 3, index: 0, shownAt: 1000, times: [], passed: [] };

  it('the Pokémon named records its time and shows the next from now', () => {
    const step = whosThatStep(game, "Rocket's Hitmonchan ex", { index: 0, guess: 'hitmonchan' }, 4000);
    expect(step).toEqual({ outcome: 'named', timeMs: 3000, game: { rounds: 3, index: 1, shownAt: 4000, times: [3000], passed: [false] } });
  });

  it('a wrong name changes nothing', () => {
    const step = whosThatStep(game, 'Pikachu', { index: 0, guess: 'raichu' }, 4000);
    expect(step.outcome).toBe('wrong');
    expect(step.game).toBe(game);
  });

  it('a pass, "skip" or any name once the time is up passes it: the full time, the next shown after the reveal', () => {
    const passed = { rounds: 3, index: 1, shownAt: 4000 + WHOS_THAT_REVEAL_MS, times: [WHOS_THAT_PASS_MS], passed: [true] };
    expect(whosThatStep(game, 'Pikachu', { index: 0, pass: true }, 4000)).toEqual({ outcome: 'passed', timeMs: WHOS_THAT_PASS_MS, game: passed });
    expect(whosThatStep(game, 'Pikachu', { index: 0, guess: 'Skip' }, 4000).game).toEqual(passed);
    const late = whosThatStep(game, 'Pikachu', { index: 0, guess: 'pikachu' }, 1000 + WHOS_THAT_PASS_MS);
    expect(late.outcome).toBe('passed');
    expect(late.game.times).toEqual([WHOS_THAT_PASS_MS]);
  });

  it('a move for another round than the one on screen changes nothing', () => {
    for (const move of [{ index: 1, pass: true as const }, { index: 1, guess: 'pikachu' }, { index: -1, guess: 'skip' }]) {
      const step = whosThatStep(game, 'Pikachu', move, 4000);
      expect(step.outcome).toBe('stale');
      expect(step.game).toBe(game);
    }
  });

  it("a move before the Pokémon is up (the one before still revealed) changes nothing, a pass included", () => {
    const { game: revealing } = whosThatStep(game, 'Pikachu', { index: 0, pass: true }, 4000);
    for (const move of [{ index: 1, pass: true as const }, { index: 1, guess: 'skip' }, { index: 1, guess: 'pikachu' }]) {
      const step = whosThatStep(revealing, 'Pikachu', move, 4000 + WHOS_THAT_REVEAL_MS - 1);
      expect(step.outcome).toBe('early');
      expect(step.game).toBe(revealing);
    }
    expect(whosThatStep(revealing, 'Pikachu', { index: 1, pass: true }, 4000 + WHOS_THAT_REVEAL_MS).outcome).toBe('passed');
  });

  it('a late guess and the pass sent with it pass one Pokémon, not two', () => {
    const now = 1000 + WHOS_THAT_PASS_MS;
    const guessed = whosThatStep(game, 'Pikachu', { index: 0, guess: 'pikachu' }, now);
    const both = whosThatStep(guessed.game, 'Raichu', { index: 0, pass: true }, now + 5);
    expect(both.outcome).toBe('stale');
    expect(both.game).toEqual({ rounds: 3, index: 1, shownAt: now + WHOS_THAT_REVEAL_MS, times: [WHOS_THAT_PASS_MS], passed: [true] });
  });

  it('a finished game takes no more moves', () => {
    const over: WhosThatProgress = { rounds: 3, index: 3, shownAt: 1000, times: [1, 2, 3], passed: [false, false, false] };
    expect(whosThatStep(over, '', { index: 3, pass: true }, 5000)).toEqual({ outcome: 'stale', timeMs: 0, game: over });
  });
});

describe('shapes', () => {
  /** A 600×825 mask, opaque but for a rectangle of the art window. */
  function mask(x0: number, y0: number, x1: number, y1: number) {
    const alpha = new Uint8Array(600 * 825).fill(255);
    for (let y = y0; y < y1; y++) alpha.fill(0, y * 600 + x0, y * 600 + x1);
    return alpha;
  }

  it("is the mask's cut-out in the art window, trimmed, and comes back pixel for pixel", () => {
    const shape = shapeFromMask('base1-4', mask(200, 150, 360, 330))!;
    expect(shape).toMatchObject({ width: 160, height: 180, x: 200, y: 150 });
    const pixels = shapePixels(shape);
    expect(pixels.every((p) => p === 1)).toBe(true);
    expect(pixels).toHaveLength(160 * 180);
  });

  it('keeps holes and outlines', () => {
    const alpha = mask(200, 150, 360, 330);
    for (let y = 200; y < 210; y++) alpha.fill(255, y * 600 + 250, y * 600 + 260);
    const pixels = shapePixels(shapeFromMask('base1-4', alpha)!);
    expect(pixels[(205 - 150) * 160 + (255 - 200)]).toBe(0);
    expect(pixels.filter((p) => p === 0)).toHaveLength(100);
  });

  it("is none when there's no cut-out or nearly the whole window is one", () => {
    expect(shapeFromMask('base1-4', new Uint8Array(600 * 825).fill(255))).toBeNull();
    expect(shapeFromMask('base1-4', mask(63, 97, 541, 428))).toBeNull();
  });
});

describe('the run event', () => {
  const act = (s: RunState, action: RunAction | RunSystemAction) => {
    const res = applyRunAction(s, action, TEST_POOL);
    if (!res.ok) throw new Error(res.error);
    return res.state;
  };
  const playing = () => {
    const s = createRun('celadon', expandDeck(STARTER_DECK), 1);
    s.phase = 'encounter';
    s.encounter = { kind: 'event', event: { id: 'whosThat', exp: WHOS_THAT_EXP, source: 'random' } };
    return s;
  };

  it("can't be accepted: the API starts it and settles it", () => {
    expect(applyRunAction(playing(), { type: 'ACCEPT' }, TEST_POOL)).toEqual({ ok: false, error: 'Name the Pokémon to win' });
    expect(applyRunAction(playing(), { type: 'WHOS_THAT_OVER', won: true, answer: 'Pikachu' }, TEST_POOL).ok).toBe(false);
  });

  it('named in time pays its EXP and moves on; its card is never in the view', () => {
    let s = act(playing(), { type: 'WHOS_THAT_STARTED', cardId: 'base1-4', at: 1000 });
    expect(applyRunAction(s, { type: 'WHOS_THAT_STARTED', cardId: 'base1-2', at: 2000 }, TEST_POOL).ok).toBe(false);
    expect(JSON.stringify(runView(s, TEST_POOL))).not.toContain('base1-4');
    expect(runView(s, TEST_POOL).encounter).toEqual({ kind: 'event', event: { id: 'whosThat', exp: WHOS_THAT_EXP, source: 'random', startedAt: 1000 } });
    const exp = s.exp;
    s = act(s, { type: 'WHOS_THAT_OVER', won: true, answer: 'Charizard' });
    expect(s.exp).toBe(exp + WHOS_THAT_EXP);
    expect(s.phase).toBe('map');
    expect(s.log.at(-1)).toBe(`Who's That Pokémon?: it's Charizard! +${WHOS_THAT_EXP} EXP.`);
  });

  it('missed pays nothing; walking away is allowed, even once it has started', () => {
    const started = act(playing(), { type: 'WHOS_THAT_STARTED', cardId: 'base1-4', at: 1000 });
    const missed = act(started, { type: 'WHOS_THAT_OVER', won: false, answer: 'Charizard' });
    expect(missed.exp).toBe(started.exp);
    expect(missed.log.at(-1)).toBe("Who's That Pokémon?: it was Charizard.");
    expect(act(started, { type: 'LEAVE' }).phase).toBe('map');
  });

  it('says what it is', () => {
    expect(eventInfo({ id: 'whosThat', exp: 20, source: 'rotation' }, String)).toMatchObject({ title: "Who's That Pokémon?", accept: 'Play' });
  });
});
