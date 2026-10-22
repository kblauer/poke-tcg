import type { ReactNode } from 'react';
import { AccountNameField } from '../components/AccountMenu';
import { OptionsPanel } from '../components/OptionsPanel';
import { PageHeader } from '../components/PageHeader';
import { useSkipFlips } from '../hooks/useSkipFlips';
import { PAGE_WIDTH } from '../utils/layout';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The Settings page (`/settings`, under Practice in the site's menu): the account's name, and the battle options also in
 * the board's side panel (OptionsPanel, and skipping coin flip animations, as the game log's checkbox does).
 */
export function SettingsPage() {
  const [skipFlips, setSkipFlips] = useSkipFlips();
  return (
    <div className={`space-y-4 ${PAGE_WIDTH}`}>
      <PageHeader title="Settings" />
      <div className="grid max-w-3xl gap-4">
        <Section title="Account">
          <AccountNameField label="Name" />
        </Section>
        <Section title="Battles">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={skipFlips} onChange={(e) => setSkipFlips(e.target.checked)} />
            Skip coin flip animations
          </label>
          <OptionsPanel />
        </Section>
      </div>
    </div>
  );
}
