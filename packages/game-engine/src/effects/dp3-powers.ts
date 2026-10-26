// Secret Wonders (dp3) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Jamming (playTrainer), Fury Blaze (attacks.ts), Burning Coat, Phoenix Turn
// and Energy Shift (Knock Outs), Cotton Spore, Pot Shell, Trash Cloak, Camouflage and Cotton Balloon (attacks.ts), Plant Cloak
// (refreshHideout), Flame Dash and Aqua Recovery (asked as they're played, mayUse).
// From the text: Osmosis's player says how many damage counters it moves, up to 3, never enough to Knock Out the Gastrodon
// West Sea (agreed); Balloon Sting and Phoenix Turn always flip (agreed); Dark Engage lasts the turn, or until the Pokémon
// that was Active when it was used leaves the Active Spot (agreed); Thunder Rumble is once a turn for each Raikou; Teleportation
// switches Gardevoir with the Active Pokémon from the Bench, or with a Benched one from the Active Spot; KIND removes the
// counters from the opponent's Active Pokémon; SET puts the Energy card picked on top of the deck.
import { hasType, isBasicEnergy, lookupCard, type CardLibrary } from '../cards.js';
import { afflictBetweenTurns, counts, energyPool, isEnergyCardOf, opponentOf, type GameState, type InPlayPokemon, type PlayerId } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, countersMoved, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { inPlay, onlyActive, onlyBenched, POKE_BODY, targetOf } from './common.js';
import { roughSkin } from './ex1-powers.js';
import { energyCardOf } from './ex2.js';
import { babyEvolution } from './ex2-powers.js';

/** The named Pokémon are all on the player's Bench (the Unown). */
const benchHas = (s: PowerSituation, names: string[]) => names.every((n) => s.me.bench.some((p) => p && inPlayDef(s.cards, p).name === n));
/** Not yet used this turn by the player, whichever card ("You can't use more than 1 … Poké-Power each turn"). */
const usedThisTurn = (s: PowerSituation, name: string) => ((s.me.powerTurns?.[name] ?? -1) >= s.turn ? `You already used ${name} this turn` : null);
/** Marks a once-a-turn-for-the-player power as used. */
const markUsed = (ctx: Parameters<NonNullable<PowerEffect['use']>>[0], name: string) => void (ctx.me.powerTurns = { ...ctx.me.powerTurns, [name]: ctx.state.turn });
/** One of the player's Pokémon was Knocked Out during the opponent's last turn (Minus Charge, Plus Charge). */
const lostOne = (s: PowerSituation) => (s.me.knockedOutTurn === s.turn - 1 ? null : "None of your Pokémon were Knocked Out during your opponent's last turn");
/** Energy cards in the player's discard pile (SET), or basic ones of a type (Wear Cloak). */
const discardEnergy = (s: PowerSituation) => s.me.discard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');
/** Damage counters off one of the player's Pokémon, logged. */
function heal(state: GameState, owner: { id: PlayerId }, p: InPlayPokemon, amount: number, source: string) {
  const healed = Math.min(amount, p.damage);
  if (!healed) return;
  p.damage -= healed;
  addLog(state, `${source}: removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, p)}.`, owner.id);
}

/** Wear Cloak: as the Active Pokémon, a basic Energy card of a type from the discard pile attached to it. */
const wearCloak = (type: 'grass' | 'fighting' | 'metal'): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) =>
    onlyActive(s, 'Burmy') ??
    (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : s.me.discard.some((c) => isEnergyCardOf(c, s.cards, type)) ? null : `No basic ${type[0]!.toUpperCase()}${type.slice(1)} Energy cards in your discard pile`),
  use: (ctx) => ctx.pend({ kind: 'attachFromDiscard', source: 'Wear Cloak', count: 1, target: 'active', type }),
});

