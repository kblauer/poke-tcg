/**
 * An item's picture (`public/items/<id>.png`): the matching game item's icon (from PokeAPI's sprites), pixel art drawn
 * crisp, or for a badge its smooth artwork. Items with no game counterpart use the closest one (README: Inventory).
 */
export function ItemIcon({ id, size = 40, className = '' }: { id: string; size?: number; className?: string }) {
  const pixelArt = !id.endsWith('-badge');
  return (
    <img
      src={`/items/${id}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 object-contain ${pixelArt ? '[image-rendering:pixelated]' : ''} ${className}`}
    />
  );
}
