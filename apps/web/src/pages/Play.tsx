import { Link } from '@tanstack/react-router';
import { PageHeader } from '../components/PageHeader';
import { usePlayRedirect, useTowerOverview } from '../hooks/useTower';
import { PAGE_WIDTH } from '../utils/layout';

/**
 * The Play tab's modes, in its menu's order: each its page, a line on it, and a scene from the games filling its tile
 * (`public/play/`, by tools/play/play_tiles.py; the user's), with where the tile's crop of it centres (`focus`).
 */
const MODES: { to: '/badge' | '/tower' | '/battle'; title: string; text: string; picture: string; focus: string }[] = [
  {
    to: '/badge',
    title: 'Badge Challenge',
    text: 'Defeat the Gym Leaders and collect all 8 badges! Then, challenge the Elite 4 and become the Champion!',
    // Cerulean Gym's entrance (FireRed): the Gym Guide by its statues.
    picture: '/play/badge.png',
    focus: '50% 75%',
  },
  {
    to: '/tower',
    title: 'Battle Tower',
    text: "Battle trainer after trainer to move up the tower! Keep winning to keep going, one loss and it's over!",
    // HGSS's Battle Tower lobby: its receptionist at her desk, Ethan before it.
    picture: '/play/tower.png',
    focus: '50% 30%',
  },
  {
    to: '/battle',
    title: 'Training',
    text: 'Practice battling or test your deck! Single battles with no pressure and no battle rewards.',
    // The Saffron City Dojo (FireRed): its Karate Master and Black Belts, Red on the mat.
    picture: '/play/training.png',
    focus: '50% 50%',
  },
];

/**
 * The Play tab (`/`): a menu of its modes (the user's), the Badge Challenge (the runs), the Battle Tower and Training,
 * each a tile filled with a scene from the games, saying how it stands. A mode under way keeps the tab on it instead
 * (usePlayRedirect): a Battle Tower challenge that isn't saved, or a run.
 */
export function PlayPage() {
  const { redirecting, loading } = usePlayRedirect();
  const tower = useTowerOverview().data;
  if (loading || redirecting) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  const challenge = tower?.challenge;
  const status: Record<(typeof MODES)[number]['to'], string | null> = {
    '/badge': null,
    '/tower':
      challenge?.status === 'ACTIVE' && challenge.view.saved
        ? `Challenge saved before floor ${challenge.view.floor}.`
        : tower && tower.best > 0
          ? `Highest floor beaten: ${tower.best}.`
          : null,
    '/battle': null,
  };
  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader title="Play" info="Pick a mode" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
        {MODES.map((m) => (
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
                <div className="font-heading text-lg text-slate-50">{m.title}</div>
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
