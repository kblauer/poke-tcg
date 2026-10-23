import type { ReactNode } from 'react';

/**
 * A page's heading, the same on every tab but the Collection and the game board: its title, then `info` (a short line
 * beside it, smaller and grey) and `actions` (on the right), with the same gap below whatever the page's own spacing.
 * The title is `text-title` (index.css: the pixel font at 27px, three times its 9-pixel em so its pixels land on whole
 * screen pixels, agreed 2026-10-23; the standard font's 24px bold, with that picked in Settings), in a line tall enough
 * for g's and y's tails.
 */
export function PageHeader({ title, info, actions }: { title: ReactNode; info?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="!mb-6 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className="text-title font-heading">{title}</h2>
      {info && <div className="text-sm text-slate-400">{info}</div>}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
