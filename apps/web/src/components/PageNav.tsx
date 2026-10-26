import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Link, useRouterState } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { isPlayPath } from '../hooks/useTower';

/**
 * A page's icon: a 32×32 pixel-art sprite in `public/nav/` (agreed 2026-10-23; most from pokesprite's items, the Packs
 * one the English Laboratory booster pack of the Game Boy Color game, shrunk). Drawn at its own size, never scaled, so its
 * pixels stay sharp; the sprites leave a margin round the item, so its box is `-m-1.5` to sit in a 20px one.
 */
export function navIcon(name: string) {
  return function NavIcon({ className = '' }: { className?: string }) {
    return <img src={`/nav/${name}.png`} alt="" width={32} height={32} draggable={false} className={`-m-1.5 size-8 max-w-none shrink-0 [image-rendering:pixelated] ${className}`} />;
  };
}

/** The run money's icon: the Pokédollar sign (`public/nav/pokedollar.png`, drawn by tools/icons/pokedollar.py; the user's). */
export const PokedollarIcon = navIcon('pokedollar');

/**
 * A page's name in the menus: `text-nav` (index.css: the pixel font at 18px, twice its 9-pixel em, so its pixels land
 * on whole screen pixels; the standard font's 16px, medium, with that picked in Settings).
 */
export const PAGE_NAME = 'text-nav font-nav';

/** The site's pages, in the menu's order, each with its icon. Training is one of Play's modes (its menu, the user's), not a page of its own. */
export const PAGES = [
  { to: '/', label: 'Play', Icon: navIcon('play') },
  { to: '/inventory', label: 'Inventory', Icon: navIcon('inventory') },
  { to: '/cosmetics', label: 'Cosmetics', Icon: navIcon('cosmetics') },
  { to: '/packs', label: 'Packs', Icon: navIcon('packs') },
  { to: '/decks', label: 'Collection', Icon: navIcon('collection') },
  { to: '/community', label: 'Community Decks', Icon: navIcon('community') },
  { to: '/extras', label: 'Extras', Icon: navIcon('extras') },
] as const;

/**
 * Whether Play is lit in the menus: on its menu, any of its modes (the Badge Challenge, the Battle Tower, Training) and their
 * battles. Passed as the link's `data-status`, which the router only sets itself on its own path.
 */
export function usePlayLit() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return isPlayPath(path) || path.startsWith('/game/');
}
/** The `data-status` for a page's link: Play's while usePlayLit. */
export const litStatus = (to: string, playLit: boolean) => (to === '/' && playLit ? 'active' : undefined);

/** Play's modes, in its menu's order: the accordion under Play in the menus (PlayModes, the user's). */
export const PLAY_MODES = [
  { to: '/badge', label: 'Badge Challenge' },
  { to: '/tower', label: 'Battle Tower' },
  { to: '/idle', label: 'Idle Adventure' },
  { to: '/battle', label: 'Training' },
] as const;

const PLAY_OPEN_KEY = 'poke-tcg.nav-play';

/** Whether Play's accordion was left open (`PLAY_OPEN_KEY`), remembered in the browser; open when storage fails. */
function loadPlayOpen(): boolean {
  try {
    return localStorage.getItem(PLAY_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

// A mode's link under Play: indented along a line, the current one lit as the pages are.
const modeItem =
  'block truncate rounded px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-slate-100 data-[status=active]:font-semibold data-[status=active]:text-yellow-300';

/**
 * Play in a menu with its modes as an accordion (the user's): `link` is Play's own link (to its menu), drawn with a
 * chevron beside it that opens and closes the list of modes (PLAY_MODES) below, remembered. `onPick` closes the menu.
 */
export function PlayModes({ link, onPick }: { link: ReactNode; onPick?: () => void }) {
  const [open, setOpen] = useState(loadPlayOpen);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(PLAY_OPEN_KEY, String(!open));
    } catch {
      // Not remembered; it still applies until the page is reloaded.
    }
  };
  return (
    <div className="shrink-0">
      <div className="relative">
        {link}
        <button
          className="absolute right-1 top-1/2 flex -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Hide Play's modes" : "Show Play's modes"}
          title={open ? 'Hide modes' : 'Show modes'}
        >
          <ExpandMoreIcon sx={{ fontSize: 18 }} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="mb-1 ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-700 pl-2">
          {PLAY_MODES.map((m) => (
            <Link key={m.to} to={m.to} className={modeItem} onClick={onPick}>
              {m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Settings page: last in the menus, below the pages. */
export const SETTINGS_PAGE = { to: '/settings', label: 'Settings', Icon: navIcon('settings') } as const;

// The router sets data-status="active" on the link for the current page.
const menuItem = 'flex items-center gap-2 rounded px-3 py-2 text-slate-300 hover:bg-slate-700 hover:text-slate-100 data-[status=active]:bg-slate-700 data-[status=active]:font-semibold data-[status=active]:text-yellow-300';

/** An icon-only page button (the phone battle screen's menu): a square, the current page lit in yellow. */
const iconItem =
  'flex h-11 flex-1 items-center justify-center rounded-md bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition active:scale-95 hover:bg-slate-700 hover:text-slate-50 data-[status=active]:bg-yellow-400/15 data-[status=active]:text-yellow-200 data-[status=active]:ring-yellow-400/60';

/**
 * The pages as a ☰ menu's buttons (icon and name, the current page in yellow): the phone's site menu (SidePanel), Play's
 * modes under it (PlayModes), Settings last; or, with `iconsOnly`, a row of icon buttons (their names the labels), at the top of the phone battle
 * screen's menu (LogSheet). `onPick` closes the menu.
 */
export function PageMenu({ onPick, iconsOnly = false }: { onPick: () => void; iconsOnly?: boolean }) {
  const playLit = usePlayLit();
  if (iconsOnly) {
    return (
      <nav className="flex gap-1.5">
        {PAGES.map((p) => (
          <Link key={p.to} to={p.to} className={iconItem} activeOptions={{ exact: p.to === '/' }} data-status={litStatus(p.to, playLit)} onClick={onPick} title={p.label} aria-label={p.label}>
            <p.Icon />
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1">
      {PAGES.map((p) => {
        const link = (
          <Link key={p.to} to={p.to} className={menuItem} activeOptions={{ exact: p.to === '/' }} data-status={litStatus(p.to, playLit)} onClick={onPick}>
            <p.Icon />
            <span className={`truncate ${PAGE_NAME}`}>{p.label}</span>
          </Link>
        );
        return p.to === '/' ? <PlayModes key={p.to} link={link} onPick={onPick} /> : link;
      })}
      <Link to={SETTINGS_PAGE.to} className={menuItem} onClick={onPick}>
        <SETTINGS_PAGE.Icon />
        <span className={`truncate ${PAGE_NAME}`}>{SETTINGS_PAGE.label}</span>
      </Link>
    </nav>
  );
}
