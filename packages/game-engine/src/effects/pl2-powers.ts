// Rising Rivals (pl2) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Rainbow Float (retreatBodies), Boundary Aura and Frost Wind (attacks.ts),
// Unlucky Wind (flipCoin, refreshHideout), Sticky Hold (switching and RETREAT), Territoriality, Sand Armor and Overgrow
// (attacks.ts), Colorful Body (refreshHideout), Bad Sleeping Habits (RETREAT), Camouflage Gas (Knock Outs), Water Rescue
// (resolveKnockouts), Energy Refresh (energyFromHand). The powers that work as their Pokémon levels up are asked then (mayUse):
// Blade Storm, Bright Look.
// From the text: Final Wish asks as Jirachi is Knocked Out by attack damage; Undevelop puts the top card into the hand, the
// Pokémon below staying in play; Maternal Comfort is once between turns for the player, whichever Nidoqueen; Damage Switch can
// Knock Out the Pokémon SP it moves the counter to; Sand Reset shuffles each player's Energy, Pokémon Tool, Technical Machine
// and other Trainer cards in play into their deck (the Stadium into its owner's), once a game for the player; Magical Return
// asks which card when the Pokémon has both a Pokémon Tool and a Technical Machine.
import { hasType, lookupCard } from '../cards.js';
import { afflictBetweenTurns, type InPlayPokemon, type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, clearOnLeavingActive, devolvable, inPlayDef, pokemonName, removeTopEvolution } from '../status.js';
import { isPokemonSP } from '../trainers.js';
import { POKE_BODY } from './common.js';
import { DP1_POWERS } from './dp1-powers.js';
import { onLevelUp } from './dp5-powers.js';
import { EX15_POWERS } from './ex15-powers.js';
import { EX2_POWERS } from './ex2-powers.js';
import { energyCardOf } from './ex2.js';
import { EX9_POWERS } from './ex9-powers.js';
import { trainerEffect } from './index.js';

