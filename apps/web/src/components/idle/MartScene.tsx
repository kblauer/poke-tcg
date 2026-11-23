import { generation, areas, isMachine, machineList, machineMove, martPrice, mapView, moveData, tmShopOpen, type TownArea } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { useDragSteps, useOutsideTap } from './martGestures';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { ClientIdleRun } from '../../hooks/useIdle';
import { gbaArt, playerSprites } from '../../utils/idleLook';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';
import { OverworldSprite } from '../run/RouteSprites';
import { MapScene } from './AreaScene';
import { HgssBuyScreen } from './HgssBuyScreen';
import { DIALOGUE_TEXT, GAME_HEIGHT, GAME_WIDTH, useGameScale } from './GameScreen';

/** The buy screen's pictures (tools/idle/shop_menu.py), the region's (FireRed's or Emerald's: gbaArt). */
const SHOP = () => gbaArt('shop');
/** How much wheel scrolling (CSS pixels) moves the list a row: about a mouse wheel's notch. */
const WHEEL_ROW = 100;
/** The text's colours: the list's and the money box's (the menu window palette's 2 on 3), the description's (1 on 2). */
const DARK = { color: '#626262', textShadow: '1px 0 0 #d5d5cd, 0 1px 0 #d5d5cd, 1px 1px 0 #d5d5cd' };
const WHITE = { color: '#ffffff', textShadow: '1px 0 0 #626262, 0 1px 0 #626262, 1px 1px 0 #626262' };
const FONT: CSSProperties = { fontFamily: '"Pokemon Emerald", monospace', lineHeight: 1, whiteSpace: 'pre' };
const NORMAL: CSSProperties = { ...FONT, fontSize: 11 };
const SMALL: CSSProperties = { ...FONT, fontSize: 9 };

/** A window's place and size in tiles, and its frame. */
type WinAt = { x: number; y: number; w: number; h: number; frame: 'std' | 'user' };

/**
 * Where the buy screen's parts are, in game pixels (windows in tiles): FireRed's (buy_menu_helpers.c's window templates,
 * shop.c's BuyMenuDrawMapBg) or Emerald's (issue #226, step 5: its shop.c's sShopBuyMenuWindowTemplates).
 */
interface BuyLayout {
  /** How many of the list's rows show at once (the list template's maxShowed). */
  rows: number;
  /**
   * The map behind: the box it shows in, the faced tile's place in it (its tile column and row from the box's corner),
   * and the people drawn (BuyMenuCollectObjectEventData's 7 by 5 tiles round the faced tile: `px` left of it to `px2`
   * right, 2 above and below).
   */
  map: { left: number; top: number; width: number; height: number; col: number; row: number; px: number; px2: number };
  /** The frame's picture while choosing from the list and while a quantity is chosen. */
  frame: { list: string; quantity: string };
  /** The money box (the user's: never in the top left corner, where the Map button is) and, Emerald's, its MONEY label. */
  money: WinAt & { quantityY: number; label: boolean };
  list: { left: number; top: number; width: number; rowY: number; nameX: number; cursorX: number };
  arrows: { x: number; up: number; down: number };
  description: { x: number; y: number; style: CSSProperties };
  icon: { x: number; y: number };
  inBag: WinAt;
  quantity: WinAt & { textY: number; arrows: { x: number; up: number; down: number } };
  /** The clerk's lines (FireRed's or Emerald's data/text/… strings). */
  lines: {
    howMany: (name: string) => string;
    confirm: (name: string, count: number, total: number) => string;
    machine: (name: string, price: number) => string;
    thanks: string;
  };
}

