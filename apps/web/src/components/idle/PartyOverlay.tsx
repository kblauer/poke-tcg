import { basicFor, calcStats, cooldownTicks, ITEMS, moveData, species, usableStones, type IdleAction, type Mon } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { TOWN_MAP_HEIGHT } from './TownMap';

/** One game pixel of FireRed's 240x160 screen, in the game screen's width (container query units). */
const px = (n: number) => `${(n * 100) / 240}cqw`;
const PARTY = '/idle/gen1/party';
/** FireRed's party text: white with its grey shadow (sFontColorTable[0]), in the Gen 3 font. */
const TEXT = { color: '#ffffff', textShadow: `${px(1)} ${px(1)} 0 #737373`, fontFamily: '"Pokemon Emerald", monospace', lineHeight: 1 } as const;
/**
 * A slot's width (party/slot.png: FireRed's without its HP bar or HP, 11 tiles: the user's, as narrow as fits a shiny's
 * star and a 10-letter name), its height (a slot a row), and where the slots' column begins.
 */
const SLOT_W = 88;
const SLOT_H = 24;
const LIST_LEFT = 240 - (10 + SLOT_W + 4);
/** The Pokémon's panel's width (just left of the slots' column), top, and tallest: its bottom edge above the Map button (the user's), wherever the scene puts it. */
const PANEL_W = 104;
const PANEL_TOP = 2;
const panelMaxH = (mapBottom: number) => 160 - mapBottom - TOWN_MAP_HEIGHT - 2 - PANEL_TOP;
/** The panel's colours: a slot's (slot.png's border, fill and light). */
const FRAME = { border: '#4a4a62', fill: '#3994de', light: '#83c5de', shade: '#297bb4' };
/** How far (game pixels) a slot must be dragged before it's a drag, not a click. */
const DRAG_START = 3;

/** A move's line: name, its power and its cooldown in turns. */
const moveLabel = (key: string) => {
  const m = moveData(key);
  return `${m.name} (${m.power > 1 ? m.power : m.power === 1 ? 'var.' : 'status'}, ${cooldownTicks(key)}t)`;
};

/** `order` with the one at `from` moved to `to`. */
const moved = (order: string[], from: number, to: number) => {
  const out = [...order];
  const [uid] = out.splice(from, 1);
  out.splice(to, 0, uid!);
  return out;
};

/**
 * The party over the game screen (the user's, replacing the Party tab below it): a Pokémon button in its top right corner
 * (the lead's own FireRed menu icon, hopping) slides FireRed's party screen out from the right, its slots in one column
 * (each Pokémon's icon on its Poké Ball, name, level and gender: party_menu.c's right-column slot, narrowed). A slot
 * dragged up or down reorders the party (the user's: the others make way, SET_ORDER on the drop); a slot clicked opens a
 * panel in the slots' style just left of the column with the Pokémon's stats as a hexagon, its moves to set and the
 * stones it can use. Escape, the button again or CANCEL closes it. Changes made during a wild battle wait for its end
 * (`pending`, IdleState.pending), shown at once.
 */
