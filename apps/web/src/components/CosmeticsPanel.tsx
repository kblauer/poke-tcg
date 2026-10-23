import AddIcon from '@mui/icons-material/Add';
import LockIcon from '@mui/icons-material/Lock';
import RemoveIcon from '@mui/icons-material/Remove';
import { RUN_TYPES, type CosmeticDef, type CosmeticKind } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIsPhone } from '../hooks/useIsPhone';
import { useUnlocked } from '../hooks/useUnlocked';
import { useTRPC } from '../lib/trpc';
import { cardBackUrl } from '../utils/cardBack';
import { SpinningCoin } from './CoinFlip';
import { foldText, type CatalogCard } from '../utils/cardList';
import { CompactDeckTile, type SavedDeck } from './DeckList';
import { Playmat } from './Playmat';

const button = 'rounded bg-slate-600 px-3 py-1 text-xs font-semibold transition hover:bg-slate-500 disabled:opacity-40';

/** localStorage: the Cosmetics tab's sections folded away on a phone. */
const COLLAPSED_KEY = 'poke-tcg.cosmetics-collapsed';

/** The sections folded away, remembered per browser (a convenience: storage failures just start them all open). */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState<CosmeticKind[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as CosmeticKind[];
    } catch {
      return [];
    }
  });
  const toggle = (kind: CosmeticKind) =>
    setCollapsed((c) => {
      const next = c.includes(kind) ? c.filter((k) => k !== kind) : [...c, kind];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // Not remembered; it still applies until the page is reloaded.
      }
      return next;
    });
  return { collapsed, toggle };
}

/**
 * One of the tab's sections: its title and note, then its tiles. On a phone (`foldable`) a − beside the title folds the
 * tiles away and a + brings them back (agreed).
 */
function Section({ title, note, folded, onFold, foldable, children }: { title: string; note: ReactNode; folded: boolean; onFold: () => void; foldable: boolean; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {title}
          {foldable && (
            <button
              className="flex rounded bg-slate-700 p-0.5 text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-600 active:scale-95"
              onClick={onFold}
              aria-expanded={!folded}
              aria-label={`${folded ? 'Show' : 'Hide'} ${title.toLowerCase()}`}
              title={folded ? 'Show' : 'Hide'}
            >
              {folded ? <AddIcon sx={{ fontSize: 16 }} /> : <RemoveIcon sx={{ fontSize: 16 }} />}
            </button>
          )}
        </h2>
        <p className="text-xs text-slate-500">{note}</p>
      </div>
      {!(foldable && folded) && children}
    </section>
  );
}

/** How a cosmetic the account doesn't have is had: its price, or the run to beat. */
function howToGet(def: CosmeticDef): string {
  return def.unlock.type === 'beat' ? `Beat the ${RUN_TYPES[def.unlock.runType].name} run` : def.unlock.type === 'buy' ? `₱${def.unlock.price}` : '';
}

/**
 * The Cosmetics tab's panel (pages/Cosmetics.tsx): the card backs (the player's own face-down cards: their deck and Prize
 * cards), playmats (their side of the table) and coins (every coin flip's, a tile's coin flipped by a click), each a tile
 * with Buy with banked ₱ for one sold, or the run that unlocks it; once the account has it, Assign, which picks the decks
 * it's used for and whether it's the default for decks with none of its kind (DeckAssign, AssignDialog; agreed
 * 2026-10-23). A playmat's preview answers clicks as on the table. Every one is had while
 * debugging (the API says so).
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
    // Each deck's cosmetics, shown on the open deck in the Collection.
    queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
  };
  const buy = useMutation(trpc.cosmetics.buy.mutationOptions({ onSuccess: refresh }));
  const assign = useMutation(trpc.cosmetics.assign.mutationOptions({ onSuccess: refresh }));
  // On a phone each section folds away (its − and +).
  const phone = useIsPhone();
  const { collapsed, toggle } = useCollapsed();
  const section = (kind: CosmeticKind) => ({ foldable: phone, folded: collapsed.includes(kind), onFold: () => toggle(kind) });
  if (!list.data) return null;
  const { cosmetics, bank } = list.data;
  const busy = buy.isPending || assign.isPending;
  const error = buy.error ?? assign.error;

  const tile = (def: (typeof cosmetics)[number], preview: ReactNode) => {
    return (
      <li key={def.id} className={`flex flex-col gap-2 rounded-lg bg-slate-800 p-3 text-sm ring-1 ${def.deckIds.length || def.isDefault ? 'ring-2 ring-yellow-400/70' : 'ring-slate-700'}`}>
        {preview}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{def.name}</p>
          <p className="text-xs text-slate-400">{def.description}</p>
        </div>
        {def.owned ? (
          <DeckAssign def={def} busy={busy} onAssign={(deckIds, isDefault) => assign.mutate({ id: def.id, deckIds, isDefault })} />
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
      <Section {...section('cardBack')} title="Card backs" note={<>Your own face-down cards: your deck and Prize cards, and (the default) the packs you open. Bank: ₱{bank}</>}>
        {/* On a phone, 3 to a row (agreed). */}
        <ul className={phone ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3'}>
          {of('cardBack').map((def) =>
            tile(def, <img src={cardBackUrl(def.id)} alt="" loading="lazy" draggable={false} className={`mx-auto aspect-[63/88] w-full max-w-28 rounded-md object-cover shadow-md shadow-black/60 ${def.owned ? '' : 'opacity-50 grayscale'}`} />),
          )}
        </ul>
      </Section>
      <Section {...section('playmat')} title="Playmats" note="Your side of the table in battles. Click a preview to try it.">
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
      </Section>
      <Section {...section('coin')} title="Coins" note="Tossed for every coin flip in battles. Click a coin to flip it.">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
          {of('coin').map((def) => tile(def, <CoinPreview id={def.id} dim={!def.owned} />))}
        </ul>
      </Section>
    </div>
  );
}

