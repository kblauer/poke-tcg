import type { DeckEntry } from '../../utils/deckBuilder';
import { DeckCards, useFeaturedNames } from '../DeckList';

/** One side of the banner: a deck (its card entries), its trainer's name and a line on the deck. */
export interface VsSide {
  entries: DeckEntry[];
  name: string;
  info?: string;
}

/**
 * The Battle Tower's VS banner (the user's: the VS splash screens' look), drawn rather than cut from their small pictures:
 * double rules above and below, a band blue on the left and red-orange on the right meeting at a zigzag seam, light
 * streaks across it, and the orange VS between `left` (the player) and `right` (the opponent; null: not yet known). Each
 * side's headline cards sit by the VS, its trainer's name and deck line outside them (the user's): five columns across,
 * name | cards | VS | cards | name. Game art, so its colours are fixed rather than the themes'. On a phone, one row (the
 * user's: it fits under the map without scrolling): each side's cards, smaller, with its text under them, and a smaller VS.
 */
export function VsBanner({ left, right, phone }: { left: VsSide; right: VsSide | null; phone: boolean }) {
  const leftCards = <DeckCards entries={left.entries} small={phone} />;
  const rightCards = right ? (
    <DeckCards entries={right.entries} small={phone} />
  ) : (
    <div className={`flex h-full flex-col items-center justify-center text-center ${phone ? 'min-h-14 w-24' : 'min-h-20 w-40'}`}>
      <span className="text-3xl font-bold text-slate-50/80">?</span>
    </div>
  );
  const rules = (
    <div aria-hidden>
      <div className="h-[3px] bg-[#f4f4f4]" />
      <div className="h-px bg-[#8a8a8a]" />
    </div>
  );
  // The red half's edge zigzags along the seam, down the middle.
  const seam = 'polygon(52% 0, 100% 0, 100% 100%, 52% 100%, 48% 83%, 52% 67%, 48% 50%, 52% 33%, 48% 17%)';
  return (
    <section className="space-y-[3px]" aria-label="Versus">
      {rules}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #0a4f9e, #12b8f0)' }} />
        <div className="absolute inset-0" style={{ clipPath: seam, background: 'linear-gradient(to right, #ff6418, #7a1806)' }} />
        {/* Speed streaks across the band. */}
        {[18, 34, 61, 78, 88].map((top, i) => (
          <div
            key={top}
            className="absolute h-px rounded-full"
            style={{ top: `${top}%`, left: `${(i * 23) % 70}%`, width: `${18 + ((i * 11) % 14)}%`, background: i % 2 ? 'rgba(255,240,180,0.55)' : 'rgba(220,250,255,0.55)' }}
            aria-hidden
          />
        ))}
        {phone ? (
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1 p-2">
            <div className="flex min-w-0 flex-col items-center gap-1">
              {leftCards}
              <SideText side={left} small />
            </div>
            <VsMark small />
            <div className="flex min-w-0 flex-col items-center gap-1">
              {rightCards}
              <SideText side={right} small />
            </div>
          </div>
        ) : (
          <div className="relative grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-4 p-3">
            <SideText side={left} />
            {leftCards}
            {/* A little more room either side of the VS than between the other columns (the user's). */}
            <div className="mx-4">
              <VsMark />
            </div>
            {rightCards}
            <SideText side={right} />
          </div>
        )}
      </div>
      {rules}
    </section>
  );
}

/** A side's trainer's name and deck line (its headline Pokémon after the line given), centred in its room; for an opponent not yet known, the next challenger. */
function SideText({ side, small = false }: { side: VsSide | null; small?: boolean }) {
  const names = useFeaturedNames(side?.entries ?? []);
  return (
    <div className="w-full min-w-0 space-y-0.5 text-center text-slate-50">
      <p className={`truncate font-semibold ${small ? 'text-sm' : 'text-base'}`}>{side?.name ?? 'Next challenger'}</p>
      {side && (
        <p className={`text-slate-50/80 ${small ? 'text-[10px] leading-3' : 'text-xs leading-4'}`}>
          {side.info && <span className="block">{side.info}</span>}
          {names}
        </p>
      )}
    </div>
  );
}

/** The VS: heavy italic letters in an orange gradient, outlined black, then white, as the splash screens draw it. */
function VsMark({ small = false }: { small?: boolean }) {
  const text = (extra: Record<string, string | number>) => (
    <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize="46" fontWeight="900" fontStyle="italic" fontFamily="Arial Black, Arial, sans-serif" {...extra}>
      VS
    </text>
  );
  return (
    <svg width={small ? 56 : 84} height={small ? 43 : 64} viewBox="0 0 84 64" className="shrink-0 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" role="img" aria-label="versus">
      <defs>
        <linearGradient id="vs-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd84a" />
          <stop offset="55%" stopColor="#ff8a14" />
          <stop offset="100%" stopColor="#e8420c" />
        </linearGradient>
      </defs>
      {text({ fill: 'none', stroke: '#ffffff', strokeWidth: 12, strokeLinejoin: 'round' })}
      {text({ fill: 'none', stroke: '#111111', strokeWidth: 7, strokeLinejoin: 'round' })}
      {text({ fill: 'url(#vs-fill)' })}
    </svg>
  );
}
