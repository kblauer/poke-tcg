import { CARD_TYPES, EMPTY_FILTER, OWNERSHIP_OPTIONS, SORT_OPTIONS, STAGES, type CardFilter, type CardSort, type Ownership, type SortKey } from '../utils/cardList';

const input = 'rounded bg-slate-800 px-2 py-1 text-sm outline-none ring-yellow-300 focus:ring-1';
// The same toggle as the deck builder's.
const toggle = 'rounded px-2 py-1 text-sm transition';
const on = 'bg-yellow-300 text-slate-900';
const off = 'bg-slate-800 text-slate-300 hover:bg-slate-700';

/** Parses a number field; empty means "no bound". */
const toBound = (value: string) => (value === '' ? null : Math.max(0, Number(value)));

/** Search, filters (unlocked or locked, and implemented only, included) and sort controls for the card browser. */
export function CardFilters({
  filter,
  sort,
  sets,
  shown,
  total,
  onFilterChange,
  onSortChange,
}: {
  filter: CardFilter;
  sort: CardSort;
  /** Set names for the set filter, in release order. */
  sets: string[];
  /** Cards matching the filters, out of `total`. */
  shown: number;
  total: number;
  onFilterChange: (filter: CardFilter) => void;
  onSortChange: (sort: CardSort) => void;
}) {
  const set = (patch: Partial<CardFilter>) => onFilterChange({ ...filter, ...patch });
  return (
    <div className="space-y-2 rounded-lg bg-slate-900 p-3">
      <input
        type="search"
        placeholder="Search by name or attack…"
        value={filter.search}
        onChange={(e) => set({ search: e.target.value })}
        className={`${input} w-full`}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={filter.set ?? ''} onChange={(e) => set({ set: e.target.value || null })} className={input} aria-label="Set">
          <option value="">All sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filter.type ?? ''} onChange={(e) => set({ type: e.target.value || null })} className={input} aria-label="Type">
          <option value="">All types</option>
          {CARD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={filter.stage ?? ''} onChange={(e) => set({ stage: e.target.value || null })} className={input} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-slate-400">
          Max attack
          <input
            type="number"
            min={0}
            step={10}
            placeholder="min"
            value={filter.minAttack ?? ''}
            onChange={(e) => set({ minAttack: toBound(e.target.value) })}
            className={`${input} w-16`}
          />
          –
          <input
            type="number"
            min={0}
            step={10}
            placeholder="max"
            value={filter.maxAttack ?? ''}
            onChange={(e) => set({ maxAttack: toBound(e.target.value) })}
            className={`${input} w-16`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-slate-400">
          Sort by
          <select value={sort.key} onChange={(e) => onSortChange({ ...sort, key: e.target.value as SortKey })} className={input}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`${input} hover:bg-slate-700`}
          onClick={() => onSortChange({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
          title="Reverse the order"
        >
          {sort.dir === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
        <select value={filter.ownership} onChange={(e) => set({ ownership: e.target.value as Ownership })} className={input} aria-label="Unlocked or locked">
          {OWNERSHIP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          className={`${toggle} ${filter.implementedOnly ? on : off}`}
          aria-pressed={filter.implementedOnly}
          title="Only cards whose attacks, powers and effects all work in the game. Other cards' Pokémon can still attack for their base damage."
          onClick={() => set({ implementedOnly: !filter.implementedOnly })}
        >
          Implemented only
        </button>
        <button className="text-slate-400 hover:text-slate-200" onClick={() => onFilterChange(EMPTY_FILTER)}>
          Clear filters
        </button>
        <span className="ml-auto text-slate-400">
          {shown === total ? `${total} cards` : `${shown} of ${total} cards`}
        </span>
      </div>
    </div>
  );
}
