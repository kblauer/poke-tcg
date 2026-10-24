import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StarIcon from '@mui/icons-material/Star';
import type { EnergyType } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CARD_TYPES, type SetGroup } from '../utils/cardList';
import { EnergyIcon } from './EnergyIcon';
import { CARD_KINDS, DECK_SORTS, EMPTY_DECK_FILTER, POKEMON_STAGES, type CardKind, type DeckFilter, type DeckSort } from '../utils/deckBuilder';

// Every control one height, so they line up wherever they sit.
// The filters' inputs and toggles: the pixel font at its crisp 18px (`text-chip`, index.css) (agreed 2026-10-23).
const input = 'h-8 rounded bg-slate-800 px-2 text-chip outline-none ring-yellow-300 focus:ring-1';
const toggle = 'inline-flex h-8 items-center gap-1 rounded px-2.5 text-chip transition';
const on = 'bg-yellow-300 text-slate-900';
const off = 'bg-slate-800 text-slate-300 hover:bg-slate-700';

/** Parses a number field; empty means "no bound". */
const toBound = (value: string) => (value === '' ? null : Math.max(0, Number(value)));

/** The list with the value added, or taken out if it's there. */
const flip = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

/**
 * The release set filter: a button naming the sets picked, opening a list of every set, by generation (`groups`:
 * setGroups), to tick any number of. "All sets" at the top ticks every set (null), so one or two can then be unticked;
 * with every set ticked it unticks them all. Each generation's heading ticks or unticks all its sets. A click outside
 * it closes the list. `compact` (the phone's
 * panel, which scrolls and would cut a floating list off): the list opens in place, pushing the filters below it down.
 */
