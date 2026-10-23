// EX Dragon Frontiers (ex15) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Holon Veil makes its player's Pokémon δ for both players' cards; Imprison markers stay until the
// Pokémon leaves play (or Tropical Heal), Benched Pokémon too; Battle Aura, Extra Feather and Extra Smoke add up.
// From the text: Snorlax δ has a Poké-Body (Bedhead, working while it's Asleep) and a Poké-Power (Dozing, as its player's
// Active Pokémon); Volunteer evolves Vulpix again from the deck (a Poké-Power: no first-turn limit, but its evolution for the
// turn); Evolutionary Call and Dig up are "up to"; Tropical Heal is always used; Fellow Boost ends the turn; Sharing is one a
// turn, whichever Milotic δ, as Supernatural.
import { isBasicEnergy, lookupCard, namesMatch, type PokemonCardDef } from '../cards.js';
import { counts, energyPool, evolvesOnto } from '../engine.js';
import { attachBlocked, energyFromHand, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, clearSpecialConditions, inPlayDef, pokemonName } from '../status.js';
import { babyEvolution, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { EX7_POWERS } from './ex7-powers.js';
import { EX11_POWERS } from './ex11-powers.js';
import { EX12_POWERS } from './ex12-powers.js';
import { countersBetween } from './ex6-powers.js';

/** "When you play this from your hand to evolve 1 of your Pokémon, you may search your deck for up to 3 Basic Pokémon or Evolution cards…". */
export const evolutionaryCall: PowerEffect = {
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length && owner.deck.length) state.pendingChoice = { player: owner.id, source: 'Evolutionary Call', kind: 'pickFromDeck', filter: 'pokemon', count: 3, optional: true, reveal: true };
  },
};

/** "Once during your turn, you may attach a basic Energy card from your hand to 1 of your …" (Extra Boost, Fellow Boost). */
const attachBoost = (names: (d: PokemonCardDef) => boolean, what: string, endsTurn: boolean): PowerEffect => {
  const basics = (s: PowerSituation) => s.me.hand.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));
  const targets = (s: PowerSituation) => ownTargets(s.me).filter((t) => names(inPlayDef(s.cards, pokemonAt(s.me, t)!)));
  return {
    oncePerTurn: true,
    blocked: (s) => (!basics(s).length ? 'No basic Energy cards in your hand' : targets(s).length ? null : `You have no ${what} in play`),
    choices: (s, c) => [
      { kind: 'handCard', field: 'cardUid', options: basics(s), prompt: 'Choose a basic Energy card from your hand' },
      ...(c.cardUid ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: targets(s), prompt: `Choose one of your ${what} to attach it to` }] : []),
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
      if (endsTurn) {
        ctx.log('The turn ends.');
        ctx.state.endTurnNow = true;
      }
    },
  };
};

const LATI = ['Latias', 'Latias ex', 'Latios', 'Latios ex'];