export const DP3_POWERS: Record<string, PowerEffect> = {
  // Ampharos – Jamming (playTrainer).
  'dp3-1': { ...POKE_BODY, jamming: true },
  // Blastoise – Waterlog: any number of basic Water Energy cards from the hand to any of the player's Pokémon; then the turn ends.
  'dp3-2': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => isEnergyCardOf(c, s.cards, 'water')) ? null : 'You have no basic Water Energy cards in your hand'),
    use(ctx) {
      ctx.state.endTurnNow = true;
      ctx.pend({ kind: 'attachFromHand', source: 'Waterlog', type: 'water', basic: true, count: ctx.me.hand.length, anyTarget: true, endsTurn: true, attached: 0 });
    },
  },
  // Charizard – Fury Blaze; Entei – Burning Coat; Jumpluff – Cotton Spore.
  'dp3-3': { ...POKE_BODY, furyBlaze: true },
  'dp3-4': { ...POKE_BODY, burningCoat: true },
  'dp3-11': { ...POKE_BODY, cottonSpore: true },
  // Flygon – Irritating Buzz: as the Active Pokémon, a damage counter on the opponent's Active Pokémon between turns, but a Fighting one.
  'dp3-5': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      const target = opp.active;
      if (owner.active !== pokemon || !target || hasType(inPlayDef(state.cards, target), 'fighting')) return;
      target.damage += 10;
      addLog(state, `Irritating Buzz: put a damage counter on ${pokemonName(state, target)}.`, owner.id);
    },
  },
  // Gardevoir – Telepass: a Supporter card's effect from the opponent's discard pile; once a turn for the player.
  'dp3-7': {
    oncePerTurn: true,
    blocked: (s) => usedThisTurn(s, 'Telepass') ?? (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : null),
    use(ctx) {
      markUsed(ctx, 'Telepass');
      ctx.pend({ kind: 'supernatural', source: 'Telepass', fromDiscard: true });
    },
  },
  // Gastrodon East Sea – Osmosis: up to 3 damage counters moved from it to one of the player's Gastrodon West Sea.
  'dp3-8': {
    oncePerTurn: true,
    blocked(s) {
      const source = pokemonAt(s.me, s.source);
      if (!source?.damage) return 'Gastrodon East Sea has no damage counters';
      return westSeas(s).length ? null : "You don't have Gastrodon West Sea in play that can take a damage counter";
    },
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'to', options: westSeas(s), prompt: 'Choose your Gastrodon West Sea to move damage counters to' }];
      const to = c.to === undefined ? null : pokemonAt(s.me, c.to);
      const source = pokemonAt(s.me, s.source);
      const most = to && source ? osmosisMost(s.cards, source, to) : 0;
      if (most > 1) specs.push({ kind: 'counters', field: 'counters', options: Array.from({ length: most }, (_, i) => most - i), all: false, prompt: 'Osmosis: how many damage counters to move?' });
      return specs;
    },
    use(ctx) {
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!to) return;
      const most = osmosisMost(ctx.state.cards, ctx.source, to);
      const n = Math.min(most, ctx.choices.counters ?? most);
      if (n <= 0) return;
      ctx.source.damage -= 10 * n;
      countersMoved(ctx.state, ctx.source, 10 * n);
      to.damage += 10 * n;
      ctx.log(`Moved ${n} damage counter${n === 1 ? '' : 's'} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Ho-Oh – Phoenix Turn; Electrode – Energy Shift (Knock Outs).
  'dp3-10': { phoenixTurn: true },
  'dp3-26': { energyShift: true },
  // Ludicolo – Rain Dish: as EX Sandstorm Lombre's. Sharpedo – Rough Skin: as EX Ruby & Sapphire's.
  'dp3-13': { ...POKE_BODY, rainDish: 10 },
  'dp3-37': roughSkin(2),
  // Raikou – Thunder Rumble: a Lightning Energy card attached to it from the hand, a damage counter on one of the opponent's
  // Benched Pokémon (the player may not); once a turn for each Raikou.
  'dp3-16': {
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      const key = `Thunder Rumble ${pokemon.card.uid}`;
      const opp = state.players[opponentOf(state, owner.id)]!;
      if (state.currentPlayer !== owner.id || (owner.powerTurns?.[key] ?? -1) >= state.turn || !energyCardOf(state.cards, energy, 'lightning') || !opp.bench.some(Boolean)) return;
      owner.powerTurns = { ...owner.powerTurns, [key]: state.turn };
      state.pendingChoice = { player: owner.id, source: 'Thunder Rumble', kind: 'placeCounters', count: 1, together: true, optional: true };
    },
  },
  // Suicune – Aqua Recovery: put onto the Bench from the hand, up to 3 Water Pokémon from the discard pile (mayUse).
  'dp3-19': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length || owner.active === pokemon) return;
      state.pendingChoice = { player: owner.id, source: 'Aqua Recovery', kind: 'mayUse', power: 'aquaRecovery', target: targetOf(owner, pokemon) };
    },
  },
  // Venusaur – Miracle Aroma: heads, the Defending Pokémon Asleep, Burned or Poisoned, as the player picks.
  'dp3-20': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Miracle Aroma did nothing.');
      ctx.pend({ kind: 'chooseCondition', source: 'Miracle Aroma', options: ['asleep', 'burned', 'poisoned'] });
    },
  },
  // Arcanine – Flame Dash: evolving a Benched Pokémon from the hand, may switch it in and move the old Active's Energy cards to it (mayUse).
  'dp3-22': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || owner.active === pokemon || !owner.active) return;
      state.pendingChoice = { player: owner.id, source: 'Flame Dash', kind: 'mayUse', power: 'flameDash', target: targetOf(owner, pokemon) };
    },
  },
  // Electivire – Motor Drive: a Lightning Energy card from the discard pile attached to it.
  'dp3-25': {
    oncePerTurn: true,
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : s.me.discard.some((c) => isEnergyCardOf(c, s.cards, 'lightning')) ? null : 'No Lightning Energy cards in your discard pile'),
    use: (ctx) => ctx.pend({ kind: 'attachFromDiscard', source: 'Motor Drive', count: 1, target: ctx.sourceTarget, type: 'lightning' }),
  },
  // Magmortar – Flame Body: a Fire Energy card attached to it from the hand removes 2 damage counters.
  'dp3-31': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (energyCardOf(state.cards, energy, 'fire')) heal(state, owner, pokemon, 20, 'Flame Body');
    },
  },
  // Minun – Minus Charge: one of the player's Pokémon Knocked Out last turn, 2 cards drawn; once a turn for the player.
  'dp3-32': {
    oncePerTurn: true,
    blocked: (s) => usedThisTurn(s, 'Minus Charge') ?? lostOne(s) ?? (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      markUsed(ctx, 'Minus Charge');
      const drawn = ctx.me.deck.splice(0, 2);
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },
  // Plusle – Plus Charge: one of the player's Pokémon Knocked Out last turn, up to 2 basic Energy cards from the discard pile, shown.
  'dp3-36': {
    oncePerTurn: true,
    blocked: (s) =>
      usedThisTurn(s, 'Plus Charge') ??
      lostOne(s) ??
      (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'No basic Energy cards in your discard pile'),
    use(ctx) {
      markUsed(ctx, 'Plus Charge');
      ctx.pend({ kind: 'discardToHand', source: 'Plus Charge', count: 2, filter: 'basicEnergy', reveal: true });
    },
  },
  // Sunflora – Grass Whistle: a damage counter off each of the player's Grass Pokémon; once a turn for the player.
  'dp3-38': {
    oncePerTurn: true,
    blocked: (s) => usedThisTurn(s, 'Grass Whistle') ?? ([s.me.active, ...s.me.bench].some((p) => p && p.damage && hasType(inPlayDef(s.cards, p), 'grass')) ? null : 'None of your Grass Pokémon have damage counters'),
    use(ctx) {
      markUsed(ctx, 'Grass Whistle');
      for (const p of inPlay(ctx.me)) if (p.damage && hasType(inPlayDef(ctx.state.cards, p), 'grass')) heal(ctx.state, ctx.me, p, 10, 'Grass Whistle');
    },
  },
  // Unown S – SET: with Unown S, E and T on the Bench, heads: an Energy card from the discard pile on top of the deck, shown.
  'dp3-39': {
    oncePerTurn: true,
    blocked: (s) =>
      !benchHas(s, ['Unown S', 'Unown E', 'Unown T'])
        ? 'You need Unown S, Unown E and Unown T on your Bench'
        : discardsLocked([s.me, s.opp], s.cards)
          ? 'Allergic Pollen: cards in discard piles are not affected'
          : discardEnergy(s).length
            ? null
            : 'No Energy cards in your discard pile',
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: discardEnergy(s), prompt: 'Choose an Energy card to put on top of your deck (if heads)' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!ctx.flip() || !card) return ctx.log('SET did nothing.');
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.deck.unshift(card);
      ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} on top of the deck.`);
    },
  },
  // Weavile – Dark Engage: the player's Active Pokémon is Darkness until the end of the turn, or until it leaves the Active Spot.
  'dp3-40': {
    oncePerTurn: true,
    blocked: (s) => (s.me.active ? null : 'You have no Active Pokémon'),
    use(ctx) {
      if (!ctx.me.active) return;
      ctx.me.active.typesCopied = ['darkness'];
      ctx.me.active.darkEngaged = true;
      ctx.log(`${pokemonName(ctx.state, ctx.me.active)} is Darkness type until the end of the turn.`);
    },
  },
  // Wormadam Plant Cloak – Plant Cloak; Sandy Cloak – Sandy Cloak (as Crystal Body); Trash Cloak – Trash Cloak.
  'dp3-41': { ...POKE_BODY, plantCloak: true },
  'dp3-42': { ...POKE_BODY, crystalBody: true },
  'dp3-43': { ...POKE_BODY, trashCloak: true },
  // Xatu – Psychic Shift: from the Bench, a Special Condition moved from the player's Active Pokémon to the opponent's.
  'dp3-44': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Xatu') ?? (s.me.active && (s.me.active.condition || s.me.active.poison || s.me.active.burned) ? null : 'Your Active Pokémon has no Special Condition'),
    use: (ctx) => ctx.pend({ kind: 'removeCondition', source: 'Psychic Shift', target: 'active', shift: true }),
  },
  // Kecleon – Camouflage; Shuckle – Pot Shell; Skiploom – Cotton Balloon (attacks.ts).
  'dp3-52': { ...POKE_BODY, camouflage: true },
  'dp3-109': { ...POKE_BODY, potShell: true },
  'dp3-65': { ...POKE_BODY, cottonBalloon: true },
  // Muk – Toxic Sludge: between turns, the opponent's Active Pokémon with Grass Energy attached is Poisoned.
  'dp3-56': {
    ...POKE_BODY,
    checkup(state, owner, _pokemon, opp, done) {
      const key = `${owner.id}Toxic Sludge`;
      const target = opp.active;
      if (done.has(key) || !target || target.poison || !energyPool(target, state.cards).some((e) => counts(e, 'grass'))) return;
      done.add(key);
      afflictBetweenTurns(state, opp.id, target, 'poisoned');
    },
  },
  // Quagsire – Aqua Healing: as the Active Pokémon, with Water Energy on the Defending Pokémon, 3 damage counters off it.
  'dp3-60': {
    oncePerTurn: true,
    blocked(s) {
      const self = pokemonAt(s.me, s.source);
      if (s.source !== 'active') return 'Quagsire must be your Active Pokémon';
      if (!s.opp.active || !energyPool(s.opp.active, s.cards).some((e) => counts(e, 'water'))) return 'The Defending Pokémon has no Water Energy attached';
      return self?.damage ? null : 'Quagsire has no damage counters';
    },
    use: (ctx) => heal(ctx.state, ctx.me, ctx.source, 30, 'Aqua Healing'),
  },
  // Smoochum – Baby Evolution: as EX Unseen Forces'.
  'dp3-67': babyEvolution('Jynx'),
  // Unown K – KIND: 2 damage counters off the opponent's Active Pokémon.
  'dp3-68': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active?.damage ? null : "Your opponent's Active Pokémon has no damage counters"),
    use: (ctx) => void (ctx.opp.active && heal(ctx.state, ctx.me, ctx.opp.active, 20, 'KIND')),
  },
  // Unown N – NOD: with Unown N, O and D on the Bench, the opponent asked (nod).
  'dp3-69': {
    oncePerTurn: true,
    blocked: (s) => (benchHas(s, ['Unown N', 'Unown O', 'Unown D']) ? null : 'You need Unown N, Unown O and Unown D on your Bench'),
    use(ctx) {
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'NOD', kind: 'nod' };
    },
  },
  // Unown O – ONE: with Unown O, N and E on the Bench and 1 card in the hand, cards drawn until 7.
  'dp3-70': {
    oncePerTurn: true,
    blocked: (s) => (!benchHas(s, ['Unown O', 'Unown N', 'Unown E']) ? 'You need Unown O, Unown N and Unown E on your Bench' : s.me.hand.length !== 1 ? 'You must have exactly 1 card in your hand' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const drawn = ctx.me.deck.splice(0, 7 - ctx.me.hand.length);
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },
  // Unown X – X-RAY: from the Bench, the top card of the opponent's deck looked at.
  'dp3-71': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown X') ?? (s.counts.oppDeck ? null : "Your opponent's deck is empty"),
    use: (ctx) => ctx.pend({ kind: 'lookOppDeck', source: 'X-RAY', count: 1 }),
  },
  // Unown Z – ZERO: from the Bench with no cards in the deck, its cards discarded and itself on top of the deck.
  'dp3-72': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown Z') ?? (s.counts.deck ? 'You still have cards in your deck' : null),
    use(ctx) {
      const unown = ctx.source;
      ctx.me.discard.push(...unown.energy.map(({ provides: _, ...card }) => card), ...(unown.attached ?? []).map((a) => a.card));
      ctx.me.bench = ctx.me.bench.map((p) => (p === unown ? null : p));
      ctx.me.deck.unshift(unown.card);
      ctx.log('Put Unown Z on top of the deck.');
    },
  },
  // Venomoth – Dangerous Scales: as the Active Pokémon damaged by the opponent's attack, the Attacking Pokémon Asleep and Poisoned.
  'dp3-73': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon) return;
      afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'asleep');
      afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'poisoned');
    },
  },
  // Burmy – Wear Cloak: Plant Cloak, Sandy Cloak, Trash Cloak.
  'dp3-78': wearCloak('grass'),
  'dp3-79': wearCloak('fighting'),
  'dp3-80': wearCloak('metal'),
  // Hoppip – Cottonweed: with Grass Energy attached, no Retreat Cost.
  'dp3-90': { ...POKE_BODY, retreatChange: (p, cards) => (energyPool(p, cards).some((e) => counts(e, 'grass')) ? -(inPlayDef(cards, p).retreatCost ?? 0) : 0) },
  // Qwilfish – Balloon Sting: as the Active Pokémon damaged by an attack, heads: the Attacking Pokémon Poisoned, 2 damage counters between turns.
  'dp3-101': {
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon || !ctx.oppFlip()) return;
      afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'poisoned');
      if (ctx.attacker.poison) ctx.attacker.poison = 20;
    },
  },
  // Gardevoir LV.X – Teleportation: switched with the Active Pokémon from the Bench, or with a Benched one from the Active Spot.
  'dp3-131': {
    oncePerTurn: true,
    blocked: (s) => (teleportTargets(s).length ? null : 'You have no Pokémon to switch Gardevoir with'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: teleportTargets(s), prompt: 'Choose one of your Pokémon to switch Gardevoir with' }],
    use(ctx) {
      const to = ctx.choices.to;
      const slot = ctx.sourceTarget === 'active' ? to : ctx.sourceTarget;
      if (typeof slot !== 'number' || !ctx.me.bench[slot]) return;
      swapActive(ctx.state, ctx.me, slot);
    },
  },
};

/** The most damage counters Osmosis can move: up to 3, never enough to Knock Out the Gastrodon West Sea. */
const osmosisMost = (cards: CardLibrary, from: InPlayPokemon, to: InPlayPokemon) => Math.max(0, Math.min(3, Math.floor(from.damage / 10), Math.floor((inPlayDef(cards, to).hp - to.damage - 1) / 10)));

/** The player's Gastrodon West Sea that can take a damage counter without being Knocked Out (Osmosis). */
function westSeas(s: PowerSituation) {
  return ownTargets(s.me).filter((t) => {
    const p = pokemonAt(s.me, t)!;
    const d = inPlayDef(s.cards, p);
    return d.name === 'Gastrodon West Sea' && d.hp - p.damage > 10;
  });
}

/** Teleportation: the Benched Pokémon from the Active Spot, the Active Pokémon from the Bench. */
function teleportTargets(s: PowerSituation) {
  return s.source === 'active' ? ownTargets(s.me).filter((t) => t !== 'active') : s.me.active ? ['active' as const] : [];
}
