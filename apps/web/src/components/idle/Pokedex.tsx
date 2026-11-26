import { DEX_SIZE, dexSpecies, generation, STAT_NAMES } from '@poke-tcg/idle';
import { useState } from 'react';
import type { IdleOverview } from '../../hooks/useIdle';
import { useIsPhone } from '../../hooks/useIsPhone';
import { ConditionFeeder } from '../contest/ConditionFeeder';
import { SidePanel } from '../SidePanel';
import { DexHabitat } from './DexHabitat';
import { TypeBadge } from './MonIcon';
import { dexPic } from '../../utils/idleLook';

type DexRow = IdleOverview['dex'][number];
type Species = ReturnType<typeof dexSpecies>;

/** The Pokédex's tabs (the user's, 2026-11-15): each region's own species, by National Pokédex number. */
const REGIONS = [
  { name: 'Kanto', from: 1, to: 151 },
  { name: 'Johto', from: 152, to: 251 },
  { name: 'Hoenn', from: 252, to: 386 },
  { name: 'Sinnoh', from: 387, to: 493 },
] as const;

/** The Always catch tab's index in place of a region's (the user's, 2026-11-26: left of Kanto, the species marked Always catch). */
const ALWAYS_CATCH = -1;

/** Which species the grid shows (the user's, 2026-11-15). */
const FILTERS = [
  { id: 'all', label: 'All', keep: () => true },
  { id: 'seen', label: 'Seen', keep: (d?: DexRow) => !!d?.seen },
  { id: 'caught', label: 'Caught', keep: (d?: DexRow) => !!d?.caught },
  { id: 'missing', label: 'Not caught', keep: (d?: DexRow) => !d?.caught },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

const dexNo = (id: number) => String(id).padStart(3, '0');

/** Each region's Champion Ribbon (the Badge Challenge's pictures), by generation. */
const CHAMPION_RIBBONS: Record<number, string> = { 1: 'champion-ribbon', 2: 'johto-champion-ribbon', 3: 'hoenn-champion-ribbon', 4: 'sinnoh-champion-ribbon' };

/**
 * The account's Pokédex (README: Idle Adventure; agreed with the user): every species either region has, to Arceus
 * (issue #170, step 6), in order with the games' sprites (the shown region's where it has the species: dexSpecies, dexPic),
 * seen and caught, and for each caught species the best IV and EV ever had in each stat. A tab per region (opening on
 * `gen`'s, the shown run's by default), a search by number or by a seen species' name across them all, and a filter by
 * seen and caught (the user's, 2026-11-15: 493 species in one list was too long). A species' entry is beside the grid,
 * which scrolls by itself, or on a phone in a panel over it. With `onPick`, it's where a new run's starter is picked from
 * (`starters`: the species allowed; `shinyStarters`: those with a shiny caught, which can start shiny: agreed). A species
 * with a shiny caught has a ★ and its shiny sprite in its entry. A caught entry is the Pokémon for the Super Contests (the
 * user's): its condition, and the Pokéblocks and Poffins to feed it, are in its entry. A seen species' entry shows its
 * habitat, the Town Map with its places flashing (DexHabitat, the user's, 2026-11-06). A species that was in a run's party
 * as it beat the Champion has a Champion Ribbon in its tile's top right corner (IdleDex.champion, the user's, 2026-11-26). Where species can be marked Always
 * catch (`onAlwaysCatch`), an Always catch tab before the regions' lists them (the user's, 2026-11-26).
 */
export function Pokedex({
  dex,
  gen,
  starters,
  shinyStarters = [],
  onPick,
  busy = false,
  alwaysCatch,
  onAlwaysCatch,
}: {
  dex: DexRow[];
  gen?: number;
  starters?: number[];
  shinyStarters?: number[];
  onPick?: (species: number, shiny: boolean) => void;
  busy?: boolean;
  /** The species marked Always catch (IdleSettings.alwaysCatch), and marking one (the run's Pokédex tab; the user's, 2026-11-20). */
  alwaysCatch?: number[];
  onAlwaysCatch?: (species: number, on: boolean) => void;
}) {
  const phone = useIsPhone();
  const byId = new Map(dex.map((d) => [d.species, d]));
  const [open, setOpen] = useState<number | null>(null);
  const [region, setRegion] = useState(() => Math.min(REGIONS.length, Math.max(1, gen ?? generation().gen)) - 1);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const caught = dex.filter((d) => d.caught).length;
  const seen = dex.filter((d) => d.seen).length;
  const all = Array.from({ length: DEX_SIZE }, (_, i) => dexSpecies(i + 1));
  // A search looks through every region; an unseen species is found only by its number, never its name.
  const query = search.trim().toLowerCase();
  const matches = (s: Species) => (/^\d+$/.test(query) ? String(s.id).includes(String(Number(query))) : !!byId.get(s.id)?.seen && s.name.toLowerCase().includes(query));
  const marked = onAlwaysCatch ? (alwaysCatch ?? []) : null;
  const inTab = (s: Species) => (region === ALWAYS_CATCH ? !!marked?.includes(s.id) : s.id >= REGIONS[region]!.from && s.id <= REGIONS[region]!.to);
  const keep = FILTERS.find((f) => f.id === filter)!.keep;
  const shown = all.filter((s) => (query ? matches(s) : inTab(s)) && keep(byId.get(s.id)));
  const caughtIn = (r: (typeof REGIONS)[number]) => dex.filter((d) => d.caught && d.species >= r.from && d.species <= r.to).length;
  const sel = open !== null ? all[open - 1]! : null;
  const entry = sel && <DexEntry sel={sel} rec={byId.get(sel.id)} starters={starters} shinyStarters={shinyStarters} onPick={onPick} busy={busy} alwaysCatch={alwaysCatch} onAlwaysCatch={onAlwaysCatch} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-slate-400">
          Seen {seen} · Caught {caught} of {DEX_SIZE}
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or number"
          className="w-56 rounded bg-slate-900 px-2 py-1 text-sm ring-1 ring-slate-600 placeholder:text-slate-500 focus:outline-none focus:ring-yellow-300"
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button key={f.id} className={`rounded px-2.5 py-1 text-xs transition ${filter === f.id ? 'bg-slate-600 text-slate-50' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-700">
        {marked && (
          <button
            className={`rounded-t px-3 py-1.5 text-sm ${!query && region === ALWAYS_CATCH ? 'bg-slate-700 font-semibold text-yellow-300' : 'text-slate-400 hover:text-slate-100'}`}
            onClick={() => {
              setRegion(ALWAYS_CATCH);
              setSearch('');
            }}
          >
            Always Catch <span className="text-xs font-normal text-slate-500">{marked.length}</span>
          </button>
        )}
        {REGIONS.map((r, i) => (
          <button
            key={r.name}
            className={`rounded-t px-3 py-1.5 text-sm ${!query && region === i ? 'bg-slate-700 font-semibold text-yellow-300' : 'text-slate-400 hover:text-slate-100'}`}
            onClick={() => {
              setRegion(i);
              setSearch('');
            }}
          >
            {r.name} <span className="text-xs font-normal text-slate-500">{caughtIn(r)}/{r.to - r.from + 1}</span>
          </button>
        ))}
      </div>
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] md:items-start md:gap-3">
        <div className="md:max-h-[75vh] md:overflow-y-auto md:pr-1">
          {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{query ? 'No species found.' : region === ALWAYS_CATCH && !marked?.length ? "No Pokémon marked Always catch: tick it in a species' entry." : 'None here yet.'}</p>}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
            {shown.map((s) => {
              const d = byId.get(s.id);
              const pickable = starters?.includes(s.id);
              return (
                <li key={s.id}>
                  <button
                    className={`relative flex w-full flex-col items-center rounded p-1 text-[10px] ring-1 transition hover:bg-slate-700 ${open === s.id ? 'bg-slate-700 ring-yellow-300' : pickable ? 'bg-slate-800 ring-emerald-500/60' : 'bg-slate-800 ring-slate-700'}`}
                    onClick={() => setOpen(open === s.id ? null : s.id)}
                    title={d?.seen ? s.name + (d.champion.length ? ` · Champion of ${d.champion.map((g) => REGIONS[g - 1]?.name ?? `Gen ${g}`).join(', ')}` : '') : '???'}
                  >
                    {/* A Champion (the user's, 2026-11-26): in a run's party as it beat the Champion; the latest region's ribbon. */}
                    {!!d?.champion.length && CHAMPION_RIBBONS[Math.max(...d.champion)] && (
                      <img src={`/items/${CHAMPION_RIBBONS[Math.max(...d.champion)]}.png`} alt="Champion" className="absolute right-0.5 top-0.5 size-5 [image-rendering:pixelated]" draggable={false} />
                    )}
                    <img
                      src={dexPic(s.id)}
                      alt=""
                      loading="lazy"
                      className={`size-12 [image-rendering:pixelated] ${d?.caught ? '' : d?.seen ? 'opacity-60 grayscale' : 'opacity-40 brightness-0'}`}
                      draggable={false}
                    />
                    <span className="text-slate-500">{dexNo(s.id)}</span>
                    <span className="max-w-full truncate text-slate-200">
                      {d?.shiny && <span className="text-yellow-300">★</span>}
                      {d?.seen ? s.name : '???'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {phone ? (
          entry && (
            <SidePanel side="right" title={`No. ${dexNo(sel.id)} ${byId.get(sel.id)?.seen ? sel.name : '???'}`} onClose={() => setOpen(null)}>
              <div className="min-h-0 flex-1 overflow-y-auto">{entry}</div>
            </SidePanel>
          )
        ) : (
          <div className="mt-3 md:mt-0 md:max-h-[75vh] md:overflow-y-auto">
            {entry ?? <p className="hidden rounded-lg bg-slate-800 p-4 text-sm text-slate-400 ring-1 ring-slate-700 md:block">Pick a species to see its entry.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A species' entry: its sprites, text, habitat, best IVs and EVs, condition, and the starter buttons when picking one. */
function DexEntry({
  sel,
  rec,
  starters,
  shinyStarters,
  onPick,
  busy,
  alwaysCatch,
  onAlwaysCatch,
}: {
  sel: Species;
  rec?: DexRow;
  starters?: number[];
  shinyStarters: number[];
  onPick?: (species: number, shiny: boolean) => void;
  busy: boolean;
  alwaysCatch?: number[];
  onAlwaysCatch?: (species: number, on: boolean) => void;
}) {
  return (
    <section className="space-y-2 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
      <div className="flex flex-wrap items-center gap-3">
        <img src={dexPic(sel.id)} alt="" className="size-16 [image-rendering:pixelated]" draggable={false} />
        {rec?.shiny && <img src={dexPic(sel.id, true)} alt="Shiny" title="Shiny caught" className="size-16 [image-rendering:pixelated]" draggable={false} />}
        <div>
          <div className="font-semibold">
            No. {dexNo(sel.id)} {rec?.seen ? sel.name : '???'}
          </div>
          {rec?.seen && (
            <div className="mt-1 flex gap-1">
              {sel.types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
          )}
        </div>
        {onPick && starters?.includes(sel.id) && (
          <span className="flex w-full flex-wrap gap-2">
            <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40" disabled={busy} onClick={() => onPick(sel.id, false)}>
              Start with {sel.name}
            </button>
            {shinyStarters.includes(sel.id) && (
              <button className="rounded bg-yellow-500 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-yellow-400 hover:text-slate-900 active:scale-95 disabled:opacity-40" disabled={busy} onClick={() => onPick(sel.id, true)}>
                ★ Start with a shiny {sel.name}
              </button>
            )}
          </span>
        )}
      </div>
      {/* Always catch (the user's, 2026-11-20): caught whenever none is in the party, new or not, auto-catch on or off. */}
      {rec?.seen && onAlwaysCatch && (
        <label className="flex items-center gap-2 text-sm" title="Catch it whenever one is met and none is in your party, even if it isn't new or Auto-catch is off (with a full party, Stop catching still holds)">
          <input type="checkbox" checked={!!alwaysCatch?.includes(sel.id)} onChange={(e) => onAlwaysCatch(sel.id, e.target.checked)} />
          Always catch
        </label>
      )}
      {rec?.seen && (
        <p className="text-sm text-slate-300">
          The {sel.category} Pokémon. {(sel.height / 10).toFixed(1)} m, {(sel.weight / 10).toFixed(1)} kg. {sel.dexText}
        </p>
      )}
      {rec?.seen && (
        <div className="space-y-1 border-t border-slate-700 pt-2">
          <h3 className="text-sm font-semibold">Habitat</h3>
          <DexHabitat key={sel.id} species={sel.id} />
        </div>
      )}
      {rec?.caught && (
        <table className="w-full text-center text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-normal">Best</th>
              {STAT_NAMES.map((n) => (
                <th key={n} className="font-normal">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-left text-slate-500">IV</td>
              {rec.bestIv.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
            <tr>
              <td className="text-left text-slate-500">EV</td>
              {rec.bestEv.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
      {rec?.caught && (
        <div className="space-y-1 border-t border-slate-700 pt-2">
          <h3 className="text-sm font-semibold">Condition</h3>
          <ConditionFeeder key={sel.id} species={sel.id} />
        </div>
      )}
    </section>
  );
}
