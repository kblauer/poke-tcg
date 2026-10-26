import type { EffectMoment } from '@poke-tcg/campaign';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { at, emit, LOOKS, MOMENT_MS, PAD, type Look, type Particle } from '../utils/flairEffects';

/** A card's box on screen (getBoundingClientRect). */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One particle drawn at its place, `w` the card's width in pixels. */
function draw(ctx: CanvasRenderingContext2D, l: Look, p: Particle, s: { x: number; y: number; angle: number; alpha: number; vx: number; vy: number }, w: number) {
  const r = p.size * w;
  ctx.globalAlpha = s.alpha;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  ctx.save();
  ctx.translate(s.x * w, s.y * w);
  switch (l.shape) {
    case 'dot': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spark': {
      // A streak along its motion.
      const len = Math.hypot(s.vx, s.vy) * w * 0.06 + r;
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.lineWidth = Math.max(1, r * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      break;
    }
    case 'drop': {
      ctx.rotate(Math.atan2(s.vy, s.vx) - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.4);
      ctx.quadraticCurveTo(r, 0, 0, r);
      ctx.quadraticCurveTo(-r, 0, 0, -r * 1.4);
      ctx.fill();
      break;
    }
    case 'leaf':
    case 'feather': {
      ctx.rotate(s.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * (l.shape === 'leaf' ? 0.45 : 0.22), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = s.alpha * 0.5;
      ctx.strokeStyle = l.shape === 'leaf' ? 'rgb(0 60 20)' : 'rgb(150 160 175)';
      ctx.lineWidth = Math.max(0.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.stroke();
      break;
    }
    case 'bubble': {
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = s.alpha * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shard': {
      ctx.rotate(s.angle);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, r * 0.6);
      ctx.lineTo(-r * 0.7, r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'star': {
      ctx.rotate(s.angle);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const d = i % 2 ? r * 0.28 : r;
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'confetti': {
      ctx.rotate(s.angle);
      // Turning over as it falls.
      ctx.scale(1, Math.cos(s.angle * 1.7 + p.phase));
      ctx.fillRect(-r * 0.6, -r * 0.35, r * 1.2, r * 0.7);
      break;
    }
    case 'ring': {
      ctx.lineWidth = Math.max(1, r * 0.15);
      ctx.beginPath();
      ctx.arc(0, 0, r * (1 + (1 - s.alpha) * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/**
 * Card flair's effect (`effect`, a key of campaign's EFFECTS) at a `moment`, played once over the card at `box` (on a
 * canvas fixed over the page, `PAD` of the card's size around it, so nothing clips it), then `onDone`. Nothing is drawn
 * for people who prefer reduced motion.
 */
export function FlairEffect({ effect, moment, box, onDone }: { effect: string; moment: EffectMoment; box: Box; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const l = LOOKS[effect];
  const padX = box.width * PAD;
  const padY = box.height * PAD;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !l || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      done.current();
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const cw = box.width + padX * 2;
    const ch = box.height + padY * 2;
    el.width = Math.round(cw * dpr);
    el.height = Math.round(ch * dpr);
    const w = box.width;
    const height = box.height / box.width;
    const particles = emit(l, moment, height);
    const total = MOMENT_MS[moment];
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const ms = now - start;
      const t = ms / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.translate(padX, padY);
      ctx.globalCompositeOperation = l.glow ? 'lighter' : 'source-over';
      const main = l.colors[0]!;
      // The moment's own light: a ring out from a played card, a column and a flash for an evolution, a flash on a Knock Out.
      if (moment === 'play' && ms < 600) {
        ctx.globalAlpha = 0.7 * (1 - ms / 600);
        ctx.strokeStyle = main;
        ctx.lineWidth = Math.max(2, w * 0.025);
        ctx.beginPath();
        ctx.ellipse(w / 2, box.height / 2, (w * 0.1 + w * 0.6 * (ms / 600)), (box.height * 0.08 + box.height * 0.45 * (ms / 600)), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (moment === 'evolve') {
        const rise = Math.min(1, ms / 900);
        const g = ctx.createLinearGradient(0, box.height, 0, box.height * (1 - rise * 1.3));
        g.addColorStop(0, main);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.35 * (ms < 1000 ? 1 : Math.max(0, 1 - (ms - 1000) / 400));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, box.height);
        if (ms > 850 && ms < 1300) {
          ctx.globalAlpha = 0.85 * (1 - (ms - 850) / 450);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, box.height);
        }
      }
      if (moment === 'ko' && ms < 350) {
        ctx.globalAlpha = 0.75 * (1 - ms / 350);
        ctx.fillStyle = main;
        ctx.fillRect(0, 0, w, box.height);
      }
      for (const p of particles) {
        const s = at(p, l, t);
        if (s) draw(ctx, l, p, s, w);
      }
      if (ms < total) frame = requestAnimationFrame(tick);
      else done.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!l) return null;
  return createPortal(
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none fixed z-[1300]"
      style={{ left: box.left - padX, top: box.top - padY, width: box.width + padX * 2, height: box.height + padY * 2 }}
    />,
    document.body,
  );
}
