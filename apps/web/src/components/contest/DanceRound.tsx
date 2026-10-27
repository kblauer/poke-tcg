import { CONTEST_THEMES, danceAll, danceTiming, DANCE_LEADS, PLAYER, type ContestState, type DancePress, type DanceStep } from '@poke-tcg/campaign';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioVolume, ContestSprite } from './contestUi';
import { animCell, Cell, DsScreen, Layer, MonSprite, SCALE, useGfx } from './ds';

/** The four steps (ov17_022492DC): 1 Jump (Up), 2 Front (Down), 3 Left, 4 Right; their keys and touch buttons (Unk_ov17_02254564). */
const STEPS = [
  { move: 1, name: 'Jump', keys: ['ArrowUp', 'w', 'W'], rect: [88, 0, 168, 80], label: [128, 24] },
  { move: 2, name: 'Front', keys: ['ArrowDown', 's', 'S'], rect: [88, 96, 168, 176], label: [128, 120] },
  { move: 3, name: 'Left', keys: ['ArrowLeft', 'a', 'A'], rect: [8, 40, 88, 120], label: [48, 64] },
  { move: 4, name: 'Right', keys: ['ArrowRight', 'd', 'D'], rect: [168, 40, 248, 120], label: [208, 64] },
] as const;
const FPS = 30;
/** Where the dancers stand (Unk_ov17_022546F4): the lead in front, the others behind; their steps' rows on the bar (Unk_ov17_022549BC). */
const LEAD_SPOT = { x: 128, y: 96 };
const BACK_SPOTS = [
  { x: 48, y: 40 },
  { x: 128, y: 40 },
  { x: 208, y: 40 },
];
const LEAD_ROW = 176;
const BACK_ROWS = [168, 176, 184];
/** The judgement bubbles (Unk_ov17_022546CC): over the lead (128, 88) and the others (48|128|208, 32). */
const GRADE_CELL = { excellent: 0, good: 1, miss: 2 } as const;
const GRADE_WORD = { excellent: 'Excellent!', good: 'Good!', miss: 'Miss' } as const;

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
 * The Dance Competition (ov17_0223DAD0) on Platinum's screens: the song plays once over 4 turns, each a contestant
 * leading 2 cycles (the player last); in a cycle the lead dances its steps over the first half of the beat bar and the
 * others copy them, a half cycle on, over the second. Each step is graded on the half-beat (Excellent, Good or Miss; a
 * copy the wrong way misses). The browser keeps the game's 30-frames-a-second clock by the song and records the presses
 * (the arrow keys, W A S D, or the touch screen's buttons); the server dances it again with them (`contest.dance`) for the
 * scores. The CPU dancers here are the same simulation, run on the presses so far.
 */
export function DanceRound({ contest, volume, busy, onDone }: { contest: ContestState; volume: number; busy: boolean; onDone: (presses: DancePress[]) => void }) {
  const t = useMemo(() => danceTiming(contest.rank, contest.category), [contest.rank, contest.category]);
  const gfx = useGfx();
  const [started, setStarted] = useState(false);
  const [frame, setFrame] = useState(-1);
  const frameRef = useRef(-1);
  const presses = useRef<DancePress[]>([]);
  const [pressCount, setPressCount] = useState(0);
  const [lastPress, setLastPress] = useState<{ button: number; frame: number } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const touch = useRef<HTMLDivElement>(null);
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
      setLastPress({ button: move - 1, frame: frameRef.current });
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
  const touchDown = (e: React.PointerEvent) => {
    const r = touch.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / SCALE;
    const y = (e.clientY - r.top) / SCALE;
    const step = STEPS.find((s) => x >= s.rect[0] && x < s.rect[2] && y >= s.rect[1] && y < s.rect[3]);
    if (step && started) press(step.move);
  };

  const w = where(frame);
  const upcoming = t.turnStarts.findIndex((s) => s > frame);
  const turn = w?.turn ?? (upcoming === -1 ? 3 : upcoming);
  const leader = DANCE_LEADS[turn]!;
  const backs = [0, 1, 2, 3].filter((c) => c !== leader);
  const spotOf = (c: number) => (c === leader ? LEAD_SPOT : BACK_SPOTS[backs.indexOf(c)]!);
  const rowOf = (c: number) => (c === leader ? LEAD_ROW : BACK_ROWS[backs.indexOf(c)]!);
  const at = w?.at ?? -1;
  const cycleSteps: DanceStep[] = w ? (preview.steps[w.cycle] ?? []) : [];
  const shownSteps = cycleSteps.filter((s) => s.frame <= at);
  // The beat bar (ov17_0224C434, ov17_0224C49C): 256 px for 16 beats, 240 for 12, centred.
  const barW = t.stage === 0 ? 256 : 240;
  const barX = (256 - barW) / 2;
  const stepX = (index: number) => barX + (256 / t.halfBeats) * index;
  const progress = w ? at / t.cycleFrames : 0;
  const beatFrames = t.beat / 10000;
  const phase = w ? ((at % beatFrames) / beatFrames) * Math.PI : 0;
  const recent = (c: number) => [...shownSteps].reverse().find((s) => s.contestant === c && at - s.frame < 12);
  const pressedImage = lastPress && frame - lastPress.frame >= 0 && frame - lastPress.frame < 6 ? `dance/touch-press-${lastPress.button}-${Math.floor((frame - lastPress.frame) / 2)}.png` : 'dance/touch.png';
  const message = !started
    ? 'Press Start, then dance with the buttons or the arrow keys.'
    : w
      ? leader === PLAYER
        ? 'Your lead! Dance on the beat.'
        : at < t.cycleFrames >> 1
          ? `Watch ${contest.entrants[leader]!.name}’s dance…`
          : 'Now copy it!'
      : frame < t.turnStarts[0]!
        ? 'Get ready…'
        : frame >= end
          ? busy
            ? 'Scoring the dance…'
            : 'That’s the end of the dance!'
          : `Next, ${contest.entrants[leader]!.name} leads!`;
  return (
    <div className="space-y-2">
      {!started && (
        <>
          <h2 className="font-heading text-lg">Visual Competition results · The {CONTEST_THEMES[contest.theme]}</h2>
          <VisualRecap contest={contest} />
        </>
      )}
      <h2 className="font-heading text-lg">Dance Competition</h2>
      <div className="flex flex-col items-center gap-1">
        <DsScreen>
          <Layer src={`dance/stage-${t.stage}.png`} />
          {contest.entrants.map((e, c) => {
            const spot = spotOf(c);
            const s = recent(c);
            const hop = s ? Math.round(Math.sin(((at - s.frame) / 12) * Math.PI) * 8) : 0;
            const scale = c === leader ? 1 : 0.7;
            return (
              <div key={c}>
                <Cell sheet={gfx?.sheet('shadow') ?? null} cell={0} x={spot.x} y={spot.y + 32 * scale} style={{ transform: `scale(${scale})` }} />
                <MonSprite species={e.species} x={spot.x} y={spot.y - hop} scale={scale} />
                {c === PLAYER && <Cell sheet={gfx?.sheet('playerMarker') ?? null} cell={0} x={spot.x} y={spot.y - 40 * scale - hop} />}
                {s && (
                  <>
                    <Cell sheet={gfx?.sheet('judgement') ?? null} cell={GRADE_CELL[s.grade]} x={spot.x} y={c === leader ? 88 : 32} />
                    <div className="pointer-events-none absolute w-[62px] text-center text-[8px] font-bold text-white [text-shadow:1px_1px_0_#404058]" style={{ left: spot.x - 31, top: (c === leader ? 88 : 32) - 5 }}>
                      {GRADE_WORD[s.grade]}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {/* The lead's steps where it danced them, and the copies' as they come. */}
          {shownSteps.map((s, i) => (
            <Cell key={i} sheet={gfx?.sheet(`step-${s.move}`) ?? null} cell={animCell(gfx?.sheet(`step-${s.move}`) ?? null, s.contestant === leader ? 0 : 1, 0)} x={stepX(s.index)} y={rowOf(s.contestant)} />
          ))}
          {leader !== PLAYER &&
            at >= t.cycleFrames >> 1 &&
            cycleSteps
              .filter((s) => s.contestant === leader)
              .map((s, i) => <Cell key={`g${i}`} sheet={gfx?.sheet(`step-${s.move}`) ?? null} cell={4} x={stepX(s.index + t.halfBeats / 2)} y={rowOf(PLAYER)} style={{ opacity: 0.7 }} />)}
          {w && (
            <>
              <Cell sheet={gfx?.sheet('beatCursor') ?? null} cell={0} x={Math.round(progress * barW - 1 + barX)} y={176} />
              <Cell sheet={gfx?.sheet('beatBall') ?? null} cell={0} x={Math.round(barX + progress * barW)} y={Math.round(144 - Math.sin(phase) * 10)} />
            </>
          )}
          <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/40 px-1 text-[8px] font-bold text-white">{message}</div>
          <div className="pointer-events-none absolute right-1 top-1 rounded bg-black/40 px-1 text-[8px] font-bold text-white">
            {contest.entrants.map((e, c) => `${e.name} ${preview.score[c]}`).join(' · ')}
          </div>
        </DsScreen>
        <DsScreen innerRef={touch} className="cursor-pointer">
          <div className="absolute inset-0" onPointerDown={touchDown}>
            <Layer src={pressedImage} />
            {STEPS.map((s) => (
              <div key={s.move} className="pointer-events-none absolute w-16 text-center text-[9px] font-bold text-white [text-shadow:1px_1px_0_#404058]" style={{ left: s.label[0] - 32, top: s.label[1] - 5 }}>
                {s.name}
              </div>
            ))}
          </div>
          {!started && (
            <button className="absolute left-[78px] top-[150px] h-8 w-[100px] rounded-md bg-[#e8487a] text-[11px] font-bold text-white shadow ring-2 ring-white" onClick={start}>
              Start! ({t.bpm} BPM)
            </button>
          )}
        </DsScreen>
      </div>
      <p className="text-center text-xs text-slate-400">
        Each Pokémon leads in turn, yours last: watch the lead’s steps, then copy them half a bar later, the same way, on the beat. Up to {t.steps} steps a bar. Arrow keys or W A S D work too.
      </p>
    </div>
  );
}
