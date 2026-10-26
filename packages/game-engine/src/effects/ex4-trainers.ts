// EX Team Magma vs Team Aqua (ex4) Trainer cards and special Energy, by card id. The Schemers, Archie, Maxie and the
// Conspirators are Supporters; Team Aqua Hideout and Team Magma Hideout are Stadiums; Strength Charm and the Belts are
// Pokémon Tools; the Team Technical Machines' attacks are in ex4.ts.
// Agreed with the user: the Schemers can't be played without a Pokémon in the hand; the Belts are their owner's choice between
// turns, with the usual limits for evolving (askBelts, engine.ts); Aqua Energy and Magma Energy provide 2 Energy, any mix
// of their 2 types (energyPool).
// From the text: Archie's and Maxie's Pokémon go onto the Bench as Basic Pokémon, a Stage 2 one with 2 damage counters; Team
// Magma Hideout's damage counter is on a Basic Pokémon played from the hand (not a Trainer played as one) (engine.ts);
// Warp Point's opponent picks their own Benched Pokémon.
import { isPokemonCard, lookupCard, type Attack } from '../cards.js';
import { activeLocked, type CardInstance, type Target } from '../engine.js';
import { trainerProof } from '../powers.js';
import { openBenchSlot, pokemonName } from '../status.js';
import { def, otherHandCards, own, swapActive, targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';

/** Schemer: discard a Pokémon from the hand, then draw 3 (4 if it has `team` in its name). */
const schemer = (team: string): TrainerEffect => ({
  supporter: true,
  blocked: (s) => (otherHandCards(s).some((c) => isPokemonCard(def(s, c))) ? null : 'No Pokémon in your hand to discard'),
  choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => isPokemonCard(def(s, c))), prompt: 'Choose a Pokémon from your hand to discard' }],
  play(ctx) {
    const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
    if (!card) return;
    ctx.me.discard.push(card);
    const name = lookupCard(ctx.state.cards, card.defId).name;
    ctx.log(`Discarded ${name}.`);
    ctx.draw(ctx.me, name.includes(team) ? 4 : 3);
  },
});

/** Team Ball: heads, a Pokémon with `team` in its name; tails, a Basic one; from the deck, shown. */
const teamBall = (team: string): TrainerEffect => ({
  blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
  play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: `${team} Ball`, filter: ctx.flip() ? 'ownerPokemon' : 'ownerBasic', name: team, reveal: true }),
});

/** The player's Pokémon with `team` in their names and no Pokémon Tool (Belts). */
const teamToolTargets = (s: TrainerSituation, team: string): Target[] => targetsOf(s.me).filter((t) => def(s, own(s, t)!.card).name.includes(team) && !own(s, t)!.attached?.some((a) => a.tool));

/** Team Aqua Belt, Team Magma Belt: a Pokémon Tool only for a Pokémon with `team` in its name. */
const belt = (team: string): TrainerEffect => ({
  tool: true,
  blocked: (s) => (teamToolTargets(s, team).length ? null : `None of your Pokémon with ${team} in its name can take a Pokémon Tool`),
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: teamToolTargets(s, team), prompt: `Choose a Pokémon to attach ${team} Belt to` }],
  play(ctx) {
    const t = ctx.choices.target!;
    const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
    ctx.attachTo(p, Number.MAX_SAFE_INTEGER, { tool: true });
    ctx.log(`Attached ${team} Belt to ${pokemonName(ctx.state, p)}.`);
  },
});

/** Conspirator: up to 2 Basic Pokémon with `team` in their names and basic Energy cards from the deck, shown. */
const conspirator = (team: string): TrainerEffect => ({
  supporter: true,
  blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
  play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: `${team} Conspirator`, filter: 'ownerBasicOrEnergy', name: team, reveal: true, optional: true, count: 2 }),
});

