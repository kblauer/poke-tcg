import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import { boss, bossLabel, bossTypes, generation, generationLock, RUN_TYPES, STARTER_DECKS, STARTER_IDS, type BossId, type RunTypeId, type StarterId } from '@poke-tcg/campaign';
import { typeName } from '@poke-tcg/game-engine';
import { Link } from '@tanstack/react-router';
import { useContext, useState, type ReactNode } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { Overview, RunControl } from '../../hooks/useRun';
import { useDebugFlags } from '../../hooks/useDebugFlags';
import { DEBUG_BUILD } from '../../utils/debug';
import { DeckSummary } from '../DeckList';
import { DeckMenu, DeckOption } from './DeckMenu';
import { CatalogContext } from '../InspectContext';
import { EnergyIcon } from '../EnergyIcon';
import { towerUnderway, useTowerOverview } from '../../hooks/useTower';

type RunTypeInfo = Overview['runTypes'][number];

/** A boss's overworld sprite from the remake of their game (FireRed/LeafGreen for Kanto), drawn at 3× with crisp pixels. */
function BossSprite({ id, scale = 3 }: { id: BossId; scale?: number }) {
  const b = boss(id);
  return <img src={`/trainers/${id}.png`} alt={b.name} title={bossLabel(b)} style={{ height: 20 * scale }} className="w-auto shrink-0 [image-rendering:pixelated]" draggable={false} />;
}

/**
 * One run type to pick: its final boss's sprite, its name, and who it ends with. A single-gym run shows its gym leader's
 * name and the types their deck is built around (bossTypes) on one line; a longer run a row of all its bosses. Beaten runs are ticked (Badge),
 * locked ones say what unlocks them and can't be picked.
 */
