import CloseIcon from '@mui/icons-material/Close';
import type { AppRouter } from '@poke-tcg/api/router';
import { MAX_PACKS_AT_ONCE } from '@poke-tcg/campaign';
import { useMutation } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useTRPC } from '../../lib/trpc';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { useCosmetics } from '../../hooks/useCosmetics';
import { useFlair, usePattern } from '../../hooks/useFlair';
import { holoAttributes } from '../../utils/holo';
import { PACK_COMMON, PACK_REVEAL, PACK_SUMMARY } from '../../utils/layout';
import { HoloCard } from '../HoloCard';
import { RunCard } from '../run/RunCard';
import { BoosterPack } from './BoosterPack';
import { Fireworks } from './Fireworks';

type Opened = inferRouterOutputs<AppRouter>['packs']['open'];
type PackCard = Opened['cards'][number];
/** The pack being opened: its set, and the wrapper art shown on the Packs tab (PACK_ART), if it has one. */
export type PackSetInfo = { id: string; name: string; logoUrl: string | null; art?: string };

const SLOT_LABEL: Record<PackCard['slot'], string> = { energy: 'Energy', holoEnergy: 'Holo Energy', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', holo: 'Rare Holo', reverse: 'Reverse Holo' };
/** Slots shown as a foil pull (pink): holos, holo Energy and reverse holos. */
const isFoilSlot = (slot: PackCard['slot']) => slot === 'holo' || slot === 'holoEnergy' || slot === 'reverse';
/** The Wizards promos have no printed rarity: they're just promos, holo or not. */
const PROMO_SLOT_LABEL: Record<PackCard['slot'], string> = { ...SLOT_LABEL, common: 'Promo', holo: 'Holo Promo' };

/** How long the pack's top takes to tear off, and how long the cards fly out of it. */
const TEAR_MS = 1050;
const BURST_MS = 1300;
const STAGGER_MS = 45;
const FLY_OUT_MS = 300;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Quick picks for how many packs to open; Custom takes any number up to MAX_PACKS_AT_ONCE. */
const QUANTITIES = [1, 2, 5, 10];
/** The most cards drawn flying out of the packs (opening ten packs shouldn't animate 110). */
const MAX_BURST = 22;

/** Auto open: how long each card stays up before the next, and how long a rare or holo does. */
const AUTO_MS = 200;
const AUTO_RARE_MS = 1600;

/**
 * How packs open, remembered in the browser. `separate`: the commons (uncommons and Energy too) are laid out
 * face up together, and only the rares are revealed one by one. `auto`: the cards being revealed move on by themselves.
 */
type OpenOptions = { separate: boolean; auto: boolean };
const OPTIONS_KEY = 'poke-tcg.pack-options';

function loadOptions(): OpenOptions {
  try {
    return { separate: false, auto: false, ...(JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') as Partial<OpenOptions>) };
  } catch {
    return { separate: false, auto: false };
  }
}

function saveOptions(options: OpenOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Not remembered: the defaults come back next time.
  }
}

/**
 * The rare slot (rares and holos), the odd holo Energy, and any other holo or galaxy foil: the cards revealed one by one
 * when commons and rares are separated or several packs are opened.
 */
const isRare = (c: PackCard) => c.slot === 'rare' || isFoilSlot(c.slot) || c.holo || c.galaxy;

/**
 * Opening packs, in a window over the page. Pick how many (×1, ×2, ×5, ×10 or Custom), then click the pack to
 * buy them (₱ from the bank, or Battle Points in the BP Shop: `currency`): it shakes, its top tears off, and the cards burst out and gather into a stack.
 * Click the stack to reveal the cards one by one (each flips up; holos shimmer, new unlocks are marked NEW), or Skip:
 * every card of every pack, pack after pack, or only the rares with the commons separated or when several packs are
 * opened on auto open. Either way it ends on the list
 * of every card opened, with the rares framed and tagged. An all-rares pack (ALL_RARES_CHANCE) sets off fireworks. Closing the window
 * (the × button, or before opening a click anywhere but the pack and its controls) goes back to the sets.
 * Two options (OpenOptions): separate the commons from the rares (the commons are laid out at once, the rares
 * stay face down to be opened one by one), and auto open (the cards revealed move on by themselves, pausing on rares;
 * while it runs, ×2 speed doubles it and Stop auto goes back to clicking, with Resume auto to start it again).
 */
export function PackOpening({
  set,
  price,
  bank,
  onClose,
  onOpened,
  currency = 'bank',
}: {
  set: PackSetInfo;
  price: number;
  /** What the player has to pay with: ₱ in the bank, or (`currency` bp) Battle Points. */
  bank: number;
  onClose: () => void;
  onOpened: () => void;
  /** Paid with ₱ from the bank (the Packs tab), or Battle Points (the Battle Tower's BP Shop). */
  currency?: 'bank' | 'bp';
}) {
  // Face down, the cards show the player's card back (the Cosmetics tab).
  const { cardBack } = useCosmetics();
  const trpc = useTRPC();
  const [phase, setPhase] = useState<'pack' | 'tearing' | 'burst' | 'commons' | 'reveal' | 'summary'>('pack');
  const overlay = useRef<HTMLDivElement>(null);
  useScrollLock(true, overlay);
  const [cards, setCards] = useState<PackCard[]>([]);
  /** The Stardust these packs gave. */
  const [stardustEarned, setStardustEarned] = useState(0);
  /** Position in `queue`, the cards revealed one by one. */
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(loadOptions);
  useEffect(() => saveOptions(options), [options]);
  /** Auto open is running for these packs (it starts with the option, and can be stopped and resumed). */
  const [autoOn, setAutoOn] = useState(false);
  /** Auto open at double speed. */
  const [fast, setFast] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Bumped to set the fireworks off (an all-rares pack). */
  const [fireworks, setFireworks] = useState(0);
  const [quantity, setQuantity] = useState(1);
  /** Custom picked: the number field shows instead of the quick picks being the only choice. */
  const [custom, setCustom] = useState(false);
  /** The cards' large images, fetched while the pack tears open and the cards burst out, so each is ready when it flips up. */
  const preloaded = useRef<HTMLImageElement[]>([]);
  /** Debug tools only: the next packs each get a holo Energy (packs.debugOpen, refused in production). */
  const debug = useDebugEnabled();
  const [forceHolo, setForceHolo] = useState(false);
  const [forceAllRares, setForceAllRares] = useState(false);
  const opened = {
    onSuccess: (result: Opened) => {
      preloaded.current = result.cards.flatMap((c) => {
        if (!c.imageUrl) return [];
        const img = new Image();
        img.src = `${c.imageUrl}/high.webp`;
        return [img];
      });
      setCards(result.cards);
      setStardustEarned(result.stardustEarned);
      onOpened();
      setAutoOn(options.auto);
      setPhase('tearing');
      setTimeout(() => setPhase('burst'), reducedMotion() ? 0 : TEAR_MS);
    },
  };
  const buy = useMutation(trpc.packs.open.mutationOptions(opened));
  const debugBuy = useMutation(trpc.packs.debugOpen.mutationOptions(opened));
  // Whichever opened them: pending and errors come from either.
  const open = {
    isPending: buy.isPending || debugBuy.isPending,
    error: buy.error ?? debugBuy.error,
    mutate: (input: { setId: string; count: number; currency: 'bank' | 'bp' }) =>
      DEBUG_BUILD && debug && (forceHolo || forceAllRares) ? debugBuy.mutate({ ...input, holoEnergy: forceHolo, allRares: forceAllRares }) : buy.mutate(input),
  };
  const total = price * quantity;
  const affordable = bank >= total;
  /** The most packs the bank pays for (at least 1, so the price still shows). */
  const maxAffordable = Math.max(1, Math.min(MAX_PACKS_AT_ONCE, Math.floor(bank / price)));
  const packs = cards.length ? cards.at(-1)!.pack + 1 : quantity;
  /**
   * Only the rares are revealed one by one (on the same screen as every card would be), the rest waiting for the list:
   * with the commons separated, or several packs on auto open. Otherwise every card of every pack is clicked through.
   */
  const raresOnly = options.separate || (packs > 1 && options.auto);
  /** The packs (by number) that are all rares and holos but their Energy (ALL_RARES_CHANCE): they get fireworks. */
  const allRaresPacks = new Set(
    Array.from({ length: cards.length ? packs : 0 }, (_, p) => p).filter((p) => {
      const rest = cards.filter((c) => c.pack === p && c.slot !== 'energy' && c.slot !== 'holoEnergy');
      return rest.length > 1 && rest.every(isRare);
    }),
  );
  const inPack = (i: number) => cards.slice(0, i).filter((c) => c.pack === cards[i]!.pack).length;
  const packSize = (p: number) => cards.filter((c) => c.pack === p).length;
  /** The cards revealed one by one (by index in `cards`): every card of a single pack, or only the rares. */
  const queue = cards.flatMap((c, i) => (!raresOnly || isRare(c) ? [i] : []));
  // A single pack with the commons separated lays them out first; several packs go straight to their rares.
  const commons = options.separate && packs === 1 ? cards.filter((c) => !isRare(c)) : [];
  const current = queue[index] === undefined ? undefined : cards[queue[index]!];

  /** The current card flies off the stack and the next one flips up; after the last, the list. */
  function next() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(
      () => {
        setLeaving(false);
        if (index + 1 < queue.length) setIndex(index + 1);
        else setPhase('summary');
      },
      reducedMotion() ? 0 : FLY_OUT_MS / (autoOn && fast ? 2 : 1),
    );
  }

  // Auto open: each card moves on by itself, after a longer pause on a rare or holo.
  useEffect(() => {
    if (phase !== 'reveal' || !autoOn || leaving || !current) return;
    const timer = setTimeout(next, (isRare(current) ? AUTO_RARE_MS : AUTO_MS) / (fast ? 2 : 1));
    return () => clearTimeout(timer);
  }, [phase, index, leaving, autoOn, fast]);

  const newCount = cards.filter((c) => c.isNew).length;
  const rareCount = cards.filter(isRare).length;
  // In the page body, over the top bar (z-[820]) and the site menu (z-[810]), which otherwise covered the top of a tall
  // summary (many packs), on every screen; under the card preview and view, the toasts and the music player.
  return createPortal(
    <div
      data-keep-action
      ref={overlay}
      // Its content is centred, and scrolls when it's taller than the screen (a phone); the page behind stays put.
      className="fixed inset-0 z-[900] flex overflow-y-auto overscroll-contain bg-slate-950/85 p-4 backdrop-blur-sm"
      // Before the pack is opened, a click on anything but a control (the pack, the quantity, the options) closes the window.
      onClick={(e) => {
        if (phase === 'pack' && !open.isPending && !(e.target as Element).closest('button, input, label, select, a')) onClose();
      }}
    >
      {fireworks > 0 && <Fireworks key={fireworks} />}
      {phase !== 'tearing' && phase !== 'burst' && !open.isPending && (
        <button className="fixed right-4 top-4 z-10 rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-slate-50" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      )}

      {(phase === 'pack' || phase === 'tearing') && (
        <div className="m-auto flex flex-col items-center gap-6">
          <h2 className="text-3xl font-bold">{set.name}</h2>
          <button
            className="rounded-md outline-none transition hover:scale-105 focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:cursor-not-allowed disabled:hover:scale-100"
            disabled={phase !== 'pack' || open.isPending || !affordable}
            onClick={() => open.mutate({ setId: set.id, count: quantity, currency })}
            aria-label={`Open ${quantity === 1 ? 'a' : quantity} ${set.name} pack${quantity === 1 ? '' : 's'}`}
          >
            <BoosterPack setId={set.id} name={set.name} logoUrl={set.logoUrl} art={set.art} size="xl" state={phase === 'tearing' ? 'torn' : open.isPending ? 'shaking' : 'idle'} />
          </button>
          {/* The controls keep their space (hidden) while the pack tears, so the pack stays where it was. */}
          {(phase === 'pack' || phase === 'tearing') && (
            <div className={`flex flex-wrap items-center justify-center gap-2 ${phase === 'tearing' ? 'invisible' : ''}`} role="group" aria-label="How many packs">
              {QUANTITIES.map((n) => (
                <button
                  key={n}
                  className={`rounded px-3 py-1 text-sm font-semibold transition ${!custom && quantity === n ? 'bg-yellow-300 text-slate-900' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                  aria-pressed={!custom && quantity === n}
                  disabled={open.isPending}
                  onClick={() => {
                    setCustom(false);
                    setQuantity(n);
                  }}
                >
                  ×{n}
                </button>
              ))}
              <button
                className={`rounded px-3 py-1 text-sm font-semibold transition ${custom ? 'bg-yellow-300 text-slate-900' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                aria-pressed={custom}
                disabled={open.isPending}
                onClick={() => setCustom(true)}
              >
                Custom
              </button>
              {custom && (
                <input
                  type="number"
                  min={1}
                  max={MAX_PACKS_AT_ONCE}
                  value={quantity}
                  autoFocus
                  disabled={open.isPending}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_PACKS_AT_ONCE, Math.floor(Number(e.target.value)) || 1)))}
                  className="w-20 rounded bg-slate-800 px-2 py-1 text-sm outline-none ring-yellow-300 focus:ring-1"
                  aria-label={`Number of packs (1 to ${MAX_PACKS_AT_ONCE})`}
                />
              )}
              {custom && (
                <button className="text-xs text-slate-400 hover:text-slate-200" disabled={open.isPending} onClick={() => setQuantity(maxAffordable)}>
                  Max ({maxAffordable})
                </button>
              )}
            </div>
          )}
          {(phase === 'pack' || phase === 'tearing') && (
            <div className={`flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-300 ${phase === 'tearing' ? 'invisible' : ''}`}>
              <label className="flex items-center gap-2" title="Lay the commons and uncommons out together, and open only the rares one by one">
                <input type="checkbox" checked={options.separate} onChange={(e) => setOptions((o) => ({ ...o, separate: e.target.checked }))} />
                Separate commons and rares
              </label>
              <label className="flex items-center gap-2" title="Move on to the next card by itself, pausing on rares">
                <input type="checkbox" checked={options.auto} onChange={(e) => setOptions((o) => ({ ...o, auto: e.target.checked }))} />
                Auto open
              </label>
              {/* DEBUG_BUILD first: a production build drops the checkbox altogether. */}
              {DEBUG_BUILD && debug && (
                <label className="flex items-center gap-2 text-amber-300" title="Debug: every pack opened gets a holo Energy (packs.debugOpen, refused in production)">
                  <input type="checkbox" checked={forceHolo} onChange={(e) => setForceHolo(e.target.checked)} />
                  Debug: force holo Energy
                </label>
              )}
              {DEBUG_BUILD && debug && (
                <label className="flex items-center gap-2 text-amber-300" title="Debug: every pack opened is all rares and holos (packs.debugOpen, refused in production)">
                  <input type="checkbox" checked={forceAllRares} onChange={(e) => setForceAllRares(e.target.checked)} />
                  Debug: force all-rares pack
                </label>
              )}
            </div>
          )}
          {(phase === 'pack' || phase === 'tearing') && (
            <p className={`text-sm ${affordable ? 'text-slate-300' : 'text-amber-300'} ${phase === 'tearing' ? 'invisible' : ''}`}>
              {currency === 'bp'
                ? affordable
                  ? `Click the pack to open ${quantity === 1 ? 'it' : `${quantity} packs`}: ${total} BP of your ${bank}.`
                  : `${quantity === 1 ? 'A pack costs' : `${quantity} packs cost`} ${total} BP; you have ${bank} BP.`
                : affordable
                  ? `Click the pack to open ${quantity === 1 ? 'it' : `${quantity} packs`}: ₱${total} from your bank (₱${bank}).`
                  : `${quantity === 1 ? 'A pack costs' : `${quantity} packs cost`} ₱${total}; your bank has ₱${bank}.`}
            </p>
          )}
          {open.error && <p className="text-sm text-red-400">{open.error.message}</p>}
        </div>
      )}

      {phase === 'burst' && (
        <Burst
          count={Math.min(cards.length, MAX_BURST)}
          onDone={() => {
            setPhase(commons.length ? 'commons' : queue.length ? 'reveal' : 'summary');
            // An all-rares pack among them: fireworks as the cards come out.
            if (allRaresPacks.size) setFireworks((n) => n + 1);
          }}
        />
      )}

      {phase === 'commons' && (
        <div className="m-auto flex max-h-full w-full max-w-[110rem] flex-col items-center gap-4">
          <p className="text-sm text-slate-400">
            {commons.length} commons, uncommons and Energy from {packs === 1 ? 'the pack' : `${packs} packs`} ·{' '}
            {queue.length ? `${queue.length} rare${queue.length === 1 ? '' : 's'} face down` : 'no rares'}
          </p>
          {/* Laid out face up all at once, flipping in one after another. */}
          <div className="flex min-h-0 flex-wrap justify-center gap-3 overflow-y-auto p-2">
            {commons.map((c, i) => (
              <div key={i} className="card-flip-in" style={{ animationDelay: `${Math.min(i, 40) * 30}ms` }}>
                <RunCard def={{ id: c.cardId, kind: 'trainer', name: c.name, imageUrl: c.imageUrl, text: '', rarity: c.slot === 'energy' ? undefined : c.slot }} badge={c.isNew ? 'NEW' : undefined} width={PACK_COMMON} />
              </div>
            ))}
          </div>
          {queue.length ? (
            <button className="group flex flex-col items-center gap-2 outline-none" onClick={() => setPhase('reveal')} aria-label="Open the rares">
              {/* The rares, face down in a stack. */}
              <div className="relative aspect-[63/88] w-32 transition group-hover:-translate-y-1">
                {Array.from({ length: Math.min(queue.length, 5) }, (_, i) => (
                  <img key={i} src={cardBack} alt="" draggable={false} className="absolute inset-0 aspect-[63/88] w-full rounded-lg object-cover shadow-lg" style={{ transform: `translate(${i * 3}px, ${i * 3}px)` }} />
                ))}
              </div>
              <span className="rounded bg-amber-500 px-4 py-1.5 font-semibold text-slate-900 group-hover:bg-amber-400">Open the rares ({queue.length})</span>
            </button>
          ) : (
            <button className="rounded bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-500" onClick={() => setPhase('summary')}>
              Continue
            </button>
          )}
        </div>
      )}

      {phase === 'reveal' && current && (
        <div className="m-auto flex flex-col items-center gap-5">
          <p className="text-sm text-slate-400">
            {allRaresPacks.has(current.pack) && <span className="font-bold text-yellow-300">All rares! · </span>}
            {raresOnly
              ? `${packs > 1 ? `Pack ${current.pack + 1} of ${packs} · ` : ''}Rare ${index + 1} of ${queue.length}`
              : `${packs > 1 ? `Pack ${current.pack + 1} of ${packs} · ` : ''}Card ${inPack(queue[index]!) + 1} of ${packSize(current.pack)}`}
            {autoOn ? ` · opening by itself${fast ? ' (×2)' : ''}` : ' · click to see the next'}
          </p>
          <button className={`pack-reveal relative my-4 outline-none ${PACK_REVEAL}`} onClick={next} aria-label="Next card">
            {/* The rest of the stack, face down, under the card shown. */}
            {Array.from({ length: Math.min(queue.length - index - 1, 5) }, (_, i) => (
              <img key={i} src={cardBack} alt="" draggable={false} className="absolute inset-0 aspect-[63/88] w-full rounded-xl object-cover shadow-lg" style={{ transform: `translate(${(i + 1) * 4}px, ${(i + 1) * 4}px)` }} />
            ))}
            <RevealedCard key={index} card={current} leaving={leaving} />
          </button>
          <div className="flex h-8 items-center gap-3">
            <span className={`text-lg font-semibold ${isFoilSlot(current.slot) ? 'text-fuchsia-300' : current.slot === 'rare' ? 'text-amber-300' : 'text-slate-300'}`}>
              {current.name} · {(set.id === 'basep' ? PROMO_SLOT_LABEL : SLOT_LABEL)[current.slot]}
              {current.holoEnergy && ` (${current.holoEnergy.label})`}
            </span>
            {current.isNew && <span className="badge-pop rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
          </div>
          <div className="flex items-center gap-2">
            {/* Auto open's controls, for packs opened with it: double speed, or stop and click through instead. */}
            {options.auto &&
              (autoOn ? (
                <>
                  <button
                    className={`rounded px-4 py-1.5 text-sm font-semibold transition ${fast ? 'bg-yellow-300 text-slate-900' : 'bg-slate-600 hover:bg-slate-500'}`}
                    aria-pressed={fast}
                    onClick={() => setFast(!fast)}
                  >
                    ×2 speed
                  </button>
                  <button className="rounded bg-slate-600 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-500" onClick={() => setAutoOn(false)}>
                    Stop auto
                  </button>
                </>
              ) : (
                <button className="rounded bg-slate-600 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-500" onClick={() => setAutoOn(true)}>
                  Resume auto
                </button>
              ))}
            <button className="rounded bg-slate-600 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-500" onClick={() => setPhase('summary')}>
              Skip
            </button>
          </div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="m-auto max-h-full w-full max-w-[110rem] space-y-4 overflow-y-auto rounded-lg bg-slate-800 p-6 ring-1 ring-slate-600">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-bold">
              {packs === 1 ? `${set.name} pack` : `${packs} ${set.name} packs`}
            </h2>
            <span className="text-sm text-emerald-300">
              {newCount} new card{newCount === 1 ? '' : 's'} unlocked
            </span>
            <span className="text-sm text-amber-300">
              {rareCount} rare{rareCount === 1 ? '' : 's'}
            </span>
            <span className="text-sm text-sky-200" title="For crafting cards on the Collection tab">
              +{stardustEarned} Stardust
            </span>
            {allRaresPacks.size > 0 && (
              <span className="text-sm font-bold text-yellow-300">
                {allRaresPacks.size === 1 ? 'An all-rares pack!' : `${allRaresPacks.size} all-rares packs!`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {cards.map((c, i) => (
              // The rares (each pack's rare slot, and a holo Energy) are framed and tagged, holos in their own colour.
              <div key={i} className={`relative rounded-xl ${isFoilSlot(c.slot) ? 'bg-fuchsia-400/10 ring-2 ring-fuchsia-400/80' : c.slot === 'rare' ? 'bg-amber-400/10 ring-2 ring-amber-400/80' : ''}`}>
                {isRare(c) && (
                  <span className={`absolute -left-1 -top-1 z-10 rounded-full px-1.5 text-[10px] font-bold uppercase text-slate-900 shadow ${isFoilSlot(c.slot) ? 'bg-fuchsia-300' : 'bg-amber-300'}`}>
                    {c.slot === 'holoEnergy' ? 'Holo Energy' : c.slot === 'reverse' ? 'Reverse Holo' : c.slot === 'holo' ? 'Holo' : 'Rare'}
                  </span>
                )}
                <RunCard
                  def={{ id: c.cardId, kind: 'trainer', name: c.name, imageUrl: c.imageUrl, text: '', rarity: c.slot === 'energy' ? undefined : c.slot }}
                  badge={c.isNew ? 'NEW' : undefined}
                  width={PACK_SUMMARY}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <button className="rounded bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-500 active:scale-95" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * One card face up, flipping in, with the card viewer's tilt toward the pointer and its holo effect (HoloCard):
 * holos shine as they do in the deck builder's card view, in the pattern chosen for them (card flair), and a card given a gold border shows it. Rares and holos have a glow behind them. `leaving`: it flies off the stack.
 */
function RevealedCard({ card, leaving }: { card: PackCard; leaving: boolean }) {
  const pattern = usePattern(card.cardId);
  const goldBorder = useFlair(card.cardId, 'border') !== null;
  const glow = isFoilSlot(card.slot) ? 'bg-fuchsia-400/60' : card.slot === 'rare' ? 'bg-amber-300/50' : null;
  return (
    <div className={`relative w-full ${leaving ? 'card-fly-out' : 'card-flip-in'}`}>
      {glow && <div className={`pointer-events-none absolute -inset-6 rounded-[2rem] blur-2xl ${glow}`} />}
      {card.imageUrl ? (
        <HoloCard img={`${card.imageUrl}/high.webp`} name={card.name} attrs={holoAttributes({ id: card.cardId, ...card }, pattern)} goldBorder={goldBorder} />
      ) : (
        <div className="flex aspect-[63/88] w-full items-center justify-center rounded-xl bg-slate-700 p-4 text-lg font-semibold">{card.name}</div>
      )}
    </div>
  );
}

/**
 * The cards bursting out of the opened pack: face down, they fly up into a fan one after another, then
 * gather into a single stack. Calls `onDone` when they've landed (at once with reduced motion).
 */
function Burst({ count, onDone }: { count: number; onDone: () => void }) {
  const { cardBack } = useCosmetics();
  const cards = useRef<(HTMLImageElement | null)[]>([]);
  useLayoutEffect(() => {
    if (reducedMotion()) return onDone();
    const mid = (count - 1) / 2;
    const animations = cards.current.map((el, i) => {
      const spread = i - mid;
      return el?.animate(
        [
          { transform: 'translate(0, 45%) scale(0.45)', opacity: 0 },
          // In percentages of the card, so the fan scales with it (PACK_REVEAL).
          { transform: `translate(${spread * 21.5}%, ${-37 + spread * spread * 1.75}%) rotate(${spread * 8}deg) scale(0.8)`, opacity: 1, offset: 0.55 },
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
        ],
        { duration: BURST_MS, delay: i * STAGGER_MS, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'both' },
      );
    });
    const last = animations.at(-1);
    if (!last) return onDone();
    last.onfinish = onDone;
    return () => animations.forEach((a) => a?.cancel());
  }, []);
  return (
    // m-auto: centred in the window, as every phase is.
    <div className={`relative m-auto aspect-[63/88] ${PACK_REVEAL}`}>
      {Array.from({ length: count }, (_, i) => (
        <img key={i} ref={(el) => void (cards.current[i] = el)} src={cardBack} alt="" draggable={false} className="absolute inset-0 aspect-[63/88] w-full rounded-xl object-cover shadow-xl shadow-black/60" />
      ))}
    </div>
  );
}
