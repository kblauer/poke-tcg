// EX Hidden Legends (ex5) Trainer cards, by card id. Steven's Advice is a Supporter; Ancient Tomb, Desert Ruins, Island Cave
// and Magnetic Storm are Stadiums; the Ancient Technical Machines' attacks are in ex5.ts.
// Agreed with the user: "a Pokémon that has an owner in its name" is Team Aqua's, Team Magma's, a Gym Heroes owner's or
// Rocket's (hasOwner; Dark and Light Pokémon have none).
// From the text: an Ancient Technical Machine goes on an Evolved Pokémon (not a Pokémon-ex or an owner's) until the end of
// the turn, as a Technical Machine, not a Pokémon Tool; Ancient Tomb leaves Weakness on Pokémon-ex and owners' Pokémon
// (attacks.ts); Desert Ruins puts a damage counter between turns on each Pokémon-ex with 100 HP or more (betweenTurns);
// Island Cave cures a Water, Fighting or Metal Pokémon an Energy card is attached to from the hand (energyFromHand); Magnetic
// Storm turns Resistance off for Psychic and Fighting Pokémon's attacks (attacks.ts); Steven's Advice can't be played with
// more than 7 cards in the hand, this one included.
import { hasOwner, lookupCard, type Attack } from '../cards.js';
import { type Target } from '../engine.js';
import { clearSpecialConditions, pokemonName } from '../status.js';
import { def, own, targetsOf, type TrainerEffect, type TrainerSituation } from '../trainers.js';

/** The player's Pokémon an Ancient Technical Machine can go on: Evolved Pokémon, not Pokémon-ex or an owner's. */
const ancientTargets = (s: TrainerSituation): Target[] =>
  targetsOf(s.me).filter((t) => {
    const p = own(s, t)!;
    const d = def(s, p.card);
    return p.evolvedFrom.length > 0 && d.kind === 'pokemon' && !d.ex && !hasOwner(d.name);
  });

/** An Ancient Technical Machine: on one of the player's Evolved Pokémon until the end of the turn; it can use `attack`. */
const ancientMachine = (attack: Attack): TrainerEffect => ({
  technicalMachine: attack,
  blocked: (s) => (ancientTargets(s).length ? null : 'None of your Evolved Pokémon can take it (not Pokémon-ex or Pokémon with an owner in their names)'),
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: ancientTargets(s), prompt: 'Choose one of your Evolved Pokémon' }],
  play(ctx) {
    const t = ctx.choices.target!;
    const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
    ctx.attachTo(p, ctx.turn);
    ctx.log(`Attached ${lookupCard(ctx.state.cards, ctx.card.defId).name} to ${pokemonName(ctx.state, p)}.`);
  },
});

/** The player's Pokémon Life Herb can heal: not Pokémon-ex. */
const herbTargets = (s: TrainerSituation): Target[] => targetsOf(s.me).filter((t) => !(def(s, own(s, t)!.card) as { ex?: boolean }).ex);

export const EX5_TRAINERS: Record<string, TrainerEffect> = {
  // Ancient Technical Machine [Ice] – Ice Generator; [Rock] – Stone Generator; [Steel] – Steel Generator (their effects in ex5.ts).
  'ex5-84': ancientMachine({
    name: 'Ice Generator',
    cost: ['colorless'],
    damage: 0,
    damageText: null,
    text: "Discard all of your opponent's Trainer cards in play. If you do, prevent all effects, including damage, done to the Pokémon using this attack during your opponent's next turn.",
  }),
  'ex5-85': ancientMachine({
    name: 'Stone Generator',
    cost: ['colorless'],
    damage: 0,
    damageText: null,
    text: 'If your opponent has any Evolved Pokémon in play, remove the highest Stage Evolution card from each of them and put those cards back into his or her hand.',
  }),
  'ex5-86': ancientMachine({
    name: 'Steel Generator',
    cost: ['colorless', 'colorless'],
    damage: 0,
    damageText: null,
    text: "If the Defending Pokémon has a Poké-Power or Poké-Body, choose up to 2 basic Energy cards attached to 1 of your opponent's Pokémon and attach them to the Defending Pokémon.",
  }),

  // Ancient Tomb, Desert Ruins, Island Cave, Magnetic Storm: their rules are where they apply.
  'ex5-87': { stadium: true },
  'ex5-88': { stadium: true },
  'ex5-89': { stadium: true },
  'ex5-91': { stadium: true },

  // Life Herb: heads, one of the player's Pokémon (not a Pokémon-ex) has its Special Conditions and 6 damage counters removed.
  'ex5-90': {
    blocked: (s) => (herbTargets(s).length ? null : 'All your Pokémon are Pokémon-ex'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: herbTargets(s), prompt: 'Choose one of your Pokémon (not a Pokémon-ex), healed on heads' }],
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Life Herb did nothing.');
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      clearSpecialConditions(p);
      const healed = Math.min(60, p.damage);
      p.damage -= healed;
      ctx.log(`${pokemonName(ctx.state, p)} is no longer affected by Special Conditions and has ${healed / 10} fewer damage counters.`);
    },
  },

  // Steven's Advice (Supporter): draw up to as many cards as the opponent has Pokémon in play.
  'ex5-92': {
    supporter: true,
    blocked: (s) => (s.me.hand.length > 7 ? "You can't play Steven's Advice with more than 7 cards in your hand" : s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const max = [ctx.opp.active, ...ctx.opp.bench].filter(Boolean).length;
      if (max) ctx.pend({ kind: 'drawCount', source: "Steven's Advice", max });
    },
  },
};
