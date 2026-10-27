import type { AppRouter } from '@poke-tcg/api/router';
import { CONTEST_CATEGORIES, CONTEST_RANKS, contestMove, CONTEST_EFFECTS, ENTRANT_SPECIES } from '@poke-tcg/campaign';
import { SPECIES } from '@poke-tcg/idle';
import type { inferRouterOutputs } from '@trpc/server';

export type ContestOverview = inferRouterOutputs<AppRouter>['contest']['overview'];
export type ContestEntry = ContestOverview['entries'][number];

/** Each category's colour, as Platinum colours them (its ribbons' palettes): Cool red, Beauty blue, Cute pink, Smart green, Tough yellow. */
export const CATEGORY_COLORS = ['bg-red-600', 'bg-blue-600', 'bg-pink-500', 'bg-green-600', 'bg-yellow-500 text-slate-900'] as const;
export const CATEGORY_TEXT = ['text-red-400', 'text-blue-400', 'text-pink-400', 'text-green-400', 'text-yellow-400'] as const;

/** A species' name: Kanto's from the Idle Adventure, the CPU entrants' from Platinum. */
export const speciesName = (n: number) => SPECIES[n - 1]?.name ?? ENTRANT_SPECIES[n] ?? `No. ${n}`;

/** A Pokémon's Platinum front sprite (tools/extras/platinum_contest.py: public/extras/contest/pokemon/<n>.png, 80x80), drawn crisp. */
export function ContestSprite({ species, size = 80, className = '' }: { species: number; size?: number; className?: string }) {
  return <img src={`/extras/contest/pokemon/${species}.png`} alt={speciesName(species)} width={size} height={size} draggable={false} className={`[image-rendering:pixelated] ${className}`} />;
}

/** A contest ribbon's picture (Platinum's, in its category's palette: public/extras/contest/ribbons/<category>-<rank>.png). */
export function RibbonIcon({ id, size = 32 }: { id: string; size?: number }) {
  const [category, rank] = id.split('-');
  const title = `${category![0]!.toUpperCase()}${category!.slice(1)} Ribbon${rank === 'normal' ? '' : ` ${rank![0]!.toUpperCase()}${rank!.slice(1)}`}`;
  return <img src={`/extras/contest/ribbons/${id}.png`} alt={title} title={title} width={size} height={size} draggable={false} className="[image-rendering:pixelated]" />;
}

/** A score in tenths of a heart as hearts ("♥♥♥"; an empty heart for none). */
export const heartsText = (points: number) => (points > 0 ? '♥'.repeat(Math.floor(points / 10)) : '♡');

/** A move's contest category and effect, as Platinum's move summary shows them. */
export function MoveInfo({ move }: { move: string }) {
  const m = contestMove(move);
  if (!m) return null;
  const e = CONTEST_EFFECTS[m.effect]!;
  return (
    <span className="flex flex-col text-left">
      <span className="flex items-center gap-1.5">
        <span className={`rounded px-1 text-[10px] ${CATEGORY_COLORS[m.category]}`}>{CONTEST_CATEGORIES[m.category]}</span>
        <span className="font-medium">{m.name}</span>
        <span className="text-pink-300">{heartsText(e.points)}</span>
      </span>
      <span className="text-[11px] text-slate-400">{e.text}</span>
    </span>
  );
}

/** A volume (0-100) as an HTML audio volume: squared, as the minigames' sounds are. */
export const audioVolume = (volume: number) => (volume / 100) ** 2;

export const rankName = (rank: number) => `${CONTEST_RANKS[rank]} Rank`;
