// EX Ruby & Sapphire (ex1) Poké-Powers and Poké-Bodies, by card id. As in the e-Card sets, Poké-Powers stop with any
// Special Condition (as every Pokémon Power does), Poké-Bodies always work (`body`, `ignoresConditions`).
// Rulings (from the text): Firestarter's Fire Energy card and Energy Draw's Energy card are the player's choice; Energy
// Draw then draws up to 3 (the player picks how many). Rough Skin works even when the Attacking Pokémon Knocks Sharpedo
// (or Carvanha) Out. Natural Cure is a basic Energy card of its type attached from the hand.
// Not done yet (asked on the PR): Psy Shadow (Gardevoir), Lazy (Slaking), Water Call and Natural Remedy (Swampert), Drive
// Off (Swellow).
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { isEnergyCardOf } from '../engine.js';
import { discardsLocked, type PowerEffect } from '../powers.js';
import { addLog, hasSpecialCondition, pokemonName } from '../status.js';
import { BASE1_POWERS } from './base1-powers.js';

/** A Poké-Body: always on, whatever its Pokémon's Special Conditions. */
const POKE_BODY = { ignoresConditions: true, body: true } as const;

/** Rough Skin: as the Active Pokémon, damaged by the opponent's attack (even Knocked Out), `counters` damage counters on the Attacking Pokémon. */
const roughSkin = (counters: number): PowerEffect => ({
  ...POKE_BODY,
  onAttackDamage(ctx, pokemon) {
    if (ctx.opp.active !== pokemon) return;
    ctx.attacker.damage += 10 * counters;
    ctx.log(`Rough Skin: put ${counters} damage counter${counters === 1 ? '' : 's'} on ${ctx.attackerDef.name}.`);
  },
});

/** Natural Cure: a basic `type` Energy card attached to it from the hand removes all its Special Conditions. */
const naturalCure = (type: EnergyType): PowerEffect => ({
  ...POKE_BODY,
  onEnergyFromHand(state, owner, pokemon, _target, energy) {
    const d = lookupCard(state.cards, energy.defId);
    if (energy.provides || !isBasicEnergy(d) || d.kind !== 'energy' || d.energyType !== type || !hasSpecialCondition(pokemon)) return;
    pokemon.condition = null;
    pokemon.poison = 0;
    pokemon.burned = false;
    delete pokemon.paralyzedTurn;
    addLog(state, `Natural Cure: ${pokemonName(state, pokemon)} is no longer affected by Special Conditions.`, owner.id);
  },
});

/** Fire Energy cards in a discard pile. */
const fireIn = (cards: Parameters<typeof isEnergyCardOf>[1], pile: Parameters<typeof isEnergyCardOf>[0][]) => pile.filter((c) => isEnergyCardOf(c, cards, 'fire'));

export const EX1_POWERS: Record<string, PowerEffect> = {
  // Beautifly – Withering Dust: while it's in play, no Resistance for any Active Pokémon (attacks.ts).
  'ex1-2': { ...POKE_BODY, witheringDust: true },

  // Blaziken – Firestarter: once a turn, a Fire Energy card from the discard pile to 1 of the player's Benched Pokémon.
  'ex1-3': {
    oncePerTurn: true,
    blocked(s) {
      if (!fireIn(s.cards, s.me.discard).length) return 'No Fire Energy cards in your discard pile';
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return s.me.bench.some(Boolean) ? null : 'No Benched Pokémon to attach to';
    },
    choices: (s) => [
      { kind: 'discardCard', field: 'cardUid', options: fireIn(s.cards, s.me.discard), prompt: 'Choose a Fire Energy card from your discard pile' },
      { kind: 'ownPokemon', field: 'to', options: s.me.bench.flatMap((p, i) => (p ? [i] : [])), prompt: 'Choose one of your Benched Pokémon to attach it to' },
    ],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      const to = typeof ctx.choices.to === 'number' ? ctx.me.bench[ctx.choices.to] : null;
      if (!card || !to) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      to.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Delcatty – Energy Draw: once a turn, discard an Energy card from the hand, then draw up to 3.
  'ex1-5': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'No Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy'), prompt: 'Choose an Energy card from your hand to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from the hand.`);
      if (ctx.me.deck.length) ctx.pend({ kind: 'drawCount', source: 'Energy Draw', max: 3 });
    },
  },

  // Dustox – Protective Dust: the Attacking Pokémon's attacks do nothing to it but damage (as Crystal Body).
  'ex1-6': { ...POKE_BODY, crystalBody: true },

  // Mightyena – Intimidating Fang: as the Active Pokémon, the opponent's attacks do 10 less to its player's Pokémon (attacks.ts).
  'ex1-10': { ...POKE_BODY, intimidatingFang: 10 },

  // Sceptile – Energy Trans: as Base Set Venusaur's.
  'ex1-20': BASE1_POWERS['base1-15']!,

  // Sharpedo – Rough Skin: 2 damage counters on the Attacking Pokémon.
  'ex1-22': roughSkin(2),

  // Cascoon, Silcoon – Hard Cocoon: heads, 30 less damage from the opponent's attack (attacks.ts).
  'ex1-26': { ...POKE_BODY, hardCocoon: 30 },
  'ex1-43': { ...POKE_BODY, hardCocoon: 30 },

  // Combusken, Grovyle, Marshtomp – Natural Cure.
  'ex1-28': naturalCure('fire'),
  'ex1-32': naturalCure('grass'),
  'ex1-41': naturalCure('water'),

  // Carvanha – Rough Skin: 1 damage counter on the Attacking Pokémon.
  'ex1-51': roughSkin(1),
};
