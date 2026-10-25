// EX Unseen Forces (ex10) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Energy Evolution evolves into a card of any type the Energy card attached provides (Rainbow and Multi
// Energy any, a two-type one either, Darkness Energy Umbreon); Golden Wing moves up to 2 Energy cards (attacks.ts).
// From the text: Stages of Evolution works only while its Pokémon is an Evolved Pokémon (Baby Evolution makes it one);
// Energy Evolution is its player's choice ("may"), from the hand only (not by an attack), and follows the Neo Discovery
// Eevee's (any time, with no other limit); Intimidating Ring and Overpowering Fang work as their player's Active Pokémon,
// both players' Pokémon for Overpowering Fang (powerActive); Lonesome counts every Pokémon in play (trainerError); Silver
// Sparkle's Energy card is its player's pick, from the Attacking Pokémon, back to its owner's hand; Blissful Support, Devo
// Flash, Bursting Up and Darker Ring work as the card evolves a Pokémon from the hand (Darker Ring's switch isn't a "may");
// Night Cry, Snappy Move and Item Search show the card found.
import { hasType, isBasicEnergy, lookupCard, type PokemonCardDef } from '../cards.js';
import { counts, energyProvided, evolvesOnto, isEnergyCardOf, opponentOf, toolOf, type CardInstance } from '../engine.js';
import { attachBlocked, discardsLocked, energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { devolvable, flipCoin, inPlayDef, pokemonName } from '../status.js';
import { EX1_POWERS } from './ex1-powers.js';
import { babyEvolution, EX2_POWERS, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { countersBetween, healBetween } from './ex6-powers.js';
import { TYPES } from './si1.js';

/** The basic Energy cards attached to the player's Benched Pokémon at `t`. */
const benchedBasics = (s: PowerSituation, t: number) => pokemonAt(s.me, t)?.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId))) ?? [];

/** Makeover: the player's Pokémon (not Pokémon-ex) with a basic Energy card attached. */
const madeOver = (s: PowerSituation) =>
  ownTargets(s.me).filter((t) => {
    const p = pokemonAt(s.me, t)!;
    return !inPlayDef(s.cards, p).ex && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)));
  });

/** Stages of Evolution: `effect` works only while its Pokémon is an Evolved Pokémon. */
const stages = (effect: PowerEffect): PowerEffect => ({ ...POKE_BODY, evolvedOnly: true, ...effect });

/** "When you play this from your hand to evolve 1 of your Pokémon": `then`, only for an evolution. */
const onEvolve = (then: NonNullable<PowerEffect['onPlayFromHand']>): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length) then(state, owner, pokemon);
  },
});

