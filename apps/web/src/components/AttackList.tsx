import { attackDamage, attackEffect, inPlayDef, usableAttacks, type CardInstance, type CardLibrary, type DamageRange, type GameAction, type InPlayPokemon } from '@poke-tcg/game-engine';
import type { AttackControl } from '../hooks/useAttack';

/**
 * Attack buttons for the player's active Pokémon. Attacks it can't use (energy, Special
 * Conditions, card text) are disabled, with the reason as a tooltip. On the player's turn each attack shows what it
 * would do to the Defending Pokémon now (`damage`, from the view: the attack played out on a copy of the game, so its
 * own effect, Weakness and Resistance, PlusPower, Defender and effects in play all count, and an attack that would be
 * stopped shows 0; one number, or a range when coin flips or choices decide it), with the printed damage in the
 * tooltip. Otherwise plain damage is shown after Weakness and Resistance, and variable damage ("10+", "50-") as printed.
 */
export function AttackList({
  pokemon,
  defender,
  cards,
  canAttack,
  pending,
  attack,
  damage: preview = [],
  recall = false,
  bench = [],
  oppBench = [],
  stadium = null,
}: {
  pokemon: InPlayPokemon;
  /** The opponent's active Pokémon, if any. */
  defender: InPlayPokemon | null;
  cards: CardLibrary;
  /** It's the player's turn, attacking is allowed this turn and no move is in flight. */
  canAttack: boolean;
  pending: GameAction | null;
  attack: AttackControl;
  /** What each attack would do now (PlayerView.attackDamage). */
  damage?: (DamageRange | null)[];
  /** Recall was played: the attacks of the cards it evolved from are listed after its own, with their card's name. */
  recall?: boolean;
  /** The player's Bench, for Psylink's copies of its Psychic Pokémon's attacks (listed last, with their names). */
  bench?: (InPlayPokemon | null)[];
  /** The opponent's Bench, for Psymimic's copies of their Pokémon's attacks (listed after its own, with their names). */
  oppBench?: (InPlayPokemon | null)[];
  /** The Stadium in play, for its attack (Rocket's Tricky Gym), listed last with its name. */
  stadium?: CardInstance | null;
}) {
  // A Transformed Ditto has the Defending Pokémon's attacks.
  const def = inPlayDef(cards, pokemon);
  const defenderDef = defender && inPlayDef(cards, defender);
  return (
    <div className="flex flex-col gap-1">
      {usableAttacks(pokemon, cards, { recall, bench, defender, oppBench, stadium }).map(({ attack: a, source, from }, i) => {
        const error = attack.error(i);
        const usable = canAttack && error === null;
        // Variable damage ("30+", "10×", "?") depends on the card text, so it's shown as printed.
        const fixed = !a.damageText || /^\d+$/.test(a.damageText);
        const damage = fixed && defenderDef ? attackDamage(a, def, defenderDef, defender) : a.damage;
        const modifier =
          damage === a.damage ? null : damage > a.damage ? `${defenderDef!.name} is weak to ${def.type}` : `${defenderDef!.name} resists ${def.type}`;
        const unimplemented = a.text && !attackEffect(source, a.name);
        // What it would do now, worked out by the engine (only its own attacks, on its turn, when it can use them).
        const now = from ? undefined : (preview[i] ?? undefined);
        const shown = now && (now.min === now.max ? String(now.min) : `${now.min}–${now.max}`);
        // Plain damage changed by something: the printed number, then what it does.
        const changed = now && fixed && now.min === now.max && now.min !== a.damage;
        const active = (pending?.type === 'ATTACK' && pending.attackIndex === i) || attack.choosingIndex === i;
        return (
          <button
            key={`${from ?? ''}:${a.name}`}
            disabled={!usable}
            title={[error, now && `Printed damage: ${a.damageText ?? a.damage}; with everything in play now: ${shown}`, a.text, unimplemented && '(Card text not implemented yet.)'].filter(Boolean).join('\n') || undefined}
            onClick={() => attack.start(i)}
            className={`rounded bg-red-600 px-2 py-1 text-left text-xs transition hover:bg-red-500 active:scale-95 disabled:hover:bg-red-600 ${
              active ? 'animate-pulse ring-2 ring-yellow-300' : usable ? '' : 'disabled:opacity-40'
            }`}
          >
            {from && <span className="text-yellow-200">{from}: </span>}
            {a.name} (
            {changed ? (
              <span className={now.min > a.damage ? 'font-bold text-yellow-300' : 'text-slate-300'}>
                {a.damage}→{now.min}
              </span>
            ) : now ? (
              <span className={fixed ? undefined : 'font-semibold text-yellow-200'}>{shown}</span>
            ) : !fixed ? (
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
