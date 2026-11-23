import { tierOf, UPGRADE_TUNING, UPGRADES, type IdleUpgrades, type UpgradeId } from '@poke-tcg/idle';
import { commas } from '../../utils/math';
import { BUTTON } from '../../utils/styles';

/** The account's tree as the API sends it (idle.overview's `upgrades`). */
export interface UpgradeAccount {
  miles: number;
  owned: IdleUpgrades;
  mom: number;
}

/**
 * The Idle Adventure's upgrade tree (issue #270, the user's): the account's currency, and each upgrade's tiers in a row,
 * the bought ones lit, the next one with its price and Buy, the later ones locked until it's bought. Its effects apply to
 * every run, one under way from its next segment. Checked by typecheck and build only.
 */
export function UpgradeTree({ account, busy, onBuy }: { account: UpgradeAccount; busy: boolean; onBuy: (id: UpgradeId) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        <span className="font-semibold text-yellow-300">{commas(account.miles)}</span> {UPGRADE_TUNING.currency}
        <span className="text-slate-400"> · earned when a run ends (more the further it got) and for each Pokémon you catch for the first time.</span>
      </p>
      {account.mom > 0 && <p className="text-sm text-slate-300">Mom is keeping ₱{commas(account.mom)} for your next run.</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-2">
        {UPGRADES.map((u) => {
          const have = tierOf(account.owned, u.id);
          return (
            <li key={u.id} className="space-y-1.5 rounded bg-slate-800 p-3 ring-1 ring-slate-700">
              {u.tiers.map((t, i) => {
                const price = UPGRADE_TUNING.prices[u.id][i]!;
                const state = i < have ? 'owned' : i === have ? 'next' : 'locked';
                return (
                  <div key={t.name} className={`flex items-start gap-2 text-sm ${state === 'locked' ? 'opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className={state === 'owned' ? 'font-semibold text-yellow-300' : 'font-semibold text-slate-100'}>
                        {state === 'owned' ? '✓ ' : ''}
                        {t.name}
                      </div>
                      <div className="text-xs text-slate-400">{t.text}</div>
                    </div>
                    {state === 'next' && (
                      <button className={`${BUTTON} shrink-0`} disabled={busy || account.miles < price} title={account.miles < price ? `Not enough ${UPGRADE_TUNING.currency}` : undefined} onClick={() => onBuy(u.id)}>
                        Buy {commas(price)}
                      </button>
                    )}
                    {state === 'locked' && <span className="shrink-0 text-xs text-slate-400">{commas(price)}</span>}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
