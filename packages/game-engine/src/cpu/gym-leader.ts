import { hasType, isBasicPokemon, isBenchable, isPokemonCard, isTrainerCard, lookupCard, type PokemonCardDef } from '../cards.js';
import { baseUid, openBenchSlot } from '../status.js';
import {
  attackOptions,
  attackScore,
  attackWith,
  attachTarget,
  benchAttackers,
  benchBasic,
  benched,
  bestAttack,
  chooseActive,
  combinations,
  energyInHand,
  energyValue,
  evolve,
  hpLeft,
  inPlay,
  keepsBestAttack,
  knocksOut,
  missingEnergy,
  nameKey,
  play,
  pokemonDef,
  professorOak,
  resolveSearch,
  borrowedTrainerMove,
  spareEnergy,
  strongestOf,
  switchOrRetreat,
  threatKnocksOut,
  trainer,
  tryAction,
  turnOf,
  unusableEnergy,
  unusablePokemon,
  vitalEnergy,
  wantedCards,
  swapIn,
  damages,
  withAttackMemo,
  type Turn,
} from './shared.js';
import { energyPool, hasBenched, isEnergyCardOf, retreatCost, type CardInstance, type GameAction, type GameState, type InPlayPokemon, type PlayerId, type Target } from '../engine.js';
import { powerError, powerOf, type PowerChoices } from '../powers.js';
import { attackBoost, bestMove, plainEnergy, powerChoiceSets, powerSituation, specialAttachment, survive, type Allowed } from './evaluate.js';

/**
 * The 'gym leader' CPU: the strongest, which the easier ones are weaker versions of. Besides the
 * moves the rules force (an active during setup, promoting after a Knock Out, finishing a search), on its
 * turn it goes through these steps in order, taking the first move any of them wants, until it attacks or
 * nothing is left and it ends its turn:
 *
 * 1. Draw and search: Bill; Computer Search, Pokémon Trader, Master Ball, Brock's Training Method and Erika's Maids for
 *    the next stage of a line in play; Good Manners for a Basic; Erika and Misty's Wrath with a small hand; Blaine's
 *    Last Resort; Secret Mission to swap cards it can't use; Misty's Tears and Fervor for Energy its Pokémon need;
 *    Rocket's Secret Experiment for a card it wants.
 * 2. Develop: bench Basics, Pokémon Breeder, Giovanni when it lets something evolve, evolve, Max Revive with Energy it
 *    can't use, and a Clefairy Doll when the Bench is empty.
 * 3. Energy: Rain Dance and Energy Trans; Blaine when a Pokémon with Blaine in its name needs 2 more; then the turn's
 *    attachment where it brings an attack closest. Then Professor Oak, if the hand is down to 2 other cards.
 * 4. Heal: Full Heal, Celadon City Gym, Super Potion, Potion, Brock, Erika's Kindness, Giovanni's Last Resort, Pokémon
 *    Center, Damage Swap.
 * 5. Disrupt: Energy Removal, Super Energy Removal, Gust of Wind, The Rocket's Trap; a Stadium for its owner's Pokémon
 *    (Pewter City Gym for Brock's…) when it has more of them in play than the player; Brock's Protection.
 * 6. Retreat or Switch when the Active Pokémon can't attack, is about to be Knocked Out, or has a Special Condition.
 * 7. Boost: powers that improve this turn's attack (Energy Burn), PlusPower and Misty for a Knock Out, Koga to poison,
 *    Defender or Koga's Ninja Trick to survive one.
 * 8. Tickling Machine, when it has no attack that does damage (tails would end the turn).
 * 9. Attack: the cheapest Knock Out, otherwise the most damage.
 *
 * Every other card (agreed with the user: the gym leader plays every card) goes through the generic judgement in
 * evaluate.ts: after Develop, any other Trainer, Pokémon Power or Stadium that leaves a better position; in Energy, a
 * special Energy card where it does better than the attachment rule's pick; in Boost, any other Trainer that makes this
 * turn's attack better or stops the player's next attack from Knocking Out the Active Pokémon. Cards with rules of their own
 * are left to those rules (the agreed baseline).
 *
 * It only uses what the player could see: what attacks would do is worked out over every coin-flip outcome
 * (shared.ts), never from the real flips to come, and searches only count on cards that could still be
 * in the deck. Trainers and powers are recognised by name, so reprints work the same.
 */
