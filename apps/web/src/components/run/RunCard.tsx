import type { CardDef } from '@poke-tcg/game-engine';
import { useContext, type ReactNode } from 'react';
import { RUN_CARD, RUN_CARD_FLUID } from '../../utils/layout';
import { useInspectOnRightClick } from '../InspectContext';
import { PreviewContext } from '../PreviewContext';
import { CardImage } from '../CardImage';

const RARITY: Record<string, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', holo: 'Rare Holo', holoEnergy: 'Holo Energy' };

/**
 * A card offered or owned in a run: its image (hovering with a mouse shows the large preview, as on the game board; a tap doesn't), name
 * and rarity, with an optional footer (a price) and corner badge. Clickable when `onClick` is set; right-clicking
 * opens it in the CardInspector. `fluid` (a phone's reward row): it shrinks to share the row, at most its usual size.
 */
export function RunCard({
  def,
  footer,
  onClick,
  disabled,
  selected,
  badge,
  fluid = false,
}: {
  def: (CardDef & { rarity?: string }) | undefined;
  footer?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  /** A chip on the card's corner (e.g. NEW for a card gained this run). */
  badge?: ReactNode;
  fluid?: boolean;
}) {
  const width = fluid ? RUN_CARD_FLUID : RUN_CARD;
  const setPreview = useContext(PreviewContext);
  const inspect = useInspectOnRightClick({ clearsPreview: true })(def?.id);
  const body = (
    <>
      <div
        className={`relative aspect-[63/88] ${width}`}
        // A mouse's hover only: a tap (a reward picked on a phone) mustn't open the large preview.
        onPointerEnter={(e) => def && e.pointerType !== 'touch' && setPreview({ def, x: e.clientX, y: e.clientY, from: e.currentTarget })}
        onPointerLeave={() => setPreview(null)}
        {...inspect}
      >
        {def?.imageUrl ? (
          <CardImage src={`${def.imageUrl}/low.webp`} alt={def.name} loading="lazy" className={`h-full w-full rounded-lg object-cover shadow ${selected ? 'ring-4 ring-yellow-300' : ''}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-700 p-1 text-center text-xs">{def?.name ?? '?'}</div>
        )}
        {badge && <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow">{badge}</span>}
      </div>
      <span className={`${width} truncate text-center text-xs text-slate-200`}>{def?.name ?? 'Unknown card'}</span>
      {def?.rarity && <span className="text-[10px] uppercase tracking-wide text-slate-500">{RARITY[def.rarity]}</span>}
      {footer}
    </>
  );
  const share = fluid ? 'min-w-0 flex-1' : '';
  if (!onClick) return <div className={`relative flex flex-col items-center gap-1 ${share}`}>{body}</div>;
  return (
    <button
      className={`relative flex flex-col items-center gap-1 rounded-lg p-1 transition hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-40 ${share}`}
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
