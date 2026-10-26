// Boundaries Crossed (bw7) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY): it works whatever its
// Pokémon's Special Conditions, and the older effects that stop Pokémon Powers, Poké-Powers or Poké-Bodies don't stop it.
// From the text: Allergy Panic makes every Weakness ×4, both players' (`allergyPanic`); Time Recall lets the player's own
// Evolved Pokémon use the attacks of the cards they evolved from, as Recall does, while Celebi-EX is in play (`timeRecall`);
// Shell Shield keeps every attack's damage off Squirtle on the Bench, its own player's too; Deluge takes a Water Energy card,
// basic or Special (energyCardOf), as often as the player likes; Stickiness is 1 Colorless more for the opponent's Active
// Pokémon, each Jellicent adding up (`retreatTax`); Sinister Hand moves 1 damage counter a use, as often as the player likes,
// and may Knock Out the Pokémon it goes to (as Damage Swap, agreed for Reuniclus); Long-Distance Hypnosis's Asleep goes through
// the usual protections (afflictBetweenTurns); Poison Point works even if the Attacking Pokémon Knocks it Out; Sturdy needs no
// damage counters on it and works against any attack's damage; Sand Slammer puts damage counters (not damage) on, between
// every two turns while Flygon is the Active Pokémon; Transform can be used as often as the player likes while Ditto is still
// Ditto (once it's another Pokémon, the Ability is gone), and the Ditto card stays under the new card, going wherever it goes
// (kept as a Pokémon LEGEND's other half is: `legendHalf`, never a Trainer card). Not done: Audino's Busybody, an Ability used
// from the hand, which no action can do yet (README: Generation 5).
import { isBasicPokemon, lookupCard } from '../cards.js';
import { afflictBetweenTurns, type InPlayPokemon, type Target } from '../engine.js';
import { energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, countersMoved, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { ABILITY, inPlay, onlyBenched } from './common.js';
import { energyCardOf } from './ex2.js';

/** An older set's Poké-Body or Poké-Power as an Ability (the same effect, but a kind of its own). */
export const asAbility = (effect: PowerEffect): PowerEffect => ({ ...effect, ...ABILITY, body: undefined });

/** The opponent's Pokémon in play, as targets. */
const oppTargets = (s: PowerSituation): Target[] => ownTargets(s.opp);

/** Poison Point: as its player's Active Pokémon, damaged by the opponent's attack (even Knocked Out), the Attacking Pokémon is now Poisoned. */
const poisonPoint: PowerEffect = {
  ...ABILITY,
  onAttackDamage(ctx, pokemon) {
    if (ctx.opp.active !== pokemon || ctx.me.active !== ctx.attacker) return;
    ctx.log('Poison Point:', ctx.opp.id);
    afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'poisoned');
  },
};

/** Basic Pokémon cards in the hand (no Restored Pokémon: they aren't Basic Pokémon). */
const handBasics = (s: PowerSituation) => s.me.hand.filter((c) => isBasicPokemon(lookupCard(s.cards, c.defId)));

/** Water Energy cards (basic or Special) in the hand. */
const handWater = (s: PowerSituation) => s.me.hand.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy' && energyCardOf(s.cards, c, 'water'));

