import { lookupCard, pokemonAt, typeName, type PlayerView, type PokemonCardDef, type Target } from '@poke-tcg/game-engine';
import type { PowerControl } from '../hooks/usePower';

const option = 'rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95';

/**
 * Pokémon Power buttons under the attacks (one per Pokémon in play with a power to use), or the
 * current question while one is being used.
 */
export function PowerPanel({ view, power, busy }: { view: PlayerView; power: PowerControl; busy: boolean }) {
  const { spec } = power;
  if (spec) {
    const name = (t: Target) => {
      const p = pokemonAt(view.self, t)!;
      const def = lookupCard(view.cards, p.card.defId) as PokemonCardDef;
      return `${def.name} (${t === 'active' ? 'active' : `bench ${t + 1}`}, ${def.hp - p.damage}/${def.hp} HP)`;
    };
    return (
      <div className="space-y-1 rounded bg-slate-800 p-2 text-xs">
        <p className="text-slate-300">{spec.prompt}:</p>
        <div className="flex flex-col gap-1">
          {spec.kind === 'ownPokemon' &&
            spec.options.map((t) => (
              <button key={String(t)} className={option} onClick={() => power.answer(t)}>
                {name(t)}
              </button>
            ))}
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

  if (power.powers.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {power.powers.map((p) => (
        <button
          key={String(p.source)}
          disabled={p.error !== null || busy}
          title={[p.error, p.text].filter(Boolean).join('\n')}
          onClick={() => power.start(p.source)}
          className="rounded bg-violet-700 px-2 py-1 text-left text-xs transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-700"
        >
          {p.name} <span className="text-violet-200">({p.pokemon})</span>
        </button>
      ))}
    </div>
  );
}
