import type { HoloPattern } from '@poke-tcg/campaign';
import type { CSSProperties } from 'react';
import { useFlair, usePattern } from '../hooks/useFlair';
import { cardTitle, type CatalogCard } from '../utils/cardList';
import { holoAttributes } from '../utils/holo';
import { HoloCard } from './HoloCard';
import { CardImage } from './CardImage';

/**
 * The card's box: as wide as the space allows (32rem at most), or as tall, its padding (7% of its width each side) included:
 * the card's height is 86% of the width × 88/63, so the box is 1.3413 widths tall.
 */
const FIT: CSSProperties = { ['--w' as string]: 'min(100cqw, 32rem, 100cqh / 1.3413)', width: 'var(--w)', padding: 'calc(var(--w) * 0.07)' };

/**
 * A card at full size, with its set underneath (the deck builder's hold and right-click views), filling the height its
 * parent gives it (a flex column), so the card, its text and whatever follows it fit the window without scrolling. A
 * `locked` card (not unlocked by the account) is shown darkened and still, without the holo effect. It shows the
 * flair the player chose for it (a holo's pattern, a low-rarity card's border), or `pattern` and `border` when given
 * (the inspector's preview; null: its own look).
 */
export function CardViewer({ card, locked = false, pattern, border }: { card: CatalogCard; locked?: boolean; pattern?: HoloPattern | null; border?: string | null }) {
  const chosen = usePattern(card.id);
  const chosenBorder = useFlair(card.id, 'border');
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3">
      {/* Sized to the space left (FIT). Tilts and shines toward the pointer; the padding leaves room for the near edge,
          which grows by up to ~6% in perspective, so it doesn't cover the text. */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        <div data-keep-open style={FIT}>
          {card.imageUrl && locked ? (
            <CardImage src={`${card.imageUrl}/high.webp`} alt={card.name} className="aspect-[63/88] w-full rounded-[4.5%] object-cover brightness-[.35]" />
          ) : card.imageUrl ? (
            <HoloCard key={card.id} img={`${card.imageUrl}/high.webp`} name={card.name} attrs={holoAttributes(card, pattern === undefined ? chosen : pattern)} border={border === undefined ? chosenBorder : border} />
          ) : (
            <div className="aspect-[63/88] rounded-2xl bg-slate-800 p-4 text-lg font-semibold">{card.name}</div>
          )}
        </div>
      </div>
      <div className="shrink-0 text-center">
        <h2 className="text-lg font-semibold">
          {cardTitle(card)}
          {locked && <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 align-middle text-xs font-normal text-slate-300">Locked</span>}
        </h2>
        <p className="text-sm text-slate-400">
          {card.setName} · #{card.number}
          {card.rarity && ` · ${card.rarity}`}
        </p>
      </div>
    </div>
  );
}
