// The Super Contests' screens drawn as Platinum's: two 256x192 DS screens of layers (the BG screens) and sprites (cells
// of the OBJ sheets), from tools/extras/platinum_contest_gfx.py's pictures and its manifest (public/extras/contest/gfx.json:
// each sprite sheet's cells, origins and animations, and where the game puts them). Drawn crisp at SCALE.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export const SCALE = 2;
export const SCREEN_W = 256;
export const SCREEN_H = 192;
const BASE = '/extras/contest/';

export interface GfxCell {
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
}
export interface GfxSheet {
  file: string;
  width: number;
  height: number;
  cells: GfxCell[];
  animations?: { frames: { cell: number; duration: number }[]; loopStart: number; playMode: number }[];
}
type GfxFiles = Record<string, Record<string, unknown>>;

let loading: Promise<GfxFiles> | null = null;
/** The manifest's sprite sheets (gfx.json's files, `sprites` and `dressup.sprites`), loaded once. */
export function useGfx() {
  const [files, setFiles] = useState<GfxFiles | null>(null);
  useEffect(() => {
    loading ??= fetch(`${BASE}gfx.json`).then((r) => r.json()).then((g: { files: GfxFiles }) => g.files);
    let live = true;
    loading.then((f) => live && setFiles(f)).catch(() => (loading = null));
    return () => {
      live = false;
    };
  }, []);
  return files && { sheet: (name: string): GfxSheet | null => ((files.sprites?.[name] ?? files['dressup.sprites']?.[name]) as GfxSheet | undefined) ?? null };
}
export type Gfx = NonNullable<ReturnType<typeof useGfx>>;

/** A DS screen: 256x192 of layers and sprites, scaled up; its contents placed in the game's pixels. */
export function DsScreen({ children, className = '', onPointerMove, onPointerUp, innerRef }: { children: ReactNode; className?: string; onPointerMove?: (e: React.PointerEvent) => void; onPointerUp?: (e: React.PointerEvent) => void; innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className={`relative shrink-0 overflow-hidden bg-black ${className}`} style={{ width: SCREEN_W * SCALE, height: SCREEN_H * SCALE }}>
      <div ref={innerRef} className="absolute left-0 top-0 origin-top-left [image-rendering:pixelated]" style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${SCALE})` }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {children}
      </div>
    </div>
  );
}

/** A BG layer (a picture of the manifest's) at its place. */
export function Layer({ src, x = 0, y = 0, style }: { src: string; x?: number; y?: number; style?: CSSProperties }) {
  return <img src={BASE + src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none [image-rendering:pixelated]" style={{ left: x, top: y, ...style }} />;
}

/** One cell of a sprite sheet, its origin at (x, y) as the game positions sprites. */
export function Cell({ sheet, cell, x, y, style, className = '', onPointerDown, title }: { sheet: GfxSheet | null; cell: number; x: number; y: number; style?: CSSProperties; className?: string; onPointerDown?: (e: React.PointerEvent) => void; title?: string }) {
  const c = sheet?.cells[cell];
  if (!sheet || !c) return null;
  return (
    <div
      title={title}
      className={`absolute bg-no-repeat [image-rendering:pixelated] ${onPointerDown ? '' : 'pointer-events-none'} ${className}`}
      style={{ left: x - c.originX, top: y - c.originY, width: c.w, height: c.h, backgroundImage: `url(${BASE}${sheet.file})`, backgroundPosition: `${-c.x}px ${-c.y}px`, ...style }}
      onPointerDown={onPointerDown}
    />
  );
}

/** The cell an animation shows `ticks` (1/60 s) in (looping from its loopStart for play modes 2 and 4). */
export function animCell(sheet: GfxSheet | null, anim: number, ticks: number) {
  const a = sheet?.animations?.[anim];
  if (!a?.frames.length) return anim;
  const total = a.frames.reduce((s, f) => s + Math.max(1, f.duration), 0);
  let t = ticks;
  if (t >= total) {
    if (a.playMode === 2 || a.playMode === 4) {
      const loop = a.frames.slice(a.loopStart).reduce((s, f) => s + Math.max(1, f.duration), 0) || total;
      t = total - loop + ((t - (total - loop)) % loop);
    } else return a.frames.at(-1)!.cell;
  }
  for (const f of a.frames) {
    t -= Math.max(1, f.duration);
    if (t < 0) return f.cell;
  }
  return a.frames.at(-1)!.cell;
}

/** A clock in game ticks (60 a second) from when the screen opened, for the sprites' animations. */
export function useTicks(running = true) {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let id = 0;
    const loop = () => {
      setTicks(Math.floor(((performance.now() - start) / 1000) * 60));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [running]);
  return ticks;
}

/** Text drawn on a screen as the game prints it: small, dark, with a light shadow (the DS's message font isn't ported). */
export function ScreenText({ x, y, children, className = '', align = 'left', w }: { x: number; y: number; children: ReactNode; className?: string; align?: 'left' | 'center' | 'right'; w?: number }) {
  return (
    <div className={`pointer-events-none absolute whitespace-nowrap text-[8px] leading-[10px] font-bold text-slate-800 [text-shadow:1px_1px_0_rgba(255,255,255,0.7)] ${className}`} style={{ left: align === 'center' && w === undefined ? x : x, top: y, width: w, textAlign: align, transform: align === 'center' && w === undefined ? 'translateX(-50%)' : undefined }}>
      {children}
    </div>
  );
}

/** A message box (the game's window frame isn't in the archives: a plain white box with its border) at tile rect. */
export function MessageBox({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  return (
    <div className="absolute rounded-sm border-2 border-[#5a5a7a] bg-white px-1.5 py-1 text-[8px] leading-[11px] font-bold text-[#404058]" style={{ left: x, top: y, width: w, height: h }}>
      {children}
    </div>
  );
}

/** A Pokémon's Platinum sprite (80x80) centred on (x, y), optionally flipped or scaled. */
export function MonSprite({ species, x, y, scale = 1, flip = false, style }: { species: number; x: number; y: number; scale?: number; flip?: boolean; style?: CSSProperties }) {
  return (
    <img
      src={`${BASE}pokemon/${species}.png`}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none [image-rendering:pixelated]"
      style={{ left: x - 40, top: y - 40, width: 80, height: 80, transform: `scale(${flip ? -scale : scale}, ${scale})`, ...style }}
    />
  );
}
