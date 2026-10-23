import LockIcon from '@mui/icons-material/Lock';
import { RUN_TYPES, type CosmeticDef, type CosmeticKind } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTRPC } from '../lib/trpc';
import { cardBackUrl } from '../utils/cardBack';
import { SpinningCoin } from './CoinFlip';
import { Playmat } from './Playmat';

const button = 'rounded bg-slate-600 px-3 py-1 text-xs font-semibold transition hover:bg-slate-500 disabled:opacity-40';

/** How a cosmetic the account doesn't have is had: its price, or the run to beat. */
function howToGet(def: CosmeticDef): string {
  return def.unlock.type === 'beat' ? `Beat the ${RUN_TYPES[def.unlock.runType].name} run` : def.unlock.type === 'buy' ? `₱${def.unlock.price}` : '';
}

/**
 * The Cosmetics tab's panel (pages/Cosmetics.tsx): the coins (every coin flip's, a tile's coin flipped by a click), the card backs (the player's own face-down cards: their deck, Prize cards and packs) and
 * playmats (their side of the table), each a tile with Use (or In use), Buy with banked ₱ for one sold, or the run that
 * unlocks it. A playmat's preview answers clicks as on the table. Every one is had while debugging (the API says so).
 */
export function CosmeticsPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.cosmetics.list.queryOptions());
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: trpc.cosmetics.list.queryKey() });
    // The bank, shown on the Packs tab and in runs.
    queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
  };
  const buy = useMutation(trpc.cosmetics.buy.mutationOptions({ onSuccess: refresh }));
  const use = useMutation(trpc.cosmetics.use.mutationOptions({ onSuccess: refresh }));
  if (!list.data) return null;
  const { cosmetics, bank } = list.data;
  const busy = buy.isPending || use.isPending;
  const error = buy.error ?? use.error;

  const tile = (def: (typeof cosmetics)[number], preview: ReactNode) => {
    const current = list.data[def.kind] === def.id;
    return (
      <li key={def.id} className={`flex flex-col gap-2 rounded-lg bg-slate-800 p-3 text-sm ring-1 ${current ? 'ring-2 ring-yellow-400/70' : 'ring-slate-700'}`}>
        {preview}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{def.name}</p>
          <p className="text-xs text-slate-400">{def.description}</p>
        </div>
        {current ? (
          <span className="text-xs font-semibold text-yellow-300">In use</span>
        ) : def.owned ? (
          <button className={button} disabled={busy} onClick={() => use.mutate({ kind: def.kind, id: def.id })}>
            Use
          </button>
        ) : def.unlock.type === 'buy' ? (
          <button className={button} disabled={busy || bank < def.unlock.price} title={bank < def.unlock.price ? `You have ₱${bank} in the bank` : undefined} onClick={() => buy.mutate({ id: def.id })}>
            Buy {howToGet(def)}
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <LockIcon sx={{ fontSize: 14 }} />
            {howToGet(def)}
          </span>
        )}
      </li>
    );
  };
  const of = (kind: CosmeticKind) => cosmetics.filter((c) => c.kind === kind);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error.message}</p>}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold">Card backs</h2>
          <p className="text-xs text-slate-500">Your own face-down cards: your deck, Prize cards and the packs you open. Bank: ₱{bank}</p>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
          {of('cardBack').map((def) =>
            tile(def, <img src={cardBackUrl(def.id)} alt="" loading="lazy" draggable={false} className={`mx-auto aspect-[63/88] w-28 rounded-md object-cover shadow-md shadow-black/60 ${def.owned ? '' : 'opacity-50 grayscale'}`} />),
          )}
        </ul>
      </section>
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold">Playmats</h2>
          <p className="text-xs text-slate-500">Your side of the table in battles. Click a preview to try it.</p>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          {of('playmat').map((def) =>
            tile(
              def,
              <div className={`relative h-32 overflow-hidden rounded-md bg-slate-900 ring-1 ring-slate-700 ${def.owned ? '' : 'opacity-60'}`}>
                <Playmat id={def.id} />
              </div>,
            ),
          )}
        </ul>
      </section>
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold">Coins</h2>
          <p className="text-xs text-slate-500">Tossed for every coin flip in battles. Click a coin to flip it.</p>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
          {of('coin').map((def) => tile(def, <CoinPreview id={def.id} dim={!def.owned} />))}
        </ul>
      </section>
    </div>
  );
}

/** A coin cosmetic's tile picture: the coin lying heads up, flipped (heads or tails at random) when clicked. */
function CoinPreview({ id, dim }: { id: string; dim: boolean }) {
  const [flip, setFlip] = useState({ n: 0, heads: true });
  return (
    <button type="button" title="Flip it" className={`mx-auto flex h-32 items-end justify-center ${dim ? 'opacity-60' : ''}`} onClick={() => setFlip((f) => ({ n: f.n + 1, heads: Math.random() < 0.5 }))}>
      <SpinningCoin key={flip.n} heads={flip.heads} size="md" design={id} still={flip.n === 0} headroom={false} />
    </button>
  );
}
