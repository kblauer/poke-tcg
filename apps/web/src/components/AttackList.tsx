import { attackDamage, attackEffect, lookupCard, type CardLibrary, type GameAction, type InPlayPokemon, type PokemonCardDef } from '@poke-tcg/game-engine';
import type { AttackControl } from '../hooks/useAttack';

/**
 * Attack buttons for the player's active Pokémon. Attacks it can't use (energy, Special
 * Conditions, card text) are disabled, with the reason as a tooltip. Plain damage is shown
 * against the defending Pokémon, after weakness and resistance.
 */
export function AttackList({
  pokemon,
  defender,
  cards,
  canAttack,
  pending,
  attack,
}: {
  pokemon: InPlayPokemon;
  /** The opponent's active Pokémon, if any. */
  defender: InPlayPokemon | null;
  cards: CardLibrary;
  /** It's the player's turn, attacking is allowed this turn and no move is in flight. */
  canAttack: boolean;
  pending: GameAction | null;
  attack: AttackControl;
}) {
  const def = lookupCard(cards, pokemon.card.defId) as PokemonCardDef;
  const defenderDef = defender && (lookupCard(cards, defender.card.defId) as PokemonCardDef);
  return (
    <div className="flex flex-col gap-1">
      {def.attacks.map((a, i) => {
        const error = attack.error(i);
        const usable = canAttack && error === null;
        // Variable damage ("30+", "10×", "?") depends on the card text, so it's shown as printed.
        const fixed = !a.damageText || /^\d+$/.test(a.damageText);
        const damage = fixed && defenderDef ? attackDamage(a, def, defenderDef, defender) : a.damage;
        const modifier =
          damage === a.damage ? null : damage > a.damage ? `${defenderDef!.name} is weak to ${def.type}` : `${defenderDef!.name} resists ${def.type}`;
        const unimplemented = a.text && !attackEffect(def.id, a.name);
        const active = (pending?.type === 'ATTACK' && pending.attackIndex === i) || attack.choosingIndex === i;
        return (
          <button
            key={a.name}
            disabled={!usable}
            title={[error, a.text, unimplemented && '(Card text not implemented yet.)'].filter(Boolean).join('\n') || undefined}
            onClick={() => attack.start(i)}
            className={`rounded bg-red-600 px-2 py-1 text-left text-xs transition hover:bg-red-500 active:scale-95 disabled:hover:bg-red-600 ${
              active ? 'animate-pulse ring-2 ring-yellow-300' : usable ? '' : 'disabled:opacity-40'
            }`}
          >
            {a.name} (
            {!fixed ? (
              (a.damageText ?? a.damage)
            ) : modifier ? (
              <span title={modifier} className={damage > a.damage ? 'font-bold text-yellow-300' : 'text-slate-300'}>
                {a.damage}→{damage}
              </span>
            ) : (
              a.damage
            )}
            ){unimplemented && ' *'}
          </button>
        );
      })}
    </div>
  );
}
