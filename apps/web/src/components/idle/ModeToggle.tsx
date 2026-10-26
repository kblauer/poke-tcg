import { AREAS, routeGrindPlan, type IdleAction } from '@poke-tcg/idle';
import type { ClientIdleRun } from '../../hooks/useIdle';

/** One game pixel of FireRed's 240x160 screen, in the game screen's width (container query units). */
const px = (n: number) => `${(n * 100) / 240}cqw`;

type Mode = 'route' | 'wild' | 'trainers';

/**
 * The route modes (the user's: a toggle in the game screen's top left corner, on a route or in a dungeon): Route (walking
 * on: CONTINUE_ROUTE), Wild grind (WILD_GRIND: wild Pokémon nearby, or on the most recent route with them, which its
 * title names) and Trainer grind (TRAINER_GRIND: the route's trainers in a loop); the one on lit, one that can't start
 * greyed out with why. Choosing a grind while the other is on switches straight to it.
 */
export function ModeToggle({ view, busy, onAct }: { view: ClientIdleRun['view']; busy: boolean; onAct: (action: IdleAction) => void }) {
  const mode: Mode = view.loop?.kind === 'pace' ? 'wild' : view.loop?.kind === 'trainers' ? 'trainers' : 'route';
  // A grind switched to begins where the one on began.
  const from = view.loop ? { ...view, ...view.loop.resume, loop: undefined } : view;
  const wild = routeGrindPlan(from, 'wild');
  const trainers = routeGrindPlan(from, 'trainers');
  const away = !('error' in wild) && wild.kind === 'pace' && (wild.area !== from.area || wild.leg !== from.leg);
  const options: { id: Mode; label: string; title: string; disabled: boolean; action: IdleAction }[] = [
    { id: 'route', label: 'Route', title: 'Walk on along the route', disabled: false, action: { type: 'CONTINUE_ROUTE' } },
    {
      id: 'wild',
      label: 'Wild grind',
      title: 'error' in wild ? wild.error : away ? `No wild Pokémon here: trains in ${AREAS[wild.area]!.name}` : 'Battle wild Pokémon nearby',
      disabled: 'error' in wild,
      action: { type: 'WILD_GRIND' },
    },
    { id: 'trainers', label: 'Trainer grind', title: 'error' in trainers ? trainers.error : "Fight the route's trainers in a loop (a rematch pays a quarter)", disabled: 'error' in trainers, action: { type: 'TRAINER_GRIND' } },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 [container-type:inline-size]">
      <div
        className="pointer-events-auto absolute flex"
        style={{ left: px(4), top: px(4), background: '#ffffff', border: `${px(1)} solid #4a4a62`, borderRadius: px(4), padding: px(1), gap: px(1), boxShadow: `0 ${px(1)} 0 rgba(0,0,0,0.35)` }}
        role="radiogroup"
        aria-label="Mode"
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((o) => {
          const on = o.id === mode;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.title}
              disabled={busy || o.disabled || on}
              className="whitespace-nowrap transition disabled:cursor-default"
              style={{
                fontFamily: '"Pokemon Emerald", monospace',
                fontSize: px(9),
                lineHeight: 1,
                padding: `${px(2)} ${px(4)}`,
                borderRadius: px(3),
                color: on ? '#ffffff' : o.disabled ? '#a0a0a0' : '#404040',
                background: on ? '#3994de' : 'transparent',
                textShadow: on ? `${px(1)} ${px(1)} 0 #297bb4` : `${px(1)} ${px(1)} 0 #d0d0c8`,
              }}
              onClick={() => onAct(o.action)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
