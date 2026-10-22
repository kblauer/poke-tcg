// EX Team Rocket Returns (ex7) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition,
// Poké-Bodies never do.
// Agreed with the user: Darkest Impulse puts its 2 damage counters on every Pokémon the opponent evolves from their hand, one
// Darkest Impulse however many Dark Ampharos (engine.ts); Methane Leak hits both players' Poisoned Pokémon (as Eerie Aura);
// "Darkness Energy attached" counts any Energy providing Darkness (R Energy, Dark Metal Energy).
// From the text: Black Beam, Fire Breath and Dark Spell work only as their player's Active Pokémon; Buffer is Fortitude;
// Knockout Gas and Dark Scale happen when the opponent's attack Knocks Out their Active Pokémon; Spiny flips until tails;
// Saturation works on a Water Energy card attached from the hand; Sand Damage puts its damage counters on the opponent's
// Benched Basic Pokémon, one Sand Damage a player between turns; Dual Armor makes Rocket's Scizor ex and Scyther ex both
// types with the Energy attached (refreshHideout).
import type { AttackContext } from '../attacks.js';
import { conditionProof, lookupCard } from '../cards.js';
import { afflictBetweenTurns, energyPool, isEnergyCardOf, type InPlayPokemon } from '../engine.js';
import { powerEffect } from './index.js';
import { conditionFree, ownTargets, pokemonAt, powerActive, type PowerEffect } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, effectId, inPlayDef, pokemonName } from '../status.js';
import { BASE1_POWERS } from './base1-powers.js';
import { roughSkin } from './ex1-powers.js';
import { babyEvolution, EX2_POWERS, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { EX4_POWERS } from './ex4-powers.js';
import { ROCKET_POWERS } from './rocket-powers.js';

/** Its player's Active Pokémon was Knocked Out by the opponent's attack: `then` to the Attacking Pokémon. */
const onKnockedOut = (then: (ctx: AttackContext) => void): PowerEffect => ({
  ...POKE_BODY,
  onAttackDamage(ctx, pokemon) {
    if (ctx.opp.active !== pokemon || pokemon.damage < inPlayDef(ctx.state.cards, pokemon).hp || ctx.me.active !== ctx.attacker) return;
    then(ctx);
  },
});

/** A Special Condition on the Attacking Pokémon from its Defending Pokémon's body, unless it can't be affected. */
function afflictAttacker(ctx: AttackContext, condition: 'confused' | 'poisoned') {
  const working = powerActive(ctx.attacker, ctx.state.cards, [ctx.me, ctx.opp]) ? powerEffect(effectId(ctx.attacker)) : undefined;
  if (conditionProof(ctx.attackerDef) || conditionFree(ctx.attacker, ctx.state.cards, working) || (condition === 'poisoned' && working?.noPoison)) return ctx.log(`${ctx.attackerDef.name} can't be affected by Special Conditions.`);
  if (condition === 'poisoned') ctx.attacker.poison = Math.max(ctx.attacker.poison ?? 0, 10);
  else {
    ctx.attacker.condition = 'confused';
    delete ctx.attacker.paralyzedTurn;
  }
  ctx.log(`${ctx.attackerDef.name} is now ${condition === 'poisoned' ? 'Poisoned' : 'Confused'}.`);
}

/** Saturation: a Water Energy card attached to it from the hand removes its Special Conditions and `counters` damage counters. */
const saturation = (counters: number): PowerEffect => ({
  ...POKE_BODY,
  onEnergyFromHand(state, owner, pokemon, _target, energy) {
    if (!isEnergyCardOf(energy, state.cards, 'water')) return;
    Object.assign(pokemon, { condition: null, poison: 0, burned: false });
    delete pokemon.paralyzedTurn;
    const healed = Math.min(10 * counters, pokemon.damage);
    pokemon.damage -= healed;
    addLog(state, `Saturation: ${pokemonName(state, pokemon)} has no Special Conditions${healed ? ` and ${healed / 10} fewer damage counters` : ''}.`, owner.id);
  },
});

/** Buffer: an opponent's attack that would Knock it Out leaves it with 10 HP on heads (as Fortitude). */
const buffer: PowerEffect = { ...POKE_BODY, fortitude: true };

/** Once a turn, as its player's Active Pokémon, `then` (Black Beam, Fire Breath, Dark Spell). */
const asActive = (name: string, then: PowerEffect['use']): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => (s.source !== 'active' ? `${name} must be your Active Pokémon` : s.opp.active ? null : 'Your opponent has no Active Pokémon'),
  use: then,
});