/** "Once during your turn, you may use this power. [It]'s type is [type] until the end of your turn" (the Rotom). */
const shift = (type: 'colorless' | 'water' | 'fire' | 'grass', label: string): PowerEffect => ({
  oncePerTurn: true,
  use(ctx) {
    ctx.source.typesCopied = [type];
    ctx.log(`${pokemonName(ctx.state, ctx.source)} is ${label} type until the end of the turn.`);
  },
});
/** Undevelop: the top card of the Eeveelution back into the hand. */
const undevelop: PowerEffect = {
  oncePerTurn: true,
  blocked: (s) => (devolvable(s.cards, pokemonAt(s.me, s.source)!) ? null : "It can't devolve"),
  use(ctx) {
    const top = removeTopEvolution(ctx.state, ctx.me, ctx.source);
    ctx.me.hand.push(top);
    clearOnLeavingActive(ctx.source);
    ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} went back into the hand.`);
  },
};
/** The player's Pokémon SP, by target, with damage counters on them (`damaged`) or not. */
const spTargets = (s: PowerSituation, damaged = false): Target[] =>
  ownTargets(s.me).filter((t) => {
    const p = pokemonAt(s.me, t)!;
    return isPokemonSP(inPlayDef(s.cards, p).name) && (!damaged || p.damage > 0);
  });
/** Pokémon Tool and Technical Machine cards attached to a Pokémon (Magical Return). */
const returnable = (p: InPlayPokemon) => (p.attached ?? []).filter((a) => a.tool || trainerEffect(a.card.defId)?.technicalMachine);

export const PL2_POWERS: Record<string, PowerEffect> = {
  // Arcanine – Flare Condition: with a Fire Energy attached, no Weakness.
  'pl2-1': { ...POKE_BODY, noWeaknessWith: 'fire' },
  // Darkrai G – Eerie Aura: a damage counter on each of the opponent's Pokémon still Asleep between turns.
  'pl2-3': {
    ...POKE_BODY,
    checkup(state, owner, _pokemon, opp) {
      const p = opp.active;
      if (!p || p.condition !== 'asleep') return;
      p.damage += 10;
      addLog(state, `Eerie Aura put a damage counter on ${pokemonName(state, p)}.`, owner.id);
    },
  },
  // Flygon – Rainbow Float: its player's Pokémon of a type of a basic Energy card on Flygon retreat for free (retreatBodies).
  'pl2-5': { ...POKE_BODY, rainbowFloat: true },
  // Jirachi – Final Wish: Knocked Out by attack damage during the opponent's turn, a card from the deck into the hand.
  'pl2-7': {
    onAttackDamage(ctx, pokemon) {
      if (pokemon.damage < inPlayDef(ctx.state.cards, pokemon).hp || !ctx.opp.deck.length) return;
      (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Final Wish', kind: 'pickFromDeck', filter: 'any', optional: true, afterAttack: true });
    },
  },
  // Lucario GL – Boundary Aura: every Weakness, both players', is ×2 (attacks.ts).
  'pl2-8': { ...POKE_BODY, boundaryAura: true },
  // Shiftry – Unlucky Wind: as the Active Pokémon, the opponent's coins during their turn are tails (flipCoin).
  'pl2-13': { ...POKE_BODY, unluckyWind: true },
  // Beedrill – Flutter Wings: a Grass Pokémon from the deck into the hand, shown.
  'pl2-15': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Flutter Wings', filter: 'pokemonType', type: 'grass', reveal: true }),
  },
  // Flareon, Jolteon, Vaporeon – Undevelop.
  'pl2-19': undevelop,
  'pl2-26': undevelop,
  'pl2-34': undevelop,
  // Gastrodon East Sea – Sticky Hold: switched or retreated to the Bench, its Energy cards may move to the new Active Pokémon.
  'pl2-21': { ...POKE_BODY, stickyHold: true },
  // Hippowdon – Sand Cover: as the Active Pokémon, a damage counter on each of the opponent's Pokémon LV.X between turns.
  'pl2-25': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const p of [opp.active, ...opp.bench]) {
        if (!p || inPlayDef(state.cards, p).stage !== 'levelUp') continue;
        p.damage += 10;
        addLog(state, `Sand Cover put a damage counter on ${pokemonName(state, p)}.`, owner.id);
      }
    },
  },
  // Mamoswine GL – Icy Aura: as the Active Pokémon, a damage counter on each Active Pokémon but Water ones between turns.
  'pl2-27': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const side of [owner, opp]) {
        const p = side.active;
        if (!p || hasType(inPlayDef(state.cards, p), 'water')) continue;
        p.damage += 10;
        addLog(state, `Icy Aura put a damage counter on ${pokemonName(state, p)}.`, side.id);
      }
    },
  },
  // Nidoking – Territoriality: its player's Active Pokémon damaged by the opponent's attack, 2 damage counters on the attacker (attacks.ts).
  'pl2-29': { ...POKE_BODY, territoriality: true },
  // Nidoqueen – Maternal Comfort: a damage counter off each of its player's Pokémon between turns (one Maternal Comfort).
  'pl2-30': {
    ...POKE_BODY,
    checkup(state, owner, _pokemon, _opp, done) {
      const key = `Maternal Comfort ${owner.id}`;
      if (done.has(key)) return;
      done.add(key);
      for (const p of [owner.active, ...owner.bench]) if (p?.damage) p.damage -= 10;
      addLog(state, 'Maternal Comfort removed a damage counter from each of your Pokémon.', owner.id);
    },
  },
  // Vespiquen E4 – Royal Gain: a Grass Energy card attached from the hand to it, a damage counter off it.
  'pl2-35': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (!pokemon.damage || !energyCardOf(state.cards, energy, 'grass')) return;
      pokemon.damage -= 10;
      addLog(state, `Royal Gain removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Walrein – Gather Ice: as it evolves from the hand, any Water Energy cards from the hand attached to it.
  'pl2-36': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || pokemon.levelUpFrom || !owner.hand.some((c) => energyCardOf(state.cards, c, 'water'))) return;
      const target = owner.active === pokemon ? 'active' : owner.bench.indexOf(pokemon);
      state.pendingChoice = { player: owner.id, source: 'Gather Ice', kind: 'attachFromHand', types: ['water'], count: owner.hand.length, target };
    },
  },
  // Glaceon – Frost Wind: as the Active Pokémon, 10 less attack damage to its player's Pokémon (attacks.ts).
  'pl2-41': { ...POKE_BODY, frostWind: true },
  // Hippowdon E4 – Sand Armor: with a Fighting Energy attached, 10 less attack damage to it (attacks.ts).
  'pl2-42': { ...POKE_BODY, damageReductionWith: { amount: 10, type: 'fighting' } },
  // Leafeon – Energy Refresh: as the Active Pokémon, an Energy card attached from the hand takes 2 damage counters off its Pokémon (energyFromHand).
  'pl2-45': { ...POKE_BODY, energyRefresh: true },
  // Sharpedo – Energy Shark: as the Active Pokémon damaged by the opponent's attack, heads, an Energy card of the attacker discarded.
  'pl2-49': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon || !ctx.me.active || !ctx.me.active.energy.some((e) => !e.provides) || !ctx.oppFlip()) return;
      (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Energy Shark', kind: 'removeEach', targets: ['active'], afterAttack: true });
    },
  },
  // Starmie – Aqua Recycle: a Water Energy card from the discard pile into the hand, shown.
  'pl2-50': {
    oncePerTurn: true,
    blocked: (s) => (s.me.discard.some((c) => energyCardOf(s.cards, c, 'water')) ? null : 'You have no Water Energy cards in your discard pile'),
    use: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'Aqua Recycle', count: 1, filter: 'waterEnergy', reveal: true }),
  },
  // Kakuna – Exoskeleton: as EX Sandstorm Kakuna's.
  'pl2-66': EX2_POWERS['ex2-39']!,
  // Kecleon – Colorful Body: every type (refreshHideout).
  'pl2-67': { ...POKE_BODY, colorfulBody: true },
  // Munchlax – Baby Evolution: as Diamond & Pearl's.
  'pl2-69': DP1_POWERS['dp1-33']!,
  'pl2-70': DP1_POWERS['dp1-33']!,
  // Quagsire GL – Submerge: as EX Emerald Lanturn's.
  'pl2-76': EX9_POWERS['ex9-49']!,
  // Snorlax – Bad Sleeping Habits: while it's Asleep, the opponent's Active Pokémon can't retreat.
  'pl2-81': { ...POKE_BODY, badSleep: true },
  // Turtwig GL – Overgrow: with 60 HP or less left, 30 more to the Defending Pokémon (attacks.ts).
  'pl2-85': { ...POKE_BODY, overgrow: true },
  // Weezing – Camouflage Gas: Knocked Out while Confused, no Prize card for the opponent.
  'pl2-87': { ...POKE_BODY, camouflageGas: true },
  // Alakazam E4 LV.X – Damage Switch: any number of times, a damage counter moved from one Pokémon SP to another.
  'pl2-103': {
    blocked: (s) => (spTargets(s, true).length && spTargets(s).length > 1 ? null : 'You need a Pokémon SP with damage counters and another Pokémon SP'),
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: spTargets(s, true), prompt: 'Damage Switch: choose a Pokémon SP to move a damage counter from' },
      { kind: 'ownPokemon', field: 'to', options: spTargets(s).filter((t) => t !== c.from), prompt: 'Choose the Pokémon SP to move it to' },
    ],
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!from?.damage || !to || from === to) return;
      from.damage -= 10;
      to.damage += 10;
      ctx.log(`Moved a damage counter from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Floatzel GL LV.X – Water Rescue: the player's Water Pokémon (not Floatzel GL) Knocked Out by the opponent's attack may go back into the hand with its cards (resolveKnockouts).
  'pl2-104': { ...POKE_BODY, waterRescue: true },
  // Flygon LV.X – Wind Erosion: as the Active Pokémon, the top card of the opponent's deck discarded between turns.
  'pl2-105': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      const top = opp.deck.shift();
      if (!top) return;
      opp.discard.push(top);
      addLog(state, `Wind Erosion discarded ${lookupCard(state.cards, top.defId).name} from the top of the deck.`, opp.id);
    },
  },
  // Gallade E4 LV.X – Blade Storm: as it levels up, a damage counter on each of the opponent's Pokémon.
  'pl2-106': onLevelUp('evoThunder', 'Blade Storm'),
  // Hippowdon LV.X – Sand Reset: once a game, each player's Energy, Pokémon Tool and other Trainer cards in play shuffled into their deck.
  'pl2-107': {
    oncePerTurn: true,
    blocked: (s) => (s.me.powerTurns?.['Sand Reset'] !== undefined ? 'You already used Sand Reset this game' : null),
    use(ctx) {
      ctx.me.powerTurns = { ...ctx.me.powerTurns, 'Sand Reset': ctx.state.turn };
      for (const side of [ctx.me, ctx.opp]) {
        const cards = [side.active, ...side.bench].flatMap((p) => {
          if (!p) return [];
          const gone = [...p.energy.filter((e) => lookupCard(ctx.state.cards, e.defId).kind === 'energy'), ...(p.attached ?? []).map((a) => a.card)];
          p.energy = p.energy.filter((e) => lookupCard(ctx.state.cards, e.defId).kind !== 'energy');
          p.attached = [];
          return gone.map(({ provides: _, converted: _c, windless: _w, ...c }) => c);
        });
        if (ctx.state.stadium?.owner === side.id) {
          cards.push(ctx.state.stadium.card);
          ctx.state.stadium = null;
        }
        [side.deck, ctx.state.rngState] = shuffle([...side.deck, ...cards], ctx.state.rngState);
        addLog(ctx.state, `Sand Reset: ${cards.length} card${cards.length === 1 ? '' : 's'} in play shuffled into the deck.`, side.id);
      }
    },
  },
  // Infernape E4 LV.X – Intimidating Roar: the opponent switches their Active Pokémon with one of their Benched Pokémon.
  'pl2-108': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    use(ctx) {
      const slots = ctx.opp.bench.flatMap((q, i) => (q ? [i] : []));
      if (slots.length) ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Intimidating Roar', kind: 'switchIn' };
    },
  },
  // Luxray GL LV.X – Bright Look: as it levels up, the Defending Pokémon switched with one of the opponent's Benched Pokémon.
  'pl2-109': onLevelUp('brightLook', 'Bright Look'),
  // Mismagius GL LV.X – Magical Return: any number of times, a Pokémon Tool or Technical Machine back into the hand.
  'pl2-110': {
    blocked: (s) => (ownTargets(s.me).some((t) => returnable(pokemonAt(s.me, t)!).length) ? null : 'None of your Pokémon has a Pokémon Tool or Technical Machine attached'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => returnable(pokemonAt(s.me, t)!).length), prompt: 'Magical Return: choose one of your Pokémon' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: returnable(from).map((a) => a.card), prompt: 'Choose the card to return to your hand' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const card = from ? returnable(from).find((a) => a.card.uid === ctx.choices.energyUid) : undefined;
      if (!from || !card) return;
      from.attached = from.attached!.filter((a) => a !== card);
      ctx.me.hand.push(card.card);
      ctx.log(`Returned ${lookupCard(ctx.state.cards, card.card.defId).name} to the hand.`);
    },
  },
  // Snorlax LV.X – Big Appetite: as the Active Pokémon, cards drawn until the hand has 6, then it's Asleep.
  'pl2-111': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Snorlax must be your Active Pokémon' : s.me.hand.length >= 6 ? 'You already have 6 cards in your hand' : null),
    use(ctx) {
      const drawn = ctx.me.deck.splice(0, Math.max(0, 6 - ctx.me.hand.length));
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
      afflictBetweenTurns(ctx.state, ctx.me.id, ctx.source, 'asleep');
    },
  },
  // The Rotom: their type until the end of the turn (Heat Shift as EX Dragon Frontiers').
  'pl2-RT1': shift('colorless', 'Colorless'),
  'pl2-RT2': shift('water', 'Water'),
  'pl2-RT3': EX15_POWERS['ex15-98']!,
  'pl2-RT4': shift('grass', 'Grass'),
  'pl2-RT5': shift('water', 'Water'),
};