export const EX10_POWERS: Record<string, PowerEffect> = {
  // Ampharos – Energy Connect: any number of times, a basic Energy card from one of the player's Benched Pokémon to their Active Pokémon.
  'ex10-1': {
    blocked: (s) => (s.me.active && s.me.bench.some((_, i) => benchedBasics(s, i).length) ? null : 'Your Benched Pokémon have no basic Energy cards'),
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => t !== 'active' && benchedBasics(s, t).length), prompt: 'Choose a Benched Pokémon to move a basic Energy card from' },
      ...(typeof c.from === 'number' ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: benchedBasics(s, c.from), prompt: 'Choose the basic Energy card to move to your Active Pokémon' }] : []),
    ],
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.me.active;
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !to || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Feraligatr, Granbull – Intimidating Fang: as EX Ruby & Sapphire Mightyena's.
  'ex10-4': EX1_POWERS['ex1-10']!,
  'ex10-39': EX1_POWERS['ex1-10']!,
  // Houndoom – Lonesome (trainerError).
  'ex10-7': { ...POKE_BODY, lonesome: true },
  // Meganium – Healing Aroma: as its player's Active Pokémon, a damage counter off each Pokémon (not Pokémon-ex), both players', between turns.
  'ex10-9': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const side of [owner, opp]) for (const p of [side.active, ...side.bench]) if (p && !inPlayDef(state.cards, p).ex) healBetween(state, side, p, 10, 'Healing Aroma');
    },
  },
  // Octillery – Super Suction Cups: as EX Sandstorm Cradily's.
  'ex10-10': EX2_POWERS['ex2-3']!,
  // Poliwrath – Spiral Swirl (attacks.ts).
  'ex10-11': { ...POKE_BODY, spiralSwirl: true },
  // Porygon2 – 3-D Reset: any number of times, a Pokémon Tool attached to one of the player's Pokémon back to the hand.
  'ex10-12': {
    blocked: (s) => (ownTargets(s.me).some((t) => toolOf(s.cards, pokemonAt(s.me, t)!)) ? null : 'None of your Pokémon has a Pokémon Tool attached'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => toolOf(s.cards, pokemonAt(s.me, t)!)), prompt: 'Choose the Pokémon whose Pokémon Tool goes back to your hand' }],
    use(ctx) {
      const p = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const tool = p && toolOf(ctx.state.cards, p);
      if (!p || !tool) return;
      p.attached = p.attached!.filter((a) => a !== tool.tool);
      ctx.me.hand.push(tool.tool.card);
      ctx.log(`Returned ${tool.name} from ${pokemonName(ctx.state, p)} to the hand.`);
    },
  },
  // Slowbro, Magcargo – Dual Armor: with Psychic (Fighting) Energy attached, it's both types (refreshHideout).
  'ex10-13': { ...POKE_BODY, dualArmor: { energy: 'psychic', types: ['water', 'psychic'] } },
  'ex10-41': { ...POKE_BODY, dualArmor: { energy: 'fighting', types: ['fire', 'fighting'] } },
  // Slowking – Item Search: once a turn, a Pokémon Tool card from the deck, shown.
  'ex10-14': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Item Search', filter: 'tool', reveal: true }),
  },
  // Typhlosion – Burning Aura: as its player's Active Pokémon, a damage counter on each Active Pokémon between turns.
  'ex10-17': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const side of [owner, opp]) if (side.active) countersBetween(state, side, side.active, 1, 'Burning Aura');
    },
  },
  // Ursaring – Intimidating Ring (attackError, powerActive).
  'ex10-18': { ...POKE_BODY, intimidatingRing: true },
  // Cleffa, Elekid, Smoochum, Tyrogue – Baby Evolution.
  'ex10-21': babyEvolution('Clefairy'),
  'ex10-23': babyEvolution('Electabuzz'),
  'ex10-31': babyEvolution('Jynx'),
  'ex10-33': babyEvolution(['Hitmonlee', 'Hitmonchan', 'Hitmontop']),
  // Electabuzz – Stages of Evolution: 40 less from the opponent's Pokémon with a Special Energy card attached.
  'ex10-22': stages({ specialGuard: 40 }),
  // Hitmonchan – Stages of Evolution: 30 more HP (refreshHideout).
  'ex10-24': stages({ hpPlus: 30 }),
  // Hitmonlee – Stages of Evolution: its attacks do 20 more to the opponent's Pokémon.
  'ex10-25': stages({ attackMore: 20 }),
  // Hitmontop – Stages of Evolution: damaged as its player's Active Pokémon by the opponent's attack, 2 damage counters on the attacker.
  'ex10-26': stages({
    onAttackDamage(ctx, damaged) {
      if (damaged !== ctx.opp.active) return;
      ctx.attacker.damage += 20;
      ctx.log(`Stages of Evolution: put 2 damage counters on ${ctx.attackerDef.name}.`, ctx.opp.id);
    },
  }),
  // Jynx – Stages of Evolution: nothing the opponent's attacks do affects it but damage, and no Weakness.
  'ex10-28': stages({ crystalBody: true, noWeakness: true }),
  // Aipom – Snappy Move: once a turn (one Snappy Move a turn), on the Bench: a card drawn, then Aipom and every card attached
  // go: the attached cards discarded, Aipom on the bottom of the deck.
  'ex10-34': {
    blocked: (s) => (s.me.powerTurns?.['Snappy Move'] === s.turn ? 'Snappy Move has already been used this turn' : s.source === 'active' ? 'Aipom must be on your Bench' : null),
    use(ctx) {
      (ctx.me.powerTurns ??= {})['Snappy Move'] = ctx.state.turn;
      const [card] = ctx.me.deck.splice(0, 1);
      if (card) {
        ctx.me.hand.push(card);
        ctx.log('Drew a card.');
      }
      const aipom = ctx.source;
      const attached: CardInstance[] = [...aipom.energy.map(({ provides: _, ...e }) => e), ...(aipom.attached ?? []).map((a) => a.card), ...aipom.evolvedFrom];
      ctx.me.discard.push(...attached);
      ctx.me.bench = ctx.me.bench.map((p) => (p === aipom ? null : p));
      ctx.me.deck.push(aipom.card);
      ctx.log(`Discarded ${attached.length} card${attached.length === 1 ? '' : 's'} attached to Aipom and put Aipom on the bottom of the deck.`);
    },
  },
  // Miltank – Thick Fat: 30 less from Fire and Water Pokémon's attacks.
  'ex10-42': { ...POKE_BODY, typeGuard: { types: ['fire', 'water'], amount: 30 } },
  // Quagsire – Dense: 20 less from the opponent's Evolved Pokémon's attacks.
  'ex10-44': { ...POKE_BODY, evolvedGuard: 20 },
  // Shuckle – Extra Tight: no damage from the opponent's Pokémon-ex's attacks.
  'ex10-47': { ...POKE_BODY, exReduction: 1000 },
  // Smeargle – Makeover: once a turn, a basic Energy card from one of the player's Pokémon (not Pokémon-ex) is discarded and
  // another basic Energy card from the discard pile attached to it.
  'ex10-48': {
    oncePerTurn: true,
    blocked(s) {
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      if (!madeOver(s).length) return 'None of your Pokémon (but Pokémon-ex) has a basic Energy card attached';
      return s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'No basic Energy cards in your discard pile';
    },
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: madeOver(s), prompt: 'Choose the Pokémon to discard a basic Energy card from' },
      ...(c.from !== undefined
        ? [
            { kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: pokemonAt(s.me, c.from)?.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId))) ?? [], prompt: 'Choose the basic Energy card to discard' },
            { kind: 'discardCard' as const, field: 'cardUid' as const, options: s.me.discard.filter((d) => isBasicEnergy(lookupCard(s.cards, d.defId))), prompt: 'Choose a basic Energy card from your discard pile to attach' },
          ]
        : []),
    ],
    use(ctx) {
      const p = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const old = p?.energy.find((e) => e.uid === ctx.choices.energyUid);
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!p || !old || !card) return;
      p.energy = p.energy.filter((e) => e !== old);
      ctx.me.discard = [...ctx.me.discard.filter((c) => c !== card), old];
      p.energy.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, old.defId).name} from ${pokemonName(ctx.state, p)} and attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile.`);
    },
  },
  // Eevee – Energy Evolution: an Energy card attached to it from the hand lets its player evolve it from the deck into a card of a type it provides.
  'ex10-55': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, target, energy) {
      const provided = energyProvided(energy, state.cards).type;
      const current = lookupCard(state.cards, pokemon.card.defId);
      const fits = (d: PokemonCardDef) => !d.trainerText && evolvesOnto(d, current) && TYPES.some((t) => counts(provided, t) && hasType(d, t));
      const names = [...new Set(owner.deck.map((c) => lookupCard(state.cards, c.defId)).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && fits(d)).map((d) => d.name))];
      if (names.length) state.pendingChoice = { player: owner.id, source: 'Energy Evolution', kind: 'evolveFromDeck', target, names, optional: true };
    },
  },
  // Gligar – Free Flight: with no Energy attached, its Retreat Cost is 0.
  'ex10-57': freeRetreat((pokemon) => pokemon.energy.length === 0),
  // Blissey ex – Blissful Support: evolving from the hand, any of the player's Pokémon lose all their Energy cards and damage counters.
  'ex10-101': onEvolve((state, owner) => {
    if ([owner.active, ...owner.bench].some((p) => p && (p.damage || p.energy.some((e) => !e.provides)))) state.pendingChoice = { player: owner.id, source: 'Blissful Support', kind: 'blissful' };
  }),
  // Espeon ex – Devo Flash: evolving from the hand, one of the opponent's Benched Evolved Pokémon may lose its top card to their hand.
  'ex10-102': onEvolve((state, owner) => {
    const opp = state.players[opponentOf(state, owner.id)]!;
    if (opp.bench.some((p) => p && devolvable(state.cards, p))) state.pendingChoice = { player: owner.id, source: 'Devo Flash', kind: 'oppBenchPick', purpose: 'devolve' };
  }),
  // Feraligatr ex – Overpowering Fang (powerActive).
  'ex10-103': { ...POKE_BODY, overpoweringFang: true },
  // Ho-Oh ex – Golden Wing (attacks.ts).
  'ex10-104': { ...POKE_BODY, goldenWing: true },
  // Lugia ex – Silver Sparkle: damaged as its player's Active Pokémon by the opponent's attack, a flip; heads, an Energy card
  // of the Attacking Pokémon's back to its owner's hand, once the attack is over.
  'ex10-105': {
    ...POKE_BODY,
    onAttackDamage(ctx, damaged) {
      if (damaged !== ctx.opp.active || !ctx.attacker.energy.some((e) => !e.provides) || !flipCoin(ctx.state, 'Silver Sparkle', ctx.opp.id)) return;
      (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Silver Sparkle', kind: 'removeEach', targets: ['active'], toHand: true });
    },
  },
  // Meganium ex – Nurture and Heal: once a turn, a Grass Energy card from the hand to one of the player's Pokémon, then a damage counter off it.
  'ex10-106': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => isEnergyCardOf(c, s.cards, 'grass')) ? null : 'No Grass Energy cards in your hand'),
    choices: (s, c) => [
      { kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((h) => isEnergyCardOf(h, s.cards, 'grass')), prompt: 'Choose a Grass Energy card from your hand' },
      ...(c.cardUid ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me), prompt: 'Choose one of your Pokémon to attach it to' }] : []),
    ],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!card || !p) return;
      const blocked = attachBlocked(ctx.state.cards, [ctx.me, ctx.opp], p, card);
      if (blocked) return ctx.log(blocked);
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      p.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, p)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, card);
      if (p.damage) {
        p.damage -= 10;
        ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, p)}.`);
      }
    },
  },
  // Scizor ex – Danger Perception: with 60 HP or less left, 40 more to the Defending Pokémon.
  'ex10-108': { ...POKE_BODY, lowHpBoost: { hpLeft: 60, more: 40 } },
  // Steelix ex – Poison Resistance.
  'ex10-109': { ...POKE_BODY, noPoison: true },
  // Typhlosion ex – Bursting Up: evolving from the hand, up to as many Fire Energy cards from the deck as the opponent has Benched
  // Pokémon, all attached to one of the player's Fire Pokémon.
  'ex10-110': onEvolve((state, owner) => {
    const opp = state.players[opponentOf(state, owner.id)]!;
    const count = opp.bench.filter(Boolean).length;
    const fire = [owner.active, ...owner.bench].some((p) => p && hasType(inPlayDef(state.cards, p), 'fire'));
    if (count && fire && owner.deck.length) state.pendingChoice = { player: owner.id, source: 'Bursting Up', kind: 'pickFromDeck', filter: 'energyType', type: 'fire', count, optional: true, attach: true, attachSame: true, attachOnly: { type: 'fire' } };
  }),
  // Umbreon ex – Darker Ring: evolving from the hand, one of the opponent's Benched Pokémon is switched with their Active Pokémon.
  'ex10-112': onEvolve((state, owner) => {
    const opp = state.players[opponentOf(state, owner.id)]!;
    if (opp.active && opp.bench.some(Boolean)) state.pendingChoice = { player: owner.id, source: 'Darker Ring', kind: 'oppBenchPick', purpose: 'gust' };
  }),
  // Rocket's Persian ex – Night Cry: once a turn, on the Bench, a Pokémon with Dark or Rocket's in its name from the deck, shown.
  'ex10-116': {
    oncePerTurn: true,
    blocked: (s) => (s.source === 'active' ? "Rocket's Persian ex must be on your Bench" : s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Night Cry', filter: 'darkOrRockets', reveal: true }),
  },
};
