import { useEffect, useRef, useState, type PointerEvent } from 'react';

/**
 * Where Who's That Pokémon?'s name is typed: Pokémon Emerald's naming screen (src/naming_screen.c; its pictures by
 * tools/whos-that/naming_screen.py in public/whos-that/naming/), drawn at the GBA's 240×160, SCALE times over, with the
 * game's text over it (the name box titled "WHO'S THAT POKéMON?", 12 spaces for letters: the longest name is 11, the
 * user's). The keyboard is captured while it's shown: letters, digits and the game's symbols fill the spaces, Backspace
 * deletes, Enter sends the name (`onSubmit`, true when it was right, which clears it; a wrong one shakes the screen).
 * Its keys, page button, BACK and OK can be clicked (or tapped) too, as the game's are pressed. `round` changes for each
 * Pokémon, clearing the name.
 */

const W = 240;
const H = 160;
const SCALE = 4;
const FONT = '12px "Pokemon Emerald"';
const FRAME_MS = 1000 / 60;
const BASE = '/whos-that/naming/';
const MAX_CHARS = 12;
const TITLE = "WHO'S THAT POKéMON?";
// inputCharBaseXPos: the spaces centred, (240 − 12 × 8) / 2 + 6.
const NAME_X = (W - MAX_CHARS * 8) / 2 + 6;

type Page = 'upper' | 'lower' | 'symbols';
// The pages in the order the page button cycles them; the button shows the next one (PageToNextGfxId).
const NEXT: Record<Page, Page> = { upper: 'lower', lower: 'symbols', symbols: 'upper' };
const LABEL: Record<Page, string> = { upper: 'upper', lower: 'lower', symbols: 'others' };
// sKeyboardChars and sPageColumnXPos: each page's keys (a space is no key) and where each column's cursor stands.
const KEYS: Record<Page, string[]> = {
  upper: ['ABCDEF .', 'GHIJKL ,', 'MNOPQRS ', 'TUVWXYZ '],
  lower: ['abcdef .', 'ghijkl ,', 'mnopqrs ', 'tuvwxyz '],
  symbols: ['01234 ', '56789 ', '!?♂♀/-', '…“”‘\' '],
};
const COLUMN_X: Record<Page, number[]> = { upper: [0, 12, 24, 56, 68, 80, 92, 123], lower: [0, 12, 24, 56, 68, 80, 92, 123], symbols: [0, 22, 44, 66, 88, 110] };
// The keys' cursor: x the column's + 38, y the row × 16 + 88 (SetCursorPos; sprite centres).
const keyCentre = (page: Page, col: number, row: number) => ({ x: COLUMN_X[page][col]! + 38, y: row * 16 + 88 });
// The buttons on the right (sprite centres and sizes): page swap, BACK, OK.
const BUTTONS = { page: { x: 204, y: 88, w: 40, h: 32 }, back: { x: 204, y: 116, w: 40, h: 24 }, ok: { x: 204, y: 140, w: 40, h: 24 } } as const;
const inside = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
// The animations: the space being typed in bobs (SpriteCB_Underscore), the arrow before the name sways (SpriteCB_InputArrow).
const UNDERSCORE_Y = [2, 3, 2, 1];
const ARROW_X = [0, -4, -2, -1];

/** Typed characters the screen takes, as the game's (curly quotes for straight ones). */
const CHARS = new Set([...Object.values(KEYS).join('')].filter((c) => c !== ' ').concat(' '));
const typed = (key: string) => (key === "'" || key === '’' ? "'" : key === '"' ? '”' : key);

/** Where a typed character is on the keyboard, to move the cursor there. */
function keyOf(char: string): { page: Page; col: number; row: number } | null {
  for (const page of Object.keys(KEYS) as Page[])
    for (const [row, keys] of KEYS[page].entries()) {
      const col = keys.indexOf(char);
      if (col >= 0 && char !== ' ') return { page, col, row };
    }
  return null;
}