function SetPicker({ groups, picked, onChange, className, compact }: { groups: SetGroup[]; picked: string[] | null; onChange: (sets: string[] | null) => void; className: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const sets = groups.flatMap((g) => g.sets);
  const ticked = (s: string) => picked === null || picked.includes(s);
  const every = sets.every(ticked);
  // A single generation picked whole reads as its name.
  const whole = groups.find((g) => picked !== null && g.sets.length === picked.length && g.sets.every(ticked));
  const label = every ? 'All sets' : picked!.length === 0 ? 'No sets' : picked!.length === 1 ? picked![0] : whole ? whole.label : `${picked!.length} sets`;
  /** The new picks: every set ticked again is null. */
  const change = (next: string[]) => onChange(sets.every((x) => next.includes(x)) ? null : sets.filter((x) => next.includes(x)));
  /** Ticks a generation's sets, or unticks them when they all are. */
  const pickGroup = (g: SetGroup) => {
    const now = picked ?? sets;
    change(g.sets.every(ticked) ? now.filter((s) => !g.sets.includes(s)) : [...now, ...g.sets.filter((s) => !now.includes(s))]);
  };
  const row = 'flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-700';
  return (
    <div ref={ref} className={compact && open ? 'w-full' : 'relative'}>
      <button className={`${className} flex items-center gap-1`} aria-haspopup="listbox" aria-expanded={open} title={every ? undefined : picked!.join(', ') || undefined} onClick={() => setOpen((o) => !o)}>
        <span className="max-w-40 truncate">{label}</span>
        <ExpandMoreIcon sx={{ fontSize: 16 }} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className={`${compact ? 'mt-1 w-full' : 'absolute left-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto shadow-xl shadow-black/60'} rounded bg-slate-800 py-1 text-sm ring-1 ring-slate-600`}
        >
          <label className={row}>
            <input type="checkbox" className="accent-yellow-300" checked={every} onChange={() => onChange(every ? [] : null)} />
            All sets
          </label>
          {groups.map((g) => {
            const all = g.sets.every(ticked);
            const some = !all && g.sets.some(ticked);
            return (
              <div key={g.label} className="border-t border-slate-700">
                <label className={`${row} font-semibold`}>
                  <input type="checkbox" className="accent-yellow-300" checked={all} ref={(el) => {
                      if (el) el.indeterminate = some;
                    }} onChange={() => pickGroup(g)} />
                  {g.label}
                </label>
                {g.sets.map((s) => (
                  <label key={s} className={`${row} pl-8`}>
                    <input type="checkbox" className="accent-yellow-300" checked={ticked(s)} onChange={() => change(flip(picked ?? sets, s))} />
                    {s}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The deck builder's card search: name, sets (any number, SetPicker), sort, Unlocked and Locked toggles, Implemented and
 * Not implemented toggles, "holo", kind toggles
 * (Pokémon, Trainer, Energy), type toggles (a Pokémon's type or the Energy's, see filterForDeck) and the
 * Pokémon filters. `compact` (a phone, in its side panel): each filter, or pair of related ones, on a line of its own
 * under its name, the type toggles just their icons, and the whole thing scrolls.
 */
export function DeckFilters({
  filter,
  sort,
  sets,
  shown,
  total,
  onChange,
  onSortChange,
  compact = false,
}: {
  filter: DeckFilter;
  sort: DeckSort;
  onSortChange: (sort: DeckSort) => void;
  /** Set names by generation, in release order (setGroups). */
  sets: SetGroup[];
  shown: number;
  total: number;
  onChange: (filter: DeckFilter) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<DeckFilter>) => onChange({ ...filter, ...patch });
  const row = 'flex flex-wrap items-center gap-2 text-sm';
  const group = 'flex flex-wrap items-center gap-1.5';
  /** A toggle button for one filter. */
  const toggleButton = (label: string, pressed: boolean, title: string, onClick: () => void, key?: string) => (
    <button key={key} className={`${toggle} ${pressed ? on : off}`} aria-pressed={pressed} title={title} onClick={onClick}>
      {label}
    </button>
  );
  const search = (
    <input
      type="search"
      placeholder="Search by name or attack…"
      value={filter.search}
      onChange={(e) => set({ search: e.target.value })}
      className={`${input} ${compact ? 'w-full' : 'w-72 min-w-40 shrink'}`}
    />
  );
  const setPicker = <SetPicker groups={sets} picked={filter.sets} onChange={(picked) => set({ sets: picked })} className={input} compact={compact} />;
  const sortSelect = (
    <select value={sort} onChange={(e) => onSortChange(e.target.value as DeckSort)} className={input} aria-label="Sort by" title="Sort by set number (the default), Pokédex number or type">
      {DECK_SORTS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
  const ownership = [
    toggleButton('Unlocked', filter.unlocked, "Show the cards you've unlocked", () => set({ unlocked: !filter.unlocked }), 'unlocked'),
    toggleButton('Locked', filter.locked, "Show the cards you haven't unlocked yet", () => set({ locked: !filter.locked }), 'locked'),
  ];
  const implemented = [
    toggleButton('Works', filter.implemented, 'Show cards whose attacks, powers and effects all work in the game', () => set({ implemented: !filter.implemented }), 'implemented'),
    toggleButton(
      'Not work',
      filter.notImplemented,
      "Show cards with an attack, power or effect that doesn't work yet. Their Pokémon can still attack for their base damage.",
      () => set({ notImplemented: !filter.notImplemented }),
      'not-implemented',
    ),
  ];
  const kinds = CARD_KINDS.map((k) =>
    toggleButton(k.label, filter.kinds.includes(k.value), `Show ${k.label === 'Energy' ? 'Energy' : `${k.label}s`} (with none on, every kind shows)`, () => set({ kinds: flip<CardKind>(filter.kinds, k.value) }), k.value),
  );
  const favorites = (
    <button
      key="favorites"
      className={`${toggle} ${filter.favorites ? on : off}`}
      aria-pressed={filter.favorites}
      title="Only your favorite cards (add one with the ★ when it's open large)"
      onClick={() => set({ favorites: !filter.favorites })}
    >
      <StarIcon sx={{ fontSize: 16 }} />
      Favorites
    </button>
  );
  const holo = toggleButton('Holo', filter.holoOnly, "Only holo cards: holos, galaxy foils and the holo Energy you've pulled", () => set({ holoOnly: !filter.holoOnly }), 'holo');
  const types = CARD_TYPES.map((t) => (
    <button
      key={t}
      // On a big screen they share one line (see the layout below): narrower, then just their icons, as it narrows (the
      // widths for the pixel font's 18px: all nine named take about 64rem).
      className={`${toggle} shrink-0 ${compact ? '' : '@max-[70rem]:px-1.5'} ${filter.types.includes(t) ? on : off}`}
      aria-pressed={filter.types.includes(t)}
      title={`${t} Pokémon and ${t} Energy${t === 'Colorless' ? ' (Double Colorless and other special Energy with no type of its own)' : ''}`}
      aria-label={t}
      onClick={() => set({ types: flip(filter.types, t) })}
    >
      <EnergyIcon type={t.toLowerCase() as EnergyType} size="panel" />
      {!compact && <span className="hidden @[64rem]:inline">{t}</span>}
    </button>
  ));
  const stage = (
    <select value={filter.stage ?? ''} onChange={(e) => set({ stage: e.target.value || null })} className={input} aria-label="Evolution stage">
      <option value="">Any stage</option>
      {POKEMON_STAGES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
  const hpBound = (bound: 'minHp' | 'maxHp') => (
    <input
      type="number"
      min={0}
      step={10}
      placeholder={bound === 'minHp' ? 'min' : 'max'}
      aria-label={bound === 'minHp' ? 'Lowest HP' : 'Highest HP'}
      value={filter[bound] ?? ''}
      onChange={(e) => set({ [bound]: toBound(e.target.value) })}
      className={`${input} w-20`}
    />
  );
  const hp = (
    <>
      {hpBound('minHp')}–{hpBound('maxHp')}
    </>
  );
  const ability = toggleButton('Has ability', filter.hasAbility, 'Has a Pokémon Power, Poké-Power or Poké-Body', () => set({ hasAbility: !filter.hasAbility }));
  const clear = (
    <button className="text-slate-400 hover:text-slate-200" onClick={() => onChange(EMPTY_DECK_FILTER)}>
      Clear filters
    </button>
  );
  const count = <span className="text-slate-400">{shown === total ? `${total} cards` : `${shown} of ${total} cards`}</span>;

  if (compact) {
    /** One line: the filter's name, with its controls under it. */
    const line = (label: string, controls: ReactNode) => (
      <div className="space-y-1 text-sm">
        <p className="text-xs text-slate-400">{label}</p>
        <div className="flex flex-wrap items-center gap-1.5">{controls}</div>
      </div>
    );
    // Clear filters at the top, the number of cards shown at the bottom.
    return (
      <div className="min-h-0 space-y-3 overflow-y-auto rounded-lg bg-slate-900 p-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="shrink-0">{clear}</span>
          {search}
        </div>
        {line(
          'Sets',
          <>
            {setPicker}
            {sortSelect}
          </>,
        )}
        {line('Kind', kinds)}
        {line(
          'Only',
          <>
            {favorites}
            {holo}
          </>,
        )}
        {line('Type', types)}
        {line('Stage', stage)}
        {line('HP', hp)}
        {line('Ability', ability)}
        {line('Cards', ownership)}
        {line('Effects', implemented)}
        <div className={`${row} justify-end border-t border-slate-800 pt-3`}>{count}</div>
      </div>
    );
  }
  /** A line's name, in the first column, so every line's controls start at the same place. */
  const name = (label: string) => <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>;
  return (
    // Five lines, each named in the first column: the search, sets and sort; the kinds; the types (always one line); the
    // Pokémon filters; unlocked or locked and works or not (the number of cards shown and Clear filters at its end).
    // Related filters stay together when a line wraps.
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-lg bg-slate-900 p-3">
      {name('Search')}
      <div className="flex min-w-0 items-center gap-1.5">
        {search}
        {setPicker}
        {sortSelect}
      </div>
      {name('Kind')}
      <div className={group}>
        {favorites}
        {kinds}
        {holo}
      </div>
      {name('Type')}
      <div className="@container">
        <div className="flex items-center gap-1.5 text-sm">{types}</div>
      </div>
      {name('Pokémon')}
      <div className={`${group} text-sm text-slate-400`}>
        {stage}
        <span className="ml-1.5">HP</span>
        {hp}
        {ability}
      </div>
      {name('Cards')}
      <div className={`${row} gap-x-4`}>
        <div className={group}>{ownership}</div>
        <div className={group}>{implemented}</div>
        <span className="ml-auto flex items-center gap-4">
          {count}
          {clear}
        </span>
      </div>
    </div>
  );
}
