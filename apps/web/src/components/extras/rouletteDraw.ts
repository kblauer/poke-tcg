// The roulette's screen as the GBA draws it (RouletteScreen's), pixel by pixel from the game's own tiles, tilemaps and
// palettes (tools/extras/emerald_roulette.py): the backdrop (the table's felt), BG 2 (the wheel, an affine BG turned with
// it), BG 1 (the grid, sliding off and on), BG 0 (the selection's box) and the sprites among them by their priorities,
// Shroomish's shadow blended (BLDALPHA) over what's under it. The windows and their text are the screen's own.
import { cos2, ROULETTE_GRID, ROULETTE_POKEMON_PALETTE_SLOTS, sin2, type RouletteGame, type RoulettePalette, type RouletteSprite } from '@poke-tcg/campaign';

export const W = 240;
export const H = 160;

/** roulette.json (tools/extras/emerald_roulette.py): the palettes, the grid's tilemap (grid.bin) and where each sheet's tiles start in tiles.png. */
export interface RouletteData {
  bgPalette: number[];
  objPalettes: number[][];
  grid: number[];
  sheets: Record<'window' | 'ball' | 'ballCounter' | 'center' | 'credit' | 'cursor' | 'gridIcons' | 'headers' | 'multiplier' | 'numbers' | 'shadow' | 'tilt' | 'wheelIcons', number>;
}
export interface RouletteAssets {
  data: RouletteData;
  /** Every 4bpp tile's pixels (each its colour's index), 64 a tile. */
  tiles: Uint8Array;
  /** BG 2, the wheel: 256x256 8bpp colour indexes. */
  wheel: Uint8Array;
}
type Assets = RouletteAssets;

/** The palettes as loaded (BG 0-13 sWheel_Pal, the sprite palettes in their slots), unfaded and faded as the game keeps them. */
export function initialPalette(data: RouletteData): RoulettePalette {
  const colors = Array<number>(512).fill(0);
  data.bgPalette.forEach((c, i) => (colors[i] = c));
  data.objPalettes.forEach((pal, slot) => pal.forEach((c, i) => (colors[256 + slot * 16 + i] = c)));
  return { unfaded: [...colors], faded: [...colors] };
}

/** The wheel's icons' frames (sAnim_WheelIcons, in tiles), by slot. */
const WHEEL_ICON_TILES = [0, 32, 64, 72, 8, 40, 48, 80, 16, 24, 56, 88];

/** A sprite to draw: its OAM priority and subpriority (lower in front), its place and how it's drawn. */
interface Obj {
  priority: number;
  subpriority: number;
  order: number;
  draw: () => void;
}

/**
 * The frame as the GBA shows it, into `out` (240x160 RGBA, as ImageData holds it): on the roulette's screen, the backdrop,
 * BG 2, BG 1, BG 0 and the sprites among them by priority (an OBJ above the BG of its own priority); black on the others
 * (the Game Corner's field isn't drawn, and the roulette loads behind black).
 */
export function renderRoulette(g: RouletteGame, assets: Assets, palette: RoulettePalette, out: Uint32Array) {
  const { data, tiles, wheel } = assets;
  const pal = palette.faded;
  // The frame in BGR555, and what each pixel is (0 the backdrop, 2 BG 2, 1 anything else) for Shroomish's shadow's blend.
  const fb = new Uint16Array(W * H);
  const layer = new Uint8Array(W * H);
  if (g.screen === 'game') {
    fb.fill(pal[0]!);
    const objs: Obj[] = [];
    collectSprites(g, assets, objs, fb, layer, pal);
    objs.sort((a, b) => a.priority - b.priority || a.subpriority - b.subpriority || a.order - b.order);
    // The lowest (priority, subpriority, id) in front: drawn last.
    const spritesAt = (priority: number) => {
      for (let i = objs.length - 1; i >= 0; i--) if (objs[i]!.priority === priority) objs[i]!.draw();
    };
    spritesAt(3);
    drawWheel(g, wheel, fb, layer, pal);
    spritesAt(2);
    drawGrid(g, data, tiles, fb, layer, pal);
    spritesAt(1);
    if (g.rectShown && g.rectSelection) drawSelectionBox(g.rectSelection, data, tiles, fb, layer, pal);
    spritesAt(0);
  }
  for (let i = 0; i < fb.length; i++) {
    const c = fb[i]!;
    const r = c & 31;
    const gr = (c >> 5) & 31;
    const b = (c >> 10) & 31;
    out[i] = 0xff000000 | (((b << 3) | (b >> 2)) << 16) | (((gr << 3) | (gr >> 2)) << 8) | ((r << 3) | (r >> 2));
  }
}

