import { canEnter, CONTEST_CATEGORIES, CONTEST_RANKS, CONTEST_SCARVES, FLAVORS, natureFlavors, NATURES, ribbonId, type ContestState } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { BUTTON } from '../../utils/styles';
import { ActingRound } from '../contest/ActingRound';
import { ConditionFeeder } from '../contest/ConditionFeeder';
import { ContestResults } from '../contest/ContestResults';
import { audioVolume, CATEGORY_COLORS, ContestSprite, MoveInfo, RibbonIcon, speciesName, type ContestEntry } from '../contest/contestUi';
import { DanceRound } from '../contest/DanceRound';
import { VisualRound } from '../contest/VisualRound';
import { Toasts } from '../Toasts';
import { loadVolume, saveVolume } from './minigameSound';
import { MinigameVolume } from './MinigameVolume';

/**
 * One of the contest's songs (tools/extras/platinum_contest.py: public/extras/contest/sounds/<SEQ>.mp3) playing while
 * `song` is set, at the minigames' volume; `loop` to repeat it. The dance plays its own (DanceRound keeps time by it).
 */
function useContestSong(song: string | null, loop: boolean, volume: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!song) return;
    const a = new Audio(`/extras/contest/sounds/${song}.mp3`);
    a.loop = loop;
    a.volume = audioVolume(loadVolume());
    audio.current = a;
    a.play().catch(() => {
      // Autoplay refused (no click yet): silent.
    });
    return () => {
      a.pause();
      audio.current = null;
    };
  }, [song, loop]);
  useEffect(() => {
    if (audio.current) audio.current.volume = audioVolume(volume);
  }, [volume]);
}

