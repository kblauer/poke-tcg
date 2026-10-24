import { Link } from '@tanstack/react-router';

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

/**
 * A page's name in the menus: `text-nav` (index.css: the pixel font at 18px, twice its 9-pixel em, so its pixels land
 * on whole screen pixels; the standard font's 16px, medium, with that picked in Settings).
 */
export const PAGE_NAME = 'text-nav font-nav';

/** The site's pages, in the menu's order, each with its icon. */
export const PAGES = [
  { to: '/', label: 'Play', Icon: navIcon('play') },
  { to: '/inventory', label: 'Inventory', Icon: navIcon('inventory') },
  { to: '/cosmetics', label: 'Cosmetics', Icon: navIcon('cosmetics') },
  { to: '/packs', label: 'Packs', Icon: navIcon('packs') },
  { to: '/decks', label: 'Collection', Icon: navIcon('collection') },
  { to: '/community', label: 'Community Decks', Icon: navIcon('community') },
  { to: '/battle', label: 'Training', Icon: navIcon('training') },
] as const;

/** The Settings page: last in the menus, below the pages. */
export const SETTINGS_PAGE = { to: '/settings', label: 'Settings', Icon: navIcon('settings') } as const;

// The router sets data-status="active" on the link for the current page.
const menuItem = 'flex items-center gap-2 rounded px-3 py-2 text-slate-300 hover:bg-slate-700 hover:text-slate-100 data-[status=active]:bg-slate-700 data-[status=active]:font-semibold data-[status=active]:text-yellow-300';

/** An icon-only page button (the phone battle screen's menu): a square, the current page lit in yellow. */
const iconItem =
  'flex h-11 flex-1 items-center justify-center rounded-md bg-slate-800 text-slate-300 ring-1 ring-slate-700 transition active:scale-95 hover:bg-slate-700 hover:text-slate-50 data-[status=active]:bg-yellow-400/15 data-[status=active]:text-yellow-200 data-[status=active]:ring-yellow-400/60';

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
            <p.Icon />
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1">
      {PAGES.map((p) => (
        <Link key={p.to} to={p.to} className={menuItem} activeOptions={{ exact: p.to === '/' }} onClick={onPick}>
          <p.Icon />
          <span className={`truncate ${PAGE_NAME}`}>{p.label}</span>
        </Link>
      ))}
      <Link to={SETTINGS_PAGE.to} className={menuItem} onClick={onPick}>
        <SETTINGS_PAGE.Icon />
        <span className={`truncate ${PAGE_NAME}`}>{SETTINGS_PAGE.label}</span>
      </Link>
    </nav>
  );
}
