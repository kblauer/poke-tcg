// EX Legend Maker (ex12) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Fire Remedy works for any Energy card that provides Fire Energy (Rainbow, Multi, a Holon's Pokémon
// attached as Energy); Emerge breaks the first-turn limit but counts as Cascoon's evolution for the turn.
// From the text: Shadow Curse and Reactive Recharge work as the Pokémon is Knocked Out by the opponent's attack's damage
// (attacks.ts, knockedOutEffects), from the Bench too; Stench, Rear Sensor, Sol Shade and Luna Shade stop Poké-Powers
// (and the older Pokémon Powers) of the Pokémon they name, either player's (auraStops); Ancient Shell, Ancient Fang, Ancient
// Protection and Ancient Tentacles count their player's Pokémon of those names (variants too); Reactive Lift, Reactive
// Booster, Reactive Shield and Reactive Aroma work while their Pokémon has a React Energy card attached; Nectar Pod's
// Benched Pokémon is the player's pick; Type Change copies every type of the Defending Pokémon until the end of the turn.
import { hasType, isBasicEnergy, lookupCard, namesMatch, type CardLibrary, type EnergyType, type PokemonCardDef } from '../cards.js';
import { activeLocked, counts, energyProvided, evolvesOnto, type CardInstance, type PlayerState, type Target } from '../engine.js';
import { discardsLocked, hasReact, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { ECARD1_POWERS } from './ecard1-powers.js';
import { babyEvolution, EX2_POWERS, POKE_BODY } from './ex2-powers.js';
import { EX3_POWERS } from './ex3-powers.js';
import { healBetween, countersBetween } from './ex6-powers.js';
import { EX11_POWERS } from './ex11-powers.js';

/** The React Energy cards attached to the player's Pokémon at `t`. */
const reactOn = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)?.energy.filter((e) => !e.provides && lookupCard(s.cards, e.defId).name === 'React Energy') ?? [];

/** The Fossil Pokémon lines (Ancient Shell, Fang, Protection, Tentacles). */
const OMANYTE_KABUTO = ['Omanyte', 'Omastar', 'Kabuto', 'Kabutops', 'Kabutops ex'];

/** Where the Pokémon is on its player's side. */
const targetOf = (owner: { active: unknown; bench: unknown[] }, pokemon: unknown): Target => (owner.active === pokemon ? 'active' : owner.bench.indexOf(pokemon));

/** The player has one of these in play (variants too). */
const hasNamed = (owner: Pick<PlayerState, 'active' | 'bench'>, cards: CardLibrary, names: string[]) =>
  [owner.active, ...owner.bench].some((p) => !!p && names.some((n) => namesMatch(inPlayDef(cards, p).name, n)));

