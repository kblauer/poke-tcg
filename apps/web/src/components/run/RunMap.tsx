import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { ENCOUNTER_STYLE, EncounterBadge, encounterLabel, isBoss } from './encounterIcons';
import { FocusTag } from './RouteChoice';

/** On a phone, how many steps before and after the current one the map shows without scrolling. */
const AROUND = 2;

/**
 * The run's path, climbing from the first step at the bottom to its last boss at the top. Past steps
 * show the encounter taken, later ones what they'll offer (faded, bosses and Gym Trainers less so); the
 * current step's options are quick-select buttons: clicking one goes there at once, a battle with the current deck
 * (RouteChoice, beside the map, describes them all and can switch decks). It scrolls on its own, kept centred on the current step.
 * On a phone (useIsPhone) it's only as tall as the current step and AROUND steps either side of it (measured), with
 * smaller badges, so it leaves room for the encounter below; the rest of the route is a scroll away.
 */
export function RunMap({ view, run }: { view: RunViewData; run: RunControl }) {
  const choosing = view.phase === 'map';
  const scroller = useRef<HTMLDivElement>(null);
  const here = useRef<HTMLLIElement>(null);
  const phone = useIsPhone();
  /** On a phone: the map's height, from the step AROUND above the current one to the one AROUND below. */
  const [height, setHeight] = useState<number | undefined>();

  /** On a phone: the rows at the top and bottom of the steps shown (the list runs bottom to top: the later step is higher). */
  const shownRows = () => {
    const rows = [...(scroller.current?.querySelectorAll<HTMLElement>('[data-step]') ?? [])];
    return { top: rows[Math.min(rows.length - 1, view.position + AROUND)], bottom: rows[Math.max(0, view.position - AROUND)] };
  };
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!phone || !box) return setHeight(undefined);
    const { top, bottom } = shownRows();
    if (top && bottom) setHeight(bottom.offsetTop + bottom.offsetHeight - top.offsetTop);
  }, [phone, view.position, view.steps.length, choosing]);

  useEffect(() => {
    const box = scroller.current;
    const row = here.current;
    if (!box || !row) return;
    // A phone shows exactly the steps around this one, from the top one; otherwise this step is centred.
    const top = phone ? shownRows().top : undefined;
    const to = top ? top.offsetTop : row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
    box.scrollTo({ top: to, behavior: 'smooth' });
  }, [view.position, height]);

  return (
    <div
      ref={scroller}
      style={phone ? { height } : undefined}
      className={`relative overflow-y-auto overscroll-contain rounded-lg bg-slate-900 px-3 ring-1 ring-slate-800 ${phone ? 'py-3' : 'max-h-[calc(100vh-14rem)] min-h-96 py-6'}`}
    >
      <ol className="flex flex-col-reverse items-center">
        {view.steps.map((step, i) => {
          const past = i < view.position;
          const current = i === view.position;
          const last = i === view.steps.length - 1;
          // A boss or Gym Trainer step: its only option.
          const fixed = step.options.length === 1 ? step.options[0]! : null;
          const big = fixed !== null && isBoss(fixed.kind);
          return (
            <li key={i} data-step ref={current ? here : undefined} className="flex w-full flex-col items-center">
              {/* The path up to the next step (above, as the list is reversed). */}
              {!last && <span className={`w-1 rounded ${phone ? 'h-3' : 'h-6'} ${past ? 'bg-slate-400' : 'bg-slate-700'}`} />}
              <div className={`relative flex w-full items-start justify-center gap-4 rounded-xl px-2 py-2 ${current ? 'bg-slate-800 ring-2 ring-yellow-300' : ''}`}>
                <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${current ? 'text-yellow-300' : 'text-slate-600'}`}>{i + 1}</span>
                {past && step.chosen !== undefined ? (
                  <EncounterBadge kind={step.options[step.chosen]!.kind} size={phone ? 36 : 44} />
                ) : current && choosing ? (
                  step.options.map((o, n) => (
                    <button
                      key={n}
                      disabled={run.busy}
                      onClick={() => run.choose(n)}
                      title={`${ENCOUNTER_STYLE[o.kind].name}: go now`}
                      className="flex w-24 flex-col items-center gap-1 rounded-lg p-1 transition hover:bg-slate-700 active:scale-95 disabled:opacity-50"
                    >
                      <EncounterBadge kind={o.kind} size={phone ? (big ? 64 : 52) : big ? 80 : 64} />
                      <span className="text-center text-xs font-semibold leading-tight">{encounterLabel(o)}</span>
                      <FocusTag option={o} />
                    </button>
                  ))
                ) : (
                  step.options.map((o, n) => (
                    <span key={n} className="flex flex-col items-center gap-0.5" title={encounterLabel(o)}>
                      <EncounterBadge kind={o.kind} size={phone ? (big ? 48 : current ? 48 : 32) : big ? 64 : current ? 56 : 40} dim={!current && !fixed} />
                      {fixed && <span className="text-[10px] text-slate-400">{encounterLabel(o)}</span>}
                    </span>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