/** What DeckAssign needs of a cosmetic (cosmetics.list's). */
interface Assignable {
  name: string;
  kind: CosmeticKind;
  unlock: CosmeticDef['unlock'];
  deckIds: string[];
  isDefault: boolean;
}

const KIND_NAMES: Record<CosmeticKind, string> = { cardBack: 'card back', playmat: 'playmat', coin: 'coin' };

/** A cosmetic's Assign button, opening AssignDialog to pick its decks and whether it's the default. */
function DeckAssign({ def, busy, onAssign }: { def: Assignable; busy: boolean; onAssign: (deckIds: string[], isDefault: boolean) => void }) {
  const trpc = useTRPC();
  const decks = useQuery(trpc.decks.list.queryOptions());
  // The catalog only changes when the seed is re-run (as on the Collection tab).
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity });
  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.id, c])), [catalog.data]);
  const { isLocked } = useUnlocked();
  const [open, setOpen] = useState(false);
  const own = (decks.data ?? []).filter((d) => !d.runDeck);
  return (
    <>
      <button className={`${button} w-full`} disabled={busy} onClick={() => setOpen(true)}>
        Assign
      </button>
      {open && (
        <AssignDialog
          def={def}
          decks={own}
          byId={byId}
          isLocked={isLocked}
          onSave={(deckIds, isDefault) => {
            setOpen(false);
            onAssign(deckIds, isDefault);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Which of the account's decks (not the run deck) use a cosmetic: a search by name over a scrolling list of compact deck
 * tiles, any number ticked (a deck ticked here loses its other cosmetic of this kind, named beside it), and "Default for
 * decks without one" (the account's default for its kind; the built-in default can't be unticked, only replaced by
 * ticking another). Save applies it all; Cancel, a click outside or Escape leaves it as it was.
 */
function AssignDialog({
  def,
  decks,
  byId,
  isLocked,
  onSave,
  onClose,
}: {
  def: Assignable;
  decks: SavedDeck[];
  byId: Map<string, CatalogCard>;
  isLocked: (card: CatalogCard) => boolean;
  onSave: (deckIds: string[], isDefault: boolean) => void;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const list = useQuery(trpc.cosmetics.list.queryOptions());
  const [picked, setPicked] = useState(() => new Set(def.deckIds));
  const [isDefault, setIsDefault] = useState(def.isDefault);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  /** The name of the deck's other cosmetic of this kind, which ticking it here replaces. */
  const otherOn = (deckId: string) => list.data?.cosmetics.find((c) => c.kind === def.kind && c.deckIds.includes(deckId) && !def.deckIds.includes(deckId))?.name;
  const shown = decks.filter((d) => foldText(d.name).includes(foldText(search.trim())));
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  // The built-in default stays the default until another is picked.
  const fixedDefault = def.isDefault && def.unlock.type === 'default';
  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-label={`Assign ${def.name}`} className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-lg bg-slate-800 p-4 text-sm ring-1 ring-slate-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Assign {def.name}</h3>
          <button className="rounded px-2 text-slate-400 hover:bg-slate-700 hover:text-slate-100" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label className="flex items-center gap-2 text-slate-200" title={fixedDefault ? `Tick another ${KIND_NAMES[def.kind]} as the default to replace it` : undefined}>
          <input type="checkbox" className="accent-yellow-300" checked={isDefault} disabled={fixedDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Default for decks without a {KIND_NAMES[def.kind]}
        </label>
        <input type="search" placeholder="Search your decks…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded bg-slate-900 px-2 py-1.5 outline-none ring-1 ring-slate-600 focus:ring-slate-400" autoFocus />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {picked.size} of {decks.length} decks
          </span>
          <span className="flex gap-3">
            <button className="hover:text-slate-200" onClick={() => setPicked(new Set([...picked, ...shown.map((d) => d.id)]))}>
              Tick all{search.trim() ? ' shown' : ''}
            </button>
            <button className="hover:text-slate-200" onClick={() => setPicked(new Set([...picked].filter((id) => !shown.some((d) => d.id === id))))}>
              Untick all{search.trim() ? ' shown' : ''}
            </button>
          </span>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {shown.map((d) => {
            const other = picked.has(d.id) ? otherOn(d.id) : undefined;
            return (
              <li key={d.id}>
                <label className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition hover:bg-slate-700 ${picked.has(d.id) ? 'bg-slate-700/60' : ''}`}>
                  <input type="checkbox" className="accent-yellow-300" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="min-w-0 flex-1">
                    <CompactDeckTile entries={d.cards} name={d.name} byId={byId} isLocked={isLocked} />
                  </span>
                  {other && <span className="shrink-0 text-[11px] text-amber-300">replaces {other}</span>}
                </label>
              </li>
            );
          })}
          {!shown.length && <li className="px-2 py-1.5 text-xs text-slate-400">{decks.length ? 'No deck matches.' : 'No decks yet: make one on the Collection tab.'}</li>}
        </ul>
        <div className="flex justify-end gap-2">
          <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500" onClick={() => onSave([...picked], isDefault)}>
            Save
          </button>
        </div>
      </div>
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
