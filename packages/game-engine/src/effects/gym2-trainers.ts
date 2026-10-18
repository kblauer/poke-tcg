// Gym Challenge (gym2) Trainer cards, by card id. Blaine (100), Giovanni (104), Koga (106) and Sabrina (110) are the
// non-holo prints of 17–20. The Stadiums' rules live where they apply: Chaos Gym (playTrainer), Resistance Gym and
// Cinnabar City Gym (attacks.ts), Rocket's Minefield Gym (PLAY_BENCH), Viridian City Gym (evolvedHook).
// Rulings (agreed): Rocket's Minefield Gym puts 2 damage counters on tails (the printed card leaves out the number).
// Chaos Gym: on tails the opponent may play the card from their hand (GameState.borrowed) as if it were theirs, then it
// goes to its owner's discard pile. Blaine's Quiz #3 offers 4 names: the card's and 3 other Pokémon from the player's
// cards (or the game's); the CPU guesses at random, as for Quiz #2. Lt. Surge's Secret Plan's card is turned over
// (revealFaceDown) when it's attacked, evolved, retreated, or clicked by its owner; it has no attacks while face down.
// Misty's Wish: the CPU declines. Sabrina's Psychic Control's card stays in the hand until it's played or the turn ends.
import { isBasicEnergy, isBasicPokemon, isPokemonCard, lookupCard, type PokemonCardDef } from '../cards.js';
import type { CardInstance, InPlayPokemon, PlayerState } from '../engine.js';
import { shuffle } from '../rng.js';
import { addLog, openBenchSlot, pokemonName } from '../status.js';
import { controllable, otherHandCards, saffronTargets, targetsOf, type TrainerContext, type TrainerEffect, type TrainerSituation } from '../trainers.js';

const names = (ctx: TrainerContext, cards: CardInstance[]) => cards.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ');
const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: 'active' | number) => (t === 'active' ? side.active : side.bench[t])!;

/** The player's Pokémon in play with `owner` in their names (and, if given, matching `also`). */
const owners = (s: TrainerSituation, owner: string, also: (p: InPlayPokemon) => boolean = () => true) =>
  targetsOf(s.me).filter((t) => lookupCard(s.cards, at(s.me, t).card.defId).name.includes(owner) && also(at(s.me, t)));

/** Pokémon of both players with damage counters. */
const damaged = (sides: Pick<PlayerState, 'active' | 'bench'>[]) => sides.flatMap((side) => [side.active, ...side.bench]).filter((p): p is InPlayPokemon => !!p && p.damage >= 10);

const BLAINE: TrainerEffect = {
  play(ctx) {
    ctx.me.blaineTurn = ctx.turn;
    ctx.log('This turn, 2 Fire Energy cards may be attached to 1 Pokémon with Blaine in its name instead of 1 Energy card.');
  },
};

const GIOVANNI: TrainerEffect = {
  blocked: (s) => (owners(s, 'Giovanni').length ? null : 'You have no Pokémon with Giovanni in its name'),
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: owners(s, 'Giovanni'), prompt: 'Choose a Pokémon with Giovanni in its name' }],
  play(ctx) {
    const p = at(ctx.me, ctx.choices.target!);
    p.giovanniTurn = ctx.turn;
    ctx.log(`${pokemonName(ctx.state, p)} may evolve this turn even if it was just played or evolved, or on the first turn.`);
  },
};

const KOGA: TrainerEffect = {
  play(ctx) {
    ctx.me.kogaTurn = ctx.turn;
    ctx.log('This turn, attacks by Pokémon with Koga in their names poison the Defending Pokémon they damage.');
  },
};