export function gymLeaderCpu(state: GameState, cpuId: PlayerId): GameAction | null {
  return withAttackMemo(() => decide(state, cpuId));
}

function decide(state: GameState, cpuId: PlayerId): GameAction | null {
  const cpu = state.players[cpuId];
  if (!cpu) throw new Error(`Unknown CPU player ${cpuId}`);

  switch (state.phase) {
    case 'setup':
      return chooseActive(state, cpu);
    case 'promote':
      return state.pendingPromotion === cpuId ? { type: 'PROMOTE', slot: promotion(state, cpuId) } : null;
    case 'playing': {
      // A choice can be the CPU's during the other player's turn (Computer Error, Chain Reaction).
      if (state.pendingChoice) {
        if (state.pendingChoice.player !== cpuId) return null;
        // After the player's Whirlwind, Ram…: the Pokémon it would promote after a Knock Out comes in.
        if (state.pendingChoice.kind === 'switchIn') return { type: 'RESOLVE_CHOICE', target: promotion(state, cpuId) };
        if (state.pendingChoice.kind === 'borrowedTrainer') return borrowedTrainerMove(state, cpuId, gymLeaderCpu);
        return resolveSearch(turnOf(state, cpuId));
      }
      if (state.currentPlayer !== cpuId) return null;
      const t = turnOf(state, cpuId);
      for (const step of STEPS) {
        const action = step(t);
        if (action) return action;
      }
      return { type: 'END_TURN' };
    }
    case 'finished':
      return null;
  }
}

/** Stadiums that help Pokémon with an owner's name, by nameKey. */
const OWNER_STADIUMS: Record<string, string> = {
  pewtercitygym: 'Brock',
  ceruleancitygym: 'Misty',
  celadoncitygym: 'Erika',
  viridiancitygym: 'Giovanni',
  vermilioncitygym: 'Lt. Surge',
  cinnabarcitygym: 'Blaine',
};

/** Trainers the CPU plays, by nameKey. Others (Lass, Item Finder, Pokédex…) it keeps, or discards to Computer Search. */
const PLAYS = new Set([
  'bill', 'professoroak', 'computersearch', 'pokemontrader', 'pokemonbreeder', 'clefairydoll', 'superpotion', 'potion', 'pokemoncenter',
  'fullheal', 'energyremoval', 'superenergyremoval', 'gustofwind', 'switch', 'pluspower', 'defender',
  // Gym Heroes and Gym Challenge.
  'erika', 'mistyswrath', 'masterball', 'brockstrainingmethod', 'erikasmaids', 'goodmanners', 'blaineslastresort', 'secretmission',
  'mistystears', 'fervor', 'rocketssecretexperiment', 'giovanni', 'maxrevive', 'blaine', 'brock', 'erikaskindness', 'giovannislastresort',
  'therocketstrap', 'brocksprotection', 'koga', 'misty', 'kogasninjatrick', 'ticklingmachine', ...Object.keys(OWNER_STADIUMS),
]);

/** Powers with rules of their own (Energy step, Damage Swap in Heal), by nameKey: the generic judgement leaves them. */
const RULE_POWERS = new Set(['raindance', 'energytrans', 'damageswap']);

/** What the generic judgement plays: every Trainer, power and Stadium without a rule above. */
const OTHERS: Allowed = { trainers: (key) => !PLAYS.has(key), powers: (key) => !RULE_POWERS.has(key), stadium: (key) => key !== 'celadoncitygym' };

/** The CPU's Pokémon that can use the power with this nameKey now. */
const powered = (t: Turn, key: string) =>
  inPlay(t.me).filter(([source, p]) => nameKey(powerOf(p, t.state.cards)?.name ?? '') === key && !powerError(powerSituation(t, source)));

function usePower(t: Turn, source: Target, choices: PowerChoices): GameAction | null {
  const action: GameAction = { type: 'USE_POWER', source, choices };
  return tryAction(t.state, t.id, action) ? action : null;
}

const STEPS: ((t: Turn) => GameAction | null)[] = [drawAndSearch, develop, others, attachEnergy, professorOak, heal, disrupt, retreat, boost, tickle, attack];

// ---- 1. Draw and search ----