/** BG 2: the wheel, turned about its centre as UpdateWheelPosition sets the affine registers (no wraparound). */
function drawWheel(g: RouletteGame, wheel: Uint8Array, fb: Uint16Array, layer: Uint8Array, pal: number[]) {
  const sin = Math.trunc(sin2(g.wheelAngle) / 16);
  const a = Math.trunc(cos2(g.wheelAngle) / 16);
  const [b, c, d] = [sin, -sin, a];
  const bg2x = 0x7400 - a * (g.offsetX + 116) - b * (g.offsetY + 80);
  const bg2y = 0x5400 - c * (g.offsetX + 116) - d * (g.offsetY + 80);
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const tx = (bg2x + a * sx + b * sy) >> 8;
      const ty = (bg2y + c * sx + d * sy) >> 8;
      if (tx < 0 || ty < 0 || tx > 255 || ty > 255) continue;
      const v = wheel[ty * 256 + tx]!;
      if (!v) continue;
      fb[sy * W + sx] = pal[v]!;
      layer[sy * W + sx] = 2;
    }
  }
}

/** A text BG's tile entry drawn at a screen place: its tile (window.png's), flips and palette. */
function drawTile(entry: number, sx: number, sy: number, tiles: Uint8Array, fb: Uint16Array, layer: Uint8Array, pal: number[]) {
  const tile = entry & 0x3ff;
  const hflip = entry & 0x400;
  const vflip = entry & 0x800;
  const base = (entry >> 12) * 16;
  for (let y = 0; y < 8; y++) {
    const py = sy + y;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < 8; x++) {
      const px = sx + x;
      if (px < 0 || px >= W) continue;
      const v = tiles[tile * 64 + (vflip ? 7 - y : y) * 8 + (hflip ? 7 - x : x)]!;
      if (!v) continue;
      fb[py * W + px] = pal[base + v]!;
      layer[py * W + px] = 1;
    }
  }
}

/** The grid's BG 1 tilemap: the board (grid.bin's first 16x13 at 14,7) and DrawGridBackground's highlight of a selection. */
function gridTilemap(selectionId: number, grid: number[]) {
  const map = new Uint16Array(32 * 32);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 16; x++) map[(7 + y) * 32 + 14 + x] = grid[y * 16 + x]!;
  const kind = selectionId === 0 ? null : selectionId < 5 ? 'column' : selectionId % 5 === 0 ? 'row' : 'square';
  const ids = kind === 'column' ? [0, 1, 2, 3].map((i) => i * 5 + selectionId) : kind === 'row' ? [0, 1, 2, 3, 4].map((i) => i + selectionId) : kind ? [selectionId] : [];
  for (const id of ids) {
    const s = ROULETTE_GRID[id]!;
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) map[(s.y + j) * 32 + s.x + k] = grid[(s.tilemapOffset + j) * 3 + 208 + k]!;
  }
  return map;
}

/** BG 1: the grid, scrolled off to the right by gridX (BG1HOFS 0x200 − gridX; its other half, 256-511, is empty). */
function drawGrid(g: RouletteGame, data: RouletteData, tiles: Uint8Array, fb: Uint16Array, layer: Uint8Array, pal: number[]) {
  const map = gridTilemap(g.gridHighlight, data.grid);
  const hofs = (0x200 - g.gridX) & 511;
  for (let ty = 0; ty < 32; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const entry = map[ty * 32 + tx]!;
      if (!entry) continue;
      // The tile's place in the 512-wide BG, scrolled: it shows if it falls on the screen.
      const sx = (((tx * 8 - hofs) % 512) + 512) % 512;
      if (sx >= W && sx < 512 - 8) continue;
      drawTile(entry, sx >= 512 - 8 ? sx - 512 : sx, ty * 8, tiles, fb, layer, pal);
    }
  }
}

