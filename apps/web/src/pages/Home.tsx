import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTRPC } from '../lib/trpc';

/** Play: battle the CPU with one of your decks (ones that follow the deck rules), or with the test deck. */
export function HomePage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const toGame = ({ id }: { id: string }) => navigate({ to: '/game/$gameId', params: { gameId: id } });
  const decks = useQuery(trpc.decks.list.queryOptions());
  const create = useMutation(trpc.game.create.mutationOptions({ onSuccess: toGame }));
  const createTest = useMutation(trpc.game.createTest.mutationOptions({ onSuccess: toGame }));
  const starting = create.isPending || createTest.isPending;
  const error = create.error?.message ?? createTest.error?.message;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Battle with your deck</h2>
        {decks.data?.length === 0 && (
          <p className="text-sm text-slate-400">
            You have no decks yet.{' '}
            <Link to="/decks" className="text-yellow-300 hover:underline">
              Build one
            </Link>
            .
          </p>
        )}
        <ul className="space-y-2">
          {decks.data?.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg bg-slate-900 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.name}</div>
                <div className={`truncate text-xs ${d.problems.length ? 'text-amber-300' : 'text-slate-400'}`}>
                  {d.problems[0] ?? `${d.cardCount} cards`}
                </div>
              </div>
              {d.problems.length ? (
                <Link to="/decks" className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600">
                  Edit
                </Link>
              ) : (
                <button
                  className="rounded bg-blue-600 px-4 py-1 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
                  disabled={starting}
                  onClick={() => create.mutate({ deckId: d.id })}
                >
                  Battle
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Test game</h2>
        <p className="text-sm text-slate-400">The built-in Base Set test deck against the CPU's Rock Crusher deck.</p>
        <button
          className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-50"
          disabled={starting}
          onClick={() => createTest.mutate()}
        >
          {createTest.isPending ? 'Starting…' : 'Start test game'}
        </button>
      </section>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
