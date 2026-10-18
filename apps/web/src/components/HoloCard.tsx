import { useEffect, useRef, useState } from 'react';
import type { HoloAttributes } from '../utils/holo';
import { adjust, clamp, round } from '../utils/math';
import { CARD_BACK } from '../utils/cardBack';
import { Spring } from '../utils/spring';

const INTERACT = { stiffness: 0.066, damping: 0.25 };
/** Slow, loose spring back to rest after the pointer leaves. */
const SNAP = { stiffness: 0.01, damping: 0.06 };

/** A `still` card's fixed light: the shine as if the pointer rested near its top left, flat (no tilt). */
const STILL = {
  '--pointer-x': '30%',
  '--pointer-y': '25%',
  '--pointer-from-center': 0.6,
  '--pointer-from-top': 0.25,
  '--pointer-from-left': 0.3,
  '--card-opacity': 0.7,
  '--background-x': '42%',
  '--background-y': '38%',
} as React.CSSProperties;

/**
 * A card with the holo effect from src/styles/holo: it tilts toward the pointer, and the shine
 * and glare layers follow it. Styles are picked by the data-* attributes (rarity, subtypes, …).
 * `still`: the shine is fixed and the card doesn't move or react to the pointer (the Active Pokémon on the board).
 */
export function HoloCard({
  img,
  name,
  attrs,
  foil,
  mask,
  still = false,
}: {
  img: string;
  name: string;
  attrs: HoloAttributes;
  /** Optional foil texture and mask images for styles that use them. */
  foil?: string;
  mask?: string;
  still?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  // Random per card, for styles with a randomised texture position (e.g. cosmos).
  const [seed] = useState(() => ({ x: Math.random(), y: Math.random() }));
  const motion = useRef<ReturnType<typeof createMotion>>(null);
  motion.current ??= createMotion(cardRef);

  useEffect(() => {
    const m = motion.current!;
    const onVisibility = () => m.reset();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      m.dispose();
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={`card ${attrs.types} interactive ${loading ? 'loading' : ''} ${mask ? 'masked' : ''}`}
      data-number={attrs.number}
      data-set={attrs.set}
      data-subtypes={attrs.subtypes}
      data-supertype={attrs.supertype}
      data-rarity={attrs.rarity}
      data-era={attrs.era}
      data-trainer-gallery={attrs.trainerGallery ? "true" : "false"}
      style={still ? STILL : undefined}
    >
      <div className="card__translater">
        <div
          className="card__rotator"
          onPointerMove={still ? undefined : (e) => motion.current!.interact(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
          onMouseOut={still ? undefined : () => motion.current!.interactEnd()}
        >
          <img className="card__back" src={CARD_BACK} alt="" loading="lazy" width="660" height="921" />
          <div
            className="card__front"
            style={
              {
                '--seedx': seed.x,
                '--seedy': seed.y,
                '--cosmosbg': `${Math.floor(seed.x * 734)}px ${Math.floor(seed.y * 1280)}px`,
                ...(!loading && (mask || foil) ? { '--mask': `url(${mask})`, '--foil': `url(${foil})` } : {}),
              } as React.CSSProperties
            }
          >
            <img src={img} alt={name} onLoad={() => setLoading(false)} width="660" height="921" />
            <div className="card__shine" />
            <div className="card__glare" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Springs for tilt, glare and background, written straight to the card's CSS variables each
 * animation frame so pointer movement doesn't re-render React.
 */
function createMotion(cardRef: React.RefObject<HTMLDivElement | null>) {
  const rotate = new Spring({ x: 0, y: 0 }, INTERACT);
  const glare = new Spring({ x: 50, y: 50, o: 0 }, INTERACT);
  const background = new Spring({ x: 50, y: 50 }, INTERACT);
  const springs = [rotate, glare, background];

  let frame: number | null = null;
  let snapTimer: ReturnType<typeof setTimeout> | undefined;

  function render() {
    const el = cardRef.current;
    if (!el) return;
    const g = glare.value;
    const fromCenter = clamp(Math.sqrt((g.y - 50) ** 2 + (g.x - 50) ** 2) / 50, 0, 1);
    const vars: Record<string, string | number> = {
      '--pointer-x': `${g.x}%`,
      '--pointer-y': `${g.y}%`,
      '--pointer-from-center': fromCenter,
      '--pointer-from-top': g.y / 100,
      '--pointer-from-left': g.x / 100,
      '--card-opacity': g.o,
      '--rotate-x': `${rotate.value.x}deg`,
      '--rotate-y': `${rotate.value.y}deg`,
      '--background-x': `${background.value.x}%`,
      '--background-y': `${background.value.y}%`,
    };
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, String(v));
  }

  function loop(now: number) {
    let moving = false;
    for (const s of springs) moving = s.tick(now) || moving;
    render();
    frame = moving ? requestAnimationFrame(loop) : null;
  }
  const start = () => {
    frame ??= requestAnimationFrame(loop);
  };

  function setSprings(settings: typeof INTERACT, values: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number; o: number }], opts?: { soft?: number }) {
    for (const s of springs) {
      s.stiffness = settings.stiffness;
      s.damping = settings.damping;
    }
    background.set(values[0], opts);
    rotate.set(values[1], opts);
    glare.set(values[2], opts);
    start();
  }

  return {
    /** Tilts the card toward a pointer position within `rect`. */
    interact(clientX: number, clientY: number, rect: DOMRect) {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(snapTimer);
      cardRef.current?.classList.add('interacting');
      const percent = {
        x: clamp(round((100 / rect.width) * (clientX - rect.left))),
        y: clamp(round((100 / rect.height) * (clientY - rect.top))),
      };
      const center = { x: percent.x - 50, y: percent.y - 50 };
      setSprings(INTERACT, [
        { x: adjust(percent.x, 0, 100, 37, 63), y: adjust(percent.y, 0, 100, 33, 67) },
        { x: round(-(center.x / 3.5)), y: round(center.y / 3.5) },
        { x: round(percent.x), y: round(percent.y), o: 1 },
      ]);
    },
    /** Lets the card drift back to rest after `delay` ms. */
    interactEnd(delay = 500) {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        cardRef.current?.classList.remove('interacting');
        setSprings(SNAP, [{ x: 50, y: 50 }, { x: 0, y: 0 }, { x: 50, y: 50, o: 0 }], { soft: 1 });
      }, delay);
    },
    /** Snaps straight to rest (e.g. when the tab is hidden). */
    reset() {
      clearTimeout(snapTimer);
      cardRef.current?.classList.remove('interacting');
      rotate.set({ x: 0, y: 0 }, { hard: true });
      glare.set({ x: 50, y: 50, o: 0 }, { hard: true });
      background.set({ x: 50, y: 50 }, { hard: true });
      render();
    },
    dispose() {
      clearTimeout(snapTimer);
      if (frame !== null) cancelAnimationFrame(frame);
    },
  };
}
