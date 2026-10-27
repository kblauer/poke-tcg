import { ACTING_TURNS, canUseMove, CONTEST_CATEGORIES, CONTEST_EFFECTS, contestMove, JUDGES, MAIN_JUDGE, PLAYER, type ActingTurn, type ContestState } from '@poke-tcg/campaign';
import { useEffect, useMemo, useRef, useState } from 'react';
import { rankName } from './contestUi';
import { animCell, Cell, DsScreen, Layer, MonSprite, SCALE, useGfx, useTicks, type Gfx } from './ds';

/** The touch screen's four move buttons (ov17_02240424): their rects, names (Unk_ov17_02253278), type icons (Unk_ov17_02253298) and hearts (Unk_ov17_02253334). */
const MOVE_BUTTONS = [
  { rect: [8, 8, 120, 96], name: [19, 32], icon: [39, 48], hearts: [63, 52] },
  { rect: [136, 8, 248, 96], name: [147, 32], icon: [167, 48], hearts: [191, 52] },
  { rect: [8, 104, 120, 192], name: [19, 128], icon: [39, 144], hearts: [63, 148] },
  { rect: [136, 104, 248, 192], name: [147, 128], icon: [167, 144], hearts: [191, 148] },
] as const;
/** The judge buttons (touch-judges.png) and the judge-select highlight (40 + 88j, 96); the bar under them goes back. */
const JUDGE_BUTTONS = [
  [8, 12, 78, 124],
  [92, 12, 164, 124],
  [178, 12, 248, 124],
] as const;
const BACK_BAR = [6, 138, 250, 188] as const;
const CATEGORY_FILES = ['cool', 'beauty', 'cute', 'smart', 'tough'];
/** How long each performance plays back, in ms. */
const PERFORMANCE_MS = 1600;

/** A turn's lines, as the announcer would give them, one a step of the playback. */
function turnSteps(contest: ContestState, turn: ActingTurn) {
  const name = (c: number) => contest.entrants[c]!.name;
  const steps: { performer: number | null; text: string; voltage?: number[] }[] = [];
  for (const p of turn.performances) {
    const m = contestMove(p.move);
    steps.push({ performer: p.contestant, text: `${name(p.contestant)} performed ${m?.name ?? p.move} for ${JUDGES[p.judge]}! +${p.appeal / 10}♥` });
    if (p.voltageChange > 0) steps.push({ performer: p.contestant, text: p.maxVoltage ? `${JUDGES[p.judge]}’s Voltage is maxed! +${p.maxVoltage / 10}♥` : `${JUDGES[p.judge]}’s Voltage went up!` });
    else if (p.voltageChange < 0) steps.push({ performer: p.contestant, text: `${JUDGES[p.judge]}’s Voltage went down…` });
  }
  steps.push({ performer: null, text: contest.entrants.map((e, c) => `${e.name} +${(turn.judgeBonus[c]! + turn.endBonus[c]!) / 10}`).join(', ') + ' for the judges.' });
  return steps;
}

/** The top screen's stage: the judges with their Voltage, the contestants' panels with their hearts and NEXT badges, the performer. */
function Stage({ contest, gfx, ticks, voltage, totals, performer, message, judgeCursor }: { contest: ContestState; gfx: Gfx | null; ticks: number; voltage: number[]; totals: number[]; performer: number | null; message: string; judgeCursor: number | null }) {
  const acting = contest.acting!;
  const sheet = (n: string) => gfx?.sheet(n) ?? null;
  return (
    <DsScreen>
      <div className="absolute inset-0 overflow-hidden">
        <Layer src={performer !== null && Math.floor(ticks / 6) % 2 ? 'acting/bg-audience-cheer.png' : 'acting/bg-audience.png'} />
      </div>
      <Layer src="acting/bg-bar.png" />
      {JUDGES.map((j, i) => (
        <div key={j}>
          <Cell sheet={sheet(`judgeMarker-${i}`)} cell={0} x={96 + 32 * i} y={32} />
          <Cell sheet={sheet(`judge-${i}`)} cell={0} x={96 + 32 * i} y={40} />
          {Array.from({ length: Math.round(voltage[i]! / 10) }, (_, k) => (
            <Cell key={k} sheet={sheet('voltage')} cell={animCell(sheet('voltage'), 0, ticks + k * 2)} x={88 + 32 * i + 5 * k} y={12} />
          ))}
          <div className="pointer-events-none absolute w-8 text-center text-[6px] font-bold text-white [text-shadow:1px_1px_0_#303040]" style={{ left: 80 + 32 * i, top: 58 }}>
            {j}
          </div>
        </div>
      ))}
      {judgeCursor !== null && <Cell sheet={sheet('judgeCursor')} cell={0} x={96 + 32 * judgeCursor} y={56 + 10} />}
      {performer !== null && <MonSprite species={contest.entrants[performer]!.species} x={176} y={104 - Math.abs(Math.round(Math.sin(ticks / 8) * 3))} />}
      <Layer src="acting/bg-panels.png" />
      {contest.entrants.map((e, n) => {
        const hearts = Math.max(0, Math.floor(totals[n]! / 10));
        return (
          <div key={n}>
            <div className={`pointer-events-none absolute text-[8px] font-bold leading-[9px] ${n === PLAYER ? 'text-[#c02860]' : 'text-[#404058]'}`} style={{ left: 6, top: 6 + 48 * n }}>
              {e.name}
            </div>
            <div className="pointer-events-none absolute text-[7px] font-bold leading-[8px] text-[#606078]" style={{ left: 6, top: 22 + 48 * n }}>
              {e.trainer}
            </div>
            {Array.from({ length: Math.min(hearts, 24) }, (_, k) => (
              <Cell key={k} sheet={sheet('hearts')} cell={Math.min(3, Math.floor(k / 6))} x={5 + 8 * (k % 6)} y={43 + 48 * n} />
            ))}
            {acting.turn < ACTING_TURNS && <Cell sheet={sheet('rowIcon')} cell={acting.order.indexOf(n)} x={64} y={42 + 48 * n} />}
          </div>
        );
      })}
      <div className="pointer-events-none absolute text-[8px] font-bold leading-[11px] text-[#404058]" style={{ left: 88, top: 152, width: 160 }}>
        {message}
      </div>
    </DsScreen>
  );
}

