import { battleReward, boss, CENTER_PRICE, eventInfo, isBattleKind, isBossKind, ITEMS, OFFERS, PRICES, REWARD_FOCUS_LABELS, SHOP_SIZE, trainerFavorites, type MapEncounter } from '@poke-tcg/campaign';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { CPU_DIFFICULTY_LABELS, type EnergyType } from '@poke-tcg/game-engine';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useUnlocked } from '../../hooks/useUnlocked';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import type { DeckEntry } from '../../utils/deckBuilder';
import type { CatalogCard } from '../../utils/cardList';
import { DeckSummary } from '../DeckList';
import { EnergyIcon } from '../EnergyIcon';
import { CatalogContext } from '../InspectContext';
import { DeckMenu, DeckOption } from './DeckMenu';
import { ENCOUNTER_STYLE, EncounterBadge } from './encounterIcons';

/** Debug's Skip battle, under a battle's button. */
const skipButton = 'rounded bg-slate-600 px-3 py-1 text-xs font-semibold transition hover:bg-slate-500 disabled:opacity-40';

const typeName = (t: string) => t[0]!.toUpperCase() + t.slice(1);
const range = ([low, high]: [number, number]) => (low === high ? `₱${low}` : `₱${low}–${high}`);

/** What choosing this option leads to, as briefly as can be (matching rollEncounter and battleSetup in the campaign). */
function describe(o: MapEncounter, cardName: (id: string) => string): string[] {
  if (isBattleKind(o.kind)) {
    const r = battleReward(o.kind, o.focus);
    const b = o.boss ? boss(o.boss) : undefined;
    const prize = b?.gym ? 'Badge' : b?.prize ? (ITEMS[b.prize]?.name ?? 'Prize') : undefined;
    const win = [range(r.pokedollars), `${r.exp} EXP`, `${typeName(r.rarity)} card`, ...(prize ? [prize] : [])].join(' · ');
    switch (o.kind) {
      case 'battle':
        return [win];
      case 'elite':
        return [`Random deck, ${CPU_DIFFICULTY_LABELS.gymLeader} level. Can walk away.`, win];
      case 'gymTrainer':
        // A gym whose type has no basic Energy (Colorless, Metal) gives its Gym Trainer a deck of its favourite Pokémon instead.
        return [`${b?.gym?.favorites ? `${b.gym.city} Gym favourites` : b?.gym ? `${typeName(b.gym.type)}` : 'Gym'} deck. Can't skip.`, win];
      default:
        return [`${b?.deckName ?? 'Their own'} deck. Lose: rematch.`, win];
    }
  }
  switch (o.kind) {
    case 'shop':
      return [`${SHOP_SIZE} cards, ₱${PRICES.common}–${PRICES.holo}.`];
    case 'gift':
      return [`Pick 1 of ${OFFERS} cards.`];
    case 'trade':
      return ['Swap a deck card for one as rare or rarer.'];
    case 'center':
      return [`+1 HP for ₱${CENTER_PRICE}.`];
    case 'event': {
      if (!o.event) return ['Accept or walk away.'];
      const e = o.event;
      switch (e.id) {
        case 'typeFrenzy':
          return [`${typeName(e.type)} does double damage (both sides), ${e.battles} battles.`];
        case 'gamble':
          return [`Bet ₱${e.stake}, heads wins ₱${e.prize}.`];
        case 'bargain':
          return [`${cardName(e.cardId)} for 1 HP.`];
        case 'donation':
          return [`₱${e.cost} for ${e.exp} EXP.`];
        case 'luckyFind':
          return [`₱${e.pokedollars} on the ground.`];
      }
      return [];
    }
    default:
      return [];
  }
}

/** An option's title: a known Mystery's event title, otherwise its label. */
const optionTitle = (o: MapEncounter, cardName: (id: string) => string) => (o.kind === 'event' && o.event ? eventInfo(o.event, cardName).title : o.label);

/**
 * The 2 types most common among the Pokémon a trainer's class favours (trainerFavorites: their deck is built from these
 * lines first), with icons, for a battle's description. Types come from the catalog (the first Pokémon of each name).
 */
