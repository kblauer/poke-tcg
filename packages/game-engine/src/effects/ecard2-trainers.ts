// Aquapolis (ecard2) Trainer cards and special Energy, by card id. The Cubes are Technical Machines (as Expedition's Multi
// Technical Machine 01): attached until the end of the turn to a Pokémon of their type, which can use their attack (in
// ecard2.ts). Healing Berry, Memory Berry and Time Shard are Pokémon Tools whose rules live where they apply (useBerry in
// engine.ts; Memory Berry in usableAttacks and performAttack; Time Shard in attacks.ts and resolveKnockouts). Pokémon Park's
// rule is in energyFromHand (powers.ts); Apricorn Forest, Undersea Ruins and Power Plant are used like Lucky Stadium.
// Darkness and Metal Energy play by the EX rules (attacks.ts, agreed); Rainbow Energy is Team Rocket's; Boost Energy
// provides 3 Colorless (apps/api/src/cards.ts), goes only on an Evolved Pokémon, can't retreat (retreatError), and is
// discarded at the end of the turn or when its Pokémon devolves (engine.ts); Crystal Energy provides 1 Energy of each type of
// basic Energy card attached to its Pokémon (energyPool); Warp Energy switches the Active Pokémon it's attached to.
// Rulings (from the text): Juggler discards 1 or 2 basic Energy cards (none would draw nothing). Town Volunteers takes 5
// cards, or all there are if fewer. Super Energy Removal 2's discards are the opponent's to suffer (Brock's Protection,
// [Keep] and Legendary Body stop them) on 2 heads, the player's own Active Pokémon's on 2 tails. Time Shard returns 1 or 2
// basic Energy cards by itself; with more than 2 attached, its owner picks up to 2 (agreed with the user).
import { isBasicEnergy, isPokemonCard, lookupCard, type Attack, type EnergyType } from '../cards.js';
import { discardTheirEnergy, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { energyKept, pokemonAt, powerActive, trainerProof, pokemonPower } from '../powers.js';
import { shuffle } from '../rng.js';
import { benchRoom, effectId, energyProtected, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { powerEffect } from './index.js';
import { swapActive, targetsOf, type EnergyEffect, type TrainerChoiceSpec, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { tool } from './neo1-trainers.js';
import { ROCKET_ENERGY } from './rocket-trainers.js';

const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: Target) => pokemonAt(side, t)!;
const isBasicCard = (s: { cards: TrainerSituation['cards'] }, c: { defId: string; provides?: unknown }) => !c.provides && isBasicEnergy(lookupCard(s.cards, c.defId));

/** Pokémon of `type` a Cube can be attached to, or with Skyridge's Synchronicity working (any Technical Machine). */
const cubeTargets = (s: TrainerSituation, type: EnergyType) =>
  targetsOf(s.me).filter((t) => {
    const p = at(s.me, t);
    return inPlayDef(s.cards, p).type === type || (!!pokemonPower(p)?.synchronicity && powerActive(p, s.cards, [s.me, s.opp]));
  });

/** A Cube: a Technical Machine for a Pokémon of `type`, with its attack (its effect is in ecard2.ts, by this card's id). */
const cube = (type: EnergyType, attack: Attack): TrainerEffect => ({
  technicalMachine: attack,
  blocked: (s) => (cubeTargets(s, type).length ? null : `You have no ${type[0]!.toUpperCase()}${type.slice(1)} Pokémon in play`),
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: cubeTargets(s, type), prompt: `Choose one of your ${type[0]!.toUpperCase()}${type.slice(1)} Pokémon to attach it to` }],
  play(ctx) {
    const p = at(ctx.me, ctx.choices.target!);
    ctx.attachTo(p, ctx.turn);
    ctx.log(`Attached ${lookupCard(ctx.state.cards, ctx.card.defId).name} to ${pokemonName(ctx.state, p)}.`);
  },
});

const attack = (name: string, cost: EnergyType[], damage: number, damageText: string | null, text: string): Attack => ({ name, cost, damage, damageText, text });

