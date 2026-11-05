import { generation, areas, isMachine, machineMove, machinePrice, mapView, moveData, type TownArea } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEscape } from '../../hooks/useEscape';
import type { ClientIdleRun } from '../../hooks/useIdle';
import { OverworldSprite } from '../run/RouteSprites';
import { DS_HEIGHT, DS_WIDTH, useGameScale } from './GameScreen';

/** The buy screen's pictures (tools/idle/hgss_menus.py). */
const SHOP = '/idle/gen2/shop';
/** The panels a page (MartData_BuyMenu_PageLeft/Right: 2 columns by 3 rows). */
const PAGE = 6;
/**
 * The text's colours (MAKE_TEXT_COLOR's letters and shadows, font palettes 0 and 1): the panels' (1, 2 of 0), the money
 * window's (15, 14 of 1), the description's and the labels' (15, 14 of 0), the message boxes' (1, 2 of 1).
 */
const shadow = (c: string) => `1px 0 0 ${c}, 0 1px 0 ${c}, 1px 1px 0 ${c}`;
const PANEL = { color: '#5a5a52', textShadow: shadow('#adbdbd') };
const MONEY = { color: '#ffffff', textShadow: shadow('#94d6ff') };
const LABEL = { color: '#ffffff', textShadow: shadow('#000000') };
const MESSAGE = { color: '#52525a', textShadow: shadow('#a5a5ad') };
/** HGSS's system and message fonts (16 pixels a line), in the site's pixel font: the DS's isn't ported. */
const FONT: CSSProperties = { fontFamily: '"Pokemon Emerald", monospace', fontSize: 12, lineHeight: '16px', whiteSpace: 'pre' };

/** An item's name as HGSS's lists print it (mixed case), a TM or HM with its move (TM28 Dig). */
const itemName = (item: string) => generation().items[item]!.name + (isMachine(item) ? ` ${moveData(machineMove(item)).name}` : '');
/** An item's price: a TM's or HM's machinePrice (HMs' a placeholder). */
const priceOf = (item: string) => (isMachine(item) ? machinePrice(item) : generation().items[item]!.price);

/** Text at a pixel position (its letters' top left), or right-aligned to `right`. */
function Text({ x, right, y, style, children }: { x?: number; right?: number; y: number; style: CSSProperties; children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute" style={{ ...FONT, ...style, top: y, ...(right !== undefined ? { right: DS_WIDTH - right } : { left: x }) }}>
      {children}
    </span>
  );
}

/** A sprite's picture (its PNG's top left at a point less the cell's offset, as the spec gives them). */
function Pic({ src, x, y, onClick, label }: { src: string; x: number; y: number; onClick?: () => void; label?: string }) {
  const img = <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ left: onClick ? 0 : x, top: onClick ? 0 : y }} />;
  if (!onClick) return img;
  return (
    <button type="button" aria-label={label} className="absolute" style={{ left: x, top: y }} onClick={(e) => (e.stopPropagation(), onClick())}>
      <img src={src} alt="" draggable={false} className="block max-w-none select-none" />
    </button>
  );
}

/** A message box (window_msg.png's frame, DrawFrameAndWindow2, round a window at x, y of w by h pixels), its text in it. */
function MessageBox({ x, y, w, h, text }: { x: number; y: number; w: number; h: number; text: string }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: x - 16, top: y - 8, width: w, height: h, boxSizing: 'content-box', borderStyle: 'solid', borderWidth: '8px 24px 8px 16px', borderImage: `url(${SHOP}/window_msg.png) 8 24 8 16 fill` }}>
      <span className="absolute left-0 top-0" style={{ ...FONT, ...MESSAGE }}>
        {text}
      </span>
    </div>
  );
}

/** A choice in the standard window frame (window_std.png), for the YES and NO the touch screen's prompt asks. */
function Choice({ x, y, label, onClick, disabled = false }: { x: number; y: number; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} className="absolute disabled:opacity-60" style={{ left: x, top: y, width: 40, height: 16, boxSizing: 'content-box', borderStyle: 'solid', borderWidth: 8, borderImage: `url(${SHOP}/window_std.png) 8 fill` }} onClick={(e) => (e.stopPropagation(), onClick())}>
      <span className="absolute inset-0 text-center" style={{ ...FONT, ...PANEL }}>
        {label}
      </span>
    </button>
  );
}

/** A Pokédollar amount: the sign and the number (FireRed's sign picture: the DS font isn't ported). */
const dollars = (n: number) => `₱${n}`;

