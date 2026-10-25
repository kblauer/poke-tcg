import { AREAS, areaById, ITEMS, mapView, topLevel, type TownArea } from '@poke-tcg/idle';
import { useState } from 'react';
import type { ClientIdleRun } from '../../hooks/useIdle';
import { commas } from '../../utils/math';
import { BUTTON } from '../../utils/styles';
import type { Dialogue } from '../DialogueBox';
import { PokedollarIcon } from '../PageNav';
import { MapScene } from './AreaScene';

/**
 * A town (README: Idle Adventure): its map with the player before the Pokémon Center, and the choice the run waits for
 * (agreed with the user): the gym (or the League), grinding for it (the user's: training on the route before the town
 * up to the gym's highest level, then into the gym; greyed out once the party is there), the store, or on to the next
 * route once the gym is beaten, as the choices of a question in the text box (DialogueBox); `dialogue` in its place (the
 * catch-up's pages).
 */
export function TownMenu({
  run,
  gender,
  busy,
  onGym,
  onGrind,
  onStore,
  onContinue,
  dialogue,
}: {
  run: ClientIdleRun;
  gender: 'male' | 'female';
  busy: boolean;
  onGym: () => void;
  onGrind: () => void;
  onStore: () => void;
  onContinue: () => void;
  dialogue?: Dialogue | null;
}) {
  const town = AREAS[run.view.area] as TownArea;
  const map = mapView(town.map);
  const gym = town.gym ? areaById(town.gym) : null;
  const badge = gym && gym.kind === 'gym' ? gym.badge! : null;
  const gymDone = !gym || (badge !== null && run.view.badges.includes(badge));
  const league = gym?.kind === 'league';
  const target = run.view.grindTarget;
  const options: { label: string; act: () => void; disabled?: boolean }[] = [
    ...(gym && !gymDone ? [{ label: league ? 'Challenge the Elite Four' : 'Gym', act: onGym }] : []),
    ...(gym && !gymDone && town.grind && target ? [{ label: `Grind to Lv. ${target}`, act: onGrind, disabled: topLevel(run.view.party) >= target }] : []),
    ...(town.marts.length > 0 ? [{ label: 'Store', act: onStore }] : []),
    ...(gymDone && !league ? [{ label: 'Continue', act: onContinue }] : []),
  ];
  const question: Dialogue = {
    text: `${town.name}. ${gymDone ? (league ? '' : 'Where to next?') : league ? 'The Pokémon League awaits.' : `${gym?.name} is here.`}`.trim(),
    choices: options.map((o) => ({ label: o.label, disabled: busy || o.disabled })),
    answer: (i) => options[i]!.act(),
  };
  return <MapScene image={map.image} width={map.width} height={map.height} tile={{ x: town.stand[0], y: town.stand[1] }} player={gender === 'female' ? 'leaf' : 'red'} face="down" moveMs={0} dialogue={dialogue ?? question} />;
}

/** The town's store (its marts' stock, without Escape Ropes and Repels: agreed): each item's price, how many the bag holds, and buying. */
export function Store({ run, busy, onBuy }: { run: ClientIdleRun; busy: boolean; onBuy: (item: string, count: number) => void }) {
  const [count, setCount] = useState<Record<string, number>>({});
  const money = run.view.money;
  return (
    <section className="space-y-3 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Poké Mart</h3>
        <span className="flex items-center gap-1 text-sm text-yellow-200">
          <PokedollarIcon /> {commas(money)}
        </span>
      </div>
      <ul className="divide-y divide-slate-700">
        {run.view.store.map((item) => {
          const data = ITEMS[item]!;
          const n = count[item] ?? 1;
          return (
            <li key={item} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-36 flex-1">{data.name}</span>
              <span className="w-20 text-right text-yellow-200/80">₱{commas(data.price)}</span>
              <span className="w-16 text-right text-slate-400">×{run.view.bag[item] ?? 0}</span>
              <input
                type="number"
                min={1}
                max={99}
                value={n}
                onChange={(e) => setCount({ ...count, [item]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                className="w-16 rounded bg-slate-700 px-2 py-1 text-right ring-1 ring-slate-600"
                aria-label={`How many ${data.name}`}
              />
              <button className={BUTTON} disabled={busy || data.price * n > money} onClick={() => onBuy(item, n)}>
                Buy
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
