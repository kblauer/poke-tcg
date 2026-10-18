import { DECK_NAME_LENGTH } from '@poke-tcg/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ClientRun } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';

/**
 * After a run: save the run's deck as it ended (the automatic run deck, with its trades and switches) as one of your
 * decks, under a name filled in with the run's number and type. Unsaved, the next run takes the run deck over.
 * `saveName` is the default name, or null once the deck is saved (or there's none to save).
 */
export function SaveRunDeck({ current, saveName }: { current: ClientRun; saveName: string | null }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(saveName ?? '');
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const save = useMutation(
    trpc.run.saveDeck.mutationOptions({
      onSuccess: () => {
        setSavedAs(name.trim());
        queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
      },
    }),
  );
  if (savedAs) {
    return <p className="rounded-lg bg-slate-800 px-5 py-3 text-sm text-emerald-300 ring-1 ring-slate-600">Saved the run's deck as “{savedAs}” on the Collection tab.</p>;
  }
  if (saveName === null) return null;
  return (
    <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      <div>
        <h3 className="text-lg font-semibold">Save the run's deck</h3>
        <p className="text-sm text-slate-400">
          Keep the {current.view.deck.length}-card deck you finished with (trades included) as one of your decks. If you don't, your next run's deck takes
          its place.
        </p>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate({ runId: current.id, name: name.trim() });
        }}
      >
        <input
          className="min-w-48 flex-1 rounded bg-slate-900 px-3 py-2 text-sm ring-1 ring-slate-600 focus:outline-none focus:ring-yellow-300"
          value={name}
          maxLength={DECK_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          aria-label="Deck name"
        />
        <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40" disabled={save.isPending || !name.trim()}>
          {save.isPending ? 'Saving…' : 'Save deck'}
        </button>
      </form>
      {save.error && <p className="text-sm text-red-400">{save.error.message}</p>}
    </section>
  );
}
