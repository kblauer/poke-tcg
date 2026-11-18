import { useEffect, useMemo, useRef, useState } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { glow, HEAL_RGB, hitShake, lunge, MOTION_MS, reducedMotion } from '../../utils/cardMotion';
import { playbackFrames, type Frame, type ShownFighter } from '../../utils/safariPlayback';
import { BUTTON } from '../../utils/styles';
import { PopNumber } from '../ToolPops';
import { CardRow, EmptyPlace, SynergyChips } from './SafariBoard';
import type { TrainerName } from '@poke-tcg/safari/effects';
import { TrainerCard, UnitCard } from './UnitCard';

export type LastBattle = NonNullable<SafariViewData['last']>;

/** How long a frame shows at 1×, by what it shows: an attack lunges, a number pops, a note is read. */
const BEAT_MS = { attack: 560, damage: 480, heal: 420, miss: 520, faint: 560, note: 650, start: 900 } as const;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * A battle played back on the table (issue #239, section 8): each event a beat (playbackFrames), at 1×, 2× or 4×, or
 * skipped to the end. The page shows `frame`'s lines in the table's two rows (BattleLine) and the bar between them
 * (BattleBar).
 */
export function useBattlePlayback(battle: LastBattle) {
  const frames = useMemo(() => playbackFrames(battle.mine, battle.opponent, battle.events), [battle]);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const frame = frames[Math.min(index, frames.length - 1)]!;
  const done = index >= frames.length - 1;
  useEffect(() => {
    if (done) return;
    const kind = index === 0 ? 'start' : (frame.mark?.kind ?? 'note');
    const timer = window.setTimeout(() => setIndex((i) => i + 1), BEAT_MS[kind] / speed);
    return () => window.clearTimeout(timer);
  }, [index, done, speed, frame]);
  return { frames, frame, index, done, speed, setSpeed, skip: () => setIndex(frames.length - 1) };
}
export type Playback = ReturnType<typeof useBattlePlayback>;

/** One side's line in a frame, in its row of the table, with its synergies. */
export function BattleLine({ playback, side, units, types, trainer }: { playback: Playback; side: 0 | 1; units: Map<string, SafariUnit>; types: string[]; trainer?: TrainerName }) {
  const line = playback.frame.lines[side];
  const chips = <SynergyChips types={types} quiet />;
  return (
    <div className="flex flex-col gap-1.5">
      {side === 1 && <div className="flex min-h-6 justify-center">{chips}</div>}
      <CardRow>
        {line.map((f) => (
          <BattleFighter key={f.uid} f={f} playback={playback} units={units} />
        ))}
        {!line.length && <EmptyPlace width="var(--safari-card)" label={<span className="px-1 text-center text-slate-300">No Pokémon left</span>} />}
        {trainer && <TrainerCard trainer={trainer} width="var(--safari-inv)" />}
      </CardRow>
      {side === 0 && <div className="flex min-h-7 justify-center">{chips}</div>}
    </div>
  );
}

/**
 * A Pokémon in a playback frame, with the battle page's card animations (utils/cardMotion.ts): it lunges at the other
 * side when it attacks, shakes with a red glow when hit, glows green when healed, and fades out when it faints; the
 * damage and healing rise off it as the battle page's numbers (PopNumber). Its card shows its HP as it stands, with an HP
 * bar and its Special Conditions.
 */
function BattleFighter({ f, playback, units }: { f: ShownFighter; playback: Playback; units: Map<string, SafariUnit> }) {
  const { frame, index, speed } = playback;
  const ref = useRef<HTMLDivElement>(null);
  const m = frame.mark;
  const mine = (kind: string) => m?.kind === kind && 'uid' in m && m.uid === f.uid;
  const targeted = m?.kind === 'attack' && m.target === f.uid;
  useEffect(() => {
    const el = ref.current;
    if (!el || !m || reducedMotion()) return;
    if (m.kind === 'attack' && m.uid === f.uid) lunge(el, f.side === 0 ? 'up' : 'down');
    else if (m.kind === 'damage' && m.uid === f.uid) hitShake(el);
    else if (m.kind === 'heal' && m.uid === f.uid && m.amount > 0) glow(el, HEAL_RGB);
    else if (m.kind === 'faint' && m.uid === f.uid) el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8%) scale(0.85)' }], { duration: MOTION_MS, fill: 'forwards' });
    else return;
    for (const a of el.getAnimations()) a.playbackRate = speed;
  }, [index]);
  const pct = f.maxHp ? Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100)) : 0;
  const pop = m && (m.kind === 'damage' || (m.kind === 'heal' && m.amount > 0) || m.kind === 'miss') && m.uid === f.uid ? m : null;
  return (
    <div className="relative">
      <div ref={ref}>
        <UnitCard id={f.unit ?? ''} unit={f.unit ? units.get(f.unit) : undefined} stats={{ attack: f.attack, hp: f.hp, keyword: f.keyword ?? '' }} width="var(--safari-card)" lit={mine('attack') || targeted}>
          <span className="absolute bottom-[9%] left-[36%] right-[36%] h-[3%] overflow-hidden rounded-full bg-slate-950/80">
            <span className={`block h-full transition-[width] duration-300 ${pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
          </span>
          {!!f.status.length && (
            <span className="absolute inset-x-0 top-[20%] flex flex-col items-center gap-0.5">
              {f.status.map((s) => (
                <span key={s} className="rounded bg-purple-500 px-1 text-[9cqw] font-bold uppercase text-gray-900">
                  {s}
                </span>
              ))}
            </span>
          )}
        </UnitCard>
      </div>
      {pop && (
        <div key={index} className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          {pop.kind === 'miss' ? (
            <span className="tool-pop whitespace-nowrap rounded-full bg-slate-950/85 px-2 py-0.5 text-sm font-bold text-slate-50 ring-1 ring-slate-500" style={{ animationDuration: `${1200 / speed}ms` }}>
              {pop.why || 'Miss'}
            </span>
          ) : (
            <PopNumber damage={pop.kind === 'damage' ? pop.amount : undefined} heal={pop.kind === 'heal' ? pop.amount : undefined} name={pop.why && pop.why !== 'attack' && pop.why !== 'strike back' ? pop.why : undefined} ms={1200 / speed} />
          )}
        </div>
      )}
    </div>
  );
}

/** The bar between the two lines during a battle: what's happening, the round, the speed and Skip; the result at the end. */
export function BattleBar({ playback, battle, onClose }: { playback: Playback; battle: LastBattle; onClose: () => void }) {
  const { frame, frames, index, done, speed, setSpeed, skip } = playback;
  const result = battle.winner === 'draw' ? 'A draw' : battle.winner === 0 ? 'You won!' : 'You lost';
  if (done)
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg bg-slate-950/85 px-4 py-1.5 text-slate-50 ring-1 ring-slate-600" data-keep-action>
        <span className="font-heading text-lg">{result}</span>
        {battle.pay > 0 && (
          <span className="text-sm text-yellow-200">
            +₱{battle.pay}
            {battle.payDay > 0 && ` (Pay Day ₱${battle.payDay})`}
            {battle.bill > 0 && ` (Bill ₱${battle.bill})`}
          </span>
        )}
        {battle.winner === 1 && <span className="text-sm text-red-300">−1 HP</span>}
        <button type="button" className={`${BUTTON} !bg-yellow-300 font-bold !text-gray-900 hover:!bg-yellow-200`} onClick={onClose}>
          Continue
        </button>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-keep-action>
      <span className="rounded-full bg-slate-950/85 px-2 py-0.5 text-xs text-slate-300">Round {frame.round}</span>
      <span className="min-w-0 max-w-full truncate rounded-full bg-slate-950/85 px-3 py-0.5 text-sm text-slate-50">{noteOf(frame, frames, index)}</span>
      <span className="flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={`${BUTTON} !px-2 ${speed === s ? '!bg-yellow-300 !text-gray-900' : ''}`} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
        <button type="button" className={BUTTON} onClick={skip}>
          Skip
        </button>
      </span>
    </div>
  );
}

/** The line of text between the lines: the frame's note, or what its mark did. */
function noteOf(frame: Frame, frames: Frame[], index: number): string {
  const name = (uid: string) => frame.lines.flat().find((f) => f.uid === uid)?.name ?? frames[Math.max(0, index - 1)]?.lines.flat().find((f) => f.uid === uid)?.name ?? '';
  const m = frame.mark;
  if (!m) return 'The battle begins!';
  switch (m.kind) {
    case 'note':
      return m.text;
    case 'attack':
      return `${name(m.uid)} attacks ${name(m.target)}!`;
    case 'damage':
      return `${name(m.uid)} takes ${m.amount}${m.why && m.why !== 'attack' && m.why !== 'strike back' ? ` (${m.why})` : ''}`;
    case 'heal':
      return m.amount ? `${name(m.uid)} heals ${m.amount} (${m.why})` : `${name(m.uid)} holds on (${m.why})`;
    case 'miss':
      return `${name(m.uid)}: ${m.why}`;
    case 'faint':
      return `${name(m.uid)} fainted!`;
  }
}
