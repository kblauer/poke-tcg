import CloseIcon from '@mui/icons-material/Close';
import type { AppRouter } from '@poke-tcg/api/router';
import { MAX_PACKS_AT_ONCE } from '@poke-tcg/campaign';
import { useMutation } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTRPC } from '../../lib/trpc';
import { CARD_BACK } from '../../utils/cardBack';
import { holoAttributes } from '../../utils/holo';
import { HoloCard } from '../HoloCard';
import { RunCard } from '../run/RunCard';
import { BoosterPack } from './BoosterPack';

type Opened = inferRouterOutputs<AppRouter>['packs']['open'];
type PackCard = Opened['cards'][number];
export type PackSetInfo = { id: string; name: string; logoUrl: string | null };

const SLOT_LABEL: Record<PackCard['slot'], string> = { energy: 'Energy', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', holo: 'Rare Holo' };
/** The Wizards promos have no printed rarity: they're just promos, holo or not. */
const PROMO_SLOT_LABEL: Record<PackCard['slot'], string> = { ...SLOT_LABEL, common: 'Promo', holo: 'Holo Promo' };

/** How long the pack's top takes to tear off, and how long the cards fly out of it. */
const TEAR_MS = 650;
const BURST_MS = 1300;
const STAGGER_MS = 45;
const FLY_OUT_MS = 300;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Quick picks for how many packs to open; Custom takes any number up to MAX_PACKS_AT_ONCE. */
const QUANTITIES = [1, 2, 5, 10];
/** The most cards drawn flying out of the packs (opening ten packs shouldn't animate 110). */
const MAX_BURST = 22;

/**
 * Opening packs, in a window over the page. Pick how many (×1, ×2, ×5, ×10 or Custom), then click the pack to
 * buy them (₱ from the bank): it shakes, its top tears off, and the cards burst out and gather into a stack.
 * Click the stack to reveal the cards one by one, pack after pack (each flips up; holos shimmer, new unlocks
 * are marked NEW), or Skip. Either way it ends on the list of cards opened. Closing the window goes back to the sets.
 */
export function PackOpening({ set, price, bank, onClose, onOpened }: { set: PackSetInfo; price: number; bank: number; onClose: () => void; onOpened: () => void }) {
  const trpc = useTRPC();
  const [phase, setPhase] = useState<'pack' | 'tearing' | 'burst' | 'reveal' | 'summary'>('pack');
  const [cards, setCards] = useState<PackCard[]>([]);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [quantity, setQuantity] = useState(1);
  /** Custom picked: the number field shows instead of the quick picks being the only choice. */
  const [custom, setCustom] = useState(false);
  /** The cards' large images, fetched while the pack tears open and the cards burst out, so each is ready when it flips up. */
  const preloaded = useRef<HTMLImageElement[]>([]);
  const open = useMutation(
    trpc.packs.open.mutationOptions({
      onSuccess: (result) => {
        preloaded.current = result.cards.flatMap((c) => {
          if (!c.imageUrl) return [];
          const img = new Image();
          img.src = `${c.imageUrl}/high.webp`;
          return [img];
        });
        setCards(result.cards);
        onOpened();
        setPhase('tearing');
        setTimeout(() => setPhase('burst'), reducedMotion() ? 0 : TEAR_MS);
      },
    }),
  );
  const total = price * quantity;
  const affordable = bank >= total;
  /** The most packs the bank pays for (at least 1, so the price still shows). */
  const maxAffordable = Math.max(1, Math.min(MAX_PACKS_AT_ONCE, Math.floor(bank / price)));
  const packs = cards.length ? cards.at(-1)!.pack + 1 : quantity;
  const inPack = (i: number) => cards.slice(0, i).filter((c) => c.pack === cards[i]!.pack).length;
  const packSize = (p: number) => cards.filter((c) => c.pack === p).length;

  /** The current card flies off the stack and the next one flips up; after the last, the list. */
  function next() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(
      () => {
        setLeaving(false);
        if (index + 1 < cards.length) setIndex(index + 1);
        else setPhase('summary');
      },
      reducedMotion() ? 0 : FLY_OUT_MS,
    );
  }

  const newCount = cards.filter((c) => c.isNew).length;
  return (
    <div data-keep-action className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      {phase !== 'tearing' && phase !== 'burst' && !open.isPending && (
        <button className="absolute right-4 top-4 rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      )}

      {(phase === 'pack' || phase === 'tearing') && (
        <div className="flex flex-col items-center gap-6">
          <h2 className="text-2xl font-bold">{set.name}</h2>
          <button
            className="rounded-md outline-none transition hover:scale-105 focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:cursor-not-allowed disabled:hover:scale-100"
            disabled={phase !== 'pack' || open.isPending || !affordable}
            onClick={() => open.mutate({ setId: set.id, count: quantity })}
            aria-label={`Open ${quantity === 1 ? 'a' : quantity} ${set.name} pack${quantity === 1 ? '' : 's'}`}
          >
            <BoosterPack setId={set.id} name={set.name} logoUrl={set.logoUrl} state={phase === 'tearing' ? 'torn' : open.isPending ? 'shaking' : 'idle'} />
          </button>
          {phase === 'pack' && (
            <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="How many packs">
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
          {phase === 'pack' && (
            <p className={`text-sm ${affordable ? 'text-slate-300' : 'text-amber-300'}`}>
              {affordable
                ? `Click the pack to open ${quantity === 1 ? 'it' : `${quantity} packs`}: ₱${total} from your bank (₱${bank}).`
                : `${quantity === 1 ? 'A pack costs' : `${quantity} packs cost`} ₱${total}; your bank has ₱${bank}.`}
            </p>
          )}
          {open.error && <p className="text-sm text-red-400">{open.error.message}</p>}
        </div>
      )}

      {phase === 'burst' && <Burst count={Math.min(cards.length, MAX_BURST)} onDone={() => setPhase('reveal')} />}

      {phase === 'reveal' && cards[index] && (
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-slate-400">
            {packs > 1 && `Pack ${cards[index].pack + 1} of ${packs} · `}Card {inPack(index) + 1} of {packSize(cards[index].pack)} · click to see the next
          </p>
          <button className="relative w-72 outline-none" onClick={next} aria-label="Next card">
            {/* The rest of the stack, face down, under the card shown. */}
            {Array.from({ length: Math.min(cards.length - index - 1, 5) }, (_, i) => (
              <img key={i} src={CARD_BACK} alt="" draggable={false} className="absolute inset-0 aspect-[63/88] w-full rounded-xl object-cover shadow-lg" style={{ transform: `translate(${(i + 1) * 4}px, ${(i + 1) * 4}px)` }} />
            ))}
            <RevealedCard key={index} card={cards[index]} leaving={leaving} />
          </button>
          <div className="flex h-8 items-center gap-3">
            <span className={`text-sm font-semibold ${cards[index].slot === 'holo' ? 'text-fuchsia-300' : cards[index].slot === 'rare' ? 'text-amber-300' : 'text-slate-300'}`}>
              {cards[index].name} · {(set.id === 'basep' ? PROMO_SLOT_LABEL : SLOT_LABEL)[cards[index].slot]}
            </span>
            {cards[index].isNew && <span className="badge-pop rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
          </div>
          <button className="rounded bg-slate-600 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-500" onClick={() => setPhase('summary')}>
            Skip
          </button>
        </div>
      )}

      {phase === 'summary' && (
        <div className="max-h-full w-full max-w-4xl space-y-4 overflow-y-auto rounded-lg bg-slate-800 p-6 ring-1 ring-slate-600">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-bold">
              {packs === 1 ? `${set.name} pack` : `${packs} ${set.name} packs`}
            </h2>
            <span className="text-sm text-emerald-300">
              {newCount} new card{newCount === 1 ? '' : 's'} unlocked
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {cards.map((c, i) => (
              <RunCard
                key={i}
                def={{ id: c.cardId, kind: 'trainer', name: c.name, imageUrl: c.imageUrl, text: '', rarity: c.slot === 'energy' ? undefined : c.slot }}
                badge={c.isNew ? 'NEW' : undefined}
              />
            ))}
          </div>
          <div className="flex justify-center">
            <button className="rounded bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-500 active:scale-95" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One card face up, flipping in, with the card viewer's tilt toward the pointer and its holo effect (HoloCard):
 * holos shine as they do on the Cards tab. Rares and holos have a glow behind them. `leaving`: it flies off the stack.
 */
function RevealedCard({ card, leaving }: { card: PackCard; leaving: boolean }) {
  const glow = card.slot === 'holo' ? 'bg-fuchsia-400/60' : card.slot === 'rare' ? 'bg-amber-300/50' : null;
  return (
    <div className={`relative w-full ${leaving ? 'card-fly-out' : 'card-flip-in'}`}>
      {glow && <div className={`pointer-events-none absolute -inset-6 rounded-[2rem] blur-2xl ${glow}`} />}
      {card.imageUrl ? (
        <HoloCard img={`${card.imageUrl}/high.webp`} name={card.name} attrs={holoAttributes({ id: card.cardId, ...card })} />
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
  const cards = useRef<(HTMLImageElement | null)[]>([]);
  useLayoutEffect(() => {
    if (reducedMotion()) return onDone();
    const mid = (count - 1) / 2;
    const animations = cards.current.map((el, i) => {
      const spread = i - mid;
      return el?.animate(
        [
          { transform: 'translate(0, 45%) scale(0.45)', opacity: 0 },
          { transform: `translate(${spread * 62}px, ${-150 + spread * spread * 7}px) rotate(${spread * 8}deg) scale(0.8)`, opacity: 1, offset: 0.55 },
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
    <div className="relative aspect-[63/88] w-72">
      {Array.from({ length: count }, (_, i) => (
        <img key={i} ref={(el) => void (cards.current[i] = el)} src={CARD_BACK} alt="" draggable={false} className="absolute inset-0 aspect-[63/88] w-full rounded-xl object-cover shadow-xl shadow-black/60" />
      ))}
    </div>
  );
}
