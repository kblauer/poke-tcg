import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import { PACK_GENERATIONS } from '@poke-tcg/campaign';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Every generation, for the filter: "Gen 1 · Kanto"… */
const OPTIONS = Object.entries(PACK_GENERATIONS).map(([id, g]) => ({ id: Number(id), name: `Gen ${id} · ${g.region}` }));

/** The generation a set's packs belong to (PACK_GENERATIONS' `packs`: Gen 3's too, whose runs are still to come), if any. */
export const packGeneration = (setId: string) => OPTIONS.find((o) => PACK_GENERATIONS[o.id]!.packs.includes(setId))?.id;

/**
 * The Packs tab's generation filter: a dropdown with a checkbox per generation. Nothing picked (`picked` empty) shows
 * every set, as the page does on each visit; Show all clears the picks. Escape or a click outside closes it. With `toggles`
 * (Community Decks) each box turns its generation on or off instead: `picked` holds those on, and Show all turns them all on;
 * `compact` makes the button smaller. `icon` (the Collection's deck list toolbar) makes it a Filters icon button, marked
 * while it filters, its dropdown opening to the left; `before` goes above the generations (the deck list's Favorites),
 * `filtering` marking the icon too.
 */
export function GenerationFilter({
  picked,
  onChange,
  toggles = false,
  compact = false,
  icon = false,
  before,
  filtering = false,
}: {
  picked: ReadonlySet<number>;
  onChange: (picked: Set<number>) => void;
  toggles?: boolean;
  compact?: boolean;
  icon?: boolean;
  before?: ReactNode;
  filtering?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const all = toggles ? picked.size === OPTIONS.length : picked.size === 0;
  const label = all ? 'All' : picked.size === 0 ? 'None' : picked.size === 1 ? OPTIONS.find((s) => picked.has(s.id))?.name : `${picked.size} generations`;
  return (
    <div ref={root} className="relative">
      {icon ? (
        <button
          className={`relative flex items-center rounded p-1 transition hover:bg-slate-700 ${open ? 'bg-slate-700 text-slate-50' : 'text-slate-300'}`}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Filters"
          title={`Filters (generation: ${label})`}
        >
          <FilterListIcon sx={{ fontSize: 20 }} />
          {(!all || filtering) && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-yellow-300" />}
        </button>
      ) : (
        <button
          className={`flex items-center gap-1 rounded-lg bg-slate-800 ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1.5'} text-chip ring-1 ring-slate-700 transition hover:ring-slate-500`}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="text-slate-400">Generation:</span> {label}
          <ExpandMoreIcon sx={{ fontSize: 18 }} className="text-slate-400" />
        </button>
      )}
      {open && (
        <div role="listbox" aria-multiselectable className={`absolute ${icon ? 'right-0' : 'left-0'} top-full z-30 mt-1 w-56 rounded-lg bg-slate-800 p-1 shadow-xl ring-1 ring-slate-600`}>
          {before && <div className="mb-1 border-b border-slate-700 pb-1">{before}</div>}
          {OPTIONS.map((s) => {
            const on = picked.has(s.id);
            return (
              <button
                key={s.id}
                role="option"
                aria-selected={on}
                onClick={() => toggle(s.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-slate-200 transition hover:bg-slate-700"
              >
                {on ? <CheckBoxIcon sx={{ fontSize: 18 }} className="text-yellow-300" /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} className="text-slate-500" />}
                {s.name}
              </button>
            );
          })}
          <div className="mt-1 border-t border-slate-700 pt-1">
            <button className="w-full rounded px-2 py-1 text-left text-sm text-slate-300 transition hover:bg-slate-700 disabled:opacity-40" disabled={all} onClick={() => onChange(new Set(toggles ? OPTIONS.map((o) => o.id) : []))}>
              Show all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
