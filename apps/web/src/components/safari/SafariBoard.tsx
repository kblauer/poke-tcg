import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { Place } from '@poke-tcg/safari';
import { SYNERGIES, type SynergyType } from '@poke-tcg/safari/effects';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { useEscape } from '../../hooks/useEscape';
import { dropIn, reducedMotion } from '../../utils/cardMotion';
import { centerOnPointer } from '../../utils/dragOverlay';
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

/**
 * Places left empty in a row of 6, taking a card's room and showing nothing: a line shorter than 6 is filled from the
 * left, so its Pokémon stay above or below the ones across from them (the user's, 2026-11-22).
 */
export function PlaceSpacers({ count, width = CARD }: { count: number; width?: string }) {
  return (
    <>
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <div key={`spacer-${i}`} aria-hidden className="shrink-0" style={{ width, aspectRatio: '63 / 88' }} />
      ))}
    </>
  );
}

const samePlace = (a: Place | null, b: Place) => !!a && a.zone === b.zone && a.at === b.at;
const placeId = (p: Place) => `${p.zone}-${p.at}`;
const placeOf = (id: string | number): Place => {
  const [zone, at] = String(id).split('-');
  return { zone: zone as Place['zone'], at: Number(at) };
};

/**
 * The player's side of the table: the 6 board places (left to right, the battle's order) with their synergies, and the 6
 * inventory places under them, smaller, as a hand. A card is picked up by clicking it and put down by clicking another
 * place, or dragged there as the battle page's cards are (dnd-kit: the card follows the pointer, tilted; the place under
 * it lifts and glows green, red where it can't go): the two swap, an empty place too (MOVE). A picked-up card can be
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

  // Dragging, as the battle page's hand: a 6 px move starts it, so a click still picks the card up.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<Place | null>(null);
  const draggedCard = dragging && at(dragging);
  /** Whether the dragged card may go to `to`: Trainer cards stay in the inventory, and one can't be swapped onto the board. */
  const fits = (from: Place, to: Place) => {
    const a = at(from);
    const b = at(to);
    return !((a?.kind === 'trainer' && to.zone === 'board') || (b?.kind === 'trainer' && from.zone === 'board'));
  };
  const onDragStart = (e: DragStartEvent) => {
    setHeld(null);
    setDragging(placeOf(e.active.id));
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over) return;
    const from = placeOf(e.active.id);
    const to = placeOf(e.over.id);
    if (fits(from, to)) put(to, from);
  };

  const slot = (p: Place) => {
    const card = at(p);
    const lit = samePlace(held, p);
    const width = p.zone === 'board' ? CARD : INVENTORY_CARD;
    return (
      <DropPlace key={placeId(p)} place={p} disabled={busy} fits={!dragging || fits(dragging, p)} className={held && !lit ? 'cursor-pointer' : ''}>
        {card ? (
          <Arriving id={card.key}>
            <DragCard place={p} disabled={busy}>
              <HeldCardView card={card} units={units} view={view} width={width} lit={lit} onClick={() => (lit ? setHeld(null) : click(p))} />
            </DragCard>
          </Arriving>
        ) : (
          <EmptyPlace width={width} label={p.zone === 'board' ? p.at + 1 : ''} lit={!!held} onClick={() => click(p)} />
        )}
      </DropPlace>
    );
  };

  const types = view.board.flatMap((c) => (c?.kind === 'pokemon' ? [units.get(c.unit)?.type ?? ''] : []));
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
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
      <DragOverlay dropAnimation={null} modifiers={[centerOnPointer]}>
        {dragging && draggedCard ? (
          // As the battle page's: the card tilted under the pointer, a little see-through.
          <div className="flex h-full w-full items-center justify-center">
            <div className="rotate-3 cursor-grabbing opacity-90">
              <HeldCardView card={draggedCard} units={units} view={view} width={dragging.zone === 'board' ? CARD : INVENTORY_CARD} lit={false} onClick={() => {}} />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** A place a card can be dropped on: it lifts and glows green under a card that may go there (the battle page's slot), red where it can't. */
function DropPlace({ place, disabled, fits, className, children }: { place: Place; disabled: boolean; fits: boolean; className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: placeId(place), disabled });
  const ring = !isOver ? '' : fits ? '-translate-y-1 scale-105 rounded-lg ring-4 ring-emerald-300 shadow-[0_0_28px_6px_rgba(52,211,153,0.8)]' : 'rounded-lg ring-4 ring-red-400 shadow-[0_0_24px_4px_rgba(248,113,113,0.7)]';
  return (
    <div ref={setNodeRef} className={`relative transition ${ring} ${className}`}>
      {children}
    </div>
  );
}

/** A card that can be dragged to another place: faded where it was while it's carried (the battle page's hand card). */
function DragCard({ place, disabled, children }: { place: Place; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: placeId(place), disabled });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} data-keep-action className={`touch-none ${isDragging ? 'opacity-30' : ''}`}>
      {children}
    </div>
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