function drawAndSearch(t: Turn): GameAction | null {
  // Keep a card to draw next turn.
  if (t.me.deck.length > 2) {
    const bill = play(t, trainer(t, 'bill'));
    if (bill) return bill;
  }
  // The prizes are face down, so only cards in neither the deck nor the prizes are known not to be there.
  const unseen = [...t.me.deck, ...t.me.prizes];
  const search = trainer(t, 'computersearch');
  if (search && wantedCards(t.state, t.me, unseen).length) {
    const discards = searchDiscards(t, search);
    const action = discards.length >= 2 && play(t, search, { handUids: discards.slice(0, 2).map((c) => c.uid) });
    if (action) return action;
  }
  const trader = trainer(t, 'pokemontrader');
  const offer = unusablePokemon(t.state, t.me)[0];
  if (trader && offer && wantedCards(t.state, t.me, unseen).some((c) => isPokemonCard(t.def(c)))) {
    const action = play(t, trader, { handUids: [offer.uid] });
    if (action) return action;
  }
  return gymSearch(t, unseen);
}

/** The Gym sets' draw and search Trainers (see the steps above). */
function gymSearch(t: Turn, unseen: CardInstance[]): GameAction | null {
  const wanted = wantedCards(t.state, t.me, unseen).filter((c) => isPokemonCard(t.def(c)));
  const owned = (owner: string) => wanted.some((c) => t.def(c).name.includes(owner));
  if (wanted.length) {
    const action = play(t, trainer(t, 'masterball')) ?? (owned('Brock') ? play(t, trainer(t, 'brockstrainingmethod')) : null);
    if (action) return action;
    const maids = trainer(t, 'erikasmaids');
    const discards = maids ? searchDiscards(t, maids) : [];
    const traded = owned('Erika') && discards.length >= 2 && play(t, maids, { handUids: discards.slice(0, 2).map((c) => c.uid) });
    if (traded) return traded;
  }
  const basicInHand = t.me.hand.some((c) => isBasicPokemon(t.def(c)));
  if (!basicInHand && openBenchSlot(t.me, t.state.cards, t.state.stadium?.card) >= 0) {
    const manners = play(t, trainer(t, 'goodmanners'));
    if (manners) return manners;
  }
  // Draw, with a small hand and a deck that can take it.
  const others = (key: string) => t.me.hand.filter((c) => nameKey(t.def(c).name) !== key).length;
  if (others('erika') <= 3 && t.me.deck.length > 8) {
    const action = play(t, trainer(t, 'erika'));
    if (action) return action;
  }
  if (others('mistyswrath') <= 3 && t.me.deck.length > 10) {
    const action = play(t, trainer(t, 'mistyswrath'));
    if (action) return action;
  }
  if (t.me.deck.length > 7) {
    const action = play(t, trainer(t, 'blaineslastresort'));
    if (action) return action;
  }
  // Swap cards it can't use for new ones.
  const mission = trainer(t, 'secretmission');
  if (mission && junk(t, mission).length >= 2 && t.me.deck.length > 5) {
    const action = play(t, mission);
    if (action) return action;
  }
  // Energy its Pokémon need, of a type the hand has none of.
  const needs = (type: 'water' | 'fire') => inPlay(t.me).some(([, p]) => hasType(pokemonDef(t.state.cards, p), type)) && !energyInHand(t, type).length;
  const tears = trainer(t, 'mistystears');
  if (tears && needs('water')) {
    const discard = junk(t, tears)[0];
    const action = discard && play(t, tears, { handUids: [discard.uid] });
    if (action) return action;
  }
  if (needs('fire') && t.me.deck.length > 6) {
    const action = play(t, trainer(t, 'fervor'));
    if (action) return action;
  }
  if (wanted.length) return play(t, trainer(t, 'rocketssecretexperiment'));
  return null;
}

/** Cards in the hand it can do without (to discard or trade): Energy nothing uses, Pokémon it can't play. Never `except`. */
const junk = (t: Turn, except: CardInstance) => [...unusableEnergy(t.state, t.me), ...unusablePokemon(t.state, t.me, except)].filter((c) => c !== except);

/**
 * Cards Computer Search can discard, best first: Energy nothing can use, spare copies of a Trainer,
 * Trainers the CPU never plays, then Pokémon it can't use. Never cards it needs.
 */
function searchDiscards(t: Turn, search: CardInstance): CardInstance[] {
  const others = t.me.hand.filter((c) => c !== search);
  const seen = new Set<string>();
  const spares = others.filter((c) => {
    if (!isTrainerCard(t.def(c))) return false;
    const key = nameKey(t.def(c).name);
    if (!seen.has(key)) return seen.add(key), false;
    return true;
  });
  const unplayed = others.filter((c) => isTrainerCard(t.def(c)) && !PLAYS.has(nameKey(t.def(c).name)));
  const list = [...unusableEnergy(t.state, t.me), ...spares, ...unplayed, ...unusablePokemon(t.state, t.me, search)];
  return [...new Set(list)];
}

