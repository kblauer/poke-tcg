import { species, type IdleAction, type Mon } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { pokemonPics } from '../../utils/idleLook';
import { DS_HEIGHT, DS_WIDTH } from './GameScreen';
import { MonPanel, moved, PANEL_W, px } from './PartyOverlay';

/** The party menu's pictures (tools/idle/hgss_menus.py), and the message frame (the buy screen's, DrawFrameAndWindow2's). */
const PARTY = '/idle/gen2/party';
const FRAME = '/idle/gen2/shop/window_msg.png';
/** The six slots' panels' top left corners (_0210150C[0]: two columns, the right one 8 pixels lower), 128x48 each. */
const SLOTS: [number, number][] = [
  [0, 0],
  [128, 8],
  [0, 48],
  [128, 56],
  [0, 96],
  [128, 104],
];
const SLOT_W = 128;
const SLOT_H = 48;
/** The names' white with its dark shadow (colour 15, 14 of font palette 0), in the site's pixel font (the DS's isn't ported); the genders' colours. */
const TEXT = { color: '#ffffff', textShadow: `${px(1)} 0 0 #292929, 0 ${px(1)} 0 #292929, ${px(1)} ${px(1)} 0 #292929`, fontFamily: '"Pokemon Emerald", monospace', lineHeight: 1, whiteSpace: 'nowrap' } as const;
const GENDER = { male: ['#0073ff', '#7bbdef'], female: ['#ef2110', '#ffadbd'] } as const;
const MESSAGE = { color: '#52525a', textShadow: `${px(1)} 0 0 #a5a5ad, 0 ${px(1)} 0 #a5a5ad, ${px(1)} ${px(1)} 0 #a5a5ad`, fontFamily: '"Pokemon Emerald", monospace', lineHeight: 1, whiteSpace: 'nowrap' } as const;
/** How far (game pixels) a slot must be dragged before it's a drag, not a click. */
const DRAG_START = 3;
/** A full-HP icon's frames (sub_0207F11C: 4 and 4 at 60 a second): the party is always healed between battles. */
const ICON_MS = 133;

/** The slot nearest a point (a dragged slot's drop). */
const nearest = (x: number, y: number) => {
  let best = 0;
  SLOTS.forEach(([sx, sy], i) => Math.hypot(sx - x, sy - y) < Math.hypot(SLOTS[best]![0] - x, SLOTS[best]![1] - y) && (best = i));
  return best;
};

/** A number in the party screen's digits (digits.png: 0–9 at 8 pixels, then '/', then "Lv."), from x, y in a slot. */
function Digits({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className="absolute" style={{ left: px(x + i * 8), top: px(y), width: px(8), height: px(8), backgroundImage: `url(${PARTY}/digits.png)`, backgroundSize: `${px(104)} ${px(8)}`, backgroundPosition: `-${px(Number(c) * 8)} 0` }} />
      ))}
    </>
  );
}

/**
 * HeartGold's party menu over the game screen (issue #170, step 5; src/party_menu.c, the spec's numbers), Johto's
 * PartyOverlay: the lead's icon in the top right corner opens the touch screen's menu over the screen (bg.png), the
 * Pokémon in its six panels, two staggered columns (the lead's rounded), each with its Poké Ball (open when chosen), its
 * icon (bouncing when chosen: sub_0207F178), name, gender, level and held item (no HP: the user's, the panels' HP-less
 * art), the red cursor round the chosen one, CANCEL (RELEASE for a catch with the party full) and the "Choose a Pokémon."
 * box. As FireRed's: a panel dragged onto another's place reorders the party (SET_ORDER), one clicked opens its panel
 * (MonPanel: stats, moves, stones) beside it, a catch with the party full keeps it open till it's settled.
 */
