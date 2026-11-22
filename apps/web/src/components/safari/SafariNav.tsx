import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import StorefrontIcon from '@mui/icons-material/Storefront';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SafariViewData } from '../../hooks/useSafari';
import { commas } from '../../utils/math';
import { SPEEDS, useSafariSpeed } from '../../utils/safariSpeed';
import { BUTTON } from '../../utils/styles';
import { GameLog } from '../GameLog';
import type { NavSlots } from '../NavLog';
import type { LastBattle, Playback } from './BattlePlayback';

const BATTLES = 15;
/** The menu's buttons, small, as the run's are there. */
const NAV_BUTTON = `${BUTTON} !px-2 !py-0.5 !text-xs`;

export interface SafariNavProps {
  /** The site menu's places (NavLog's useNavPage). */
  slots: NavSlots;
  /** The run under way's view, or null (none, or over). */
  view: SafariViewData | null;
  /** The battle playing back: the figures are the ones before it until Continue. */
  before: LastBattle | null;
  playback?: Playback;
  /** The shop, when it can be shown or hidden now. */
  shop: { open: boolean; toggle: () => void } | null;
  /** Plays the last battle again, when there is one and none is playing. */
  onWatch?: () => void;
}

/**
 * Safari Draft's section of the site menu (the user's, 2026-11-22: as the Badge Challenge's run has there, in place of
 * the page's own bar): the run's HP, ₱, battle and shop tier; the shop's button, Watch last battle and, while a battle
 * plays, Skip; the playback's speed (kept: utils/safariSpeed.ts); and the log, the run's between battles and the
 * battle's while one plays, filling the rest of the menu. Minimised: the HP, the ₱ and the shop's button. Drawn into
 * the menu's places with portals, so the layout imports nothing of the mode's.
 */
export function SafariNav(props: SafariNavProps) {
  const { slots } = props;
  return (
    <>
      {slots.open && createPortal(<Section {...props} />, slots.open)}
      {slots.phone && createPortal(<Section {...props} phone />, slots.phone)}
      {slots.mini && createPortal(<Mini {...props} />, slots.mini)}
    </>
  );
}

/** The figures before the battle playing back: its result shows at its end. */
const figures = (view: SafariViewData, before: LastBattle | null) => ({ hp: before?.winner === 1 ? view.hp + 1 : view.hp, pokedollars: view.pokedollars - (before?.pay ?? 0) });

function Hearts({ hp, size }: { hp: number; size: number }) {
  return (
    <span className="flex items-center text-red-500" title={`${hp} HP left`}>
      {Array.from({ length: 3 }, (_, i) => (i < hp ? <FavoriteIcon key={i} sx={{ fontSize: size }} /> : <FavoriteBorderIcon key={i} sx={{ fontSize: size }} />))}
    </span>
  );
}

function Section({ view, before, playback, shop, onWatch, phone = false }: SafariNavProps & { phone?: boolean }) {
  const [speed, setSpeed] = useSafariSpeed();
  const playing = !!playback && !playback.done;
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
  const champion = !!view && view.battles >= BATTLES;
  const now = view && figures(view, before);
  const log = playback ? playback.texts.slice(0, playback.index + 1) : (view?.log ?? []);
  return (
    <>
      <div className="shrink-0 space-y-2 pr-1 text-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Safari Draft</h3>
        {view && now ? (
          <div className="space-y-1">
            {row('HP', <Hearts hp={now.hp} size={18} />)}
            {row('₱', <span className="text-yellow-200">₱{commas(now.pokedollars)}</span>)}
            {row('Battle', playback ? `Round ${playback.frame.round}` : champion ? `Champion${view.championTries ? `, try ${view.championTries + 1}` : ''}` : `${Math.min(view.battles + 1, BATTLES)} of ${BATTLES}`)}
            {row('Shop tier', view.shopTier)}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No run under way.</p>
        )}
        <div className="flex flex-wrap gap-1.5" data-keep-action>
          {shop && (
            <button type="button" className={NAV_BUTTON} onClick={shop.toggle}>
              {shop.open ? 'Hide shop' : 'Show shop'}
            </button>
          )}
          {onWatch && (
            <button type="button" className={NAV_BUTTON} onClick={onWatch}>
              Watch last battle
            </button>
          )}
          {playing && (
            <button type="button" className={NAV_BUTTON} onClick={playback.skip}>
              Skip to the end
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5" data-keep-action>
          <span className="text-xs text-slate-400">Battle speed</span>
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} className={`${NAV_BUTTON} ${speed === s ? '!bg-yellow-300 !text-gray-900' : ''}`} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      {(view || playback) && (
        // The rest of the menu, down to its bottom, scrolling inside itself (the phone's panel: a fixed height).
        <div data-keep-action className={`flex min-h-0 flex-col rounded-lg bg-slate-950/60 ring-1 ring-slate-800 [&>section]:p-2 ${phone ? 'h-64' : 'flex-1'}`}>
          <GameLog log={log.map((text) => ({ text, player: null }))} you="player" header={<h3 className="mb-2 text-sm text-slate-400">{playback ? 'Battle log' : 'Run log'}</h3>} />
        </div>
      )}
    </>
  );
}

/** The minimised menu's: the run's HP and ₱, and the shop's button. */
function Mini({ view, before, shop }: SafariNavProps) {
  if (!view) return null;
  const now = figures(view, before);
  return (
    <>
      <span className="flex flex-col items-center text-red-500" title={`${now.hp} HP left`}>
        <FavoriteIcon sx={{ fontSize: 18 }} />
        {now.hp}
      </span>
      <span className="text-yellow-200" title="₱ to spend in this run">
        ₱{commas(now.pokedollars)}
      </span>
      {shop && (
        <button type="button" className={`${NAV_BUTTON} !px-1.5`} onClick={shop.toggle} title={shop.open ? 'Hide shop' : 'Show shop'} aria-label={shop.open ? 'Hide shop' : 'Show shop'} data-keep-action>
          <StorefrontIcon sx={{ fontSize: 18 }} />
        </button>
      )}
    </>
  );
}
