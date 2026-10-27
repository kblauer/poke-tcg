/** A Pokéblock's picture (Emerald's, in its colour: public/extras/pokeblocks/, 8px), drawn crisp at `size`. */
export function PokeblockIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <img src={`/extras/pokeblocks/${color.toLowerCase()}.png`} alt="" width={size} height={size} draggable={false} className="shrink-0 [image-rendering:pixelated]" />;
}

/** A Poffin's sprite (Platinum's, in its type's colours: public/extras/poffin/poffins.png, 64px a type), drawn crisp at `size`. */
export function PoffinIcon({ type, size = 32 }: { type: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 [image-rendering:pixelated]"
      style={{ width: size, height: size, backgroundImage: 'url(/extras/poffin/poffins.png)', backgroundSize: `${29 * size}px ${size}px`, backgroundPosition: `${-type * size}px 0` }}
    />
  );
}
