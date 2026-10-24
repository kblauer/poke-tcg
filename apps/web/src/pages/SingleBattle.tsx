import { BOSSES, ELITE_FOUR, KANTO_GYMS, type BossId } from '@poke-tcg/campaign';
import { CPU_DIFFICULTIES, CPU_DIFFICULTY_LABELS, type CpuDifficulty } from '@poke-tcg/game-engine';
import { singleBattleOpponent, type SingleBattleOpponent } from '@poke-tcg/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { DeckSummary, LOCKED_TAG, type SavedDeck } from '../components/DeckList';
import { useTRPC } from '../lib/trpc';
import { PageHeader } from '../components/PageHeader';
import { PAGE_WIDTH } from '../utils/layout';

/** localStorage key for the last choices, so they're still picked when you come back after a battle. */
const PREFS_KEY = 'poke-tcg.single-battle';
/** The deck choice for the fixed test deck (game.create's null deckId). */
const TEST_DECK = 'test';

interface Prefs {
  /** A deck id, or TEST_DECK; missing: the first playable deck. */
  deck?: string;
  difficulty: CpuDifficulty;
  opponent: SingleBattleOpponent;
}
const DEFAULT_PREFS: Prefs = { difficulty: 'trainer', opponent: { kind: 'trainer' } };

/** The saved choices, each checked, since they may be from an older version (a boss or difficulty that's gone). */
function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      deck: typeof saved.deck === 'string' ? saved.deck : undefined,
      difficulty: saved.difficulty && CPU_DIFFICULTIES.includes(saved.difficulty) ? saved.difficulty : DEFAULT_PREFS.difficulty,
      opponent: singleBattleOpponent.safeParse(saved.opponent).data ?? DEFAULT_PREFS.opponent,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** The bosses to pick from, in the order a run meets them. */
const BOSS_GROUPS: { label: string; ids: BossId[] }[] = [
  { label: 'Gym leaders', ids: KANTO_GYMS },
  { label: 'Elite Four', ids: ELITE_FOUR },
  { label: 'Champion', ids: ['blue'] },
];

const opponentLabel = (o: SingleBattleOpponent) => (o.kind === 'boss' ? BOSSES[o.bossId].name : 'a random trainer');

const panel = 'space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600';
const choice = (selected: boolean) =>
  `rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${selected ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500'}`;

/**
 * Single battles outside runs (`/battle`): pick one of your decks (or the fixed test deck), a random trainer
 * or a boss to face, and how hard the CPU plays. The deck for the next battle is shown large at the top,
 * with links to edit it or build a new one on the Collection tab. The choices are remembered between battles.
 */
