import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { flairFor, holoPattern, ownPattern, type FlairSlot } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFlairList } from '../hooks/useFlair';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import type { CatalogCard } from '../utils/cardList';

/** Each slot's heading and what its flair is called. */
const SLOTS: Record<FlairSlot, { title: string; noun: string }> = { pattern: { title: 'Holo pattern', noun: 'pattern' }, border: { title: 'Border', noun: 'border' } };

/**
 * The card view's card flair in one slot, for a card that can be given any (flairFor): a holo's patterns, a low-rarity
 * card's borders. A box that expands from its heading (the slot and what's in use; closed by default, and closing it
 * drops its preview) to Default (the card's own look) and each option as a chip; clicking one previews it on the card
 * above (`preview`: its key, null for Default, undefined for none: the one in use). Then Use switches to one the account
 * has for this card, for nothing, and Buy buys one it hasn't for its Stardust (shown on its chip) and switches to it.
 * Only an unlocked card buys flair.
 */
export function FlairPicker({
  card,
  slot,
  locked,
  preview,
  onPreview,
}: {
  card: CatalogCard;
  slot: FlairSlot;
  locked: boolean;
  preview: string | null | undefined;
  onPreview: (key: string | null | undefined) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  /** Expanded to its options; closed (the default) it's only its heading and what's in use. */
  const [open, setOpen] = useState(false);
  const flair = useFlairList();
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  const { isLocked } = useUnlocked();
  const unlocked = !locked && !isLocked(card);
  const done = () => {
    onPreview(undefined);
    return queryClient.invalidateQueries({ queryKey: trpc.flair.list.queryKey() });
  };
  const buy = useMutation(
    trpc.flair.buy.mutationOptions({
      onSuccess: ({ stardust: left }) => {
        queryClient.setQueryData(trpc.packs.stardust.queryKey(), left);
        return done();
      },
    }),
  );
  const equip = useMutation(trpc.flair.equip.mutationOptions({ onSuccess: done }));
  const options = flairFor(card, slot);
  if (!options.length || !flair.data) return null;

  const { title, noun } = SLOTS[slot];
  const previewed = options.find((o) => o.key === shown);
  const price = previewed?.price ?? 0;
  const mine = (f: { cardId: string; slot: string }) => f.cardId === card.id && f.slot === slot;
  const owned = new Set(flair.data.owned.filter(mine).map((f) => f.key));
  const inUse = flair.data.equipped.find(mine)?.key ?? null;
  const shown = preview === undefined ? inUse : preview;
  const has = shown === null || owned.has(shown);
  const pending = buy.isPending || equip.isPending;
  const error = buy.error?.message ?? equip.error?.message;
  const blocked = has ? null : !unlocked ? 'Unlock this card first' : stardust.data !== undefined && stardust.data < price ? `The ${previewed?.label} ${noun} takes ${price} Stardust` : null;
  // One not had yet shows its price after its name.
  const chip = (key: string | null, label: string, cost?: number) => (
    <button
      key={key ?? 'default'}
      className={`rounded px-2 py-1 text-xs ring-1 transition active:scale-95 ${shown === key ? 'bg-yellow-300/15 text-yellow-200 ring-yellow-300/70' : key === null || owned.has(key) ? 'bg-slate-700 text-slate-100 ring-slate-600 hover:bg-slate-600' : 'bg-slate-800 text-slate-400 ring-slate-700 hover:bg-slate-700 hover:text-slate-200'}`}
      aria-pressed={shown === key}
      title={key === null || owned.has(key) ? undefined : `${cost} Stardust`}
      onClick={() => onPreview(key === inUse ? undefined : key)}
    >
      {key === inUse && '✓ '}
      {label}
      {key !== null && !owned.has(key) && <span className="ml-1 tabular-nums text-sky-200/70">{cost}</span>}
    </button>
  );
  const defaultLabel = slot === 'pattern' ? `Default (${holoPattern(ownPattern(card))!.label})` : 'Default';
  const toggle = () => {
    // Closing it drops its preview: the card shows the flair in use again.
    if (open) onPreview(undefined);
    setOpen(!open);
  };
  return (
    <div data-keep-open className="flex w-full flex-col rounded-lg bg-slate-800 text-sm ring-1 ring-slate-600">
      <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700/60" aria-expanded={open} onClick={toggle}>
        <span className="font-semibold">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{inUse === null ? defaultLabel : (options.find((o) => o.key === inUse)?.label ?? inUse)}</span>
        <ExpandMoreIcon sx={{ fontSize: 20 }} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="flex justify-end text-xs text-slate-400">
            <span>
              Stardust <span className="font-semibold text-sky-200">{stardust.data ?? '…'}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chip(null, defaultLabel)}
            {options.map((o) => chip(o.key, o.label, o.price))}
          </div>
          <div className="flex items-center justify-end gap-2">
            {shown === inUse ? (
              <span className="text-xs text-slate-400">In use</span>
            ) : has ? (
              <button className="rounded bg-slate-600 px-3 py-1 font-semibold transition hover:bg-slate-500 active:scale-95 disabled:opacity-40" disabled={pending} onClick={() => equip.mutate({ cardId: card.id, slot, key: shown })}>
                {equip.isPending ? 'Switching…' : `Use this ${noun}`}
              </button>
            ) : (
              <button
                className="rounded bg-sky-700 px-3 py-1 font-semibold transition hover:bg-sky-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-sky-700"
                disabled={blocked !== null || pending}
                title={blocked ?? `Buy this ${noun} for ${card.name} for ${price} Stardust`}
                onClick={() => buy.mutate({ cardId: card.id, slot, key: shown! })}
              >
                {buy.isPending ? 'Buying…' : `Buy for ${price}`}
              </button>
            )}
          </div>
          {(error ?? blocked) && <p className="text-xs text-amber-300">{error ?? blocked}.</p>}
        </div>
      )}
    </div>
  );
}