// ---- 2. Develop ----

function develop(t: Turn): GameAction | null {
  const bench = benchBasic(t);
  if (bench) return bench;

  const breeder = trainer(t, 'pokemonbreeder');
  if (breeder) {
    for (const stage2 of t.me.hand.filter((c) => isPokemonCard(t.def(c)) && (t.def(c) as PokemonCardDef).stage === 'stage2')) {
      for (const [target] of inPlay(t.me)) {
        const action = play(t, breeder, { handUids: [stage2.uid], target });
        if (action) return action;
      }
    }
  }

  // Giovanni: when a Pokémon with Giovanni in its name could evolve but for the first turn or being played this turn.
  const giovanni = trainer(t, 'giovanni');
  if (giovanni && !evolve(t)) {
    for (const [target, p] of inPlay(t.me)) {
      if (!pokemonDef(t.state.cards, p).name.includes('Giovanni')) continue;
      const after = tryAction(t.state, t.id, { type: 'PLAY_TRAINER', cardUid: giovanni.uid, choices: { target } });
      if (after && evolve(turnOf(after, t.id))) return { type: 'PLAY_TRAINER', cardUid: giovanni.uid, choices: { target } };
    }
  }

  const evolution = evolve(t);
  if (evolution) return evolution;

  // Max Revive, paying with 2 Energy cards nothing can use.
  const revive = trainer(t, 'maxrevive');
  const spare = unusableEnergy(t.state, t.me);
  const basic = t.me.discard.find((c) => isBasicPokemon(t.def(c)));
  if (revive && spare.length >= 2 && basic) {
    const action = play(t, revive, { handUids: spare.slice(0, 2).map((c) => c.uid), discardUids: [basic.uid] });
    if (action) return action;
  }

  // A Clefairy Doll only as a stand-in, so a Knock Out of the active can't leave nothing in play.
  const doll = t.me.hand.find((c) => isBenchable(t.def(c)) && isTrainerCard(t.def(c)));
  const empty = openBenchSlot(t.me, t.state.cards, t.state.stadium?.card);
  if (empty >= 0 && doll && !hasBenched(t.me)) return { type: 'PLAY_BENCH', cardUid: doll.uid, slot: empty };
  return null;
}

// ---- 3. Energy ----

function attachEnergy(t: Turn): GameAction | null {
  const cards = t.state.cards;

  for (const [source] of powered(t, 'raindance')) {
    const pick = attachTarget(t, energyInHand(t, 'water'), (p) => hasType(pokemonDef(cards, p), 'water'));
    const action = pick && usePower(t, source, { cardUid: pick.card.uid, to: pick.target });
    if (action) return action;
  }

  const trans = energyTrans(t);
  if (trans) return trans;

  const blaine = blaineAttach(t);
  if (blaine) return blaine;

  if (!t.state.energyAttachedThisTurn) {
    const pick = attachTarget(t, energyInHand(t).filter((c) => plainEnergy(t, c)), () => true);
    const action: GameAction | null = pick && { type: 'ATTACH_ENERGY', cardUid: pick.card.uid, target: pick.target };
    return specialAttachment(t, action && tryAction(t.state, t.id, action) ? action : null, () => true);
  }
  return null;
}

// ---- After Develop: every other card ----

/** Any Trainer, Pokémon Power or Stadium without a rule of its own that leaves a better position (evaluate.ts). */
function others(t: Turn): GameAction | null {
  return bestMove(t, OTHERS);
}

/**
 * Energy Trans: move Grass Energy from the Bench to the Active Pokémon when, with enough moves, it can
 * use a stronger attack than it can now. One move at a time; the next call carries on.
 */
