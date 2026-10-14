import { stageLabel, type CatalogCard } from '../utils/cardList';

/** The selected card at full size, with its set and stats underneath. */
export function CardViewer({ card }: { card: CatalogCard | null }) {
  if (!card) {
    return <div className="flex h-64 items-center justify-center rounded-lg bg-slate-900 text-slate-500 lg:h-full">Click a card to view it.</div>;
  }
  const details = [stageLabel(card), card.type, card.hp !== null && `${card.hp} HP`, card.maxDamage && `max attack ${card.maxDamage}`].filter(Boolean);
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Sized to fit the window height. The low-res image shows underneath while the high-res one loads. */}
      <div
        className="aspect-[63/88] overflow-hidden rounded-2xl bg-slate-800 bg-cover shadow-2xl"
        style={{
          width: 'min(100%, 32rem, calc((100dvh - 12rem) * 63 / 88))',
          backgroundImage: card.imageUrl ? `url(${card.imageUrl}/low.webp)` : undefined,
        }}
      >
        {card.imageUrl ? (
          <img key={card.id} src={`${card.imageUrl}/high.webp`} alt={card.name} className="h-full w-full" />
        ) : (
          <div className="p-4 text-lg font-semibold">{card.name}</div>
        )}
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">{card.name}</h2>
        <p className="text-sm text-slate-400">
          {card.setName} · #{card.number}
          {card.rarity && ` · ${card.rarity}`}
        </p>
        <p className="text-sm text-slate-400">{details.join(' · ')}</p>
      </div>
    </div>
  );
}
