import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTRPC } from '../lib/trpc';

export function HomePage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const createTest = useMutation(
    trpc.game.createTest.mutationOptions({
      onSuccess: ({ id }) => navigate({ to: '/game/$gameId', params: { gameId: id } }),
    }),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-24">
      <p className="text-slate-400">Test deck vs. a CPU opponent that only passes.</p>
      <button
        className="rounded bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
        disabled={createTest.isPending}
        onClick={() => createTest.mutate()}
      >
        {createTest.isPending ? 'Starting…' : 'Start test game'}
      </button>
      {createTest.error && <p className="text-sm text-red-400">{createTest.error.message}</p>}
    </div>
  );
}
