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

/** The types with a blank card (tools/safari/blank_cards.py: Base Set's frame, its words painted out): Gen 1's seven. */
const BLANK_TYPES = new Set(['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless']);
const blankCard = (type: string | undefined) => `/safari/cards/${type && BLANK_TYPES.has(type) ? type : 'colorless'}.webp`;
/** Where things sit on Base Set's frame, in percent of the card (measured at 600 x 825 on the blanks). */
const FRAME = {
  /** The artwork's window, inside its gold frame. */
  art: { left: 10.83, top: 11.76, width: 78.33, height: 40 },
  /** The type's symbol, top right. */
  symbol: { left: 507 / 6, top: 44 / 8.25, size: 46 / 6 },
};
/** Base Set's typeface (Gill Sans), with the nearest a browser has. */
const CARD_FONT = { fontFamily: "'Gill Sans', 'Gill Sans MT', Calibri, 'Segoe UI', sans-serif" };
const STAGE_NAME: Record<string, string> = { basic: 'Basic Pokémon', stage1: 'Stage 1 Pokémon', stage2: 'Stage 2 Pokémon' };

/** The type's symbol, cut from its blank card (`size` in cqw). */
function TypeSymbol({ type, size }: { type: string | undefined; size: number }) {
  const scale = 100 / FRAME.symbol.size;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: `${size}cqw`,
        height: `${size}cqw`,
        backgroundImage: `url(${blankCard(type)})`,
        backgroundSize: `${scale * size}cqw ${scale * size * (825 / 600)}cqw`,
        backgroundPosition: `${(-FRAME.symbol.left / FRAME.symbol.size) * size}cqw ${(-(44 / 6) / FRAME.symbol.size) * size}cqw`,
      }}
    />
  );
}

/**
 * A card on Safari Draft's screens, drawn as its type's printed card (the user's, 2026-11-18): the type's blank Base Set
 * card (`public/safari/cards/`, tools/safari/blank_cards.py) with the unit's own words laid on it where the card prints
 * them: its stage, name and HP at the top, the card's artwork in the art window, its tier's stars on the strip under it,
 * its keyword as the attack's name with what it does, and its attack as the attack's damage. Golden copies ringed in
 * gold, a Taunt with a stone border. Right-click opens the printed card in the inspector, as everywhere. `width` is the
 * card's, in CSS (the frame keeps the card's 63:88); its words scale with it (cqw).
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
  const keyword = stats?.keyword || unit?.keyword;
  const name = unit?.name ?? card?.name ?? '';
  const art = FRAME.art;
  return (
    <div
      ref={ref}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      title={title ?? [name, keywordText(keyword)].filter(Boolean).join('\n')}
      className={`relative shrink-0 select-none overflow-hidden rounded-[4.5%/3.3%] bg-yellow-300 text-left shadow shadow-black/50 transition ${keyword === TAUNT ? TAUNT_RING : ''} ${golden ? 'ring-[3px] ring-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.7)]' : ''} ${lit ? '!ring-[3px] !ring-yellow-300 -translate-y-1' : ''} ${dim ? 'opacity-40 grayscale' : ''} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 active:scale-95' : ''}`}
      style={{ width, aspectRatio: '600 / 825', ...CARD_FONT }}
      {...inspect(card)}
    >
      <img src={blankCard(unit?.type)} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      {/* The card's own artwork in the window: its whole picture behind a window the art box's size (every WOTC frame's). */}
      <div className="absolute overflow-hidden" style={{ left: `${art.left}%`, top: `${art.top}%`, width: `${art.width}%`, height: `${art.height}%` }}>
        {card?.imageUrl && (
          <CardImage
            src={`${card.imageUrl}/low.webp`}
            alt={name}
            draggable={false}
            className="absolute max-w-none"
            style={{ width: `${10000 / art.width}%`, height: `${10000 / art.height}%`, left: `${(-art.left * 100) / art.width}%`, top: `${(-art.top * 100) / art.height}%` }}
          />
        )}
      </div>
      <div className="absolute inset-0 text-gray-900 [container-type:size]">
        {unit && <span className="absolute left-[8%] top-[3%] text-[4.4cqw] font-semibold leading-none">{STAGE_NAME[unit.stage] ?? ''}</span>}
        {/* Long names ("Erika's Bellsprout") smaller, as the printed cards squeeze them, so they stay clear of the HP. */}
        <span className="absolute left-[8%] right-[35%] top-[5.6%] truncate font-bold leading-tight" style={{ fontSize: `${name.length > 16 ? 6 : name.length > 11 ? 7.2 : 9}cqw`, marginTop: `${name.length > 16 ? 1.2 : name.length > 11 ? 0.8 : 0}cqw` }}>
          {name}
        </span>
        {unit && (
          <span className="absolute right-[17%] top-[6.2%] text-[8cqw] font-bold leading-tight text-red-600">
            {hp} <span className="text-[5.4cqw]">HP</span>
          </span>
        )}
        {unit && (
          <span className="absolute inset-x-[14%] top-[53.7%] flex h-[3%] items-center justify-center text-[5.4cqw] leading-none text-amber-800" title={`Tier ${unit.tier}`}>
            {'★'.repeat(unit.tier)}
            {golden && <span className="ml-[3%] text-[4.6cqw] font-bold italic">Golden</span>}
          </span>
        )}
        {unit && (
          // The attack, as the card prints one: its cost (the type's symbol), its name (the keyword's, or "Attack"),
          // what it does, its damage on the right.
          <div className="absolute inset-x-[6%] top-[60%] flex items-center gap-[3%]">
            <TypeSymbol type={unit.type} size={9} />
            <div className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-[2%] text-[8.6cqw] font-bold">
                {keyword === TAUNT && <ShieldIcon sx={{ fontSize: '0.9em' }} />}
                {keyword ?? 'Attack'}
              </span>
              {keyword && <span className="line-clamp-4 text-[5.6cqw] leading-tight">{KEYWORDS[keyword as keyof typeof KEYWORDS]?.text}</span>}
            </div>
            <span className="text-[12cqw] font-semibold leading-none">{attack}</span>
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
