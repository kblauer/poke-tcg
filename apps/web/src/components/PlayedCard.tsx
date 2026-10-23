import { lookupCard, type CardLibrary } from '@poke-tcg/game-engine';
import { useEffect, useRef } from 'react';
import { Card } from './Card';

/** How long a CPU move that shows its card stays on screen (GamePage waits this long before the next move). */
export const PLAYED_CARD_MS = 1420;

/** The card's timing, in ms: it pops in (fully shown at ENTER_MS, settled at SETTLE_MS), is held still until BURST_MS, then bursts away until PLAYED_CARD_MS. */
const ENTER_MS = 190;
const SETTLE_MS = 300;
const BURST_MS = 1000;
/** When the burst starts after the card first shows: the Pokémon it changed glow from then (Slot's `spotlight`), once the card is out of the way. */
export const PLAYED_CARD_BURST_MS = BURST_MS;
/** The sparks the burst throws out, evenly round the card, every other one further. */
const SPARKS = Array.from({ length: 14 }, (_, i) => ({ angle: (i / 14) * 2 * Math.PI, reach: i % 2 ? 1 : 0.7 }));

/**
 * The card the CPU just played or used (a Trainer, an Energy, a Pokémon put on the Bench or evolved, the Pokémon whose
 * power it used, the Stadium), shown large while the move is on screen (PLAYED_CARD_MS), as TCG Pocket does: centred on
 * whatever holds it (the CPU's side between its Bench and Active on a big screen, the play area on a phone), on a
 * radial shadow; it pops in, is held, then bursts away (it flares white and grows as it fades, with a ring of light and
 * sparks flying out). `stamp` is the view's version, so each move shows once. It can't be clicked or hovered. `scale`:
 * its size, times the large card's.
 */
export function PlayedCard({ defId, cards, stamp, scale = 1.6 }: { defId: string; cards: CardLibrary; stamp: number; scale?: number }) {
  const card = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The burst and the card's fade are one: they start together, while the card is still fully shown, and fade out at the same rate.
    const burst = { delay: BURST_MS, duration: PLAYED_CARD_MS - BURST_MS, easing: 'linear', fill: 'forwards' as const };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      card.current?.animate([{ opacity: 0 }, { opacity: 1, offset: ENTER_MS / PLAYED_CARD_MS }, { opacity: 1, offset: BURST_MS / PLAYED_CARD_MS }, { opacity: 0 }], { duration: PLAYED_CARD_MS, fill: 'forwards' });
      return;
    }
    card.current?.animate(
      [
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1.05)', offset: ENTER_MS / BURST_MS },
        { opacity: 1, transform: 'none', offset: SETTLE_MS / BURST_MS },
        { opacity: 1, transform: 'none' },
      ],
      { duration: BURST_MS, easing: 'ease-out', fill: 'forwards' },
    );
    card.current?.animate([{ opacity: 1, transform: 'none', filter: 'brightness(2.2)' }, { opacity: 0, transform: 'scale(1.15)', filter: 'brightness(3) blur(4px)' }], burst);
    flash.current?.animate([{ opacity: 0.9, transform: 'scale(0.8)' }, { opacity: 0, transform: 'scale(1.8)' }], burst);
    // They fly out past the card's edges (it's shown 1.6 times its box).
    const size = sparks.current?.offsetHeight ?? 0;
    sparks.current?.querySelectorAll<HTMLElement>('[data-spark]').forEach((el, i) => {
      const { angle, reach } = SPARKS[i]!;
      const to = `translate(${Math.cos(angle) * reach * size * 0.9}px, ${Math.sin(angle) * reach * size * 0.9}px) scale(0.3)`;
      el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: to }], burst);
    });
  }, [stamp]);
  const def = lookupCard(cards, defId);
  return (
    <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center" role="status" aria-label={`The CPU played ${def.name}`}>
      <div className="relative">
        <div ref={card} className="relative opacity-0">
          {/* The radial shadow behind it, fading with it. */}
          <div style={{ transform: `scale(${scale})` }} className="absolute inset-[-45%] rounded-full bg-[radial-gradient(closest-side,rgb(0_0_0/0.75)_40%,rgb(0_0_0/0.4)_70%,transparent)]" />
          <div style={{ transform: `scale(${scale})` }} className="relative rounded-lg shadow-[0_0_32px_rgba(0,0,0,0.85)]">
            <Card def={def} highRes />
          </div>
        </div>
        {/* The ring of light and the sparks, in front of the card (they show while it's still there), both centred on it. */}
        <div ref={flash} className="absolute inset-[-50%] rounded-full bg-[radial-gradient(circle,rgb(224_242_254/0.9)_0%,rgb(125_211_252/0.5)_35%,transparent_70%)] opacity-0 mix-blend-screen" />
        <div ref={sparks} className="absolute inset-0">
          {SPARKS.map((_, i) => (
            <span key={i} data-spark className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full bg-sky-100 opacity-0 shadow-[0_0_10px_3px_rgb(125_211_252)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