function energyTrans(t: Turn): GameAction | null {
  const sources = powered(t, 'energytrans');
  const active = t.me.active;
  if (!sources.length || !active) return null;
  const cards = t.state.cards;
  // A basic Energy card that's Grass now (Rainbow Energy and a converted card count).
  const isGrass = (e: CardInstance) => !e.provides && isEnergyCardOf(e, cards, 'grass');
  const donors = benched(t).flatMap(([slot, p]) => p.energy.filter(isGrass).map((energy) => ({ slot, p, energy })));
  if (!donors.length) return null;
  const pool = energyPool(active, cards);
  const attacks = pokemonDef(cards, active).attacks;
  const now = Math.max(-1, ...attacks.filter((a) => missingEnergy(pool, a.cost) === 0).map((a) => a.damage));
  const reachable = attacks.some((a) => {
    if (a.damage <= now) return false;
    const more = [...pool];
    while (missingEnergy(more, a.cost) > 0 && more.length - pool.length < donors.length) more.push('grass');
    return missingEnergy(more, a.cost) === 0;
  });
  if (!reachable) return null;
  // Take it from where it's missed least.
  const loss = (d: (typeof donors)[number]) => energyValue(cards, d.p) - energyValue(cards, d.p, d.p.energy.filter((e) => e !== d.energy));
  const donor = donors.reduce((a, b) => (loss(b) < loss(a) ? b : a));
  return usePower(t, sources[0]![0], { from: donor.slot, energyUid: donor.energy.uid, to: 'active' });
}

/**
 * Blaine: played when a Pokémon with Blaine in its name is 2 or more Energy from its strongest attack and the hand has 2
 * Fire Energy cards; then both go to it (the first as the turn's attachment, the second as Blaine's).
 */
function blaineAttach(t: Turn): GameAction | null {
  const cards = t.state.cards;
  const fire = energyInHand(t, 'fire');
  const gap = (p: InPlayPokemon) => {
    const attacks = pokemonDef(cards, p).attacks;
    return attacks.length ? missingEnergy(energyPool(p, cards), attacks.reduce((a, b) => (b.damage > a.damage ? b : a)).cost) : 0;
  };
  const blaines = inPlay(t.me).filter(([, p]) => pokemonDef(cards, p).name.includes('Blaine'));
  if (t.me.blaineTurn === t.state.turn) {
    // The first Fire Energy card goes to the neediest; the second follows it.
    const first = t.state.energyAttachedThisTurn ? blaines.find(([, p]) => baseUid(p) === t.state.blaineAttach) : blaines.reduce<[Target, InPlayPokemon] | undefined>((a, b) => (!a || gap(b[1]) > gap(a[1]) ? b : a), undefined);
    if (!first || !fire.length || t.state.blaineAttach === 'done') return null;
    const action: GameAction = { type: 'ATTACH_ENERGY', cardUid: fire[0]!.uid, target: first[0] };
    return tryAction(t.state, t.id, action) ? action : null;
  }
  if (t.state.energyAttachedThisTurn || fire.length < 2 || !blaines.some(([, p]) => gap(p) >= 2)) return null;
  return play(t, trainer(t, 'blaine'));
}

// ---- 4. Heal ----

