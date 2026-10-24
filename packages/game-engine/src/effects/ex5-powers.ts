// EX Hidden Legends (ex5) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies
// never do.
// Agreed with the user: Power Diffusion stops every attack's damage to its owner's Benched Pokémon, theirs too (attacks.ts).
// From the text: Healing Shower is its owner's choice ("you may") as Milotic evolves from the hand, and never removes damage
// counters from a Pokémon-ex; Heal Dance and Temperamental Weather are once a turn however many there are (PlayerState
// healDanceTurn, weatherTurn); Temperamental Weather's new Castform keeps everything the old one had (`castform` choice);
// Energy Grounding is asked once the opponent's attack is over, before the Knock Out discards the Energy (attacks.ts); Mark
// of Antiquity stops the named Pokémon-ex of either player; Relicanth's Deep Sleep works only as its owner's Active Pokémon.
import { isBasicEnergy, lookupCard } from '../cards.js';
import { type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { openBenchSlot, pokemonName } from '../status.js';
import { babyEvolution, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { roughSkin } from './ex1-powers.js';

/** Temperamental Weather: once a turn (however many Castform), the Castform is switched with another form from the deck. */
const weather = (names: string[]): PowerEffect => ({
  blocked: (s) => (s.me.weatherTurn === s.turn ? 'Temperamental Weather has already been used this turn' : s.counts.deck ? null : 'Your deck is empty'),
  use(ctx) {
    ctx.me.weatherTurn = ctx.state.turn;
    ctx.pend({ kind: 'castform', source: 'Temperamental Weather', target: ctx.sourceTarget, names });
  },
});

/** The player's Benched Pokémon with a Metal Energy card attached (Metal Juncture). */
const metalBenched = (s: PowerSituation): Target[] =>
  ownTargets(s.me).filter((t) => t !== 'active' && pokemonAt(s.me, t)!.energy.some((e) => !e.provides && lookupCard(s.cards, e.defId).kind === 'energy' && (lookupCard(s.cards, e.defId) as { energyType: string }).energyType === 'metal'));

export const EX5_POWERS: Record<string, PowerEffect> = {
  // Claydol – Primal Pull: as the Active Pokémon, each player's Evolved Pokémon pay 1 more Colorless Energy to attack (attackError).
  'ex5-2': { ...POKE_BODY, primalPull: true },
  // Machamp – Overzealous: 30 more to the Defending Pokémon while the opponent has a Pokémon-ex in play (attacks.ts).
  'ex5-9': { ...POKE_BODY, overzealous: 30 },
  // Metagross – Metal Juncture: any number of times a turn, a Metal Energy card from a Benched Pokémon to the Active Pokémon.
  'ex5-11': {
    blocked: (s) => (s.me.active && metalBenched(s).length ? null : 'None of your Benched Pokémon has a Metal Energy card attached'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: metalBenched(s), prompt: 'Choose a Benched Pokémon to move a Metal Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => !e.provides && (lookupCard(s.cards, e.defId) as { energyType?: string }).energyType === 'metal'), prompt: 'Choose the Metal Energy card' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      const to = ctx.me.active;
      if (!from || !card || !to) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Milotic – Healing Shower: played from the hand to evolve, its owner may remove every damage counter from every Pokémon (not Pokémon-ex).
  'ex5-12': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length) return;
      const target: Target = owner.active === pokemon ? 'active' : owner.bench.indexOf(pokemon);
      state.pendingChoice = { player: owner.id, source: 'Healing Shower', kind: 'mayUse', power: 'healingShower', target };
    },
  },
  // Pinsir – Crust: 30 less from the opponent's Basic Pokémon's attacks.
  'ex5-13': { ...POKE_BODY, basicGuard: 30 },
  // Walrein – Crush Draw: once a turn, the top card of the deck is shown; a basic Energy card goes to one of the player's Pokémon.
  'ex5-15': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const [top] = ctx.me.deck;
      if (!top) return;
      ctx.log(`Revealed ${lookupCard(ctx.state.cards, top.defId).name}.`);
      if (!isBasicEnergy(lookupCard(ctx.state.cards, top.defId))) return ctx.log('It went back on top of the deck.');
      ctx.me.deck.shift();
      ctx.pend({ kind: 'attachCard', source: 'Crush Draw', card: top });
    },
  },
  // Bellossom – Heal Dance: once a turn (however many Bellossom), 2 damage counters off one of the player's Pokémon.
  'ex5-16': {
    blocked: (s) => (s.me.healDanceTurn === s.turn ? 'Heal Dance has already been used this turn' : ownTargets(s.me).some((t) => pokemonAt(s.me, t)!.damage > 0) ? null : 'None of your Pokémon has damage counters'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.damage > 0), prompt: 'Choose one of your Pokémon to remove 2 damage counters from' }],
    use(ctx) {
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!p) return;
      ctx.me.healDanceTurn = ctx.state.turn;
      const healed = Math.min(20, p.damage);
      p.damage -= healed;
      ctx.log(`Removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Ninetales – Safeguard.
  'ex5-22': { ...POKE_BODY, guardFrom: 'ex' },
  // Rain, Snow-cloud and Sunny Castform, Castform – Temperamental Weather.
  'ex5-23': weather(['Castform', 'Sunny Castform', 'Snow-cloud Castform']),
  'ex5-25': weather(['Castform', 'Rain Castform', 'Sunny Castform']),
  'ex5-26': weather(['Castform', 'Rain Castform', 'Snow-cloud Castform']),
  'ex5-30': weather(['Sunny Castform', 'Rain Castform', 'Snow-cloud Castform']),
  // Relicanth – Deep Sleep: as its owner's Active Pokémon, an Asleep Pokémon wakes up between turns only on 2 heads.
  'ex5-24': { ...POKE_BODY, deepSleep: true },
  // Beldum, Metang – Levitate: with any Energy attached, its Retreat Cost is 0.
  'ex5-28': freeRetreat((pokemon) => pokemon.energy.length > 0),
  'ex5-44': freeRetreat((pokemon) => pokemon.energy.length > 0),
  // Beldum – Magnetic Call: once a turn, heads puts a Metal Basic Pokémon from the deck onto the Bench.
  'ex5-29': {
    oncePerTurn: true,
    blocked: (s) => (!s.counts.deck ? 'Your deck is empty' : openBenchSlot(s.me.bench, s.cards, s.stadium) >= 0 ? null : 'Your Bench is full'),
    use: (ctx) => (ctx.flip() ? ctx.pend({ kind: 'pickFromDeck', source: 'Magnetic Call', filter: 'basicType', type: 'metal', toBench: true, optional: true }) : ctx.log('Magnetic Call did nothing.')),
  },
  // Dodrio – Fast Feet: it can retreat while Asleep or Paralyzed (retreatError).
  'ex5-33': { ...POKE_BODY, fastFeet: true },
  // Glalie – Ice Wall: 40 less from the opponent's Pokémon with a Special Energy card attached (attacks.ts).
  'ex5-34': { ...POKE_BODY, specialGuard: 40 },
  // Igglybuff – Baby Evolution.
  'ex5-37': babyEvolution('Jigglypuff'),
  // Lanturn – Energy Grounding (attacks.ts).
  'ex5-38': { energyGrounding: true },
  // Machoke – Strikes Back: damaged as the Active Pokémon, a damage counter on the Attacking Pokémon.
  'ex5-41': roughSkin(1),
  // Rhydon – Power Diffusion (attacks.ts).
  'ex5-46': { ...POKE_BODY, powerDiffusion: true },
  // Clamperl, Registeel ex – Exoskeleton: 10 less attack damage.
  'ex5-58': { ...POKE_BODY, damageReduction: 10 },
  'ex5-99': { ...POKE_BODY, damageReduction: 10 },
  // Staryu – Core Guard: with any Psychic Energy attached, 10 less from any attack.
  'ex5-75': { ...POKE_BODY, coreGuard: { amount: 10, energy: 'psychic', anyAttack: true } },
  // Tentacool – Freefloating: with no Energy attached, its Retreat Cost is 0.
  'ex5-77': freeRetreat((pokemon) => pokemon.energy.length === 0),
  // Groudon ex, Kyogre ex – Mark of Antiquity (attackError).
  'ex5-93': { ...POKE_BODY, markOfAntiquity: ['Kyogre ex', 'Rayquaza ex'] },
  'ex5-94': { ...POKE_BODY, markOfAntiquity: ['Groudon ex', 'Rayquaza ex'] },
  // Regice ex – Crystal Body: the Attacking Pokémon's attacks do nothing to it but damage.
  'ex5-97': { ...POKE_BODY, crystalBody: true },
  // Regirock ex – Healing Stone: a damage counter off between turns.
  'ex5-98': { ...POKE_BODY, rainDish: 10 },
  // Vileplume ex – Block Dust: as the Active Pokémon, the opponent can't play Trainer cards but Supporters (trainersDusted).
  'ex5-100': { ...POKE_BODY, blockDust: true },
};