interface Assets {
  images: Record<string, HTMLImageElement>;
  colors: { keyboard: { text: string; shadow: string }; name: { text: string; shadow: string }; banner: { fill: string; text: string; shadow: string } };
}
const IMAGES = ['background', 'keyboard-upper', 'keyboard-lower', 'keyboard-symbols', 'back', 'ok', 'page-frame', 'page-button-upper', 'page-button-lower', 'page-button-others', 'page-upper', 'page-lower', 'page-others', 'cursor', 'underscore', 'arrow', 'keypad-a', 'keypad-b', 'keypad-dpad'];
let assets: Promise<Assets> | null = null;
/** The screen's pictures and colours, loaded once. */
function loadAssets() {
  assets ??= Promise.all([
    ...IMAGES.map(
      (name) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([name, img]);
          img.onerror = reject;
          img.src = `${BASE}${name}.png`;
        }),
    ),
    fetch(`${BASE}colors.json`).then((r) => r.json() as Promise<Assets['colors']>),
    document.fonts?.load(FONT).catch(() => undefined),
  ]).then((loaded) => ({ images: Object.fromEntries(loaded.slice(0, IMAGES.length) as [string, HTMLImageElement][]), colors: loaded[IMAGES.length] as Assets['colors'] }));
  return assets;
}

/** Text with the game's shadow (a pixel right and down). */
function shadowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: { text: string; shadow: string }, align: CanvasTextAlign = 'left') {
  ctx.textAlign = align;
  ctx.fillStyle = colour.shadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = colour.text;
  ctx.fillText(text, x, y);
}

