import type { Soundtrack } from '@poke-tcg/campaign';
import { useState, type ReactNode } from 'react';
import { AccountNameField } from '../components/AccountNameField';
import { useMusicSettings } from '../components/MusicPlayer';
import { OptionsPanel } from '../components/OptionsPanel';
import { PageHeader } from '../components/PageHeader';
import { REMINDER_LABELS, reminderOff, setReminderOff, type EndTurnReminder } from '../components/StatusBar';
import { ThemePicker } from '../components/ThemePicker';
import { useFontStyle, type FontStyle } from '../hooks/useFontStyle';
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
 * The Settings page (`/settings`, under Training in the site's menu): the account's name, the battle options also in the board's
 * side panel (OptionsPanel, and skipping coin flip animations, as the game log's checkbox does), End turn's reminders
 * (EndTurnReminders), the music player's auto
 * play and its soundtrack, the font (`FontPicker`), and last the colour theme (`ThemePicker`).
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
        <Section title="Battles">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={skipFlips} onChange={(e) => setSkipFlips(e.target.checked)} />
            Skip coin flip animations
          </label>
          <OptionsPanel />
          <EndTurnReminders />
        </Section>
        {music && (
          <Section title="Music">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={music.autoplay} onChange={(e) => music.setAutoplay(e.target.checked)} />
              Auto play: the music follows the run (the route, the town before a gym, the gym, battles, Pokémon Centers) and Training battles
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
        <Section title="Font">
          <FontPicker />
        </Section>
        <Section title="Theme">
          <ThemePicker />
        </Section>
      </div>
    </div>
  );
}

/** The UI's fonts, each named in itself: the pixel fonts (Pokémon R/B/Y and Pokémon R/S/E), Pokémon S/M (the default) or the system's standard one. */
const FONT_CHOICES: { value: FontStyle; label: string; credit?: string; family: string }[] = [
  { value: 'pixel', label: 'Pokémon R/B/Y', credit: 'Pixellocale by Johste (SIL Open Font License)', family: 'var(--font-pixel)' },
  // Its licence (CC BY-SA) asks for the credit: in the option's tooltip (and the README).
  { value: 'emerald', label: 'Pokémon R/S/E', credit: 'Pokemon Emerald by aztecwarrior28 (CC BY-SA 3.0)', family: 'var(--font-emerald)' },
  // Pokémon S/M: Noto Sans JP, a free stand-in for Sun & Moon's Rodin.
  { value: 'noto', label: 'Pokémon S/M', credit: 'Noto Sans JP (SIL Open Font License)', family: 'var(--font-noto)' },
  { value: 'standard', label: 'Standard', family: 'var(--font-system)' },
];

/** The font of the whole UI but the top bar's logo (useFontStyle, remembered in the browser). */
function FontPicker() {
  const [font, setFont] = useFontStyle();
  return (
    <div role="radiogroup" aria-label="Font" className="space-y-1 text-sm text-slate-300">
      {FONT_CHOICES.map(({ value, label, credit, family }) => (
        <label key={value} className="flex cursor-pointer items-center gap-2" title={credit}>
          <input type="radio" name="font" checked={font === value} onChange={() => setFont(value)} />
          <span style={{ fontFamily: family }} className="text-base">
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** What End turn and attacking remind you of first (useTurnReminders), each on or off. */
function EndTurnReminders() {
  const kinds = Object.keys(REMINDER_LABELS) as EndTurnReminder['kind'][];
  const [off, setOff] = useState(() => kinds.filter(reminderOff));
  const toggle = (kind: EndTurnReminder['kind'], on: boolean) => {
    setReminderOff(kind, !on);
    setOff((o) => (on ? o.filter((k) => k !== kind) : [...o, kind]));
  };
  return (
    <section className="space-y-2 text-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Before ending your turn, remind me of</h4>
      {kinds.map((kind) => (
        <label key={kind} className="flex cursor-pointer items-center gap-2 text-slate-300">
          <input type="checkbox" checked={!off.includes(kind)} onChange={(e) => toggle(kind, e.target.checked)} />
          {REMINDER_LABELS[kind]}
        </label>
      ))}
    </section>
  );
}

const SOUNDTRACK_CHOICES: { value: Soundtrack; label: string; games: string }[] = [
  { value: 'original', label: 'Original', games: 'Red & Blue, Gold & Silver, Ruby & Sapphire' },
  { value: 'remastered', label: 'Remastered', games: 'FireRed & LeafGreen, HeartGold & SoulSilver, Omega Ruby & Alpha Sapphire' },
];
