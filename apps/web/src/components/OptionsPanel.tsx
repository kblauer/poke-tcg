import { useOptions, type Options } from '../hooks/useOptions';

const SETTINGS: { key: keyof Options; label: string }[] = [
  { key: 'showPokemonPlayed', label: 'Pokémon cards' },
  { key: 'showEnergyPlayed', label: 'Energy cards' },
];

/** The side panel's Options tab: which cards the CPU plays are shown large in the middle of the board (PlayedCard). Trainers always are. */
export function OptionsPanel() {
  const [options, setOptions] = useOptions();
  return (
    <section className="space-y-2 text-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Show the CPU's played cards</h4>
      {SETTINGS.map(({ key, label }) => (
        <label key={key} className="flex cursor-pointer items-center gap-2 text-slate-300">
          <input type="checkbox" checked={options[key]} onChange={(e) => setOptions({ [key]: e.target.checked })} />
          {label}
        </label>
      ))}
      <p className="text-xs text-slate-500">Trainer cards are always shown. The Pokémon a card changed still glow either way.</p>
    </section>
  );
}