const SABRINA: TrainerEffect = {
  blocked: (s) => (owners(s, 'Sabrina', (p) => p.energy.length > 0).length && owners(s, 'Sabrina').length >= 2 ? null : 'You need 2 Pokémon with Sabrina in their names, one of them with Energy'),
  choices(s, c) {
    const from = { kind: 'pokemon', field: 'target', side: 'own', options: owners(s, 'Sabrina', (p) => p.energy.length > 0), prompt: 'Take all the Energy cards from' } as const;
    if (c.target === undefined) return [from];
    return [from, { kind: 'pokemon', field: 'target2', side: 'own', options: owners(s, 'Sabrina').filter((t) => t !== c.target), prompt: 'Attach them to' }];
  },
  play(ctx) {
    const [from, to] = [at(ctx.me, ctx.choices.target!), at(ctx.me, ctx.choices.target2!)];
    to.energy.push(...from.energy);
    ctx.log(`Moved ${from.energy.length} Energy card${from.energy.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    from.energy = [];
  },
};

/** The 3 card kinds Blaine's Quiz #2 asks about. */
const QUIZ_KINDS = ['Energy card', 'Trainer card', 'Pokémon card'];

export const GYM2_TRAINERS: Record<string, TrainerEffect> = {
  'gym2-17': BLAINE,
  'gym2-100': BLAINE,
  'gym2-18': GIOVANNI,
  'gym2-104': GIOVANNI,
  'gym2-19': KOGA,
  'gym2-106': KOGA,
  'gym2-20': SABRINA,
  'gym2-110': SABRINA,

  // Brock's Protection: attach to a Pokémon with Brock in its name; the opponent's attacks and Trainers can't remove its Energy cards.
  'gym2-101': {
    blocked: (s) => (owners(s, 'Brock').length ? null : 'You have no Pokémon with Brock in its name'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: owners(s, 'Brock'), prompt: "Choose a Pokémon with Brock in its name to attach Brock's Protection to" }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      ctx.attachTo(p, Number.MAX_SAFE_INTEGER);
      ctx.log(`Attached Brock's Protection to ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Chaos Gym: a flip to play any other Trainer card; on tails the opponent may play it instead (playTrainer).
  'gym2-102': { stadium: true },

  // Erika's Kindness: remove 2 damage counters (or 1) from every damaged Pokémon, both players'.
  'gym2-103': {
    blocked: (s) => (damaged([s.me, s.opp]).length ? null : 'No Pokémon in play have damage counters'),
    play(ctx) {
      for (const [player, p] of [ctx.me, ctx.opp].flatMap((side) => damaged([side]).map((p) => [side, p] as const))) {
        const healed = Math.min(20, p.damage);
        p.damage -= healed;
        ctx.log(`Removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`, player.id);
      }
    },
  },

  // Giovanni's Last Resort: remove all damage counters from 1 of your Pokémon with Giovanni in its name, then discard your hand.
  'gym2-105': {
    blocked: (s) => (owners(s, 'Giovanni', (p) => p.damage > 0).length ? null : 'None of your Pokémon with Giovanni in their names have damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: owners(s, 'Giovanni', (p) => p.damage > 0), prompt: 'Choose a Pokémon with Giovanni in its name to heal' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      p.damage = 0;
      ctx.log(`Removed all damage counters from ${pokemonName(ctx.state, p)}.`);
      const hand = ctx.me.hand.splice(0);
      ctx.me.discard.push(...hand);
      ctx.log(`Discarded the hand (${hand.length} card${hand.length === 1 ? '' : 's'}).`);
    },
  },

  // Lt. Surge's Secret Plan: put a card from the hand face down onto the Bench, treated as a Basic Pokémon (revealFaceDown).
  'gym2-107': {
    blocked: (s) => (!otherHandCards(s).length ? 'You have no other card in your hand' : openBenchSlot(s.me.bench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card from your hand to put face down onto your Bench' }],
    play(ctx) {
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.bench[openBenchSlot(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card)] = { card: card!, evolvedFrom: [], damage: 0, energy: [], playedTurn: ctx.turn, faceDown: true };
      ctx.log('Put a card face down onto the Bench.');
    },
  },

  // Misty's Wish: look at 1 of your Prize cards; the opponent lets you switch it with a hand card, or you draw a card.
  'gym2-108': {
    blocked: (s) => (s.me.hand.length > 1 || s.deckCount > 0 ? null : 'Nothing could come of it'),
    play: (ctx) => {
      if (!ctx.me.prizes.length) return ctx.log('No Prize cards left.');
      ctx.pend({ kind: 'mistysWish', source: "Misty's Wish", step: 'prize' });
    },
  },

  // Resistance Gym: every Pokémon's Resistance is 20 less (attacks.ts).
  'gym2-109': { stadium: true },

  // Blaine's Quiz #2: a card from the hand, face down; the opponent guesses Energy, Trainer or Pokémon. Right, they draw 2; wrong, you do.
  'gym2-111': {
    blocked: (s) => (otherHandCards(s).length ? null : 'You have no other card in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card from your hand to put face down' }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids![0])!;
      const d = lookupCard(ctx.state.cards, card.defId);
      const answer = d.kind === 'energy' ? 0 : isPokemonCard(d) ? 2 : 1;
      ctx.log('Put a card face down.');
      ctx.state.pendingChoice = { player: ctx.opp.id, source: "Blaine's Quiz #2: is the face-down card an Energy card, a Trainer card or a Pokémon card?", kind: 'guess', card, labels: QUIZ_KINDS, answer, draw: 2 };
    },
  },

  // Blaine's Quiz #3: a Pokémon card from the hand and one of its attacks' names; the opponent guesses its name among 4. Right, they draw 3; wrong, you do.
  'gym2-112': {
    blocked: (s) => (quizPokemon(s).length ? null : 'You have no Pokémon card with an attack in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: quizPokemon(s), prompt: 'Choose a Pokémon card from your hand to put face down' }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids![0])!;
      const d = lookupCard(ctx.state.cards, card.defId) as PokemonCardDef;
      // 3 other Pokémon names: from the player's own cards first, then any card in the game.
      const mine = [...ctx.me.deck, ...ctx.me.hand, ...ctx.me.discard, ...ctx.me.prizes, ...[ctx.me.active, ...ctx.me.bench].flatMap((p) => (p ? [p.card, ...p.evolvedFrom] : []))];
      const pokemonNames = (ids: string[]) => [...new Set(ids.map((id) => lookupCard(ctx.state.cards, id)).filter(isPokemonCard).map((p) => p.name))].filter((n) => n !== d.name);
      let others: string[];
      [others, ctx.state.rngState] = shuffle(pokemonNames(mine.map((c) => c.defId)), ctx.state.rngState);
      if (others.length < 3) {
        let more: string[];
        [more, ctx.state.rngState] = shuffle(pokemonNames(Object.keys(ctx.state.cards)).filter((n) => !others.includes(n)), ctx.state.rngState);
        others = [...others, ...more];
      }
      const labels = [d.name, ...others.slice(0, 3)].sort((a, b) => a.localeCompare(b));
      ctx.log(`Put a Pokémon card face down: it has the attack ${d.attacks[0]!.name}.`);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: `Blaine's Quiz #3: which Pokémon has the attack ${d.attacks[0]!.name}?`, kind: 'guess', card, labels, answer: labels.indexOf(d.name), draw: 3 };
    },
  },

  // Cinnabar City Gym: no Weakness when a Water Pokémon's attack damages a Pokémon with Blaine in its name (attacks.ts).
  'gym2-113': { stadium: true },

  // Fuchsia City Gym: once during each player's turn, flip; heads lets them shuffle 1 of their Pokémon with Koga in its name into their deck.
  'gym2-114': {
    stadium: true,
    stadiumBlocked: (me, cards) => (targetsOf(me).some((t) => lookupCard(cards, at(me, t).card.defId).name.includes('Koga')) ? null : 'Fuchsia City Gym: you have no Pokémon with Koga in its name'),
    useStadium({ state, me, flip }) {
      if (!flip()) return addLog(state, 'Fuchsia City Gym did nothing.', me.id);
      state.pendingChoice = { player: me.id, source: 'Fuchsia City Gym', kind: 'fuchsia' };
    },
  },

  // Koga's Ninja Trick: attach to your Active Pokémon with Koga in its name; when the opponent attacks, you may switch it out first (engine.ts).
  'gym2-115': {
    blocked: (s) => (s.me.active && lookupCard(s.cards, s.me.active.card.defId).name.includes('Koga') ? null : 'Your Active Pokémon must have Koga in its name'),
    play(ctx) {
      ctx.attachTo(ctx.me.active!, Number.MAX_SAFE_INTEGER, { activeOnly: true });
      ctx.log(`Attached Koga's Ninja Trick to ${pokemonName(ctx.state, ctx.me.active!)}.`);
    },
  },

  // Master Ball: look at the top 7 cards of the deck; you may take a Basic Pokémon or Evolution card; shuffle the rest back.
  'gym2-116': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play(ctx) {
      const looked = ctx.me.deck.slice(0, 7).map((c) => c.uid);
      ctx.pend({ kind: 'pickFromTop', source: 'Master Ball', looked, take: 1, master: true });
    },
  },

  // Max Revive: discard 2 Energy cards from the hand to put a Basic Pokémon from your discard pile onto your Bench.
  'gym2-117': {
    blocked(s) {
      if (energyInHand(s).length < 2) return 'You need 2 Energy cards in your hand to discard';
      if (!basicsInDiscard(s).length) return 'No Basic Pokémon in your discard pile';
      return openBenchSlot(s.me.bench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null;
    },
    choices: (s) => [
      { kind: 'cards', field: 'handUids', min: 2, max: 2, options: energyInHand(s), prompt: 'Choose 2 Energy cards from your hand to discard' },
      { kind: 'cards', field: 'discardUids', min: 1, max: 1, options: basicsInDiscard(s), prompt: 'Choose a Basic Pokémon from your discard pile' },
    ],
    play(ctx) {
      const energy = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.discard.push(...energy);
      ctx.log(`Discarded ${names(ctx, energy)}.`);
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids![0])!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.bench[openBenchSlot(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card)] = { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: ctx.turn };
      ctx.log(`Put ${names(ctx, [card])} onto the Bench.`);
    },
  },

  // Misty's Tears: discard 1 other card from the hand to take up to 2 Water Energy cards from the deck.
  'gym2-118': {
    blocked: (s) => (otherHandCards(s).length ? null : 'You need another card in your hand to discard'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card from your hand to discard' }],
    play(ctx) {
      const discarded = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.discard.push(...discarded);
      ctx.log(`Discarded ${names(ctx, discarded)}.`);
      ctx.pend({ kind: 'pickFromDeck', source: "Misty's Tears", filter: 'energyType', type: 'water', reveal: true, optional: true, count: 2 });
    },
  },

  // Rocket's Minefield Gym: a Basic Pokémon put onto the Bench from the hand takes 2 damage counters on tails (engine.ts, PLAY_BENCH).
  'gym2-119': { stadium: true },

  // Rocket's Secret Experiment: flip; heads, take any card from the deck; tails, no Trainer cards until the end of your next turn.
  'gym2-120': {
    play(ctx) {
      if (ctx.flip()) return ctx.pend({ kind: 'pickFromDeck', source: "Rocket's Secret Experiment", filter: 'any' });
      ctx.me.noTrainersUntil = ctx.turn + 2;
      ctx.log("Can't play Trainer cards until the end of the next turn.");
    },
  },

  // Sabrina's Psychic Control: flip; heads, use a Trainer card from the opponent's discard pile that isn't put into play.
  'gym2-121': {
    play(ctx) {
      if (!ctx.flip()) return ctx.log("Sabrina's Psychic Control did nothing.");
      if (!ctx.opp.discard.some((c) => controllable(ctx.state.cards, c))) return ctx.log("No Trainer card in the opponent's discard pile can be used.");
      ctx.pend({ kind: 'psychicControl', source: "Sabrina's Psychic Control" });
    },
  },

  // Saffron City Gym: as often as you like, return a basic Energy card from 1 of your Pokémon with Sabrina in its name to your hand.
  'gym2-122': {
    stadium: true,
    stadiumAnyTimes: true,
    stadiumBlocked: (me, cards) => (saffronTargets(cards, me).length ? null : 'Saffron City Gym: none of your Pokémon with Sabrina in their names have a basic Energy card'),
    useStadium({ state, me }) {
      const targets = saffronTargets(state.cards, me);
      if (targets.length > 1) return void (state.pendingChoice = { player: me.id, source: 'Saffron City Gym', kind: 'saffron' });
      // One Pokémon: straight to its Energy (identical cards need no choice).
      const target = targets[0]!;
      const p = at(me, target);
      const basic = p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
      if (new Set(basic.map((e) => e.defId)).size > 1) return void (state.pendingChoice = { player: me.id, source: 'Saffron City Gym', kind: 'discardAttached', target, toHand: true });
      p.energy = p.energy.filter((e) => e !== basic[0]);
      me.hand.push(basic[0]!);
      addLog(state, `Returned ${lookupCard(state.cards, basic[0]!.defId).name} from ${pokemonName(state, p)} to the hand.`, me.id);
    },
  },

  // Viridian City Gym: a Pokémon with Giovanni in its name that evolves loses 2 damage counters (evolvedHook).
  'gym2-123': { stadium: true },

  // Fervor: show the top 3 cards of your deck; Fire Energy cards go into your hand, the rest are discarded.
  'gym2-124': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play(ctx) {
      const top = ctx.me.deck.splice(0, 3);
      const fire = top.filter((c) => {
        const d = lookupCard(ctx.state.cards, c.defId);
        return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === 'fire';
      });
      ctx.log(`The top cards were ${names(ctx, top)}.`);
      ctx.me.hand.push(...fire);
      ctx.me.discard.push(...top.filter((c) => !fire.includes(c)));
      ctx.log(`Put ${fire.length} Fire Energy card${fire.length === 1 ? '' : 's'} into the hand and discarded the rest.`);
    },
  },

  // Transparent Walls: until the end of the opponent's next turn, attack damage to your Benched Pokémon is prevented (attacks.ts).
  'gym2-125': {
    play(ctx) {
      ctx.me.benchDamageProtectedUntil = ctx.turn + 1;
      ctx.log("Attack damage to the Benched Pokémon is prevented until the end of the opponent's next turn.");
    },
  },

  // Warp Point: the opponent switches their Active Pokémon with a benched one of their choice, then you do too.
  'gym2-126': {
    blocked: (s) => (s.opp.bench.some(Boolean) || s.me.bench.some(Boolean) ? null : 'Neither player has a benched Pokémon'),
    play(ctx) {
      const turns = [ctx.opp, ctx.me].filter((p) => p.bench.some(Boolean)).map((p) => ({ player: p.id, source: 'Warp Point', kind: 'switchIn' as const }));
      const [first, ...rest] = turns;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
};

/** Pokémon cards in the hand with an attack (Blaine's Quiz #3). */
const quizPokemon = (s: TrainerSituation) =>
  otherHandCards(s).filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isPokemonCard(d) && d.attacks.length > 0;
  });

/** Energy cards in the hand (Max Revive), and Basic Pokémon cards in the discard pile. */
const energyInHand = (s: TrainerSituation) => otherHandCards(s).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');
const basicsInDiscard = (s: TrainerSituation) => s.me.discard.filter((c) => isBasicPokemon(lookupCard(s.cards, c.defId)));
