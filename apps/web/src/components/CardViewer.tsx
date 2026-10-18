import { stageLabel, type CatalogCard } from '../utils/cardList';
import { holoAttributes } from '../utils/holo';
import { HoloCard } from './HoloCard';
import { CardImage } from './CardImage';

/**
 * A card at full size, with its set and stats underneath (the deck builder's hold and right-click views). A
 * `locked` card (not unlocked by the account) is shown darkened and still, without the holo effect.
 */
export function CardViewer({ card, locked = false }: { card: CatalogCard; locked?: boolean }) {
  const details = [stageLabel(card), card.type, card.hp !== null && `${card.hp} HP`, card.maxDamage && `max attack ${card.maxDamage}`].filter(Boolean);
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Sized to fit the window height. Tilts and shines toward the pointer; the padding leaves room
          for the near edge, which grows by up to ~6% in perspective, so it doesn't cover the text. */}
      <div className="p-[7%]" style={{ width: 'min(100%, 32rem, calc((100dvh - 12rem) * 63 / 88))' }}>
        {card.imageUrl && locked ? (
          <CardImage src={`${card.imageUrl}/high.webp`} alt={card.name} className="aspect-[63/88] w-full rounded-[4.5%] object-cover brightness-[.35]" />
        ) : card.imageUrl ? (
          <HoloCard key={card.id} img={`${card.imageUrl}/high.webp`} name={card.name} attrs={holoAttributes(card)} />
        ) : (
          <div className="aspect-[63/88] rounded-2xl bg-slate-800 p-4 text-lg font-semibold">{card.name}</div>
        )}
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">
          {card.name}
          {locked && <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 align-middle text-xs font-normal text-slate-300">Locked</span>}
        </h2>
        <p className="text-sm text-slate-400">
          {card.setName} · #{card.number}
          {card.rarity && ` · ${card.rarity}`}
        </p>
        <p className="text-sm text-slate-400">{details.join(' · ')}</p>
      </div>
    </div>
  );
}
