// EX Crystal Guardians (ex14) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Chlorophyll makes any card providing only Colorless Energy provide as much Grass Energy (Double
// Colorless 2, Boost Energy 3, React, Holon Energy, a Holon's Magnemite or Voltorb); Swampert ex's Energy Recycle attaches
// as many as there are, up to 3, and the turn ends anyway.
// From the text: Igglybuff has a Poké-Body (Hover Lift) and a Poké-Power (Baby Evolution): the power used is the Poké-Power
// (`usePoke`), stopped as Poké-Powers are; Hover Lift's 1 less adds up for each Igglybuff; Excavate shows the top card to
// its player only; Delta Sign is one a turn whichever Fearow δ; Constrain has its player discard first; Hard Rock (only one)
// works while the Groudon ex with it has 1 Energy or less, Flotation likewise for the Kyogre ex; Extra Liquid's Colorless is
// only 1 more, however many (attackError); Dark Eyes counts every Poké-Power, older Pokémon Powers too (usePower).
import { lookupCard } from '../cards.js';
import { afflictBetweenTurns, activeLocked } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect } from '../powers.js';
import { isDelta, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { babyEvolution, EX2_POWERS, POKE_BODY } from './ex2-powers.js';
import { EX5_POWERS } from './ex5-powers.js';
import { EX9_POWERS } from './ex9-powers.js';
import { EX10_POWERS } from './ex10-powers.js';
import { EX11_POWERS } from './ex11-powers.js';
import { EX13_POWERS } from './ex13-powers.js';

/** Where the Pokémon is on its player's side. */
export const targetOf = (owner: { active: unknown; bench: unknown[] }, pokemon: unknown) => (owner.active === pokemon ? ('active' as const) : owner.bench.indexOf(pokemon));

/** "When you put this from your hand onto your Bench, you may …" (Crush Chance, the ☆ Rays): a yes-or-no question. */
export const onBenchMay = (power: 'crushChance' | 'crimsonRay' | 'yellowRay' | 'blueRay', source: string, when: (state: Parameters<NonNullable<PowerEffect['onPlayFromHand']>>[0]) => boolean = () => true): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length || !owner.bench.includes(pokemon) || !when(state)) return;
    state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