function heal(t: Turn): GameAction | null {
  const cards = t.state.cards;
  const active = t.me.active;
  if (active?.condition) {
    const action = play(t, trainer(t, 'fullheal'));
    if (action) return action;
  }

  const superPotion = trainer(t, 'superpotion');
  if (superPotion) {
    if (active && active.damage >= 40 && active.energy.length && keepsBestAttack(t, active)) {
      const action = play(t, superPotion, { target: 'active', energyUids: spareEnergy(cards, active, 1)!.map((e) => e.uid) });
      if (action) return action;
    }
    const hurt = benched(t).filter(([, p]) => p.damage >= 40 && p.energy.length);
    if (hurt.length) {
      const [slot, p] = hurt.reduce((a, b) => (b[1].damage > a[1].damage ? b : a));
      const action = play(t, superPotion, { target: slot, energyUids: spareEnergy(cards, p, 1)!.map((e) => e.uid) });
      if (action) return action;
    }
  }

  const potion = trainer(t, 'potion');
  if (potion) {
    const hurt = inPlay(t.me).filter(([, p]) => p.damage >= 20);
    const target = active && active.damage >= 20 ? 'active' : hurt.length ? hurt.reduce((a, b) => (b[1].damage > a[1].damage ? b : a))[0] : null;
    const action = target !== null && play(t, potion, { target });
    if (action) return action;
  }

  // Celadon City Gym: an Energy card for curing the Active Pokémon with Erika in its name, if it can spare one.
  if (active?.condition && t.state.stadium && nameKey(t.def(t.state.stadium.card).name) === 'celadoncitygym' && spareEnergy(cards, active, 1)) {
    const action: GameAction = { type: 'USE_STADIUM' };
    if (tryAction(t.state, t.id, action)) return action;
  }

  // Brock: a counter off each damaged Pokémon, once 2 or more are hurt.
  if (inPlay(t.me).filter(([, p]) => p.damage >= 10).length >= 2) {
    const action = play(t, trainer(t, 'brock'));
    if (action) return action;
  }
  // Erika's Kindness heals both sides: only when it heals more of its own.
  const healed = (side: typeof t.me) => inPlay(side).reduce((n, [, p]) => n + Math.min(20, p.damage), 0);
  if (healed(t.me) >= 30 && healed(t.me) > healed(t.opp)) {
    const action = play(t, trainer(t, 'erikaskindness'));
    if (action) return action;
  }
  // Giovanni's Last Resort: all damage off a badly hurt Pokémon with Giovanni in its name, when there's little hand to lose.
  const resort = trainer(t, 'giovannislastresort');
  if (resort && t.me.hand.length - 1 <= 2) {
    const hurt = inPlay(t.me).filter(([, p]) => pokemonDef(cards, p).name.includes('Giovanni') && p.damage * 2 >= pokemonDef(cards, p).hp);
    const action = hurt.length && play(t, resort, { target: hurt.reduce((a, b) => (b[1].damage > a[1].damage ? b : a))[0] });
    if (action) return action;
  }

  const center = trainer(t, 'pokemoncenter');
  if (center) {
    const total = inPlay(t.me).reduce((sum, [, p]) => sum + p.damage, 0);
    // It discards the healed Pokémon's Energy, so not when the active is hurt and about to attack with it.
    const needsActive = !!active?.damage && damages(bestAttack(attackOptions(t.state, t.id)));
    const action = total >= 60 && !needsActive && play(t, center);
    if (action) return action;
  }

  // Damage Swap: move damage counters off an active that would be Knocked Out next turn.
  if (active && active.damage >= 10 && threatKnocksOut(t.state, t.id)) {
    for (const [source] of powered(t, 'damageswap')) {
      const receivers = benched(t).filter(([, p]) => p.damage + 10 < pokemonDef(cards, p).hp);
      if (!receivers.length) break;
      const [to] = receivers.reduce((a, b) => (hpLeft(cards, b[1]) > hpLeft(cards, a[1]) ? b : a));
      // One counter at a time, as it always has.
      const action = usePower(t, source, { from: 'active', to, counters: 1 });
      if (action) return action;
    }
  }
  return null;
}

// ---- 5. Disrupt ----

function disrupt(t: Turn): GameAction | null {
  const cards = t.state.cards;
  const theirs = inPlay(t.opp).filter(([, p]) => p.energy.length);

  const removal = trainer(t, 'energyremoval');
  if (removal && theirs.length) {
    const [oppTarget, p] = removalTarget(t, theirs);
    const action = play(t, removal, { oppTarget, oppEnergyUids: vitalEnergy(cards, p, 1)!.map((e) => e.uid) });
    if (action) return action;
  }

  const superRemoval = trainer(t, 'superenergyremoval');
  if (superRemoval) {
    // Only where both Energy were going towards the same attack.
    const target = theirs.find(([, p]) => {
      const pair = vitalEnergy(cards, p, 2);
      if (!pair || pair.length < 2) return false;
      const before = energyPool(p, cards);
      const after = energyPool({ ...p, energy: p.energy.filter((e) => !pair.includes(e)) }, cards);
      return pokemonDef(cards, p).attacks.some((a) => missingEnergy(after, a.cost) - missingEnergy(before, a.cost) >= 2);
    });
    const own = ownDiscardForRemoval(t);
    if (target && own) {
      const action = play(t, superRemoval, { target: own.target, energyUids: [own.energy.uid], oppTarget: target[0], oppEnergyUids: vitalEnergy(cards, target[1], 2)!.map((e) => e.uid) });
      if (action) return action;
    }
  }

  const gust = trainer(t, 'gustofwind');
  if (gust && hasBenched(t.opp) && !knocksOut(bestAttack(attackOptions(t.state, t.id)))) {
    for (const [slot] of benched({ ...t, me: t.opp })) {
      const choices = { oppTarget: slot };
      const after = tryAction(t.state, t.id, { type: 'PLAY_TRAINER', cardUid: gust.uid, choices });
      if (after && knocksOut(bestAttack(attackOptions(after, t.id)))) return { type: 'PLAY_TRAINER', cardUid: gust.uid, choices };
    }
    // Otherwise strand a Pokémon that can neither attack nor easily retreat.
    const stuck = benched({ ...t, me: t.opp }).filter(([, p]) => !p.energy.length && retreatCost(p, cards) >= 2);
    if (stuck.length) {
      const [slot] = stuck.reduce((a, b) => (retreatCost(b[1], cards) > retreatCost(a[1], cards) ? b : a));
      const action = play(t, gust, { oppTarget: slot });
      if (action) return action;
    }
  }

  // The Rocket's Trap: a flip that could send 3 of the player's cards back into their deck.
  if (t.opp.hand.length >= 3) {
    const action = play(t, trainer(t, 'therocketstrap'));
    if (action) return action;
  }

  // A Stadium for its owner's Pokémon, when the CPU has more of them in play than the player (and at least 2).
  const owners = (side: typeof t.me, owner: string) => inPlay(side).filter(([, p]) => pokemonDef(cards, p).name.includes(owner)).length;
  for (const [key, owner] of Object.entries(OWNER_STADIUMS)) {
    const mine = owners(t.me, owner);
    if (mine < 2 || mine <= owners(t.opp, owner)) continue;
    const action = play(t, trainer(t, key));
    if (action) return action;
  }

  // Brock's Protection on the Pokémon with Brock in its name that has the most Energy.
  const protection = trainer(t, 'brocksprotection');
  const brocks = inPlay(t.me).filter(([, p]) => pokemonDef(cards, p).name.includes('Brock') && p.energy.length >= 2 && !(p.attached ?? []).some((a) => nameKey(t.def(a.card).name) === 'brocksprotection'));
  if (protection && brocks.length) {
    const action = play(t, protection, { target: brocks.reduce((a, b) => (b[1].energy.length > a[1].energy.length ? b : a))[0] });
    if (action) return action;
  }
  return null;
}

