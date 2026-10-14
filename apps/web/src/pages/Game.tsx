import {
  canPayCost,
  getCard,
  type CardInstance,
  type GameAction,
  type InPlayPokemon,
  type PlayerView,
  type PokemonCardDef,
} from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useTRPC } from '../lib/trpc';

export function GamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewQuery = trpc.game.view.queryOptions({ gameId });
  const { data, error } = useQuery(viewQuery);

  // The response already includes the CPU's reply, so no polling or realtime is needed.
  const act = useMutation(
    trpc.game.act.mutationOptions({
      onSuccess: (view) => queryClient.setQueryData(viewQuery.queryKey, (old) => old && { ...old, view }),
      onError: () => queryClient.invalidateQueries({ queryKey: viewQuery.queryKey }),
    }),
  );

  if (error) return <p className="text-red-400">{error.message}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const view = data.view;
  // One move at a time: a second click would be built on a stale version and rejected.
  const send = (action: GameAction) => {
    if (!act.isPending) act.mutate({ gameId, expectedVersion: view.version, action });
  };
  const pending = act.isPending ? act.variables.action : null;
  return <Board view={view} send={send} pending={pending} error={act.error?.message} />;
}

/** Card the in-flight action is about, so only that card shows a loading state. */
function pendingCardUid(action: GameAction | null) {
  return action && 'cardUid' in action ? action.cardUid : null;
}