export function NamingScreen({ round, onSubmit, disabled }: { round: string | number; onSubmit: (name: string) => Promise<boolean>; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<Assets | null>(null);
  const [name, setName] = useState('');
  const [page, setPage] = useState<Page>('upper');
  const [cursor, setCursor] = useState({ col: 0, row: 0 });
  const [wrong, setWrong] = useState(false);
  const [frame, setFrame] = useState(0);
  const sending = useRef(false);
  // The latest of everything, for the key listener (added once).
  const state = useRef({ name, disabled, onSubmit });
  state.current = { name, disabled, onSubmit };

  useEffect(() => {
    let current = true;
    void loadAssets().then((a) => current && setLoaded(a));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    setName('');
    setPage('upper');
    setCursor({ col: 0, row: 0 });
  }, [round]);

  useEffect(() => {
    const timer = window.setInterval(() => setFrame((f) => f + 1), FRAME_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!wrong) return;
    const timer = window.setTimeout(() => setWrong(false), 400);
    return () => window.clearTimeout(timer);
  }, [wrong]);

  const add = (char: string) => setName((n) => (n.length < MAX_CHARS ? n + char : n));
  const back = () => setName((n) => n.slice(0, -1));
  const submit = async () => {
    const { name: current, disabled: off, onSubmit: send } = state.current;
    if (off || sending.current || !current.trim()) return;
    sending.current = true;
    const right = await send(current).catch(() => false);
    sending.current = false;
    if (!right) setWrong(true);
  };

  // The keyboard, while the screen is shown (not while another text box has the focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || state.current.disabled) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        back();
      } else if (e.key.length === 1 && CHARS.has(typed(e.key))) {
        e.preventDefault();
        const char = typed(e.key);
        add(char);
        const key = keyOf(char);
        if (key) {
          setPage(key.page);
          setCursor({ col: key.col, row: key.row });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // submit reads the latest state through `state`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A click or tap on the screen: a key types it, the buttons do what the game's do. */
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (inside(BUTTONS.page, x, y)) return setPage(NEXT[page]);
    if (inside(BUTTONS.back, x, y)) return back();
    if (inside(BUTTONS.ok, x, y)) return void submit();
    const row = Math.floor((y - 80) / 16);
    if (row < 0 || row > 3) return;
    const keys = KEYS[page][row]!;
    // The nearest column's key.
    const col = COLUMN_X[page].reduce((best, cx, i) => (Math.abs(x - (cx + 38)) < Math.abs(x - (COLUMN_X[page][best]! + 38)) ? i : best), 0);
    if (Math.abs(x - keyCentre(page, col, row).x) > 12) return;
    setCursor({ col, row });
    if (keys[col] && keys[col] !== ' ') add(keys[col]!);
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !loaded) return;
    const { images: img, colors } = loaded;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    const sprite = (name: string, cx: number, cy: number) => {
      const im = img[name]!;
      ctx.drawImage(im, Math.round(cx - im.width / 2), Math.round(cy - im.height / 2));
    };

    ctx.drawImage(img.background!, 0, 0);
    ctx.drawImage(img[`keyboard-${page}`]!, 0, 0);
    // The banner (PrintControls): {DPAD}MOVE  {A}OK  {B}BACK, on the text window's fill.
    ctx.fillStyle = colors.banner.fill;
    ctx.fillRect(0, 0, W, 16);
    let bx = 2;
    for (const [icon, word] of [['dpad', 'MOVE'], ['a', 'OK'], ['b', 'BACK']] as const) {
      ctx.drawImage(img[`keypad-${icon}`]!, bx, 2);
      bx += 9;
      shadowText(ctx, word, bx, 1, colors.banner);
      bx += Math.ceil(ctx.measureText(word).width) + 8;
    }
    // The name box: its title, the name, the spaces (the one being typed in bobs) and the arrow.
    shadowText(ctx, TITLE, 72, 33, colors.name);
    [...name].forEach((char, i) => shadowText(ctx, char, NAME_X + i * 8, 49, colors.name));
    const position = Math.min(name.length, MAX_CHARS - 1);
    for (let i = 0; i < MAX_CHARS; i++) sprite('underscore', NAME_X + i * 8 + 3, 60 + (i === position ? UNDERSCORE_Y[Math.floor(frame / 9) % 4]! : 0));
    sprite('arrow', NAME_X - 5 + ARROW_X[Math.floor(frame / 8) % 4]!, 56);
    // The keys (PrintKeyboardKeys): white on a dark grey shadow, each under its column's cursor.
    KEYS[page].forEach((keys, row) =>
      [...keys].forEach((char, col) => {
        if (char !== ' ') shadowText(ctx, char, keyCentre(page, col, row).x, row * 16 + 81, colors.keyboard, 'center');
      }),
    );
    // The page swap button (showing the next page), BACK and OK, and the cursor.
    sprite('page-frame', BUTTONS.page.x, BUTTONS.page.y);
    sprite(`page-button-${LABEL[NEXT[page]]}`, 204, 83);
    ctx.drawImage(img[`page-${LABEL[NEXT[page]]}`]!, 0, 0, 32, 8, 192, 80, 32, 8);
    sprite('back', BUTTONS.back.x, BUTTONS.back.y);
    sprite('ok', BUTTONS.ok.x, BUTTONS.ok.y);
    const at = keyCentre(page, Math.min(cursor.col, COLUMN_X[page].length - 1), cursor.row);
    sprite('cursor', at.x, at.y);
  }, [loaded, name, page, cursor, frame]);

  return (
    <canvas
      ref={canvas}
      width={W * SCALE}
      height={H * SCALE}
      onPointerDown={onPointerDown}
      aria-label={`The Pokémon's name: ${name || 'empty'}. Type it and press Enter.`}
      className={`mx-auto block aspect-[3/2] w-full max-w-[480px] touch-none rounded-lg ring-1 ring-slate-600 select-none [image-rendering:pixelated] ${disabled ? 'opacity-60' : ''} ${wrong ? 'animate-[shake_0.3s]' : ''}`}
    />
  );
}