/** FireRed's buy screen. */
const FIRERED_BUY: BuyLayout = {
  rows: 6,
  // The map round the tile the player faces: 5 by 10 tiles from 2 left of and 3 above it, drawn from 16 pixels down.
  map: { left: 0, top: 16, width: 80, height: GAME_HEIGHT - 16, col: 2, row: 3, px: 3, px2: 3 },
  frame: { list: 'frame', quantity: 'frame_quantity' },
  // Window 0's 8 by 3 tiles (the user's: on the left, just above the description's bar; above IN BAG while it's there).
  money: { x: 1, y: 10, quantityY: 6, w: 8, h: 3, frame: 'std', label: false },
  // Window 4: 11,1, 17 by 12 tiles: the name from 9, the price from 105, rows of 16 from 2.
  list: { left: 88, top: 8, width: 136, rowY: 2, nameX: 9, cursorX: 1 },
  arrows: { x: 160, up: 8, down: 104 },
  // Window 5: 5,14, white on the bar; the icon at 24,140.
  description: { x: 40, y: 115, style: { ...NORMAL, ...WHITE, lineHeight: '15px' } },
  icon: { x: 8, y: 124 },
  // IN BAG: window 1, 1,11; the quantity: window 3, 17,9, its arrows at 152,72 and 152,104.
  inBag: { x: 1, y: 11, w: 13, h: 2, frame: 'std' },
  quantity: { x: 17, y: 9, w: 12, h: 4, frame: 'user', textY: 10, arrows: { x: 152, up: 72, down: 104 } },
  lines: {
    howMany: (name) => `${name}? Certainly.\nHow many would you like?`,
    confirm: (name, count, total) => `${name}, and you want ${count}.\nThat will be ₱${total}. Okay?`,
    machine: (name, price) => `${name}?\nThat will be ₱${price}. Okay?`,
    thanks: 'Here you are!\nThank you!',
  },
};

/** Emerald's buy screen: the list on the right over the shop's map, the item's icon and description bottom left. */
const EMERALD_BUY: BuyLayout = {
  rows: 8,
  // BuyMenuDrawMapBg: the whole screen's 15 by 10 tiles from 4 left of and 4 above the faced tile; the people from 4 left
  // of it to 2 right (BuyMenuCollectObjectEventData).
  map: { left: 0, top: 0, width: GAME_WIDTH, height: GAME_HEIGHT, col: 4, row: 4, px: 4, px2: 2 },
  // Emerald leaves its frame as it is while a quantity is chosen.
  frame: { list: 'frame', quantity: 'frame' },
  // Window 0's 10 by 2 tiles (Emerald's at 1,1; the user's rule moves it out of the top left corner, above the icon's box),
  // its MONEY label over its corner (AddMoneyLabelObject(19, 11)), the player's frame (PrintMoneyAmountInMoneyBoxWithBorder).
  money: { x: 1, y: 5, quantityY: 5, w: 10, h: 2, frame: 'user', label: true },
  // Window 1: 14,2, 15 by 16 tiles: the cursor at 0, the name from 8, the price right-aligned to 120, rows of 16 from 1.
  list: { left: 112, top: 16, width: 120, rowY: 1, nameX: 8, cursorX: 0 },
  // AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 172, 12, 148, …).
  arrows: { x: 172, up: 12, down: 148 },
  // Window 2: 0,13, printed at 3,1 (COLORID_NORMAL: dark on white); the icon's sprite at 24,88 (BuyMenuAddItemIcon).
  description: { x: 3, y: 105, style: { ...NORMAL, ...DARK, lineHeight: '16px' } },
  icon: { x: 8, y: 72 },
  // IN BAG: window 3, 1,11, 12 by 2; the quantity: window 4, 18,11, 10 by 2 (Emerald draws no arrows: ours to click, above
  // and below it).
  inBag: { x: 1, y: 11, w: 12, h: 2, frame: 'user' },
  quantity: { x: 18, y: 11, w: 10, h: 2, frame: 'user', textY: 1, arrows: { x: 184, up: 78, down: 114 } },
  // gText_Var1CertainlyHowMany, gText_Var1AndYouWantedVar2, gText_Var1IsItThatllBeVar2 (the decorations' one of a kind:
  // a TM's here), gText_HereYouGoThankYou.
  lines: {
    howMany: (name) => `${name}? Certainly.\nHow many would you like?`,
    confirm: (name, count, total) => `${name}? And you wanted ${count}?\nThat will be ₱${total}.`,
    machine: (name, price) => `${name}, is it?\nThat'll be ₱${price}. Do you want it?`,
    thanks: 'Here you go!\nThank you very much.',
  },
};

/** The shown region's buy screen. */
const buyLayout = () => (generation().look === 'rse' ? EMERALD_BUY : FIRERED_BUY);

/** An item's name as FireRed's lists print it: in capitals, its "é" small (POKé BALL). */
const caps = (name: string) => name.toUpperCase().replace(/É/g, 'é');