/** The opponent's Pokémon to take Energy from: the Active Pokémon, otherwise the one closest to its strongest attack. */
function removalTarget(t: Turn, theirs: [Target, InPlayPokemon][]): [Target, InPlayPokemon] {
  const cards = t.state.cards;
  const active = theirs.find(([target]) => target === 'active');
  if (active) return active;
  const missing = (p: InPlayPokemon) => {
    const attacks = pokemonDef(cards, p).attacks;
    if (!attacks.length) return Infinity;
    const strongest = attacks.reduce((a, b) => (b.damage > a.damage ? b : a));
    return missingEnergy(energyPool(p, cards), strongest.cost);
  };
  return theirs.reduce((a, b) => (missing(b[1]) < missing(a[1]) ? b : a));
}

/** The CPU's own Energy Super Energy Removal discards: the one missed least, never one this turn's attack needs. */
function ownDiscardForRemoval(t: Turn): { target: Target; energy: CardInstance } | null {
  const cards = t.state.cards;
  let best: { target: Target; energy: CardInstance; loss: number } | null = null;
  for (const [target, p] of inPlay(t.me)) {
    const spare = p.energy.length ? spareEnergy(cards, p, 1) : null;
    if (!spare) continue;
    if (target === 'active' && !keepsBestAttack(t, p)) continue;
    const loss = energyValue(cards, p) - energyValue(cards, p, p.energy.filter((e) => !spare.includes(e)));
    if (!best || loss < best.loss) best = { target, energy: spare[0]!, loss };
  }
  return best;
}

// ---- 6. Retreat or Switch ----

function retreat(t: Turn): GameAction | null {
  const cards = t.state.cards;
  const active = t.me.active;
  if (!active || !hasBenched(t.me)) return null;
  const now = bestAttack(attackOptions(t.state, t.id));
  const bench = benchAttackers(t);
  const pool = energyPool(active, cards);
  const soon = pokemonDef(cards, active).attacks.some((a) => missingEnergy(pool, a.cost) <= 1);

  let candidates: typeof bench = [];
  // It can't attack this turn or the next, but something on the Bench can attack now.
  if (!damages(now) && !soon) candidates = bench.filter((b) => damages(b.best));
  // It would be Knocked Out next turn (and isn't Knocking Out the attacker first): bring in something that survives.
  if (!candidates.length && !knocksOut(now) && threatKnocksOut(t.state, t.id)) candidates = bench.filter((b) => !threatKnocksOut(swapIn(t.state, t.id, b.slot), t.id));
  // A Special Condition nothing has cured.
  if (!candidates.length && active.condition) candidates = bench;
  if (!candidates.length) return null;

  const pick = strongestOf(cards, candidates);

  return switchOrRetreat(t, pick.slot, bench);
}