/**
 * The Acting Competition (ov17_0223B140) on Platinum's screens: 4 turns, in each one a move (the touch screen's buttons,
 * each in its move's category colour, with its appeal's hearts) and then one of the 3 judges (Dexter the main one). A move
 * of the contest's category raises its judge's Voltage, the two opposite lower it; a judge's fifth Voltage gives a bonus
 * (8 hearts Dexter's, 5 the others') and empties; a judge fewer chose gives more. The server plays the turn with the CPUs'
 * choices (`contest.act`), and it's played back here a performance at a time.
 */
export function ActingRound({ contest, busy, onAct, onFinished }: { contest: ContestState; busy: boolean; onAct: (move: string, judge: number) => void; onFinished?: () => void }) {
  const acting = contest.acting!;
  const me = contest.entrants[PLAYER]!;
  const gfx = useGfx();
  const ticks = useTicks();
  const touch = useRef<HTMLDivElement>(null);
  const [move, setMove] = useState<string | null>(null);
  // The playback of the turn just played: its steps, the step showing, and the totals and Voltage before it.
  const lastTurn = acting.turns.at(-1) ?? null;
  const steps = useMemo(() => (lastTurn ? turnSteps(contest, lastTurn) : []), [contest, lastTurn]);
  const [shownTurns, setShownTurns] = useState(acting.turns.length);
  const [step, setStep] = useState(0);
  const playing = acting.turns.length > shownTurns;
  useEffect(() => {
    if (acting.turns.length > shownTurns) {
      setStep(0);
      const id = window.setInterval(
        () =>
          setStep((s) => {
            if (s + 1 >= steps.length) {
              window.clearInterval(id);
              setShownTurns(acting.turns.length);
              return s;
            }
            return s + 1;
          }),
        PERFORMANCE_MS,
      );
      return () => window.clearInterval(id);
    }
  }, [acting.turns.length, shownTurns, steps.length]);
  // The last turn played back: on to the results.
  useEffect(() => {
    if (!playing && acting.turn >= ACTING_TURNS) onFinished?.();
  }, [playing, acting.turn, onFinished]);
  const before = acting.turns.slice(0, -1);
  const playedTotals = playing ? contest.entrants.map((_, c) => before.reduce((s, t) => s + t.scores[c]!, 0) + (lastTurn ? lastTurn.performances.slice(0, Math.min(lastTurn.performances.length, step + 1)).filter((p) => p.contestant === c).reduce((s, p) => s + p.appeal + p.maxVoltage, 0) : 0)) : acting.totals;
  const current = playing ? steps[step] : null;
  const usable = (m: string) => canUseMove(acting, PLAYER, m);
  const sheet = (n: string) => gfx?.sheet(n) ?? null;
  const touchAt = (e: React.PointerEvent) => {
    const r = touch.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / SCALE, y: (e.clientY - r.top) / SCALE };
  };
  const inRect = (p: { x: number; y: number }, r: readonly number[]) => p.x >= r[0]! && p.x < r[2]! && p.y >= r[1]! && p.y < r[3]!;
  const onTouch = (e: React.PointerEvent) => {
    if (playing || busy) return;
    const p = touchAt(e);
    if (!move) {
      const i = MOVE_BUTTONS.findIndex((b) => inRect(p, b.rect));
      const m = me.moves[i];
      if (m && usable(m)) setMove(m);
      return;
    }
    const j = JUDGE_BUTTONS.findIndex((r) => inRect(p, r));
    if (j >= 0) {
      onAct(move, j);
      setMove(null);
    } else if (inRect(p, BACK_BAR)) setMove(null);
  };
  const message = current
    ? current.text
    : busy
      ? 'The judges are watching…'
      : acting.turn === ACTING_TURNS - 1
        ? `The last performance! Which move will ${me.name} use?`
        : move
          ? `Which judge will ${me.name} perform ${contestMove(move)?.name} for?`
          : `Turn ${acting.turn + 1}! Which move will ${me.name} use?`;
  return (
    <div className="space-y-2">
      <h2 className="font-heading text-lg">
        Acting Competition · {CONTEST_CATEGORIES[contest.category]} Contest, {rankName(contest.rank)}
      </h2>
      <div className="flex flex-col items-center gap-1">
        <Stage
          contest={contest}
          gfx={gfx}
          ticks={ticks}
          voltage={playing && lastTurn ? lastTurn.performances.slice(0, step + 1).reduce((v, p) => v.map((x, j) => (j === p.judge ? (p.voltage >= 50 ? 0 : p.voltage) : x)), [...(before.at(-1) ? voltageAfter(before) : [0, 0, 0])]) : acting.voltage}
          totals={playedTotals}
          performer={current?.performer ?? null}
          message={message}
          judgeCursor={null}
        />
        <DsScreen innerRef={touch} className={playing || busy ? '' : 'cursor-pointer'}>
          <div className="absolute inset-0" onPointerDown={onTouch}>
            {playing || busy ? (
              <>
                <Layer src={`acting/touch-title-${CATEGORY_FILES[contest.category]}.png`} />
                <div className="pointer-events-none absolute w-full text-center text-[10px] font-bold text-[#404058]" style={{ top: 121 }}>
                  {rankName(contest.rank)}
                </div>
                <div className="pointer-events-none absolute w-full text-center text-[10px] font-bold text-[#404058]" style={{ top: 153 }}>
                  {CONTEST_CATEGORIES[contest.category]} Contest
                </div>
              </>
            ) : !move ? (
              <>
                <Layer src="acting/touch-wait.png" />
                {MOVE_BUTTONS.map((b, i) => {
                  const key = me.moves[i];
                  const m = key ? contestMove(key) : null;
                  const ok = !!key && usable(key);
                  const file = ok && m ? `acting/touch-moves-${CATEGORY_FILES[m.category]}.png` : 'acting/touch-moves-unusable.png';
                  const [x0, y0, x1, y1] = b.rect;
                  const effect = m ? CONTEST_EFFECTS[m.effect]! : null;
                  return (
                    <div key={i}>
                      <div className="absolute overflow-hidden" style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }}>
                        <Layer src={file} x={-x0} y={-y0} />
                      </div>
                      {m && (
                        <>
                          <div className="pointer-events-none absolute text-[9px] font-bold text-white [text-shadow:1px_1px_0_#303040]" style={{ left: b.name[0], top: b.name[1] - 14 }}>
                            {m.name}
                          </div>
                          <Cell sheet={sheet(`typeIcon-${CATEGORY_FILES[m.category]}`)} cell={0} x={b.icon[0]} y={b.icon[1]} />
                          {Array.from({ length: Math.floor((effect?.points ?? 0) / 10) }, (_, k) => (
                            <Cell key={k} sheet={sheet('moveHearts-plus')} cell={0} x={b.hearts[0] + 8 * k} y={b.hearts[1]} />
                          ))}
                          <div className="pointer-events-none absolute text-[6px] font-bold leading-[7px] text-white [text-shadow:1px_1px_0_#303040]" style={{ left: b.name[0] - 4, top: b.name[1] + 30, width: 100 }}>
                            {effect?.short.join(' ')}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <Layer src="acting/touch-judges.png" />
                {JUDGES.map((j, i) => (
                  <div key={j}>
                    <Cell sheet={sheet(`judge-${i}`)} cell={0} x={40 + 88 * i - (i === 1 ? 2 : i === 2 ? 4 : 0)} y={56} style={{ transform: 'scale(2)' }} />
                    <div className="pointer-events-none absolute w-16 text-center text-[9px] font-bold text-white [text-shadow:1px_1px_0_#303040]" style={{ left: 40 + 86 * i - 32, top: 92 }}>
                      {j}
                      {i === MAIN_JUDGE ? '★' : ''}
                    </div>
                    <div className="pointer-events-none absolute w-16 text-center text-[7px] font-bold text-white [text-shadow:1px_1px_0_#303040]" style={{ left: 40 + 86 * i - 32, top: 104 }}>
                      Voltage {acting.voltage[i]! / 10}/5
                    </div>
                  </div>
                ))}
                <div className="pointer-events-none absolute w-full text-center text-[10px] font-bold text-white [text-shadow:1px_1px_0_#303040]" style={{ top: 157 }}>
                  Back
                </div>
              </>
            )}
          </div>
        </DsScreen>
      </div>
      <p className="text-center text-xs text-slate-400">
        Tap a move, then a judge. A {CONTEST_CATEGORIES[contest.category]} move raises its judge’s Voltage; fill it for a bonus (most from Dexter, the main judge). A judge the others didn’t pick is worth more. A greyed move was used last turn.
      </p>
    </div>
  );
}

/** The judges' Voltage after some turns (each turn's last performance per judge, a full one emptied). */
function voltageAfter(turns: readonly ActingTurn[]) {
  const v = [0, 0, 0];
  for (const t of turns) for (const p of t.performances) v[p.judge] = p.voltage >= 50 ? 0 : p.voltage;
  return v;
}