/**
 * HeartGold's buy screen (issue #170, step 5; src/overlay_03/shop_menu.c on the top screen, overlay 31 on the touch
 * screen; the spec's numbers), the DS's two screens one under the other at the game screen's scale: on top the mart (the
 * map round the player at the counter) under its band, the item pointed at's description and icon; on the touch screen
 * the money, the stock in pages of 6 panels (2 columns by 3 rows: icon, name, price), the page arrows and number, the
 * exit (CANCEL), the red cursor. Choosing an item: "{item}? Certainly. How many would you like?", In Bag, the quantity's
 * two digits with their ±10 and ±1 arrows (up to 99 or what the money buys, round the ends: ov03_022587E8), the total,
 * BUY and CANCEL; then "For {n}, that will be ₱{total}, please." YES or NO, then "Here you are! Thank you!". `machines`
 * (Buy TMs): those TMs and HMs, one of each ("Would you like {item}?"), one owned OWNED in place of its price. Pointer
 * (point, click) or keys (arrows, Enter, Escape).
 */
export function HgssBuyScreen({ run, player, busy, onBuy, onClose, machines, children }: { run: ClientIdleRun; player: string; busy: boolean; onBuy: (item: string, count: number) => Promise<boolean>; onClose: () => void; machines?: string[]; children?: ReactNode }) {
  const { ref, scale } = useGameScale();
  const town = areas()[run.view.area] as TownArea;
  const mart = town.mart;
  const map = mapView(mart.map);
  const stock = machines ?? run.view.store;
  const owned = (it: string) => isMachine(it) && (run.view.bag[it] ?? 0) > 0;
  const money = run.view.money;
  /** The cursor: a panel of the page (0–5), or the page arrows and the exit. */
  const [page, setPage] = useState(0);
  const [cursor, setCursor] = useState<number | 'left' | 'right' | 'exit'>(0);
  const [count, setCount] = useState(1);
  const [step, setStep] = useState<{ kind: 'list' } | { kind: 'quantity' | 'confirm'; item: string } | { kind: 'said'; text: string }>({ kind: 'list' });
  const pages = Math.max(1, Math.ceil(stock.length / PAGE));
  const shown = stock.slice(page * PAGE, page * PAGE + PAGE);
  const item = typeof cursor === 'number' ? (shown[cursor] ?? null) : null;
  const chosen = step.kind === 'quantity' || step.kind === 'confirm' ? step.item : null;
  const price = chosen ? priceOf(chosen) : 0;
  const most = chosen ? Math.max(1, Math.min(99, Math.floor(money / price))) : 1;
  const turn = (by: number) => {
    const p = Math.max(0, Math.min(pages - 1, page + by));
    setPage(p);
    if (typeof cursor === 'number') setCursor(Math.min(cursor, stock.slice(p * PAGE, p * PAGE + PAGE).length - 1));
  };
  const choose = (it: string) => {
    if (owned(it)) return setStep({ kind: 'said', text: 'You already have that one.' });
    if (priceOf(it) > money) return setStep({ kind: 'said', text: 'You don’t have enough money.' });
    setCount(1);
    // A machine is one of a kind: straight to YES or NO.
    setStep({ kind: isMachine(it) ? 'confirm' : 'quantity', item: it });
  };
  // ov03_022587E8: +n at the most is 1, else up to the most; −n at 1 is the most, else down to 1.
  const adjust = (d: number) => setCount((c) => (d > 0 ? (c === most ? 1 : Math.min(most, c + d)) : c === 1 ? most : Math.max(1, c + d)));
  const buy = async () => {
    if (step.kind !== 'confirm' || busy) return;
    const ok = await onBuy(step.item, count);
    setStep(ok ? { kind: 'said', text: 'Here you are!\nThank you!' } : { kind: 'list' });
  };
  // The keys (sMartCursorMoveDests: left from the left column and right from the right one turn the page; the quantity's
  // up and down ±1, right and left ±10: AdjustQuantityUsingDPad).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step.kind === 'list') {
        const c = typeof cursor === 'number' ? cursor : 0;
        if (e.key === 'ArrowLeft') c % 2 === 0 ? turn(-1) : setCursor(c - 1);
        else if (e.key === 'ArrowRight') c % 2 === 1 || c + 1 >= shown.length ? turn(1) : setCursor(c + 1);
        else if (e.key === 'ArrowUp') setCursor(Math.max(c % 2, c - 2));
        else if (e.key === 'ArrowDown') setCursor(c + 2 < shown.length ? c + 2 : 'exit');
        else if ((e.key === 'Enter' || e.key === ' ') && item) choose(item);
        else return;
      } else if (step.kind === 'quantity') {
        const d = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 10, ArrowLeft: -10 }[e.key];
        if (d) adjust(d);
        else if (e.key === 'Enter') setStep({ kind: 'confirm', item: step.item });
        else return;
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const said = useRef<(() => void) | null>(null);
  said.current = step.kind === 'said' ? () => setStep({ kind: 'list' }) : null;
  useEscape(() => (step.kind === 'list' ? onClose() : step.kind !== 'said' ? setStep({ kind: 'list' }) : said.current?.()));

  // The top screen: the mart round the player (the map's 16 by 12 tiles with him in the middle) and everyone near him.
  const ox = DS_WIDTH / 2 - (mart.x * 16 + 8);
  const oy = DS_HEIGHT / 2 - (mart.y * 16 + 8);
  const people = [...mart.people, { sprite: player, x: mart.x, y: mart.y, face: mart.face }];
  const listing = step.kind === 'list';
  const background = step.kind === 'quantity' ? 'bottom_quantity' : step.kind === 'confirm' ? 'bottom_confirm' : 'bottom';
  /** A screen in game pixels at the game screen's scale, `over` it in CSS pixels (the overlays: the party, the Town Map). */
  const screen = (content: ReactNode, over?: ReactNode) => (
    <div className="relative mx-auto overflow-hidden rounded-lg bg-black ring-1 ring-slate-700" style={{ width: DS_WIDTH * scale || '100%', height: DS_HEIGHT * scale || undefined, aspectRatio: scale ? undefined : '4 / 3' }}>
      {scale > 0 && (
        <div className="absolute left-0 top-0 origin-top-left select-none [image-rendering:pixelated]" style={{ width: DS_WIDTH, height: DS_HEIGHT, transform: `scale(${scale})` }}>
          {content}
        </div>
      )}
      {over}
    </div>
  );
  return (
    <div ref={ref} className="w-full space-y-1 [animation:idle-fade-in_300ms]">
      {screen(
        <>
          <img src={map.image} alt="" draggable={false} className="absolute max-w-none" style={{ left: ox, top: oy, width: map.width * 16, height: map.height * 16 }} />
          <div className="absolute isolate" style={{ left: ox, top: oy, width: map.width * 16, height: map.height * 16 }}>
            {people.map((p, i) => (
              <OverworldSprite key={i} name={p.sprite} tile={{ x: p.x, y: p.y }} face={p.face} />
            ))}
          </div>
          <img src={`${SHOP}/top.png`} alt="" draggable={false} className="absolute left-0 top-0" />
          {/* The description (window 1 at 40,144) and the icon (its point at 22,172), only on an item. */}
          {listing && item && (
            <>
              <Text x={40} y={144} style={{ ...LABEL, whiteSpace: 'pre-wrap', width: 212 }}>
                {generation().items[item]!.description}
              </Text>
              <img src={`${SHOP}/items/${item}.png`} alt="" draggable={false} className="absolute" style={{ left: 6, top: 156 }} />
            </>
          )}
        </>,
        children,
      )}
      {screen(
        <>
          <img src={`${SHOP}/${background}.png`} alt="" draggable={false} className="absolute left-0 top-0" />
          {/* The money window (8,0; the amount right-aligned to 80). */}
          <Text x={8} y={0} style={MONEY}>
            Money
          </Text>
          <Text right={80} y={16} style={MONEY}>
            {dollars(money)}
          </Text>
          {(listing || step.kind === 'said') && (
            <>
              {shown.length > 0 && <img src={`${SHOP}/panels_${shown.length}.png`} alt="" draggable={false} className="absolute left-0 top-0" />}
              {shown.map((it, i) => {
                const px = (i % 2) * 128;
                const py = 32 + 40 * Math.floor(i / 2);
                return (
                  <button
                    key={it}
                    type="button"
                    className="absolute"
                    style={{ left: px, top: py, width: 128, height: 42 }}
                    disabled={!listing}
                    onPointerEnter={() => listing && setCursor(i)}
                    onClick={(e) => (e.stopPropagation(), listing && (setCursor(i), choose(it)))}
                    aria-label={`${itemName(it)}, ${owned(it) ? 'owned' : dollars(priceOf(it))}`}
                  >
                    <img src={`${SHOP}/items/${it}.png`} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: 6, top: [59, 100, 139][Math.floor(i / 2)]! - 16 - py }} />
                    <span className="pointer-events-none absolute" style={{ ...FONT, ...PANEL, left: 32, top: 8, maxWidth: 92, overflow: 'hidden' }}>
                      {itemName(it)}
                    </span>
                    <span className="pointer-events-none absolute" style={{ ...FONT, ...PANEL, left: 68, top: 24 }}>
                      {owned(it) ? 'OWNED' : dollars(priceOf(it))}
                    </span>
                  </button>
                );
              })}
              {/* The page arrows (24,176 and 64,176), each only where there's a page that way; the page's number at 80,168. */}
              {page > 0 && <Pic src={`${SHOP}/arrow_left.png`} x={0} y={160} label="Previous page" onClick={() => listing && turn(-1)} />}
              {page < pages - 1 && <Pic src={`${SHOP}/arrow_right.png`} x={48} y={160} label="Next page" onClick={() => listing && turn(1)} />}
              <Text x={80} y={168} style={LABEL}>
                {`${page + 1}/${pages}`}
              </Text>
              <Pic src={`${SHOP}/exit.png`} x={192} y={160} label="Cancel" onClick={() => listing && onClose()} />
              <Text x={200} y={168} style={{ ...LABEL, width: 48, textAlign: 'center' }}>
                CANCEL
              </Text>
              {/* The red cursor: the panel's box, or the arrows' or the exit's own. */}
              {listing && typeof cursor === 'number' && cursor < shown.length && <Pic src={`${SHOP}/cursor.png`} x={(cursor % 2) * 128} y={32 + 40 * Math.floor(cursor / 2)} />}
              {listing && cursor === 'exit' && <Pic src={`${SHOP}/cursor_exit.png`} x={192} y={160} />}
            </>
          )}
          {chosen && (
            <>
              {/* The item (its icon at 86,76, name at 96,56, price at 132,72) and In Bag (8,108; the count to 72,124). */}
              <img src={`${SHOP}/items/${chosen}.png`} alt="" draggable={false} className="absolute" style={{ left: 70, top: 60 }} />
              <Text x={96} y={56} style={PANEL}>
                {itemName(chosen)}
              </Text>
              <Text x={132} y={72} style={PANEL}>
                {dollars(price)}
              </Text>
              <Text x={8} y={108} style={MESSAGE}>
                In Bag:
              </Text>
              <Text right={72} y={124} style={MESSAGE}>
                {run.view.bag[chosen] ?? 0}
              </Text>
            </>
          )}
          {step.kind === 'quantity' && (
            <>
              <MessageBox x={96} y={8} w={136} h={32} text={`${itemName(step.item)}? Certainly.\nHow many would you like?`} />
              {/* The quantity's two digits (128,116 and 160,116), the total (to 248,116), the ±10 and ±1 arrows. */}
              <Text x={128} y={116} style={PANEL}>
                {String(Math.floor(count / 10))}
              </Text>
              <Text x={160} y={116} style={PANEL}>
                {String(count % 10)}
              </Text>
              <Text right={248} y={116} style={PANEL}>
                {dollars(price * count)}
              </Text>
              {most >= 10 && <Pic src={`${SHOP}/quantity_up.png`} x={120} y={88} label="Ten more" onClick={() => adjust(10)} />}
              {most !== 1 && <Pic src={`${SHOP}/quantity_up.png`} x={152} y={88} label="One more" onClick={() => adjust(1)} />}
              {most >= 10 && <Pic src={`${SHOP}/quantity_down.png`} x={120} y={128} label="Ten fewer" onClick={() => adjust(-10)} />}
              {most !== 1 && <Pic src={`${SHOP}/quantity_down.png`} x={152} y={128} label="One fewer" onClick={() => adjust(-1)} />}
              <Pic src={`${SHOP}/button_buy.png`} x={96} y={160} label="Buy" onClick={() => setStep({ kind: 'confirm', item: step.item })} />
              <Text x={116} y={168} style={LABEL}>
                BUY
              </Text>
              <Pic src={`${SHOP}/button_cancel.png`} x={176} y={160} label="Cancel" onClick={() => setStep({ kind: 'list' })} />
              <Text x={197} y={168} style={LABEL}>
                CANCEL
              </Text>
            </>
          )}
          {step.kind === 'confirm' && (
            <>
              <MessageBox x={96} y={8} w={136} h={32} text={isMachine(step.item) ? `Would you like\n${itemName(step.item)}?` : `For ${count}, that will\nbe ${dollars(price * count)}, please.`} />
              {/* The touch YES/NO prompt (at 208,48; its own pictures aren't ported: two choices in the standard frame). */}
              <Choice x={200} y={48} label="YES" disabled={busy} onClick={() => void buy()} />
              <Choice x={200} y={84} label="NO" onClick={() => setStep({ kind: 'list' })} />
            </>
          )}
          {step.kind === 'said' && (
            <button type="button" aria-label="Continue" className="absolute inset-0" onClick={(e) => (e.stopPropagation(), said.current?.())}>
              <MessageBox x={16} y={8} w={216} h={32} text={step.text} />
            </button>
          )}
        </>,
      )}
    </div>
  );
}