/** An item's name in the lists: a TM or HM with its move (TM28 DIG). */
const itemName = (item: string) => caps(generation().items[item]!.name) + (isMachine(item) ? ` ${caps(moveData(machineMove(item)).name)}` : '');


/**
 * The town's Poké Mart (the user's: the store moves the player into the town's own mart, and its list is the game's own
 * buy screen): the mart's map with the player at the counter across from its clerk (TownArea.mart), the clerk's "May I
 * help you?" with BUY and SEE YA!; BUY opens FireRed's buy screen (BuyScreen), its CANCEL back to the counter ("anything
 * else"), SEE YA! "Please come again!", then out (`onLeave`: LEAVE_STORE). From Celadon City on (tmShopOpen, the
 * user's), BUY TM/HM too: the buy screen with every TM and HM in one list (machineList(), `machines`), CANCEL back to the
 * counter. The town doesn't go on while the player is in
 * here (IdleState.inStore). `dialogue` (the catch-up's pages) comes first; `children` over the scene (the overlays).
 */
export function MartScene({
  run,
  gender,
  busy,
  onBuy,
  onLeave,
  dialogue,
  children,
  buyChildren,
}: {
  run: ClientIdleRun;
  gender: 'male' | 'female';
  busy: boolean;
  /** A purchase: whether it went through. */
  onBuy: (item: string, count: number) => Promise<boolean>;
  onLeave: () => void;
  dialogue?: Dialogue | null;
  children?: ReactNode;
  /** The overlays over the buy screen. */
  buyChildren?: ReactNode;
}) {
  const town = areas()[run.view.area] as TownArea;
  const mart = town.mart!;
  const map = mapView(mart.map);
  const player = playerSprites(gender).walk;
  const [stage, setStage] = useState<'hello' | 'again' | 'buy' | 'tms' | 'bye'>('hello');
  const tms = tmShopOpen(run.view);
  // Johto's: HeartGold's buy screen on the DS's two screens (HgssBuyScreen), its clerk's words HGSS's (msg_0040, msg_0435).
  const hgss = generation().look === 'hgss';
  // Hoenn's: Emerald's (data/text/mart_clerk.inc, shop.c's QUIT and gText_AnythingElseICanHelp).
  const rse = generation().look === 'rse';
  const Buy = hgss ? HgssBuyScreen : BuyScreen;
  if ((stage === 'buy' || stage === 'tms') && !dialogue)
    return (
      <Buy key={stage} run={run} player={player} busy={busy} onBuy={onBuy} onClose={() => setStage('again')} machines={stage === 'tms' ? [...machineList()] : undefined}>
        {buyChildren}
      </Buy>
    );
  const choices = ['BUY', ...(tms ? ['BUY TM/HM'] : []), rse ? 'QUIT' : 'SEE YA!'];
  const hello = hgss ? 'Welcome!\nWhat do you need?' : rse ? 'Welcome!\nHow may I serve you?' : 'Hi, there!\nMay I help you?';
  const again = hgss ? 'Is there anything else I may do\nfor you?' : rse ? 'Is there anything else I can help\nyou with?' : 'Is there anything else I can do?';
  const clerk: Dialogue =
    stage === 'bye'
      ? { text: 'Please come again!', answer: () => !busy && onLeave() }
      : { text: stage === 'hello' ? hello : again, choices, answer: (i) => setStage(choices[i] === 'BUY' ? 'buy' : choices[i] === 'BUY TM/HM' ? 'tms' : 'bye') };
  return (
    <MapScene image={map.image} top={map.top} heights={map.heights} width={map.width} height={map.height} tile={{ x: mart.x, y: mart.y }} player={player} face={mart.face} moveMs={0} people={mart.people.map((p, i) => ({ key: String(i), ...p }))} dialogue={dialogue ?? clerk}>
      {children}
    </MapScene>
  );
}

