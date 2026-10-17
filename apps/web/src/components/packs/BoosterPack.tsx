/** Each set's pack colours (the packs' printed art isn't in the catalog). */
const PALETTES: Record<string, string> = {
  base1: 'from-sky-600 via-blue-800 to-indigo-950',
  base2: 'from-lime-500 via-emerald-700 to-emerald-950',
  base3: 'from-amber-500 via-stone-700 to-stone-950',
};

/** The crimped foil seal along a pack's top and bottom edges. */
const crimp = 'h-4 bg-[repeating-linear-gradient(90deg,#e2e8f0_0_5px,#94a3b8_5px_10px)] shadow-inner';

/**
 * A booster pack: the set's colours and logo on foil, crimped at both ends, with a sheen sweeping across.
 * `state`: idle floats, shaking while it's being bought, torn once opened (its top flies off with a flash).
 */
export function BoosterPack({
  setId,
  name,
  logoUrl,
  state = 'idle',
  size = 'lg',
}: {
  setId: string;
  name: string;
  logoUrl: string | null;
  state?: 'idle' | 'shaking' | 'torn';
  size?: 'sm' | 'lg';
}) {
  const motion = state === 'shaking' ? 'pack-shake' : state === 'idle' ? 'pack-float' : '';
  return (
    <div className={`relative aspect-[5/8] select-none ${size === 'lg' ? 'w-60' : 'w-36'} ${motion}`}>
      {/* The top seal, which tears off. */}
      <div className={`absolute inset-x-0 top-0 z-10 rounded-t-md ${crimp} ${state === 'torn' ? 'pack-tear' : ''}`} />
      <div
        className={`absolute inset-x-0 bottom-0 top-4 flex flex-col items-center justify-between overflow-hidden rounded-b-md bg-gradient-to-b ${PALETTES[setId] ?? PALETTES.base1} shadow-2xl shadow-black/70 ring-1 ring-white/20`}
      >
        <span className={`mt-3 font-bold uppercase tracking-[0.2em] text-white/80 ${size === 'lg' ? 'text-[10px]' : 'text-[8px]'}`}>Pokémon Trading Card Game</span>
        {logoUrl ? (
          <img src={logoUrl} alt={name} draggable={false} className="w-4/5 drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]" />
        ) : (
          <span className="text-2xl font-black text-white">{name}</span>
        )}
        <span className={`mb-6 rounded-full bg-black/40 px-3 py-0.5 font-semibold text-yellow-200 ${size === 'lg' ? 'text-xs' : 'text-[10px]'}`}>11 cards</span>
        <div className={`absolute inset-x-0 bottom-0 ${crimp}`} />
        {/* Foil sheen. */}
        <div className="pack-sheen pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgb(255_255_255/0.4)_50%,transparent_60%)]" />
      </div>
      {state === 'torn' && <div className="pack-flash pointer-events-none absolute inset-0 z-20 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.95),rgb(253_224_71/0.5)_40%,transparent_70%)]" />}
    </div>
  );
}