/** BG 0: the selection's box (UpdateGridSelectionRect: grid.bin's boxes for a square, a column or a row). */
function drawSelectionBox(selectionId: number, data: RouletteData, tiles: Uint8Array, fb: Uint16Array, layer: Uint8Array, pal: number[]) {
  const put = (src: number, left: number, top: number, w: number, h: number) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) drawTile(data.grid[src + y * w + x]!, (left + x) * 8, (top + y) * 8, tiles, fb, layer, pal);
  };
  if (selectionId < 5) put(281, selectionId * 3 + 14, 7, 3, 13);
  else if (selectionId % 5 === 0) put(320, 14, Math.trunc((selectionId - 1) / 5) * 3 + 10, 16, 3);
  else put(272, (selectionId % 5) * 3 + 14, Math.trunc((selectionId - 1) / 5) * 3 + 7, 3, 3);
}

/** The sprites on screen this frame, each with its OAM priority, subpriority and creation order (sprite id). */
function collectSprites(g: RouletteGame, assets: Assets, objs: Obj[], fb: Uint16Array, layer: Uint8Array, pal: number[]) {
  const { tiles, data } = assets;
  const sheets = data.sheets;
  // EVA, EVB of BLDALPHA: Shroomish's shadow's, while it shows (8, 8 otherwise, as Task_StartPlaying sets it).
  const alpha = g.shroomishShadowTimer ? g.shroomishShadowAlpha : 0x808;
  const eva = alpha & 31;
  const evb = (alpha >> 8) & 31;
  /** A sprite: `sheet`'s tiles from `tile` (1D mapping), its palette slot, centred at cx, cy; affine with a matrix (and double size), see-through with `blend`. */
  const add = (
    priority: number,
    subpriority: number,
    order: number,
    sheet: keyof RouletteData['sheets'],
    tile: number,
    w: number,
    h: number,
    slot: number,
    cx: number,
    cy: number,
    opts: { hFlip?: boolean; matrix?: [number, number, number, number]; double?: boolean; blend?: boolean } = {},
  ) => {
    objs.push({
      priority,
      subpriority,
      order,
      draw: () => {
        const start = sheets[sheet] + tile;
        const aw = opts.double ? w * 2 : w;
        const ah = opts.double ? h * 2 : h;
        // OAM's coordinates wrap (x 9 bits, y 8), as the GBA shows a sprite half off an edge.
        let left = (((cx - aw / 2) % 512) + 512) % 512;
        if (left > 512 - aw) left -= 512;
        let top = (((cy - ah / 2) % 256) + 256) % 256;
        if (top > 256 - ah) top -= 256;
        for (let py = 0; py < ah; py++) {
          const sy = top + py;
          if (sy < 0 || sy >= H) continue;
          for (let px = 0; px < aw; px++) {
            const sx = left + px;
            if (sx < 0 || sx >= W) continue;
            let tx: number;
            let ty: number;
            if (opts.matrix) {
              const [a, b, c, d] = opts.matrix;
              const rx = px - aw / 2;
              const ry = py - ah / 2;
              tx = ((a * rx + b * ry) >> 8) + w / 2;
              ty = ((c * rx + d * ry) >> 8) + h / 2;
              if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
            } else {
              tx = opts.hFlip ? w - 1 - px : px;
              ty = py;
            }
            const v = tiles[(start + (ty >> 3) * (w >> 3) + (tx >> 3)) * 64 + (ty & 7) * 8 + (tx & 7)]!;
            if (!v) continue;
            const i = sy * W + sx;
            const color = pal[256 + slot * 16 + v]!;
            if (opts.blend && layer[i] !== 1) {
              const below = fb[i]!;
              const mix = (shift: number) => Math.min(31, (((color >> shift) & 31) * eva + ((below >> shift) & 31) * evb) >> 4) << shift;
              fb[i] = mix(0) | mix(5) | mix(10);
            } else fb[i] = color;
            layer[i] = 1;
          }
        }
      },
    });
  };
  const ox = g.offsetX;
  const oy = g.offsetY;
  const wheelMatrix = (angle: number): [number, number, number, number] => {
    const sin = Math.trunc(sin2(angle) / 16);
    const cos = Math.trunc(cos2(angle) / 16);
    return [cos, sin, -sin, cos];
  };

  // The balls on the wheel (sprites 0-5).
  g.balls.forEach((ball, i) => {
    if (!ball.invisible) add(2, ball.subpriority, i, 'ball', ball.tile, 16, 16, 1, ball.x + ball.x2 + ox, ball.y + ball.y2 + oy);
  });
  // The wheel's centre (6), turned with it.
  add(2, 81, 6, 'center', 0, 64, 64, 1, 116 + ox, 80 + oy, { matrix: wheelMatrix(g.wheelAngle), double: true });
  // The credit and its digits (7-11): leading zeros left out, the last digit always shown (SetCreditDigits).
  add(1, 4, 7, 'credit', 0, 64, 32, 4, 208, 16);
  const digits = String(g.credit % 10000).padStart(4, '0');
  let shown = false;
  for (let i = 0; i < 4; i++) {
    const digit = Number(digits[i]);
    if (!(digit > 0 || shown || i === 3)) continue;
    shown = true;
    add(1, 0, 8 + i, 'numbers', digit * 2, 8, 16, 4, 196 + i * 8, 24);
  }
  // The multiplier (12), the ball counter (13-15) and the winning square's cursor (16).
  add(1, 4, 12, 'multiplier', g.multiplierAnim * 8, 32, 16, 4, 120 + g.multiplierX2, 68);
  if (g.ballCounterShown) g.ballCounter.forEach((frame, i) => add(1, 4, 13 + i, 'ballCounter', frame * 2, 16, 8, 2, 192 + i * 16, 36));
  if (!g.winCursor.hidden) add(1, 9, 16, 'cursor', 0, 32, 32, 4, g.winCursor.x, g.winCursor.y);
  // The grid's icons, headers and balls (17-41), sliding with the grid.
  for (let k = 0; k < 12; k++) {
    if (!g.gridIconHidden[k]) add(1, 30, 17 + k, 'gridIcons', (k % 4) * 4, 16, 16, 7, 148 + (k % 4) * 24 + g.gridX, 92 + (k % 3) * 24);
  }
  for (let i = 0; i < 4; i++) {
    if (!g.gridIconHidden[12 + i]) add(1, 30, 29 + i, 'headers', i * 32 + (g.litHeader === i ? 16 : 0), 32, 32, 7, 148 + i * 24 + g.gridX, 70);
  }
  for (let i = 0; i < 3; i++) {
    if (!g.gridIconHidden[16 + i]) add(1, 30, 33 + i, 'headers', 128 + i * 16, 32, 32, 7, 126 + g.gridX, 92 + i * 24);
  }
  g.gridBalls.forEach((ball, i) => {
    if (!ball.hidden) add(1, 10, 36 + i, 'ball', 12, 16, 16, 1, ball.x + g.gridX, ball.y);
  });
  // The wheel's icons (42-53): 40 from its centre, from 15° every 30°, turned with it (SpriteCB_WheelIcon).
  for (let k = 0; k < 12; k++) {
    if (g.wheelIconHidden[k]) continue;
    let angle = g.wheelAngle + 15 + 30 * k;
    if (angle >= 360) angle -= 360;
    const x2 = (sin2(angle) * 40) >> 12;
    const y2 = (-cos2(angle) * 40) >> 12;
    add(2, 60, 42 + k, 'wheelIcons', WHEEL_ICON_TILES[k]!, 16, 32, ROULETTE_POKEMON_PALETTE_SLOTS[k % 4]!, 116 + x2 + ox, 80 + y2 + oy, { matrix: wheelMatrix(angle), double: true });
  }
  // Shroomish or Taillow and their shadows (54-56).
  g.mons.forEach((sp: RouletteSprite, i) => {
    if (!sp.inUse || sp.invisible) return;
    const cx = sp.x + sp.x2 + (sp.coordOffset ? ox : 0);
    const cy = sp.y + sp.y2 + (sp.coordOffset ? oy : 0);
    const order = 54 + i;
    if (sp.kind === 'shroomish') add(2, sp.subpriority, order, 'tilt', sp.tile, 32, 32, 5, cx, cy);
    else if (sp.kind === 'taillow') add(2, sp.subpriority, order, 'tilt', sp.tile, 32, 32, 6, cx, cy, { hFlip: sp.hFlip });
    else if (sp.kind === 'ballShadow') add(2, sp.subpriority, order, 'shadow', sp.tile, 16, 16, 0, cx, cy);
    else if (sp.kind === 'monShadow') add(2, sp.subpriority, order, 'shadow', sp.tile, 32, 16, 0, cx, cy, { blend: sp.blend });
    else if (sp.kind === 'taillowShadow') {
      const matrix: [number, number, number, number] = [Math.trunc(0x10000 / Math.max(1, sp.xScale)), 0, 0, Math.trunc(0x10000 / Math.max(1, sp.yScale))];
      add(2, sp.subpriority, order, 'shadow', sp.tile, 32, 16, 0, cx, cy, { matrix });
    }
  });
}