// ---- 7. Boost ----

function boost(t: Turn): GameAction | null {
  const now = bestAttack(attackOptions(t.state, t.id));

  // Any power that makes this turn's attack better (Energy Burn), as long as it costs no Pokémon or prize.
  for (const [source, p] of inPlay(t.me)) {
    const key = nameKey(powerOf(p, t.state.cards)?.name ?? '');
    if (!key || key === 'damageswap' || powerError(powerSituation(t, source))) continue;
    for (const choices of powerChoiceSets(t, source)) {
      const action: GameAction = { type: 'USE_POWER', source, choices };
      const after = tryAction(t.state, t.id, action);
      if (!after || after.players[t.opp.id]!.prizes.length < t.opp.prizes.length || inPlay(after.players[t.id]!).length < inPlay(t.me).length) continue;
      if (after.phase !== 'playing' || after.currentPlayer !== t.id) continue;
      if (attackScore(bestAttack(attackOptions(after, t.id))) > attackScore(now)) return action;
    }
  }

  if (now && !knocksOut(now)) {
    const plusPower = trainer(t, 'pluspower');
    const after = plusPower && tryAction(t.state, t.id, { type: 'PLAY_TRAINER', cardUid: plusPower.uid });
    if (after && knocksOut(bestAttack(attackOptions(after, t.id)))) return { type: 'PLAY_TRAINER', cardUid: plusPower!.uid };
    // Misty: 20 more for a Pokémon with Misty in its name, paid with 2 cards it can do without.
    const misty = trainer(t, 'misty');
    const discards = misty ? junk(t, misty) : [];
    if (misty && discards.length >= 2) {
      const choices = { handUids: discards.slice(0, 2).map((c) => c.uid) };
      const boosted = tryAction(t.state, t.id, { type: 'PLAY_TRAINER', cardUid: misty.uid, choices });
      if (boosted && knocksOut(bestAttack(attackOptions(boosted, t.id)))) return { type: 'PLAY_TRAINER', cardUid: misty.uid, choices };
    }
  }

  // Koga: its Pokémon with Koga in its name poisons what it damages, if that isn't Poisoned already.
  const active = t.me.active;
  if (active && damages(now) && !knocksOut(now) && pokemonDef(t.state.cards, active).name.includes('Koga') && !t.opp.active?.poison) {
    const action = play(t, trainer(t, 'koga'));
    if (action) return action;
  }

  // Defender, if the player's next attack would Knock Out the active and −20 stops that (pointless if the attacker goes down first).
  const defender = trainer(t, 'defender');
  if (defender && t.me.active && !knocksOut(now) && threatKnocksOut(t.state, t.id)) {
    const choices = { target: 'active' as Target };
    const after = tryAction(t.state, t.id, { type: 'PLAY_TRAINER', cardUid: defender.uid, choices });
    if (after && !threatKnocksOut(after, t.id)) return { type: 'PLAY_TRAINER', cardUid: defender.uid, choices };
  }
  // Koga's Ninja Trick on an Active Pokémon with Koga in its name that would be Knocked Out: it can switch out first.
  if (active && !knocksOut(now) && hasBenched(t.me) && pokemonDef(t.state.cards, active).name.includes('Koga') && threatKnocksOut(t.state, t.id)) {
    const action = play(t, trainer(t, 'kogasninjatrick'));
    if (action) return action;
  }
  // Any other Trainer that makes this attack better (a Technical Machine, Pokémon Reversal…), or keeps the Active Pokémon from a Knock Out.
  return attackBoost(t, OTHERS) ?? (knocksOut(now) ? null : survive(t, OTHERS));
}

// ---- 8. Tickling Machine ----

/** Only when there's no damaging attack to lose: tails ends the turn. */
function tickle(t: Turn): GameAction | null {
  return t.opp.hand.length && !damages(bestAttack(attackOptions(t.state, t.id))) ? play(t, trainer(t, 'ticklingmachine')) : null;
}

// ---- 9. Attack ----

function attack(t: Turn): GameAction | null {
  return attackWith(bestAttack(attackOptions(t.state, t.id)));
}

// ---- Promoting ----

/** After a Knock Out: the benched Pokémon that attacks best right away, then the one with the most HP left. */
const promotion = (state: GameState, id: PlayerId) => strongestOf(state.cards, benchAttackers(turnOf(state, id))).slot;
