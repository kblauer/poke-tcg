import { ACCESSORIES, ACCESSORY_LIMIT, accessoryCopies, CONTEST_CATEGORIES, CONTEST_THEMES, DRESS_SECONDS, type ContestState } from '@poke-tcg/campaign';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BUTTON } from '../../utils/styles';
import { ContestSprite, rankName } from './contestUi';

/** The stage, in the game's pixels (the DS's lower screen), drawn at SCALE; the Pokémon's 80x80 sprite in its middle. */
const STAGE_W = 256;
const STAGE_H = 192;
const SCALE = 2;
const MON = { x: 88, y: 48, size: 80 };
/** An accessory's piece on the stage (no pictures of Platinum's accessories are in the decompilation: a labelled piece). */
const PIECE_W = 44;
const PIECE_H = 12;

interface Placed {
  key: number;
  id: number;
  x: number;
  y: number;
}

/** The sprite's opaque pixels (80x80), read once from its picture, for what an accessory touches. */
function useSpriteMask(species: number) {
  const [mask, setMask] = useState<Uint8Array | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = MON.size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, MON.size, MON.size).data;
      const m = new Uint8Array(MON.size * MON.size);
      for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3]! > 0 ? 1 : 0;
      setMask(m);
    };
    img.src = `/extras/contest/pokemon/${species}.png`;
  }, [species]);
  return mask;
}

const overlaps = (a: Placed, b: Placed) => a.x < b.x + PIECE_W && b.x < a.x + PIECE_W && a.y < b.y + PIECE_H && b.y < a.y + PIECE_H;

/**
 * The accessories that count (ov22_02255D44): those touching the Pokémon (16 points over each, tested against its
 * sprite) and those touching one that does, in a chain; the rest lie loose on the stage and are dropped at the end.
 */
function attached(placed: readonly Placed[], mask: Uint8Array | null): Set<number> {
  const on = new Set<number>();
  if (!mask) return on;
  for (const p of placed)
    for (let i = 0; i < 16; i++) {
      const sx = Math.floor(p.x + ((i % 4) + 0.5) * (PIECE_W / 4)) - MON.x;
      const sy = Math.floor(p.y + (Math.floor(i / 4) + 0.5) * (PIECE_H / 4)) - MON.y;
      if (sx >= 0 && sy >= 0 && sx < MON.size && sy < MON.size && mask[sy * MON.size + sx]) {
        on.add(p.key);
        break;
      }
    }
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of placed) if (!on.has(p.key) && placed.some((q) => on.has(q.key) && overlaps(p, q))) on.add(p.key), (grew = true);
  }
  return on;
}

/**
 * The Visual Competition's dressing room (ov22): 60 seconds to dress the Pokémon with accessories for the theme, as many
 * as the rank allows (loose ones on the stage count too). Drag one from the list onto the Pokémon, drag it off the stage
 * to take it back. The Fashion Case holds every accessory (a choice: Platinum's are won and found through the game).
 */
