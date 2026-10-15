import { energyProvided, lookupCard, type CardLibrary, type GameAction, type InPlayPokemon } from '@poke-tcg/game-engine';
import type { Retreat } from '../hooks/useRetreat';
import { energyColor } from '../utils/cardColors';

/**
 * Retreat button under the attacks. While retreating it asks which energy to discard (when
 * the choice matters) and then for a benched Pokémon to switch in.
 */
export function RetreatPanel({
  pokemon,
  cards,
  retreat,
  pending,
}: {
  pokemon: InPlayPokemon;
  cards: CardLibrary;
  retreat: Retreat;
  pending: GameAction | null;
}) {
  const { cost, retreating, needsChoice, chosen, ready, blocked, pickedTotal } = retreat;
  const costText = cost === 0 ? 'free' : `${cost} energy`;

  if (!retreating) {
    return (
      <button
        disabled={blocked !== null || pending !== null}
        title={blocked ?? `Discard ${costText} to switch with a benched Pokémon`}
        onClick={retreat.start}
        className={`rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-slate-700 ${
          pending?.type === 'RETREAT' ? 'animate-pulse ring-2 ring-yellow-300' : ''
        }`}
      >
        Retreat ({costText})
      </button>
    );
  }

  return (
    <div className="space-y-1 rounded bg-slate-800 p-2 text-xs">
      {needsChoice && (
        <>
          <p className="text-slate-300">
            Discard {cost} energy ({pickedTotal}/{cost}):
          </p>
          <div className="flex flex-wrap gap-1">
            {pokemon.energy.map((e) => {
              const def = lookupCard(cards, e.defId);
              const { type, amount } = energyProvided(e, cards);
              const picked = chosen.includes(e.uid);
              return (
                <button
                  key={e.uid}
                  onClick={() => retreat.toggleEnergy(e.uid)}
                  title={amount > 1 ? `${def.name} (${amount} energy)` : def.name}
                  className={`${energyColor(type)} h-5 w-5 rounded-full border-2 text-[10px] font-bold text-white transition ${
                    picked ? 'border-red-400 opacity-40' : 'border-white'
                  }`}
                  aria-pressed={picked}
                  aria-label={`${picked ? 'Keep' : 'Discard'} ${def.name}`}
                >
                  {amount > 1 ? amount : null}
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className={ready ? 'text-emerald-300' : 'text-slate-500'}>
        {ready ? `Click a benched Pokémon to switch in${cost > 0 && !needsChoice ? ` (discards ${costText})` : ''}.` : 'Then pick a benched Pokémon.'}
      </p>
      <button onClick={retreat.cancel} className="text-slate-400 hover:text-slate-200">
        Cancel (Esc)
      </button>
    </div>
  );
}