export function SingleBattlePage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const decks = useQuery(trpc.decks.list.queryOptions());
  const [prefs, setPrefs] = useState(loadPrefs);
  const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Not saved (private window or blocked storage): the choices just aren't remembered.
    }
  }, [prefs]);

  const create = useMutation(trpc.game.create.mutationOptions({ onSuccess: ({ id }) => navigate({ to: '/game/$gameId', params: { gameId: id } }) }));

  if (decks.error) return <p className={`${PAGE_WIDTH} text-red-400`}>{decks.error.message}</p>;
  if (!decks.data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;

  const playable = decks.data.filter((d) => d.problems.length === 0);
  // The remembered deck, unless it's gone or can't be played any more.
  const deckId = prefs.deck === TEST_DECK || playable.some((d) => d.id === prefs.deck) ? prefs.deck! : (playable[0]?.id ?? TEST_DECK);
  const deck = decks.data.find((d) => d.id === deckId);
  const { opponent, difficulty } = prefs;

  return (
    <div className={`space-y-6 ${PAGE_WIDTH}`}>
      <PageHeader title="Training" />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
        <section className={panel}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold">Your deck</h3>
            <span className="flex gap-3 text-xs">
              {deck && (
                <Link to="/decks" search={{ deck: deck.id }} className="text-yellow-300 hover:underline">
                  Edit this deck
                </Link>
              )}
              <Link to="/decks" search={{ deck: 'new' }} className="text-yellow-300 hover:underline">
                New deck
              </Link>
            </span>
          </div>
          <ChosenDeck deck={deck} />

          <div className="space-y-2">
            <span className="text-sm text-slate-400">Change deck</span>
            <ul role="radiogroup" aria-label="Deck" className="grid gap-2 sm:grid-cols-2">
              {decks.data.map((d) => (
                <li key={d.id}>
                  <DeckChoice deck={d} selected={d.id === deckId} onPick={() => set({ deck: d.id })} />
                </li>
              ))}
              <li>
                <button role="radio" aria-checked={deckId === TEST_DECK} onClick={() => set({ deck: TEST_DECK })} className={`${choice(deckId === TEST_DECK)} h-full w-full`}>
                  <span className="block font-medium">Test deck</span>
                  <span className="block text-xs text-slate-400">The fixed Base Set deck, for testing.</span>
                </button>
              </li>
            </ul>
            {playable.length === 0 && <p className="text-xs text-amber-300">None of your decks can be played yet: fix one on the Collection tab, or use the test deck.</p>}
          </div>
        </section>

        <section className={panel}>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Opponent</h3>
            <div role="radiogroup" aria-label="Opponent" className="grid grid-cols-2 gap-2">
              <button role="radio" aria-checked={opponent.kind === 'trainer'} className={choice(opponent.kind === 'trainer')} onClick={() => set({ opponent: { kind: 'trainer' } })}>
                Random trainer
              </button>
              <button
                role="radio"
                aria-checked={opponent.kind === 'boss'}
                className={choice(opponent.kind === 'boss')}
                onClick={() => opponent.kind !== 'boss' && set({ opponent: { kind: 'boss', bossId: KANTO_GYMS[0]! } })}
              >
                Gym leader
              </button>
            </div>
            {opponent.kind === 'boss' ? (
              <>
                <select
                  className="w-full rounded bg-slate-900 px-3 py-2 text-sm ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
                  value={opponent.bossId}
                  onChange={(e) => set({ opponent: { kind: 'boss', bossId: e.target.value as BossId } })}
                  aria-label="Gym leader"
                >
                  {BOSS_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.ids.map((id) => (
                        <option key={id} value={id}>
                          {BOSSES[id].name} ({BOSSES[id].deckName})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="text-xs text-slate-400">They play the {BOSSES[opponent.bossId].deckName} deck, as in a run.</p>
              </>
            ) : (
              <p className="text-xs text-slate-400">A trainer from the run's map, with a new random deck suiting them each battle.</p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Difficulty</h3>
            <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-3 gap-2">
              {CPU_DIFFICULTIES.map((d) => (
                <button key={d} role="radio" aria-checked={difficulty === d} className={`${choice(difficulty === d)} text-center`} onClick={() => set({ difficulty: d })}>
                  {CPU_DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-700 pt-4">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-yellow-300">{deck?.name ?? 'Test deck'}</span> vs {opponentLabel(opponent)}, {CPU_DIFFICULTY_LABELS[difficulty]} difficulty
            </p>
            <button
              className="w-full rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40"
              disabled={create.isPending}
              onClick={() => create.mutate({ deckId: deckId === TEST_DECK ? null : deckId, difficulty, opponent })}
            >
              {create.isPending ? 'Starting…' : 'Battle!'}
            </button>
            {create.error && <p className="text-sm text-red-400">{create.error.message}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

/** The deck the next battle uses, large: its name, headline Pokémon and card split. */
function ChosenDeck({ deck }: { deck: SavedDeck | undefined }) {
  return (
    <div className="space-y-3 rounded-lg bg-slate-900 p-4 ring-2 ring-yellow-300">
      <p className="text-xs uppercase tracking-wide text-slate-400">Next battle</p>
      <p className="truncate text-xl font-bold text-yellow-300">{deck?.name ?? 'Test deck'}</p>
      {deck ? (
        <DeckSummary entries={deck.cards} />
      ) : (
        <p className="text-sm text-slate-400">The fixed Base Set test deck: Charizard and Blastoise lines, and one each of a spread of Trainers to try out.</p>
      )}
    </div>
  );
}

/** One deck to pick: its name and summary, or why it can't be played. */
function DeckChoice({
  deck,
  selected,
  onPick,
}: {
  deck: SavedDeck;
  selected: boolean;
  onPick: () => void;
}) {
  const ok = deck.problems.length === 0;
  return (
    <button
      role="radio"
      aria-checked={selected}
      disabled={!ok}
      onClick={onPick}
      className={`${choice(selected)} h-full w-full space-y-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:ring-slate-700`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium">{deck.name}</span>
        {deck.locked && LOCKED_TAG}
      </span>
      {ok ? <DeckSummary entries={deck.cards} /> : <span className="block truncate text-xs text-amber-300">{deck.problems[0]}</span>}
    </button>
  );
}
