import BackpackIcon from '@mui/icons-material/Backpack';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import GroupsIcon from '@mui/icons-material/Groups';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import SportsMartialArtsIcon from '@mui/icons-material/SportsMartialArts';
import { createSvgIcon } from '@mui/material/utils';
import { Link } from '@tanstack/react-router';

/**
 * A booster pack, for the Packs tab (MUI has none): crimped seals along the top and bottom, a band under the top seal, and
 * a round emblem in the middle (cut out of the foil, its centre dot left in).
 */
const PackIcon = createSvgIcon(
  <path
    fillRule="evenodd"
    d="M5 5.5 6 3l1 2.5L8 3l1 2.5L10 3l1 2.5L12 3l1 2.5L14 3l1 2.5L16 3l1 2.5L18 3l1 2.5v13L18 21l-1-2.5-1 2.5-1-2.5-1 2.5-1-2.5-1 2.5-1-2.5-1 2.5-1-2.5-1 2.5-1-2.5-1 2.5-1-2.5zM5 7v1h14V7zm7 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7m0 2.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5"
  />,
  'Pack',
);

/** The site's pages, in the menu's order, each with its icon. */
export const PAGES = [
  { to: '/', label: 'Play', Icon: PlayArrowIcon },
  { to: '/inventory', label: 'Inventory', Icon: BackpackIcon },
  { to: '/packs', label: 'Packs', Icon: PackIcon },
  { to: '/decks', label: 'Collection', Icon: CollectionsBookmarkIcon },
  { to: '/community', label: 'Community Decks', Icon: GroupsIcon },
  { to: '/battle', label: 'Practice', Icon: SportsMartialArtsIcon },
] as const;

/** The Settings page: last in the menus, below the pages. */
export const SETTINGS_PAGE = { to: '/settings', label: 'Settings', Icon: SettingsIcon } as const;

// The router sets data-status="active" on the link for the current page.
const menuItem = 'flex items-center gap-2 rounded px-3 py-2 text-slate-300 hover:bg-slate-700 hover:text-slate-100 data-[status=active]:bg-slate-700 data-[status=active]:font-semibold data-[status=active]:text-yellow-300';

/** An icon-only page button (the phone battle screen's menu): a square, the current page lit in yellow. */
const iconItem =
  'flex h-11 flex-1 items-center justify-center rounded-md bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition active:scale-95 hover:bg-slate-700 hover:text-white data-[status=active]:bg-yellow-400/15 data-[status=active]:text-yellow-200 data-[status=active]:ring-yellow-400/60';

/**
 * The pages as a ☰ menu's buttons (icon and name, the current page in yellow): the phone's site menu (SidePanel), Settings
 * last; or, with `iconsOnly`, a row of icon buttons (their names the labels), at the top of the phone battle
 * screen's menu (LogSheet). `onPick` closes the menu.
 */
export function PageMenu({ onPick, iconsOnly = false }: { onPick: () => void; iconsOnly?: boolean }) {
  if (iconsOnly) {
    return (
      <nav className="flex gap-1.5">
        {PAGES.map((p) => (
          <Link key={p.to} to={p.to} className={iconItem} activeOptions={{ exact: p.to === '/' }} onClick={onPick} title={p.label} aria-label={p.label}>
            <p.Icon sx={{ fontSize: 24 }} />
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1">
      {PAGES.map((p) => (
        <Link key={p.to} to={p.to} className={menuItem} activeOptions={{ exact: p.to === '/' }} onClick={onPick}>
          <p.Icon sx={{ fontSize: 20 }} />
          <span className="truncate">{p.label}</span>
        </Link>
      ))}
      <Link to={SETTINGS_PAGE.to} className={menuItem} onClick={onPick}>
        <SETTINGS_PAGE.Icon sx={{ fontSize: 20 }} />
        <span className="truncate">{SETTINGS_PAGE.label}</span>
      </Link>
    </nav>
  );
}