/** A window with one of the game's frames (its 3 by 3 tiles drawn round it), at a tile position and size in tiles. */
function Win({ x, y, w, h, frame, children }: WinAt & { children?: ReactNode }) {
  return (
    <div
      className="absolute"
      style={{ left: x * 8 - 8, top: y * 8 - 8, width: w * 8, height: h * 8, boxSizing: 'content-box', borderStyle: 'solid', borderWidth: 8, borderImage: `url(${SHOP()}/window_${frame}.png) 8 fill` }}
    >
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

/** Text at a pixel position (its letters' top left). */
function Text({ x, y, style, children }: { x: number; y: number; style: CSSProperties; children: ReactNode }) {
  return (
    <span className="absolute" style={{ left: x, top: y, ...style }}>
      {children}
    </span>
  );
}

/** A Pokédollar amount in the small font (or `font`), its sign the game's (pokedollar.png), right-aligned to `right`. */
function Money({ right, y, amount, font = SMALL }: { right: number; y: number; amount: number; font?: CSSProperties }) {
  return (
    <span className="absolute flex items-start" style={{ right, top: y, ...font, ...DARK }}>
      <img src={`${SHOP()}/pokedollar.png`} alt="₱" style={{ width: 8, height: 16, marginTop: -1, marginRight: -2 }} draggable={false} />
      {amount}
    </span>
  );
}

/** FireRed's list cursor (gText_SelectorArrow2), greyed while an item is being bought. */
function Cursor({ x, y, grey }: { x: number; y: number; grey: boolean }) {
  return (
    <svg className="absolute" style={{ left: x, top: y }} width={7} height={10} viewBox="0 0 7 10" aria-hidden>
      <path d="M1 1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill={grey ? '#d5d5cd' : '#626262'} transform="translate(1 1)" opacity={0.9} />
      <path d="M1 1h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill={grey ? '#a0a0a0' : '#626262'} />
    </svg>
  );
}

/**
 * A scroll arrow (the list's, the quantity's), centred on a point, bobbing as the game's do; a button doing what its
 * key does (the user's: a click on it never reaches the screen, whose click is the text box's), its hit area a little
 * bigger than the arrow.
 */
function Arrow({ x, y, up, label, onClick }: { x: number; y: number; up: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} className="absolute flex items-center justify-center" style={{ left: x - 8, top: y - 6, width: 16, height: 12 }} onClick={(e) => (e.stopPropagation(), onClick())}>
      <svg className="animate-pulse" width={8} height={6} viewBox="0 0 8 6" aria-hidden>
        <path d={up ? 'M4 0L8 6H0z' : 'M0 0H8L4 6z'} fill="#626262" />
      </svg>
    </button>
  );
}

/**
 * FireRed's buy screen (src/shop.c, buy_menu_helpers.c), in game pixels: the map round the counter on the left (5 by
 * 10 tiles from two tiles left of and three above the tile the player faces, everyone within 3 tiles of it), the frame
 * over it (frame.png), the money box, the list (6 rows, prices in the small font, CANCEL last), the item's description
 * and icon. Hoenn's Emerald's (EMERALD_BUY: the map behind the whole screen, the list's 8 rows on the right, the icon and
 * description bottom left, its clerk's lines), the same steps. Choosing an item: "X? Certainly. How many would you like?", IN BAG and the quantity box (up and down 1,
 * left and right 10, up to 99 or what the money buys), then "X, and you want N. That will be ₱T. Okay?" YES or NO,
 * then "Here you are! Thank you!". Pointer (hover to point, click to choose) or keys (arrows, Enter, Escape). With
 * `machines` (Buy TMs), those TMs or HMs, each with its move; one of each (no quantity: "X? That will be ₱T. Okay?"),
 * one already owned OWNED in place of its price, not to be bought again.
 */
function BuyScreen({ run, player, busy, onBuy, onClose, machines, children }: { run: ClientIdleRun; player: string; busy: boolean; onBuy: (item: string, count: number) => Promise<boolean>; onClose: () => void; machines?: string[]; children?: ReactNode }) {
  // An item's price: a TM's or HM's machinePrice (HMs' a placeholder), after the Mart discount upgrade (martPrice).
  const priceOf = (item: string) => martPrice(run.view, item);
  const phone = useIsPhone();
  const { ref, scale } = useGameScale();
  const pressDialogue = useRef<(() => void) | null>(null);
  const town = areas()[run.view.area] as TownArea;
  const mart = town.mart!;
  const map = mapView(mart.map);
  const stock = machines ?? run.view.store;
  const owned = (it: string) => isMachine(it) && (run.view.bag[it] ?? 0) > 0;
  const money = run.view.money;
  const [cursor, setCursor] = useState(0);
  const [top, setTop] = useState(0);
  const [count, setCount] = useState(1);
  /** Where the purchase is: the list, the quantity, the YES/NO, or a line to read before the list again. */
  const [step, setStep] = useState<{ kind: 'list' } | { kind: 'quantity' | 'confirm'; item: string } | { kind: 'said'; text: string }>({ kind: 'list' });
  const L = buyLayout();
  const ROWS = L.rows;
  const rows = [...stock, null];
  const item = cursor < stock.length ? stock[cursor]! : null;
  const chosen = step.kind === 'quantity' || step.kind === 'confirm' ? step.item : null;
  const price = chosen ? priceOf(chosen) : 0;
  const most = chosen ? Math.max(1, Math.min(99, Math.floor(money / price))) : 1;
  const point = (i: number) => {
    const n = Math.max(0, Math.min(rows.length - 1, i));
    setCursor(n);
    setTop((t) => (n < t ? n : n >= t + ROWS ? n - ROWS + 1 : t));
  };
  const choose = (i: number) => {
    const it = rows[i];
    if (it === undefined) return;
    if (it === null) return onClose();
    if (owned(it)) return setStep({ kind: 'said', text: 'You already have that one.' });
    if (priceOf(it) > money) return setStep({ kind: 'said', text: "You don't have enough money." });
    setCount(1);
    // A machine is one of a kind: straight to YES or NO.
    setStep({ kind: isMachine(it) ? 'confirm' : 'quantity', item: it });
  };
  // AdjustQuantityAccordingToDPadInput: up and down by 1 round the ends, right and left by 10 up to them.
  const adjust = (d: number) => setCount((c) => (Math.abs(d) === 1 ? ((c - 1 + d + most) % most) + 1 : Math.max(1, Math.min(most, c + d))));
  const buy = async () => {
    if (step.kind !== 'confirm' || busy) return;
    const ok = await onBuy(step.item, count);
    setStep(ok ? { kind: 'said', text: L.lines.thanks } : { kind: 'list' });
  };
  // The keys: the arrows move the cursor (or the quantity); Enter chooses (on a line, the text box takes it).
  const onKey = (e: KeyboardEvent) => {
    if (step.kind === 'list') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') point(cursor + (e.key === 'ArrowUp' ? -1 : 1));
      else if (e.key === 'Enter' || e.key === ' ') choose(cursor);
      else return;
    } else if (step.kind === 'quantity') {
      const d = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 10, ArrowLeft: -10 }[e.key];
      if (!d) return;
      adjust(d);
    } else return;
    e.preventDefault();
  };
  // One listener for the screen's life, calling the latest render's handler (it reads the step, the cursor and the rows).
  const keyHandler = useRef(onKey);
  keyHandler.current = onKey;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  // The mouse wheel over the list (the user's): a row a notch (WHEEL_ROW of scrolling, a trackpad's adding up), the
  // cursor kept among the rows shown; the page doesn't scroll with it (a listener that isn't passive).
  const list = useRef<HTMLDivElement>(null);
  const wheeled = useRef(0);
  /** The list moved `by` rows (the wheel, its arrows), the cursor kept among the rows shown. */
  const scroll = (by: number) => {
    const t = Math.max(0, Math.min(Math.max(0, rows.length - ROWS), top + by));
    setTop(t);
    setCursor(Math.max(t, Math.min(t + ROWS - 1, cursor)));
  };
  useEffect(() => {
    const el = list.current;
    if (!el || step.kind !== 'list') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * WHEEL_ROW * ROWS : e.deltaY;
      if (Math.sign(dy) !== Math.sign(wheeled.current)) wheeled.current = 0;
      wheeled.current += dy;
      const by = Math.trunc(wheeled.current / WHEEL_ROW);
      if (!by) return;
      wheeled.current -= by * WHEEL_ROW;
      scroll(by);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  // The wheel while choosing how many (the user's): over the screen, a notch up one more, down one fewer (as the keys).
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = screen.current;
    if (!el || step.kind !== 'quantity') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * WHEEL_ROW * ROWS : e.deltaY;
      if (Math.sign(dy) !== Math.sign(wheeled.current)) wheeled.current = 0;
      wheeled.current += dy;
      const by = Math.trunc(wheeled.current / WHEEL_ROW);
      if (!by) return;
      wheeled.current -= by * WHEEL_ROW;
      for (let i = 0; i < Math.abs(by); i++) adjust(by < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  useEscape(() => (step.kind === 'list' ? onClose() : step.kind === 'quantity' ? setStep({ kind: 'list' }) : undefined));
  // On a phone (the user's): a finger dragged up or down the list scrolls it a row a row's height, over the screen while
  // choosing how many changes it as the wheel does; a tap outside closes the list (or goes back to it).
  useDragSteps(list, step.kind === 'list', 16 * scale, scroll);
  useDragSteps(screen, step.kind === 'quantity', 16 * scale, (by) => adjust(by));
  useOutsideTap(ref, () => (step.kind === 'list' ? onClose() : step.kind === 'quantity' || step.kind === 'confirm' ? setStep({ kind: 'list' }) : undefined));
  const name = itemName;
  const dialogue: Dialogue | null =
    step.kind === 'quantity'
      ? { text: L.lines.howMany(name(step.item)), answer: () => setStep({ kind: 'confirm', item: step.item }) }
      : step.kind === 'confirm'
        ? { text: isMachine(step.item) ? L.lines.machine(name(step.item), price) : L.lines.confirm(name(step.item), count, price * count), choices: [{ label: 'YES', disabled: busy }, 'NO'], answer: (i) => (i === 0 ? void buy() : setStep({ kind: 'list' })) }
        : step.kind === 'said'
          ? { text: step.text, answer: () => setStep({ kind: 'list' }) }
          : null;
  // The map round the tile the player faces (L.map), and everyone near it.
  const [dx, dy] = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const)[mart.face];
  const fx = mart.x + dx;
  const fy = mart.y + dy;
  const ox = L.map.left - (fx - L.map.col) * 16;
  const oy = L.map.top - (fy - L.map.row) * 16;
  const people = [...mart.people, { sprite: player, x: mart.x, y: mart.y, face: mart.face }].filter((p) => p.x - fx >= -L.map.px && p.x - fx <= L.map.px2 && Math.abs(p.y - fy) <= 2);
  const shown = rows.slice(top, top + ROWS);
  const listing = step.kind === 'list';
  return (
    <div ref={ref} className="w-full">
      <div
        ref={screen}
        className="relative mx-auto overflow-hidden rounded-lg bg-black ring-1 ring-slate-700 [animation:idle-fade-in_300ms]"
        style={{ width: GAME_WIDTH * scale || '100%', height: GAME_HEIGHT * scale || undefined, aspectRatio: scale ? undefined : '3 / 2' }}
        onClick={() => pressDialogue.current?.()}
      >
        {scale > 0 && (
          <div className="absolute left-0 top-0 origin-top-left select-none [image-rendering:pixelated]" style={{ width: GAME_WIDTH, height: GAME_HEIGHT, transform: `scale(${scale})` }}>
            {/* The map (its 10 tile columns) and everyone near the counter, behind the frame. */}
            <div className="absolute overflow-hidden" style={{ left: L.map.left, top: L.map.top, width: L.map.width, height: L.map.height }}>
              <img src={map.image} alt="" className="absolute max-w-none" style={{ left: ox - L.map.left, top: oy - L.map.top, width: map.width * 16, height: map.height * 16 }} draggable={false} />
            </div>
            {/* (Its own stacking context: the sprites' z-index, lower on the map in front, stays under the frame.) */}
            <div className="absolute isolate" style={{ left: ox, top: oy, width: map.width * 16, height: map.height * 16, zIndex: 0 }}>
              {people.map((p, i) => (
                <OverworldSprite key={i} name={p.sprite} tile={{ x: p.x, y: p.y }} face={p.face} />
              ))}
              {/* The counter's near edge over the clerk and the player (the map's top layer). */}
              {map.top && <img src={map.top} alt="" className="absolute left-0 top-0 max-w-none" style={{ width: map.width * 16, height: map.height * 16, zIndex: 899 }} draggable={false} />}
            </div>
            <img src={`${SHOP()}/${listing ? L.frame.list : L.frame.quantity}.png`} alt="" className="absolute left-0 top-0" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }} draggable={false} />
            {/* The money box (L.money): FireRed's MONEY over the amount, Emerald's amount beside its MONEY label. */}
            <Win {...L.money} y={step.kind === 'quantity' ? L.money.quantityY : L.money.y}>
              {L.money.label ? <Money right={0} y={1} amount={money} font={NORMAL} /> : (
                <>
                  <Text x={0} y={1} style={{ ...NORMAL, ...DARK }}>MONEY</Text>
                  <Money right={0} y={12} amount={money} />
                </>
              )}
            </Win>
            {L.money.label && <img src={`${SHOP()}/money.png`} alt="" className="absolute" style={{ left: L.money.x * 8 - 5, top: (step.kind === 'quantity' ? L.money.quantityY : L.money.y) * 8 - 5, width: 32, height: 16 }} draggable={false} />}
            {/* The list (L.list), rows of 16. */}
            <div ref={list} className="absolute" style={{ left: L.list.left, top: L.list.top, width: L.list.width, height: ROWS * 16 }}>
              {shown.map((it, i) => {
                const row = top + i;
                return (
                  <button
                    key={it ?? 'cancel'}
                    type="button"
                    className="absolute left-0 block w-full text-left"
                    style={{ top: L.list.rowY + i * 16, height: 16 }}
                    disabled={!listing}
                    onPointerEnter={() => listing && point(row)}
                    onClick={(e) => (e.stopPropagation(), listing && (point(row), choose(row)))}
                    aria-label={it ? `${name(it)}, ${owned(it) ? 'owned' : `₱${priceOf(it)}`}` : 'Cancel'}
                  >
                    {row === cursor && <Cursor x={L.list.cursorX} y={2} grey={!listing} />}
                    <Text x={L.list.nameX} y={2} style={{ ...NORMAL, ...DARK }}>
                      {it ? name(it) : 'CANCEL'}
                    </Text>
                    {it && (owned(it) ? <Text x={L.list.width - 34} y={4} style={{ ...SMALL, ...DARK }}>OWNED</Text> : <Money right={0} y={3} amount={priceOf(it)} />)}
                  </button>
                );
              })}
            </div>
            {listing && top > 0 && <Arrow x={L.arrows.x} y={L.arrows.up} up label="Scroll up" onClick={() => scroll(-1)} />}
            {listing && top + ROWS < rows.length && <Arrow x={L.arrows.x} y={L.arrows.down} up={false} label="Scroll down" onClick={() => scroll(1)} />}
            {/* The item's description and icon (L.description, L.icon), the description hidden while it's being bought. */}
            {listing && (
              <Text x={L.description.x} y={L.description.y} style={L.description.style}>
                {item ? generation().items[item]!.description : 'Quit shopping.'}
              </Text>
            )}
            <img src={`${SHOP()}/items/${item ?? 'cancel'}.png`} alt="" className="absolute" style={{ left: L.icon.x, top: L.icon.y, width: 24, height: 24 }} draggable={false} />
            {/* How many (IN BAG: L.inBag; the quantity: L.quantity, with its arrows). */}
            {step.kind === 'quantity' && (
              <>
                <Win {...L.inBag}>
                  <Text x={0} y={2} style={{ ...NORMAL, ...DARK }}>
                    IN BAG: <span style={SMALL}>{String(run.view.bag[step.item] ?? 0).padStart(3)}</span>
                  </Text>
                </Win>
                <Win {...L.quantity}>
                  <button type="button" className="absolute inset-0" aria-label="One more" onClick={(e) => (e.stopPropagation(), adjust(1))} style={{ height: '50%' }} />
                  <button type="button" className="absolute inset-x-0 bottom-0" aria-label="One fewer" onClick={(e) => (e.stopPropagation(), adjust(-1))} style={{ height: '50%' }} />
                  <Text x={2} y={L.quantity.textY} style={{ ...SMALL, ...DARK }}>×{String(count).padStart(2, '0')}</Text>
                  <Money right={2} y={L.quantity.textY} amount={price * count} />
                </Win>
                {most > 1 && <Arrow x={L.quantity.arrows.x} y={L.quantity.arrows.up} up label="One more" onClick={() => adjust(1)} />}
                {most > 1 && <Arrow x={L.quantity.arrows.x} y={L.quantity.arrows.down} up={false} label="One fewer" onClick={() => adjust(-1)} />}
              </>
            )}
          </div>
        )}
        {children}
        {dialogue && <DialogueBox key={dialogueKey(dialogue)} dialogue={dialogue} pressRef={pressDialogue} phone={phone} maxWidth={GAME_WIDTH * scale} fontSize={DIALOGUE_TEXT * scale || undefined} />}
      </div>
    </div>
  );
}