export const EX15_POWERS: Record<string, PowerEffect> = {
  // Ampharos δ – Holon Veil (refreshHideout, isDelta).
  'ex15-1': { ...POKE_BODY, holonVeil: true },
  // Feraligatr δ – Battle Aura: 10 more for the player's δ Pokémon (attacks.ts).
  'ex15-2': { ...POKE_BODY, allyMore: 'delta' },
  // Heracross δ – Shining Horn: as EX Delta Species Skarmory's.
  'ex15-3': EX11_POWERS['ex11-55']!,
  // Meganium δ – Evolutionary Call.
  'ex15-4': evolutionaryCall,
  // Milotic δ – Sharing: once a turn (one Sharing a turn), a Supporter card's effect from the opponent's hand (as Supernatural).
  'ex15-5': {
    blocked: (s) => (s.me.powerTurns?.Sharing === s.turn ? 'Sharing has already been used this turn' : s.counts.oppHand ? null : "Your opponent's hand is empty"),
    use(ctx) {
      (ctx.me.powerTurns ??= {}).Sharing = ctx.state.turn;
      ctx.pend({ kind: 'supernatural', source: 'Sharing' });
    },
  },
  // Nidoqueen δ – Invitation: once a turn, a Basic Pokémon or Evolution card from the deck, shown.
  'ex15-7': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Invitation', filter: 'pokemon', reveal: true }),
  },
  // Ninetales δ – Volunteer: once a turn, 4 damage counters off it, it's discarded from Vulpix, and a Ninetales or Ninetales ex from the deck goes onto Vulpix.
  'ex15-8': {
    oncePerTurn: true,
    blocked: (s) => (pokemonAt(s.me, s.source)?.evolvedFrom.length ? null : 'Ninetales must be on a Vulpix'),
    use(ctx) {
      const p = ctx.source;
      p.damage = Math.max(0, p.damage - 40);
      const top = p.card;
      p.card = p.evolvedFrom.pop()!;
      ctx.me.discard.push(top);
      ctx.log(`Removed 4 damage counters and discarded ${lookupCard(ctx.state.cards, top.defId).name}: it's ${pokemonName(ctx.state, p)} again.`);
      const current = lookupCard(ctx.state.cards, p.card.defId);
      const names = [...new Set(ctx.me.deck.map((c) => lookupCard(ctx.state.cards, c.defId)).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && evolvesOnto(d, current) && ['Ninetales', 'Ninetales ex'].some((n) => namesMatch(d.name, n) || d.name === n)).map((d) => d.name))];
      if (names.length) ctx.pend({ kind: 'evolveFromDeck', source: 'Volunteer', target: ctx.sourceTarget, names });
    },
  },
  // Pinsir δ – Armor: 30 less while the opponent has 5 or more cards in the hand.
  'ex15-9': { ...POKE_BODY, handArmor: true },
  // Snorlax δ – Bedhead (Poké-Body): still Asleep after the checkup, 2 damage counters on the opponent's Active Pokémon. Dozing
  // (Poké-Power): once a turn, as the Active Pokémon, 2 damage counters off it, and it's now Asleep.
  'ex15-10': {
    ...POKE_BODY,
    usePoke: true,
    powerName: 'Dozing',
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Snorlax must be your Active Pokémon' : null),
    use(ctx) {
      ctx.source.damage = Math.max(0, ctx.source.damage - 20);
      ctx.source.condition = 'asleep';
      ctx.log(`Removed 2 damage counters from ${pokemonName(ctx.state, ctx.source)}; it's now Asleep.`);
    },
    checkup(state, owner, pokemon, opp) {
      if (pokemon.condition !== 'asleep' || !opp.active) return;
      countersBetween(state, opp, opp.active, 2, 'Bedhead');
    },
  },
  // Typhlosion δ – Shady Move: as EX Legend Maker Banette ex's.
  'ex15-12': EX12_POWERS['ex12-85']!,
  // Cloyster δ – Solid Shell (attacks.ts).
  'ex15-14': { ...POKE_BODY, deltaBenchShield: true },
  // Dewgong δ – Delta Protection.
  'ex15-15': { ...POKE_BODY, deltaGuard: 40 },
  // Jynx δ – Stages of Evolution: as an Evolved Pokémon, the player's Fire and Psychic Pokémon retreat for 1 less (retreatBodies).
  'ex15-17': { ...POKE_BODY, evolvedOnly: true, retreatLessFor: { types: ['fire', 'psychic'] } },
  // Ledian δ – Prowl: as EX Delta Species Persian's.
  'ex15-18': EX11_POWERS['ex11-50']!,
  // Mantine δ – Power Circulation: as EX Legend Maker Sealeo's.
  'ex15-20': EX12_POWERS['ex12-43']!,
  // Quagsire δ – Dig up: evolving from the hand, up to 2 Pokémon Tool cards from the discard pile, shown.
  'ex15-21': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length && owner.discard.some((c) => lookupCard(state.cards, c.defId).kind === 'trainer')) state.pendingChoice = { player: owner.id, source: 'Dig up', kind: 'discardToHand', count: 2, filter: 'tool', reveal: true };
    },
  },
  // Tropius δ – Tropical Heal: put onto the Bench from the hand, every Special Condition and marker off the player's Pokémon.
  'ex15-23': {
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length || !owner.bench.includes(pokemon)) return;
      for (const p of [owner.active, ...owner.bench]) {
        if (!p) continue;
        clearSpecialConditions(p);
        delete p.imprisoned;
        delete p.shockwave;
      }
      addLog(state, 'Tropical Heal: removed every Special Condition, Imprison marker and Shock-wave marker from your Pokémon.', owner.id);
    },
  },
  // Vibrava δ – Psychic Wing: with Psychic Energy attached, its Retreat Cost is 0 (a Poké-Body on the card; TCGdex says Poké-Power).
  'ex15-24': freeRetreat((pokemon, cards) => energyPool(pokemon, cards).some((e) => counts(e, 'psychic'))),
  // Xatu δ – Extra Feather: 10 more for the player's Stage 2 Pokémon-ex (a Poké-Body on the card; TCGdex says Poké-Power).
  'ex15-25': { ...POKE_BODY, allyMore: 'stage2ex' },
  // Electabuzz δ – Power of Evolution: once a turn, as an Evolved Pokémon, the bottom card of the deck drawn.
  'ex15-29': {
    oncePerTurn: true,
    blocked: (s) => (!pokemonAt(s.me, s.source)?.evolvedFrom.length ? 'Electabuzz must be an Evolved Pokémon' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const card = ctx.me.deck.pop();
      if (card) ctx.me.hand.push(card);
      ctx.log('Drew the bottom card of the deck.');
    },
  },
  // Swellow δ – Extra Wing (retreatBodies).
  'ex15-40': { ...POKE_BODY, extraWing: true },
  // Elekid δ, Smoochum δ – Baby Evolution.
  'ex15-48': babyEvolution('Electabuzz'),
  'ex15-64': babyEvolution('Jynx'),
  // Altaria ex δ – Extra Boost: once a turn, a basic Energy card from the hand to one of the player's Stage 2 Pokémon-ex.
  'ex15-90': attachBoost((d) => !!d.ex && d.stage === 'stage2', 'Stage 2 Pokémon-ex', false),
  // Flygon ex δ – Sand Damage: as EX Team Rocket Returns Dark Tyranitar's.
  'ex15-92': EX7_POWERS['ex7-20']!,
  // Gardevoir ex δ – Imprison: once a turn, as the Active Pokémon, an Imprison marker on one of the opponent's Pokémon.
  'ex15-93': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Gardevoir ex must be your Active Pokémon' : null),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: ownTargets(s.opp), prompt: "Choose one of your opponent's Pokémon to put an Imprison marker on" }],
    use(ctx) {
      const p = ctx.choices.oppTo === undefined ? null : pokemonAt(ctx.opp, ctx.choices.oppTo);
      if (!p) return;
      p.imprisoned = true;
      ctx.log(`Put an Imprison marker on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Kingdra ex δ – Extra Smoke (attacks.ts).
  'ex15-94': { ...POKE_BODY, extraSmoke: true },
  // Latias ex δ – Fellow Boost: once a turn, a basic Energy card from the hand to the player's Latias or Latios; the turn ends.
  'ex15-95': attachBoost((d) => LATI.some((n) => namesMatch(d.name, n) || d.name === n), 'Latias or Latios', true),
  // Latios ex δ – Link Wing: the player's Latias and Latios retreat for free.
  'ex15-96': { ...POKE_BODY, familyBonds: LATI },
  // Rayquaza ex δ – Rage Aura: its attacks' cost (costNow, ex15.ts).
  'ex15-97': { ...POKE_BODY },
  // Salamence ex δ – Type Shift: once a turn, Fire type until the end of the turn.
  'ex15-98': {
    oncePerTurn: true,
    use(ctx) {
      ctx.source.typesCopied = ['fire'];
      ctx.log(`${pokemonName(ctx.state, ctx.source)} is Fire type until the end of the turn.`);
    },
  },
};
