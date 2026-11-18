import type { Place } from '@poke-tcg/safari';
import { SYNERGIES, type SynergyType } from '@poke-tcg/safari/effects';
import { useState } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { useEscape } from '../../hooks/useEscape';
import { BUTTON } from '../../utils/styles';
import { EnergyIcon } from '../EnergyIcon';
import { TrainerCard, UnitCard } from './UnitCard';

type HeldCard = NonNullable<SafariViewData['board'][number]>;
const LEVEL_AT = [2, 4, 6];

/** A board's type synergies: each type with 2 or more, its level (issue #239, 3: counted on the board as it stands). */
export function boardSynergies(types: readonly string[]): { type: SynergyType; count: number; level: number }[] {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .filter(([type, n]) => type in SYNERGIES && n >= 2)
    .map(([type, count]) => ({ type: type as SynergyType, count, level: LEVEL_AT.filter((at) => count >= at).length }))
    .sort((a, b) => b.count - a.count);
}

/** The synergy chips under a board; with none, a hint (`quiet`: nothing, over the battle's grass). */
export function SynergyChips({ types, quiet = false }: { types: readonly string[]; quiet?: boolean }) {
  const synergies = boardSynergies(types);
  if (!synergies.length && quiet) return null;
  if (!synergies.length) return <p className="text-xs text-slate-400">No type synergy: 2 Pokémon of a type give one.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {synergies.map((s) => (
        <span key={s.type} title={SYNERGIES[s.type].text} className="flex items-center gap-1 rounded-full bg-slate-900/85 py-0.5 pl-0.5 pr-2 text-xs text-slate-100 ring-1 ring-slate-600">
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

const samePlace = (a: Place | null, b: Place) => !!a && a.zone === b.zone && a.at === b.at;

/**
 * The player's 6 board places (left to right, the battle's order) and 6 inventory places. A card is picked up by
 * clicking it (or dragged, on a big screen) and put down by clicking (or dropping on) another place: the two swap, an
 * empty place too (MOVE). A picked-up card can be sold, a Trainer card chosen for the next battle. `canSell`: not once an
 * opponent is chosen (the draft's rule).
 */
export function SafariBoard({ view, units, cardWidth, busy, canSell, act }: { view: SafariViewData; units: Map<string, SafariUnit>; cardWidth: string; busy: boolean; canSell: boolean; act: (action: { type: 'MOVE'; from: Place; to: Place } | { type: 'SELL'; place: Place } | { type: 'SET_TRAINER'; key: number | null }) => void }) {
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
    return (
      <div
        key={`${p.zone}${p.at}`}
        className={`relative flex w-full items-center justify-center rounded-lg ${card ? '' : 'bg-slate-900/40 ring-1 ring-dashed ring-slate-500/60'} ${held && !lit ? 'cursor-pointer' : ''}`}
        style={{ maxWidth: cardWidth, aspectRatio: '63 / 88' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const from = JSON.parse(e.dataTransfer.getData('text/plain') || 'null') as Place | null;
          if (from) put(p, from);
        }}
        onClick={card ? undefined : () => click(p)}
      >
        {card && (
          <div className="w-full" draggable={!busy} onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify(p))}>
            <HeldCardView card={card} units={units} view={view} width="100%" lit={lit} onClick={() => (lit ? setHeld(null) : click(p))} />
          </div>
        )}
        {!card && <span className="pointer-events-none text-[10px] text-slate-400">{p.zone === 'board' ? p.at + 1 : ''}</span>}
      </div>
    );
  };

  const types = view.board.flatMap((c) => (c?.kind === 'pokemon' ? [units.get(c.unit)?.type ?? ''] : []));
  return (
    <div className="space-y-3">
      <section className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <h3 className="font-heading text-sm text-slate-50">Your board</h3>
          <span className="text-xs text-slate-300">Left to right is the order they attack in.</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">{view.board.map((_, i) => slot({ zone: 'board', at: i }))}</div>
        <SynergyChips types={types} />
      </section>
      <section className="space-y-1.5">
        <h3 className="font-heading text-sm text-slate-50">Inventory</h3>
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2">{view.inventory.map((_, i) => slot({ zone: 'inventory', at: i }))}</div>
      </section>
      {held && heldCard && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/85 p-2 text-sm ring-1 ring-slate-600" data-keep-action>
          <span className="text-slate-100">{heldCard.kind === 'pokemon' ? (units.get(heldCard.unit)?.name ?? 'Pokémon') : heldCard.trainer}: click another place to move it there.</span>
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
      )}
    </div>
  );
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
