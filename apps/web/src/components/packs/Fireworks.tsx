import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

/** How long the fireworks go on, and how often a new burst goes off. */
const FIREWORKS_MS = 4000;
const BURST_EVERY_MS = 250;

/**
 * Fireworks over the whole screen for a few seconds (canvas-confetti), for an all-rares pack: bursts go off at random
 * spots across the top of the screen, fewer as they die down. They don't block clicks, and with "reduce motion" on
 * there are none. Give it a new `key` to set them off again.
 */
export function Fireworks() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const fire = confetti.create(canvas.current, { resize: true, disableForReducedMotion: true });
    const end = Date.now() + FIREWORKS_MS;
    const timer = setInterval(() => {
      const left = end - Date.now();
      if (left <= 0) return clearInterval(timer);
      const particleCount = Math.round(60 * (left / FIREWORKS_MS));
      for (const x of [Math.random() * 0.3 + 0.1, Math.random() * 0.3 + 0.6]) {
        fire({ particleCount, startVelocity: 30, spread: 360, ticks: 60, gravity: 0.9, origin: { x, y: Math.random() * 0.3 + 0.1 }, zIndex: 0 });
      }
    }, BURST_EVERY_MS);
    return () => {
      clearInterval(timer);
      fire.reset();
    };
  }, []);
  // Above the pack window (z-50), below nothing that needs clicking: it lets every click through.
  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" aria-hidden />;
}
