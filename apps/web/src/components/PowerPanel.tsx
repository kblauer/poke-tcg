import { lookupCard, typeName, type PlayerView } from '@poke-tcg/game-engine';
import type { PowerControl } from '../hooks/usePower';
import { pickHint } from './AttackChoicePanel';
import { SlotMenu } from './SlotMenu';

const option = 'rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95';

/**
 * The active Pokémon's Power button under its attacks, or the current question while any power
 * (the active's or a benched Pokémon's) is being used. Benched Pokémon have their own button (BenchPowerButton).
 */
export function PowerPanel({ view, power, busy }: { view: PlayerView; power: PowerControl; busy: boolean }) {
  const { spec } = power;
  if (spec) {
    return (
      <div className="space-y-1 rounded bg-slate-800 p-2 text-xs">
        <p className="text-slate-300">{spec.prompt}:</p>
        <div className="flex flex-col gap-1">
          {spec.kind === 'ownPokemon' && <p className={pickHint}>Click one of your highlighted Pokémon.</p>}
          {(spec.kind === 'handCard' || spec.kind === 'attachedEnergy') &&
            spec.options.map((c) => (
              <button key={c.uid} className={option} onClick={() => power.answer(c.uid)}>
                {lookupCard(view.cards, c.defId).name}
              </button>
            ))}
          {spec.kind === 'type' && (
            <div className="flex flex-wrap gap-1">
              {spec.options.map((t) => (
                <button key={t} className={option} onClick={() => power.answer(t)}>
                  {typeName(t)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={power.cancel} className="text-slate-400 hover:text-slate-200">
          Cancel (Esc)
        </button>
      </div>
    );
  }

  const active = power.powers.find((p) => p.source === 'active');
  if (!active) return null;
  return (
    <button disabled={active.error !== null || busy} title={[active.error, active.text].filter(Boolean).join('\n')} onClick={() => power.start('active')} className={powerButton}>
      {active.name}
    </button>
  );
}

const powerButton =
  'rounded bg-violet-700 px-2 py-1 text-left text-xs transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-700';

/** Shown under a benched Pokémon that was clicked: uses its power, or says why it can't. */
export function BenchPowerButton({ power, slot, busy }: { power: PowerControl; slot: number; busy: boolean }) {
  const p = power.powers.find((x) => x.source === slot);
  if (!p) return null;
  return (
    <SlotMenu>
      <button disabled={p.error !== null || busy} title={p.text} onClick={() => power.start(slot)} className={`${powerButton} w-full`}>
        Activate {p.name}
      </button>
      {p.error && <p className="text-slate-400">{p.error}.</p>}
    </SlotMenu>
  );
}