/** The categories' and ranks' picker for entering: the ranks the entry can't enter yet greyed out, with why. */
function EnterForm({ entry, busy, onEnter }: { entry: ContestEntry; busy: boolean; onEnter: (rank: number, category: number) => void }) {
  const [category, setCategory] = useState(0);
  const [rank, setRank] = useState(0);
  const error = canEnter(entry.ribbons, category, rank, entry.moves.length);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {CONTEST_CATEGORIES.map((c, i) => (
          <button key={c} className={`rounded px-3 py-1 text-sm transition ${category === i ? `${CATEGORY_COLORS[i]} ring-2 ring-yellow-300` : 'bg-slate-700 hover:bg-slate-600'}`} onClick={() => setCategory(i)}>
            {c}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {CONTEST_RANKS.map((r, i) => {
          const why = canEnter(entry.ribbons, category, i, Math.max(2, entry.moves.length));
          return (
            <button key={r} title={why ?? undefined} className={`rounded px-3 py-1 text-sm transition ${rank === i ? 'bg-slate-500 ring-2 ring-yellow-300' : 'bg-slate-700 hover:bg-slate-600'} ${why ? 'opacity-50' : ''}`} onClick={() => setRank(i)}>
              {r}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40" disabled={!!error || busy} onClick={() => onEnter(rank, category)}>
          Enter the {CONTEST_CATEGORIES[category]} Contest, {CONTEST_RANKS[rank]} Rank
        </button>
        {error && <span className="text-xs text-slate-400">{error}.</span>}
      </div>
    </div>
  );
}

/** An entry's contest moves: up to 4 of its level-up learnset, each with its category and effect. */
function MovesEditor({ entry }: { entry: ContestEntry }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const [picked, setPicked] = useState<string[]>(entry.moves);
  useEffect(() => setPicked(entry.moves), [entry.moves]);
  const save = useMutation(trpc.contest.setMoves.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.contest.overview.queryKey() }), onError: (e) => toasts.push('error', e.message) }));
  const changed = picked.join() !== entry.moves.join();
  return (
    <div className="space-y-2">
      <ul className="grid gap-1 sm:grid-cols-2">
        {entry.learnable.map((m) => {
          const on = picked.includes(m.key);
          return (
            <li key={m.key}>
              <button
                className={`flex w-full rounded px-2 py-1 text-xs ring-1 transition ${on ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-800 ring-slate-700 hover:bg-slate-700'} disabled:opacity-40`}
                disabled={!on && picked.length >= 4}
                onClick={() => setPicked(on ? picked.filter((k) => k !== m.key) : [...picked, m.key])}
              >
                <MoveInfo move={m.key} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <button className={BUTTON} disabled={!changed || !picked.length || save.isPending} onClick={() => save.mutate({ species: entry.species, moves: picked })}>
          Save moves
        </button>
        <span className="text-xs text-slate-400">{picked.length}/4 chosen (2 to enter)</span>
      </div>
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

/** A nature's flavours ("likes spicy, dislikes sour"; none for the five that have neither). */
export const natureText = (nature: number) => {
  const f = natureFlavors(nature);
  return f ? `likes ${FLAVORS[f.liked]}, dislikes ${FLAVORS[f.disliked]}` : 'no favourite flavour';
};

/**
 * An entry's nature and held item (`contest.setProfile`): the nature decides the flavour it likes and dislikes when fed
 * from now on, and a scarf raises its Visual Competition score (×1.1 in its own category, ×1.05 in the two beside it).
 */
function ProfileEditor({ entry }: { entry: ContestEntry }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const save = useMutation(trpc.contest.setProfile.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.contest.overview.queryKey() }), onError: (e) => toasts.push('error', e.message) }));
  const set = (nature: number, item: string | null) => save.mutate({ species: entry.species, nature, item: item as (typeof CONTEST_SCARVES)[number]['key'] | null });
  return (
    <div className="space-y-2 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-slate-400">Nature</span>
        <select className="rounded bg-slate-700 px-2 py-1" value={entry.nature} disabled={save.isPending} onChange={(e) => set(Number(e.target.value), entry.item)}>
          {NATURES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{natureText(entry.nature)}</span>
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-20 text-slate-400">Held item</span>
        <button className={`rounded px-2 py-1 text-xs ring-1 ${!entry.item ? 'bg-slate-600 ring-yellow-300' : 'bg-slate-800 ring-slate-700 hover:bg-slate-700'}`} disabled={save.isPending} onClick={() => set(entry.nature, null)}>
          None
        </button>
        {CONTEST_SCARVES.map((sc) => (
          <button
            key={sc.key}
            title={sc.text}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ring-1 ${entry.item === sc.key ? 'bg-slate-600 ring-yellow-300' : 'bg-slate-800 ring-slate-700 hover:bg-slate-700'}`}
            disabled={save.isPending}
            onClick={() => set(entry.nature, sc.key)}
          >
            <img src={`/extras/contest/items/${sc.key}.png`} alt="" width={24} height={24} className="[image-rendering:pixelated]" />
            {sc.name}
          </button>
        ))}
      </div>
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

/** The lobby: the account's caught Pokémon (the Idle Adventure's Pokédex), one chosen to feed, set its moves and enter. */
function Lobby({ entries, busy, onEnter }: { entries: ContestEntry[]; busy: boolean; onEnter: (species: number, rank: number, category: number) => void }) {
  const [chosen, setChosen] = useState<number | null>(entries[0]?.species ?? null);
  const entry = entries.find((e) => e.species === chosen);
  if (!entries.length) return <p className="text-sm text-slate-400">Catch a Pokémon in the Idle Adventure first: each caught Pokémon in its Pokédex can enter the contests.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <ul className="grid content-start gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(5.5rem,1fr))]">
        {entries.map((e) => (
          <li key={e.species}>
            <button className={`flex w-full flex-col items-center rounded p-1 text-xs ring-1 transition hover:bg-slate-700 ${chosen === e.species ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-800 ring-slate-700'}`} onClick={() => setChosen(e.species)}>
              <ContestSprite species={e.species} size={64} />
              <span className="truncate">{speciesName(e.species)}</span>
              <span className="text-[10px] text-slate-400">{e.ribbons.length ? `${e.ribbons.length} ribbon${e.ribbons.length > 1 ? 's' : ''}` : e.moves.length < 2 ? 'No moves set' : ' '}</span>
            </button>
          </li>
        ))}
      </ul>
      {entry && (
        <section className="space-y-4 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
          <div className="flex items-center gap-3">
            <ContestSprite species={entry.species} size={96} />
            <div className="space-y-1">
              <div className="font-heading text-lg">{speciesName(entry.species)}</div>
              <div className="flex flex-wrap gap-0.5">{entry.ribbons.length ? entry.ribbons.map((r) => <RibbonIcon key={r} id={r} size={24} />) : <span className="text-xs text-slate-500">No ribbons yet</span>}</div>
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Nature and held item</h3>
            <ProfileEditor entry={entry} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Condition</h3>
            <ConditionFeeder key={entry.species} species={entry.species} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Moves for the Acting Competition</h3>
            <MovesEditor entry={entry} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Enter a contest</h3>
            <EnterForm entry={entry} busy={busy} onEnter={(rank, category) => onEnter(entry.species, rank, category)} />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The Super Contests (the Extras page's; README: Super Contests): Platinum's contests, entered with a Pokémon of the
 * Idle Adventure's Pokédex. The lobby, then the contest's three rounds (the Visual, Dance and Acting Competitions) and its
 * results, each played here and settled by the server (`contest.*`).
 */
export function SuperContest() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const overview = useQuery(trpc.contest.overview.queryOptions());
  const [volume, setVolume] = useState(loadVolume);
  const [ribbon, setRibbon] = useState<string | null>(null);
  const setContest = (contest: ContestState | null) => queryClient.setQueryData(trpc.contest.overview.queryKey(), (old) => (old ? { ...old, contest } : old));
  const onError = (e: { message: string }) => toasts.push('error', e.message);
  const start = useMutation(trpc.contest.start.mutationOptions({ onSuccess: (c) => (setRibbon(null), setContest(c)), onError }));
  const visual = useMutation(trpc.contest.visual.mutationOptions({ onSuccess: setContest, onError }));
  const dance = useMutation(trpc.contest.dance.mutationOptions({ onSuccess: setContest, onError }));
  const act = useMutation(
    trpc.contest.act.mutationOptions({
      onSuccess: (r) => {
        setContest(r.contest);
        if (r.ribbon) setRibbon(r.ribbon);
        if (r.contest.phase === 'results') queryClient.invalidateQueries({ queryKey: trpc.contest.overview.queryKey() });
      },
      onError,
    }),
  );
  const leave = useMutation(trpc.contest.leave.mutationOptions({ onSuccess: () => (setContest(null), setRibbon(null)), onError }));
  const contest = overview.data?.contest ?? null;
  const won = contest?.phase === 'results' && contest.result?.placing[0] === 0;
  useContestSong(contest?.phase === 'visual' ? 'SEQ_CO_DRESS' : contest?.phase === 'results' ? (won ? 'SEQ_CO_FANFA' : 'SEQ_CO_KEKKA') : null, contest?.phase === 'visual', volume);
  if (overview.error && !overview.data) return <p className="text-sm text-red-400">{overview.error.message}</p>;
  if (!overview.data) return <p className="text-sm text-slate-400">Loading…</p>;
  const held = contest ? overview.data.entries.find((e) => e.species === contest.entrants[0]!.species)?.ribbons.includes(ribbonId(contest.category, contest.rank)) : false;
  return (
    <div className="space-y-4">
      {!contest ? (
        <Lobby entries={overview.data.entries} busy={start.isPending} onEnter={(species, rank, category) => start.mutate({ species, rank, category })} />
      ) : contest.phase === 'visual' ? (
        <VisualRound contest={contest} busy={visual.isPending} onDone={(outfit) => visual.mutate({ expectedVersion: contest.version, outfit })} />
      ) : contest.phase === 'dance' ? (
        <DanceRound contest={contest} volume={volume} busy={dance.isPending} onDone={(presses) => dance.mutate({ expectedVersion: contest.version, presses })} />
      ) : contest.phase === 'acting' ? (
        <ActingRound contest={contest} busy={act.isPending} onAct={(move, judge) => act.mutate({ expectedVersion: contest.version, move, judge })} />
      ) : (
        <ContestResults contest={contest} ribbon={ribbon ?? (won && held ? ribbonId(contest.category, contest.rank) : null)} busy={leave.isPending} onLeave={() => leave.mutate()} />
      )}
      {contest && contest.phase !== 'results' && (
        <div className="flex justify-end">
          <button className="text-xs text-slate-400 hover:text-slate-200" disabled={leave.isPending} onClick={() => window.confirm('Give up this contest? It ends with no ribbon.') && leave.mutate()}>
            Give up the contest
          </button>
        </div>
      )}
      <div className="max-w-xs">
        <MinigameVolume
          volume={volume}
          onChange={(v) => {
            setVolume(v);
            saveVolume(v);
          }}
        />
      </div>
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}