export const EX7_POWERS: Record<string, PowerEffect> = {
  // Azumarill – Froth: played from the hand to evolve the Active Pokémon, its owner may paralyze the opponent's Active Pokémon.
  'ex7-1': {
    onPlayFromHand(state, owner, pokemon) {
      if (owner.active !== pokemon || !pokemon.evolvedFrom.length) return;
      state.pendingChoice = { player: owner.id, source: 'Froth', kind: 'mayUse', power: 'froth', target: 'active' };
    },
  },
  // Dark Ampharos – Darkest Impulse (engine.ts, EVOLVE).
  'ex7-2': { ...POKE_BODY, darkestImpulse: true },
  // Dark Crobat – Black Beam: once a turn, as the Active Pokémon, the opponent's Active Pokémon is now Poisoned.
  'ex7-3': asActive('Dark Crobat', (ctx) => void afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active!, 'poisoned')),
  // Dark Electrode – Darkness Navigation: once a turn, with no Energy attached, a Darkness or Dark Metal Energy card from the deck to it.
  'ex7-4': {
    oncePerTurn: true,
    blocked: (s) => (pokemonAt(s.me, s.source)!.energy.length ? 'Dark Electrode has Energy attached' : s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Darkness Navigation', filter: 'energyNamed', name: ['Darkness Energy', 'Dark Metal Energy'], attachTo: ctx.sourceTarget, optional: true }),
  },
  // Dark Slowking – Cunning: once a turn, the top card of the opponent's deck looked at; then they may be made to shuffle.
  'ex7-9': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppDeck ? null : "Your opponent's deck is empty"),
    use: (ctx) => ctx.pend({ kind: 'cunning', source: 'Cunning' }),
  },
  // Jumpluff, Skiploom, Hoppip – Buffer.
  'ex7-11': buffer,
  'ex7-49': buffer,
  'ex7-57': buffer,
  // Kingdra – Dragon Veil: its player's Active Pokémon has no Weakness (attacks.ts).
  'ex7-12': { ...POKE_BODY, dragonVeil: true },
  // Togetic – Holy Shield: attacks by the opponent's Pokémon with Dark in their names don't affect it.
  'ex7-14': { ...POKE_BODY, guardFrom: 'dark' },
  // Dark Dragonite – Dark Trance: any number of times, a Darkness Energy card from one of the player's Pokémon to another (as Energy Trans).
  'ex7-15': {
    ...BASE1_POWERS['base1-15']!,
    blocked: (s) => (ownTargets(s.me).some((t) => pokemonAt(s.me, t)!.energy.some((e) => isDarkCard(s.cards, e))) && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon has a Darkness Energy card attached'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.energy.some((e) => isDarkCard(s.cards, e))), prompt: 'Choose one of your Pokémon to move a Darkness Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => isDarkCard(s.cards, e)), prompt: 'Choose the Darkness Energy card' }] : []),
        ...(from ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !to || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Dark Muk – Sticky Goo: as Team Rocket's.
  'ex7-16': { ...POKE_BODY, ...ROCKET_POWERS['base5-41']! },
  // Dark Sandslash – Poison Payback.
  'ex7-18': EX2_POWERS['ex2-2']!,
  // Dark Tyranitar – Sand Damage: as its player's Active Pokémon, a damage counter on each of the opponent's Benched Basic
  // Pokémon between turns (one Sand Damage, however many).
  'ex7-20': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp, done) {
      if (owner.active !== pokemon || done.has(`${owner.id}:Sand Damage`)) return;
      done.add(`${owner.id}:Sand Damage`);
      for (const p of opp.bench) {
        if (!p || inPlayDef(state.cards, p).stage !== 'basic') continue;
        p.damage += 10;
        addLog(state, `Sand Damage put a damage counter on ${pokemonName(state, p)}.`, opp.id);
      }
    },
  },
  // Delibird – Gift Exchange: once a turn, as the Active Pokémon, a card from the hand shuffled into the deck, then a card drawn.
  'ex7-21': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Delibird must be your Active Pokémon' : s.me.hand.length ? null : 'Your hand is empty'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card from your hand to shuffle into your deck' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.deck.push(card);
      shuffleDeck(ctx);
      ctx.log('Shuffled a card from the hand into the deck.');
      const [drawn] = ctx.me.deck.splice(0, 1);
      if (drawn) ctx.me.hand.push(drawn);
      ctx.log('Drew a card.');
    },
  },
  // Ledian – Powder Protection: 40 less attack damage from Pokémon with an owner in their names.
  'ex7-23': { ...POKE_BODY, ownerGuard: 40 },
  // Magby – Baby Evolution.
  'ex7-24': babyEvolution('Magmar'),
  // Misdreavus – Dark Spell: once a turn, as the Active Pokémon, heads puts a damage counter on one of the opponent's Pokémon.
  'ex7-25': asActive('Misdreavus', (ctx) => (ctx.flip() ? ctx.pend({ kind: 'placeCounters', source: 'Dark Spell', count: 1, active: true }) : ctx.log('Dark Spell did nothing.'))),
  // Quagsire, Wooper – Saturation.
  'ex7-26': saturation(2),
  'ex7-81': saturation(1),
  // Qwilfish – Spiny: damaged as the Active Pokémon, flips until tails, a damage counter on the Attacking Pokémon for each heads.
  'ex7-27': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon) return;
      let heads = 0;
      while (ctx.oppFlip()) heads++;
      if (!heads) return;
      ctx.attacker.damage += 10 * heads;
      ctx.log(`Spiny: put ${heads} damage counter${heads === 1 ? '' : 's'} on ${ctx.attackerDef.name}.`, ctx.opp.id);
    },
  },
  // Dark Dragonair – Evolutionary Light: once a turn, as the Active Pokémon, an Evolution card from the deck, shown.
  'ex7-31': {
    ...ROCKET_POWERS['base5-33']!,
    blocked: (s) => (s.source !== 'active' ? 'Dark Dragonair must be your Active Pokémon' : s.counts.deck ? null : 'Your deck is empty'),
  },
  // Dark Gyarados – Dark Scale: Knocked Out as the Active Pokémon by the opponent's attack, 3 damage counters on the Attacking Pokémon.
  'ex7-36': onKnockedOut((ctx) => {
    ctx.attacker.damage += 30;
    ctx.log(`Dark Scale: put 3 damage counters on ${ctx.attackerDef.name}.`, ctx.opp.id);
  }),
  // Dark Houndoom – Fire Breath: once a turn, as the Active Pokémon, heads Burns the Defending Pokémon.
  'ex7-37': asActive('Dark Houndoom', (ctx) => (ctx.flip() ? afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active!, 'burned') : ctx.log('Fire Breath did nothing.'))),
  // Dark Weezing – Methane Leak: as its player's Active Pokémon, a damage counter on each Pokémon still Poisoned between turns (both players').
  'ex7-42': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const side of [owner, opp]) {
        const p = side.active;
        if (!p?.poison) continue;
        p.damage += 10;
        addLog(state, `Methane Leak put a damage counter on ${pokemonName(state, p)}.`, side.id);
      }
    },
  },
  // Heracross – Crust: 20 less attack damage from the opponent's Basic Pokémon.
  'ex7-43': { ...POKE_BODY, basicGuard: 20 },
  // Mantine – Ripples: once a turn, a damage counter off one of the player's other Pokémon.
  'ex7-45': {
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).some((t) => t !== s.source && pokemonAt(s.me, t)!.damage > 0) ? null : 'None of your other Pokémon has damage counters'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== s.source && pokemonAt(s.me, t)!.damage > 0), prompt: 'Choose one of your Pokémon to remove a damage counter from' }],
    use(ctx) {
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!p || !p.damage) return;
      p.damage -= 10;
      ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Drowzee – Insomnia: it can't be Asleep.
  'ex7-54': { ...POKE_BODY, noSleep: true },
  // Houndour – Dark Lift: as Team Aqua's Carvanha's (any Energy providing Darkness).
  'ex7-60': EX4_POWERS['ex4-25']!,
  // Koffing – Knockout Gas: Knocked Out as the Active Pokémon by the opponent's attack, the Attacking Pokémon is Confused and Poisoned.
  'ex7-61': onKnockedOut((ctx) => {
    afflictAttacker(ctx, 'confused');
    afflictAttacker(ctx, 'poisoned');
  }),
  // Rattata – Scramble: while the opponent's Active Pokémon is a Pokémon-ex, its Retreat Cost is 0.
  'ex7-71': {
    ...POKE_BODY,
    retreatChange: (pokemon, cards, _owner, opp) => (opp?.active && inPlayDef(cards, opp.active).ex ? -(inPlayDef(cards, pokemon).retreatCost ?? 0) : 0),
  },
  // Slowpoke – Dense: 10 less attack damage from the opponent's Evolved Pokémon, after Weakness and Resistance.
  'ex7-76': { ...POKE_BODY, evolvedGuard: 10 },
  // Rocket's Articuno ex – Darkness Veil: with Darkness Energy attached, the opponent's attacks do nothing to it but damage.
  'ex7-96': { ...POKE_BODY, crystalBodyWith: 'darkness' },
  // Rocket's Entei ex – Dark Condition: with Darkness Energy attached, no Weakness.
  'ex7-97': { ...POKE_BODY, noWeaknessWith: 'darkness' },
  // Rocket's Hitmonchan ex – Strikes Back: 2 damage counters on the Attacking Pokémon.
  'ex7-98': roughSkin(2),
  // Rocket's Moltres ex – Dark Lift.
  'ex7-100': EX4_POWERS['ex4-25']!,
  // Rocket's Scizor ex, Rocket's Scyther ex – Dual Armor.
  'ex7-101': { ...POKE_BODY, dualArmor: { energy: 'metal', types: ['darkness', 'metal'] } },
  'ex7-102': { ...POKE_BODY, dualArmor: { energy: 'grass', types: ['grass', 'darkness'] } },
  // Rocket's Snorlax ex – Dark Healer: with Darkness Energy attached, a damage counter off it between turns.
  'ex7-104': { ...POKE_BODY, rainDish: 10, rainDishWith: 'darkness' },
  // Rocket's Suicune ex – Dark and Clear: with Darkness Energy attached, no Special Conditions.
  'ex7-105': { ...POKE_BODY, noConditionsWith: 'darkness' },
  // Rocket's Zapdos ex – Darkness Guard: with Darkness Energy attached, 10 less from the opponent's attacks.
  'ex7-106': { ...POKE_BODY, coreGuard: { amount: 10, energy: 'darkness' } },
};

/** A Darkness Energy card (Dark Trance): one providing Darkness, not a Pokémon attached as Energy. */
const isDarkCard = (cards: Parameters<typeof energyPool>[1], e: InPlayPokemon['energy'][number]) => !e.provides && isEnergyCardOf(e, cards, 'darkness');

/** Shuffles the player's deck (Gift Exchange). */
function shuffleDeck(ctx: Parameters<NonNullable<PowerEffect['use']>>[0]) {
  [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
}
