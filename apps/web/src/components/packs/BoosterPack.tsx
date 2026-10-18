import type { CSSProperties } from 'react';

/** Each set's pack colours, for a pack drawn without its real art (the promos, which had no packs). */
const PALETTES: Record<string, string> = {
  base1: 'from-sky-600 via-blue-800 to-indigo-950',
  base2: 'from-lime-500 via-emerald-700 to-emerald-950',
  base3: 'from-amber-500 via-stone-700 to-stone-950',
  // Wizards Black Star Promos: black, with a gold star's glow.
  basep: 'from-yellow-600 via-neutral-900 to-black',
  base4: 'from-fuchsia-500 via-violet-800 to-indigo-950',
  // Team Rocket: black and red, like its big red R.
  base5: 'from-red-600 via-neutral-900 to-black',
};

/** The crimped foil seal along a pack's top and bottom edges. */
const crimp = 'h-4 bg-[repeating-linear-gradient(90deg,#e2e8f0_0_5px,#94a3b8_5px_10px)] shadow-inner';

/** How much of a real pack's art is its top seal, which tears off. */
const SEAL = '9%';

/**
 * A pack's top seal (`face`: how its front is drawn). Torn, it peels off from left to right: the part still attached
 * shrinks from the left, and the strip torn off so far folds back over the tear like a page being turned, showing its
 * silver inside and getting longer as the tear goes on, until the whole strip comes away (`pack-tear` in index.css).
 */
function Seal({ torn, height, face, trim }: { torn: boolean; height: string; face: { className?: string; style?: CSSProperties }; trim?: { sides: string; radius: string } }) {
  // The part still attached is clipped from the left as the tear goes (with the art's side trim, if any, kept).
  const attached: CSSProperties = trim
    ? { clipPath: `inset(0 ${trim.sides} 0 ${torn ? `max(${trim.sides}, var(--peel))` : trim.sides} round ${trim.radius})` }
    : torn
      ? { clipPath: 'inset(0 0 0 var(--peel))' }
      : {};
  return (
    <div className={`absolute inset-x-0 top-0 z-10 ${torn ? 'pack-tear' : ''}`} style={{ height }}>
      <div className={`absolute inset-0 ${face.className ?? ''}`} style={{ ...face.style, ...attached }} />
      {torn && (
        <div className="pack-tear-strip absolute inset-y-0 left-0 overflow-hidden rounded-r-sm shadow-md shadow-black/50">
          {/* The wrapper's inside: foil, shaded darker towards the fold. */}
          <div className="h-full w-full bg-[linear-gradient(to_left,#64748b,#e2e8f0_35%,#f8fafc_55%,#cbd5e1)]" />
        </div>
      )}
    </div>
  );
}

/**
 * A booster pack: its real wrapper art (`art`, from PACK_ART), or for a set without one the set's colours and logo on
 * foil, crimped at both ends; with a sheen sweeping across. `state`: idle floats, shaking while it's being bought, torn
 * once opened (its top seal is torn off from left to right, see Seal, with a flash).
 */
export function BoosterPack({
  setId,
  name,
  logoUrl,
  art,
  state = 'idle',
  size = 'lg',
}: {
  setId: string;
  name: string;
  logoUrl: string | null;
  art?: string;
  state?: 'idle' | 'shaking' | 'torn';
  size?: 'sm' | 'lg';
}) {
  // The float is paused, not dropped, once the pack is clicked: it shakes and tears where it was floating.
  const float = `pack-float ${state === 'idle' ? '' : '[animation-play-state:paused]'}`;
  const motion = state === 'shaking' ? 'pack-shake' : '';
  // A square centred on the pack, behind it, fading out before its edges (closest-side), so the glow never shows a border.
  const flash = state === 'torn' && (
    <div className="pack-flash pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgb(255_255_255/0.95),rgb(253_224_71/0.5)_45%,transparent_100%)]" />
  );
  if (art) {
    // The scan's sides are trimmed a little and its corners rounded (the seal's too, see Seal's `trim`), hiding what's
    // left of the scanner's white margin.
    return (
      <div className={float}>
        <div className={`relative isolate aspect-[29/50] select-none ${size === 'lg' ? 'w-60' : 'w-36'} ${motion}`}>
          {/* The top seal: the top of the art, which tears off. */}
          <Seal
            torn={state === 'torn'}
            height={SEAL}
            trim={{ sides: '1.5%', radius: '6px' }}
            face={{ className: 'bg-top bg-no-repeat', style: { backgroundImage: `url(${art})`, backgroundSize: '100% auto' } }}
          />
          <div className="absolute inset-0 overflow-hidden shadow-2xl shadow-black/70" style={{ clipPath: `inset(${SEAL} 1.5% 0 round 0 0 6px 6px)` }}>
            <img src={art} alt={`${name} booster pack`} draggable={false} className="h-full w-full object-fill" />
            <div className="pack-sheen pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgb(255_255_255/0.35)_50%,transparent_60%)]" />
          </div>
          {flash}
        </div>
      </div>
    );
  }
  return (
    <div className={float}>
      <div className={`relative isolate aspect-[5/8] select-none ${size === 'lg' ? 'w-60' : 'w-36'} ${motion}`}>
        {/* The top seal, which tears off. */}
        <Seal torn={state === 'torn'} height="1rem" face={{ className: `rounded-t-md ${crimp}` }} />
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
        {flash}
      </div>
    </div>
  );
}
