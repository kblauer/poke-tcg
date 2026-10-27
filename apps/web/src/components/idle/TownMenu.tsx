import { AREAS, areaById, mapView, previousRoute, topLevel, type TownArea } from '@poke-tcg/idle';
import type { ReactNode } from 'react';
import type { ClientIdleRun } from '../../hooks/useIdle';
import type { Dialogue } from '../DialogueBox';
import { MapScene } from './AreaScene';

/**
 * A town (README: Idle Adventure): its map with the player before the Pokémon Center, and the choice the run waits for
 * (agreed with the user): the gym (or the League), grinding for it (the user's: training on the route before the town
 * up to the gym's highest level, then into the gym; greyed out once the party is there), the store, or on to the next
 * route once the gym is beaten, as the choices of a question in the text box (DialogueBox); `dialogue` in its place (the
 * catch-up's pages). Watched, it waits for the player however long (the user's, 2026-10-27: no countdown; useTownHere
 * keeps the run's time with them); only time away is played by the engine's townWait, which picks the gym, or Continue
 * once the gym is beaten, after TOWN_WAIT_MS. The store (the Poké Mart, MartScene) stops even that till it's left.
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
  const question: Dialogue = {
    text: `${town.name}. ${gymDone ? (league ? '' : 'Where to next?') : league ? 'The Pokémon League awaits.' : `${gym?.name} is here.`}`.trim(),
    choices: options.map((o) => ({ label: o.label, disabled: busy || o.disabled })),
    answer: (i) => options[i]!.act(),
  };
  return (
    <MapScene image={map.image} width={map.width} height={map.height} tile={{ x: town.stand[0], y: town.stand[1] }} player={gender === 'female' ? 'leaf' : 'red'} face="down" moveMs={0} dialogue={dialogue ?? question}>
      {children}
    </MapScene>
  );
}
