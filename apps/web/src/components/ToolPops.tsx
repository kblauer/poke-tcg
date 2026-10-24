import type { LogEntry } from '@poke-tcg/game-engine';
import { createContext, useContext } from 'react';

/** How long a Pokémon Tool's animation plays (ms); the battle's playback waits for it before the next move (Game.tsx). */
export const TOOL_POP_MS = 1500;

/** A Pokémon Tool that just worked by itself (LogEntry's `tool`: a Berry between turns), with its log entry's number. */
export type ToolPop = NonNullable<LogEntry['tool']> & { n: number };

/** The Tool entries in `log` after entry number `since` (the view before), oldest first. */
export const toolPopsAfter = (log: LogEntry[], since: number): ToolPop[] => log.flatMap((e) => (e.tool && (e.n ?? 0) > since ? [{ ...e.tool, n: e.n ?? 0 }] : []));

/** The Tools at work on screen now (Game.tsx sets them as their move is shown; every Slot shows its Pokémon's). */
export const ToolPopsContext = createContext<ToolPop[]>([]);

/**
 * Over a Pokémon whose Tool just worked (the user's): what it did, rising and fading (`.tool-pop`, TOOL_POP_MS) in the
 * middle of the card: the damage it healed as a big green number, or "Cured", with the Tool's name under it.
 */
export function ToolPopOverlay({ uid }: { uid: string }) {
  const pops = useContext(ToolPopsContext).filter((p) => p.uid === uid);
  if (!pops.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1" aria-live="polite">
      {pops.map((p) => (
        <div key={p.n} className="tool-pop flex flex-col items-center" style={{ animationDuration: `${TOOL_POP_MS}ms` }}>
          <span className="text-3xl font-black leading-none text-emerald-300 [-webkit-text-stroke:1.5px_rgb(6_78_59)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {p.heal ? `+${p.heal}` : 'Cured'}
          </span>
          <span className="mt-1 whitespace-nowrap rounded-full bg-emerald-950/85 px-2 py-0.5 text-[11px] font-bold text-emerald-100 ring-1 ring-emerald-400/60">{p.name}</span>
        </div>
      ))}
    </div>
  );
}
