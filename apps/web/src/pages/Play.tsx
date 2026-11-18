import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTRPC } from '../lib/trpc';
import { PageHeader } from '../components/PageHeader';
import { useTowerOverview } from '../hooks/useTower';
import { useRun } from '../hooks/useRun';
import { PAGE_WIDTH } from '../utils/layout';
import { PLAY_MODES } from '../utils/playModes';

/**
 * The Play tab (`/`): a menu of its modes (the user's), the Badge Challenge (the runs), the Battle Tower, the Idle
 * Adventure, Safari Draft and Training, each a tile filled with a scene from the games, saying how it stands. Always the menu, a run
 * or a challenge under way or not (the user's: a new account isn't put in a run either); a mode's tile opens what's under
 * way in it, and each has a Return to Play back here.
 */
export function PlayPage() {
  const tower = useTowerOverview().data;
  const run = useRun().run;
  // The Idle Adventure's run, for its tile (its query only: the mode's data loads with its page).
  const trpc = useTRPC();
  const idle = useQuery(trpc.idle.overview.queryOptions()).data?.run;
  // Safari Draft's run, for its tile.
  const safari = useQuery(trpc.safari.overview.queryOptions()).data?.run;
  const challenge = tower?.challenge;
  const status: Record<(typeof PLAY_MODES)[number]['to'], string | null> = {
    '/badge': run && run.view.phase !== 'won' && run.view.phase !== 'lost' ? `Under way: step ${Math.min(run.view.position + 1, run.view.steps.length)} of ${run.view.steps.length}.` : null,
    '/idle': idle?.status === 'ACTIVE' ? `Under way: ${idle.view.areaName}, ${idle.view.badges.length} badge${idle.view.badges.length === 1 ? '' : 's'}.` : null,
    '/tower':
      challenge?.status === 'ACTIVE' && challenge.view.saved
        ? `Challenge saved before floor ${challenge.view.floor}.`
        : challenge?.status === 'ACTIVE'
          ? `Under way: floor ${challenge.view.floor}.`
        : tower && tower.best > 0
          ? `Highest floor beaten: ${tower.best}.`
          : null,
    '/safari': safari?.status === 'ACTIVE' ? (safari.view.battles >= 15 ? 'Under way: the Champion.' : `Under way: battle ${safari.view.battles + 1} of 15.`) : null,
    '/battle': null,
  };
  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader title="Play" info="Pick a mode" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
        {PLAY_MODES.map((m) => (
          <li key={m.to}>
            {/* The scene fills the tile, the text about its middle over a dark band fading out above and below, every tile's starting the same way down so their titles line up (the user's) (over game art: kept light in every theme). */}
            <Link
              to={m.to}
              className="group relative flex h-full min-h-56 flex-col items-center justify-start overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-700 transition hover:ring-2 hover:ring-yellow-300/80"
            >
              <div
                className="absolute inset-0 bg-cover [image-rendering:pixelated] transition-transform duration-300 group-hover:scale-105"
                style={{ backgroundImage: `url(${m.picture})`, backgroundPosition: m.focus }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/80 to-transparent" />
              <div className="relative space-y-1 px-6 pb-6 pt-16 text-center">
                <div className="font-heading text-lg text-slate-50">{m.label}</div>
                <p className="text-sm text-slate-50/80">{m.text}</p>
                {status[m.to] && <p className="text-xs text-yellow-300">{status[m.to]}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
