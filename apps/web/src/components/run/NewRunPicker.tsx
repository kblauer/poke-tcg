import type { RunTypeId } from '@poke-tcg/campaign';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { Overview, RunControl } from '../../hooks/useRun';

/**
 * Picks the next run's type and one of your decks (built on the Decks tab), then starts it. Decks that
 * break the rules or hold cards you haven't unlocked are listed with why, and can't be picked.
 */
export function NewRunPicker({ overview, run, title, defaultType }: { overview: Overview; run: RunControl; title: string; defaultType?: RunTypeId }) {
  const [type, setType] = useState<RunTypeId>(defaultType ?? overview.runTypes[0]!.id);
  const playable = overview.decks.filter((d) => d.problems.length === 0);
  const [picked, setPicked] = useState<string | null>(null);
  const deckId = picked ?? playable[0]?.id ?? null;
  const chosen = overview.runTypes.find((t) => t.id === type);
  return (
    <section className="space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      <h3 className="text-lg font-semibold">{title}</h3>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">Run</span>
        <select
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
          value={type}
          onChange={(e) => setType(e.target.value as RunTypeId)}
        >
          {overview.runTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.bosses})
            </option>
          ))}
        </select>
      </label>
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
        {playable.length === 0 && <p className="text-xs text-amber-300">None of your decks can be played yet: fix one on the Decks tab.</p>}
      </div>

      <p className="text-xs text-slate-500">The new run starts with ₱500 and 3 HP.</p>
      <button
        className="rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40"
        disabled={run.busy || !deckId}
        onClick={() => deckId && run.start(type, deckId)}
      >
        Start the run
      </button>
    </section>
  );
}
