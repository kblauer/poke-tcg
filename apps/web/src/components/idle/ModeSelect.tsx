import { useEffect, useRef, useState } from 'react';
import { AREAS, modeOf, routeGrindPlan, type IdleAction, type IdleMode } from '@poke-tcg/idle';
import { useEscape } from '../../hooks/useEscape';
import type { ClientIdleRun } from '../../hooks/useIdle';

/** One game pixel of FireRed's 240x160 screen, in the game screen's width (container query units). */
const px = (n: number) => `${(n * 100) / 240}cqw`;

/**
 * The menu's place: the game screen's bottom left corner (the user's), its height (game pixels) fixed so nothing above
 * it overlaps it; in a battle just above the text box (48 game pixels and its border), so it never covers the text.
 */
export const MODE_SELECT_BOTTOM = 4;
export const MODE_SELECT_BATTLE_BOTTOM = 52;
export const MODE_SELECT_HEIGHT = 15;

const FRAME = { border: '#4a4a62', on: '#3994de', shade: '#297bb4' };
const TEXT = { fontFamily: '"Pokemon Emerald", monospace', fontSize: px(8), lineHeight: 1 };

/**
 * The run's mode (the user's: a drop-down in the game screen's bottom left corner, on every scene): Route (walking on),
 * Wild grind (wild Pokémon nearby, or on the most recent route with them, which its title names), Trainer grind (the
 * route's trainers in a loop) and Stop (stopped where it is, offline too); one that can't start greyed out with why.
 * Chosen with SET_MODE, which takes effect once the battle playing is over (queued during a wild one, IdleState.pending).
 * The choice shows at once (the user's), the menu locked until the server answers; refused, it goes back to the run's.
 */
export function ModeSelect({ view, busy, bottom, onAct }: { view: ClientIdleRun['view']; busy: boolean; bottom: number; onAct: (action: IdleAction) => unknown }) {
  const [open, setOpen] = useState(false);
  /** The mode chosen while its answer is awaited. */
  const [waiting, setWaiting] = useState<IdleMode | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEscape(() => setOpen(false), open);
  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const mode = waiting ?? modeOf(view);
  // A grind switched to begins where the one on began.
  const from = view.loop ? { ...view, ...view.loop.resume, loop: undefined } : view;
  const wild = routeGrindPlan(from, 'wild');
  const trainers = routeGrindPlan(from, 'trainers');
  // From a town (or its auto-grind) a grind goes out to the route before it (the user's).
  const inTown = view.phase === 'town' || view.phase === 'grinding';
  const away = !inTown && !('error' in wild) && wild.kind === 'pace' && (wild.area !== from.area || wild.leg !== from.leg);
  const options: { id: IdleMode; label: string; title: string; error?: string }[] = [
    { id: 'route', label: 'Route', title: 'Walk on along the route' },
    { id: 'wild', label: 'Wild grind', title: 'error' in wild ? '' : inTown ? `Battle wild Pokémon in ${AREAS[wild.area]!.name}, until Route` : away ? `No wild Pokémon here: trains in ${AREAS[wild.area]!.name}` : 'Battle wild Pokémon nearby', error: 'error' in wild ? wild.error : undefined },
    { id: 'trainers', label: 'Trainer grind', title: "Fight the route's trainers in a loop (a rematch pays a quarter)", error: 'error' in trainers ? trainers.error : undefined },
    { id: 'stop', label: 'Stop', title: 'Stop where you are, offline too, until another mode is chosen' },
  ];
  const current = options.find((o) => o.id === mode)!;
  const choose = (id: IdleMode) => {
    setOpen(false);
    if (id === mode || waiting) return;
    setWaiting(id);
    void Promise.resolve(onAct({ type: 'SET_MODE', mode: id })).finally(() => setWaiting(null));
  };

  return (
    <div className="pointer-events-none absolute inset-0 [container-type:inline-size]">
      <div ref={menu} className="pointer-events-auto absolute" style={{ left: px(4), bottom: px(bottom) }} onClick={(e) => e.stopPropagation()}>
        {/* The list, opening upward (the menu sits at the screen's bottom). */}
        {open && (
          <ul
            role="listbox"
            aria-label="Mode"
            className="absolute left-0"
            style={{ bottom: `calc(100% + ${px(1)})`, minWidth: '100%', background: '#ffffff', border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(4), padding: px(1), boxShadow: `0 ${px(1)} 0 rgba(0,0,0,0.35)` }}
          >
            {options.map((o) => {
              const on = o.id === mode;
              return (
                <li key={o.id} role="option" aria-selected={on} aria-disabled={!!o.error || undefined}>
                  <button
                    type="button"
                    title={o.error ?? o.title}
                    disabled={!!o.error}
                    className="block w-full whitespace-nowrap text-left disabled:cursor-default"
                    style={{
                      ...TEXT,
                      height: px(12),
                      padding: `0 ${px(3)}`,
                      borderRadius: px(3),
                      color: on ? '#ffffff' : o.error ? '#a0a0a0' : '#404040',
                      background: on ? FRAME.on : 'transparent',
                      textShadow: on ? `${px(1)} ${px(1)} 0 ${FRAME.shade}` : `${px(1)} ${px(1)} 0 #d0d0c8`,
                    }}
                    onClick={() => choose(o.id)}
                  >
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          title={waiting ? `Changing to ${current.label}…` : `Mode: ${current.label}. A change takes effect once the battle playing is over.`}
          disabled={busy || !!waiting}
          className="flex items-center whitespace-nowrap disabled:cursor-default"
          style={{
            ...TEXT,
            height: px(MODE_SELECT_HEIGHT),
            gap: px(3),
            padding: `0 ${px(4)}`,
            color: '#404040',
            background: '#ffffff',
            border: `${px(1)} solid ${FRAME.border}`,
            borderRadius: px(4),
            boxShadow: `0 ${px(1)} 0 rgba(0,0,0,0.35)`,
            textShadow: `${px(1)} ${px(1)} 0 #d0d0c8`,
          }}
          onClick={() => setOpen(!open)}
        >
          {current.label}
          {/* FireRed's little arrow, pointing the way the list opens. */}
          <span aria-hidden style={{ fontSize: px(6), color: mode === 'stop' ? '#e03030' : FRAME.on }}>
            ▲
          </span>
        </button>
      </div>
    </div>
  );
}
