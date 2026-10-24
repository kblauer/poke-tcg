import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useRun } from '../hooks/useRun';
import { useTRPC } from '../lib/trpc';
import { navIcon, PokedollarIcon } from './PageNav';
import { HpBar } from './run/HpBar';
import { usePokedollarColor } from '../hooks/useThemedFigures';
import { commas } from '../utils/math';

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
function Stat({ icon, value, title, className, style }: { icon: ReactNode; value: ReactNode; title: string; className: string; style?: CSSProperties }) {
  return (
    <span className={`flex shrink-0 items-center gap-0.5 text-xs font-semibold ${className}`} style={style} title={title} aria-label={`${title}: ${value}`}>
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
 * The big screen's top bar's account figures (the user's, at its right end before the music player's bar): the bank,
 * EXP and Stardust, run or not, each with its pokesprite item (navIcon: the Big Nugget, the Exp.
 * Share, Stardust). The bank and Stardust over 999 in short (shortNumber: 1.2k), the exact number alone on hover (the
 * user's); EXP in full, its meaning on hover.
 */
export function TopBarAccount() {
  const trpc = useTRPC();
  const account = useRun().overview.data?.account;
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  if (!account) return null;
  const figures = [
    { key: 'bank', title: '₱ banked from earlier runs', Icon: navIcon('bank'), value: account.bank, short: true, className: 'text-yellow-200/70' },
    { key: 'exp', title: 'EXP, spent in the shop after a run', Icon: navIcon('exp'), value: account.exp, short: false, className: 'text-sky-300' },
    ...(stardust.data !== undefined ? [{ key: 'dust', title: 'Stardust, from cards pulled again in packs; crafts cards in the deck builder', Icon: navIcon('stardust'), value: stardust.data, short: true, className: 'text-sky-200' }] : []),
  ];
  return (
    <div className="flex shrink-0 items-center gap-4 text-sm font-semibold">
      {figures.map((f) => (
        <span key={f.key} className={`flex items-center gap-1 ${f.className}`} title={f.short ? f.value.toLocaleString() : f.title} aria-label={`${f.title}: ${f.value}`}>
          <f.Icon />
          {f.short ? shortNumber(f.value) : f.value.toLocaleString()}
        </span>
      ))}
    </div>
  );
}

/**
 * The phone's top bar's figures (agreed 2026-10-23; the account name is changed on the Settings page): during a run its
 * HP (HpBar) and ₱, then the bank and Stardust, over 999 in short (1.2k: shortNumber), a tap on one showing its exact number
 * briefly (ShortStat).
 */
export function TopBarStats() {
  const trpc = useTRPC();
  const { overview } = useRun();
  const money = usePokedollarColor();
  const stardust = useQuery(trpc.packs.stardust.queryOptions());
  const data = overview.data;
  const view = data?.run?.view;
  const inRun = view && view.phase !== 'won' && view.phase !== 'lost';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {inRun && (
        <>
          <HpBar hp={view.hp} maxHp={view.maxHp} track="w-10" />
          <Stat icon={<PokedollarIcon />} value={commas(view.pokedollars)} title="₱ to spend in this run" className={money.className} style={money.style} />
        </>
      )}
      {data && <ShortStat icon={<AccountBalanceIcon sx={{ fontSize: 14 }} />} value={data.account.bank} title="₱ in the bank" className="text-yellow-200/70" />}
      {stardust.data !== undefined && <ShortStat icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} value={stardust.data} title="Stardust" className="text-sky-200" />}
    </div>
  );
}
