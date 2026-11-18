import ShieldIcon from '@mui/icons-material/Shield';
import { KEYWORDS, TRAINERS, type TrainerName } from '@poke-tcg/safari/effects';
import { forwardRef, useContext, type ReactNode } from 'react';
import { CardImage } from '../CardImage';
import { EnergyIcon } from '../EnergyIcon';
import { CatalogContext, useInspectOnRightClick } from '../InspectContext';
import type { SafariUnit } from '../../hooks/useSafari';
import { TRAINER_CARDS } from './safariArt';

/** A unit's numbers as it fights: its print's, with its bonuses (upgrades, golden). */
export interface UnitStats {
  attack: number;
  hp: number;
  keyword?: string;
}

/** The keyword that makes opposing Pokémon attack its Pokémon (drawn with TAUNT_RING). */
export const TAUNT = 'Taunt';
/** A taunting Pokémon's border: a thick stone outline round the card, apart from the golden ring and the picked-up one. */
const TAUNT_RING = 'outline outline-4 outline-offset-2 outline-stone-300 shadow-[0_0_14px_6px_rgba(214,211,209,0.45)]';

/** What a keyword does, for its title (hover) and the board's notes. */
export function keywordText(keyword: string | null | undefined): string {
  return keyword ? `${keyword}: ${KEYWORDS[keyword as keyof typeof KEYWORDS]?.text ?? ''}` : '';
}

/**
 * The card's art window: its picture (TCGdex's) cropped to the WOTC-era art box, so none of the TCG card's text (attacks,
 * Pokémon Power, Weakness) shows on Safari Draft's cards, which play by their keyword only (the user's, 2026-11-18).
 */
function CardArt({ src, alt, trainer = false }: { src: string | undefined; alt: string; trainer?: boolean }) {
  // The picture 120.6% of the window's width (the art box is 82.9% of the card's), shifted to the box's top left corner;
  // a Trainer card's box is lower and wider.
  return (
    <div className={`relative w-full overflow-hidden rounded-[3px] bg-slate-700 ring-1 ring-black/40 ${trainer ? 'aspect-[1.94]' : 'aspect-[1.515]'}`}>
      {src && <CardImage src={src} alt={alt} draggable={false} className={`absolute left-[-10.4%] top-0 w-[120.6%] max-w-none ${trainer ? 'mt-[-38.4%]' : 'mt-[-18.2%]'}`} />}
    </div>
  );
}

/**
 * A card on Safari Draft's screens, in a frame of its own: its name and type at the top, its art (CardArt), its tier, its
 * keyword (hover for what it does), and its attack and HP at the bottom; golden copies ringed in gold, a Taunt with a
 * stone border. Right-click opens the printed card in the inspector, as everywhere. `width` is the card's, in CSS (the
 * frame keeps the card's 63:88); its words scale with it.
 */
export const UnitCard = forwardRef<HTMLDivElement, { id: string; unit: SafariUnit | undefined; stats?: UnitStats; golden?: boolean; width: string; dim?: boolean; lit?: boolean; children?: ReactNode; onClick?: () => void; title?: string }>(function UnitCard(
  { id, unit, stats, golden, width, dim, lit, children, onClick, title },
  ref,
) {
  const catalog = useContext(CatalogContext);
  const inspect = useInspectOnRightClick();
  const card = catalog?.get(id);
  const attack = stats?.attack ?? unit?.attack ?? 0;
  const hp = stats?.hp ?? unit?.hp ?? 0;
  const keyword = stats?.keyword ?? unit?.keyword;
  const name = unit?.name ?? card?.name ?? '';
  return (
    <div
      ref={ref}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      title={title ?? [name, keywordText(keyword)].filter(Boolean).join('\n')}
      className={`relative shrink-0 select-none rounded-[6%/4.5%] bg-slate-800 text-left ring-1 ring-slate-500 transition ${keyword === TAUNT ? TAUNT_RING : ''} ${golden ? '!ring-[3px] !ring-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.7)]' : ''} ${lit ? '!ring-[3px] !ring-yellow-300 -translate-y-1' : ''} ${dim ? 'opacity-40 grayscale' : ''} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 active:scale-95' : ''}`}
      style={{ width, aspectRatio: '63 / 88' }}
      {...inspect(card)}
    >
      {/* Its words sized by the card's width (cqw): the frame's own box, so a card laid out in any row scales the same. */}
      <div className="absolute inset-0 flex flex-col gap-[3%] p-[5%] [container-type:size]">
        <div className="flex items-center gap-[4%]">
          <span className="min-w-0 flex-1 truncate text-[11cqw] font-bold leading-tight text-slate-50">{name}</span>
          {unit && <EnergyIcon type={unit.type} size="xs" />}
        </div>
        <CardArt src={card?.imageUrl ? `${card.imageUrl}/low.webp` : undefined} alt={name} />
        {unit && (
          <div className="flex flex-col items-center gap-[4%]">
            <span className="text-[10cqw] leading-none text-yellow-300" title={`Tier ${unit.tier}`}>
              {'★'.repeat(unit.tier)}
            </span>
            {keyword && (
              <span className={`flex max-w-full items-center gap-[3%] truncate rounded px-[5%] text-[10cqw] font-semibold leading-snug ${keyword === TAUNT ? 'bg-stone-300 text-gray-900' : 'bg-slate-950/85 text-slate-50'}`}>
                {keyword === TAUNT && <ShieldIcon sx={{ fontSize: '1em' }} />}
                {keyword}
              </span>
            )}
          </div>
        )}
        {unit && (
          <div className="mt-auto flex items-end justify-between">
            <span className="flex aspect-square min-w-[30%] items-center justify-center rounded-full bg-amber-400 px-[4%] text-[13cqw] font-black text-gray-900 ring-1 ring-black/40" title="Attack">
              {attack}
            </span>
            <span className="flex aspect-square min-w-[30%] items-center justify-center rounded-full bg-red-500 px-[4%] text-[13cqw] font-black text-gray-900 ring-1 ring-black/40" title="HP">
              {hp}
            </span>
          </div>
        )}
      </div>
      {children}
    </div>
  );
});

/** A Trainer card in the inventory or an encounter: its Base Set picture and what it does in a battle. */
export function TrainerCard({ trainer, width, lit, onClick, children }: { trainer: TrainerName; width: string; lit?: boolean; onClick?: () => void; children?: ReactNode }) {
  const catalog = useContext(CatalogContext);
  const inspect = useInspectOnRightClick();
  const card = catalog?.get(TRAINER_CARDS[trainer]);
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      title={`${trainer}: ${TRAINERS[trainer]}`}
      className={`relative shrink-0 select-none rounded-[6%/4.5%] bg-slate-800 text-left ring-1 ring-slate-500 transition ${lit ? '!ring-[3px] !ring-yellow-300 -translate-y-1' : ''} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 active:scale-95' : ''}`}
      style={{ width, aspectRatio: '63 / 88' }}
      {...inspect(card)}
    >
      <div className="absolute inset-0 flex flex-col gap-[3%] p-[5%] [container-type:size]">
        <span className="truncate text-[11cqw] font-bold leading-tight text-slate-50">{trainer}</span>
        <CardArt src={card?.imageUrl ? `${card.imageUrl}/low.webp` : undefined} alt={trainer} trainer />
        <span className="line-clamp-4 text-[9cqw] leading-tight text-slate-300">{TRAINERS[trainer]}</span>
      </div>
      {children}
    </div>
  );
}
