import { basicFor, calcStats, cooldownTicks, ITEMS, moveData, species, usableStones, type IdleAction, type Mon } from '@poke-tcg/idle';
import { useState } from 'react';
import { useEscape } from '../../hooks/useEscape';

/** One game pixel of FireRed's 240x160 screen, in the game screen's width (container query units). */
const px = (n: number) => `${(n * 100) / 240}cqw`;
const PARTY = '/idle/gen1/party';
/** FireRed's party text: white with its grey shadow (sFontColorTable[0]), in the Gen 3 font. */
const TEXT = { color: '#ffffff', textShadow: `${px(1)} ${px(1)} 0 #737373`, fontFamily: '"Pokemon Emerald", monospace', lineHeight: 1 } as const;
/**
 * A slot's width (party/slot.png: FireRed's without its HP bar or HP, 11 tiles: the user's, as narrow as fits a shiny's
 * star and a 10-letter name), and where the slots' column begins.
 */
const SLOT_W = 88;
const LIST_LEFT = 240 - (10 + SLOT_W + 4);
/** The panel's colours: a slot's (slot.png's border, fill and light). */
const FRAME = { border: '#4a4a62', fill: '#3994de', light: '#83c5de', shade: '#297bb4' };

/** A move's line: name, its power and its cooldown in turns. */
const moveLabel = (key: string) => {
  const m = moveData(key);
  return `${m.name} (${m.power > 1 ? m.power : m.power === 1 ? 'var.' : 'status'}, ${cooldownTicks(key)}t)`;
};

/**
 * The party over the game screen (the user's, replacing the Party tab below it): a Pokémon button in its top right corner
 * (the lead's own FireRed menu icon, hopping) slides FireRed's party screen out from the right, its slots in one column
 * (each Pokémon's icon on its Poké Ball, name, level, HP bar and HP: party_menu.c's right-column slot), and a slot
 * clicked opens a panel in the slots' style beside it with the Pokémon's stats as a hexagon, its moves to set, its
 * order and the stones it can use. Escape, the button again or CANCEL closes it. Changes made during a wild battle wait
 * for its end (`pending`, IdleState.pending), shown at once.
 */
