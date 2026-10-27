import { CONTEST_THEMES, danceAll, danceTiming, DANCE_LEADS, PLAYER, type ContestState, type DancePress, type DanceStep } from '@poke-tcg/campaign';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioVolume, ContestSprite } from './contestUi';

/** The four steps (ov17_022492DC): 1 Jump (Up), 2 Front (Down), 3 Left, 4 Right; their arrows and keys. */
const STEPS = [
  { move: 1, name: 'Jump', arrow: '↑', keys: ['ArrowUp', 'w', 'W'] },
  { move: 2, name: 'Front', arrow: '↓', keys: ['ArrowDown', 's', 'S'] },
  { move: 3, name: 'Left', arrow: '←', keys: ['ArrowLeft', 'a', 'A'] },
  { move: 4, name: 'Right', arrow: '→', keys: ['ArrowRight', 'd', 'D'] },
] as const;
const arrowOf = (move: number) => STEPS[move - 1]?.arrow ?? '?';
const GRADE_COLORS = { excellent: 'text-yellow-300', good: 'text-sky-300', miss: 'text-slate-500' } as const;
const FPS = 30;
const BAR_W = 512;

/** The Visual Competition's results, as the dance begins: each contestant's hearts (condition) and stars (theme). */
export function VisualRecap({ contest }: { contest: ContestState }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {contest.entrants.map((e, c) => {
        const v = contest.visual![c]!;
        return (
          <div key={c} className="flex items-center gap-2 rounded bg-slate-800 p-2 ring-1 ring-slate-700">
            <ContestSprite species={e.species} size={48} />
            <div className="text-xs">
              <div className="font-semibold">
                {e.name} <span className="font-normal text-slate-400">({e.trainer})</span>
              </div>
              <div className="text-pink-300">{v.hearts ? '♥'.repeat(v.hearts) : '♡'}</div>
              <div className="text-yellow-300">{v.stars ? '★'.repeat(v.stars) : '☆'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The Dance Competition (ov17_0223DAD0): the song plays once over 4 turns, each a contestant leading 2 cycles (the player
 * last); in a cycle the lead dances its steps over the first half and the others copy them, a half cycle on, over the
 * second. Each step is graded on the half-beat (Excellent, Good or Miss; a copy the wrong way misses). The browser keeps
 * the game's 30-frames-a-second clock by the song and records the presses; the server dances it again with them
 * (`contest.dance`) for the scores. The CPU dancers here are the same simulation, run on the presses so far.
 */
export function DanceRound({ contest, volume, busy, onDone }: { contest: ContestState; volume: number; busy: boolean; onDone: (presses: DancePress[]) => void }) {
  const t = useMemo(() => danceTiming(contest.rank, contest.category), [contest.rank, contest.category]);
  const [started, setStarted] = useState(false);
  const [frame, setFrame] = useState(-1);
  const frameRef = useRef(-1);
  const presses = useRef<DancePress[]>([]);
  const [pressCount, setPressCount] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const sent = useRef(false);
  const end = t.turnStarts[3]! + t.cycles * t.cycleFrames;
  // The presses are a ref (the keyboard reads them between renders); pressCount changes with them.
  const preview = useMemo(() => danceAll(contest, presses.current), [contest, pressCount]);
  const finish = useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    audio.current?.pause();
    onDone(presses.current);
  }, [onDone]);

  const start = () => {
    const a = new Audio(`/extras/contest/sounds/${t.song}.mp3`);
    a.volume = audioVolume(volume);
    audio.current = a;
    const began = performance.now();
    let byAudio = false;
    a.play().then(() => (byAudio = true)).catch(() => (byAudio = false));
    setStarted(true);
    const tick = () => {
      if (sent.current) return;
      const f = byAudio && !a.paused ? Math.floor(a.currentTime * FPS) : Math.floor(((performance.now() - began) / 1000) * FPS);
      frameRef.current = f;
      setFrame(f);
      if (f >= end + FPS) finish();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => {
    if (audio.current) audio.current.volume = audioVolume(volume);
  }, [volume]);

  /** Where a frame of the song falls: the lead's turn, the cycle (0-7) and the frame in it; null between turns. */
  const where = useCallback(
    (f: number) => {
      for (let r = 0; r < 4; r++) {
        const from = t.turnStarts[r]!;
        if (f >= from && f < from + t.cycles * t.cycleFrames) return { turn: r, cycle: r * t.cycles + Math.floor((f - from) / t.cycleFrames), at: (f - from) % t.cycleFrames };
      }
      return null;
    },
    [t],
  );
  const press = useCallback(
    (move: number) => {
      const w = where(frameRef.current);
      if (!w || sent.current) return;
      presses.current = [...presses.current, { cycle: w.cycle, frame: w.at, move }];
      setPressCount((n) => n + 1);
    },
    [where],
  );
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const step = STEPS.find((s) => (s.keys as readonly string[]).includes(e.key));
      if (!step || e.repeat) return;
      e.preventDefault();
      press(step.move);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, press]);

  if (!started)
    return (
      <div className="space-y-3">
        <h2 className="font-heading text-lg">Visual Competition results · The {CONTEST_THEMES[contest.theme]}</h2>
        <VisualRecap contest={contest} />
        <h2 className="font-heading text-lg">Dance Competition</h2>
        <p className="max-w-2xl text-sm text-slate-300">
          Each Pokémon leads the dance in turn, yours last. When another leads, watch its steps on the bar and copy them a half bar later, the same way, on the beat. When you lead, dance up to {t.steps} steps of your own on the beat. Use the arrow
          keys (or W A S D) or the buttons: ↑ Jump, ↓ Front, ← Left, → Right.
        </p>
        <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500 active:scale-95" onClick={start}>
          Start the dance ({t.bpm} BPM)
        </button>
      </div>
    );

  const w = where(frame);
  // Between turns, the next lead (the last after the dance).
  const upcoming = t.turnStarts.findIndex((s) => s > frame);
  const turn = w?.turn ?? (upcoming === -1 ? 3 : upcoming);
  const leader = DANCE_LEADS[turn]!;
  const half = t.cycleFrames >> 1;
  const cycleSteps: DanceStep[] = w ? (preview.steps[w.cycle] ?? []) : [];
  const shownSteps = cycleSteps.filter((s) => s.contestant === PLAYER || s.frame <= (w?.at ?? 0));
  const leadSteps = cycleSteps.filter((s) => s.contestant === leader && s.frame <= (w?.at ?? 0));
  const beatFrames = t.beat / 10000;
  const x = (f: number) => (f / t.cycleFrames) * BAR_W;
  const lastStep = (c: number) => [...shownSteps].reverse().find((s) => s.contestant === c && (w?.at ?? 0) - s.frame < 10);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4">
        <h2 className="font-heading text-lg">Dance Competition</h2>
        <span className="text-sm text-slate-300">
          {w ? (leader === PLAYER ? 'Your lead! Dance on the beat.' : w.at < half ? `Watch ${contest.entrants[leader]!.name}’s steps…` : 'Copy them!') : frame < t.turnStarts[0]! ? 'Get ready…' : frame >= end ? 'That’s the end of the dance!' : `Next: ${contest.entrants[leader]!.name} leads.`}
        </span>
        <span className="ml-auto text-xs text-slate-400">{w ? `Turn ${w.turn + 1} of 4 · bar ${(w.cycle % t.cycles) + 1} of ${t.cycles}` : ''}</span>
      </div>
      <div className="flex items-end justify-center gap-6 rounded-lg bg-[linear-gradient(#1e1b4b,#4c1d95)] p-4 ring-1 ring-slate-600">
        {contest.entrants.map((e, c) => {
          const s = lastStep(c);
          return (
            <div key={c} className={`flex flex-col items-center transition-transform ${c === leader ? 'order-first scale-110' : ''} ${s ? '-translate-y-2' : ''}`}>
              <span className={`h-6 text-xl font-bold ${s ? GRADE_COLORS[s.grade] : ''}`}>{s ? arrowOf(s.move) : ''}</span>
              <ContestSprite species={e.species} size={c === leader ? 96 : 72} />
              <span className="text-xs text-slate-50">{e.name}</span>
              <span className="text-[10px] text-slate-300">{preview.score[c]} pts</span>
            </div>
          );
        })}
      </div>
      <div className="relative mx-auto h-16 overflow-hidden rounded bg-slate-900 ring-1 ring-slate-600" style={{ width: BAR_W }}>
        <div className="absolute inset-y-0 left-0 bg-slate-800" style={{ width: x(half) }} />
        {Array.from({ length: Math.ceil(t.cycleFrames / beatFrames) }, (_, b) => (
          <div key={b} className={`absolute inset-y-0 w-px ${b % 4 === 0 ? 'bg-slate-500' : 'bg-slate-700'}`} style={{ left: x(b * beatFrames) }} />
        ))}
        {/* The lead's steps, and where to copy them. */}
        {leadSteps.map((s, i) => (
          <div key={`l${i}`} className="contents">
            <span className="absolute top-1 -translate-x-1/2 text-lg font-bold text-yellow-200" style={{ left: x(s.frame) }}>
              {arrowOf(s.move)}
            </span>
            {leader !== PLAYER && (
              <span className="absolute top-1 -translate-x-1/2 text-lg font-bold text-yellow-200/30" style={{ left: x(s.frame + half) }}>
                {arrowOf(s.move)}
              </span>
            )}
          </div>
        ))}
        {shownSteps
          .filter((s) => s.contestant === PLAYER && s.contestant !== leader)
          .map((s, i) => (
            <span key={`p${i}`} className={`absolute bottom-1 -translate-x-1/2 text-sm font-bold ${GRADE_COLORS[s.grade]}`} style={{ left: x(s.frame) }}>
              {arrowOf(s.move)}
            </span>
          ))}
        {w && <div className="absolute inset-y-0 w-0.5 bg-yellow-300" style={{ left: x(w.at) }} />}
      </div>
      <div className="flex justify-center gap-2">
        {STEPS.map((s) => (
          <button key={s.move} className="h-14 w-20 rounded-lg bg-slate-600 text-2xl font-bold transition hover:bg-slate-500 active:scale-95" onPointerDown={() => press(s.move)}>
            {s.arrow}
            <span className="block text-[10px] font-normal">{s.name}</span>
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">
        {busy ? 'Scoring the dance…' : `Your steps: ${preview.steps.flat().filter((s) => s.contestant === PLAYER && s.grade !== 'miss').length} on the beat · ${preview.score[PLAYER]} points`}
      </p>
    </div>
  );
}