export const EX14_POWERS: Record<string, PowerEffect> = {
  // Banette – Safeguard: as EX Sandstorm Wobbuffet's.
  'ex14-1': EX2_POWERS['ex2-26']!,
  // Blastoise δ – Shield Veil: its player's Active Pokémon has no Weakness (as Dragon Veil).
  'ex14-2': { ...POKE_BODY, dragonVeil: true },
  // Camerupt – Delta Protection: 40 less from the opponent's δ Pokémon.
  'ex14-3': { ...POKE_BODY, deltaGuard: 40 },
  // Charizard δ – Peal of Thunder: evolving from the hand, Energy cards among the top 5 attached to one of the player's Pokémon, the rest discarded.
  'ex14-4': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length && owner.deck.length) state.pendingChoice = { player: owner.id, source: 'Peal of Thunder', kind: 'pealTarget' };
    },
  },
  // Dugtrio – Sand Veil (attacks.ts).
  'ex14-5': { ...POKE_BODY, sandVeil: true },
  // Ludicolo δ – Overzealous: as EX Hidden Legends Machamp's.
  'ex14-6': EX5_POWERS['ex5-9']!,
  // Sableye – Excavate: once a turn, the top card looked at; it stays or is discarded.
  'ex14-10': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'mayUse', source: 'Excavate', power: 'excavate', target: ctx.sourceTarget }),
  },
  // Tauros – Crush Chance: put onto the Bench from the hand, it may discard the Stadium in play.
  'ex14-12': onBenchMay('crushChance', 'Crush Chance', (state) => !!state.stadium),
  // Wigglytuff – Fluffy Fur: damaged as its player's Active Pokémon by the opponent's attack, the attacker is now Asleep.
  'ex14-13': {
    ...POKE_BODY,
    onAttackDamage(ctx, damaged) {
      if (damaged !== ctx.opp.active) return;
      ctx.log('Fluffy Fur:', ctx.opp.id);
      afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'asleep');
    },
  },
  // Blastoise – Water Pressure: with 40 HP or less left, 40 more to the Defending Pokémon.
  'ex14-14': { ...POKE_BODY, lowHpBoost: { hpLeft: 40, more: 40 } },
  // Cacturne δ – Spike Storm: once a turn, as the Active Pokémon, a damage counter on one of the opponent's Pokémon with damage counters.
  'ex14-15': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Cacturne must be your Active Pokémon' : ownTargets(s.opp).some((t) => pokemonAt(s.opp, t)!.damage > 0) ? null : "None of your opponent's Pokémon has damage counters"),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: ownTargets(s.opp).filter((t) => pokemonAt(s.opp, t)!.damage > 0), prompt: "Choose one of your opponent's Pokémon with damage counters" }],
    use(ctx) {
      const p = ctx.choices.oppTo === undefined ? null : pokemonAt(ctx.opp, ctx.choices.oppTo);
      if (!p) return;
      p.damage += 10;
      ctx.log(`Spike Storm put a damage counter on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Dusclops – Cursed Glare: as EX Emerald Cacturne ex's.
  'ex14-17': EX9_POWERS['ex9-91']!,
  // Fearow δ – Delta Sign: once a turn (one Delta Sign a turn), a δ Pokémon from the deck, shown.
  'ex14-18': {
    blocked: (s) => (s.me.powerTurns?.['Delta Sign'] === s.turn ? 'Delta Sign has already been used this turn' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      (ctx.me.powerTurns ??= {})['Delta Sign'] = ctx.state.turn;
      ctx.pend({ kind: 'pickFromDeck', source: 'Delta Sign', filter: 'deltaPokemon', reveal: true });
    },
  },
  // Grumpig – Thick Fat: as EX Unseen Forces Miltank's.
  'ex14-20': EX10_POWERS['ex10-42']!,
  // Igglybuff – Hover Lift (Poké-Body) and Baby Evolution (Poké-Power).
  'ex14-21': { ...babyEvolution('Jigglypuff'), ...POKE_BODY, usePoke: true, powerName: 'Baby Evolution', retreatLessFor: { names: ['Jigglypuff', 'Wigglytuff', 'Wigglytuff ex', 'Igglybuff'] } },
  // Medicham – Dual Armor: with Psychic Energy attached, Psychic and Fighting.
  'ex14-25': { ...POKE_BODY, dualArmor: { energy: 'psychic', types: ['psychic', 'fighting'] } },
  // Pelipper δ – Delta Transport: once a turn, on the Bench, the player's δ Active Pokémon switched with one of their Benched Pokémon.
  'ex14-26': {
    oncePerTurn: true,
    blocked(s) {
      if (s.source === 'active') return 'Pelipper must be on your Bench';
      return s.me.active && isDelta(s.cards, s.me.active) ? null : 'Your Active Pokémon has no δ on its card';
    },
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== 'active'), prompt: 'Choose the Benched Pokémon to switch in' }],
    use(ctx) {
      const locked = activeLocked(ctx.state, ctx.me.id);
      if (locked) return ctx.log(locked);
      if (typeof ctx.choices.to === 'number') swapActive(ctx.state, ctx.me, ctx.choices.to);
    },
  },
  // Swampert – Echo Draw: once a turn, a card drawn.
  'ex14-27': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const [card] = ctx.me.deck.splice(0, 1);
      if (card) ctx.me.hand.push(card);
      ctx.log('Drew a card.');
    },
  },
  // Venusaur – Chlorophyll (refreshHideout, energyPool).
  'ex14-28': { ...POKE_BODY, chlorophyll: true },
  // Lotad – Aqua Lift: as EX Holon Phantoms Relicanth's.
  'ex14-55': EX13_POWERS['ex13-30']!,
  // Mudkip – Submerge: as EX Emerald Feebas's.
  'ex14-57': EX9_POWERS['ex9-49']!,
  // Squirtle – Solid Shell: 10 less damage.
  'ex14-64': { ...POKE_BODY, damageReduction: 10 },
  // Aggron ex – Intimidating Armor (attackError, auraStops).
  'ex14-89': { ...POKE_BODY, intimidatingArmor: true },
  // Delcatty ex – Constrain: once a turn, each player discards down to 6 cards in the hand, its player first.
  'ex14-91': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length > 6 || s.counts.oppHand > 6 ? null : 'Neither player has more than 6 cards in their hand'),
    use(ctx) {
      const steps = [ctx.me, ctx.opp].filter((p) => p.hand.length > 6).map((p) => ({ player: p.id, source: 'Constrain', kind: 'discardFromHand' as const, count: p.hand.length - 6 }));
      const [first, ...rest] = steps;
      if (!first) return;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
  // Exploud ex – Extra Noise: as EX Delta Species Sandslash δ's Delta Storm.
  'ex14-92': EX11_POWERS['ex11-27']!,
  // Groudon ex – Hard Rock (attacks.ts).
  'ex14-93': { ...POKE_BODY, hardRock: true },
  // Jirachi ex – Star Light: its attacks' cost (costNow, ex14.ts).
  'ex14-94': { ...POKE_BODY },
  // Kyogre ex – Flotation (retreatBodies).
  'ex14-95': { ...POKE_BODY, flotation: true },
  // Sceptile ex δ – Extra Liquid (auraStops, attackError).
  'ex14-96': { ...POKE_BODY, extraLiquid: true },
  // Shiftry ex – Dark Eyes (usePower).
  'ex14-97': { ...POKE_BODY, darkEyes: true },
  // Swampert ex – Energy Recycle: once a turn, up to 3 Energy cards from the discard pile to the player's Pokémon; then the turn ends.
  'ex14-98': {
    oncePerTurn: true,
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : s.me.discard.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'No Energy cards in your discard pile'),
    use(ctx) {
      const n = Math.min(3, ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length);
      ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Recycle', count: n, anyEnergy: true, afterAttack: true });
    },
  },
  // Celebi ☆ – Time Travel: Knocked Out by the opponent's attack, heads keeps it from it: its cards discarded, it on the bottom of the deck.
  'ex14-100': { timeTravel: 'bottom' },
};