export const BW7_POWERS: Record<string, PowerEffect> = {
  // Vileplume – Allergy Panic: every Weakness ×4 (attacks.ts).
  'bw7-3': { ...ABILITY, allergyPanic: true },

  // Celebi-EX – Time Recall: the player's Evolved Pokémon can use the attacks of the cards they evolved from (recallsAttacks).
  'bw7-9': { ...ABILITY, timeRecall: true },

  // Squirtle – Shell Shield: on the Bench, no damage from any attack.
  'bw7-29': { ...ABILITY, benchImmuneAll: true },

  // Blastoise – Deluge: a Water Energy card from the hand onto any of the player's Pokémon, as often as they like.
  'bw7-31': {
    ...ABILITY,
    blocked: (s) => (handWater(s).length ? null : 'No Water Energy in your hand'),
    choices: (s) => [
      { kind: 'handCard', field: 'cardUid', options: handWater(s), prompt: 'Choose a Water Energy from your hand' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me), prompt: 'Attach it to' },
    ],
    use(ctx) {
      const i = ctx.me.hand.findIndex((c) => c.uid === ctx.choices.cardUid);
      const [energy] = ctx.me.hand.splice(i, 1);
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      to.energy.push(energy!);
      ctx.log(`Attached a Water Energy to ${pokemonName(ctx.state, to)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, energy!);
    },
  },

  // Jellicent – Stickiness: the opponent's Active Pokémon costs 1 Colorless more to retreat.
  'bw7-45': { ...ABILITY, retreatTax: 1 },

  // Keldeo-EX – Rush In: once a turn, from the Bench, switched with the player's Active Pokémon.
  'bw7-49': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Keldeo-EX') ?? (s.me.active ? null : 'You have no Active Pokémon'),
    use(ctx) {
      if (typeof ctx.sourceTarget !== 'number') return;
      swapActive(ctx.state, ctx.me, ctx.sourceTarget);
    },
  },

  // Dusknoir – Sinister Hand: a damage counter from one of the opponent's Pokémon to another of theirs, as often as the player likes.
  'bw7-63': {
    ...ABILITY,
    blocked(s) {
      if (oppTargets(s).length < 2) return 'Your opponent needs 2 Pokémon in play';
      return oppTargets(s).some((t) => pokemonAt(s.opp, t)!.damage >= 10) ? null : "None of your opponent's Pokémon have damage counters";
    },
    choices(s, c) {
      const from = oppTargets(s).filter((t) => pokemonAt(s.opp, t)!.damage >= 10);
      if (c.oppFrom === undefined) return [{ kind: 'oppPokemon', field: 'oppFrom', options: from, prompt: 'Move a damage counter from' }];
      return [
        { kind: 'oppPokemon', field: 'oppFrom', options: from, prompt: 'Move a damage counter from' },
        { kind: 'oppPokemon', field: 'oppTo', options: oppTargets(s).filter((t) => t !== c.oppFrom), prompt: 'Move it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.opp, ctx.choices.oppFrom!);
      const to = pokemonAt(ctx.opp, ctx.choices.oppTo!);
      if (!from || !to || from === to || from.damage < 10) return;
      from.damage -= 10;
      countersMoved(ctx.state, from, 10);
      to.damage += 10;
      ctx.log(`Moved a damage counter from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Cresselia-EX – Sparkling Particles: 10 off it between turns.
  'bw7-67': { ...ABILITY, rainDish: 10 },

  // Munna – Long-Distance Hypnosis: once a turn, a coin; heads, the opponent's Active Pokémon is Asleep; tails, the player's is.
  'bw7-68': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.opp.active && s.me.active ? null : 'There is no Active Pokémon to put to sleep'),
    use(ctx) {
      const heads = ctx.flip();
      const side = heads ? ctx.opp : ctx.me;
      if (side.active) afflictBetweenTurns(ctx.state, side.id, side.active, 'asleep');
    },
  },

  // Venipede, Whirlipede, Scolipede – Poison Point.
  'bw7-72': poisonPoint,
  'bw7-73': poisonPoint,
  'bw7-74': poisonPoint,

  // Crustle – Sturdy: with full HP, an attack that would Knock it Out leaves it with 10 HP (attacks.ts).
  'bw7-85': { ...ABILITY, sturdy: true },

  // Flygon – Sand Slammer: between turns, as the player's Active Pokémon, a damage counter on each of the opponent's Pokémon.
  'bw7-99': {
    ...ABILITY,
    checkup(state, owner, pokemon: InPlayPokemon, opp) {
      if (owner.active !== pokemon) return;
      const hit = inPlay(opp);
      for (const p of hit) p.damage += 10;
      if (hit.length) addLog(state, "Sand Slammer: put a damage counter on each of your opponent's Pokémon.", owner.id);
    },
  },

  // Ditto – Transform: a Basic Pokémon from the hand put on top of it, which it now is (not playing it, nor evolving).
  'bw7-108': {
    ...ABILITY,
    blocked: (s) => (handBasics(s).length ? null : 'No Basic Pokémon in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: handBasics(s), prompt: 'Choose a Basic Pokémon from your hand for Ditto to become' }],
    use(ctx) {
      const i = ctx.me.hand.findIndex((c) => c.uid === ctx.choices.cardUid);
      if (i < 0) return;
      const [card] = ctx.me.hand.splice(i, 1);
      const ditto = ctx.source;
      // The Ditto card stays under it, going wherever it goes (as a Pokémon LEGEND's other half: no Trainer card).
      (ditto.attached ??= []).push({ card: ditto.card, until: Number.MAX_SAFE_INTEGER, legendHalf: true });
      ditto.card = card!;
      ctx.log(`Ditto is now ${lookupCard(ctx.state.cards, card!.defId).name}.`);
    },
  },

  // Stoutland – Sentinel: as the player's Active Pokémon, the opponent can't play Supporter cards (trainerError).
  'bw7-122': { ...ABILITY, sentinel: true },
};