function RunTypeOption({ info, selected, onPick, start }: { info: RunTypeInfo; selected: boolean; onPick: () => void; start?: { disabled: boolean; onStart: () => void } }) {
  const ids = RUN_TYPES[info.id].segments.flatMap((s) => s.bosses);
  const last = boss(ids.at(-1)!);
  const locked = info.locked !== null;
  return (
    // min-w-0: a long name is cut short, never widening its column past the list.
    <li className="relative min-w-0">
      <button
        role="radio"
        aria-checked={selected}
        disabled={locked}
        onClick={onPick}
        className={`flex h-full w-full items-center gap-1.5 rounded-lg py-2 pl-1.5 pr-3 text-left ring-1 transition ${
          selected ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900 ring-slate-700 hover:ring-slate-500'
        } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:ring-slate-700`}
      >
        {/* The sprite at its own width, close to the tile's left edge and to the text (the user's: room for a Start button), and
            under it, once beaten, a tick and how many times (the user's); the two centred together, the sprite moving up for it. */}
        <span className="flex shrink-0 flex-col items-center">
          <span className={`flex ${locked ? 'brightness-50 grayscale' : ''}`}>
            <BossSprite id={ids.at(-1)!} />
          </span>
          {info.beaten > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold leading-4 text-emerald-300" title={`Beaten ${info.beaten} time${info.beaten === 1 ? '' : 's'}`} aria-label={`Beaten ${info.beaten} time${info.beaten === 1 ? '' : 's'}`}>
              <CheckCircleIcon sx={{ fontSize: 14 }} />
              {info.beaten > 1 && `×${info.beaten}`}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          {/* Room for Start run on the name's line only (the lines under it keep the tile's width; the user's). */}
          <span className={`flex items-center gap-2 ${selected && start ? 'pr-[5.5rem]' : ''}`}>
            <span className="truncate font-medium">{info.name}</span>
          </span>
          {locked ? (
            <span className="flex items-center gap-1 text-xs text-amber-300">
              <LockIcon sx={{ fontSize: 13 }} />
              {info.locked}
            </span>
          ) : ids.length === 1 ? (
            // The leader's name and their types on one line (the user's: no "Gym Leader", which every gym run's is), the run's
            // description under them.
            <>
              <span className="flex min-w-0 items-center gap-x-2 text-xs">
                <span className="truncate text-slate-300" title={bossLabel(last)}>
                  {last.name}
                </span>
                {bossTypes(last).map((t) => (
                  <span key={t} className="flex shrink-0 items-center gap-1 text-sky-300">
                    <EnergyIcon type={t} size="sm" />
                    {typeName(t)}
                  </span>
                ))}
              </span>
              <span className="block text-xs text-slate-400">{info.description}</span>
            </>
          ) : (
            <>
              <span className="block truncate text-xs text-slate-300">{info.bosses}</span>
              <span className="flex flex-wrap items-end gap-0.5">
                {ids.map((id) => (
                  <BossSprite key={id} id={id} scale={1} />
                ))}
              </span>
            </>
          )}
        </span>
      </button>
      {/* The selected run's Start, in its top right corner (the user's): a button of its own beside the tile's. */}
      {selected && start && (
        <button
          className="absolute right-1 top-1 rounded bg-blue-600 px-3 py-1 text-sm font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40"
          disabled={start.disabled}
          onClick={start.onStart}
          aria-label={`Start run: ${info.name}`}
        >
          Start run
        </button>
      )}
    </li>
  );
}

/**
 * Picks the next run's type and one of your decks (built on the Collection tab), then starts it. Run types are buttons
 * (RunTypeOption) for the generation picked in the dropdown (Gen 1 · Kanto, Gen 2 · Johto…); locked ones can't be picked, nor
 * can a generation whose previous one's Gym Challenge isn't beaten yet (generationLock; listed, saying so). The
 * deck is picked from a drop-down menu of deck tiles (DeckMenu, as when battling in a run), with the favorite decks under
 * it; those that break the rules or hold cards you haven't unlocked are listed with why, and can't be picked. A new
 * account's first run (`needsStarter`) picks one of the three starter decks instead (STARTER_DECKS, the user's), which
 * becomes its first deck. Not while a Battle Tower challenge is under way and not saved (the server refuses it too).
 * `extra` goes beside the Start new run button (Return to Play).
 */
export function NewRunPicker({ overview: given, run, title, defaultType, extra }: { overview: Overview; run: RunControl; title: string; defaultType?: RunTypeId; extra?: ReactNode }) {
  // Debug mode's switch to unlock everything (useDebugFlags) unlocks every run type (started with debugStart); `debugLocked`: the ones that were locked.
  // The catalog (the deck menu waits for it).
  const byId = useContext(CatalogContext);
  const debugFlags = useDebugFlags();
  const unlockAll = DEBUG_BUILD && debugFlags.unlockAll;
  const debugLocked = new Set(unlockAll ? given.runTypes.filter((t) => t.locked !== null).map((t) => t.id) : []);
  const overview = unlockAll ? { ...given, runTypes: given.runTypes.map((t) => ({ ...t, locked: null })) } : given;
  const open = overview.runTypes.filter((t) => t.locked === null);
  // Why each generation can't be picked in the dropdown (the Gym Challenge before it not beaten: generationLock), or null.
  const beaten = new Set(overview.runTypes.filter((t) => t.beaten > 0).map((t) => t.id));
  const genLock = (g: number) => (unlockAll ? null : generationLock(g, beaten));
  // To start with: `defaultType`, else the first open run of the latest run's generation (kept with the account, as the
  // latest run; agreed 2026-10-23) while that generation is open, else the first open run.
  const lastGen = overview.run ? RUN_TYPES[overview.run.view.type].generation : null;
  const inLastGen = open.find((t) => RUN_TYPES[t.id].generation === lastGen) ?? (lastGen !== null && !genLock(lastGen) ? overview.runTypes.find((t) => RUN_TYPES[t.id].generation === lastGen) : undefined);
  const [type, setType] = useState<RunTypeId>(open.find((t) => t.id === defaultType)?.id ?? inLastGen?.id ?? open[0]?.id ?? overview.runTypes[0]!.id);
  // The generation dropdown shows one generation's runs at a time, starting with the picked run's.
  const generations = [...new Set(overview.runTypes.map((t) => RUN_TYPES[t.id].generation))];
  const [gen, setGen] = useState(RUN_TYPES[type].generation);
  const shown = overview.runTypes.filter((t) => RUN_TYPES[t.id].generation === gen);
  const pickGeneration = (g: number) => {
    setGen(g);
    const runs = overview.runTypes.filter((t) => RUN_TYPES[t.id].generation === g);
    setType((runs.find((t) => t.locked === null) ?? runs[0])!.id);
  };
  const playable = overview.decks.filter((d) => d.problems.length === 0);
  const [picked, setPicked] = useState<string | null>(null);
  // To start with: the deck played most recently, or (deleted, or now unplayable) the top one in the deck list that can be played.
  const lastPlayed = playable.find((d) => d.id === overview.lastDeckId);
  const deckId = picked ?? lastPlayed?.id ?? playable[0]?.id ?? null;
  const favorites = overview.decks.filter((d) => d.favorite);
  const [starter, setStarter] = useState<StarterId>(STARTER_IDS[0]);
  const tower = towerUnderway(useTowerOverview().data?.challenge);
  const phone = useIsPhone();
  const chosen = overview.runTypes.find((t) => t.id === type);
  // Starting the picked run (the selected tile's Start run) with the deck picked (or the starter).
  const canStart = !run.busy && !tower && (overview.needsStarter || !!deckId) && chosen?.locked === null;
  const start = () => {
    if (overview.needsStarter) run.start(type, { starter }, debugLocked.has(type));
    else if (deckId) run.start(type, { deckId }, debugLocked.has(type));
  };
  // The first generation still locked, to say what opens it.
  const nextLocked = generations.find((g) => genLock(g) !== null);
  return (
    <section className="space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
      {/* The heading and the generation on one line (no "Run" or "Generation" labels, the user's). */}
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <select
          aria-label="Generation"
          className="ml-auto min-w-0 max-w-full rounded bg-slate-900 px-2 py-1 text-sm text-slate-100 ring-1 ring-slate-600 focus:outline-none focus:ring-slate-400"
          value={gen}
          onChange={(e) => pickGeneration(Number(e.target.value))}
        >
          {generations.map((g) => (
            // A locked generation is listed but can't be picked; short, so the list fits a phone (what opens it is said under the row).
            <option key={g} value={g} disabled={genLock(g) !== null} title={genLock(g) ?? undefined}>
              Gen {g} · {generation(g).region}
              {genLock(g) && ' (locked)'}
            </option>
          ))}
        </select>
      </div>
      <div className="@container space-y-2 text-sm">
        {nextLocked !== undefined && (
          <p className="text-xs text-slate-500">
            Gen {nextLocked} opens once you {genLock(nextLocked)!.replace(/^Beat/, 'beat').replace(/ first$/, '')}.
          </p>
        )}
        <ul role="radiogroup" aria-label={`${generation(gen).region} runs`} className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
          {shown.map((t) => (
            <RunTypeOption key={t.id} info={t} selected={t.id === type} onPick={() => setType(t.id)} start={{ disabled: !canStart, onStart: start }} />
          ))}
        </ul>
      </div>

      {overview.needsStarter ? (
        // The account's first run: a starter deck to pick, its tile showing what it holds; it's then the account's own deck.
        <div className="@container space-y-2 text-sm">
          <span className="text-slate-400">Pick your starter deck</span>
          <ul role="radiogroup" aria-label="Starter decks" className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
            {STARTER_IDS.map((id) => {
              const s = STARTER_DECKS[id];
              return (
                <DeckOption key={id} selected={starter === id} onPick={() => setStarter(id)} name={s.name}>
                  <span className="block text-xs text-slate-400">{s.text}</span>
                  {byId && <DeckSummary entries={s.list.map(([cardId, quantity]) => ({ cardId, quantity }))} compact={phone} />}
                </DeckOption>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">It's yours to keep: it goes in your deck list, its cards unlocked, to edit on the Collection tab.</p>
        </div>
      ) : (
        <div className="@container space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-slate-400">Deck</span>
            <Link to="/decks" className="text-xs text-yellow-300 hover:underline">
              Build or edit decks
            </Link>
          </div>
          {/* A drop-down menu of deck tiles, as when battling in a run (DeckMenu), with the favorite decks under it. */}
          {overview.decks.length > 0 && byId && (
            <>
              <DeckMenu
                selected={deckId}
                onPick={(id) => id && setPicked(id)}
                decks={overview.decks.map((d) => ({ id: d.id, name: d.name, note: d.problems[0], entries: d.cards, disabled: d.problems.length > 0, locked: d.locked }))}
                compact={phone}
              />
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Favorite decks</span>
                <span className="h-px flex-1 bg-slate-700" />
              </div>
              {favorites.length > 0 ? (
                <ul role="radiogroup" aria-label="Favorite decks" className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {favorites.map((d) => (
                    <DeckOption key={d.id} selected={deckId === d.id} onPick={() => setPicked(d.id)} name={d.name} disabled={d.problems.length > 0} locked={d.locked} note={d.problems[0]}>
                      {d.problems.length === 0 && <DeckSummary entries={d.cards} compact={phone} />}
                    </DeckOption>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Star a deck on the Collection tab to keep it here.</p>
              )}
            </>
          )}
          {playable.length === 0 && <p className="text-xs text-amber-300">None of your decks can be played yet: fix one on the Collection tab.</p>}
        </div>
      )}

      <p className="text-xs text-slate-500">The new run starts with ₱500 and 3 HP.</p>
      {tower && <p className="text-xs text-amber-300">Save or finish your Battle Tower challenge first.</p>}
      {/* Start is on the selected run's tile (RunTypeOption). */}
      {extra && <div className="flex flex-wrap items-center gap-3">{extra}</div>}
    </section>
  );
}
