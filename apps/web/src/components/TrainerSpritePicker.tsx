import CloseIcon from '@mui/icons-material/Close';
import { TRAINER_SPRITES, trainerSpriteUrl, type TrainerSprite } from '@poke-tcg/shared';
import { useEffect, useMemo, useState } from 'react';

/** A sprite's name for the screen: "acetrainer-gen4dp" → "acetrainer gen4dp". */
export const spriteLabel = (name: string) => name.replace(/-/g, ' ');

/**
 * Picks the Inventory's trainer sprite from every one Showdown has (TRAINER_SPRITES, ~1,500): a search box and a grid of
 * sprites, loaded as they scroll into view. Clicking one picks it; Escape, × or a click outside closes the window.
 */
export function TrainerSpritePicker({ current, onPick, onClose }: { current: string; onPick: (sprite: TrainerSprite) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '-');
    return q ? TRAINER_SPRITES.filter((s) => s.includes(q)) : TRAINER_SPRITES;
  }, [query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-label="Choose your trainer"
        className="flex h-[min(46rem,calc(100vh-2rem))] w-full max-w-5xl flex-col gap-3 rounded-lg bg-slate-800 p-5 shadow-xl ring-1 ring-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Choose your trainer</h3>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${TRAINER_SPRITES.length} trainers…`}
            className="min-w-0 flex-1 rounded bg-slate-900 px-3 py-1.5 text-sm ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
          />
          <span className="text-xs text-slate-400">{shown.length} shown</span>
          <button className="rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon sx={{ fontSize: 20 }} />
          </button>
        </div>
        <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] content-start gap-2 overflow-y-auto pr-1">
          {shown.map((s) => (
            <li key={s}>
              <button
                onClick={() => onPick(s)}
                title={spriteLabel(s)}
                className={`flex w-full flex-col items-center rounded-lg p-1 transition ${s === current ? 'bg-slate-700 ring-2 ring-yellow-300' : 'bg-slate-900 ring-1 ring-slate-700 hover:ring-slate-500'}`}
              >
                <img src={trainerSpriteUrl(s)} alt="" loading="lazy" width={80} height={80} className="h-20 w-20 object-contain [image-rendering:pixelated]" />
                <span className="w-full truncate text-center text-[10px] text-slate-400">{spriteLabel(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
