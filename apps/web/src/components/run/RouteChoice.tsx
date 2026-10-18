import { boss, CENTER_PRICE, eventInfo, isBattleKind, isBossKind, OFFERS, PRICES, REWARDS, SHOP_SIZE, type MapEncounter } from '@poke-tcg/campaign';
import { CPU_DIFFICULTY_LABELS } from '@poke-tcg/game-engine';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUnlocked } from '../../hooks/useUnlocked';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';
import type { DeckEntry } from '../../utils/deckBuilder';
import { DeckSummary } from '../DeckList';
import { ENCOUNTER_STYLE, EncounterBadge } from './encounterIcons';

const button = 'rounded bg-slate-600 px-4 py-2 font-semibold transition hover:bg-slate-500 active:scale-95 disabled:opacity-40';
const primary = 'rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40';

const typeName = (t: string) => t[0]!.toUpperCase() + t.slice(1);
const range = ([low, high]: [number, number]) => (low === high ? `₱${low}` : `₱${low}–${high}`);

/** What choosing this option leads to, in a few sentences (matching rollEncounter and battleSetup in the campaign). */
function describe(o: MapEncounter, cardName: (id: string) => string): string[] {
  if (isBattleKind(o.kind)) {
    const r = REWARDS[o.kind];
    const win = `Win: ${range(r.pokedollars)}, ${r.exp} EXP and a ${r.rarity} card of your choice.`;
    const b = o.boss ? boss(o.boss) : undefined;
    switch (o.kind) {
      case 'battle':
        return [`${o.trainer} plays a deck suiting their class, at ${CPU_DIFFICULTY_LABELS.trainer} difficulty.`, win, 'Lose: 1 HP, and the run moves on.'];
      case 'elite':
        return [`${o.trainer} plays at ${CPU_DIFFICULTY_LABELS.gymLeader} difficulty. You can still walk away when you meet them.`, win, 'Lose: 1 HP, and the run moves on.'];
      case 'gymTrainer':
        return [`${o.trainer} plays a ${b?.gym ? `${typeName(b.gym.type)} ` : ''}deck at ${CPU_DIFFICULTY_LABELS.trainer} difficulty. They can't be skipped.`, win, 'Lose: 1 HP, and the run moves on.'];
      default:
        return [
          `${o.label} plays the ${b?.deckName ?? 'their own'} deck at ${CPU_DIFFICULTY_LABELS.gymLeader} difficulty.`,
          `${win.slice(0, -1)}${b?.gym ? ', and the badge' : b?.prize ? ', and the Champion Ribbon' : ''}.`,
          'Lose: 1 HP, and you face them again.',
        ];
    }
  }
  switch (o.kind) {
    case 'shop':
      return [`A card shop with ${SHOP_SIZE} cards for sale, priced by rarity (₱${PRICES.common}–${PRICES.holo}). Every card bought is unlocked for your decks.`];
    case 'gift':
      return [`A collector gives you 1 of ${OFFERS} cards, unlocked for your decks.`];
    case 'trade':
      return ["A trader offers a card at least as rare for one of your deck's cards. If you accept, it takes that card's place in your deck."];
    case 'center':
      return [`Nurse Joy restores 1 HP for ₱${CENTER_PRICE}.`];
    case 'event': {
      if (!o.event) return ['Something unexpected happens on the road. You can accept it or walk away.'];
      const info = eventInfo(o.event, cardName);
      return [`${info.title}: ${info.text}`];
    }
    default:
      return [];
  }
}

/** A deck as one card id per card, counted for DeckSummary. */
const countsOf = (cards: string[]): DeckEntry[] => [...cards.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>())].map(([cardId, quantity]) => ({ cardId, quantity }));

/**
 * The window that opens when an option on the map is clicked: what it is and what it leads to, then Go or Back. For
 * a battle, it also picks the deck to fight with: the run's current deck, or another of the account's decks that
 * can be played (the switch is made as the battle is chosen, with `run.choose`).
 */
export function RouteChoice({ option, index, view, run, onClose }: { option: MapEncounter; index: number; view: RunViewData; run: RunControl; onClose: () => void }) {
  const trpc = useTRPC();
  const battle = isBattleKind(option.kind);
  // The deck summaries need the catalog and each deck's cards; only fetched for a battle.
  const catalog = useQuery({ ...trpc.cards.list.queryOptions(), staleTime: Infinity, enabled: battle });
  const decks = useQuery({ ...trpc.decks.list.queryOptions(), enabled: battle });
  const { isLocked } = useUnlocked();
  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.id, c])), [catalog.data]);
  /** null: keep the run's deck. */
  const [deckId, setDeckId] = useState<string | null>(null);
  const traded = view.deck.length !== view.startingDeck.length || view.deck.some((id, i) => id !== view.startingDeck[i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lines = describe(option, (id) => view.cards[id]?.name ?? id);
  const go = () => {
    run.choose(index, deckId ?? undefined);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-label={option.label}
        className="flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <EncounterBadge kind={option.kind} size={48} />
          <div>
            <h3 className="text-lg font-semibold">{option.label}</h3>
            <p className="text-sm text-slate-400">{ENCOUNTER_STYLE[option.kind].name}</p>
          </div>
        </div>
        <div className="space-y-1 text-sm text-slate-300">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>

        {battle && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Battle with</span>
              <Link to="/decks" className="text-xs text-yellow-300 hover:underline">
                Build or edit decks
              </Link>
            </div>
            <ul role="radiogroup" aria-label="Deck" className="space-y-2">
              <DeckOption selected={deckId === null} onPick={() => setDeckId(null)} name={`Keep ${view.deckName ?? 'your run deck'}`} note={traded ? 'Your run deck, with its trades' : 'Your run deck'}>
                <DeckSummary entries={countsOf(view.deck)} byId={byId} isLocked={isLocked} />
              </DeckOption>
              {(decks.data ?? []).map((d) => (
                <DeckOption key={d.id} selected={deckId === d.id} onPick={() => setDeckId(d.id)} name={d.name} disabled={d.problems.length > 0} note={d.problems[0]}>
                  {d.problems.length === 0 && <DeckSummary entries={d.cards} byId={byId} isLocked={isLocked} />}
                </DeckOption>
              ))}
            </ul>
            {deckId !== null && (
              <p className="text-xs text-amber-300">This deck replaces your run deck for the rest of the run{traded ? ', and the cards you traded for leave it (they stay unlocked)' : ''}.</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button className={primary} disabled={run.busy} onClick={go}>
            {battle ? (isBossKind(option.kind) || option.kind === 'gymTrainer' ? 'Challenge' : 'Battle') : 'Go'}
          </button>
          <button className={button} onClick={onClose}>
            Back
          </button>
        </div>
      </section>
    </div>
  );
}

/** One deck to battle with. */
function DeckOption({
  name,
  note,
  selected,
  disabled = false,
  onPick,
  children,
}: {
  name: string;
  note?: string;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
  children?: ReactNode;
}) {
  return (
    <li>
      <button
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onPick}
        className={`w-full space-y-2 rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${
          selected ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500'
        } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:ring-slate-700`}
      >
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{name}</span>
          {note && <span className={`truncate text-xs ${disabled ? 'text-amber-300' : 'text-slate-400'}`}>{note}</span>}
        </span>
        {children}
      </button>
    </li>
  );
}
