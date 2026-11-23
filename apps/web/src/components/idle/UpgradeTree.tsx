import { tierOf, UPGRADE_TUNING, UPGRADES, type IdleUpgrades, type UpgradeId } from '@poke-tcg/idle';
import { commas } from '../../utils/math';
import { BUTTON } from '../../utils/styles';

/** The account's tree as the API sends it (idle.overview's `upgrades`). */
export interface UpgradeAccount {
  miles: number;
  owned: IdleUpgrades;
  mom: number;
}

/** The most tiers any upgrade has: the tree's columns. */
const COLUMNS = Math.max(...UPGRADES.map((u) => u.tiers.length));

/**
 * The Idle Adventure's upgrade tree (issue #270, the user's): a tree laid out left to right, every upgrade's first tier
 * in the first column and its later tiers extending to the right, joined by lines (lit once the tier to their left is
 * bought). A bought tier is lit, the next one has its price and Buy, later ones are locked until it's bought. The
 * account's currency above it. Its effects apply to every run, one under way from its next segment. On a narrow screen
 * the tree scrolls sideways inside its box. `free`: every next tier can be bought whatever the balance (debug mode's
 * purchases cost nothing). A bought tier is a button (the user's): on (lit), a click switches it and any after it off
 * (`onToggle`: its index); off (outlined, "Off"), a click switches it and those before it on again, for free. `active`:
 * each upgrade's tiers in effect (activeUpgrades). Checked by typecheck and build only.
 */
export function UpgradeTree({ account, active, busy, onBuy, onToggle, free = false }: { account: UpgradeAccount; active: IdleUpgrades; busy: boolean; onBuy: (id: UpgradeId) => void; onToggle: (id: UpgradeId, tier: number) => void; free?: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        <span className="font-semibold text-yellow-300">{commas(account.miles)}</span> {UPGRADE_TUNING.currency}
        <span className="text-slate-400"> · earned when a run ends (more the further it got) and for each Pokémon you catch for the first time.</span>
      </p>
      {account.mom > 0 && <p className="text-sm text-slate-300">Mom is keeping ₱{commas(account.mom)} for your next run.</p>}
      <div className="overflow-x-auto pb-2">
        <div className="grid w-max items-stretch gap-y-3" style={{ gridTemplateColumns: Array.from({ length: COLUMNS }, (_, i) => (i ? '2rem 13rem' : '13rem')).join(' ') }}>
          {UPGRADES.map((u, row) => {
            const have = tierOf(account.owned, u.id);
            const on = tierOf(active, u.id);
            return u.tiers.flatMap((t, i) => {
              const price = UPGRADE_TUNING.prices[u.id][i]!;
              const state = i < on ? 'on' : i < have ? 'off' : i === have ? 'next' : 'locked';
              const owned = state === 'on' || state === 'off';
              const Node = owned ? 'button' : 'div';
              const node = (
                <Node
                  key={t.name}
                  {...(owned && { type: 'button' as const, disabled: busy, onClick: () => onToggle(u.id, i), title: state === 'on' ? 'Click to switch it off' : 'Click to switch it on' })}
                  className={`flex flex-col gap-1 rounded-md p-2.5 text-left text-sm ring-1 ${
                    state === 'on' ? 'bg-yellow-400/10 ring-yellow-400/60 hover:bg-yellow-400/20' : state === 'off' ? 'bg-slate-800 ring-slate-600 hover:bg-slate-700' : state === 'next' ? 'bg-slate-800 ring-slate-500' : 'bg-slate-800/60 opacity-50 ring-slate-700'
                  }`}
                  style={{ gridColumn: 1 + i * 2, gridRow: row + 1 }}
                >
                  <div className={`font-semibold ${state === 'on' ? 'text-yellow-300' : 'text-slate-100'}`}>
                    {state === 'on' ? '✓ ' : ''}
                    {t.name}
                    {state === 'off' && <span className="ml-1 text-xs font-normal text-slate-400">(off)</span>}
                  </div>
                  <div className="flex-1 text-xs text-slate-400">{t.text}</div>
                  {state === 'next' && (
                    <button className={`${BUTTON} self-start`} disabled={busy || (!free && account.miles < price)} title={!free && account.miles < price ? `Not enough ${UPGRADE_TUNING.currency}` : undefined} onClick={() => onBuy(u.id)}>
                      Buy {free || price === 0 ? 'free' : commas(price)}
                    </button>
                  )}
                  {state === 'locked' && <div className="text-xs text-slate-400">{commas(price)}</div>}
                </Node>
              );
              if (i === 0) return [node];
              // The branch from the tier before: lit once that tier is bought.
              const line = (
                <div key={`${t.name}-line`} className="flex items-center" style={{ gridColumn: i * 2, gridRow: row + 1 }} aria-hidden>
                  <div className={`h-0.5 w-full ${i < on ? 'bg-yellow-400/70' : 'bg-slate-600'}`} />
                </div>
              );
              return [line, node];
            });
          })}
        </div>
      </div>
    </div>
  );
}
