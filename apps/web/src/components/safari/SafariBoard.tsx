import type { Place } from '@poke-tcg/safari';
import { SYNERGIES, type SynergyType } from '@poke-tcg/safari/effects';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { useEscape } from '../../hooks/useEscape';
import { dropIn, reducedMotion } from '../../utils/cardMotion';
import { BUTTON } from '../../utils/styles';
import { EnergyIcon } from '../EnergyIcon';
import { TrainerCard, UnitCard } from './UnitCard';

type HeldCard = NonNullable<SafariViewData['board'][number]>;
const LEVEL_AT = [2, 4, 6];
/** The table's card widths (index.css's `.safari-cards`): the board's and the opponent's, and the inventory's. */
export const CARD = 'var(--safari-card)';
export const INVENTORY_CARD = 'var(--safari-inv)';

/** A board's type synergies: each type with 2 or more, its level (issue #239, 3: counted on the board as it stands). */
export function boardSynergies(types: readonly string[]): { type: SynergyType; count: number; level: number }[] {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .filter(([type, n]) => type in SYNERGIES && n >= 2)
    .map(([type, count]) => ({ type: type as SynergyType, count, level: LEVEL_AT.filter((at) => count >= at).length }))
    .sort((a, b) => b.count - a.count);
}

/** The synergy chips by a line; with none, a hint (`quiet`: nothing). */
export function SynergyChips({ types, quiet = false }: { types: readonly string[]; quiet?: boolean }) {
  const synergies = boardSynergies(types);
  if (!synergies.length && quiet) return null;
  if (!synergies.length) return <p className="text-xs text-slate-400">No type synergy: 2 Pokémon of a type give one.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {synergies.map((s) => (
        <span key={s.type} title={SYNERGIES[s.type].text} className="flex items-center gap-1 rounded-full bg-slate-950/85 py-0.5 pl-0.5 pr-2 text-xs text-slate-100 ring-1 ring-slate-600">
          <EnergyIcon type={s.type} size="xs" />
          {SYNERGIES[s.type].name} {'I'.repeat(s.level)}
          <span className="text-slate-400">
            {s.count}/{LEVEL_AT.find((at) => at > s.count) ?? 6}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A row of the table's places, centred; on a tall table 3 wide in 2 rows (`.safari-row`), but the inventory (`wraps` false). */
export function CardRow({ children, wraps = true }: { children: ReactNode; wraps?: boolean }) {
  return <div className={`flex items-end justify-center gap-[clamp(0.25rem,1cqw,0.75rem)] ${wraps ? 'safari-row' : ''}`}>{children}</div>;
}

/** An empty place on the table, the size of a card (`label` in it, faint). */
export function EmptyPlace({ width, label, onClick, lit }: { width: string; label?: ReactNode; onClick?: () => void; lit?: boolean }) {
  return (
    <div onClick={onClick} className={`flex shrink-0 items-center justify-center rounded-[6%/4.5%] border-2 border-dashed text-[10px] text-slate-500 ${lit ? 'cursor-pointer border-yellow-300/70' : 'border-slate-600/70'}`} style={{ width, aspectRatio: '63 / 88' }}>
      {label}
    </div>
  );
}

const samePlace = (a: Place | null, b: Place) => !!a && a.zone === b.zone && a.at === b.at;

/**
 * The player's side of the table: the 6 board places (left to right, the battle's order) with their synergies, and the 6
 * inventory places under them, smaller, as a hand. A card is picked up by clicking it (or dragged, on a big screen) and
 * put down by clicking (or dropping on) another place: the two swap, an empty place too (MOVE). A picked-up card can be
 * sold, a Trainer card chosen for the next battle. `canSell`: not once an opponent is chosen (the draft's rule). A card
 * new to a place drops in, as the battle page's do.
 */
export function PlayerSide({ view, units, busy, canSell, act, board }: { view: SafariViewData; units: Map<string, SafariUnit>; busy: boolean; canSell: boolean; act: (action: { type: 'MOVE'; from: Place; to: Place } | { type: 'SELL'; place: Place } | { type: 'SET_TRAINER'; key: number | null }) => void; board?: ReactNode }) {
  const [held, setHeld] = useState<Place | null>(null);
  useEscape(() => setHeld(null), !!held);
  const at = (p: Place) => (p.zone === 'board' ? view.board : view.inventory)[p.at] ?? null;
  const heldCard = held && at(held);

  const put = (to: Place, from = held) => {
    if (!from || busy) return;
    setHeld(null);
    if (!samePlace(from, to)) act({ type: 'MOVE', from, to });
  };
  const click = (p: Place) => {
    if (held) return put(p);
    if (at(p)) setHeld(p);
  };

  const slot = (p: Place) => {
    const card = at(p);
    const lit = samePlace(held, p);
    const width = p.zone === 'board' ? CARD : INVENTORY_CARD;
    return (
      <div
        key={`${p.zone}${p.at}`}
        className={`relative ${held && !lit ? 'cursor-pointer' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const from = JSON.parse(e.dataTransfer.getData('text/plain') || 'null') as Place | null;
          if (from) put(p, from);
        }}
      >
        {card ? (
          <Arriving id={card.key}>
            <div draggable={!busy} onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify(p))}>
              <HeldCardView card={card} units={units} view={view} width={width} lit={lit} onClick={() => (lit ? setHeld(null) : click(p))} />
            </div>
          </Arriving>
        ) : (
          <EmptyPlace width={width} label={p.zone === 'board' ? p.at + 1 : ''} lit={!!held} onClick={() => click(p)} />
        )}
      </div>
    );
  };

  const types = view.board.flatMap((c) => (c?.kind === 'pokemon' ? [units.get(c.unit)?.type ?? ''] : []));
  return (
    <>
      {board ?? (
        <>
          <CardRow>{view.board.map((_, i) => slot({ zone: 'board', at: i }))}</CardRow>
          <div className="flex min-h-7 flex-wrap items-center justify-center gap-2">
            {held && heldCard ? (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg bg-slate-950/85 px-2 py-1 text-sm ring-1 ring-slate-600" data-keep-action>
                <span className="text-slate-100">{heldCard.kind === 'pokemon' ? (units.get(heldCard.unit)?.name ?? 'Pokémon') : heldCard.trainer}: click a place to move it.</span>
                {heldCard.kind === 'trainer' && (
                  <button type="button" className={BUTTON} disabled={busy} onClick={() => (act({ type: 'SET_TRAINER', key: view.trainer === heldCard.key ? null : heldCard.key }), setHeld(null))}>
                    {view.trainer === heldCard.key ? "Don't use it next battle" : 'Use it next battle'}
                  </button>
                )}
                {canSell && (
                  <button type="button" className={BUTTON} disabled={busy} onClick={() => (act({ type: 'SELL', place: held }), setHeld(null))}>
                    Sell for ₱{view.prices.sell[heldCard.key] ?? 0}
                  </button>
                )}
                <button type="button" className={BUTTON} onClick={() => setHeld(null)}>
                  Put down
                </button>
              </div>
            ) : (
              <SynergyChips types={types} />
            )}
          </div>
        </>
      )}
      <div className="rounded-lg bg-slate-950/40 px-2 pb-1.5 pt-1 ring-1 ring-slate-700/60">
        <div className="mb-1 text-center text-[10px] uppercase tracking-wide text-slate-400">Inventory</div>
        <CardRow wraps={false}>{view.inventory.map((_, i) => slot({ zone: 'inventory', at: i }))}</CardRow>
      </div>
    </>
  );
}

/** Its child drops in (the battle page's dropIn) whenever `id` changes: a card new to its place. */
export function Arriving({ id, children }: { id: string | number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const before = useRef(id);
  useEffect(() => {
    if (before.current === id) return;
    before.current = id;
    if (ref.current && !reducedMotion()) dropIn(ref.current);
  }, [id]);
  return <div ref={ref}>{children}</div>;
}

/** A card held: a Pokémon with its numbers as it fights, or a Trainer card (marked when it's the next battle's). */
function HeldCardView({ card, units, view, width, lit, onClick }: { card: HeldCard; units: Map<string, SafariUnit>; view: SafariViewData; width: string; lit: boolean; onClick: () => void }) {
  if (card.kind === 'trainer')
    return (
      <TrainerCard trainer={card.trainer} width={width} lit={lit} onClick={onClick}>
        {view.trainer === card.key && <span className="absolute inset-x-1 bottom-1 rounded bg-yellow-300 text-center text-[10px] font-bold text-gray-900">Next battle</span>}
      </TrainerCard>
    );
  return <UnitCard id={card.unit} unit={units.get(card.unit)} stats={view.stats[card.key]} golden={card.golden} width={width} lit={lit} onClick={onClick} />;
}
