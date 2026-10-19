import { battleReward, boss, CENTER_PRICE, eventInfo, isBattleKind, isBossKind, ITEMS, OFFERS, PRICES, REWARD_FOCUS_LABELS, SHOP_SIZE, trainerFavorites, type MapEncounter } from '@poke-tcg/campaign';
import { CPU_DIFFICULTY_LABELS, type EnergyType } from '@poke-tcg/game-engine';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { useUnlocked } from '../../hooks/useUnlocked';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { useTRPC } from '../../lib/trpc';
import type { DeckEntry } from '../../utils/deckBuilder';
import type { CatalogCard } from '../../utils/cardList';
import { DeckSummary } from '../DeckList';
import { EnergyIcon } from '../EnergyIcon';
import { CatalogContext } from '../InspectContext';
import { ENCOUNTER_STYLE, EncounterBadge } from './encounterIcons';

const primary = 'shrink-0 rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40';

const typeName = (t: string) => t[0]!.toUpperCase() + t.slice(1);
const range = ([low, high]: [number, number]) => (low === high ? `₱${low}` : `₱${low}–${high}`);

/** What choosing this option leads to, in a few sentences (matching rollEncounter and battleSetup in the campaign). */
function describe(o: MapEncounter, cardName: (id: string) => string): string[] {
  if (isBattleKind(o.kind)) {
    const r = battleReward(o.kind, o.focus);
    const win = `Win: ${range(r.pokedollars)}, ${r.exp} EXP and a ${r.rarity} card of your choice.`;
    const b = o.boss ? boss(o.boss) : undefined;
    switch (o.kind) {
      case 'battle':
        return [win, 'Lose: 1 HP, and the run moves on.'];
      case 'elite':
        return [`Plays a random deck at ${CPU_DIFFICULTY_LABELS.gymLeader} difficulty. You can still walk away when you meet them.`, win, 'Lose: 1 HP, and the run moves on.'];
      case 'gymTrainer':
        // A gym whose type has no basic Energy (Colorless, Metal) gives its Gym Trainer a deck of its favourite Pokémon instead.
        return [
          `Plays ${b?.gym?.favorites ? `a deck of ${b.gym.city} Gym's favourite Pokémon` : `a ${b?.gym ? `${typeName(b.gym.type)} ` : ''}deck`} at ${CPU_DIFFICULTY_LABELS.trainer} difficulty. They can't be skipped.`,
          win,
          'Lose: 1 HP, and the run moves on.',
        ];
      default:
        return [
          `Plays the ${b?.deckName ?? 'their own'} deck at ${CPU_DIFFICULTY_LABELS.gymLeader} difficulty.`,
          `${win.slice(0, -1)}${b?.gym ? ', and the badge' : b?.prize ? `, and the ${ITEMS[b.prize]?.name ?? 'prize'}` : ''}.`,
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
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-sky-300">
      {trainerClass}s favour
      {top.map((type, i) => (
        <span key={type} className="flex items-center gap-1">
          {i > 0 && <span>and</span>}
          <EnergyIcon type={type.toLowerCase() as EnergyType} size="panel" />
          {type}
        </span>
      ))}
      Pokémon
    </p>
  );
}

/** A deck as one card id per card, counted for DeckSummary. */
const countsOf = (cards: string[]): DeckEntry[] => [...cards.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>())].map(([cardId, quantity]) => ({ cardId, quantity }));

/**
 * The middle of the run screen while choosing the next encounter: every option of the current step at once, the
 * battles together (each with its opponent, the 2 Pokémon types their class favours, rewards and Battle button), then one
 * deck choice for whichever battle is taken, then the other encounters together (each with Go). The deck choice is the
 * run's current deck (first, as Current run) or one of the account's other decks (the switch is made as the battle is
 * chosen, with `run.choose`). Clicking an option on the map instead goes there at
 * once, with the current deck.
 */
export function RouteChoice({ view, run }: { view: RunViewData; run: RunControl }) {
  const trpc = useTRPC();
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
  const cardName = (id: string) => view.cards[id]?.name ?? id;

  return (
    <section aria-label="Your next encounter" className="flex flex-col gap-5 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      <div>
        <h3 className="text-lg font-semibold">Your next encounter</h3>
        <p className="text-xs text-slate-400">
          Choose one here, or click it on the map's highlighted step to go straight there (battles with your current deck). You climb from the bottom to
          the run's last boss at the top.
        </p>
      </div>

      {/* Battles and other stops side by side when the panel is wide enough; stacked otherwise, the other stops on top
          (column-reverse), so the battles' deck choice comes last, nearest the battles' buttons. */}
      <div className="@container">
        <div className="flex flex-col-reverse gap-5 @4xl:flex-row @4xl:items-start">
          {battles.length > 0 && (
            <div className="@container min-w-0 flex-1 space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{battles.length === 1 ? 'Battle' : 'Battles'}</h4>
              <ul className="space-y-2">
                {battles.map(({ option, index }) => (
                  <Option key={index} option={option} lines={describe(option, cardName)} note={<ClassTypes option={option} catalog={byId} />}>
                    <button className={primary} disabled={run.busy} onClick={() => run.choose(index, deckId ?? undefined)}>
                      {isBossKind(option.kind) || option.kind === 'gymTrainer' ? 'Challenge' : 'Battle'}
                    </button>
                  </Option>
                ))}
              </ul>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Battle with</span>
                  <Link to="/decks" className="text-xs text-yellow-300 hover:underline">
                    Build or edit decks
                  </Link>
                </div>
                <div role="radiogroup" aria-label="Deck" className="space-y-3">
                  {/* The run's deck on its own row, then a divider, then the account's other decks. */}
                  <ul className="grid gap-2 @md:grid-cols-2">
                    <DeckOption selected={deckId === null} onPick={() => setDeckId(null)} name="Current run" note={view.deckName ? `${view.deckName}${traded ? ', with its trades' : ''}` : traded ? 'With its trades' : undefined}>
                      <DeckSummary entries={runDeck} byId={byId} isLocked={isLocked} />
                    </DeckOption>
                  </ul>
                  {otherDecks.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Or switch to</span>
                        <span className="h-px flex-1 bg-slate-700" />
                      </div>
                      <ul className="grid gap-2 @md:grid-cols-2">
                        {otherDecks.map((d) => (
                          <DeckOption key={d.id} selected={deckId === d.id} onPick={() => setDeckId(d.id)} name={d.name} disabled={d.problems.length > 0} note={d.problems[0]}>
                            {d.problems.length === 0 && <DeckSummary entries={d.cards} byId={byId} isLocked={isLocked} />}
                          </DeckOption>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                {deckId !== null && (
                  <p className="text-xs text-amber-300">This deck replaces your run deck for the rest of the run{traded ? ', and the cards you traded for leave it (they stay unlocked)' : ''}.</p>
                )}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="min-w-0 flex-1 space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{battles.length ? 'Other stops' : 'Stops'}</h4>
              <ul className="space-y-2">
                {others.map(({ option, index }) => (
                  <Option key={index} option={option} lines={describe(option, cardName)}>
                    <button className={primary} disabled={run.busy} onClick={() => run.choose(index)}>
                      Go
                    </button>
                  </Option>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** One option of the step: its badge, name and kind, what it leads to, and its button. */
function Option({ option, lines, note, children }: { option: MapEncounter; lines: string[]; note?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-slate-900 p-3 ring-1 ring-slate-700">
      <EncounterBadge kind={option.kind} size={40} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{option.label}</span> <span className="text-sm text-slate-400">{ENCOUNTER_STYLE[option.kind].name}</span>
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
    </li>
  );
}

/** A trainer battle's reward lean (battleReward): Big payout, Extra EXP or Rarer cards. */
export function FocusTag({ option }: { option: MapEncounter }) {
  if (!option.focus) return null;
  return <span className="rounded bg-amber-500/20 px-1.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40">{REWARD_FOCUS_LABELS[option.focus]}</span>;
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
        className={`h-full w-full space-y-2 rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${
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
