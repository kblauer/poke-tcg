import type { EnergyType } from '@poke-tcg/game-engine';
import { CARD_TYPES } from '../utils/cardList';
import { EnergyIcon } from './EnergyIcon';
import {
  DECK_SORTS,
  EMPTY_DECK_FILTER,
  POKEMON_STAGES,
  withoutPokemonFilters,
  type DeckFilter,
  type DeckSort,
} from '../utils/deckBuilder';

const input = 'rounded bg-slate-800 px-2 py-1 text-sm outline-none ring-yellow-300 focus:ring-1';
const toggle = 'rounded px-2 py-1 text-sm transition';
const on = 'bg-yellow-300 text-slate-900';
const off = 'bg-slate-800 text-slate-300 hover:bg-slate-700';

/** The Pokémon dropdowns' value while Trainers or Energy are shown instead. */
const OTHER = 'other';

/** Parses a number field; empty means "no bound". */
const toBound = (value: string) => (value === '' ? null : Math.max(0, Number(value)));

/** The deck builder's card search: name, set, Pokémon filters, Trainer toggles, "implemented only" and the sort. */
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
  /**
   * While the Trainer or Energy toggles are on, the Pokémon dropdowns show "—" (OTHER), so picking "Any
   * stage" or "Any type" is a change, and switches back to every Pokémon.
   */
  const otherGroup = filter.trainers || filter.energies.length > 0;
  /** A Pokémon filter: the search shows Pokémon only, so the Trainer toggles go off. */
  const setPokemon = (patch: Partial<DeckFilter>) => onChange({ ...filter, ...patch, pokemon: true, trainers: false, energies: [] });
  /** The Trainer toggle going on clears the Pokémon filters and Energy toggles, so only Trainers show. */
  const flipTrainers = () =>
    filter.trainers ? set({ trainers: false }) : onChange({ ...withoutPokemonFilters(filter), trainers: true, energies: [] });
  /** An Energy toggle going on clears the Pokémon filters and Trainer toggles, so only Energy shows. */
  const flipEnergy = (type: string) =>
    filter.energies.includes(type)
      ? set({ energies: filter.energies.filter((x) => x !== type) })
      : onChange({ ...withoutPokemonFilters(filter), trainers: false, energies: [...filter.energies, type] });
  return (
    <div className="space-y-2 rounded-lg bg-slate-900 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          placeholder="Search by name…"
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
        <span className="text-slate-400">Pokémon</span>
        <select value={otherGroup ? OTHER : (filter.stage ?? '')} onChange={(e) => setPokemon({ stage: e.target.value || null })} className={input} aria-label="Evolution stage">
          <option value={OTHER} hidden disabled>
            —
          </option>
          <option value="">Any stage</option>
          {POKEMON_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={otherGroup ? OTHER : (filter.type ?? '')} onChange={(e) => setPokemon({ type: e.target.value || null })} className={input} aria-label="Pokémon type">
          <option value={OTHER} hidden disabled>
            —
          </option>
          <option value="">Any type</option>
          {CARD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
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
            onChange={(e) => setPokemon({ minHp: toBound(e.target.value) })}
            className={`${input} w-16`}
          />
          –
          <input
            type="number"
            min={0}
            step={10}
            placeholder="max"
            value={filter.maxHp ?? ''}
            onChange={(e) => setPokemon({ maxHp: toBound(e.target.value) })}
            className={`${input} w-16`}
          />
        </label>
        <button
          className={`${toggle} ${filter.hasAbility ? on : off}`}
          aria-pressed={filter.hasAbility}
          title="Has a Pokémon Power, Poké-Power or Poké-Body"
          onClick={() => setPokemon({ hasAbility: !filter.hasAbility })}
        >
          Has ability
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className={`${toggle} ${filter.trainers ? on : off}`} aria-pressed={filter.trainers} onClick={flipTrainers}>
          Trainer
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">Energy</span>
        {CARD_TYPES.map((t) => (
          <button
            key={t}
            className={`${toggle} flex items-center gap-1 ${filter.energies.includes(t) ? on : off}`}
            aria-pressed={filter.energies.includes(t)}
            title={t === 'Colorless' ? 'Colorless: Double Colorless and other special Energy with no type of its own' : `${t} Energy`}
            onClick={() => flipEnergy(t)}
          >
            <EnergyIcon type={t.toLowerCase() as EnergyType} size="panel" />
            {t}
          </button>
        ))}
        <button className="text-slate-400 hover:text-slate-200" onClick={() => onChange(EMPTY_DECK_FILTER)}>
          Clear filters
        </button>
        <span className="ml-auto text-slate-400">{shown === total ? `${total} cards` : `${shown} of ${total} cards`}</span>
      </div>
    </div>
  );
}
