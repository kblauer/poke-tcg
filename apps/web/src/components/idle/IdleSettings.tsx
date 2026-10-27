import { isMachine, ITEMS, machineMove, MAX_AUTO_BALLS, moveData, species, type CatchUpSummary, type IdleSettings as Settings, type RevivePolicy } from '@poke-tcg/idle';
import { useState } from 'react';
import { commas } from '../../utils/math';

/** The Revive policies' labels (agreed with the user). */
const REVIVES: [RevivePolicy, string][] = [
  ['last', 'When the last Pokémon is standing'],
  ['any', 'As soon as any Pokémon faints'],
  ['boss', 'Against Gym Leaders, the Elite Four and the Champion, when the last is standing'],
  ['lead', 'When the lead Pokémon faints (on the lead)'],
];

/**
 * The mode's settings (README: Idle Adventure; agreed with the user): every decision in battle is one, so a run never
 * waits on the player. They apply from the next battle. The run always goes at one pace (no speed setting: agreed).
 */
export function IdleSettings({ settings, busy, onChange }: { settings: Settings; busy: boolean; onChange: (s: Partial<Settings>) => void }) {
  // The ball count as typed (saved as it changes; the saved settings come back a moment later).
  const [balls, setBalls] = useState(String(settings.autoBalls));
  const toggle = (key: 'autoHeal' | 'stopWhenFull' | 'replaceLowest' | 'autoEvolve' | 'autoGrind', label: string, note: string) => (
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
      {toggle('autoHeal', 'Auto-heal', 'Potions at half HP or less and cures for a status, each using the turn; Revives as ticked below.')}
      <fieldset className="space-y-1 pl-6 text-sm">
        <legend className="text-slate-300">Use a Revive (none ticked: never)</legend>
        {REVIVES.map(([policy, label]) => (
          <label key={policy} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.revives.includes(policy)}
              disabled={busy || !settings.autoHeal}
              onChange={(e) => onChange({ revives: e.target.checked ? [...settings.revives, policy] : settings.revives.filter((p) => p !== policy) })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        Auto-catch
        <select className="rounded bg-slate-700 px-2 py-1 ring-1 ring-slate-600" value={settings.autoCatch} disabled={busy} onChange={(e) => onChange({ autoCatch: e.target.value as Settings['autoCatch'] })}>
          <option value="off">Off</option>
          <option value="new">New Pokémon only</option>
          <option value="all">Every wild Pokémon</option>
        </select>
      </label>
      <p className="-mt-2 text-xs text-slate-400">Hits it once with the basic move, again if it's still above 60% HP, then throws the best ball in the bag every turn (it skips a hit that could knock it out).</p>
      <label className="flex items-center gap-2 text-sm">
        Auto-buy balls up to
        <input
          type="number"
          min={0}
          max={MAX_AUTO_BALLS}
          className="w-16 rounded bg-slate-700 px-2 py-1 text-right ring-1 ring-slate-600"
          value={balls}
          disabled={busy}
          onChange={(e) => {
            setBalls(e.target.value);
            const n = Math.max(0, Math.min(MAX_AUTO_BALLS, Math.floor(Number(e.target.value)) || 0));
            if (n !== settings.autoBalls) onChange({ autoBalls: n });
          }}
          onBlur={() => setBalls(String(settings.autoBalls))}
        />
      </label>
      <p className="-mt-2 text-xs text-slate-400">Reaching a town with fewer balls than this (every kind counted), buys the cheapest ball its store sells up to it, as many as the money allows. 0 turns it off.</p>
      <p className="text-sm text-slate-300">With a full party:</p>
      {toggle('stopWhenFull', 'Stop catching', 'Wild Pokémon are only marked seen.')}
      {toggle('replaceLowest', 'Replace the lowest-level Pokémon', 'Its best stats go to the Pokédex first. With neither, a catch is registered and released.')}
      {toggle('autoEvolve', 'Auto-evolve with stones', "At Celadon's store, buys a stone for each Pokémon that can use one and uses it at once.")}
      {toggle('autoGrind', 'Auto-grind before each gym', "Reaching a gym's town, trains on the route before it until your highest-level Pokémon matches the gym's highest (the Elite Four's and Champion's at the Indigo Plateau), then goes into the gym. After a white-out there, trains 2 levels above your highest-level Pokémon, then goes in again.")}
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
          {/* A TM or HM with its move, kept for good (no count). */}
          <span>{isMachine(item) ? `${ITEMS[item]!.name.toUpperCase()} ${moveData(machineMove(item)).name}` : (ITEMS[item]?.name ?? item)}</span>
          {!isMachine(item) && <span className="text-slate-400">×{n}</span>}
        </li>
      ))}
    </ul>
  );
}

const hours = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/**
 * What happened while the player was away (offline catch-up, agreed with the user), as pages for the scene's text box
 * (DialogueBox): its totals, the Pokémon caught, evolutions, badges, and whether the run waits in town.
 */
export function catchUpPages(summary: CatchUpSummary): string[] {
  return [
    `While you were away: ${hours(summary.durationMs)} of adventure.
${summary.battles} battles, ${summary.levels} levels gained, ${summary.money >= 0 ? `₱${commas(summary.money)} earned` : `₱${commas(-summary.money)} lost`}${summary.whiteOuts > 0 ? `, ${summary.whiteOuts} white-out${summary.whiteOuts === 1 ? '' : 's'}` : ''}.`,
    ...(summary.caught.length > 0 ? [`Caught: ${summary.caught.map((id) => species(id).name).join(', ')}.`] : []),
    ...(summary.evolutions.length > 0 ? [`Evolved: ${summary.evolutions.map((e) => `${species(e.from).name} into ${species(e.into).name}`).join(', ')}.`] : []),
    ...(summary.badges.length > 0 ? [`Won the ${summary.badges.join(', ')} Badge${summary.badges.length === 1 ? '' : 's'}!`] : []),
  ];
}
