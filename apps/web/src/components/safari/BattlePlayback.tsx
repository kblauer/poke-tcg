import { useEffect, useMemo, useState } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { useEscape } from '../../hooks/useEscape';
import { playbackFrames, type Frame, type ShownFighter } from '../../utils/safariPlayback';
import { BUTTON, DIALOG_BACKDROP } from '../../utils/styles';
import { TrainerCard, UnitCard } from './UnitCard';
import { BATTLE_TERRAIN, DIFFICULTY_LABEL, opponentSprite } from './safariArt';
import { SynergyChips } from './SafariBoard';

type LastBattle = NonNullable<SafariViewData['last']>;

/** How long a frame shows at 1×, by what it shows: an attack lunges, a number pops, a note is read. */
const BEAT_MS = { attack: 520, damage: 420, heal: 380, miss: 520, faint: 520, note: 650, start: 900 } as const;
const SPEEDS = [1, 2, 4] as const;

/**
 * A battle played back (issue #239, section 8): the opponent's line above, the player's below, on FireRed's tall grass,
 * each event a beat (playbackFrames): the attacker lunging at its target, damage and healing popping as numbers, fainted
 * Pokémon fading out of their lines, the start's synergies and Trainers and each round as a line of text. 1×, 2× or 4×,
 * or skipped to the end; the result and what it paid at the end, then Continue (or Escape) closes it.
 */
