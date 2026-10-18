import type { CardDef } from '@poke-tcg/game-engine';
import { useContext, type ReactNode } from 'react';
import { useInspectOnRightClick } from '../InspectContext';
import { PreviewContext } from '../PreviewContext';

const RARITY: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', holo: 'Rare Holo' };

/**
 * A card offered or owned in a run: its image (hovering shows the large preview, as on the game board), name
 * and rarity, with an optional footer (a price) and corner badge. Clickable when `onClick` is set; right-clicking
 * opens it in the CardInspector.
 */
export function RunCard({
  def,
  footer,
  onClick,
  disabled,
  selected,
  badge,
}: {
  def: (CardDef & { rarity?: string }) | undefined;
  footer?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  /** A chip on the card's corner (e.g. NEW for a card gained this run). */
  badge?: ReactNode;
}) {
  const setPreview = useContext(PreviewContext);
  const inspect = useInspectOnRightClick()(def?.id);
  const body = (
    <>
      <div
        className="relative aspect-[63/88] w-28"
        onMouseEnter={(e) => def && setPreview({ def, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPreview(null)}
        onContextMenu={
          inspect.onContextMenu &&
          ((e) => {
            setPreview(null);
            inspect.onContextMenu!(e);
          })
        }
      >
        {def?.imageUrl ? (
          <img src={`${def.imageUrl}/low.webp`} alt={def.name} loading="lazy" className={`h-full w-full rounded-lg object-cover shadow ${selected ? 'ring-4 ring-yellow-300' : ''}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-700 p-1 text-center text-xs">{def?.name ?? '?'}</div>
        )}
        {badge && <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow">{badge}</span>}
      </div>
      <span className="w-28 truncate text-center text-xs text-slate-200">{def?.name ?? 'Unknown card'}</span>
      {def?.rarity && <span className="text-[10px] uppercase tracking-wide text-slate-500">{RARITY[def.rarity]}</span>}
      {footer}
    </>
  );
  if (!onClick) return <div className="relative flex flex-col items-center gap-1">{body}</div>;
  return (
    <button
      className="relative flex flex-col items-center gap-1 rounded-lg p-1 transition hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