export function PartyOverlay({ party, bag, busy, pending, open, onToggle, onAct }: { party: Mon[]; bag: Record<string, number>; busy: boolean; pending: number; open: boolean; onToggle: (open: boolean) => void; onAct: (action: IdleAction) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const mon = party.find((m) => m.uid === chosen) ?? null;
  const close = () => (setChosen(null), onToggle(false));
  useEscape(() => (mon ? setChosen(null) : close()), open);
  const lead = party[0];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [container-type:inline-size] [image-rendering:pixelated]" onClick={(e) => e.stopPropagation()}>
      {/* The party's slots, sliding out from the right over FireRed's party background. */}
      <div
        className="pointer-events-auto absolute top-0 h-full transition-transform duration-300 ease-out"
        style={{ left: px(LIST_LEFT), width: px(240 - LIST_LEFT), transform: open ? 'none' : 'translateX(101%)', backgroundImage: `url(${PARTY}/bg.png)`, backgroundSize: `${px(240)} ${px(160)}`, backgroundPosition: `-${px(LIST_LEFT)} 0` }}
        aria-hidden={!open}
      >
        {party.map((m, i) => (
          <Slot key={m.uid} mon={m} top={i * 24} selected={m.uid === chosen} onClick={() => setChosen(m.uid === chosen ? null : m.uid)} />
        ))}
        <button type="button" className="absolute" style={{ left: px(10 + SLOT_W - 56), top: px(144), width: px(56), height: px(16), backgroundImage: `url(${PARTY}/cancel.png)`, backgroundSize: '100% 100%' }} onClick={close}>
          <span className="block text-center" style={{ ...TEXT, fontSize: px(10), paddingTop: px(2) }}>CANCEL</span>
        </button>
      </div>
      {open && mon && <MonPanel mon={mon} order={party.map((m) => m.uid)} bag={bag} busy={busy} pending={pending} onAct={onAct} onClose={() => setChosen(null)} />}
      {/* The button: the lead's menu icon, hopping (the user's: where the ball button was, the ball now beside it); not
          while a Pokémon's panel is open (it has its own ✕). */}
      {lead && !(open && mon) && (
        <button
          type="button"
          className="pointer-events-auto absolute rounded-full transition hover:scale-110"
          // In the top right corner; open, just left of the slots (so it never covers the first one's HP).
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

/** A party slot (FireRed's right-column one without its HP bar, narrowed: SLOT_W): the Pokémon's icon on its Poké Ball, name, level and gender (no HP: the user's). */
function Slot({ mon, top, selected, onClick }: { mon: Mon; top: number; selected: boolean; onClick: () => void }) {
  const s = species(mon.species);
  return (
    <button type="button" className="absolute text-left" style={{ left: px(10), top: px(top), width: px(SLOT_W), height: px(24) }} onClick={onClick} aria-pressed={selected} title={`${s.name}: details`}>
      <span className="absolute inset-0" style={{ backgroundImage: `url(${PARTY}/${selected ? 'slot_selected' : 'slot'}.png)`, backgroundSize: '100% 100%' }} />
      {/* The ball (closed, open when chosen) and the icon over it, as FireRed places them (sPartyMenuSpriteCoords). */}
      <span className="absolute" style={{ left: px(-10), top: px(1), width: px(32), height: px(32), backgroundImage: `url(${PARTY}/pokeball.png)`, backgroundSize: `${px(32)} ${px(64)}`, backgroundPosition: `0 ${selected ? `-${px(32)}` : '0'}` }} />
      <span
        className="absolute bg-no-repeat"
        style={{ left: px(-8), top: px(-6), width: px(32), height: px(32), backgroundImage: `url(/idle/gen1/pokemon/icon/${mon.species}.png)`, backgroundSize: `${px(32)} ${px(64)}`, animation: `idle-icon-cqw ${selected ? '0.25s' : '0.5s'} steps(1) infinite` }}
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

/** The stats as a hexagon (the user's: the newer games' summary): each stat's share of the Pokémon's highest, its label and value at its corner. */
function StatHex({ stats }: { stats: number[] }) {
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
    <svg viewBox="0 0 120 96" className="block w-full" role="img" aria-label={HEX.map((h) => `${h.label} ${stats[h.stat]}`).join(', ')}>
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
          <g key={h.label} fontFamily='"Pokemon Emerald", monospace' fontSize={7.5} textAnchor={anchor}>
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
 * The panel a slot opens (in the slots' style): the Pokémon's name, level and types, its stats as a hexagon, its basic
 * move, its 3 slots to set (or picked automatically), its place in the party and the stones in the bag it can use.
 */
function MonPanel({ mon, order, bag, busy, pending, onAct, onClose }: { mon: Mon; order: string[]; bag: Record<string, number>; busy: boolean; pending: number; onAct: (a: IdleAction) => void; onClose: () => void }) {
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
  // Its place in the party, a step earlier or later (the lead fights first).
  const index = order.indexOf(mon.uid);
  const move = (by: number) => {
    const uids = [...order];
    uids.splice(index, 1);
    uids.splice(index + by, 0, mon.uid);
    onAct({ type: 'SET_ORDER', uids });
  };
  const small = { fontSize: px(8) } as const;
  return (
    <div
      className="pointer-events-auto absolute overflow-y-auto"
      style={{ left: px(3), top: px(3), width: px(118), maxHeight: px(154), background: FRAME.fill, border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(4), boxShadow: `inset 0 0 0 ${px(1)} ${FRAME.light}`, padding: px(3) }}
    >
      <div className="flex items-center justify-between">
        <span style={{ ...TEXT, fontSize: px(11) }}>
          {s.name} Lv{mon.level}
        </span>
        <button type="button" style={{ ...TEXT, fontSize: px(10), padding: `0 ${px(2)}` }} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {/* Its types: FireRed's labels (menu_info.png's). */}
      <div className="flex" style={{ gap: px(2), marginTop: px(2) }}>
        {s.types.map((t) => (
          <img key={t} src={`${PARTY}/types/${t}.png`} alt={t} style={{ width: px(32), height: px(12) }} draggable={false} />
        ))}
      </div>
      <div style={{ background: '#ffffff', borderRadius: px(3), marginTop: px(3), border: `${px(1)} solid ${FRAME.shade}` }}>
        <StatHex stats={stats} />
      </div>
      <div style={{ ...TEXT, ...small, marginTop: px(3) }}>Basic: {moveData(basic).name}</div>
      {[0, 1, 2].map((slot) => (
        <select
          key={slot}
          className="block w-full rounded"
          style={{ fontSize: px(8), marginTop: px(2), padding: px(1), background: '#ffffff', color: '#303030', border: `${px(1)} solid ${FRAME.border}` }}
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
      <label className="flex items-center" style={{ ...TEXT, ...small, gap: px(2), marginTop: px(3) }}>
        <input type="checkbox" checked={mon.autoSlots} disabled={busy || mon.autoSlots} onChange={() => onAct({ type: 'SET_SLOTS', uid: mon.uid, slots: [], auto: true })} style={{ width: px(7), height: px(7) }} />
        Pick the 3 strongest
      </label>
      <OrderButtons index={index} size={order.length} busy={busy} onMove={move} />
      {stones.map((st) => (
        <button key={st} type="button" className="block w-full rounded" style={{ ...TEXT, ...small, marginTop: px(2), padding: px(2), background: '#38a040', border: `${px(1)} solid ${FRAME.border}` }} disabled={busy} onClick={() => onAct({ type: 'USE_STONE', uid: mon.uid, item: st })}>
          Use a {ITEMS[st]!.name}
        </button>
      ))}
      {pending > 0 && <div style={{ ...small, marginTop: px(3), color: '#ffe639', textShadow: TEXT.textShadow, fontFamily: TEXT.fontFamily }}>Changes take effect when the battle ends.</div>}
    </div>
  );
}

/** Earlier and later in the party (the lead fights first). */
function OrderButtons({ index, size, busy, onMove }: { index: number; size: number; busy: boolean; onMove: (by: number) => void }) {
  const b = { ...TEXT, fontSize: px(8), padding: `${px(1)} ${px(3)}`, background: FRAME.shade, border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(2) } as const;
  return (
    <div className="flex items-center" style={{ gap: px(2), marginTop: px(3) }}>
      <span style={{ ...TEXT, fontSize: px(8) }}>Order</span>
      <button type="button" style={b} disabled={busy || index === 0} onClick={() => onMove(-1)}>
        ▲ Earlier
      </button>
      <button type="button" style={b} disabled={busy || index === size - 1} onClick={() => onMove(1)}>
        ▼ Later
      </button>
    </div>
  );
}
