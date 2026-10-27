import { AREAS, isMachine, ITEMS, machineMove, machinePrice, mapView, moveData, TM_GROUPS, tmGroupStock, tmShopOpen, type TownArea } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { ClientIdleRun } from '../../hooks/useIdle';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';
import { OverworldSprite } from '../run/RouteSprites';
import { MapScene } from './AreaScene';
import { DIALOGUE_TEXT, GAME_HEIGHT, GAME_WIDTH, useGameScale } from './GameScreen';

/** The buy screen's pictures (tools/idle/shop_menu.py). */
const SHOP = '/idle/gen1/shop';
/** How many of the list's rows show at once (BuyMenuBuildListMenuTemplate's maxShowed). */
const ROWS = 6;
/** How much wheel scrolling (CSS pixels) moves the list a row: about a mouse wheel's notch. */
const WHEEL_ROW = 100;
/** The text's colours: the list's and the money box's (the menu window palette's 2 on 3), the description's (1 on 2). */
const DARK = { color: '#626262', textShadow: '1px 0 0 #d5d5cd, 0 1px 0 #d5d5cd, 1px 1px 0 #d5d5cd' };
const WHITE = { color: '#ffffff', textShadow: '1px 0 0 #626262, 0 1px 0 #626262, 1px 1px 0 #626262' };
const FONT: CSSProperties = { fontFamily: '"Pokemon Emerald", monospace', lineHeight: 1, whiteSpace: 'pre' };
const NORMAL: CSSProperties = { ...FONT, fontSize: 11 };
const SMALL: CSSProperties = { ...FONT, fontSize: 9 };

/** An item's name as FireRed's lists print it: in capitals, its "é" small (POKé BALL). */
const caps = (name: string) => name.toUpperCase().replace(/É/g, 'é');

/** An item's name in the lists: a TM or HM with its move (TM28 DIG). */
const itemName = (item: string) => caps(ITEMS[item]!.name) + (isMachine(item) ? ` ${caps(moveData(machineMove(item)).name)}` : '');

/** An item's price: a TM's or HM's machinePrice (HMs' a placeholder). */
const priceOf = (item: string) => (isMachine(item) ? machinePrice(item) : ITEMS[item]!.price);

