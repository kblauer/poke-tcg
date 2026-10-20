import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import { boss, bossLabel, bossTypes, generation, RUN_TYPES, type BossId, type RunTypeId } from '@poke-tcg/campaign';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { Overview, RunControl } from '../../hooks/useRun';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { EnergyIcon } from '../EnergyIcon';

type RunTypeInfo = Overview['runTypes'][number];

const typeName = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** A boss's overworld sprite from the remake of their game (FireRed/LeafGreen for Kanto), drawn at 3× with crisp pixels. */
function BossSprite({ id, scale = 3 }: { id: BossId; scale?: number }) {
  const b = boss(id);
  return <img src={`/trainers/${id}.png`} alt={b.name} title={bossLabel(b)} style={{ height: 20 * scale }} className="w-auto shrink-0 [image-rendering:pixelated]" draggable={false} />;
}

/**
 * One run type to pick: its final boss's sprite, its name, and who it ends with. A single-gym run shows its gym leader
 * and the types their deck is built around (bossTypes); a longer run a row of all its bosses. Beaten runs are ticked (Badge),
 * locked ones say what unlocks them and can't be picked.
 */
function RunTypeOption({ info, selected, onPick }: { info: RunTypeInfo; selected: boolean; onPick: () => void }) {
  const ids = RUN_TYPES[info.id].segments.flatMap((s) => s.bosses);
  const last = boss(ids.at(-1)!);
  const locked = info.locked !== null;
  return (
    <li>
      <button
        role="radio"
        aria-checked={selected}
        disabled={locked}
        onClick={onPick}
        className={`flex h-full w-full items-center gap-3 rounded-lg px-3 py-2 text-left ring-1 transition ${
          selected ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500'
        } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:ring-slate-700`}
      >
        <span className={`flex w-12 justify-center ${locked ? 'brightness-50 grayscale' : ''}`}>
          <BossSprite id={ids.at(-1)!} />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{info.name}</span>
            {info.beaten > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-emerald-300" title={`Beaten ${info.beaten} time${info.beaten === 1 ? '' : 's'}`}>
                <CheckCircleIcon sx={{ fontSize: 14 }} />
                {info.beaten > 1 ? `Badge ×${info.beaten}` : 'Badge'}
              </span>
            )}
          </span>
          {locked ? (
            <span className="flex items-center gap-1 text-xs text-amber-300">
              <LockIcon sx={{ fontSize: 13 }} />
              {info.locked}
            </span>
          ) : ids.length === 1 ? (
            <>
              <span className="block truncate text-xs text-slate-300">
                {bossLabel(last)}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-sky-300">
                {bossTypes(last).map((t) => (
                  <span key={t} className="flex items-center gap-1">
                    <EnergyIcon type={t} size="sm" />
                    {typeName(t)}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <>
              <span className="block truncate text-xs text-slate-300">{info.bosses}</span>
              <span className="flex flex-wrap items-end gap-0.5">
                {ids.map((id) => (
                  <BossSprite key={id} id={id} scale={1} />
                ))}
              </span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Picks the next run's type and one of your decks (built on the Collection tab), then starts it. Run types are buttons
 * (RunTypeOption) for the generation picked in the dropdown (Gen 1 · Kanto, Gen 2 · Johto…); locked ones can't be picked. Decks that break the rules or hold cards you haven't
 * unlocked are listed with why, and can't be picked.
 */
export function NewRunPicker({ overview: given, run, title, defaultType }: { overview: Overview; run: RunControl; title: string; defaultType?: RunTypeId }) {
  // Debug mode unlocks every run type (started with debugStart); `debugLocked`: the ones that were locked.
  const debug = useDebugEnabled();
  const unlockAll = DEBUG_BUILD && debug;
  const debugLocked = new Set(unlockAll ? given.runTypes.filter((t) => t.locked !== null).map((t) => t.id) : []);
  const overview = unlockAll ? { ...given, runTypes: given.runTypes.map((t) => ({ ...t, locked: null })) } : given;
  const open = overview.runTypes.filter((t) => t.locked === null);
  const [type, setType] = useState<RunTypeId>(open.find((t) => t.id === defaultType)?.id ?? open[0]?.id ?? overview.runTypes[0]!.id);
  // The generation dropdown shows one generation's runs at a time, starting with the picked run's.
  const generations = [...new Set(overview.runTypes.map((t) => RUN_TYPES[t.id].generation))];
  const [gen, setGen] = useState(RUN_TYPES[type].generation);
  const shown = overview.runTypes.filter((t) => RUN_TYPES[t.id].generation === gen);
  const pickGeneration = (g: number) => {
    setGen(g);
    const runs = overview.runTypes.filter((t) => RUN_TYPES[t.id].generation === g);
    setType((runs.find((t) => t.locked === null) ?? runs[0])!.id);
  };
  const playable = overview.decks.filter((d) => d.problems.length === 0);
  const [picked, setPicked] = useState<string | null>(null);
  const deckId = picked ?? playable[0]?.id ?? null;
  const chosen = overview.runTypes.find((t) => t.id === type);
  return (
    <section className="space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="@container space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-400">Run</span>
          <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            Generation
            <select
              className="rounded bg-slate-900 px-2 py-1 text-sm text-slate-100 ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
              value={gen}
              onChange={(e) => pickGeneration(Number(e.target.value))}
            >
              {generations.map((g) => (
                <option key={g} value={g}>
                  Gen {g} · {generation(g).region}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul role="radiogroup" aria-label={`${generation(gen).region} runs`} className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
          {shown.map((t) => (
            <RunTypeOption key={t.id} info={t} selected={t.id === type} onPick={() => setType(t.id)} />
          ))}
        </ul>
      </div>
      {chosen && <p className="text-sm text-slate-400">{chosen.description}</p>}

      <div className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-slate-400">Deck</span>
          <Link to="/decks" className="text-xs text-yellow-300 hover:underline">
            Build or edit decks
          </Link>
        </div>
        <ul role="radiogroup" className="space-y-1">
          {overview.decks.map((d) => {
            const ok = d.problems.length === 0;
            const selected = d.id === deckId;
            return (
              <li key={d.id}>
                <button
                  role="radio"
                  aria-checked={selected}
                  disabled={!ok}
                  onClick={() => setPicked(d.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ring-1 transition ${
                    selected ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500'
                  } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:ring-slate-700`}
                >
                  <span className={`h-3 w-3 shrink-0 rounded-full ring-2 ${selected ? 'bg-yellow-300 ring-yellow-300' : 'ring-slate-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className={`block truncate text-xs ${ok ? 'text-slate-400' : 'text-amber-300'}`}>{d.problems[0] ?? `${d.cardCount} cards`}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {playable.length === 0 && <p className="text-xs text-amber-300">None of your decks can be played yet: fix one on the Collection tab.</p>}
      </div>

      <p className="text-xs text-slate-500">The new run starts with ₱500 and 3 HP.</p>
      <button
        className="rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40"
        disabled={run.busy || !deckId || chosen?.locked !== null}
        onClick={() => deckId && run.start(type, deckId, debugLocked.has(type))}
      >
        Start the run
      </button>
    </section>
  );
}
