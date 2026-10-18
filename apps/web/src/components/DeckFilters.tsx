import type { EnergyType } from '@poke-tcg/game-engine';
import { CARD_TYPES, OWNERSHIP_OPTIONS, type Ownership } from '../utils/cardList';
import { EnergyIcon } from './EnergyIcon';
import { CARD_KINDS, DECK_SORTS, EMPTY_DECK_FILTER, POKEMON_STAGES, type CardKind, type DeckFilter, type DeckSort } from '../utils/deckBuilder';

const input = 'rounded bg-slate-800 px-2 py-1 text-sm outline-none ring-yellow-300 focus:ring-1';
const toggle = 'rounded px-2 py-1 text-sm transition';
const on = 'bg-yellow-300 text-slate-900';
const off = 'bg-slate-800 text-slate-300 hover:bg-slate-700';

/** Parses a number field; empty means "no bound". */
const toBound = (value: string) => (value === '' ? null : Math.max(0, Number(value)));

/** The list with the value added, or taken out if it's there. */
const flip = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

/**
 * The deck builder's card search: name, set, sort, unlocked or locked, "implemented only", kind toggles
 * (Pokémon, Trainer, Energy), type toggles (a Pokémon's type or the Energy's, see filterForDeck) and the
 * Pokémon filters.
 */
export function DeckFilters({
  filter,
  sort,
  sets,
  shown,
  total,
  onChange,
  onSortChange,
}: {
  filter: DeckFilter;
  sort: DeckSort;
  onSortChange: (sort: DeckSort) => void;
  /** Set names, in release order. */
  sets: string[];
  shown: number;
  total: number;
  onChange: (filter: DeckFilter) => void;
}) {
  const set = (patch: Partial<DeckFilter>) => onChange({ ...filter, ...patch });
  return (
    <div className="space-y-2 rounded-lg bg-slate-900 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          placeholder="Search by name or attack…"
          value={filter.search}
          onChange={(e) => set({ search: e.target.value })}
          className={`${input} min-w-40 flex-1`}
        />
        <select value={filter.set ?? ''} onChange={(e) => set({ set: e.target.value || null })} className={input} aria-label="Release set">
          <option value="">All sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-slate-400">
          Sort by
          <select value={sort} onChange={(e) => onSortChange(e.target.value as DeckSort)} className={input}>
            {DECK_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {CARD_KINDS.map((k) => (
          <button
            key={k.value}
            className={`${toggle} ${filter.kinds.includes(k.value) ? on : off}`}
            aria-pressed={filter.kinds.includes(k.value)}
            title={`Show ${k.label === 'Energy' ? 'Energy' : `${k.label}s`} (with none on, every kind shows)`}
            onClick={() => set({ kinds: flip<CardKind>(filter.kinds, k.value) })}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Type</span>
        {CARD_TYPES.map((t) => (
          <button
            key={t}
            className={`${toggle} flex items-center gap-1 ${filter.types.includes(t) ? on : off}`}
            aria-pressed={filter.types.includes(t)}
            title={`${t} Pokémon and ${t} Energy${t === 'Colorless' ? ' (Double Colorless and other special Energy with no type of its own)' : ''}`}
            onClick={() => set({ types: flip(filter.types, t) })}
          >
            <EnergyIcon type={t.toLowerCase() as EnergyType} size="panel" />
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Pokémon</span>
        <select value={filter.stage ?? ''} onChange={(e) => set({ stage: e.target.value || null })} className={input} aria-label="Evolution stage">
          <option value="">Any stage</option>
          {POKEMON_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-slate-400">
          HP
          <input
            type="number"
            min={0}
            step={10}
            placeholder="min"
            value={filter.minHp ?? ''}
            onChange={(e) => set({ minHp: toBound(e.target.value) })}
            className={`${input} w-16`}
          />
          –
          <input
            type="number"
            min={0}
            step={10}
            placeholder="max"
            value={filter.maxHp ?? ''}
            onChange={(e) => set({ maxHp: toBound(e.target.value) })}
            className={`${input} w-16`}
          />
        </label>
        <button
          className={`${toggle} ${filter.hasAbility ? on : off}`}
          aria-pressed={filter.hasAbility}
          title="Has a Pokémon Power, Poké-Power or Poké-Body"
          onClick={() => set({ hasAbility: !filter.hasAbility })}
        >
          Has ability
        </button>
        <button className="text-slate-400 hover:text-slate-200" onClick={() => onChange(EMPTY_DECK_FILTER)}>
          Clear filters
        </button>
        <span className="ml-auto text-slate-400">{shown === total ? `${total} cards` : `${shown} of ${total} cards`}</span>
      </div>
    </div>
  );
}