/**
 * The town's Poké Mart (the user's: the store moves the player into the town's own mart, and its list is the game's own
 * buy screen): the mart's map with the player at the counter across from its clerk (TownArea.mart), the clerk's "May I
 * help you?" with BUY and SEE YA!; BUY opens FireRed's buy screen (BuyScreen), its CANCEL back to the counter ("anything
 * else"), SEE YA! "Please come again!", then out (`onLeave`: LEAVE_STORE). From Celadon City on (tmShopOpen, the
 * user's), BUY TMs too: the clerk asks which (TM_GROUPS: 4 groups of TMs by their move's first letter, and the HMs), each
 * the buy screen with that group's machines (`machines`), CANCEL back to the question. The town doesn't go on while the player is in
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
  const town = AREAS[run.view.area] as TownArea;
  const mart = town.mart;
  const map = mapView(mart.map);
  const player = gender === 'female' ? 'leaf' : 'red';
  const [stage, setStage] = useState<'hello' | 'again' | 'buy' | 'tms' | 'bye' | { group: string }>('hello');
  const tms = tmShopOpen(run.view);
  if (stage === 'buy' && !dialogue) return <BuyScreen run={run} player={player} busy={busy} onBuy={onBuy} onClose={() => setStage('again')}>{buyChildren}</BuyScreen>;
  if (typeof stage === 'object' && !dialogue)
    return (
      <BuyScreen key={stage.group} run={run} player={player} busy={busy} onBuy={onBuy} onClose={() => setStage('tms')} machines={tmGroupStock(stage.group)}>
        {buyChildren}
      </BuyScreen>
    );
  const choices = ['BUY', ...(tms ? ['BUY TMs'] : []), 'SEE YA!'];
  const clerk: Dialogue =
    stage === 'bye'
      ? { text: 'Please come again!', answer: () => !busy && onLeave() }
      : stage === 'tms'
        ? { text: 'Which TMs would you like to see?', choices: [...TM_GROUPS.map((g) => g.label), 'CANCEL'], answer: (i) => setStage(i < TM_GROUPS.length ? { group: TM_GROUPS[i]!.id } : 'again') }
        : { text: stage === 'hello' ? 'Hi, there!\nMay I help you?' : 'Is there anything else I can do?', choices, answer: (i) => setStage(choices[i] === 'BUY' ? 'buy' : choices[i] === 'BUY TMs' ? 'tms' : 'bye') };
  return (
    <MapScene image={map.image} width={map.width} height={map.height} tile={{ x: mart.x, y: mart.y }} player={player} face={mart.face} moveMs={0} people={mart.people.map((p, i) => ({ key: String(i), ...p }))} dialogue={dialogue ?? clerk}>
      {children}
    </MapScene>
  );
}

/** A window with one of FireRed's frames (its 3 by 3 tiles drawn round it), at a tile position and size in tiles. */
function Win({ x, y, w, h, frame, children }: { x: number; y: number; w: number; h: number; frame: 'std' | 'user'; children?: ReactNode }) {
  return (
    <div
      className="absolute"
      style={{ left: x * 8 - 8, top: y * 8 - 8, width: w * 8, height: h * 8, boxSizing: 'content-box', borderStyle: 'solid', borderWidth: 8, borderImage: `url(${SHOP}/window_${frame}.png) 8 fill` }}
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

/** A Pokédollar amount in the small font, its sign FireRed's (pokedollar.png), right-aligned to `right`. */
function Money({ right, y, amount }: { right: number; y: number; amount: number }) {
  return (
    <span className="absolute flex items-start" style={{ right, top: y, ...SMALL, ...DARK }}>
      <img src={`${SHOP}/pokedollar.png`} alt="₱" style={{ width: 8, height: 16, marginTop: -1, marginRight: -2 }} draggable={false} />
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

/** A scroll arrow (the list's, the quantity's), centred on a point, bobbing as the game's do. */
function Arrow({ x, y, up }: { x: number; y: number; up: boolean }) {
  return (
    <svg className="absolute animate-pulse" style={{ left: x - 4, top: y - 3 }} width={8} height={6} viewBox="0 0 8 6" aria-hidden>
      <path d={up ? 'M4 0L8 6H0z' : 'M0 0H8L4 6z'} fill="#626262" />
    </svg>
  );
}

/**
 * FireRed's buy screen (src/shop.c, buy_menu_helpers.c), in game pixels: the map round the counter on the left (5 by
 * 10 tiles from two tiles left of and three above the tile the player faces, everyone within 3 tiles of it), the frame
 * over it (frame.png), the money box, the list (6 rows, prices in the small font, CANCEL last), the item's description
 * and icon. Choosing an item: "X? Certainly. How many would you like?", IN BAG and the quantity box (up and down 1,
 * left and right 10, up to 99 or what the money buys), then "X, and you want N. That will be ₱T. Okay?" YES or NO,
 * then "Here you are! Thank you!". Pointer (hover to point, click to choose) or keys (arrows, Enter, Escape). With
 * `machines` (Buy TMs), those TMs or HMs, each with its move; one of each (no quantity: "X? That will be ₱T. Okay?"),
 * one already owned OWNED in place of its price, not to be bought again.
 */
function BuyScreen({ run, player, busy, onBuy, onClose, machines, children }: { run: ClientIdleRun; player: string; busy: boolean; onBuy: (item: string, count: number) => Promise<boolean>; onClose: () => void; machines?: string[]; children?: ReactNode }) {
  const phone = useIsPhone();
  const { ref, scale } = useGameScale();
  const pressDialogue = useRef<(() => void) | null>(null);
  const town = AREAS[run.view.area] as TownArea;
  const mart = town.mart;
  const map = mapView(mart.map);
  const stock = machines ?? run.view.store;
  const owned = (it: string) => isMachine(it) && (run.view.bag[it] ?? 0) > 0;
  const money = run.view.money;
  const [cursor, setCursor] = useState(0);
  const [top, setTop] = useState(0);
  const [count, setCount] = useState(1);
  /** Where the purchase is: the list, the quantity, the YES/NO, or a line to read before the list again. */
  const [step, setStep] = useState<{ kind: 'list' } | { kind: 'quantity' | 'confirm'; item: string } | { kind: 'said'; text: string }>({ kind: 'list' });
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
    setStep(ok ? { kind: 'said', text: 'Here you are!\nThank you!' } : { kind: 'list' });
  };
  // The keys: the arrows move the cursor (or the quantity); Enter chooses (on a line, the text box takes it).
  useEffect(() => {
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // The mouse wheel over the list (the user's): a row a notch (WHEEL_ROW of scrolling, a trackpad's adding up), the
  // cursor kept among the rows shown; the page doesn't scroll with it (a listener that isn't passive).
  const list = useRef<HTMLDivElement>(null);
  const wheeled = useRef(0);
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
      const t = Math.max(0, Math.min(Math.max(0, rows.length - ROWS), top + by));
      setTop(t);
      setCursor(Math.max(t, Math.min(t + ROWS - 1, cursor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  useEscape(() => (step.kind === 'list' ? onClose() : step.kind === 'quantity' ? setStep({ kind: 'list' }) : undefined));
  const name = itemName;
  const dialogue: Dialogue | null =
    step.kind === 'quantity'
      ? { text: `${name(step.item)}? Certainly.\nHow many would you like?`, answer: () => setStep({ kind: 'confirm', item: step.item }) }
      : step.kind === 'confirm'
        ? { text: isMachine(step.item) ? `${name(step.item)}?\nThat will be ₱${price}. Okay?` : `${name(step.item)}, and you want ${count}.\nThat will be ₱${price * count}. Okay?`, choices: [{ label: 'YES', disabled: busy }, 'NO'], answer: (i) => (i === 0 ? void buy() : setStep({ kind: 'list' })) }
        : step.kind === 'said'
          ? { text: step.text, answer: () => setStep({ kind: 'list' }) }
          : null;
  // The map round the tile the player faces: 5 by 10 tiles from 2 left of and 3 above it, drawn from 16 pixels down.
  const [dx, dy] = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const)[mart.face];
  const fx = mart.x + dx;
  const fy = mart.y + dy;
  const ox = -(fx - 2) * 16;
  const oy = 16 - (fy - 3) * 16;
  const people = [...mart.people, { sprite: player, x: mart.x, y: mart.y, face: mart.face }].filter((p) => Math.abs(p.x - fx) <= 3 && Math.abs(p.y - fy) <= 2);
  const shown = rows.slice(top, top + ROWS);
  const listing = step.kind === 'list';
  return (
    <div ref={ref} className="w-full">
      <div
        className="relative mx-auto overflow-hidden rounded-lg bg-black ring-1 ring-slate-700 [animation:idle-fade-in_300ms]"
        style={{ width: GAME_WIDTH * scale || '100%', height: GAME_HEIGHT * scale || undefined, aspectRatio: scale ? undefined : '3 / 2' }}
        onClick={() => pressDialogue.current?.()}
      >
        {scale > 0 && (
          <div className="absolute left-0 top-0 origin-top-left select-none [image-rendering:pixelated]" style={{ width: GAME_WIDTH, height: GAME_HEIGHT, transform: `scale(${scale})` }}>
            {/* The map (its 10 tile columns) and everyone near the counter, behind the frame. */}
            <div className="absolute overflow-hidden" style={{ left: 0, top: 16, width: 80, height: GAME_HEIGHT - 16 }}>
              <img src={map.image} alt="" className="absolute max-w-none" style={{ left: ox, top: oy - 16, width: map.width * 16, height: map.height * 16 }} draggable={false} />
            </div>
            {/* (Its own stacking context: the sprites' z-index, lower on the map in front, stays under the frame.) */}
            <div className="absolute isolate" style={{ left: ox, top: oy, width: map.width * 16, height: map.height * 16, zIndex: 0 }}>
              {people.map((p, i) => (
                <OverworldSprite key={i} name={p.sprite} tile={{ x: p.x, y: p.y }} face={p.face} />
              ))}
            </div>
            <img src={`${SHOP}/${listing ? 'frame' : 'frame_quantity'}.png`} alt="" className="absolute left-0 top-0" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }} draggable={false} />
            {/* The money box (window 0's 8 by 3 tiles; the user's: on the left, just above the description's bar, not in the
                top left corner, where the Map button is; above IN BAG while it's there). */}
            <Win x={1} y={step.kind === 'quantity' ? 6 : 10} w={8} h={3} frame="std">
              <Text x={0} y={1} style={{ ...NORMAL, ...DARK }}>MONEY</Text>
              <Money right={0} y={12} amount={money} />
            </Win>
            {/* The list (window 4: 11,1, 17 by 12 tiles): the name from 9, the price from 105, rows of 16 from 2. */}
            <div ref={list} className="absolute" style={{ left: 88, top: 8, width: 136, height: 96 }}>
              {shown.map((it, i) => {
                const row = top + i;
                return (
                  <button
                    key={it ?? 'cancel'}
                    type="button"
                    className="absolute left-0 block w-full text-left"
                    style={{ top: 2 + i * 16, height: 16 }}
                    disabled={!listing}
                    onPointerEnter={() => listing && point(row)}
                    onClick={(e) => (e.stopPropagation(), listing && (point(row), choose(row)))}
                    aria-label={it ? `${name(it)}, ${owned(it) ? 'owned' : `₱${priceOf(it)}`}` : 'Cancel'}
                  >
                    {row === cursor && <Cursor x={1} y={2} grey={!listing} />}
                    <Text x={9} y={2} style={{ ...NORMAL, ...DARK }}>
                      {it ? name(it) : 'CANCEL'}
                    </Text>
                    {it && (owned(it) ? <Text x={136 - 34} y={4} style={{ ...SMALL, ...DARK }}>OWNED</Text> : <Money right={0} y={3} amount={priceOf(it)} />)}
                  </button>
                );
              })}
            </div>
            {listing && top > 0 && <Arrow x={160} y={8} up />}
            {listing && top + ROWS < rows.length && <Arrow x={160} y={104} up={false} />}
            {/* The item's description (window 5: 5,14) and icon (at 24,140), hidden while it's being bought. */}
            {listing && (
              <Text x={40} y={115} style={{ ...NORMAL, ...WHITE, lineHeight: '15px' }}>
                {item ? ITEMS[item]!.description : 'Quit shopping.'}
              </Text>
            )}
            <img src={`${SHOP}/items/${item ?? 'cancel'}.png`} alt="" className="absolute" style={{ left: 8, top: 124, width: 24, height: 24 }} draggable={false} />
            {/* How many (IN BAG: window 1, 1,11; the quantity: window 3, 17,9, its arrows at 152,72 and 152,104). */}
            {step.kind === 'quantity' && (
              <>
                <Win x={1} y={11} w={13} h={2} frame="std">
                  <Text x={0} y={2} style={{ ...NORMAL, ...DARK }}>
                    IN BAG: <span style={SMALL}>{String(run.view.bag[step.item] ?? 0).padStart(3)}</span>
                  </Text>
                </Win>
                <Win x={17} y={9} w={12} h={4} frame="user">
                  <button type="button" className="absolute inset-0" aria-label="One more" onClick={(e) => (e.stopPropagation(), adjust(1))} style={{ height: '50%' }} />
                  <button type="button" className="absolute inset-x-0 bottom-0" aria-label="One fewer" onClick={(e) => (e.stopPropagation(), adjust(-1))} style={{ height: '50%' }} />
                  <Text x={2} y={10} style={{ ...SMALL, ...DARK }}>×{String(count).padStart(2, '0')}</Text>
                  <Money right={2} y={10} amount={price * count} />
                </Win>
                {most > 1 && <Arrow x={152} y={72} up />}
                {most > 1 && <Arrow x={152} y={104} up={false} />}
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
