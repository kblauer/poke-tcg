import { SPECIES, STAT_NAMES } from '@poke-tcg/idle';
import { useState } from 'react';
import type { IdleOverview } from '../../hooks/useIdle';
import { TypeBadge } from './PartyScreen';

type DexRow = IdleOverview['dex'][number];

/**
 * The account's Pokédex (README: Idle Adventure; agreed with the user): Kanto's 151 in order with the game's sprites,
 * seen and caught, and for each caught species the best IV and EV ever had in each stat. With `onPick`, it's where a new
 * run's starter is picked from (`starters`: the species allowed).
 */
export function Pokedex({ dex, starters, onPick, busy = false }: { dex: DexRow[]; starters?: number[]; onPick?: (species: number) => void; busy?: boolean }) {
  const byId = new Map(dex.map((d) => [d.species, d]));
  const [open, setOpen] = useState<number | null>(null);
  const caught = dex.filter((d) => d.caught).length;
  const seen = dex.filter((d) => d.seen).length;
  const sel = open !== null ? SPECIES[open - 1] : null;
  const rec = open !== null ? byId.get(open) : undefined;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Seen {seen} · Caught {caught} of {SPECIES.length}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
        {SPECIES.map((s) => {
          const d = byId.get(s.id);
          const pickable = starters?.includes(s.id);
          return (
            <li key={s.id}>
              <button
                className={`flex w-full flex-col items-center rounded p-1 text-[10px] ring-1 transition hover:bg-slate-700 ${open === s.id ? 'bg-slate-700 ring-yellow-300' : pickable ? 'bg-slate-800 ring-emerald-500/60' : 'bg-slate-800 ring-slate-700'}`}
                onClick={() => setOpen(open === s.id ? null : s.id)}
                title={d?.seen ? s.name : '???'}
              >
                <img
                  src={`/idle/gen1/pokemon/front/${s.id}.png`}
                  alt=""
                  className={`size-12 [image-rendering:pixelated] ${d?.caught ? '' : d?.seen ? 'opacity-60 grayscale' : 'opacity-40 brightness-0'}`}
                  draggable={false}
                />
                <span className="text-slate-500">{String(s.id).padStart(3, '0')}</span>
                <span className="truncate text-slate-200">{d?.seen ? s.name : '???'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {sel && (
        <section className="space-y-2 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <img src={`/idle/gen1/pokemon/front/${sel.id}.png`} alt="" className="size-16 [image-rendering:pixelated]" draggable={false} />
            <div>
              <div className="font-semibold">
                No. {String(sel.id).padStart(3, '0')} {rec?.seen ? sel.name : '???'}
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
              <button className="ml-auto rounded bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40" disabled={busy} onClick={() => onPick(sel.id)}>
                Start with {sel.name}
              </button>
            )}
          </div>
          {rec?.seen && (
            <p className="text-sm text-slate-300">
              The {sel.category} Pokémon. {(sel.height / 10).toFixed(1)} m, {(sel.weight / 10).toFixed(1)} kg. {sel.dexText}
            </p>
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
        </section>
      )}
    </div>
  );
}
