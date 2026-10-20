import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DECK_CODE_LENGTH, DECK_DESCRIPTION_LENGTH } from '@poke-tcg/shared';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTRPC } from '../lib/trpc';
import { AccountNameField } from './AccountMenu';

const button = 'rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500 disabled:opacity-40';
const field = 'w-full rounded bg-slate-900 p-2 text-xs text-slate-100 ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400';

/** A centred dialog over the page (the shared dialog style); a click outside it or Escape closes it. */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} className="w-full max-w-lg space-y-3 rounded-lg bg-slate-800 p-4 text-sm ring-1 ring-slate-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button className="rounded px-2 text-slate-400 hover:bg-slate-700 hover:text-slate-100" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A Copy button for the text, saying Copied for a moment once it is. */
export function CopyButton({ text, label = 'Copy', className = button }: { text: string | undefined; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={className}
      disabled={!text}
      onClick={() =>
        text &&
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

/**
 * Sharing a saved deck: its share code to copy and send (decks.exportCode; holos as their non-holo versions), and
 * publishing it to the Community Decks tab with a description (a snapshot: later changes to the deck don't change it).
 * `problem`: why it can't be published (only a deck that follows the rules can).
 */
export function ShareDeckDialog({ deckId, name, problem, onClose }: { deckId: string; name: string; problem: string | undefined; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const code = useQuery(trpc.decks.exportCode.queryOptions({ deckId }));
  const [description, setDescription] = useState('');
  // Decks are published under the account name, so one must be chosen first.
  const accountName = useQuery(trpc.community.accountName.queryOptions());
  const publish = useMutation(trpc.community.publish.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.community.list.queryKey() }) }));
  return (
    <Dialog title={`Share ${name}`} onClose={onClose}>
      <div className="space-y-2">
        <p className="text-slate-400">Send this code to another player: they import it with Import on their Collection tab. Holo cards are listed as their non-holo versions, and whoever imports it gets as many of their own holos as they have.</p>
        <textarea readOnly rows={3} className={`${field} font-mono`} value={code.data?.code ?? (code.error ? '' : 'Making the code…')} onFocus={(e) => e.target.select()} aria-label="Deck code" />
        {code.error && <p className="text-xs text-red-400">{code.error.message}</p>}
        <CopyButton text={code.data?.code} label="Copy code" />
      </div>
      <div className="space-y-2 border-t border-slate-700 pt-3">
        <h4 className="font-semibold">Publish to Community Decks</h4>
        {publish.isSuccess ? (
          <p className="text-emerald-400">
            Published.{' '}
            <Link to="/community" className="text-yellow-300 hover:underline">
              See it on Community Decks
            </Link>
          </p>
        ) : (
          <>
            <p className="text-slate-400">Everyone can see and import it, with your account name. It's the deck as it is now: later changes to it aren't published.</p>
            <AccountNameField />
            <textarea rows={3} maxLength={DECK_DESCRIPTION_LENGTH} className={field} placeholder="How it plays (optional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
            {problem && <p className="text-xs text-amber-300">Only a finished deck can be published: {problem}</p>}
            {publish.error && <p className="text-xs text-red-400">{publish.error.message}</p>}
            <button className={`${button} bg-emerald-600 font-semibold hover:bg-emerald-500`} disabled={!!problem || !accountName.data || publish.isPending} onClick={() => publish.mutate({ deckId, description: description.trim() })}>
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Importing a deck from a share code or a text deck list ("4 Lickitung JU 38", decks.importCode): it's saved as a new deck, even with cards the account hasn't
 * unlocked (it can't be played until they are), with as many of the account's own holos as it has. `onImported` gets
 * the new deck's id once the deck list has it.
 */
export function ImportDeckDialog({ onClose, onImported }: { onClose: () => void; onImported: (deckId: string, locked: boolean) => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const importCode = useMutation(
    trpc.decks.importCode.mutationOptions({
      onSuccess: async ({ id, locked }) => {
        await queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey(), refetchType: 'all' });
        onImported(id, locked);
      },
    }),
  );
  return (
    <Dialog title="Import a deck" onClose={onClose}>
      <p className="text-slate-400">
        Paste a deck code from another player or a deck list (a line per card, like "4 Lickitung JU 38"), or find decks on the{' '}
        <Link to="/community" className="text-yellow-300 hover:underline">
          Community Decks
        </Link>{' '}
        tab. Cards you haven't unlocked stay in the deck, but it can't be played until you have them.
      </p>
      <textarea autoFocus rows={8} maxLength={DECK_CODE_LENGTH} className={`${field} font-mono`} placeholder={'PTCG1.…\n\nor\n\n4 Lickitung JU 38\n3 Scyther JU 10\n…'} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Deck code or list" />
      {importCode.error && <p className="text-xs text-red-400">{importCode.error.message}</p>}
      <button className={`${button} bg-emerald-600 font-semibold hover:bg-emerald-500`} disabled={!code.trim() || importCode.isPending} onClick={() => importCode.mutate({ code })}>
        {importCode.isPending ? 'Importing…' : 'Import'}
      </button>
    </Dialog>
  );
}
