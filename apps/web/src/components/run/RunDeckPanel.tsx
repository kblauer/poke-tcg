import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { RunViewData } from '../../hooks/useRun';
import { RunCard } from './RunCard';

const GROUPS = [
  { title: 'Pokémon', test: (kind: string, trainer: boolean) => kind === 'pokemon' && !trainer },
  { title: 'Trainers', test: (kind: string, trainer: boolean) => kind === 'trainer' || trainer },
  { title: 'Energy', test: (kind: string) => kind === 'energy' },
];

/**
 * The cards unlocked in this run (gifts, rewards, shops, trades, events), one per kind with how many came,
 * grouped into Pokémon, Trainers and Energy. The deck itself is on the Collection tab. On a phone (useIsPhone) it starts
 * minimised to its title and count, with a button in its top right corner to open it.
 */
export function RunDeckPanel({ view }: { view: RunViewData }) {
  const phone = useIsPhone();
  const [expanded, setExpanded] = useState(false);
  const open = !phone || expanded;
  const gained = new Map<string, number>();
  for (const id of view.gained) gained.set(id, (gained.get(id) ?? 0) + 1);
  const entries = [...gained].map(([id, count]) => ({ id, count, def: view.cards[id] }));
  return (
    <section className={`space-y-3 rounded-lg bg-slate-800 ring-1 ring-slate-600 ${phone ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">
          Unlocked this run <span className="text-sm font-normal text-slate-400">({view.gained.length})</span>
        </h3>
        {open && (
          <Link to="/decks" className="ml-auto whitespace-nowrap text-sm text-yellow-300 hover:underline">
            {phone ? 'Build decks' : 'Build decks with them'}
          </Link>
        )}
        {phone && (
          <button
            className={`${open ? '' : 'ml-auto'} flex shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200`}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Minimise' : 'Show the cards'}
            title={expanded ? 'Minimise' : 'Show the cards'}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </button>
        )}
      </div>
      {open && entries.length === 0 && <p className="text-sm text-slate-400">No cards yet: win battles, visit shops and take gifts to unlock more.</p>}
      {open && GROUPS.map(({ title, test }) => {
        const cards = entries.filter((e) => e.def && test(e.def.kind, e.def.kind === 'pokemon' && !!e.def.trainerText));
        if (!cards.length) return null;
        return (
          <div key={title} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {title} ({cards.reduce((n, c) => n + c.count, 0)})
            </h4>
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <RunCard key={c.id} def={c.def} footer={c.count > 1 ? <span className="text-sm font-semibold text-slate-300">×{c.count}</span> : undefined} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
