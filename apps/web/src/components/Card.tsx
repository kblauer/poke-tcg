import { lookupCard, type CardDef, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { useContext } from 'react';
import { typeColor } from '../utils/cardColors';
import { PreviewContext } from './PreviewContext';

/** Card art from TCGdex (aspect ratio 63:88), with damage and attached energy overlaid when in play. */
export function Card({ def, inPlay, cards, small }: { def: CardDef; inPlay?: InPlayPokemon; cards?: CardLibrary; small?: boolean }) {
  const setPreview = useContext(PreviewContext);
  const size = small ? 'w-20' : 'w-28';
  return (
    <div
      className={`${size} relative aspect-[63/88] shrink-0 overflow-hidden rounded-lg shadow`}
      onMouseEnter={(e) => setPreview({ def, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPreview(null)}
    >
      {def.imageUrl ? (
        <img src={`${def.imageUrl}/low.webp`} alt={def.name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className={`${typeColor(def)} h-full w-full p-2 text-xs font-semibold`}>{def.name}</div>
      )}
      {inPlay && def.kind === 'pokemon' && inPlay.damage > 0 && (
        <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white shadow">
          {def.hp - inPlay.damage}/{def.hp}
        </span>
      )}
      {inPlay && cards && inPlay.energy.length > 0 && (
        <div className="absolute bottom-1 left-1 flex flex-wrap gap-0.5">
          {inPlay.energy.map((e) => {
            const energy = lookupCard(cards, e.defId);
            return <span key={e.uid} title={energy.name} className={`${typeColor(energy)} h-3 w-3 rounded-full border border-white shadow`} />;
          })}
        </div>
      )}
    </div>
  );
}
