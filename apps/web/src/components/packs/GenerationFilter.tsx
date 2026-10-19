import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { GENERATIONS } from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';

/** The generations with packs, for the filter: "Gen 1 · Kanto"… */
const OPTIONS = Object.entries(GENERATIONS).map(([id, g]) => ({ id: Number(id), name: `Gen ${id} · ${g.region}` }));

/** The generation a set's packs belong to (GENERATIONS' `packs`), if any. */
export const packGeneration = (setId: string) => OPTIONS.find((o) => GENERATIONS[o.id]!.packs.includes(setId))?.id;

/**
 * The Packs tab's generation filter: a dropdown with a checkbox per generation. Nothing picked (`picked` empty) shows
 * every set, as the page does on each visit; Show all clears the picks. Escape or a click outside closes it.
 */
export function GenerationFilter({ picked, onChange }: { picked: ReadonlySet<number>; onChange: (picked: Set<number>) => void }) {
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
  const label = picked.size === 0 ? 'All' : picked.size === 1 ? OPTIONS.find((s) => picked.has(s.id))?.name : `${picked.size} generations`;
  return (
    <div ref={root} className="relative">
      <button
        className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-sm ring-1 ring-slate-700 transition hover:ring-slate-500"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-slate-400">Generation:</span> {label}
        <ExpandMoreIcon sx={{ fontSize: 18 }} className="text-slate-400" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg bg-slate-800 p-1 shadow-xl ring-1 ring-slate-600">
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
            <button className="w-full rounded px-2 py-1 text-left text-sm text-slate-300 transition hover:bg-slate-700 disabled:opacity-40" disabled={picked.size === 0} onClick={() => onChange(new Set())}>
              Show all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
