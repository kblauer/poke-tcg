import { DECK_SIZE } from '@poke-tcg/shared';
import { useUnlocked } from '../hooks/useUnlocked';
import { cardTitle, type CatalogCard } from '../utils/cardList';
import { DECK_SECTIONS, cantAdd, deckSize, isHoloCard, withCards, type DeckEntry } from '../utils/deckBuilder';
import { useInspectOnRightClick } from './InspectContext';
import { CardImage } from './CardImage';

const small = 'rounded bg-slate-700 px-1.5 leading-5 hover:bg-slate-600 disabled:opacity-30';

/**
 * The deck being built, apart from the card search: its cards by section (Pokémon, Trainers, Energy) with
 * buttons to add or remove copies, the card count, and what still keeps it from being played. Cards not
 * unlocked yet are darker, marked "locked". Right-clicking a card opens it in the CardInspector.
 */
export function DeckPanel({
  entries,
  byId,
  problems,
  isLocked,
  onChange,
}: {
  entries: DeckEntry[];
  byId: Map<string, CatalogCard>;
  problems: string[];
  isLocked: (card: CatalogCard) => boolean;
  onChange: (cardId: string, by: 1 | -1) => void;
}) {
  const cards = withCards(entries, byId);
  const inspectOn = useInspectOnRightClick();
  // How many of each holo Energy were pulled: the most a deck holds.
  const { copies } = useUnlocked();
  const size = deckSize(entries);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-slate-900 p-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">Deck</span>
        <span className={size === DECK_SIZE ? 'text-emerald-400' : 'text-slate-400'}>
          {size}/{DECK_SIZE} cards
        </span>
      </div>
      {problems.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-amber-300">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-400">Ready to play.</p>
      )}
      {cards.length === 0 && <p className="text-slate-500">Click cards in the search to add them.</p>}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {DECK_SECTIONS.map(({ kind, label }) => {
          const section = cards.filter((e) => e.card.kind === kind).sort((a, b) => a.card.order - b.card.order);
          if (!section.length) return null;
          return (
            <section key={kind}>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                {label} ({section.reduce((n, e) => n + e.quantity, 0)})
              </h3>
              <ul className="space-y-1">
                {section.map(({ card, quantity }) => {
                  const locked = isLocked(card);
                  const blocked = locked ? 'Not unlocked yet' : cantAdd(entries, card, byId, copies(card.id));
                  return (
                    <li key={card.id} className={`flex items-center gap-2 ${locked ? 'opacity-50' : ''}`} {...inspectOn(card)}>
                      {card.imageUrl ? (
                        <CardImage src={`${card.imageUrl}/low.webp`} alt="" loading="lazy" className="h-9 w-[1.6rem] shrink-0 rounded-sm object-cover" />
                      ) : (
                        <div className="h-9 w-[1.6rem] shrink-0 rounded-sm bg-slate-800" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">
                          {cardTitle(card)}
                          {/* The same name as its non-holo version, so holos are tagged. */}
                          {isHoloCard(card) && (
                            <span className="ml-1 rounded bg-fuchsia-600/80 px-1 align-middle text-[10px] font-bold uppercase text-white" title={card.galaxy ? 'Galaxy foil holo' : 'Holo'}>
                              Holo
                            </span>
                          )}
                          {locked && <span className="ml-1 text-xs text-slate-400">(locked)</span>}
                          {!card.implemented && (
                            <span className="ml-1 text-xs text-amber-400" title="Not fully implemented: its Pokémon can attack for base damage, but its other effects don't work yet.">
                              (partial)
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {card.setName} #{card.number}
                        </div>
                      </div>
                      <button className={small} onClick={() => onChange(card.id, -1)} aria-label={`Remove a ${card.name}`}>
                        −
                      </button>
                      <span className="w-5 text-center tabular-nums">{quantity}</span>
                      <button className={small} disabled={blocked !== null} title={blocked ?? undefined} onClick={() => onChange(card.id, 1)} aria-label={`Add a ${card.name}`}>
                        +
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
