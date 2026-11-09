import type { ReactNode } from 'react';

/**
 * A page's heading, the same on every tab but the Collection and the game board: its title, then `info` (a short line
 * beside it, smaller and grey) and `actions` (on the right), with the same gap below whatever the page's own spacing.
 * The title is `text-title` (index.css: the pixel font at 27px, three times its 9-pixel em so its pixels land on whole
 * screen pixels, agreed 2026-10-23; the standard font's 24px bold, with that picked in Settings), in a line tall enough
 * for g's and y's tails.
 */
export function PageHeader({ title, info, actions, oneLine = false }: { title: ReactNode; info?: ReactNode; actions?: ReactNode; oneLine?: boolean }) {
  return (
    // `oneLine` (a phone's run heading): tight above and below (the page's top padding taken back in part), never wrapping, the title smaller (18px: the pixel font's twice, still whole pixels) and `info` cut short to fit.
    <header className={`flex items-center gap-x-3 gap-y-1 ${oneLine ? '!-mt-3 !mb-2 min-h-7 flex-nowrap gap-x-2' : '!mb-6 min-h-9 flex-wrap'}`}>
      <h2 className={`font-heading ${oneLine ? 'shrink-0 text-[18px] leading-7' : 'text-title'}`}>{title}</h2>
      {info && <div className={`text-sm text-slate-400 ${oneLine ? 'min-w-0 truncate' : ''}`}>{info}</div>}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
