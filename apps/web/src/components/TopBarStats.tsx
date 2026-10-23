import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useRun } from '../hooks/useRun';
import { useTRPC } from '../lib/trpc';

/** How long a tapped figure's exact number shows below it (ms), fading out over its last part. */
const EXACT_MS = 1600;

/** A big number in short: up to 999 as it is, then 1.2k, 12k, 120k, 1.2M… (one decimal under 10 of a unit). */
export function shortNumber(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  const [unit, size] = Math.abs(n) < 1_000_000 ? ['k', 1000] : ['M', 1_000_000];
  const v = n / size;
  return `${Math.abs(v) < 10 ? Math.floor(v * 10) / 10 : Math.floor(v)}${unit}`;
}

/** One figure: its icon and number, its meaning on hover. */
function Stat({ icon, value, title, className }: { icon: ReactNode; value: ReactNode; title: string; className: string }) {
  return (
    <span className={`flex shrink-0 items-center gap-0.5 text-xs font-semibold ${className}`} title={title} aria-label={`${title}: ${value}`}>
      {icon}
      {value}
    </span>
  );
}

/**
 * A figure that may be shortened (shortNumber): a tap on it shows the exact number briefly in a small bubble just below
 * it, which then fades away (EXACT_MS); the figure itself stays as it is, so nothing in the bar moves.
 */
function ShortStat({ icon, value, title, className }: { icon: ReactNode; value: number; title: string; className: string }) {
  /** The tap's time, keying the bubble so a second tap shows it afresh. */
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(() => setShown(null), EXACT_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <button type="button" className="relative flex shrink-0" onClick={() => setShown(Date.now())} title={`${title}: ${value.toLocaleString()}`}>
      <Stat icon={icon} value={shortNumber(value)} title={title} className={className} />
      {shown !== null && (
        <span
          key={shown}
          className="pointer-events-none absolute left-1/2 top-full z-[900] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-100 shadow-lg shadow-black/50 ring-1 ring-slate-600"
          style={{ animation: `exact-fade ${EXACT_MS}ms ease-in forwards` }}
          role="status"
        >
          {value.toLocaleString()}
        </span>
      )}
    </button>
  );
}

/**
 * The phone's top bar's figures (agreed 2026-10-23; the account name is changed on the Settings page): during a run its
 * HP and ₱, then the bank and Stardust, over 999 in short (1.2k: shortNumber), a tap on one showing its exact number
 * briefly (ShortStat).
 */
export function TopBarStats() {
  const trpc = useTRPC();
  const { overview } = useRun();
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  const data = overview.data;
  const view = data?.run?.view;
  const inRun = view && view.phase !== 'won' && view.phase !== 'lost';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {inRun && (
        <>
          <Stat icon={<FavoriteIcon sx={{ fontSize: 14 }} />} value={`${view.hp}/${view.maxHp}`} title="HP" className="text-rose-400" />
          <Stat icon={<span className="text-sm leading-none">₱</span>} value={view.pokedollars} title="₱ to spend in this run" className="text-yellow-300" />
        </>
      )}
      {data && <ShortStat icon={<AccountBalanceIcon sx={{ fontSize: 14 }} />} value={data.account.bank} title="₱ in the bank" className="text-yellow-200/70" />}
      {stardust.data !== undefined && <ShortStat icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} value={stardust.data} title="Stardust" className="text-sky-200" />}
    </div>
  );
}
