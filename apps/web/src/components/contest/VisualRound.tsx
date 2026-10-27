import { ACCESSORIES, ACCESSORY_LIMIT, accessoryCopies, BACKDROPS, CONTEST_CATEGORIES, CONTEST_THEMES, DRESS_SECONDS, type ContestState } from '@poke-tcg/campaign';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Cell, DsScreen, Layer, MessageBox, SCALE, useGfx, useTicks } from './ds';
import { rankName } from './contestUi';

/** The dressing room's windows on the touch screen (ov22): the case on the left, the stage on the right; the Pokémon centred on (192, 56). */
const CASE = { x: 8, y: 16, w: 112, h: 128 };
const STAGE = { x: 136, y: 16, w: 112, h: 128 };
const MON = { x: 152, y: 16, size: 80 };
/** Accessories shown a page of the case (the game scatters the Fashion Case's at random, ov22_0225804C). */
const PER_PAGE = 10;
const PAGES = Math.ceil(100 / PER_PAGE);
const THUMB = 32;

interface Placed {
  key: number;
  id: number;
  x: number;
  y: number;
}
type Size = { w: number; h: number };

/** Every accessory's picture size (gfx.json's accessories). */
function useAccessorySizes() {
  const [sizes, setSizes] = useState<Size[] | null>(null);
  useEffect(() => {
    fetch('/extras/contest/gfx.json')
      .then((r) => r.json())
      .then((g: { files: { accessories: { items: { id: number; width: number; height: number }[] } } }) => {
        const out: Size[] = [];
        for (const a of g.files.accessories.items) out[a.id] = { w: a.width, h: a.height };
        setSizes(out);
      })
      .catch(() => setSizes(null));
  }, []);
  return sizes;
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

/**
 * The accessories that count (ov22_02255D44): those touching the Pokémon (16 points over each, tested against its sprite)
 * and those touching one that does, in a chain; the rest lie loose on the stage and are dropped at the end.
 */
function attached(placed: readonly Placed[], sizes: Size[], mask: Uint8Array | null): Set<number> {
  const on = new Set<number>();
  if (!mask) return on;
  const size = (p: Placed) => sizes[p.id] ?? { w: 16, h: 16 };
  for (const p of placed) {
    const { w, h } = size(p);
    for (let i = 0; i < 16; i++) {
      const sx = Math.floor(p.x + ((i % 4) + 0.5) * (w / 4)) - MON.x;
      const sy = Math.floor(p.y + (Math.floor(i / 4) + 0.5) * (h / 4)) - MON.y;
      if (sx >= 0 && sy >= 0 && sx < MON.size && sy < MON.size && mask[sy * MON.size + sx]) {
        on.add(p.key);
        break;
      }
    }
  }
  const overlaps = (a: Placed, b: Placed) => {
    const A = size(a);
    const B = size(b);
    return a.x < b.x + B.w && b.x < a.x + A.w && a.y < b.y + B.h && b.y < a.y + A.h;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of placed) if (!on.has(p.key) && placed.some((q) => on.has(q.key) && overlaps(p, q))) on.add(p.key), (grew = true);
  }
  return on;
}

/** A page's accessories scattered in the case, at places drawn from their ids (the game scatters them at random). */
function casePlaces(page: number, sizes: Size[]) {
  return Array.from({ length: PER_PAGE }, (_, k) => {
    const id = page * PER_PAGE + k;
    const { w, h } = sizes[id] ?? { w: 16, h: 16 };
    const r1 = ((id * 2654435761) >>> 0) / 2 ** 32;
    const r2 = ((id * 40503 + 12345) % 1000) / 1000;
    const col = k % 2;
    const row = Math.floor(k / 2);
    // Two columns of five bands, jittered inside each, so they don't pile up.
    return { id, x: CASE.x + 4 + col * 54 + Math.floor(r1 * Math.max(0, 50 - w)), y: CASE.y + 2 + row * 25 + Math.floor(r2 * Math.max(0, 24 - h)) };
  }).filter((a) => a.id < 100);
}

/**
 * The Visual Competition's dressing room (ov22), with Platinum's screens: the top screen counts the accessories and the
 * 60 seconds down under the theme; on the touch screen the Fashion Case (paged with the heart arrows; the backdrop case
 * on its button) and the stage. Drag an accessory onto the Pokémon; drag it back to the case to take it off. Only those
 * touching it (or touching one that does) count. The case holds every accessory (a choice: Platinum's are won and found).
 */
