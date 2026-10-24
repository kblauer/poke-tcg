import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCOUNT_NAME_LENGTH, accountNameInput } from '@poke-tcg/shared';
import { useState } from 'react';
import { useTRPC } from '../lib/trpc';
import { BUTTON as button } from '../utils/styles';

/**
 * The account's name (community.accountName), with Change to edit it (any name: it isn't unique). It's what other players
 * see on its Community Decks; the Google profile's name is never shown. With no name yet, the box is open at once.
 * `label`: the words before the name.
 */
export function AccountNameField({ label = 'Shared as' }: { label?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const name = useQuery(trpc.community.accountName.queryOptions());
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation(
    trpc.community.setAccountName.mutationOptions({
      onSuccess: ({ name: saved }) => {
        queryClient.setQueryData(trpc.community.accountName.queryKey(), saved);
        // Its published decks show the new name.
        queryClient.invalidateQueries({ queryKey: trpc.community.list.queryKey() });
        setDraft(null);
      },
    }),
  );
  if (name.data === undefined) return null;
  const editing = draft ?? (name.data === null ? '' : null);
  // Checked here too, so the rules' message shows rather than the API's.
  const invalid = editing ? accountNameInput.safeParse({ name: editing }).error?.issues[0]?.message : undefined;
  if (editing === null) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        {label} <span className="font-semibold text-slate-100">{name.data}</span>
        <button className="rounded bg-slate-700 px-2 text-xs leading-5 hover:bg-slate-600" onClick={() => setDraft(name.data ?? '')}>
          Change
        </button>
      </p>
    );
  }
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ name: editing });
      }}
    >
      <label className="block whitespace-normal text-xs text-slate-400">
        {name.data === null ? 'Choose an account name (shown to other players instead of your real name; others may use the same one)' : 'Account name'}
      </label>
      <span className="flex gap-2">
        <input
          autoFocus={name.data !== null}
          maxLength={ACCOUNT_NAME_LENGTH}
          className="min-w-0 flex-1 rounded bg-slate-900 px-2 py-1 text-sm ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
          value={editing}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Account name"
        />
        <button type="submit" className={button} disabled={!editing.trim() || !!invalid || save.isPending}>
          Save
        </button>
        {name.data !== null && (
          <button type="button" className={button} onClick={() => setDraft(null)}>
            Cancel
          </button>
        )}
      </span>
      {editing.trim() && invalid && <p className="text-xs text-amber-300">{invalid}</p>}
      {save.error && <p className="text-xs text-red-400">{save.error.message}</p>}
    </form>
  );
}
