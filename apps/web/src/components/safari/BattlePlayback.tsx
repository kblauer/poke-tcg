import { useEffect, useMemo, useRef, useState } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { glow, HEAL_RGB, hitShake, MOTION_MS, reducedMotion, strike } from '../../utils/cardMotion';
import { playbackFrames, type Frame, type Mark, type ShownFighter } from '../../utils/safariPlayback';
import { conditionTags } from '../../utils/conditionTags';
import { useSafariSpeed } from '../../utils/safariSpeed';
import { useTextStatus } from '../../hooks/useTextStatus';
import { BUTTON } from '../../utils/styles';
import { PopNumber } from '../ToolPops';
import { CARD, CardRow, EmptyPlace, PlaceSpacers, SynergyChips } from './SafariBoard';
import { TRAINERS, type TrainerName } from '@poke-tcg/safari/effects';
import { UnitCard } from './UnitCard';

export type LastBattle = NonNullable<SafariViewData['last']>;

/** How long a frame shows at 1×, by what it shows: an attack flies across, a number pops, a board change is seen. */
const BEAT_MS = { attack: 560, damage: 480, heal: 420, miss: 520, faint: 560, stat: 700, note: 650, start: 700 } as const;
/** An attack with its hits (Battlegrounds' way): the attacker's flight there and back, and the share of it at which it meets its target. */
const STRIKE_MS = 900;
const IMPACT = 0.42;
/** How long the hits' numbers stay up after the attacker is back. */
const HIT_HOLD_MS = 250;
/** A stat going down glows red (up: the heal's green). */
const DOWN_RGB = '248 113 113';

/** A mark that is part of an attack's exchange: the attack's and the strike back's damage and misses, landing at the impact. */
const isHit = (m: Mark | null | undefined, a: { uid: string; target: string }) =>
  !!m && ((m.kind === 'damage' && ['attack', 'strike back', 'rising'].includes(m.why)) || m.kind === 'miss') && (m.uid === a.uid || m.uid === a.target);
/** A frame the playback stops on: one that changes a number or the board. A line of text alone only goes to the log (the user's, 2026-11-22). */
const stopsOn = (m: Mark | null) => !!m && (m.kind !== 'note' || !!m.keep);

/**
 * A battle played back on the table (issue #239, section 8): each event that changes a number or the board a beat
 * (playbackFrames), at the speed picked in the site menu (useSafariSpeed), or skipped to the end. What only says
 * something (who attacks first, a synergy, a Trainer card, a round, a Special Condition) is never a beat of its own (the
 * user's, 2026-11-22: the start of a battle showed one line at a time): it goes to the battle's log (`texts`), and a
 * Special Condition shows as its tag. Changes of one kind made together (a synergy's, Rally's two neighbours) are one
 * beat. The page shows `frame`'s lines in the table's two rows (BattleLine) and the result between them at the end
 * (BattleResult).
 */
export function useBattlePlayback(battle: LastBattle) {
  const frames = useMemo(() => playbackFrames(battle.mine, battle.opponent, battle.events), [battle]);
  // Each attack with the hits that follow it (the user's, 2026-11-19: the damage lands as the cards meet, not on a beat
  // of its own): the attack's frame shows while the attacker flies, then its last hit's frame, all the hits at once.
  // And each run of stat changes with one cause, shown together on its last frame.
  const spans = useMemo(() => {
    const ends = new Map<number, number>();
    const starts = new Map<number, number>();
    const groups = new Map<number, number>();
    frames.forEach((f, i) => {
      if (f.mark?.kind === 'attack') {
        let j = i;
        while (j + 1 < frames.length && isHit(frames[j + 1]!.mark, f.mark)) j++;
        if (j === i) return;
        ends.set(i, j);
        starts.set(j, i);
      } else if (f.mark?.kind === 'stat' && !(frames[i - 1]?.mark?.kind === 'stat' && (frames[i - 1]!.mark as Extract<Mark, { kind: 'stat' }>).why === f.mark.why)) {
        let j = i;
        while (j + 1 < frames.length - 1 && frames[j + 1]!.mark?.kind === 'stat' && (frames[j + 1]!.mark as Extract<Mark, { kind: 'stat' }>).why === f.mark.why) j++;
        if (j === i) return;
        groups.set(i, j);
        starts.set(j, i);
      }
    });
    return { ends, starts, groups };
  }, [frames]);
  const texts = useMemo(() => frames.map((f, i) => noteOf(f, frames, i)), [frames]);
  const [index, setIndex] = useState(0);
  const [speed] = useSafariSpeed();
  const frame = frames[Math.min(index, frames.length - 1)]!;
  const done = index >= frames.length - 1;
  useEffect(() => {
    if (done) return;
    const end = spans.ends.get(index);
    // The next frame to stop on: the last one, or the next that shows something (a group of stat changes: its last).
    let next = index + 1;
    while (next < frames.length - 1 && !stopsOn(frames[next]!.mark)) next++;
    next = spans.groups.get(next) ?? next;
    const delay =
      end !== undefined ? (STRIKE_MS * IMPACT) / speed : spans.starts.has(index) && frame.mark?.kind !== 'stat' ? (STRIKE_MS * (1 - IMPACT) + HIT_HOLD_MS) / speed : BEAT_MS[index === 0 ? 'start' : (frame.mark?.kind ?? 'note')] / speed;
    const timer = window.setTimeout(() => setIndex(end ?? next), delay);
    return () => window.clearTimeout(timer);
  }, [index, done, speed, frame, spans, frames]);
  // The frame's marks: an exchange's impact shows every hit of it at once, with its attack; a group of stat changes, all of them.
  const start = spans.starts.get(index);
  const marks: Mark[] = start === undefined ? (frame.mark ? [frame.mark] : []) : frames.slice(start, index + 1).flatMap((f) => (f.mark ? [f.mark] : []));
  const attack = (start !== undefined ? frames[start]!.mark : frame.mark) as Mark | null;
  return { frames, frame, index, done, speed, marks, texts, attack: attack?.kind === 'attack' ? attack : null, skip: () => setIndex(frames.length - 1) };
}
export type Playback = ReturnType<typeof useBattlePlayback>;