export function VisualRound({ contest, busy, onDone }: { contest: ContestState; busy: boolean; onDone: (outfit: number[]) => void }) {
  const me = contest.entrants[0]!;
  const mask = useSpriteMask(me.species);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [left, setLeft] = useState(DRESS_SECONDS);
  const [drag, setDrag] = useState<{ key: number; id: number; dx: number; dy: number; x: number; y: number; from: 'list' | 'stage' } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const nextKey = useRef(1);
  const done = useRef(false);
  const limit = ACCESSORY_LIMIT[contest.rank]!;
  const on = useMemo(() => attached(placed, mask), [placed, mask]);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(placed.filter((p) => on.has(p.key)).map((p) => p.id));
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const s = Math.max(0, DRESS_SECONDS - Math.floor((Date.now() - started) / 1000));
      setLeft(s);
      if (s === 0) finishRef.current();
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  const count = (id: number) => placed.filter((p) => p.id === id).length;
  const stagePoint = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / SCALE, y: (e.clientY - r.top) / SCALE };
  };
  const startDrag = (e: React.PointerEvent, id: number, from: 'list' | 'stage', p?: Placed) => {
    if (done.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = stagePoint(e);
    setDrag(p ? { key: p.key, id, dx: at.x - p.x, dy: at.y - p.y, x: p.x, y: p.y, from } : { key: nextKey.current++, id, dx: PIECE_W / 2, dy: PIECE_H / 2, x: at.x - PIECE_W / 2, y: at.y - PIECE_H / 2, from });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const at = stagePoint(e);
    setDrag({ ...drag, x: at.x - drag.dx, y: at.y - drag.dy });
  };
  const endDrag = () => {
    if (!drag) return;
    const inside = drag.x + PIECE_W > 0 && drag.x < STAGE_W && drag.y + PIECE_H > 0 && drag.y < STAGE_H;
    setPlaced((ps) => {
      const rest = ps.filter((p) => p.key !== drag.key);
      if (!inside || (drag.from === 'list' && (rest.length >= limit || count(drag.id) >= accessoryCopies(drag.id)))) return rest;
      return [...rest, { key: drag.key, id: drag.id, x: Math.max(-PIECE_W / 2, Math.min(STAGE_W - PIECE_W / 2, drag.x)), y: Math.max(-PIECE_H / 2, Math.min(STAGE_H - PIECE_H / 2, drag.y)) }];
    });
    setDrag(null);
  };
  const shown = drag ? [...placed.filter((p) => p.key !== drag.key), { key: drag.key, id: drag.id, x: drag.x, y: drag.y }] : placed;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-heading text-lg">
          Visual Competition · {CONTEST_CATEGORIES[contest.category]} Contest, {rankName(contest.rank)}
        </h2>
        <span className="text-sm">
          Theme: <b className="text-yellow-300">The {CONTEST_THEMES[contest.theme]}</b>
        </span>
        <span className={`text-sm tabular-nums ${left <= 10 ? 'text-red-400' : 'text-slate-300'}`}>{left} s</span>
        <span className="text-sm text-slate-400">
          {placed.length}/{limit} accessories · {on.size} on {me.name}
        </span>
        <button className={`${BUTTON} ml-auto`} disabled={busy || done.current} onClick={finish}>
          Done!
        </button>
      </div>
      <div className="flex flex-wrap gap-4">
        <div
          ref={stage}
          className="relative shrink-0 touch-none overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_40%,#fef3c7_0%,#fbcfe8_45%,#a78bfa_100%)] ring-1 ring-slate-600"
          style={{ width: STAGE_W * SCALE, height: STAGE_H * SCALE }}
        >
          <div className="pointer-events-none absolute" style={{ left: MON.x * SCALE, top: MON.y * SCALE }}>
            <ContestSprite species={me.species} size={MON.size * SCALE} />
          </div>
          {shown.map((p) => (
            <div
              key={p.key}
              className={`absolute flex cursor-grab items-center justify-center truncate rounded-full px-1 text-[10px] font-semibold text-slate-900 shadow ring-1 ring-black/30 ${on.has(p.key) || drag?.key === p.key ? 'bg-yellow-200' : 'bg-white/60'}`}
              style={{ left: p.x * SCALE, top: p.y * SCALE, width: PIECE_W * SCALE, height: PIECE_H * SCALE }}
              title={ACCESSORIES[p.id]}
              onPointerDown={(e) => startDrag(e, p.id, 'stage', p)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >
              {ACCESSORIES[p.id]}
            </div>
          ))}
        </div>
        <ul className="grid max-h-[384px] min-w-56 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1 overflow-y-auto pr-1">
          {ACCESSORIES.map((name, id) => {
            const used = count(id);
            const out = used >= accessoryCopies(id) || placed.length >= limit;
            return (
              <li key={id}>
                <div
                  className={`flex touch-none select-none items-center justify-between rounded bg-slate-700 px-2 py-1 text-xs ${out ? 'opacity-40' : 'cursor-grab hover:bg-slate-600'}`}
                  onPointerDown={(e) => !out && startDrag(e, id, 'list')}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                >
                  <span className="truncate">{name}</span>
                  <span className="text-slate-400">{accessoryCopies(id) - used}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs text-slate-400">
        Dress {me.name} for the theme: accessories that suit it earn stars, and its condition earns hearts. Only the accessories touching it (or touching one that does) count; lit pieces are on.
      </p>
    </div>
  );
}