export const EX12_POWERS: Record<string, PowerEffect> = {
  // Aerodactyl – Reactive Protection (attacks.ts).
  'ex12-1': { ...POKE_BODY, reactiveProtection: true },
  // Delcatty – Reactive Shift: once a turn, a React Energy card from one of the player's Pokémon to another.
  'ex12-4': {
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).some((t) => reactOn(s, t).length) && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon has a React Energy card to move'),
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => reactOn(s, t).length), prompt: 'Choose the Pokémon to move a React Energy card from' },
      ...(c.from !== undefined ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' }] : []),
    ],
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      const card = from?.energy.find((e) => !e.provides && lookupCard(ctx.state.cards, e.defId).name === 'React Energy');
      if (!from || !to || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved React Energy from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Gengar – Shadow Curse (attacks.ts).
  'ex12-5': { shadowCurse: true },
  // Kabutops – Ancient Shell: 20 less with Omanyte or Omastar in play.
  'ex12-7': { ...POKE_BODY, partnerShell: { names: ['Omanyte', 'Omastar'], amount: 20 } },
  // Lapras – Support Navigation: put onto the Bench from the hand, a Supporter card from the deck, shown.
  'ex12-8': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length || !owner.bench.includes(pokemon) || !owner.deck.length) return;
      state.pendingChoice = { player: owner.id, source: 'Support Navigation', kind: 'pickFromDeck', filter: 'supporter', reveal: true, optional: true };
    },
  },
  // Mew – Type Change: once a turn, Mew is the Defending Pokémon's type(s) until the end of the turn.
  'ex12-10': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      const d = inPlayDef(ctx.state.cards, ctx.opp.active!);
      const types: EnergyType[] = d.types?.length ? [...d.types] : [d.type];
      ctx.source.typesCopied = types;
      ctx.log(`Mew is now ${types.join(' and ')} type until the end of the turn.`);
    },
  },
  // Muk – Stench (auraStops).
  'ex12-11': { ...POKE_BODY, stench: true },
  // Shiftry – Evolutionary Fan: evolving from the hand, one of the player's Evolved Pokémon (not Shiftry) may go back to the hand with its cards.
  'ex12-12': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source: 'Evolutionary Fan', kind: 'returnOwn', evolvedNot: 'Shiftry' };
    },
  },
  // Victreebel – Nectar Pod: once a turn, one of the opponent's Benched Stage 2 Pokémon switched in.
  'ex12-13': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some((p) => p && inPlayDef(s.cards, p).stage === 'stage2') ? null : 'Your opponent has no Benched Stage 2 Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: s.opp.bench.flatMap((p, i) => (p && inPlayDef(s.cards, p).stage === 'stage2' ? [i] : [])), prompt: "Choose one of your opponent's Benched Stage 2 Pokémon to switch in" }],
    use(ctx) {
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      if (typeof ctx.choices.oppTo === 'number') swapActive(ctx.state, ctx.opp, ctx.choices.oppTo);
    },
  },
  // Wailord – Reactive Lift (retreatBodies).
  'ex12-14': { ...POKE_BODY, reactiveLift: true },
  // Absol, Pinsir – Shining Horn: as EX Delta Species Skarmory's.
  'ex12-15': EX11_POWERS['ex11-55']!,
  'ex12-24': EX11_POWERS['ex11-55']!,
  // Girafarig – Rear Sensor (auraStops).
  'ex12-16': { ...POKE_BODY, rearSensor: true },
  // Gorebyss – Reactive Booster (refreshHideout, energyPool).
  'ex12-17': { ...POKE_BODY, reactiveBooster: ['Huntail', 'Gorebyss'] },
  // Huntail – Reactive Generator: once a turn, with no React Energy card attached, one from the deck attached to it.
  'ex12-18': {
    oncePerTurn: true,
    blocked: (s) => (reactOn(s, s.source).length ? 'Huntail already has a React Energy card attached' : s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Reactive Generator', filter: 'energyNamed', name: 'React Energy', attachTo: ctx.sourceTarget, optional: true }),
  },
  // Lanturn – Dual Armor: with Water Energy attached, Water and Lightning.
  'ex12-19': { ...POKE_BODY, dualArmor: { energy: 'water', types: ['water', 'lightning'] } },
  // Lunatone – Sol Shade (with Solrock): no Poké-Powers for Fire Pokémon (not Pokémon-ex). Solrock – Luna Shade (with Lunatone): nor Colorless ones.
  'ex12-20': { ...POKE_BODY, shade: { partner: 'Solrock', type: 'fire' } },
  'ex12-25': { ...POKE_BODY, shade: { partner: 'Lunatone', type: 'colorless' } },
  // Magmar – Stages of Evolution: as an Evolved Pokémon, all its Energy is Fire Energy (energyPool).
  'ex12-21': { ...POKE_BODY, evolvedOnly: true, energyAs: 'fire' },
  // Magneton – Reactive Recharge (attacks.ts).
  'ex12-22': { reactiveRecharge: true },
  // Omastar – Ancient Fang: 20 more with Kabuto, Kabutops or Kabutops ex in play.
  'ex12-23': { ...POKE_BODY, defendingMore: { more: 20, when: (_p, owner, cards) => hasNamed(owner, cards, ['Kabuto', 'Kabutops', 'Kabutops ex']) } },
  // Spinda – Pattern Distraction (attacks.ts).
  'ex12-26': { ...POKE_BODY, patternDistraction: true },
  // Wobbuffet – Stages of Evolution: as an Evolved Pokémon, the opponent's Active Pokémon costs 1 more to retreat (retreatBodies).
  'ex12-28': { ...POKE_BODY, evolvedOnly: true, retreatTax: 1 },
  // Cascoon – Emerge: once a turn, as the Active Pokémon, heads evolves it from the deck (agreed: on the first turn too, as its evolution for the turn).
  'ex12-30': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Cascoon must be your Active Pokémon' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Emerge did nothing.');
      const current = lookupCard(ctx.state.cards, ctx.source.card.defId);
      const names = [...new Set(ctx.me.deck.map((c) => lookupCard(ctx.state.cards, c.defId)).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && !d.trainerText && evolvesOnto(d, current)).map((d) => d.name))];
      if (names.length) ctx.pend({ kind: 'evolveFromDeck', source: 'Emerge', target: ctx.sourceTarget, names, optional: true });
      else ctx.log('Nothing in the deck evolves from Cascoon.');
    },
  },
  // Dunsparce – Deadlock (attackError).
  'ex12-31': { ...POKE_BODY, deadlock: 'Dunsparce' },
  // Graveler – Exoskeleton: as EX Dragon Pineco's.
  'ex12-34': EX3_POWERS['ex3-71']!,
  // Kabuto – Ancient Protection; Omanyte – Ancient Tentacles (attacks.ts).
  'ex12-36': { ...POKE_BODY, ancientProtection: OMANYTE_KABUTO },
  'ex12-60': { ...POKE_BODY, ancientTentacles: OMANYTE_KABUTO },
  // Kecleon – Reactive Colors: with React Energy, every type but Darkness, Metal and Colorless (refreshHideout).
  'ex12-37': { ...POKE_BODY, colorsNamed: { name: 'React Energy', types: ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting'] } },
  // Machoke – Paranoid: while Confused, 50 more.
  'ex12-39': { ...POKE_BODY, defendingMore: { more: 50, when: (p) => p.condition === 'confused' } },
  // Misdreavus – Deep Sleep: as its player's Active Pokémon (deepSleep).
  'ex12-40': { ...POKE_BODY, deepSleep: true },
  // Roselia – Reactive Aroma: with React Energy, a damage counter off each of the player's Pokémon (not Pokémon-ex) with React Energy between turns (one Reactive Aroma).
  'ex12-42': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, _opp, done) {
      if (!hasReact(pokemon, state.cards) || done.has(`${owner.id}:Reactive Aroma`)) return;
      done.add(`${owner.id}:Reactive Aroma`);
      for (const p of [owner.active, ...owner.bench]) if (p && !inPlayDef(state.cards, p).ex && hasReact(p, state.cards)) healBetween(state, owner, p, 10, 'Reactive Aroma');
    },
  },
  // Sealeo – Power Circulation: once a turn, a basic Energy card from the discard pile on top of the deck, then a damage counter on Sealeo.
  'ex12-43': {
    oncePerTurn: true,
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'No basic Energy cards in your discard pile'),
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: s.me.discard.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId))), prompt: 'Choose a basic Energy card to put on top of your deck' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.deck.unshift(card);
      ctx.source.damage += 10;
      ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} on top of the deck, and a damage counter on Sealeo.`);
    },
  },
  // Tangela – Reactive Healing: a React Energy card attached to it from the hand removes all its damage counters.
  'ex12-44': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (lookupCard(state.cards, energy.defId).name !== 'React Energy' || !pokemon.damage) return;
      pokemon.damage = 0;
      addLog(state, `Reactive Healing removed all damage counters from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Tentacruel – Reactive Shield (attacks.ts).
  'ex12-45': { ...POKE_BODY, reactiveShield: true },
  // Magby, Wynaut – Baby Evolution.
  'ex12-58': babyEvolution('Magmar'),
  'ex12-71': babyEvolution('Wobbuffet'),
  // Wurmple – Poison Payback: as EX Sandstorm Cacturne's.
  'ex12-70': EX2_POWERS['ex2-2']!,
  // Claw Fossil – Jagged Stone; Root Fossil – Spongy Stone: as EX Sandstorm's.
  'ex12-78': EX2_POWERS['ex2-90']!,
  'ex12-80': EX2_POWERS['ex2-92']!,
  // Arcanine ex – Fire Remedy: an Energy card providing Fire Energy attached from the hand (agreed: Rainbow, Multi and the like
  // too) removes a damage counter and every Special Condition from it.
  'ex12-83': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (!counts(energyProvided(energy, state.cards).type, 'fire')) return;
      if (pokemon.damage) pokemon.damage -= 10;
      pokemon.condition = null;
      pokemon.poison = 0;
      pokemon.burned = false;
      delete pokemon.paralyzedTurn;
      addLog(state, `Fire Remedy: removed a damage counter and every Special Condition from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Armaldo ex – Dual Armor: with React Energy, Grass and Fighting (refreshHideout).
  'ex12-84': { ...POKE_BODY, dualArmorNamed: { name: 'React Energy', types: ['grass', 'fighting'] } },
  // Banette ex – Shady Move: once a turn, as the Active Pokémon, a damage counter moved from any Pokémon to another (as Expedition Gengar's Chaos Move).
  'ex12-85': {
    ...ECARD1_POWERS['ecard1-13']!,
    blocked(s) {
      if (s.source !== 'active') return 'Banette ex must be your Active Pokémon';
      const all = [s.me.active, ...s.me.bench, s.opp.active, ...s.opp.bench].filter(Boolean);
      return all.some((p) => p!.damage >= 10) && all.length > 1 ? null : 'No Pokémon in play has damage counters to move';
    },
  },
  // Dustox ex – Safeguard: as EX Sandstorm Wobbuffet's.
  'ex12-86': EX2_POWERS['ex2-26']!,
  // Flygon ex – Emerge Charge: evolving from the hand, up to 2 Energy cards from the discard pile attached to it.
  'ex12-87': {
    onPlayFromHand(state, owner, pokemon) {
      const energy = owner.discard.filter((c: CardInstance) => lookupCard(state.cards, c.defId).kind === 'energy').length;
      if (!pokemon.evolvedFrom.length || !energy || discardsLocked(state.playerOrder.map((id) => state.players[id]!), state.cards)) return;
      state.pendingChoice = { player: owner.id, source: 'Emerge Charge', kind: 'attachFromDiscard', count: Math.min(2, energy), target: targetOf(owner, pokemon), anyEnergy: true };
    },
  },
  // Mew ex – Versatile (usableAttacks).
  'ex12-88': { ...POKE_BODY, versatile: true },
  // Walrein ex – Icy Aura: as its player's Active Pokémon, a damage counter on each Active Pokémon but Water ones between turns.
  'ex12-89': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const side of [owner, opp]) {
        const a = side.active;
        if (a && !hasType(inPlayDef(state.cards, a), 'water')) countersBetween(state, side, a, 1, 'Icy Aura');
      }
    },
  },
};
