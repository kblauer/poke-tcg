import { useEffect, useRef } from 'react';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { ENCOUNTER_STYLE, EncounterBadge, isBoss } from './encounterIcons';

/**
 * The run's path, climbing from the first step at the bottom to its last boss at the top. Past steps
 * show the encounter taken, later ones what they'll offer (faded, bosses and Gym Trainers less so); the
 * current step's options are the buttons to choose from. It scrolls on its own, kept centred on the current step.
 */
export function RunMap({ view, run }: { view: RunViewData; run: RunControl }) {
  const choosing = view.phase === 'map';
  const scroller = useRef<HTMLDivElement>(null);
  const here = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const box = scroller.current;
    const row = here.current;
    if (box && row) box.scrollTo({ top: row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2, behavior: 'smooth' });
  }, [view.position]);

  return (
    <div ref={scroller} className="relative max-h-[calc(100vh-14rem)] min-h-96 overflow-y-auto rounded-lg bg-slate-900 px-3 py-6 ring-1 ring-slate-800">
      <ol className="flex flex-col-reverse items-center">
        {view.steps.map((step, i) => {
          const past = i < view.position;
          const current = i === view.position;
          const last = i === view.steps.length - 1;
          // A boss or Gym Trainer step: its only option.
          const fixed = step.options.length === 1 ? step.options[0]! : null;
          const big = fixed !== null && isBoss(fixed.kind);
          return (
            <li key={i} ref={current ? here : undefined} className="flex w-full flex-col items-center">
              {/* The path up to the next step (above, as the list is reversed). */}
              {!last && <span className={`h-6 w-1 rounded ${past ? 'bg-slate-400' : 'bg-slate-700'}`} />}
              <div className={`relative flex w-full items-start justify-center gap-4 rounded-xl px-2 py-2 ${current ? 'bg-slate-800 ring-2 ring-yellow-300' : ''}`}>
                <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${current ? 'text-yellow-300' : 'text-slate-600'}`}>{i + 1}</span>
                {past && step.chosen !== undefined ? (
                  <EncounterBadge kind={step.options[step.chosen]!.kind} size={44} />
                ) : current && choosing ? (
                  step.options.map((o, n) => (
                    <button
                      key={n}
                      disabled={run.busy}
                      onClick={() => run.send({ type: 'CHOOSE', option: n })}
                      title={ENCOUNTER_STYLE[o.kind].name}
                      className="flex w-24 flex-col items-center gap-1 rounded-lg p-1 transition hover:bg-slate-700 active:scale-95 disabled:opacity-50"
                    >
                      <EncounterBadge kind={o.kind} size={big ? 80 : 64} />
                      <span className="text-center text-xs font-semibold leading-tight">{o.label}</span>
                    </button>
                  ))
                ) : (
                  step.options.map((o, n) => (
                    <span key={n} className="flex flex-col items-center gap-0.5" title={o.label}>
                      <EncounterBadge kind={o.kind} size={big ? 64 : current ? 56 : 40} dim={!current && !fixed} />
                      {fixed && <span className="text-[10px] text-slate-400">{o.label}</span>}
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
