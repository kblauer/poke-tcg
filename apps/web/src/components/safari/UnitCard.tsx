import { KEYWORDS, POWERS, TRAINERS, type TrainerName } from '@poke-tcg/safari/effects';
import { useContext, type ReactNode } from 'react';
import { CardImage } from '../CardImage';
import { CatalogContext, useInspectOnRightClick } from '../InspectContext';
import type { SafariUnit } from '../../hooks/useSafari';
import { TRAINER_CARDS } from './safariArt';

/** A unit's numbers as it fights: its print's, with its bonuses (upgrades, golden). */
export interface UnitStats {
  attack: number;
  hp: number;
  keyword?: string;
}

/** What a unit's keyword and power do, for its title (hover) and the board's notes. */
export function unitWords(unit: { keyword?: string | null; power?: string | null }): string[] {
  const words: string[] = [];
  if (unit.keyword) words.push(`${unit.keyword}: ${KEYWORDS[unit.keyword as keyof typeof KEYWORDS]?.text ?? ''}`);
  if (unit.power) words.push(`${unit.power}: ${POWERS[unit.power]?.text ?? ''}`);
  return words;
}

/**
 * A card on Safari Draft's screens: its picture (TCGdex's), its attack and HP at the bottom, its tier at the top and its
 * keyword and power under it; golden copies ringed in gold. Right-click opens the card in the inspector, as everywhere.
 * `width` is the card's, in CSS (the picture keeps the card's 63:88).
 */
export function UnitCard({ id, unit, stats, golden, width, dim, lit, children, onClick, title }: { id: string; unit: SafariUnit | undefined; stats?: UnitStats; golden?: boolean; width: string; dim?: boolean; lit?: boolean; children?: ReactNode; onClick?: () => void; title?: string }) {
  const catalog = useContext(CatalogContext);
  const inspect = useInspectOnRightClick();
  const card = catalog?.get(id);
  const attack = stats?.attack ?? unit?.attack ?? 0;
  const hp = stats?.hp ?? unit?.hp ?? 0;
  const keyword = unit?.keyword ?? stats?.keyword;
  const words = unit ? unitWords({ keyword, power: unit.power }) : [];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title ?? [unit?.name, ...words].filter(Boolean).join('\n')}
      className={`relative block shrink-0 rounded-[6%/4.5%] text-left transition ${golden ? 'ring-[3px] ring-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.7)]' : ''} ${lit ? 'ring-[3px] ring-yellow-300' : ''} ${dim ? 'opacity-40 grayscale' : ''} ${onClick ? 'hover:-translate-y-0.5 active:scale-95' : ''}`}
      style={{ width, aspectRatio: '63 / 88' }}
      {...inspect(card)}
    >
      {card?.imageUrl ? <CardImage src={`${card.imageUrl}/low.webp`} alt={unit?.name ?? card.name} className="h-full w-full rounded-[6%/4.5%] object-cover" draggable={false} /> : <div className="h-full w-full rounded-[6%/4.5%] bg-slate-700" />}
      {unit && (
        <>
          <span className="absolute left-1 top-1 rounded-full bg-slate-950/85 px-1.5 text-[10px] font-bold leading-4 text-yellow-300" title={`Tier ${unit.tier}`}>
            {'★'.repeat(unit.tier)}
          </span>
          {(keyword || unit.power) && (
            <span className="absolute inset-x-1 top-[55%] flex flex-col items-center gap-0.5">
              {keyword && <span className="max-w-full truncate rounded bg-slate-950/85 px-1 text-[10px] leading-4 text-slate-50">{keyword}</span>}
              {unit.power && <span className="max-w-full truncate rounded bg-violet-800/90 px-1 text-[10px] leading-4 text-slate-50">{unit.power}</span>}
            </span>
          )}
          <span className="absolute bottom-1 left-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-gray-900 ring-1 ring-black/40" title="Attack">
            {attack}
          </span>
          <span className="absolute bottom-1 right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-gray-900 ring-1 ring-black/40" title="HP">
            {hp}
          </span>
        </>
      )}
      {children}
    </Tag>
  );
}

/** A Trainer card in the inventory or an encounter: its Base Set picture and what it does in a battle. */
export function TrainerCard({ trainer, width, lit, onClick, children }: { trainer: TrainerName; width: string; lit?: boolean; onClick?: () => void; children?: ReactNode }) {
  const catalog = useContext(CatalogContext);
  const inspect = useInspectOnRightClick();
  const card = catalog?.get(TRAINER_CARDS[trainer]);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={`${trainer}: ${TRAINERS[trainer]}`}
      className={`relative block shrink-0 rounded-[6%/4.5%] text-left transition ${lit ? 'ring-[3px] ring-yellow-300' : ''} ${onClick ? 'hover:-translate-y-0.5 active:scale-95' : ''}`}
      style={{ width, aspectRatio: '63 / 88' }}
      {...inspect(card)}
    >
      {card?.imageUrl ? <CardImage src={`${card.imageUrl}/low.webp`} alt={trainer} className="h-full w-full rounded-[6%/4.5%] object-cover" draggable={false} /> : <div className="flex h-full w-full items-center justify-center rounded-[6%/4.5%] bg-slate-700 p-1 text-center text-xs">{trainer}</div>}
      {children}
    </Tag>
  );
}
