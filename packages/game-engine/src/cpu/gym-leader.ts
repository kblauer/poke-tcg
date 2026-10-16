import { isBasicEnergy, isBasicPokemon, isBenchable, isPokemonCard, isTrainerCard, lookupCard, type CardDef, type PokemonCardDef } from '../cards.js';
import {
  attachEffect,
  chooseActive,
  attackAsActive,
  attackOptions,
  attackScore,
  bestAttack,
  closeness,
  combinations,
  damages,
  energyValue,
  hpLeft,
  inPlay,
  knocksOut,
  missingEnergy,
  nameKey,
  pokemonDef,
  retreatPayment,
  spareEnergy,
  swapIn,
  threatKnocksOut,
  tryAction,
  unusableEnergy,
  unusablePokemon,
  vitalEnergy,
  wantedCards,
} from './shared.js';
import { energyPool, evolveError, hasBenched, opponentOf, retreatCost, retreatError, type CardInstance, type GameAction, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from '../engine.js';
import { powerError, powerOf, resolvePowerChoices, type PowerChoices, type PowerChoiceSpec, type PowerSituation } from '../powers.js';
import { pendingChoiceView, type TrainerChoices } from '../trainers.js';

/**
 * The 'gym leader' CPU: the strongest, which the easier ones are weaker versions of. Besides the
 * moves the rules force (an active during setup, promoting after a Knock Out, finishing a search), on its
 * turn it goes through these steps in order, taking the first move any of them wants, until it attacks or
 * nothing is left and it ends its turn:
 *
 * 1. Draw and search: Bill; Computer Search and Pokémon Trader for the next stage of a line in play.
 * 2. Develop: bench Basics, Pokémon Breeder, evolve, and a Clefairy Doll when the Bench is empty.
 * 3. Energy: Rain Dance and Energy Trans, then the turn's attachment where it brings an attack closest.
 *    Then Professor Oak, if the hand is down to 2 other cards.
 * 4. Heal: Full Heal, Super Potion, Potion, Pokémon Center, Damage Swap.
 * 5. Disrupt: Energy Removal, Super Energy Removal, Gust of Wind.
 * 6. Retreat or Switch when the Active Pokémon can't attack, is about to be Knocked Out, or has a Special Condition.
 * 7. Boost: powers that improve this turn's attack (Energy Burn), PlusPower for a Knock Out, Defender to survive one.
 * 8. Attack: the cheapest Knock Out, otherwise the most damage.
 *
 * It only uses what the player could see: what attacks would do is worked out over every coin-flip outcome
 * (shared.ts), never from the real flips to come, and searches only count on cards that could still be
 * in the deck. Trainers and powers are recognised by name, so reprints work the same.
 */
export function gymLeaderCpu(state: GameState, cpuId: PlayerId): GameAction | null {
  const cpu = state.players[cpuId];
  if (!cpu) throw new Error(`Unknown CPU player ${cpuId}`);

  switch (state.phase) {
    case 'setup':
      return chooseActive(state, cpu);
    case 'promote':
      return state.pendingPromotion === cpuId ? { type: 'PROMOTE', slot: promotion(state, cpuId) } : null;
    case 'playing': {
      if (state.currentPlayer !== cpuId) return null;
      const t = turnOf(state, cpuId);
      if (state.pendingChoice) return resolveSearch(t);
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

/** Trainers the CPU plays, by nameKey. Others (Lass, Item Finder, Pokédex…) it keeps, or discards to Computer Search. */
const PLAYS = new Set([
  'bill', 'professoroak', 'computersearch', 'pokemontrader', 'pokemonbreeder', 'clefairydoll', 'superpotion', 'potion', 'pokemoncenter',
  'fullheal', 'energyremoval', 'superenergyremoval', 'gustofwind', 'switch', 'pluspower', 'defender',
]);

interface Turn {
  state: GameState;
  id: PlayerId;
  me: PlayerState;
  opp: PlayerState;
  def: (c: CardInstance) => CardDef;
}

function turnOf(state: GameState, id: PlayerId): Turn {
  return { state, id, me: state.players[id]!, opp: state.players[opponentOf(state, id)]!, def: (c) => lookupCard(state.cards, c.defId) };
}

/** A Trainer card in the hand by nameKey. */
const trainer = (t: Turn, key: string) => t.me.hand.find((c) => isTrainerCard(t.def(c)) && nameKey(t.def(c).name) === key);

/** Playing the card with these answers, if that's allowed. */
function play(t: Turn, card: CardInstance | undefined, choices?: TrainerChoices): GameAction | null {
  if (!card) return null;
  const action: GameAction = { type: 'PLAY_TRAINER', cardUid: card.uid, ...(choices && { choices }) };
  return tryAction(t.state, t.id, action) ? action : null;
}

/** The CPU's Pokémon that can use the power with this nameKey now. */
const powered = (t: Turn, key: string) =>
  inPlay(t.me).filter(([source, p]) => nameKey(powerOf(p, t.state.cards)?.name ?? '') === key && !powerError(powerSituation(t, source)));

const powerSituation = (t: Turn, source: Target): PowerSituation => ({ me: t.me, source, cards: t.state.cards, turn: t.state.turn });

function usePower(t: Turn, source: Target, choices: PowerChoices): GameAction | null {
  const action: GameAction = { type: 'USE_POWER', source, choices };
  return tryAction(t.state, t.id, action) ? action : null;
}

const benched = (t: Turn) => inPlay(t.me).filter(([target]) => target !== 'active') as [number, InPlayPokemon][];

const STEPS: ((t: Turn) => GameAction | null)[] = [drawAndSearch, develop, attachEnergy, professorOak, heal, disrupt, retreat, boost, attack];

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
  return null;
}

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

/** Finishing a search: the most wanted card (see wantedCards), a Basic, an Energy that helps, or anything. Pokédex keeps the order. */
function resolveSearch(t: Turn): GameAction {
  const view = pendingChoiceView(t.state, t.state.pendingChoice!);
  if (view.kind === 'arrangeTop') return { type: 'RESOLVE_CHOICE', order: view.cards.map((c) => c.uid) };
  const helpsEnergy = (c: CardInstance) => t.def(c).kind === 'energy' && inPlay(t.me).some(([, p]) => closeness(t.state.cards, p, [...p.energy, c]) < closeness(t.state.cards, p));
  const pick =
    wantedCards(t.state, t.me, view.options)[0] ??
    view.options.find((c) => isBasicPokemon(t.def(c))) ??
    view.options.find(helpsEnergy) ??
    view.options[0];
  return pick ? { type: 'RESOLVE_CHOICE', cardUid: pick.uid } : { type: 'RESOLVE_CHOICE' };
}

// ---- 2. Develop ----

function develop(t: Turn): GameAction | null {
  const empty = t.me.bench.findIndex((p) => p === null);
  const basic = t.me.hand.find((c) => isBasicPokemon(t.def(c)));
  if (empty >= 0 && basic) return { type: 'PLAY_BENCH', cardUid: basic.uid, slot: empty };

  const breeder = trainer(t, 'pokemonbreeder');
  if (breeder) {
    for (const stage2 of t.me.hand.filter((c) => isPokemonCard(t.def(c)) && (t.def(c) as PokemonCardDef).stage === 'stage2')) {
      for (const [target] of inPlay(t.me)) {
        const action = play(t, breeder, { handUids: [stage2.uid], target });
        if (action) return action;
      }
    }
  }

  // Active first, then the Bench in order.
  for (const [target, p] of inPlay(t.me)) {
    for (const card of t.me.hand) {
      const evolution = t.def(card);
      if (evolution.kind !== 'pokemon' || evolution.stage === 'basic') continue;
      if (evolveError(evolution, p, t.state.cards, t.state.turn) === null) return { type: 'EVOLVE', cardUid: card.uid, target };
    }
  }

  // A Clefairy Doll only as a stand-in, so a Knock Out of the active can't leave nothing in play.
  const doll = t.me.hand.find((c) => isBenchable(t.def(c)) && isTrainerCard(t.def(c)));
  if (empty >= 0 && doll && !hasBenched(t.me)) return { type: 'PLAY_BENCH', cardUid: doll.uid, slot: empty };
  return null;
}

// ---- 3. Energy ----

function attachEnergy(t: Turn): GameAction | null {
  const cards = t.state.cards;
  const energyCards = (type?: string) =>
    t.me.hand.filter((c) => {
      const d = t.def(c);
      return d.kind === 'energy' && (!type || (d.energyType === type && d.basic !== false));
    });

  for (const [source] of powered(t, 'raindance')) {
    const pick = attachTarget(t, energyCards('water'), (p) => pokemonDef(cards, p).type === 'water');
    const action = pick && usePower(t, source, { cardUid: pick.card.uid, to: pick.target });
    if (action) return action;
  }

  const trans = energyTrans(t);
  if (trans) return trans;

  if (!t.state.energyAttachedThisTurn) {
    const pick = attachTarget(t, energyCards(), () => true);
    if (pick) return { type: 'ATTACH_ENERGY', cardUid: pick.card.uid, target: pick.target };
  }
  return null;
}

/**
 * Where to attach one of `energy`: the Active Pokémon if it makes a new attack payable, otherwise the
 * benched Pokémon it brings closest to attacking, otherwise the Active Pokémon if it helps at all.
 * Never Energy that helps no attack. Basic Energy is tried before special Energy.
 */
function attachTarget(t: Turn, energy: CardInstance[], allowed: (p: InPlayPokemon) => boolean): { card: CardInstance; target: Target } | null {
  const cards = t.state.cards;
  const special = (c: CardInstance) => Number(!isBasicEnergy(t.def(c)));
  const ordered = [...energy].sort((a, b) => special(a) - special(b));
  const active = t.me.active && allowed(t.me.active) ? t.me.active : null;
  const effect = (p: InPlayPokemon, card: CardInstance) => attachEffect(cards, p, card);
  if (active) {
    const card = ordered.find((c) => effect(active, c).enables);
    if (card) return { card, target: 'active' };
  }
  let best: { card: CardInstance; target: Target; closeness: number } | null = null;
  for (const [target, p] of benched(t).filter(([, p]) => allowed(p))) {
    for (const card of ordered) {
      const e = effect(p, card);
      if (e.helps && (!best || e.closeness < best.closeness)) best = { card, target, closeness: e.closeness };
    }
  }
  if (best) return best;
  const card = active && ordered.find((c) => effect(active, c).helps);
  return card ? { card, target: 'active' } : null;
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
  const isGrass = (e: CardInstance) => {
    const d = lookupCard(cards, e.defId);
    return !e.provides && d.kind === 'energy' && d.energyType === 'grass';
  };
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

function professorOak(t: Turn): GameAction | null {
  const oak = trainer(t, 'professoroak');
  // Only once the hand is nearly spent, and never drawing the deck down to nothing.
  return oak && t.me.hand.length - 1 <= 2 && t.me.deck.length > 7 ? play(t, oak) : null;
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
      const action = usePower(t, source, { from: 'active', to });
      if (action) return action;
    }
  }
  return null;
}

/** Whether the Pokémon can discard one Energy and still pay for the strongest attack it can pay for now. */
function keepsBestAttack(t: Turn, p: InPlayPokemon): boolean {
  const cards = t.state.cards;
  const pool = energyPool(p, cards);
  const payable = pokemonDef(cards, p).attacks.filter((a) => missingEnergy(pool, a.cost) === 0);
  if (!payable.length) return true;
  const strongest = payable.reduce((a, b) => (b.damage > a.damage ? b : a));
  const spare = spareEnergy(cards, p, 1);
  return !!spare && missingEnergy(energyPool({ ...p, energy: p.energy.filter((e) => !spare.includes(e)) }, cards), strongest.cost) === 0;
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
  const bench = benched(t).map(([slot, p]) => ({ slot, p, best: attackAsActive(t.state, t.id, slot) }));
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

  const pick = candidates.reduce((a, b) => {
    const diff = attackScore(b.best) - attackScore(a.best);
    return diff > 0 || (diff === 0 && hpLeft(cards, b.p) > hpLeft(cards, a.p)) ? b : a;
  });

  const sw = play(t, trainer(t, 'switch'), { target: pick.slot });
  if (sw) return sw;

  if (retreatError(active, cards, true, t.state.retreatedThisTurn ?? false)) return null;
  const payment = retreatPayment(cards, active, retreatCost(active, cards));
  if (!payment) return null;
  // Not worth paying for when nothing could attack afterwards anyway.
  const left = { ...active, energy: active.energy.filter((e) => !payment.includes(e)) };
  const oldCanAttack = pokemonDef(cards, active).attacks.some((a) => missingEnergy(energyPool(left, cards), a.cost) === 0);
  if (!bench.some((b) => damages(b.best)) && !oldCanAttack) return null;
  const action: GameAction = { type: 'RETREAT', slot: pick.slot, energyUids: payment.map((e) => e.uid) };
  return tryAction(t.state, t.id, action) ? action : null;
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
  }

  // Defender, if the player's next attack would Knock Out the active and −20 stops that (pointless if the attacker goes down first).
  const defender = trainer(t, 'defender');
  if (defender && t.me.active && !knocksOut(now) && threatKnocksOut(t.state, t.id)) {
    const choices = { target: 'active' as Target };
    const after = tryAction(t.state, t.id, { type: 'PLAY_TRAINER', cardUid: defender.uid, choices });
    if (after && !threatKnocksOut(after, t.id)) return { type: 'PLAY_TRAINER', cardUid: defender.uid, choices };
  }
  return null;
}

/** Every complete set of answers to a power's questions (a few dozen at most). */
function powerChoiceSets(t: Turn, source: Target): PowerChoices[] {
  const s = powerSituation(t, source);
  const out: PowerChoices[] = [];
  const answers = (spec: PowerChoiceSpec): unknown[] =>
    spec.kind === 'handCard' || spec.kind === 'attachedEnergy' ? combinations(spec.options, 1).map(([c]) => c!.uid) : spec.options;
  const walk = (given: PowerChoices) => {
    if (out.length >= 24) return;
    const result = resolvePowerChoices(s, given);
    if ('choices' in result) return void out.push(result.choices);
    if (!result.need) return;
    for (const value of answers(result.need)) walk({ ...given, [result.need.field]: value });
  };
  walk({});
  return out;
}

// ---- 8. Attack ----

function attack(t: Turn): GameAction | null {
  const best = bestAttack(attackOptions(t.state, t.id));
  return best ? { type: 'ATTACK', attackIndex: best.attackIndex, choices: best.choices } : null;
}

// ---- Promoting ----

/** After a Knock Out: the benched Pokémon that attacks best right away, then the one with the most HP left. */
function promotion(state: GameState, id: PlayerId): number {
  const t = turnOf(state, id);
  const scored = benched(t).map(([slot, p]) => ({ slot, p, score: attackScore(attackAsActive(state, id, slot)) }));
  return scored.reduce((a, b) => (b.score > a.score || (b.score === a.score && hpLeft(state.cards, b.p) > hpLeft(state.cards, a.p)) ? b : a)).slot;
}