function Board({
  view,
  send,
  pending,
  error,
}: {
  view: PlayerView;
  send: (a: GameAction) => void;
  /** The action waiting on the server, if any. */
  pending: GameAction | null;
  error?: string;
}) {
  const busy = pending !== null;
  const pendingUid = pendingCardUid(pending);
  const { self, opponent, phase } = view;
  const myTurn = phase === 'playing' && view.currentPlayer === view.you;
  const mustPromote = phase === 'promote' && view.pendingPromotion === view.you;

  const status =
    phase === 'finished'
      ? view.winner === view.you
        ? 'You win!'
        : 'You lose.'
      : phase === 'setup'
        ? self.active
          ? 'Waiting for the CPU to choose an active Pokémon…'
          : 'Choose a Basic Pokémon from your hand as your active.'
        : mustPromote
          ? 'Choose a benched Pokémon to promote.'
          : myTurn
            ? `Your turn (turn ${view.turn})`
            : "CPU's turn";

  function onHandCard(card: CardInstance) {
    const def = getCard(card.defId);
    if (phase === 'setup' && def.kind === 'pokemon' && !self.active) send({ type: 'SET_ACTIVE', cardUid: card.uid });
    else if (myTurn && def.kind === 'pokemon') send({ type: 'PLAY_BENCH', cardUid: card.uid });
    else if (myTurn && def.kind === 'energy' && !view.energyAttachedThisTurn)
      send({ type: 'ATTACH_ENERGY', cardUid: card.uid, target: 'active' });
  }

  return (
    <div className={`space-y-4 ${busy ? 'cursor-progress' : ''}`}>
      <div className="flex items-center justify-between rounded bg-slate-900 p-3">
        <span className="font-semibold">{status}</span>
        <div className="flex gap-2">
          {myTurn && (
            <button
              className="rounded bg-blue-600 px-3 py-1 transition hover:bg-blue-500 active:scale-95 disabled:cursor-progress"
              disabled={busy}
              onClick={() => send({ type: 'END_TURN' })}
            >
              {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
            </button>
          )}
          {phase !== 'finished' && (
            <button
              className="rounded bg-slate-700 px-3 py-1 transition hover:bg-slate-600 active:scale-95 disabled:cursor-progress"
              disabled={busy}
              onClick={() => send({ type: 'CONCEDE' })}
            >
              Concede
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <Side
        label={`CPU · hand ${opponent.handCount} · deck ${opponent.deckCount} · prizes ${opponent.prizeCount}`}
        active={opponent.active}
        bench={opponent.bench}
      />
      <Side
        label={`You · deck ${self.deckCount} · prizes ${self.prizeCount}`}
        active={self.active}
        bench={self.bench}
        onBench={mustPromote ? (i) => send({ type: 'PROMOTE', benchIndex: i }) : undefined}
        attacks={myTurn && view.turn > 1 ? (i) => send({ type: 'ATTACK', attackIndex: i }) : undefined}
        pending={pending}
      />

      <div>
        <h3 className="mb-2 text-sm text-slate-400">Your hand</h3>
        <div className="flex flex-wrap gap-2">
          {self.hand.map((c) => (
            <button
              key={c.uid}
              onClick={() => onHandCard(c)}
              disabled={busy}
              className={`rounded-lg transition active:scale-95 disabled:cursor-progress ${
                c.uid === pendingUid
                  ? '-translate-y-2 animate-pulse ring-2 ring-yellow-300'
                  : busy
                    ? ''
                    : 'hover:-translate-y-1'
              }`}
            >
              <Card card={c} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Side({
  label,
  active,
  bench,
  onBench,
  attacks,
  pending = null,
}: {
  label: string;
  active: InPlayPokemon | null;
  bench: InPlayPokemon[];
  onBench?: (index: number) => void;
  attacks?: (index: number) => void;
  pending?: GameAction | null;
}) {
  const busy = pending !== null;
  const activeDef = active && (getCard(active.card.defId) as PokemonCardDef);
  return (
    <section className="rounded-lg bg-slate-900 p-3">
      <h3 className="mb-2 text-sm text-slate-400">{label}</h3>
      <div className="flex items-start gap-6">
        <div>
          {active ? <Card card={active.card} inPlay={active} /> : <EmptySlot />}
          {attacks && active && activeDef && (
            <div className="mt-2 flex flex-col gap-1">
              {activeDef.attacks.map((a, i) => (
                <button
                  key={a.name}
                  disabled={busy || !canPayCost(active, a)}
                  onClick={() => attacks(i)}
                  className={`rounded bg-red-600 px-2 py-1 text-xs transition hover:bg-red-500 active:scale-95 ${
                    pending?.type === 'ATTACK' && pending.attackIndex === i
                      ? 'animate-pulse ring-2 ring-yellow-300'
                      : canPayCost(active, a)
                        ? 'disabled:cursor-progress'
                        : 'disabled:opacity-40'
                  }`}
                >
                  {a.name} ({a.damage})
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {bench.map((p, i) => (
            <button
              key={p.card.uid}
              disabled={!onBench || busy}
              onClick={() => onBench?.(i)}
              className={`rounded-lg transition active:scale-95 ${
                pending?.type === 'PROMOTE' && pending.benchIndex === i
                  ? 'animate-pulse ring-2 ring-yellow-300'
                  : onBench
                    ? 'ring-2 ring-yellow-400'
                    : ''
              }`}
            >
              <Card card={p.card} inPlay={p} small />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const TYPE_COLORS: Record<string, string> = {
  fire: 'bg-orange-700',
  water: 'bg-sky-700',
  grass: 'bg-green-700',
  lightning: 'bg-yellow-600',
};

function Card({ card, inPlay, small }: { card: CardInstance; inPlay?: InPlayPokemon; small?: boolean }) {
  const def = getCard(card.defId);
  const type = def.kind === 'pokemon' ? def.type : def.energyType;
  return (
    <div
      className={`${TYPE_COLORS[type] ?? 'bg-slate-700'} ${small ? 'h-28 w-20' : 'h-36 w-26'} flex flex-col justify-between rounded-lg border-2 border-yellow-200/60 p-2 text-left text-xs shadow`}
    >
      <span className="font-semibold">{def.name}</span>
      {def.kind === 'pokemon' && (
        <span>
          HP {def.hp - (inPlay?.damage ?? 0)}/{def.hp}
        </span>
      )}
      {inPlay && inPlay.energy.length > 0 && <span>⚡×{inPlay.energy.length}</span>}
    </div>
  );
}

function EmptySlot() {
  return <div className="h-36 w-26 rounded-lg border-2 border-dashed border-slate-700" />;
}