export function HgssParty({
  party,
  bag,
  busy,
  pending,
  open: opened,
  onToggle,
  onAct,
  replacing,
  onReplace,
}: {
  party: Mon[];
  bag: Record<string, number>;
  busy: boolean;
  pending: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  onAct: (action: IdleAction) => unknown;
  replacing?: Mon | null;
  onReplace?: (uid?: string) => void;
}) {
  const open = opened || !!replacing;
  const [chosen, setChosen] = useState<string | null>(null);
  const mon = party.find((m) => m.uid === chosen) ?? null;
  const close = () => (setChosen(null), !replacing && onToggle(false));
  useEscape(() => (mon ? setChosen(null) : close()), open);
  const lead = party[0];
  // A press outside the screen's menu closes it (as FireRed's: the user's).
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (![menu, button].some((r) => r.current?.contains(t))) closeRef.current();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Dragging a panel: which, from which place, how far; the order it would drop into (the place nearest), the others making way.
  const [dropped, setDropped] = useState<string[] | null>(null);
  const order = dropped ?? party.map((m) => m.uid);
  const [drag, setDrag] = useState<{ uid: string; from: number; dx: number; dy: number } | null>(null);
  const pointer = useRef<{ uid: string; from: number; startX: number; startY: number; scale: number; dragging: boolean } | null>(null);
  const dragged = useRef(false);
  const to = drag ? Math.min(order.length - 1, nearest(SLOTS[drag.from]![0] + drag.dx, SLOTS[drag.from]![1] + drag.dy)) : -1;
  const shown = drag ? moved(order, drag.from, to) : order;
  const down = (uid: string, from: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (busy || replacing || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { uid, from, startX: e.clientX, startY: e.clientY, scale: e.currentTarget.getBoundingClientRect().height / SLOT_H, dragging: false };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const p = pointer.current;
    if (!p) return;
    const dx = (e.clientX - p.startX) / p.scale;
    const dy = (e.clientY - p.startY) / p.scale;
    if (!p.dragging && Math.hypot(dx, dy) < DRAG_START) return;
    p.dragging = true;
    setDrag({ uid: p.uid, from: p.from, dx, dy });
  };
  const up = () => {
    const p = pointer.current;
    pointer.current = null;
    if (!p?.dragging) return;
    dragged.current = true;
    if (drag && to !== drag.from) {
      setDropped(shown);
      void Promise.resolve(onAct({ type: 'SET_ORDER', uids: shown })).finally(() => setDropped(null));
    }
    setDrag(null);
  };
  // The chosen one's panel on the other side of the screen from its slot.
  const chosenAt = mon ? shown.indexOf(mon.uid) : -1;
  const panelLeft = chosenAt % 2 === 0 ? DS_WIDTH - PANEL_W - 4 : 4;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [container-type:inline-size] [image-rendering:pixelated]" onClick={(e) => e.stopPropagation()}>
      {open && (
        <div ref={menu} className="pointer-events-auto absolute inset-0 [animation:idle-fade-in_200ms]" style={{ backgroundImage: `url(${PARTY}/bg.png)`, backgroundSize: '100% 100%' }} role="dialog" aria-label="Party">
          {SLOTS.slice(party.length).map(([x, y], i) => (
            <img key={i} src={`${PARTY}/slot_empty.png`} alt="" draggable={false} className="absolute" style={{ left: px(x), top: px(y), width: px(SLOT_W), height: px(SLOT_H) }} />
          ))}
          {party.map((m) => {
            const held = drag?.uid === m.uid;
            const at = shown.indexOf(m.uid);
            const [x, y] = held ? [SLOTS[drag.from]![0] + drag.dx, SLOTS[drag.from]![1] + drag.dy] : SLOTS[at]!;
            const selected = m.uid === chosen || held;
            const leadPanel = at === 0;
            const s = species(m.species);
            return (
              <button
                key={m.uid}
                type="button"
                className={`absolute touch-none select-none text-left ${replacing ? 'cursor-pointer' : held ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{ left: px(x), top: px(y), width: px(SLOT_W), height: px(SLOT_H), zIndex: held ? 3 : 1, transition: held ? 'none' : 'left 150ms ease-out, top 150ms ease-out' }}
                onPointerDown={down(m.uid, order.indexOf(m.uid))}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onClick={() => {
                  if (dragged.current) return void (dragged.current = false);
                  setChosen(m.uid === chosen ? null : m.uid);
                }}
                aria-pressed={m.uid === chosen}
                title={replacing ? `${s.name}: click to replace it` : `${s.name}: drag to reorder, click for details`}
              >
                <img src={`${PARTY}/${leadPanel ? 'slot_lead' : 'slot'}_${selected ? 'selected' : 'normal'}_nohp.png`} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
                {/* Its Poké Ball (its point at 16,14), open when chosen; its icon (at 30,16), moved 2,2 and bouncing when chosen. */}
                <span className="absolute" style={{ left: 0, top: px(-2), width: px(32), height: px(32), backgroundImage: `url(${PARTY}/pokeball.png)`, backgroundSize: `${px(32)} ${px(64)}`, backgroundPosition: `0 ${selected ? `-${px(32)}` : '0'}` }} />
                <span className="absolute" style={{ left: px(selected ? 16 : 14), top: px(selected ? 2 : 0), width: px(32), height: px(32), animation: selected ? `idle-hgss-bounce ${ICON_MS * 2}ms steps(1) infinite` : undefined }}>
                  <span className="absolute inset-0 bg-no-repeat" style={{ backgroundImage: `url(${pokemonPics()}/icon/${m.species}.png)`, backgroundSize: `${px(32)} ${px(64)}`, animation: `idle-icon-cqw ${ICON_MS * 2}ms steps(1) infinite` }} />
                </span>
                {m.item && <img src={`${PARTY}/held_item.png`} alt="" draggable={false} className="absolute" style={{ left: px(30), top: px(24), width: px(8), height: px(8) }} />}
                <span className="absolute" style={{ ...TEXT, left: px(48), top: px(8), fontSize: px(12) }}>
                  {m.shiny && <span style={{ color: '#ffd552' }}>★</span>}
                  {s.name}
                </span>
                {m.gender && (
                  <span className="absolute" style={{ ...TEXT, left: px(112), top: px(8), fontSize: px(12), color: GENDER[m.gender][0], textShadow: `${px(1)} ${px(1)} 0 ${GENDER[m.gender][1]}` }}>
                    {m.gender === 'male' ? '♂' : '♀'}
                  </span>
                )}
                {/* "Lv." (digits.png's 88–103) and the level from 21. */}
                <span className="absolute" style={{ left: px(5), top: px(34), width: px(16), height: px(8), backgroundImage: `url(${PARTY}/digits.png)`, backgroundSize: `${px(104)} ${px(8)}`, backgroundPosition: `-${px(88)} 0` }} />
                <Digits text={String(m.level)} x={21} y={34} />
                {m.uid === chosen && !held && <img src={`${PARTY}/${leadPanel ? 'cursor_lead' : 'cursor'}.png`} alt="" draggable={false} className="pointer-events-none absolute" style={{ left: 0, top: px(1), width: px(SLOT_W), height: px(SLOT_H) }} />}
              </button>
            );
          })}
          {/* The message box (window 32: its text at 16,168, the frame round it to 199, 191). */}
          <div className="pointer-events-none absolute" style={{ left: 0, top: px(160), width: px(160), height: px(16), boxSizing: 'content-box', borderStyle: 'solid', borderWidth: `${px(8)} ${px(24)} ${px(8)} ${px(16)}`, borderImage: `url(${FRAME}) 8 24 8 16 fill` }}>
            <span className="absolute left-0 top-0" style={{ ...MESSAGE, fontSize: px(12) }}>
              {replacing ? `Caught ${species(replacing.species).name}! Replace which?` : 'Choose a Pokémon.'}
            </span>
          </div>
          {/* CANCEL (its point at 232,176), RELEASE while a catch waits. */}
          <button
            type="button"
            className="absolute"
            style={{ left: px(200), top: px(160), width: px(56), height: px(32), backgroundImage: `url(${PARTY}/cancel.png)`, backgroundSize: '100% 100%' }}
            disabled={!!replacing && busy}
            onClick={() => (replacing ? onReplace?.() : close())}
            title={replacing ? `Release ${species(replacing.species).name}` : undefined}
          >
            <span className="absolute text-center" style={{ ...TEXT, left: px(8), top: px(8), width: px(40), fontSize: px(replacing ? 10 : 12) }}>
              {replacing ? 'RELEASE' : 'CANCEL'}
            </span>
          </button>
          {mon && <MonPanel mon={mon} bag={bag} busy={busy} pending={pending} maxH={DS_HEIGHT - 4} onAct={onAct} onClose={() => setChosen(null)} replacing={replacing} onReplace={onReplace} left={panelLeft} />}
        </div>
      )}
      {/* The button: the lead's icon in the top right corner (as FireRed's), gone while the menu covers the screen. */}
      {lead && !open && (
        <button
          ref={button}
          type="button"
          className="pointer-events-auto absolute rounded-full transition hover:scale-110"
          style={{ right: px(4), top: px(2), width: px(26), height: px(26), background: 'rgba(15,23,42,0.35)', boxShadow: `0 0 0 ${px(1)} rgba(255,255,255,0.4)` }}
          title="Party"
          aria-label="Party"
          aria-expanded={false}
          onClick={() => onToggle(true)}
        >
          <span className="absolute bg-no-repeat" style={{ left: px(-3), top: px(-5), width: px(32), height: px(32), backgroundImage: `url(${pokemonPics()}/icon/${lead.species}.png)`, backgroundSize: `${px(32)} ${px(64)}`, animation: 'idle-icon-cqw 0.5s steps(1) infinite' }} />
        </button>
      )}
    </div>
  );
}
