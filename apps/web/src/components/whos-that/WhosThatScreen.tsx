import type { WhosThatShape } from '@poke-tcg/campaign';
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { BOX, BOX_PX, drawReveal, drawSilhouette } from '../../utils/whosThat';
import { CatalogContext } from '../InspectContext';

/**
 * The Who's That Pokémon? screen (the anime's: public/whos-that/template.webp) with the Pokémon's silhouette in its burst
 * (utils/whosThat.ts), or, once it's named, passed or missed (`reveal`), the card's art through the same shape and
 * "It's …!". `children` go over it (a clock).
 */
export function WhosThatScreen({ shape, reveal, children }: { shape: WhosThatShape | null; reveal?: { cardId: string; answer: string } | null; children?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const catalog = useContext(CatalogContext);
  const imageUrl = reveal ? catalog?.get(reveal.cardId)?.imageUrl : undefined;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!shape) return void c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    drawSilhouette(c, shape);
    if (!imageUrl) return;
    // The card's art, once loaded (the silhouette stays until then).
    let current = true;
    const image = new Image();
    image.onload = () => current && drawReveal(c, shape, image);
    image.src = `${imageUrl}/high.webp`;
    return () => {
      current = false;
    };
  }, [shape, imageUrl]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-600 select-none [container-type:inline-size]">
      <img src="/whos-that/template.webp" alt="" draggable={false} className="absolute inset-0 size-full" />
      <canvas
        ref={canvas}
        width={BOX_PX.width}
        height={BOX_PX.height}
        className="absolute"
        style={{ left: `${BOX.left * 100}%`, top: `${BOX.top * 100}%`, width: `${BOX.width * 100}%`, height: `${BOX.height * 100}%` }}
      />
      {reveal && (
        // The Pokémon logo's yellow and blue: the screen's own colours, not the site's theme.
        <div className="absolute bottom-[5%] left-[4%] font-heading text-[clamp(1.25rem,4.5cqw,3rem)] text-[#ffcb05] [-webkit-text-stroke:2px_#2a75bb] drop-shadow-[0_3px_0_#1d4f80]">
          It’s {reveal.answer}!
        </div>
      )}
      {children}
    </div>
  );
}
