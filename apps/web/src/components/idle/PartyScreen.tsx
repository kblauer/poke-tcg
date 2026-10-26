import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { abilityName, abilityOf, basicFor, calcStats, cooldownTicks, ITEMS, moveData, NATURES, species, STAT_NAMES, usableStones, type IdleAction, type Mon } from '@poke-tcg/idle';
import { ICON_BUTTON } from '../../utils/styles';

/** A party icon (FireRed's, two frames stacked: shown in turn, as the party screen bobs them). */
export function MonIcon({ id, className = '' }: { id: number; className?: string }) {
  return (
    <span
      className={`inline-block size-8 shrink-0 bg-no-repeat [image-rendering:pixelated] ${className}`}
      style={{ backgroundImage: `url(/idle/gen1/pokemon/icon/${id}.png)`, backgroundSize: '32px 64px', animation: 'idle-icon 0.5s steps(1) infinite' }}
      aria-hidden
    />
  );
}

const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a878', fighting: '#c03028', flying: '#a890f0', poison: '#a040a0', ground: '#e0c068', rock: '#b8a038', bug: '#a8b820', ghost: '#705898', steel: '#b8b8d0',
  fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030', psychic: '#f85888', ice: '#98d8d8', dragon: '#7038f8', dark: '#705848', mystery: '#68a090',
};

/** A type's badge, in the games' colours. */
export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: TYPE_COLORS[type] ?? '#888' }}>
      {type}
    </span>
  );
}

/** A move's line: name, type, power and its cooldown in turns. */
const moveLabel = (key: string) => {
  const m = moveData(key);
  return `${m.name} (${m.power > 1 ? m.power : m.power === 1 ? 'varies' : 'status'}, ${cooldownTicks(key)}-turn cooldown)`;
};

/**
 * The party (README: Idle Adventure): its order (the lead fights first, the next comes in when one faints: agreed),
 * each Pokémon's stats, IVs and EVs, its basic move and its 3 slots (each tick the strongest one off cooldown, the basic
 * move while all three cool down: the user's cooldown rule), and the evolution stones in the bag it can use.
 */
export function PartyScreen({ party, bag, busy, onAct }: { party: Mon[]; bag: Record<string, number>; busy: boolean; onAct: (action: IdleAction) => void }) {
  const move = (i: number, by: number) => {
    const uids = party.map((m) => m.uid);
    const [m] = uids.splice(i, 1);
    uids.splice(i + by, 0, m!);
    onAct({ type: 'SET_ORDER', uids });
  };
  return (
    <ul className="space-y-3">
      {party.map((mon, i) => {
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
        return (
          <li key={mon.uid} className="rounded-lg bg-slate-800 p-3 ring-1 ring-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <MonIcon id={mon.species} />
              <div className="min-w-32 flex-1">
                <div className="font-semibold">
                  {mon.shiny && (
                    <span className="mr-1 text-yellow-300" title="Shiny">
                      ★
                    </span>
                  )}
                  {s.name} <span className="text-sm text-slate-400">Lv. {mon.level}</span>
                </div>
                <div className="mt-0.5 flex gap-1">{s.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
              </div>
              <div className="text-xs text-slate-400">
                {NATURES[mon.nature]} · {abilityName(abilityOf(mon))}
                {mon.gender && ` · ${mon.gender === 'male' ? '♂' : '♀'}`}
              </div>
              <div className="flex gap-1">
                <button className={ICON_BUTTON} disabled={busy || i === 0} onClick={() => move(i, -1)} title="Move up" aria-label="Move up">
                  <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                </button>
                <button className={ICON_BUTTON} disabled={busy || i === party.length - 1} onClick={() => move(i, 1)} title="Move down" aria-label="Move down">
                  <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                </button>
              </div>
            </div>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-normal" />
                  {STAT_NAMES.map((n) => (
                    <th key={n} className="font-normal">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-center">
                <tr>
                  <td className="text-left text-slate-500">Stat</td>
                  {stats.map((v, k) => (
                    <td key={k}>{v}</td>
                  ))}
                </tr>
                <tr className="text-slate-400">
                  <td className="text-left text-slate-500">IV</td>
                  {mon.ivs.map((v, k) => (
                    <td key={k}>{v}</td>
                  ))}
                </tr>
                <tr className="text-slate-400">
                  <td className="text-left text-slate-500">EV</td>
                  {mon.evs.map((v, k) => (
                    <td key={k}>{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <div className="mt-2 space-y-1 text-sm">
              <div className="text-xs text-slate-400">
                Basic move: <span className="text-slate-200">{moveData(basic).name}</span> (no cooldown)
              </div>
              {[0, 1, 2].map((slot) => (
                <label key={slot} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-slate-500">Slot {slot + 1}</span>
                  <select
                    className="min-w-0 flex-1 rounded bg-slate-700 px-2 py-1 text-xs ring-1 ring-slate-600"
                    value={mon.slots[slot] ?? ''}
                    disabled={busy}
                    onChange={(e) => setSlot(slot, e.target.value)}
                  >
                    <option value="">(empty)</option>
                    {choices.map((k) => (
                      <option key={k} value={k} disabled={mon.slots.includes(k) && mon.slots[slot] !== k}>
                        {moveLabel(k)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={mon.autoSlots} disabled={busy || mon.autoSlots} onChange={() => onAct({ type: 'SET_SLOTS', uid: mon.uid, slots: [], auto: true })} />
                Pick the slots automatically (the 3 strongest)
              </label>
              {stones.map((st) => (
                <button key={st} className="mr-2 rounded bg-emerald-700 px-3 py-1 text-xs font-semibold transition hover:bg-emerald-600 disabled:opacity-40" disabled={busy} onClick={() => onAct({ type: 'USE_STONE', uid: mon.uid, item: st })}>
                  Use a {ITEMS[st]!.name}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