export function VisualRound({ contest, busy, onDone }: { contest: ContestState; busy: boolean; onDone: (outfit: number[]) => void }) {
  const me = contest.entrants[0]!;
  const gfx = useGfx();
  const sizes = useAccessorySizes();
  const mask = useSpriteMask(me.species);
  const ticks = useTicks();
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [left, setLeft] = useState(DRESS_SECONDS);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<'accessories' | 'backdrops'>('accessories');
  const [backdrop, setBackdrop] = useState(0);
  const [pressed, setPressed] = useState<{ button: number; at: number } | null>(null);
  const [drag, setDrag] = useState<{ key: number; id: number; dx: number; dy: number; x: number; y: number } | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const nextKey = useRef(1);
  const done = useRef(false);
  const limit = ACCESSORY_LIMIT[contest.rank]!;
  const on = useMemo(() => (sizes ? attached(placed, sizes, mask) : new Set<number>()), [placed, sizes, mask]);
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
  const point = (e: React.PointerEvent) => {
    const r = screen.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / SCALE, y: (e.clientY - r.top) / SCALE };
  };
  const startDrag = (e: React.PointerEvent, id: number, at: { x: number; y: number }, key?: number) => {
    if (done.current || !sizes) return;
    e.preventDefault();
    screen.current?.setPointerCapture(e.pointerId);
    const p = point(e);
    setDrag({ key: key ?? nextKey.current++, id, dx: p.x - at.x, dy: p.y - at.y, x: at.x, y: at.y });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    setDrag({ ...drag, x: p.x - drag.dx, y: p.y - drag.dy });
  };
  const endDrag = () => {
    if (!drag || !sizes) return;
    const { w, h } = sizes[drag.id]!;
    const cx = drag.x + w / 2;
    const cy = drag.y + h / 2;
    const onStage = cx >= STAGE.x && cx < STAGE.x + STAGE.w && cy >= STAGE.y && cy < STAGE.y + STAGE.h;
    setPlaced((ps) => {
      const rest = ps.filter((p) => p.key !== drag.key);
      const isNew = rest.length === ps.length;
      if (!onStage || (isNew && (rest.length >= limit || count(drag.id) >= accessoryCopies(drag.id)))) return rest;
      return [...rest, { key: drag.key, id: drag.id, x: Math.round(drag.x), y: Math.round(drag.y) }];
    });
    setDrag(null);
  };
  const press = (button: number, then: () => void) => {
    setPressed({ button, at: ticks });
    then();
  };
  const buttonCell = (button: number, lit = false) => (pressed?.button === button && ticks - pressed.at < 8 ? 2 : lit ? 1 : 0);
  const shown = drag ? [...placed.filter((p) => p.key !== drag.key), { key: drag.key, id: drag.id, x: drag.x, y: drag.y }] : placed;
  const casePage = sizes ? casePlaces(page, sizes) : [];
  const digits = String(left).padStart(2, '0');
  const timer = gfx?.sheet(left <= 10 ? 'timer-low' : 'timer') ?? null;
  return (
    <div className="space-y-2">
      <h2 className="font-heading text-lg">
        Visual Competition · {CONTEST_CATEGORIES[contest.category]} Contest, {rankName(contest.rank)}
      </h2>
      <div className="flex flex-col items-center gap-1">
        <DsScreen>
          <Layer src="dressup/top.png" />
          <Cell sheet={timer} cell={Number(digits[0])} x={103} y={58} />
          <Cell sheet={timer} cell={Number(digits[1])} x={127} y={58} />
          {Array.from({ length: limit }, (_, k) => (
            <Cell key={k} sheet={gfx?.sheet('counter') ?? null} cell={k < placed.length ? 0 : 1} x={38 + 18 * (k % 10)} y={104 + 18 * Math.floor(k / 10)} />
          ))}
          <MessageBox x={16} y={150} w={224} h={36}>
            Theme: “The {CONTEST_THEMES[contest.theme]}”!
            <br />
            You may use up to {limit} Accessories.
          </MessageBox>
        </DsScreen>
        <DsScreen innerRef={screen} onPointerMove={moveDrag} onPointerUp={endDrag}>
          <div className="absolute inset-0 bg-[#f8a8c8]" />
          <Layer src={tab === 'accessories' ? 'dressup/case-accessories.png' : 'dressup/case-backdrops.png'} x={CASE.x} y={CASE.y} />
          <div className="absolute overflow-hidden" style={{ left: STAGE.x, top: STAGE.y, width: STAGE.w, height: STAGE.h }}>
            <Layer src={`backdrops/${backdrop}${Math.floor(ticks / 34) % 2 ? '-2' : ''}.png`} />
            <img src={`/extras/contest/pokemon/${me.species}.png`} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: MON.x - STAGE.x, top: MON.y - STAGE.y }} />
            {shown
              .filter((p) => p.key !== drag?.key)
              .map((p) => (
                <img
                  key={p.key}
                  src={`/extras/contest/accessories/${p.id}.png`}
                  alt={ACCESSORIES[p.id]}
                  title={ACCESSORIES[p.id]}
                  draggable={false}
                  className={`absolute max-w-none cursor-grab touch-none ${on.has(p.key) ? '' : 'opacity-60'}`}
                  style={{ left: p.x - STAGE.x, top: p.y - STAGE.y }}
                  onPointerDown={(e) => startDrag(e, p.id, p, p.key)}
                />
              ))}
          </div>
          {tab === 'accessories'
            ? casePage.map((a) => {
                const out = count(a.id) >= accessoryCopies(a.id) || placed.length >= limit;
                return (
                  <img
                    key={a.id}
                    src={`/extras/contest/accessories/${a.id}.png`}
                    alt={ACCESSORIES[a.id]}
                    title={`${ACCESSORIES[a.id]} (${accessoryCopies(a.id) - count(a.id)} left)`}
                    draggable={false}
                    className={`absolute max-w-none touch-none ${out ? 'opacity-30' : 'cursor-grab'}`}
                    style={{ left: a.x, top: a.y }}
                    onPointerDown={(e) => !out && startDrag(e, a.id, a)}
                  />
                );
              })
            : BACKDROPS.map((name, b) => {
                const k = b % 9;
                return Math.floor(b / 9) === page % 2 ? (
                  <img
                    key={b}
                    src={`/extras/contest/backdrops/thumbs/${b}.png`}
                    alt={name}
                    title={name}
                    draggable={false}
                    className={`absolute max-w-none cursor-pointer ${backdrop === b ? 'outline outline-2 outline-yellow-300' : ''}`}
                    style={{ left: CASE.x + 6 + (k % 3) * (THUMB + 4), top: CASE.y + 8 + Math.floor(k / 3) * (THUMB + 8), width: THUMB, height: THUMB }}
                    onClick={() => setBackdrop(b)}
                  />
                ) : null;
              })}
          <Layer src={tab === 'accessories' ? 'dressup/frame.png' : 'dressup/frame-backdrops.png'} />
          {drag && sizes && <img src={`/extras/contest/accessories/${drag.id}.png`} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: drag.x, top: drag.y }} />}
          <Cell sheet={gfx?.sheet('button-1') ?? null} cell={buttonCell(1)} x={8} y={144} className="cursor-pointer" onPointerDown={() => press(1, () => setPage((p) => (p + (tab === 'accessories' ? PAGES : 2) - 1) % (tab === 'accessories' ? PAGES : 2)))} title="Previous" />
          <Cell sheet={gfx?.sheet('button-0') ?? null} cell={buttonCell(0)} x={48} y={144} className="cursor-pointer" onPointerDown={() => press(0, () => setPage((p) => (p + 1) % (tab === 'accessories' ? PAGES : 2)))} title="Next" />
          <Cell sheet={gfx?.sheet('button-2') ?? null} cell={buttonCell(2, tab === 'accessories')} x={96} y={144} className="cursor-pointer" onPointerDown={() => press(2, () => (setTab('accessories'), setPage(0)))} title="Accessories" />
          <Cell sheet={gfx?.sheet('button-3') ?? null} cell={buttonCell(3, tab === 'backdrops')} x={136} y={144} className="cursor-pointer" onPointerDown={() => press(3, () => (setTab('backdrops'), setPage(0)))} title="Backdrops" />
          <Cell sheet={gfx?.sheet('button-4') ?? null} cell={buttonCell(4)} x={184} y={144} className={busy ? '' : 'cursor-pointer'} onPointerDown={() => !busy && press(4, finish)} title="Done" />
          <div className="pointer-events-none absolute text-center text-[10px] font-bold text-white [text-shadow:1px_1px_0_#a03050]" style={{ left: 184, top: 158, width: 72 }}>
            DONE!
          </div>
          <div className="pointer-events-none absolute text-[7px] font-bold text-white [text-shadow:1px_1px_0_#a03050]" style={{ left: 8, top: 4 }}>
            {tab === 'accessories' ? `Page ${page + 1}/${PAGES}` : `Backdrops ${(page % 2) + 1}/2`}
          </div>
        </DsScreen>
      </div>
      <p className="text-center text-xs text-slate-400">
        Drag accessories from the case onto {me.name}; faded ones aren’t touching it and won’t count. {on.size} counted, {placed.length}/{limit} out.
      </p>
    </div>
  );
}