/**
 * One side's line in a frame, in its row of the table, with its synergies (the opponent's above its cards, the player's
 * below; the player's Trainer as words: the user's). Always 6 places wide, filled from the left (the user's, 2026-11-22),
 * so a Pokémon is above or below the one across from it however many each side has left.
 */
export function BattleLine({ playback, side, units, types, trainer }: { playback: Playback; side: 0 | 1; units: Map<string, SafariUnit>; types: string[]; trainer?: TrainerName }) {
  const line = playback.frame.lines[side];
  const chips = (
    <span className="flex flex-wrap items-center justify-center gap-2">
      <SynergyChips types={types} quiet />
      {side === 0 && trainer && <TrainerWords trainer={trainer} mine />}
    </span>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {side === 1 && <div className="flex min-h-6 justify-center">{chips}</div>}
      <CardRow>
        {line.map((f) => (
          <BattleFighter key={f.uid} f={f} playback={playback} units={units} />
        ))}
        {!line.length && <EmptyPlace width={CARD} label={<span className="px-1 text-center text-slate-300">No Pokémon left</span>} />}
        <PlaceSpacers count={6 - Math.max(1, line.length)} />
      </CardRow>
      {side === 0 && <div className="flex min-h-7 justify-center">{chips}</div>}
    </div>
  );
}

/** A Trainer card played in a battle, as words (the user's: no card on the board), its effect on hover. */
export function TrainerWords({ trainer, mine = false }: { trainer: TrainerName; mine?: boolean }) {
  return (
    <span className="rounded-full bg-slate-950/85 px-2 py-0.5 text-xs text-slate-100 ring-1 ring-slate-600" title={`${trainer}: ${TRAINERS[trainer]}`}>
      <span className="text-slate-400">{mine ? 'Your Trainer: ' : 'Trainer: '}</span>
      {trainer}
    </span>
  );
}

/**
 * A Pokémon in a playback frame, with the battle page's card animations (utils/cardMotion.ts): it flies into its target
 * when it attacks (`strike`, Hearthstone Battlegrounds' way), both cards' damage landing as they meet, shakes with a red
 * glow when hit, glows green when healed, and fades out when it faints; the damage and healing rise off it as the battle
 * page's numbers (PopNumber). Its card shows its HP as it stands, with an HP bar and its Special Conditions.
 */
