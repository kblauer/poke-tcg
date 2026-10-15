import { canPayCost, lookupCard, type CardLibrary, type GameAction, type InPlayPokemon, type PokemonCardDef } from '@poke-tcg/game-engine';

/** Attack buttons for the player's active Pokémon. Attacks it can't pay for are disabled. */
export function AttackList({
  pokemon,
  cards,
  canAttack,
  pending,
  send,
}: {
  pokemon: InPlayPokemon;
  cards: CardLibrary;
  /** It's the player's turn, attacking is allowed this turn and no move is in flight. */
  canAttack: boolean;
  pending: GameAction | null;
  send: (a: GameAction) => void;
}) {
  const def = lookupCard(cards, pokemon.card.defId) as PokemonCardDef;
  return (
    <div className="flex flex-col gap-1">
      {def.attacks.map((a, i) => {
        const affordable = canPayCost(pokemon, a, cards);
        return (
          <button
            key={a.name}
            disabled={!canAttack || !affordable}
            onClick={() => send({ type: 'ATTACK', attackIndex: i })}
            className={`rounded bg-red-600 px-2 py-1 text-left text-xs transition hover:bg-red-500 active:scale-95 disabled:hover:bg-red-600 ${
              pending?.type === 'ATTACK' && pending.attackIndex === i
                ? 'animate-pulse ring-2 ring-yellow-300'
                : affordable && canAttack
                  ? ''
                  : 'disabled:opacity-40'
            }`}
          >
            {a.name} ({a.damage})
            {a.text && <span title={`Not implemented yet: ${a.text}`}> *</span>}
          </button>
        );
      })}
    </div>
  );
}