export function BattlePlayback({ battle, units, cardWidth, onClose }: { battle: LastBattle; units: Map<string, SafariUnit>; cardWidth: string; onClose: () => void }) {
  const frames = useMemo(() => playbackFrames(battle.mine, battle.opponent, battle.events), [battle]);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const frame = frames[Math.min(index, frames.length - 1)]!;
  const done = index >= frames.length - 1;
  useEscape(onClose);

  useEffect(() => {
    if (done) return;
    const kind = index === 0 ? 'start' : (frame.mark?.kind ?? 'note');
    const timer = window.setTimeout(() => setIndex((i) => i + 1), BEAT_MS[kind] / speed);
    return () => window.clearTimeout(timer);
  }, [index, done, speed, frame]);

  const sprite = opponentSprite(battle.against);
  const result = battle.winner === 'draw' ? 'A draw' : battle.winner === 0 ? 'You won!' : 'You lost';
  return (
    <div className={`${DIALOG_BACKDROP} z-[1100]`}>
      <div className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg ring-1 ring-slate-600" data-keep-action>
        {/* FireRed's tall grass behind the battle (over game art: its text kept light in every theme). */}
        <div className="absolute inset-0 bg-cover bg-center [image-rendering:pixelated]" style={{ backgroundImage: `url(${BATTLE_TERRAIN})` }} />
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative flex flex-col gap-3 overflow-y-auto p-3 sm:p-4">
          <header className="flex items-center gap-3">
            {sprite ? <img src={sprite} alt="" className="h-14 w-14 [image-rendering:pixelated]" /> : <UnitCard id={battle.opponent.units[0]!.id} unit={units.get(battle.opponent.units[0]!.id)} width="2.5rem" />}
            <div className="min-w-0">
              <div className="font-heading text-slate-50 [text-shadow:0_1px_2px_black]">{battle.against.name}</div>
              <div className="text-xs text-slate-50/80 [text-shadow:0_1px_2px_black]">
                {DIFFICULTY_LABEL[battle.against.difficulty]} · Round {frame.round}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className={`${BUTTON} ${speed === s ? '!bg-yellow-300 !text-gray-900' : ''}`} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
              {!done && (
                <button type="button" className={BUTTON} onClick={() => setIndex(frames.length - 1)}>
                  Skip
                </button>
              )}
            </div>
          </header>

          <Side frame={frame} side={1} units={units} cardWidth={cardWidth} trainer={battle.opponent.trainer} types={battle.opponent.units.map((u) => u.type)} />
          <div className="mx-auto min-h-8 w-fit max-w-full rounded-full bg-slate-950/80 px-4 py-1 text-center text-sm text-slate-50">{noteOf(frame, frames, index) ?? ' '}</div>
          <Side frame={frame} side={0} units={units} cardWidth={cardWidth} trainer={battle.mine.trainer} types={battle.mine.units.map((u) => u.type)} />

          {done && (
            <div className="mx-auto flex flex-col items-center gap-2 rounded-lg bg-slate-950/85 px-6 py-3 text-center text-slate-50 ring-1 ring-slate-600">
              <div className="font-heading text-xl">{result}</div>
              {battle.pay > 0 && (
                <div className="text-sm text-yellow-200">
                  +₱{battle.pay}
                  {battle.payDay > 0 && ` (Pay Day ₱${battle.payDay})`}
                  {battle.bill > 0 && ` (Bill ₱${battle.bill})`}
                </div>
              )}
              {battle.winner === 1 && <div className="text-sm text-red-300">−1 HP</div>}
              <button type="button" className={BUTTON} onClick={onClose}>
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The line of text under the opponent's line: the frame's note, or what its mark did. */
function noteOf(frame: Frame, frames: Frame[], index: number): string | null {
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

/** One side's line in a frame, with its Trainer and synergies. */
function Side({ frame, side, units, cardWidth, trainer, types }: { frame: Frame; side: 0 | 1; units: Map<string, SafariUnit>; cardWidth: string; trainer: string | undefined; types: string[] }) {
  const line = frame.lines[side];
  return (
    <div className={`flex flex-col gap-1.5 ${side === 1 ? '' : 'flex-col-reverse'}`}>
      <div className="flex min-h-[2rem] flex-wrap items-end justify-center gap-2">
        {line.map((f) => (
          <Fighter key={f.uid} f={f} frame={frame} units={units} cardWidth={cardWidth} />
        ))}
        {!line.length && <span className="rounded-full bg-slate-950/80 px-3 py-0.5 text-sm text-slate-50">No Pokémon left</span>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {trainer && <TrainerCard trainer={trainer as never} width="2rem" />}
        <SynergyChips types={types} quiet />
      </div>
    </div>
  );
}

/** A Pokémon in a playback frame: its card, its HP bar and conditions, lunging when it attacks, shaking when it's hit. */
function Fighter({ f, frame, units, cardWidth }: { f: ShownFighter; frame: Frame; units: Map<string, SafariUnit>; cardWidth: string }) {
  const m = frame.mark;
  const attacking = m?.kind === 'attack' && m.uid === f.uid;
  const targeted = m?.kind === 'attack' && m.target === f.uid;
  const hit = m?.kind === 'damage' && m.uid === f.uid;
  const healed = m?.kind === 'heal' && m.uid === f.uid && m.amount > 0;
  const missed = m?.kind === 'miss' && m.uid === f.uid;
  const lunge = attacking ? (f.side === 0 ? '-translate-y-4' : 'translate-y-4') : '';
  const pct = f.maxHp ? Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100)) : 0;
  return (
    <div className={`relative transition-all duration-200 ${lunge} ${f.fainted ? 'scale-90 opacity-0' : ''} ${hit ? 'animate-[safari-shake_0.3s]' : ''}`}>
      <UnitCard id={f.unit ?? ''} unit={f.unit ? units.get(f.unit) : undefined} stats={{ attack: f.attack, hp: f.hp }} width={cardWidth} lit={attacking || targeted}>
        <span className="absolute inset-x-1 bottom-8 h-1.5 overflow-hidden rounded-full bg-slate-950/80">
          <span className={`block h-full ${pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
        </span>
        {!!f.status.length && (
          <span className="absolute inset-x-0 top-6 flex flex-col items-center gap-0.5">
            {f.status.map((s) => (
              <span key={s} className="rounded bg-purple-500 px-1 text-[9px] font-bold uppercase text-gray-900">
                {s}
              </span>
            ))}
          </span>
        )}
      </UnitCard>
      {(hit || healed || missed) && (
        <span className={`pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 animate-[safari-pop_0.5s_ease-out] whitespace-nowrap rounded px-1.5 text-lg font-bold [text-shadow:0_1px_3px_black] ${hit ? 'text-red-400' : healed ? 'text-emerald-300' : 'text-slate-50'}`}>
          {hit ? `−${m.amount}` : healed ? `+${m.amount}` : 'Miss'}
        </span>
      )}
    </div>
  );
}