function ClassTypes({ option, catalog }: { option: MapEncounter; catalog: Map<string, CatalogCard> }) {
  const favorites = option.kind === 'battle' && option.trainer ? trainerFavorites(option.trainer) : undefined;
  if (!favorites) return null;
  const typeOf = new Map<string, string>();
  for (const c of catalog.values()) if (c.kind === 'POKEMON' && c.type && !typeOf.has(c.name)) typeOf.set(c.name, c.type);
  const counts = new Map<string, number>();
  for (const name of favorites) {
    const type = typeOf.get(name);
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  // Most first; a tie keeps the order the class lists them in.
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([type]) => type);
  if (!top.length) return null;
  const trainerClass = option.trainer!.split(' ').slice(0, -1).join(' ');
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-sky-300" title={`${trainerClass}s favour these types`}>
      {top.map((type) => (
        <span key={type} className="flex items-center gap-1">
          <EnergyIcon type={type.toLowerCase() as EnergyType} size="panel" />
          {type}
        </span>
      ))}
    </p>
  );
}

/** A deck as one card id per card, counted for DeckSummary. */
const countsOf = (cards: string[]): DeckEntry[] => [...cards.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>())].map(([cardId, quantity]) => ({ cardId, quantity }));

/**
 * The middle of the run screen while choosing the next encounter: every option of the current step at once, the
 * battles together (each with its opponent, the 2 Pokémon types their class favours, and rewards), then one
 * deck choice for whichever battle is taken, then the other encounters together (each option a button: Option). The deck choice is the
 * run's current deck (first, as Current run) or one of the account's other decks (the switch is made as the battle is
 * chosen, with `run.choose`). Clicking an option on the map instead goes there at
 * once, with the current deck. The deck choice is a drop-down menu of deck tiles (DeckMenu), with the decks starred on the
 * Collection tab below it (Favorite decks). On a phone (useIsPhone) the other stops are headed Event.
 */
