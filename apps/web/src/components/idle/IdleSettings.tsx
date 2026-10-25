import { ITEMS, species, type CatchUpSummary, type IdleSettings as Settings } from '@poke-tcg/idle';
import { useEscape } from '../../hooks/useEscape';
import { commas } from '../../utils/math';
import { BUTTON, DIALOG, DIALOG_BACKDROP } from '../../utils/styles';

/**
 * The mode's settings (README: Idle Adventure; agreed with the user): every decision in battle is one, so a run never
 * waits on the player. They apply from the next battle.
 */
export function IdleSettings({ settings, busy, onChange }: { settings: Settings; busy: boolean; onChange: (s: Partial<Settings>) => void }) {
  const toggle = (key: 'autoHeal' | 'stopWhenFull' | 'replaceLowest' | 'autoEvolve', label: string, note: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={settings[key]} disabled={busy} onChange={(e) => onChange({ [key]: e.target.checked })} />
      <span>
        {label}
        <span className="block text-xs text-slate-400">{note}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-3">
      {toggle('autoHeal', 'Auto-heal', 'Potions at half HP or less, cures for a status, a Revive when the last Pokémon is standing. Uses the turn.')}
      <label className="flex items-center gap-2 text-sm">
        Auto-catch
        <select className="rounded bg-slate-700 px-2 py-1 ring-1 ring-slate-600" value={settings.autoCatch} disabled={busy} onChange={(e) => onChange({ autoCatch: e.target.value as Settings['autoCatch'] })}>
          <option value="off">Off</option>
          <option value="new">New Pokémon only</option>
          <option value="all">Every wild Pokémon</option>
        </select>
      </label>
      <p className="-mt-2 text-xs text-slate-400">Weakens it with moves that can't knock it out (Sleep and Paralysis first), then throws the best ball in the bag.</p>
      <p className="text-sm text-slate-300">With a full party:</p>
      {toggle('stopWhenFull', 'Stop catching', 'Wild Pokémon are only marked seen.')}
      {toggle('replaceLowest', 'Replace the lowest-level Pokémon', 'Its best stats go to the Pokédex first. With neither, a catch is registered and released.')}
      {toggle('autoEvolve', 'Auto-evolve with stones', "At Celadon's store, buys a stone for each Pokémon that can use one and uses it at once.")}
      <label className="flex items-center gap-2 text-sm">
        Speed
        {([1, 2, 3] as const).map((s) => (
          <button key={s} className={`rounded px-3 py-1 text-sm ${settings.speed === s ? 'bg-yellow-300 font-semibold text-slate-900' : 'bg-slate-600 hover:bg-slate-500'}`} disabled={busy} onClick={() => onChange({ speed: s })}>
            {s}×
          </button>
        ))}
      </label>
    </div>
  );
}

/** The bag's items and how many of each. */
export function Bag({ bag }: { bag: Record<string, number> }) {
  const items = Object.entries(bag).filter(([, n]) => n > 0);
  if (!items.length) return <p className="text-sm text-slate-400">The bag is empty.</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-1.5 text-sm">
      {items.map(([item, n]) => (
        <li key={item} className="flex justify-between rounded bg-slate-800 px-3 py-1.5 ring-1 ring-slate-700">
          <span>{ITEMS[item]?.name ?? item}</span>
          <span className="text-slate-400">×{n}</span>
        </li>
      ))}
    </ul>
  );
}

const hours = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** What happened while the player was away (offline catch-up, agreed with the user): its totals, the Pokémon caught, evolutions, badges. */
export function CatchUpDialog({ summary, onClose }: { summary: CatchUpSummary; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className={`${DIALOG_BACKDROP} z-50`} onClick={onClose}>
      <div className={`${DIALOG} max-w-md space-y-3 p-5`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">While you were away</h3>
        <p className="text-sm text-slate-300">
          {hours(summary.durationMs)} of adventure: {summary.battles} battles, {summary.levels} levels gained, {summary.money >= 0 ? `₱${commas(summary.money)} earned` : `₱${commas(-summary.money)} lost`}
          {summary.whiteOuts > 0 && `, ${summary.whiteOuts} white-out${summary.whiteOuts === 1 ? '' : 's'}`}.
        </p>
        {summary.caught.length > 0 && <p className="text-sm">Caught: {summary.caught.map((id) => species(id).name).join(', ')}.</p>}
        {summary.evolutions.length > 0 && <p className="text-sm">Evolved: {summary.evolutions.map((e) => `${species(e.from).name} into ${species(e.into).name}`).join(', ')}.</p>}
        {summary.badges.length > 0 && <p className="text-sm">Won the {summary.badges.join(', ')} Badge{summary.badges.length === 1 ? '' : 's'}!</p>}
        {summary.stopped === 'town' && <p className="text-sm text-yellow-200">Waiting in town for you.</p>}
        <div className="text-right">
          <button className={BUTTON} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
