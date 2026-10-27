import { AREAS, areaById, mapView, previousRoute, topLevel, TOWN_WAIT_MS, type TownArea } from '@poke-tcg/idle';
import { useEffect, useState, type ReactNode } from 'react';
import type { ClientIdleRun } from '../../hooks/useIdle';
import type { Dialogue } from '../DialogueBox';
import { MapScene } from './AreaScene';

/** What counts as the player doing something (the town's wait counted again from it). */
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * A town (README: Idle Adventure): its map with the player before the Pokémon Center, and the choice the run waits for
 * (agreed with the user): the gym (or the League), grinding for it (the user's: training on the route before the town
 * up to the gym's highest level, then into the gym; greyed out once the party is there), the store, or on to the next
 * route once the gym is beaten, as the choices of a question in the text box (DialogueBox); `dialogue` in its place (the
 * catch-up's pages). With nothing done for TOWN_WAIT_MS (the user's: 10 s of inactivity, any input counting it again; no
 * prompt waits on the player), it picks the gym, or Continue once the gym is beaten, counting down in the scene's corner
 * (the run offline does the same: the engine's townWait). The store (the Poké Mart, MartScene) stops it till it's left.
 */
export function TownMenu({
  run,
  gender,
  busy,
  onGym,
  onGrind,
  onStore,
  onContinue,
  onBack,
  dialogue,
  children,
}: {
  run: ClientIdleRun;
  gender: 'male' | 'female';
  busy: boolean;
  onGym: () => void;
  onGrind: () => void;
  onStore: () => void;
  onContinue: () => void;
  /** Back to the start of the route before the town (BACK_ROUTE). */
  onBack: () => void;
  dialogue?: Dialogue | null;
  /** Drawn over the town (the party overlay). */
  children?: ReactNode;
}) {
  const town = AREAS[run.view.area] as TownArea;
  const map = mapView(town.map);
  const gym = town.gym ? areaById(town.gym) : null;
  const badge = gym && gym.kind === 'gym' ? gym.badge! : null;
  const gymDone = !gym || (badge !== null && run.view.badges.includes(badge));
  const league = gym?.kind === 'league';
  const target = run.view.grindTarget;
  const back = previousRoute(run.view.area);
  const options: { label: string; act: () => void; disabled?: boolean }[] = [
    ...(gym && !gymDone ? [{ label: league ? 'Challenge the Elite Four' : 'Gym', act: onGym }] : []),
    ...(gym && !gymDone && town.grind && target ? [{ label: `Grind to Lv. ${target}`, act: onGrind, disabled: topLevel(run.view.party) >= target }] : []),
    ...(town.marts.length > 0 ? [{ label: 'Store', act: onStore }] : []),
    ...(gymDone && !league ? [{ label: 'Continue', act: onContinue }] : []),
    // Back to the route before the town, its progress reset (the user's).
    ...(back !== null ? [{ label: `Back to ${AREAS[back]!.name}`, act: onBack }] : []),
  ];
  // The choice made for the player: the gym (or the League) before it's beaten, Continue after.
  const auto = gym && !gymDone ? { label: league ? 'Elite Four' : 'Gym', act: onGym } : { label: 'Continue', act: onContinue };
  // Not while stopped (the Stop mode): the town waits for the player's choice, however long.
  const counting = !busy && !run.view.stopped;
  const [left, setLeft] = useState(TOWN_WAIT_MS / 1000);
  // Counted again from the start whenever the run changes (a purchase, the party's order), the count resumes, or the
  // player does anything (ACTIVITY).
  useEffect(() => {
    if (!counting) return;
    setLeft(TOWN_WAIT_MS / 1000);
    let since = Date.now();
    const active = () => void (since = Date.now());
    for (const e of ACTIVITY) window.addEventListener(e, active, { passive: true });
    const timer = window.setInterval(() => {
      const remaining = Math.ceil((TOWN_WAIT_MS - (Date.now() - since)) / 1000);
      if (remaining > 0) return setLeft(remaining);
      window.clearInterval(timer);
      auto.act();
    }, 250);
    return () => {
      window.clearInterval(timer);
      for (const e of ACTIVITY) window.removeEventListener(e, active);
    };
    // The choice's action is read when it fires; restarting on every render would never let it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, run.id, run.version, auto.label]);
  const question: Dialogue = {
    text: `${town.name}. ${gymDone ? (league ? '' : 'Where to next?') : league ? 'The Pokémon League awaits.' : `${gym?.name} is here.`}`.trim(),
    choices: options.map((o) => ({ label: o.label, disabled: busy || o.disabled })),
    answer: (i) => options[i]!.act(),
  };
  return (
    <MapScene image={map.image} width={map.width} height={map.height} tile={{ x: town.stand[0], y: town.stand[1] }} player={gender === 'female' ? 'leaf' : 'red'} face="down" moveMs={0} dialogue={dialogue ?? question}>
      {counting && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-600">
          {auto.label} in {left} s
        </div>
      )}
      {children}
    </MapScene>
  );
}