export function RouteChoice({ view, run }: { view: RunViewData; run: RunControl }) {
  const trpc = useTRPC();
  const debug = useDebugEnabled();
  const options = (view.steps[view.position]?.options ?? []).map((option, index) => ({ option, index }));
  const battles = options.filter(({ option }) => isBattleKind(option.kind));
  const others = options.filter(({ option }) => !isBattleKind(option.kind));
  // The saved decks, with their cards for the summaries; only fetched when there's a battle to pick a deck for.
  const decks = useQuery({ ...trpc.decks.list.queryOptions(), enabled: battles.length > 0 });
  const byId = useContext(CatalogContext) ?? new Map();
  const { isLocked } = useUnlocked();
  /** null: keep the run's deck. */
  const [deckId, setDeckId] = useState<string | null>(null);
  const traded = view.deck.length !== view.startingDeck.length || view.deck.some((id, i) => id !== view.startingDeck[i]);
  const runDeck = useMemo(() => countsOf(view.deck), [view.deck]);
  // The automatic run deck is the run's deck itself, already first.
  const otherDecks = (decks.data ?? []).filter((d) => !d.runDeck);
  const favoriteDecks = otherDecks.filter((d) => d.favorite);
  const cardName = (id: string) => view.cards[id]?.name ?? id;
  const phone = useIsPhone();

  return (
    <section aria-label="Your next encounter" className="flex flex-col gap-5 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      {/* Battles and other stops side by side when the panel is wide enough; stacked otherwise, the other stops on top
          (column-reverse), so the battles' deck choice comes last, nearest the battles' buttons. */}
      <div className="@container">
        <div className="flex flex-col-reverse gap-5 @4xl:flex-row @4xl:items-start">
          {battles.length > 0 && (
            // Only battles on this step: the trainers on the left and the deck choice on the right, when there's room.
            <div className={`@container min-w-0 flex-1 ${others.length ? 'space-y-3' : 'grid gap-3 @3xl:grid-cols-2 @3xl:items-start @3xl:gap-5'}`}>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{battles.length === 1 ? 'Battle' : 'Battles'}</h4>
                <ul className="space-y-2">
                  {battles.map(({ option, index }) => (
                    <Option
                      key={index}
                      option={option}
                      title={option.label}
                      lines={describe(option, cardName)}
                      note={<ClassTypes option={option} catalog={byId} />}
                      action={isBossKind(option.kind) || option.kind === 'gymTrainer' ? 'Challenge' : 'Battle'}
                      disabled={run.busy}
                      onChoose={() => run.choose(index, deckId ?? undefined)}
                    >
                      {/* Debug: win it without playing. DEBUG_BUILD first: a production build drops the button altogether. */}
                      {DEBUG_BUILD && debug && (
                        <button
                          className={skipButton}
                          disabled={run.busy}
                          // Not the option's own click.
                          onClick={(e) => {
                            e.stopPropagation();
                            run.skipBattle(index, deckId ?? undefined);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          title="Debug: win this battle without playing it"
                        >
                          Skip battle
                        </button>
                      )}
                    </Option>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Battle with</span>
                  <Link to="/decks" className="text-xs text-yellow-300 hover:underline">
                    Build or edit decks
                  </Link>
                </div>
                {/* The run's deck first (picked unless another is), then the account's other decks. */}
                <DeckMenu
                  selected={deckId}
                  onPick={setDeckId}
                  decks={[
                    { id: null, name: 'Current run', note: view.deckName ? `${view.deckName}${traded ? ', with its trades' : ''}` : traded ? 'With its trades' : undefined, entries: runDeck },
                    ...otherDecks.map((d) => ({ id: d.id, name: d.name, note: d.problems[0], entries: d.cards, disabled: d.problems.length > 0, locked: d.locked })),
                  ]}
                  byId={byId}
                  isLocked={isLocked}
                  compact={phone}
                />
                {/* The decks starred on the Collection tab, a click away. */}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Favorite decks</span>
                  <span className="h-px flex-1 bg-slate-700" />
                </div>
                {favoriteDecks.length > 0 ? (
                  <ul role="radiogroup" aria-label="Favorite decks" className="grid gap-2 @md:grid-cols-2">
                    {favoriteDecks.map((d) => (
                      <DeckOption key={d.id} selected={deckId === d.id} onPick={() => setDeckId(d.id)} name={d.name} disabled={d.problems.length > 0} locked={d.locked} note={d.problems[0]}>
                        {d.problems.length === 0 && <DeckSummary entries={d.cards} byId={byId} isLocked={isLocked} compact={phone} />}
                      </DeckOption>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">Star a deck on the Collection tab to keep it here.</p>
                )}
                {deckId !== null && (
                  <p className="text-xs text-amber-300">This deck replaces your run deck for the rest of the run{traded ? ', and the cards you traded for leave it (they stay unlocked)' : ''}.</p>
                )}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="min-w-0 flex-1 space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{phone ? (others.length === 1 ? 'Event' : 'Events') : battles.length ? 'Other stops' : 'Stops'}</h4>
              <ul className="space-y-2">
                {others.map(({ option, index }) => (
                  <Option key={index} option={option} title={optionTitle(option, cardName)} lines={describe(option, cardName)} action="Go to" disabled={run.busy} onChoose={() => run.choose(index)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One option of the step, compact: its badge, title (a special battle's kind beside it: Gym Trainer, Gym leader…; not for
 * ordinary battles or the other stops, whose title says it) and what it leads to. The whole row is the button that takes
 * it (`onChoose`; `action` names it for screen readers: Battle, Challenge, Go to), with an arrow on the right; `children`
 * (the debug Skip battle) sit before the arrow.
 */
function Option({
  option,
  title,
  lines,
  note,
  action,
  disabled,
  onChoose,
  children,
}: {
  option: MapEncounter;
  title: string;
  lines: string[];
  note?: ReactNode;
  action: string;
  disabled: boolean;
  onChoose: () => void;
  children?: ReactNode;
}) {
  const kindName = isBattleKind(option.kind) && option.kind !== 'battle' ? ENCOUNTER_STYLE[option.kind].name : null;
  return (
    <li
      // A div rather than a button, as the debug Skip battle is a button inside it.
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${action} ${title}`}
      onClick={() => !disabled && onChoose()}
      onKeyDown={(e) => {
        if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onChoose();
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-lg bg-slate-900 px-3 py-2 ring-1 ring-slate-700 transition hover:bg-slate-700/60 hover:ring-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 active:scale-[0.99] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
    >
      <EncounterBadge kind={option.kind} size={32} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{title}</span>
          {kindName && <span className="text-sm text-slate-400">{kindName}</span>}
          {option.focus && <FocusTag option={option} />}
        </p>
        {note}
        {lines.map((l, i) => (
          <p key={i} className="text-sm text-slate-300">
            {l}
          </p>
        ))}
      </div>
      {children}
      <ChevronRightIcon className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-100" />
    </li>
  );
}

/** A trainer battle's reward lean (battleReward): Big payout, Extra EXP or Rarer cards. */
export function FocusTag({ option }: { option: MapEncounter }) {
  if (!option.focus) return null;
  return <span className="rounded bg-amber-500/20 px-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40">{REWARD_FOCUS_LABELS[option.focus]}</span>;
}