/** A Team Technical Machine: attached to a Pokémon with `team` in its name for the turn; it can use `attack`. */
const teamMachine = (team: string, attack: Attack): TrainerEffect => ({
  technicalMachine: attack,
  blocked: (s) => (targetsOf(s.me).some((t) => def(s, own(s, t)!.card).name.includes(team)) ? null : `None of your Pokémon has ${team} in its name`),
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => def(s, own(s, t)!.card).name.includes(team)), prompt: `Choose a Pokémon with ${team} in its name` }],
  play(ctx) {
    const t = ctx.choices.target!;
    const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
    ctx.attachTo(p, ctx.turn);
    ctx.log(`Attached ${lookupCard(ctx.state.cards, ctx.card.defId).name} to ${pokemonName(ctx.state, p)}.`);
  },
});

/** Maxie: the Pokémon cards with Team Magma in their names in the hand and in the discard pile. */
const magmaIn = (s: TrainerSituation, pile: CardInstance[]) => pile.filter((c) => c.uid !== s.card.uid && isPokemonCard(def(s, c)) && def(s, c).name.includes('Team Magma'));

export const EX4_TRAINERS: Record<string, TrainerEffect> = {
  // Team Aqua Schemer, Team Magma Schemer (Supporters).
  'ex4-69': schemer('Team Aqua'),
  'ex4-70': schemer('Team Magma'),

  // Archie (Supporter): a Pokémon with Team Aqua in its name from the deck onto the Bench, as a Basic Pokémon.
  'ex4-71': {
    supporter: true,
    blocked: (s) => (!s.deckCount ? 'Your deck is empty' : openBenchSlot(s.me, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Archie', filter: 'ownerPokemon', name: 'Team Aqua', toBench: true, stage2Counters: 2 }),
  },

  // Dual Ball: a Basic Pokémon card from the deck for each heads of 2, shown.
  'ex4-72': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (heads) ctx.pend({ kind: 'pickFromDeck', source: 'Dual Ball', filter: 'basic', reveal: true, optional: true, count: heads });
      else ctx.log('Dual Ball found nothing.');
    },
  },

  // Maxie (Supporter): a Pokémon with Team Magma in its name from the hand or the discard pile onto the Bench, as a Basic Pokémon.
  'ex4-73': {
    supporter: true,
    blocked(s) {
      if (openBenchSlot(s.me, s.cards, s.stadium) < 0) return 'Your Bench is full';
      return magmaIn(s, s.me.hand).length || magmaIn(s, s.me.discard).length ? null : 'No Pokémon with Team Magma in its name in your hand or discard pile';
    },
    choices(s, c) {
      const sources = [...(magmaIn(s, s.me.hand).length ? [0] : []), ...(magmaIn(s, s.me.discard).length ? [1] : [])];
      return [
        { kind: 'pick', field: 'pick', options: sources, labels: ['From your hand', 'From your discard pile'], prompt: 'Take the Pokémon from your hand or your discard pile?' },
        ...(c.pick === 0 ? [{ kind: 'cards' as const, field: 'handUids' as const, min: 1, max: 1, options: magmaIn(s, s.me.hand), prompt: 'Choose a Pokémon with Team Magma in its name' }] : []),
        ...(c.pick === 1 ? [{ kind: 'cards' as const, field: 'discardUids' as const, min: 1, max: 1, options: magmaIn(s, s.me.discard), prompt: 'Choose a Pokémon with Team Magma in its name' }] : []),
      ];
    },
    play(ctx) {
      const fromHand = ctx.choices.pick === 0;
      const uid = (fromHand ? ctx.choices.handUids : ctx.choices.discardUids)?.[0];
      const pile = fromHand ? ctx.me.hand : ctx.me.discard;
      const card = pile.find((c) => c.uid === uid);
      const slot = openBenchSlot(ctx.me, ctx.state.cards, ctx.state.stadium?.card);
      if (!card || slot < 0) return;
      if (fromHand) ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      else ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      const d = lookupCard(ctx.state.cards, card.defId);
      ctx.me.bench[slot] = { card, evolvedFrom: [], damage: d.kind === 'pokemon' && d.stage === 'stage2' ? 20 : 0, energy: [], playedTurn: ctx.turn };
      ctx.log(`Put ${d.name} onto the Bench${d.kind === 'pokemon' && d.stage === 'stage2' ? ', with 2 damage counters' : ''}.`);
    },
  },

  // Strength Charm: as Expedition's (attacks.ts).
  'ex4-74': ECARD1_TRAINERS['ecard1-150']!,

  // Team Aqua Ball, Team Magma Ball.
  'ex4-75': teamBall('Team Aqua'),
  'ex4-80': teamBall('Team Magma'),

  // Team Aqua Belt, Team Magma Belt: Pokémon Tools; between turns, the evolution from the deck (askBelts).
  'ex4-76': belt('Team Aqua'),
  'ex4-81': belt('Team Magma'),

  // Team Aqua Conspirator, Team Magma Conspirator (Supporters).
  'ex4-77': conspirator('Team Aqua'),
  'ex4-82': conspirator('Team Magma'),

  // Team Aqua Hideout: a Pokémon without Team Aqua in its name retreats for 1 more.
  'ex4-78': { stadium: true, retreatModifier: (pokemon) => (pokemon.name.includes('Team Aqua') ? 0 : 1) },

  // Team Aqua Technical Machine 01 – Miracle; Team Magma Technical Machine 01 – Crushing Magma (their effects in ex4.ts).
  'ex4-79': teamMachine('Team Aqua', { name: 'Miracle', cost: ['colorless'], damage: 10, damageText: '10', text: 'Choose 1 Special Condition. The Defending Pokémon is now affected by that Special Condition.' }),
  'ex4-84': teamMachine('Team Magma', { name: 'Crushing Magma', cost: ['colorless'], damage: 10, damageText: '10', text: "Choose an Energy card attached to the Defending Pokémon and put that card at the bottom of your opponent's deck." }),

  // Team Magma Hideout: a damage counter on each Basic Pokémon without Team Magma in its name played from the hand (engine.ts).
  'ex4-83': { stadium: true },

  // Warp Point: the opponent switches their Active Pokémon (their pick), and the player switches theirs.
  'ex4-85': {
    choices: (s) => (s.me.bench.some(Boolean) ? [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => t !== 'active'), prompt: 'Choose one of your Benched Pokémon to switch in' }] : []),
    play(ctx) {
      const mine = ctx.choices.target;
      if (typeof mine === 'number' && !activeLocked(ctx.state, ctx.me.id)) swapActive(ctx.state, ctx.me, mine);
      const slots = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      const blocked = trainerProof(ctx.opp, [ctx.me, ctx.opp], ctx.state.cards) ?? activeLocked(ctx.state, ctx.opp.id);
      if (!slots.length || blocked) return blocked ? ctx.log(blocked) : undefined;
      if (slots.length === 1) return swapActive(ctx.state, ctx.opp, slots[0]!);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Warp Point', kind: 'switchIn' };
    },
  },
};

export const EX4_ENERGY: Record<string, EnergyEffect> = {
  // Aqua Energy, Magma Energy: only on a Pokémon with its team in its name; 2 Energy of its types (energyPool); discarded at the end of the turn (betweenTurns).
  'ex4-86': { onAttach: () => {}, attachError: (pokemon) => (pokemon.name.includes('Team Aqua') ? null : 'Aqua Energy can only be attached to a Pokémon with Team Aqua in its name') },
  'ex4-87': { onAttach: () => {}, attachError: (pokemon) => (pokemon.name.includes('Team Magma') ? null : 'Magma Energy can only be attached to a Pokémon with Team Magma in its name') },
  // Double Rainbow Energy: only on an Evolved Pokémon (not a Pokémon-ex); every type, 2 at a time; 10 less damage from its Pokémon (attacks.ts).
  'ex4-88': {
    onAttach: () => {},
    attachError: (pokemon, inPlay) => (inPlay.evolvedFrom.length && !pokemon.ex ? null : 'Double Rainbow Energy can only be attached to an Evolved Pokémon (not a Pokémon-ex)'),
  },
};