export function PartyOverlay({ party, bag, busy, pending, open, mapBottom, onToggle, onAct }: { party: Mon[]; bag: Record<string, number>; busy: boolean; pending: number; open: boolean; mapBottom: number; onToggle: (open: boolean) => void; onAct: (action: IdleAction) => unknown }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const mon = party.find((m) => m.uid === chosen) ?? null;
  const close = () => (setChosen(null), onToggle(false));
  useEscape(() => (mon ? setChosen(null) : close()), open);
  const lead = party[0];
  // A press anywhere but the slots, the Pokémon's panel or the button closes them all (the user's).
  const slots = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (![slots, panel, button].some((r) => r.current?.contains(t))) closeRef.current();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Dragging a slot: which, from where, how far (game pixels); the order it would drop into, the others making way.
  // A dropped order is kept on screen until the server answers (the user's: no popping back first), the party's after.
  const [dropped, setDropped] = useState<string[] | null>(null);
  const order = dropped ?? party.map((m) => m.uid);
  const [drag, setDrag] = useState<{ uid: string; from: number; dy: number } | null>(null);
  const pointer = useRef<{ uid: string; from: number; startY: number; scale: number; dragging: boolean } | null>(null);
  /** A drag just ended (its click is no click). */
  const dragged = useRef(false);
  const to = drag ? Math.max(0, Math.min(order.length - 1, drag.from + Math.round(drag.dy / SLOT_H))) : -1;
  const shown = drag ? moved(order, drag.from, to) : order;
  const down = (uid: string, from: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (busy || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { uid, from, startY: e.clientY, scale: e.currentTarget.getBoundingClientRect().height / SLOT_H, dragging: false };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const p = pointer.current;
    if (!p) return;
    const dy = (e.clientY - p.startY) / p.scale;
    if (!p.dragging && Math.abs(dy) < DRAG_START) return;
    p.dragging = true;
    setDrag({ uid: p.uid, from: p.from, dy });
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

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [container-type:inline-size] [image-rendering:pixelated]" onClick={(e) => e.stopPropagation()}>
      {/* The party's slots, sliding out from the right over FireRed's party background. */}
      <div
        ref={slots}
        className="pointer-events-auto absolute top-0 h-full transition-transform duration-300 ease-out"
        style={{ left: px(LIST_LEFT), width: px(240 - LIST_LEFT), transform: open ? 'none' : 'translateX(101%)', backgroundImage: `url(${PARTY}/bg.png)`, backgroundSize: `${px(240)} ${px(160)}`, backgroundPosition: `-${px(LIST_LEFT)} 0` }}
        aria-hidden={!open}
      >
        {party.map((m) => {
          const held = drag?.uid === m.uid;
          return (
            <Slot
              key={m.uid}
              mon={m}
              top={held ? drag.from * SLOT_H + drag.dy : shown.indexOf(m.uid) * SLOT_H}
              held={held}
              selected={m.uid === chosen}
              handlers={{ onPointerDown: down(m.uid, order.indexOf(m.uid)), onPointerMove: move, onPointerUp: up, onPointerCancel: up }}
              onClick={() => {
                if (dragged.current) return void (dragged.current = false);
                setChosen(m.uid === chosen ? null : m.uid);
              }}
            />
          );
        })}
        <button type="button" className="absolute" style={{ left: px(10 + SLOT_W - 56), top: px(144), width: px(56), height: px(16), backgroundImage: `url(${PARTY}/cancel.png)`, backgroundSize: '100% 100%' }} onClick={close}>
          <span className="block text-center" style={{ ...TEXT, fontSize: px(10), paddingTop: px(2) }}>CANCEL</span>
        </button>
      </div>
      {open && mon && (
        <div ref={panel} className="contents">
          <MonPanel mon={mon} bag={bag} busy={busy} pending={pending} maxH={panelMaxH(mapBottom)} onAct={onAct} onClose={() => setChosen(null)} />
        </div>
      )}
      {/* The button: the lead's menu icon, hopping (the user's: where the ball button was, the ball now beside it); not
          while a Pokémon's panel is open (it has its own ✕). */}
      {lead && !(open && mon) && (
        <button
          ref={button}
          type="button"
          className="pointer-events-auto absolute rounded-full transition hover:scale-110"
          // In the top right corner; open, just left of the slots (so it never covers the first one).
          style={{ ...(open ? { left: px(LIST_LEFT - 30) } : { right: px(4) }), top: px(2), width: px(26), height: px(26), background: open ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)', boxShadow: `0 0 0 ${px(1)} rgba(255,255,255,0.4)` }}
          title={open ? 'Close the party' : 'Party'}
          aria-label={open ? 'Close the party' : 'Party'}
          aria-expanded={open}
          onClick={() => (open ? close() : onToggle(true))}
        >
          <span
            className="absolute bg-no-repeat"
            style={{ left: px(-3), top: px(-5), width: px(32), height: px(32), backgroundImage: `url(/idle/gen1/pokemon/icon/${lead.species}.png)`, backgroundSize: `${px(32)} ${px(64)}`, animation: 'idle-icon-cqw 0.5s steps(1) infinite' }}
          />
        </button>
      )}
    </div>
  );
}

/**
 * A party slot (FireRed's right-column one without its HP bar, narrowed: SLOT_W): the Pokémon's icon on its Poké Ball,
 * name, level and gender (no HP: the user's). Draggable (`handlers`): held, it follows the pointer over the others, which
 * slide to where they'd be.
 */
function Slot({
  mon,
  top,
  held,
  selected,
  handlers,
  onClick,
}: {
  mon: Mon;
  top: number;
  held: boolean;
  selected: boolean;
  handlers: Record<'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel', (e: PointerEvent<HTMLButtonElement>) => void>;
  onClick: () => void;
}) {
  const s = species(mon.species);
  return (
    <button
      type="button"
      className={`absolute touch-none select-none text-left ${held ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: px(10), top: px(top), width: px(SLOT_W), height: px(SLOT_H), zIndex: held ? 2 : 1, transition: held ? 'none' : 'top 150ms ease-out', filter: held ? 'drop-shadow(0 0.6cqw 0 rgba(0,0,0,0.35))' : undefined }}
      {...handlers}
      onClick={onClick}
      aria-pressed={selected}
      title={`${s.name}: drag to reorder, click for details`}
    >
      <span className="absolute inset-0" style={{ backgroundImage: `url(${PARTY}/${selected || held ? 'slot_selected' : 'slot'}.png)`, backgroundSize: '100% 100%' }} />
      {/* The ball (closed, open when chosen) and the icon over it, as FireRed places them (sPartyMenuSpriteCoords). */}
      <span className="absolute" style={{ left: px(-10), top: px(1), width: px(32), height: px(32), backgroundImage: `url(${PARTY}/pokeball.png)`, backgroundSize: `${px(32)} ${px(64)}`, backgroundPosition: `0 ${selected ? `-${px(32)}` : '0'}` }} />
      <span
        className="absolute bg-no-repeat"
        style={{ left: px(-8), top: px(-6), width: px(32), height: px(32), backgroundImage: `url(/idle/gen1/pokemon/icon/${mon.species}.png)`, backgroundSize: `${px(32)} ${px(64)}`, animation: `idle-icon-cqw ${selected || held ? '0.25s' : '0.5s'} steps(1) infinite` }}
      />
      <span className="absolute whitespace-nowrap" style={{ ...TEXT, left: px(22), top: px(3), fontSize: px(11) }}>
        {mon.shiny && <span style={{ color: '#ffd552' }}>★</span>}
        {s.name}
      </span>
      {/* The level with its gender right after it (no HP: the user's). */}
      <span className="absolute whitespace-nowrap" style={{ ...TEXT, left: px(28), top: px(13), fontSize: px(10) }}>
        Lv{mon.level}
        {mon.gender && (
          <span style={{ marginLeft: px(2), color: mon.gender === 'male' ? '#41cdff' : '#ff9c94', textShadow: `${px(1)} ${px(1)} 0 ${mon.gender === 'male' ? '#006294' : '#9c4139'}` }}>
            {mon.gender === 'male' ? '♂' : '♀'}
          </span>
        )}
      </span>
    </button>
  );
}

/** The stats' order round the hexagon (the newer games' summary): HP at the top, then clockwise. */
const HEX: { label: string; stat: number; color: string }[] = [
  { label: 'HP', stat: 0, color: '#58c050' },
  { label: 'Attack', stat: 1, color: '#e8a030' },
  { label: 'Defense', stat: 2, color: '#e8a030' },
  { label: 'Speed', stat: 5, color: '#e85890' },
  { label: 'Sp. Def', stat: 4, color: '#5878d8' },
  { label: 'Sp. Atk', stat: 3, color: '#5878d8' },
];

/**
 * The stats as a hexagon (the user's: the newer games' summary): each stat's share of the Pokémon's highest, its label and
 * value at its corner; `height` game pixels tall, its width following.
 */
function StatHex({ stats, height }: { stats: number[]; height: number }) {
  const cx = 60;
  const cy = 48;
  const r = 26;
  const top = Math.max(...stats, 1);
  const at = (i: number, k: number) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as const;
  };
  const ring = (k: number) => HEX.map((_, i) => at(i, k).join(',')).join(' ');
  const shape = HEX.map((h, i) => at(i, Math.max(0.08, stats[h.stat]! / top)).join(',')).join(' ');
  return (
    <svg viewBox="0 0 120 96" className="mx-auto block" style={{ height: px(height), width: px((height * 120) / 96) }} role="img" aria-label={HEX.map((h) => `${h.label} ${stats[h.stat]}`).join(', ')}>
      <polygon points={ring(1.05)} fill="#58b048" />
      <polygon points={ring(1)} fill="#b8f0a0" />
      {[0.66, 0.33].map((k) => (
        <polygon key={k} points={ring(k)} fill="none" stroke="#88d070" strokeWidth={0.6} />
      ))}
      {HEX.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={at(i, 1)[0]} y2={at(i, 1)[1]} stroke="#88d070" strokeWidth={0.6} />
      ))}
      <polygon points={shape} fill="#3070e8" fillOpacity={0.85} stroke="#a0c8ff" strokeWidth={0.8} />
      {HEX.map((h, i) => {
        const [x, y] = at(i, 1.42);
        const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
        const lx = anchor === 'start' ? x - 10 : anchor === 'end' ? x + 10 : x;
        return (
          <g key={h.label} fontFamily='"Pokemon Emerald", monospace' fontSize={8.5} textAnchor={anchor}>
            <text x={lx} y={i === 0 ? y - 2 : i === 3 ? y + 1 : y - 3} fill="#ffffff" stroke={h.color} strokeWidth={2} paintOrder="stroke">
              {h.label}
            </text>
            <text x={lx} y={i === 0 ? y + 6 : i === 3 ? y - 7 : y + 5} fill="#303030">
              {stats[h.stat]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The panel a slot opens (in the slots' style), just left of the slots' column and small enough not to scroll (the
 * user's): the Pokémon's name, level and types, its stats as a hexagon, its basic move, its 3 slots to set (or picked
 * automatically) and the stones in the bag it can use.
 */
function MonPanel({ mon, bag, busy, pending, maxH, onAct, onClose }: { mon: Mon; bag: Record<string, number>; busy: boolean; pending: number; maxH: number; onAct: (a: IdleAction) => void; onClose: () => void }) {
  const s = species(mon.species);
  const stats = calcStats(mon.species, mon.level, mon.ivs, mon.evs, mon.nature);
  const basic = basicFor(mon);
  const choices = mon.moves.filter((m) => m !== basic);
  const stones = usableStones(mon).filter((st) => bag[st]);
  const setSlot = (slot: number, key: string) => {
    const slots = [...mon.slots];
    if (key) slots[slot] = key;
    else slots.splice(slot, 1);
    onAct({ type: 'SET_SLOTS', uid: mon.uid, slots: [...new Set(slots.filter(Boolean))] });
  };
  const small = { fontSize: px(7) } as const;
  return (
    <div
      className="pointer-events-auto absolute overflow-y-auto"
      style={{ left: px(LIST_LEFT - PANEL_W), top: px(PANEL_TOP), width: px(PANEL_W), maxHeight: px(maxH), background: FRAME.fill, border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(3), boxShadow: `inset 0 0 0 ${px(1)} ${FRAME.light}`, padding: px(2) }}
    >
      <div className="flex items-center justify-between">
        <span className="truncate" style={{ ...TEXT, fontSize: px(9) }}>
          {s.name} Lv{mon.level}
        </span>
        <button type="button" style={{ ...TEXT, fontSize: px(8), padding: `0 ${px(1)}` }} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {/* Its types (FireRed's labels, menu_info.png's, at three quarters) over its stats, small (the user's), in one white window. */}
      <div style={{ background: '#ffffff', borderRadius: px(2), marginTop: px(2), border: `${px(1)} solid ${FRAME.shade}`, padding: px(2) }}>
        <div className="flex justify-center" style={{ gap: px(2) }}>
          {s.types.map((t) => (
            <img key={t} src={`${PARTY}/types/${t}.png`} alt={t} style={{ width: px(24), height: px(9) }} draggable={false} />
          ))}
        </div>
        <div style={{ marginTop: px(1) }}>
          <StatHex stats={stats} height={40} />
        </div>
      </div>
      <div style={{ ...TEXT, ...small, marginTop: px(2) }}>Basic: {moveData(basic).name}</div>
      {[0, 1, 2].map((slot) => (
        <select
          key={slot}
          className="block w-full"
          style={{ fontSize: px(7), height: px(10), marginTop: px(1.5), padding: `0 ${px(1)}`, background: '#ffffff', color: '#303030', border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(2) }}
          value={mon.slots[slot] ?? ''}
          disabled={busy}
          onChange={(e) => setSlot(slot, e.target.value)}
          aria-label={`Move slot ${slot + 1}`}
        >
          <option value="">(empty)</option>
          {choices.map((k) => (
            <option key={k} value={k} disabled={mon.slots.includes(k) && mon.slots[slot] !== k}>
              {moveLabel(k)}
            </option>
          ))}
        </select>
      ))}
      <label className="flex items-center" style={{ ...TEXT, ...small, gap: px(2), marginTop: px(2) }}>
        <input type="checkbox" checked={mon.autoSlots} disabled={busy || mon.autoSlots} onChange={() => onAct({ type: 'SET_SLOTS', uid: mon.uid, slots: [], auto: true })} style={{ width: px(6), height: px(6) }} />
        Pick the 3 strongest
      </label>
      {stones.map((st) => (
        <button key={st} type="button" className="block w-full" style={{ ...TEXT, ...small, marginTop: px(2), padding: px(1.5), background: '#38a040', border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(2) }} disabled={busy} onClick={() => onAct({ type: 'USE_STONE', uid: mon.uid, item: st })}>
          Use a {ITEMS[st]!.name}
        </button>
      ))}
      {pending > 0 && <div style={{ fontSize: px(7), marginTop: px(2), color: '#ffe639', textShadow: TEXT.textShadow, fontFamily: TEXT.fontFamily, lineHeight: 1 }}>Applies when the battle ends.</div>}
    </div>
  );
}
