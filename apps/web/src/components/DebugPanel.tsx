import { CPU_DIFFICULTIES, CPU_DIFFICULTY_LABELS, lookupCard, type CpuDifficulty, type DebugCommand, type EnergyType, type InPlayPokemon, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../lib/trpc';
import { EnergyIcon } from './EnergyIcon';

/** Base Set Energy cards, for one-click adding. */
const ENERGY: { id: string; name: string; type: EnergyType }[] = [
  { id: 'base1-98', name: 'Fire', type: 'fire' },
  { id: 'base1-102', name: 'Water', type: 'water' },
  { id: 'base1-99', name: 'Grass', type: 'grass' },
  { id: 'base1-100', name: 'Lightning', type: 'lightning' },
  { id: 'base1-101', name: 'Psychic', type: 'psychic' },
  { id: 'base1-97', name: 'Fighting', type: 'fighting' },
  { id: 'base1-96', name: 'Double Colorless', type: 'colorless' },
];

const MAX_RESULTS = 30;
const button = 'rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95 disabled:opacity-40';
const heading = 'mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/**
 * Testing cheats, in the game log's Debug tab: change the CPU's difficulty, draw a card, put any card or
 * an Energy into your hand, set the HP of any Pokémon in play. Only loaded in builds with the debug tools (see utils/debug.ts);
 * the API runs the commands (debug.run) and refuses them in production.
 */
export default function DebugPanel({ gameId, view }: { gameId: string; view: PlayerView }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewKey = trpc.game.view.queryOptions({ gameId }).queryKey;
  const run = useMutation(
    trpc.debug.run.mutationOptions({
      onSuccess: (next) => queryClient.setQueryData(viewKey, (old) => old && { ...old, view: next }),
      onError: () => queryClient.invalidateQueries({ queryKey: viewKey }),
    }),
  );
  const busy = run.isPending;
  const send = (command: DebugCommand) => {
    if (!busy) run.mutate({ gameId, expectedVersion: view.version, command });
  };

  const [search, setSearch] = useState('');
  const cards = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity, enabled: search.trim().length > 0 });
  const query = search.trim().toLowerCase();
  const results = query ? (cards.data ?? []).filter((c) => c.name.toLowerCase().includes(query)).slice(0, MAX_RESULTS) : [];

  const inPlay = (side: 'self' | 'opponent') => {
    const owner = side === 'self' ? view.self : view.opponent;
    return [owner.active, ...owner.bench].flatMap((p, i) => (p ? [{ side, target: (i === 0 ? 'active' : i - 1) as Target, pokemon: p }] : []));
  };

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-xs">
      {run.error && <p className="rounded bg-red-400 px-2 py-1 font-medium text-slate-900">{run.error.message}</p>}

      <section>
        <h4 className={heading}>CPU difficulty</h4>
        <select
          value={view.cpuDifficulty}
          disabled={busy}
          onChange={(e) => send({ type: 'SET_CPU_DIFFICULTY', difficulty: e.target.value as CpuDifficulty })}
          aria-label="CPU difficulty"
          className="w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-40"
        >
          {CPU_DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {CPU_DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h4 className={heading}>Deck</h4>
        <button className={button} disabled={busy || view.self.deckCount === 0} onClick={() => send({ type: 'DRAW' })}>
          Draw a card ({view.self.deckCount} left)
        </button>
      </section>

      <section>
        <h4 className={heading}>Add Energy to hand</h4>
        <div className="flex flex-wrap gap-1">
          {ENERGY.map((e) => (
            <button key={e.id} className={`${button} flex items-center gap-1`} disabled={busy} onClick={() => send({ type: 'ADD_TO_HAND', defId: e.id })}>
              <EnergyIcon type={e.type} />
              {e.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4 className={heading}>Add a card to hand</h4>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        {query && (
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
            {cards.isLoading && <li className="text-slate-500">Loading cards…</li>}
            {cards.data && results.length === 0 && <li className="text-slate-500">No cards match.</li>}
            {results.map((c) => (
              <li key={c.id}>
                <button className={`${button} w-full`} disabled={busy} onClick={() => send({ type: 'ADD_TO_HAND', defId: c.id })}>
                  {c.name} <span className="text-slate-400">· {c.setName} {c.number}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className={heading}>Set HP</h4>
        <div className="space-y-1">
          {[...inPlay('self'), ...inPlay('opponent')].map(({ side, target, pokemon }) => (
            // Keyed by damage too, so the field resets to the current HP whenever it changes.
            <HpRow key={`${side}-${String(target)}-${pokemon.card.uid}-${pokemon.damage}`} view={view} side={side} target={target} pokemon={pokemon} busy={busy} send={send} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** One Pokémon in play: its HP left, editable in steps of 10 (10 up to its max). */
function HpRow({
  view,
  side,
  target,
  pokemon,
  busy,
  send,
}: {
  view: PlayerView;
  side: 'self' | 'opponent';
  target: Target;
  pokemon: InPlayPokemon;
  busy: boolean;
  send: (command: DebugCommand) => void;
}) {
  const def = lookupCard(view.cards, pokemon.card.defId);
  const max = def.kind === 'pokemon' ? def.hp : 0;
  const current = max - pokemon.damage;
  const [hp, setHp] = useState(String(current));
  const value = Number(hp);
  const valid = Number.isInteger(value) && value % 10 === 0 && value >= 10 && value <= max;
  return (
    <div className="flex items-center gap-1">
      <span className="min-w-0 flex-1 truncate" title={def.name}>
        <span className={side === 'self' ? 'text-sky-300' : 'text-rose-300'}>{side === 'self' ? 'You' : 'CPU'}</span> {def.name}{' '}
        <span className="text-slate-500">({target === 'active' ? 'active' : `bench ${target + 1}`})</span>
      </span>
      <input
        type="number"
        min={10}
        max={max}
        step={10}
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        aria-label={`HP for ${def.name}`}
        className="w-14 rounded bg-slate-800 px-1 py-0.5 text-right text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
      <span className="text-slate-500">/{max}</span>
      <button className={button} disabled={busy || !valid || value === current} onClick={() => send({ type: 'SET_HP', side, target, hp: value })}>
        Set
      </button>
    </div>
  );
}