function BattleFighter({ f, playback, units }: { f: ShownFighter; playback: Playback; units: Map<string, SafariUnit> }) {
  const { frame, index, speed, marks, attack } = playback;
  // The flight moves the outer element, a hit shakes the inner one, so a struck-back attacker shakes where it meets.
  const ref = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const attacking = attack?.uid === f.uid;
  const targeted = attack?.target === f.uid;
  const own = marks.filter((m) => 'uid' in m && m.uid === f.uid && m.kind !== 'attack');
  const stats = own.filter((x): x is Extract<Mark, { kind: 'stat' }> => x.kind === 'stat');
  const attackChange = stats.reduce((sum, x) => sum + (x.attack ?? 0), 0);
  const hpChange = stats.reduce((sum, x) => sum + (x.hp ?? 0), 0);
  useEffect(() => {
    const el = card.current;
    if (!el || !ref.current || reducedMotion()) return;
    const m = frame.mark;
    // The attack's own frame: fly into the target (found on the table by its uid).
    if (m?.kind === 'attack' && m.uid === f.uid) {
      const target = document.querySelector<HTMLElement>(`[data-fighter="${m.target}"]`);
      if (target) strike(ref.current, target, STRIKE_MS / speed, IMPACT);
      return;
    }
    const before = new Set(el.getAnimations());
    let moved = false;
    if (own.some((x) => x.kind === 'damage')) (hitShake(el, null, 0), (moved = true));
    else if (own.some((x) => x.kind === 'heal' && x.amount > 0)) (glow(el, HEAL_RGB), (moved = true));
    // A stat changed: the heal's green glow for more, red for less.
    else if (stats.length) (glow(el, stats.some((x) => (x.attack ?? x.hp ?? 0) < 0) ? DOWN_RGB : HEAL_RGB), (moved = true));
    else if (own.some((x) => x.kind === 'faint')) (el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8%) scale(0.85)' }], { duration: MOTION_MS, fill: 'forwards' }), (moved = true));
    if (moved) for (const a of el.getAnimations()) if (!before.has(a)) a.playbackRate = speed;
  }, [index]);
  const pct = f.maxHp ? Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100)) : 0;
  // What rises off it: the hits' damage added up (Flurry's two), else a heal, else a miss.
  const damage = own.reduce((sum, x) => sum + (x.kind === 'damage' ? x.amount : 0), 0);
  const heal = own.find((x): x is Extract<Mark, { kind: 'heal' }> => x.kind === 'heal' && x.amount > 0);
  const miss = own.find((x): x is Extract<Mark, { kind: 'miss' }> => x.kind === 'miss');
  const named = own.find((x): x is Extract<Mark, { kind: 'damage' }> => x.kind === 'damage' && x.why !== 'attack' && x.why !== 'strike back' && x.why !== 'rising');
  const pop = damage ? { kind: 'damage' as const, amount: damage, why: named?.why ?? '' } : heal ? heal : miss ? miss : null;
  return (
    <div className={`relative ${attacking ? 'z-30' : ''}`} data-fighter={f.uid}>
      <div ref={ref} className="relative">
        <div ref={card}>
        <UnitCard id={f.unit ?? ''} unit={f.unit ? units.get(f.unit) : undefined} stats={{ attack: f.attack, hp: f.hp, abilities: f.abilities, shield: f.shield, spent: f.spent }} width="var(--safari-card)" lit={attacking || targeted}>
          <span className="absolute bottom-[11.6%] left-[25%] right-[25%] h-[2%] overflow-hidden rounded-full bg-slate-950/80">
            <span className={`block h-full transition-[width] duration-300 ${pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
          </span>
          <FighterConditions status={f.status} />
        </UnitCard>
        </div>
      {!pop && stats.length > 0 && (
        <div key={index} className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1">
          {attackChange !== 0 && <StatPop stat="Attack" amount={attackChange} why={stats.find((x) => x.attack)?.why ?? ''} ms={1400 / speed} />}
          {hpChange !== 0 && <StatPop stat="HP" amount={hpChange} why={stats.find((x) => x.hp)?.why ?? ''} ms={1400 / speed} />}
        </div>
      )}
      {pop && (
        <div key={index} className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          {pop.kind === 'miss' ? (
            <span className="tool-pop whitespace-nowrap rounded-full bg-slate-950/85 px-2 py-0.5 text-sm font-bold text-slate-50 ring-1 ring-slate-500" style={{ animationDuration: `${1200 / speed}ms` }}>
              {pop.why || 'Miss'}
            </span>
          ) : (
            <PopNumber damage={pop.kind === 'damage' ? pop.amount : undefined} heal={pop.kind === 'heal' ? pop.amount : undefined} name={pop.why && pop.why !== 'attack' && pop.why !== 'strike back' && pop.why !== 'rising' ? pop.why : undefined} ms={1200 / speed} />
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Between the two lines: nothing while a battle plays (the user's, 2026-11-22: its lines are in the site menu's log, the
 * speed and Skip there too), only the room it takes, so the rows don't move; at the end, the result and Continue.
 */
export function BattleResult({ playback, battle, onClose }: { playback: Playback; battle: LastBattle; onClose: () => void }) {
  const result = battle.winner === 'draw' ? 'A draw' : battle.winner === 0 ? 'You won!' : 'You lost';
  if (!playback.done) return <div className="min-h-11" aria-hidden />;
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-center gap-x-4 gap-y-1 self-center rounded-lg bg-slate-950/85 px-5 py-1.5 text-slate-50 ring-1 ring-slate-600" data-keep-action>
      <span className="font-heading text-xl">{result}</span>
      {battle.pay > 0 && (
        <span className="text-base text-yellow-200">
          +₱{battle.pay}
          {battle.payDay > 0 && ` (Pay Day ₱${battle.payDay})`}
          {battle.bill > 0 && ` (Bill ₱${battle.bill})`}
        </span>
      )}
      {battle.winner === 1 && <span className="text-base text-red-300">−1 HP</span>}
      <button type="button" className={`${BUTTON} !bg-yellow-300 !px-5 !py-1.5 font-bold !text-gray-900 hover:!bg-yellow-200`} onClick={onClose}>
        Continue
      </button>
    </div>
  );
}

/**
 * A change to a Pokémon's attack or HP for the battle, rising off its card as the battle page's healing does (PopNumber;
 * the user's, 2026-11-22): the number, large, and what it is and why under it. Attack up amber, down violet; HP green.
 */
function StatPop({ stat, amount, why, ms }: { stat: 'Attack' | 'HP'; amount: number; why: string; ms: number }) {
  const look =
    stat === 'HP'
      ? { number: 'text-emerald-300 [-webkit-text-stroke:1.5px_rgb(6_78_59)]', pill: 'bg-emerald-950/85 text-emerald-100 ring-emerald-400/60' }
      : amount > 0
        ? { number: 'text-amber-300 [-webkit-text-stroke:1.5px_rgb(120_53_15)]', pill: 'bg-amber-950/85 text-amber-100 ring-amber-400/60' }
        : { number: 'text-violet-300 [-webkit-text-stroke:1.5px_rgb(76_29_149)]', pill: 'bg-violet-950/85 text-violet-100 ring-violet-400/60' };
  return (
    <div className="tool-pop flex flex-col items-center" style={{ animationDuration: `${ms}ms` }}>
      <span className={`text-3xl font-black leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${look.number}`}>
        {amount > 0 ? '+' : '−'}
        {Math.abs(amount)}
      </span>
      <span className={`mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${look.pill}`}>
        {stat} · {why}
      </span>
    </div>
  );
}

/** A frame's line of text, for the battle's log: its note, or what its mark did. */
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
    case 'stat':
      return `${name(m.uid)}: ${(m.attack ?? m.hp ?? 0) > 0 ? '+' : '−'}${Math.abs(m.attack ?? m.hp ?? 0)} ${m.attack !== undefined ? 'attack' : 'HP'} (${m.why})`;
  }
}

/**
 * A fighter's Special Conditions as the battle page's cards show them (`conditionTags`): the round icons, or the text tags
 * with the Settings page's text status tags on (useTextStatus), in the card's top left corner below its name. Burned is
 * Safari Draft's own (its attack halved until its next attack), so its words are its own here.
 */
function FighterConditions({ status }: { status: readonly string[] }) {
  const [textStatus] = useTextStatus();
  if (!status.length) return null;
  const condition = status.includes('Confused') ? 'confused' : status.includes('Paralyzed') ? 'paralyzed' : null;
  const TITLES: Record<string, string> = { CNF: 'Confused: its attacks flip a coin (tails: 30 damage to itself, and it ends)', PAR: "Paralyzed: it misses its next attack and doesn't strike back until then", BRN: 'Burned: its attack is halved until it has made its next attack' };
  const tags = conditionTags({ condition, burned: status.includes('Burned'), poison: 0 }).map((t) => ({ ...t, title: TITLES[t.label] ?? t.title }));
  const text = textStatus ? tags : [];
  return (
    <span className="pointer-events-auto absolute left-[12%] top-[12.8%] flex flex-wrap items-start gap-0.5">
      {!textStatus &&
        tags.map((t) => (
          <span key={t.image} title={t.title} className="relative inline-block shrink-0">
            <img src={t.image} alt={t.title.split(':')[0]} draggable={false} className="h-[22px] w-[22px] drop-shadow" />
          </span>
        ))}
      {text.map((t) => (
        <span key={t.label} title={t.title} className={`${t.className} rounded px-[3px] text-[11px] font-bold leading-4 text-white shadow`}>
          {t.label}
        </span>
      ))}
    </span>
  );
}
