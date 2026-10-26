/** A party icon (FireRed's, two frames stacked: shown in turn, as the party screen bobs them). */
export function MonIcon({ id, className = '' }: { id: number; className?: string }) {
  return (
    <span
      className={`inline-block size-8 shrink-0 bg-no-repeat [image-rendering:pixelated] ${className}`}
      style={{ backgroundImage: `url(/idle/gen1/pokemon/icon/${id}.png)`, backgroundSize: '32px 64px', animation: 'idle-icon 0.5s steps(1) infinite' }}
      aria-hidden
    />
  );
}

const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038', bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0',
  fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848', mystery: '#68a090',
};

/** A type's badge, in the games' colours. */
export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: TYPE_COLORS[type] ?? '#888' }}>
      {type}
    </span>
  );
}