/** The player's Evolved Pokémon (Undersea Ruins). */
const evolved = (me: Pick<PlayerState, 'active' | 'bench'>) => targetsOf(me).filter((t) => at(me, t).evolvedFrom.length > 0);

/** Energy cards the opponent's effects may discard from this Pokémon (not Brock's Protection, Unown K's Keep). */
const canLose = (s: TrainerSituation, owner: Pick<PlayerState, 'active' | 'bench' | 'powersOffUntil'>, p: InPlayPokemon) =>
  !energyProtected(s.cards, p) && !energyKept(owner, [s.me, s.opp], s.cards, p);

export const ECARD2_TRAINERS: Record<string, TrainerEffect> = {
  // Apricorn Forest (Stadium): once during each player's turn, with room on the Bench, flip; heads shows a basic Energy card from the hand for a Basic Pokémon of its type from the deck onto the Bench.
  'ecard2-118': {
    stadium: true,
    stadiumBlocked: (me, cards) => (openBenchSlot(me.bench, cards) < 0 ? 'Apricorn Forest: your Bench is full' : null),
    useStadium({ state, me, flip }) {
      if (!flip()) return;
      if (!me.hand.some((c) => isBasicEnergy(lookupCard(state.cards, c.defId)))) return;
      state.pendingChoice = { player: me.id, source: 'Apricorn Forest', kind: 'revealEnergy' };
    },
  },

  // The Cubes (Technical Machines).
  'ecard2-119': cube('darkness', attack('Plunder', ['darkness'], 10, '10', 'Before doing damage, discard any Trainer cards attached to the Defending Pokémon.')),
  'ecard2-121': cube('fighting', attack('Violent Rage', ['fighting'], 10, '10×', 'Flip a number of coins equal to the number of damage counters on this Pokémon. This attack does 10 damage times the number of heads.')),
  'ecard2-122': cube('fire', attack('Singe', ['fire'], 0, null, 'The Defending Pokémon is now Burned.')),
  'ecard2-124': cube('grass', attack('Sleep Poison', ['grass'], 0, null, 'The Defending Pokémon is now Asleep and Poisoned.')),
  'ecard2-127': cube('lightning', attack('Discharge', ['lightning'], 40, '40×', 'Discard all Lightning Energy cards attached to this Pokémon. Then, flip a number of coins equal to the number of Energy cards discarded that way. This attack does 40 damage times the number of heads.')),
  'ecard2-129': cube('metal', attack('Metal Reversal', ['metal'], 10, '10', "Before doing damage, you may choose 1 of your opponent's Benched Pokémon and switch it with the Defending Pokémon.")),
  'ecard2-132': cube('psychic', attack('Psy Confuse', ['psychic'], 0, null, 'The Defending Pokémon is now Confused.')),
  'ecard2-140': cube('water', attack('Splatter', ['water'], 0, null, "Choose 1 of your opponent's Pokémon. This attack does 20 damage to that Pokémon. Don't apply Weakness or Resistance.")),

  // Energy Switch: a basic Energy card from one of the player's Pokémon to another.
  'ecard2-120': {
    blocked: (s) => (targetsOf(s.me).length < 2 ? 'You need 2 Pokémon in play' : targetsOf(s.me).some((t) => at(s.me, t).energy.some((e) => isBasicCard(s, e))) ? null : 'None of your Pokémon has a basic Energy card attached'),
    choices(s, c) {
      const specs: TrainerChoiceSpec[] = [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => at(s.me, t).energy.some((e) => isBasicCard(s, e))), prompt: 'Choose one of your Pokémon to move a basic Energy card from' }];
      if (c.target === undefined) return specs;
      specs.push({ kind: 'cards', field: 'energyUids', min: 1, max: 1, options: at(s.me, c.target).energy.filter((e) => isBasicCard(s, e)), prompt: 'Choose the basic Energy card to move' });
      specs.push({ kind: 'pokemon', field: 'target2', side: 'own', options: targetsOf(s.me).filter((t) => t !== c.target), prompt: 'Choose the Pokémon to move it to' });
      return specs;
    },
    play(ctx) {
      const from = at(ctx.me, ctx.choices.target!);
      const to = at(ctx.me, ctx.choices.target2!);
      const card = from.energy.find((e) => e.uid === ctx.choices.energyUids![0])!;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Forest Guardian (Supporter): shuffle the deck, then 1 of the top 7 cards into the hand; the rest are shuffled back.
  'ecard2-123': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      ctx.pend({ kind: 'pickFromTop', source: 'Forest Guardian', looked: ctx.me.deck.slice(0, 7).map((c) => c.uid), take: 1, shuffleRest: true });
    },
  },

  // Healing Berry, Memory Berry and Time Shard: Pokémon Tools.
  'ecard2-125': tool('Healing Berry'),
  'ecard2-128': tool('Memory Berry'),
  'ecard2-135': tool('Time Shard'),

  // Juggler (Supporter): discard 1 or 2 basic Energy cards from the hand; draw 3 for 1, 5 for 2.
  'ecard2-126': {
    supporter: true,
    blocked: (s) => (s.me.hand.some((c) => c.uid !== s.card.uid && isBasicCard(s, c)) ? null : 'No basic Energy cards in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 2, options: s.me.hand.filter((c) => c.uid !== s.card.uid && isBasicCard(s, c)), prompt: 'Discard 1 basic Energy card (draw 3) or 2 (draw 5)' }],
    play(ctx) {
      const gone = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.discard.push(...gone);
      ctx.log(`Discarded ${gone.length} basic Energy card${gone.length === 1 ? '' : 's'}.`);
      ctx.draw(ctx.me, gone.length === 2 ? 5 : 3);
    },
  },

  // Pokémon Fan Club (Supporter): up to 2 Baby and/or Basic Pokémon from the deck onto the Bench.
  'ecard2-130': {
    supporter: true,
    blocked: (s) => (openBenchSlot(s.me.bench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const room = benchRoom(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card);
      ctx.pend({ kind: 'pickFromDeck', source: 'Pokémon Fan Club', filter: 'basic', toBench: true, optional: true, count: Math.min(2, room) });
    },
  },

  // Pokémon Park (Stadium): its rule is in energyFromHand (powers.ts).
  'ecard2-131': { stadium: true },

  // Seer (Supporter): the basic Energy cards among the top 6 cards of the deck go into the hand (shown); the deck is shuffled.
  'ecard2-133': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const top = ctx.me.deck.slice(0, 6);
      const energy = top.filter((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)));
      ctx.me.deck = ctx.me.deck.filter((c) => !energy.includes(c));
      ctx.me.hand.push(...energy);
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      ctx.log(energy.length ? `Took ${energy.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the top of the deck.` : 'No basic Energy cards among the top 6 cards of the deck.');
    },
  },

  // Super Energy Removal 2: 2 heads discards every Energy card on the Defending Pokémon; 2 tails, every one on your Active Pokémon.
  'ecard2-134': {
    blocked: (s) => (s.me.active && s.opp.active ? null : 'There must be an Active Pokémon on each side'),
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (heads === 1) return ctx.log('Super Energy Removal 2 did nothing.');
      if (heads === 2) {
        const defender = ctx.opp.active!;
        const s = { card: ctx.card, me: ctx.me, opp: ctx.opp, cards: ctx.state.cards } as unknown as TrainerSituation;
        const proof = trainerProof(ctx.opp, [ctx.me, ctx.opp], ctx.state.cards);
        if (proof) return ctx.log(`${proof}.`);
        if (!canLose(s, ctx.opp, defender)) return ctx.log(`${pokemonName(ctx.state, defender)}'s Energy cards can't be discarded.`, ctx.opp.id);
        const gone = defender.energy.filter((e) => !e.provides);
        defender.energy = defender.energy.filter((e) => e.provides);
        discardTheirEnergy(ctx.state, ctx.opp, gone);
        return ctx.log(`Discarded ${gone.length} Energy card${gone.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, defender)}.`, ctx.opp.id);
      }
      const own = ctx.me.active!;
      const gone = own.energy.filter((e) => !e.provides);
      own.energy = own.energy.filter((e) => e.provides);
      ctx.me.discard.push(...gone.map(({ converted: _c, windless: _w, ...c }) => c));
      ctx.log(`Discarded ${gone.length} Energy card${gone.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, own)}.`);
    },
  },

  // Town Volunteers (Supporter): 5 Baby, Basic or Evolution cards and/or basic Energy cards from the discard pile (shown) shuffled into the deck.
  'ecard2-136': {
    supporter: true,
    blocked: (s) => (s.me.discard.some((c) => isPokemonCard(lookupCard(s.cards, c.defId)) || isBasicCard(s, c)) ? null : 'No Pokémon or basic Energy cards in your discard pile'),
    choices(s) {
      const options = s.me.discard.filter((c) => isPokemonCard(lookupCard(s.cards, c.defId)) || isBasicCard(s, c));
      const n = Math.min(5, options.length);
      return [{ kind: 'cards', field: 'discardUids', min: n, max: n, options, prompt: `Choose ${n} card${n === 1 ? '' : 's'} to shuffle into your deck` }];
    },
    play(ctx) {
      const taken = ctx.me.discard.filter((c) => ctx.choices.discardUids!.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
      ctx.shuffleIntoDeck(ctx.me, taken);
      ctx.log(`Shuffled ${taken.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} into the deck.`);
    },
  },

  // Traveling Salesman (Supporter): up to 2 Technical Machine and/or Pokémon Tool cards from the deck (shown) into the hand.
  'ecard2-137': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Traveling Salesman', filter: 'toolOrMachine', reveal: true, optional: true, count: 2 }),
  },

  // Undersea Ruins (Stadium): once during each player's turn, flip; heads devolves one of their Evolved Pokémon.
  'ecard2-138': {
    stadium: true,
    stadiumBlocked: (me) => (evolved(me).length ? null : 'Undersea Ruins: you have no Evolved Pokémon'),
    useStadium({ state, me, flip }) {
      if (!flip()) return;
      state.pendingChoice = { player: me.id, source: 'Undersea Ruins', kind: 'devolveOwn' };
    },
  },

  // Power Plant (Stadium): once during each player's turn, discard a basic Energy card from the hand to take one from the discard pile.
  'ecard2-139': {
    stadium: true,
    stadiumBlocked: (me, cards) => (me.hand.some((c) => isBasicEnergy(lookupCard(cards, c.defId))) ? null : 'Power Plant: no basic Energy cards in your hand'),
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Power Plant', kind: 'powerPlant' };
    },
  },

  // Weakness Guard: attached to one of the player's Pokémon until the end of the opponent's next turn; it has no Weakness.
  'ecard2-141': {
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me), prompt: 'Choose one of your Pokémon to attach Weakness Guard to' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      ctx.attachTo(p, ctx.turn + 1);
      ctx.log(`Attached Weakness Guard to ${pokemonName(ctx.state, p)}.`);
    },
  },
};

/** Aquapolis's special Energy (see the header): Darkness and Metal Energy's rules live in the engine; Boost and Warp Energy's here. */
export const ECARD2_ENERGY: Record<string, EnergyEffect> = {
  'ecard2-142': { onAttach: () => {} },
  'ecard2-143': { onAttach: () => {} },
  'ecard2-144': ROCKET_ENERGY['base5-17']!,
  'ecard2-145': {
    onAttach: () => {},
    attachError: (_p, inPlay) => (inPlay.evolvedFrom.length ? null : 'Boost Energy can only be attached to an Evolved Pokémon'),
  },
  'ecard2-146': { onAttach: () => {} },
  // Warp Energy: attached from the hand to the Active Pokémon, it switches with one of the player's Benched Pokémon.
  'ecard2-147': {
    onAttach(state, owner, pokemon) {
      if (owner.active !== pokemon) return;
      const benched = owner.bench.flatMap((p, i) => (p ? [i] : []));
      if (benched.length === 1) return swapActive(state, owner, benched[0]!);
      if (benched.length) state.pendingChoice = { player: owner.id, source: 'Warp Energy', kind: 'switchIn' };
    },
  },
};

