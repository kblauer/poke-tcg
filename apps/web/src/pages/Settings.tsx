import type { Soundtrack } from '@poke-tcg/campaign';
import type { ReactNode } from 'react';
import { AccountNameField } from '../components/AccountMenu';
import { useMusicSettings } from '../components/MusicPlayer';
import { OptionsPanel } from '../components/OptionsPanel';
import { PageHeader } from '../components/PageHeader';
import { ThemePicker } from '../components/ThemePicker';
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
 * The Settings page (`/settings`, under Practice in the site's menu): the account's name, the colour theme (`ThemePicker`),
 * the battle options also in the board's side panel (OptionsPanel, and skipping coin flip animations, as the game log's
 * checkbox does), and the music player's auto play and its soundtrack.
 */
export function SettingsPage() {
  const [skipFlips, setSkipFlips] = useSkipFlips();
  const music = useMusicSettings();
  return (
    <div className={`space-y-4 ${PAGE_WIDTH}`}>
      <PageHeader title="Settings" />
      <div className="grid max-w-3xl gap-4">
        <Section title="Account">
          <AccountNameField label="Name" />
        </Section>
        <Section title="Theme">
          <ThemePicker />
        </Section>
        <Section title="Battles">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={skipFlips} onChange={(e) => setSkipFlips(e.target.checked)} />
            Skip coin flip animations
          </label>
          <OptionsPanel />
        </Section>
        {music && (
          <Section title="Music">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={music.autoplay} onChange={(e) => music.setAutoplay(e.target.checked)} />
              Auto play: the music follows the run (the route, the town before a gym, the gym, battles, Pokémon Centers) and Practice battles
            </label>
            <div role="radiogroup" aria-label="Soundtrack" className="space-y-1 text-sm text-slate-300">
              <p className="text-slate-400">Auto play's soundtrack</p>
              {SOUNDTRACK_CHOICES.map(({ value, label, games }) => (
                <label key={value} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="soundtrack" checked={music.soundtrack === value} onChange={() => music.setSoundtrack(value)} />
                  {label} <span className="text-xs text-slate-500">{games}</span>
                </label>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

const SOUNDTRACK_CHOICES: { value: Soundtrack; label: string; games: string }[] = [
  { value: 'original', label: 'Original', games: 'Red & Blue, Gold & Silver, Ruby & Sapphire' },
  { value: 'remastered', label: 'Remastered', games: 'FireRed & LeafGreen, HeartGold & SoulSilver, Omega Ruby & Alpha Sapphire' },
];
