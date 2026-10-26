// Plasma Freeze (bw9) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Plasma Energy attached is counted with Plasma Storm's isPlasmaEnergy (plasmaEnergy); a Team Plasma Pokémon is one
// with Team Plasma on its card or Team Plasma Badge attached (isPlasmaPokemon); Fusion Flare and Fusion Bolt look for
// Reshiram and Zekrom by name (a Reshiram-EX isn't one, as Mewtwo-EX isn't Mewtwo); Vengeance counts Pokémon cards; Dragon
// Vortex counts Water and Lightning Energy cards, basic or Special (energyCardOf); Energy Bloom heals each of the player's Pokémon with any Energy attached, the attacker too; Vilify asks how many Pokémon to discard, then
// which (the same-card rule); Transfer Junk takes up to one of each kind, the player picking them from the discard pile.
// Implemented as printed, to ask (README: Generation 5): Lure Poison with no Benched Pokémon does nothing (there's no new
// Defending Pokémon to Poison); Tractorbeam with no Benched Pokémon does its 40 to the Defending Pokémon; Signs of Evolution
// takes Pokémon of different types (each of its type once, as Eevee's evolutions are).
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { hasType, isPokemonCard, lookupCard, namesMatch, type CardLibrary } from '../cards.js';
import { discardTool, energyPool, toolOf, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { hasSpecialCondition, inPlayDef, isPlasmaPokemon, pokemonName } from '../status.js';
import { benchedSlots, energyCards, inPlay, opponentBenchChoice, opponentTargets, same } from './common.js';
import { discardOwnEnergy, removeDefenderEnergy, shuffleIntoDeck } from './dp1.js';
import { isPlasmaEnergy } from './bw8-trainers.js';
import { DP6 } from './dp6.js';
import { copyAttack } from './ecard2.js';
import { EX1 } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { discardFree, reachesDefender } from './neo3.js';
import { healUpTo } from './si1.js';

/** How many Plasma Energy cards are attached to the Pokémon (Plasma Storm's Special Energy, by its name). */
export const plasmaEnergy = (cards: CardLibrary, p: InPlayPokemon) => p.energy.filter((e) => !e.windless && isPlasmaEnergy(cards, e)).length;

/** `more` more damage while the player has a Pokémon called `partner` on their Bench (Fusion Flare, Fusion Bolt). */
const fusion = (damage: number, more: number, partner: string): AttackEffect => ({
  run: (ctx) => void ctx.hit(damage + (ctx.me.bench.some((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, partner)) ? more : 0)),
});

/** The Defending Pokémon can't attack during the opponent's next turn. */
const cantAttack = (ctx: AttackContext) =>
  ctx.affectDefender((e) => {
    e.noAttack = ctx.turn + 1;
    ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
  });

/** The Energy cards in the attacking player's discard pile an attack may take (none while Allergic Pollen works). */
const discardEnergy = (s: AttackSituation) => (s.discardsLocked ? [] : s.ownDiscard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy'));

/** What kind of card it is, for Transfer Junk's one of each. */
const kindOf = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'energy' ? 'energy' : isPokemonCard(d) ? 'pokemon' : 'trainer';
};

/** Thundurus-EX – Raiden Knuckle: an Energy card from the discard pile to one of the player's Benched Team Plasma Pokémon. */
const raidenKnuckle: AttackEffect = {
  choices(s): ChoiceSpec[] {
    const bench = benchedSlots(s.ownBench).filter((i) => isPlasmaPokemon(s.cards, s.ownBench[i]!));
    const energy = discardEnergy(s);
    if (!bench.length || !energy.length) return [];
    return [
      { kind: 'ownDiscard', min: 1, max: 1, options: energy, prompt: 'Raiden Knuckle: choose an Energy card from your discard pile' },
      { kind: 'ownBench', options: bench, prompt: 'Attach it to one of your Benched Team Plasma Pokémon' },
    ];
  },
  run(ctx) {
    ctx.hit(30);
    const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids?.[0]);
    const to = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
    if (!card || !to || !isPlasmaPokemon(ctx.state.cards, to) || !discardFree(ctx)) return;
    ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
    to.energy.push(card);
    ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, to)}.`);
  },
};

/** Thundurus-EX – Thunderous Noise: with a Plasma Energy attached, an Energy card of the Defending Pokémon's discarded. */
const thunderousNoise: AttackEffect = {
  run(ctx) {
    ctx.hit(90);
    if (plasmaEnergy(ctx.state.cards, ctx.attacker)) removeDefenderEnergy(ctx, 1, 'Thunderous Noise');
  },
};

export const BW9: Record<string, Record<string, AttackEffect>> = {
  // Beedrill – Swift Sting: with full HP, 40 more and the Defending Pokémon is Confused and Poisoned.
  'bw9-3': {
    'Swift Sting': {
      run(ctx) {
        const full = ctx.attacker.damage === 0;
        ctx.hit(full ? 60 : 20);
        if (!full) return;
        ctx.inflict('confused');
        ctx.inflict('poisoned');
      },
    },
  },
  // Exeggutor – Blockade: the opponent can't play Supporter cards next turn.
  'bw9-5': {
    Blockade: {
      run(ctx) {
        ctx.hit(10);
        ctx.opp.noSupportersUntil = ctx.turn + 1;
        ctx.log("Blockade: your opponent can't play Supporter cards next turn.", ctx.opp.id);
      },
    },
  },
  // Sceptile – Energy Bloom: 20 off each of the player's Pokémon with any Energy attached.
  'bw9-8': {
    'Energy Bloom': {
      run(ctx) {
        ctx.hit(80);
        for (const p of inPlay(ctx.me)) if (p.energy.length) healUpTo(ctx, ctx.me, p, 20);
      },
    },
  },
  // Cacturne – Payback: with the opponent at 1 Prize card left, 60 more and an Energy of the Defending Pokémon's discarded.
  'bw9-10': {
    Payback: {
      run(ctx) {
        const last = ctx.opp.prizes.length === 1;
        ctx.hit(last ? 90 : 30);
        if (last) removeDefenderEnergy(ctx, 1, 'Payback');
      },
    },
  },
  // Flareon – Vengeance: 10 more for each Pokémon card in the player's discard pile.
  'bw9-12': { Vengeance: { run: (ctx) => void ctx.hit(20 + 10 * ctx.me.discard.filter((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId))).length) } },
  // Heatran-EX – Heat Boiler: 60 more with a Special Condition. Dynamite Press: with a Plasma Energy attached, 10 more for each
  // damage counter on the Defending Pokémon.
  'bw9-13': {
    'Heat Boiler': { run: (ctx) => void ctx.hit(hasSpecialCondition(ctx.attacker) ? 120 : 60) },
    'Dynamite Press': { run: (ctx) => void ctx.hit(80 + (plasmaEnergy(ctx.state.cards, ctx.attacker) ? Math.floor(ctx.defender.damage / 10) * 10 : 0)) },
  },
  // Reshiram – Fusion Flare: 40 more with Zekrom on the Bench.
  'bw9-17': { 'Fusion Flare': fusion(80, 40, 'Zekrom') },
  // Cryogonal – Call Sign: a Water Pokémon from the deck, shown. Cryofreeze: an Energy discarded from it; the Defending Pokémon
  // can't attack next turn.
  'bw9-30': {
    'Call Sign': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call Sign', filter: 'pokemonType', type: 'water', reveal: true, optional: true })) },
    Cryofreeze: {
      run(ctx) {
        ctx.hit(10);
        discardOwnEnergy(ctx, 1, 'Cryofreeze');
        cantAttack(ctx);
      },
    },
  },
  // Jolteon – Electri-Defuse: a Pokémon-EX can't attack next turn.
  'bw9-34': {
    'Electri-Defuse': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.defenderDef.pokemonEX) cantAttack(ctx);
      },
    },
  },
  // Pachirisu – Minor Errand-Running: as EX Ruby & Sapphire Skitty's.
  'bw9-37': { 'Minor Errand-Running': same(() => EX1['ex1-44']?.['Minor Errand-Running']) },
  // Thundurus-EX – Raiden Knuckle; Thunderous Noise.
  'bw9-38': { 'Raiden Knuckle': raidenKnuckle, 'Thunderous Noise': thunderousNoise },
  // Zekrom – Fusion Bolt: 40 more with Reshiram on the Bench.
  'bw9-39': { 'Fusion Bolt': fusion(80, 40, 'Reshiram') },
  // Nidoran ♂ – Hit Back: nothing without damage counters on it.
  'bw9-43': {
    'Hit Back': {
      run(ctx) {
        if (ctx.attacker.damage < 10) return ctx.log('Hit Back did nothing.');
        ctx.hit(30);
      },
    },
  },
  // Grimer – Lure Poison: heads, one of the opponent's Benched Pokémon (the player's pick) switched in, and Poisoned.
  'bw9-45': {
    'Lure Poison': {
      choices: (s) => opponentBenchChoice(s, "Lure Poison: choose one of your opponent's Benched Pokémon (heads: it's switched in and Poisoned)"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot] || !ctx.flip()) return;
        const before = ctx.opp.active;
        ctx.switchDefender(slot);
        if (ctx.opp.active !== before) ctx.inflict('poisoned');
      },
    },
  },
  // Muk – Poison Suction: 60 off it if the Defending Pokémon is Poisoned. Sludge Crash: coins until tails, an Energy of the
  // Defending Pokémon's discarded for each heads.
  'bw9-46': {
    'Poison Suction': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.opp.active?.poison) ctx.heal(60);
      },
    },
    'Sludge Crash': {
      run(ctx) {
        ctx.hit(80);
        let heads = 0;
        while (heads < 100 && ctx.flip()) heads++;
        removeDefenderEnergy(ctx, heads, 'Sludge Crash');
      },
    },
  },
  // Espeon – Shadow Ball: 40 to one of the opponent's Pokémon, with Weakness and Resistance for a Benched one too.
  'bw9-48': {
    'Shadow Ball': {
      choices: (s) => opponentTargets(s, 'Shadow Ball: choose one of your opponent\'s Pokémon to do 40 damage to'),
      run(ctx) {
        const target: Target = ctx.choices.oppTarget ?? 'active';
        if (target === 'active') ctx.hit(40);
        else ctx.damageBenched(ctx.opp, target, 40, { weakness: true });
      },
    },
  },
  // Deoxys-EX – Helix Force: with a Plasma Energy attached, 30 more for each Energy attached to the Defending Pokémon.
  'bw9-53': { 'Helix Force': { run: (ctx) => void ctx.hit(30 + (plasmaEnergy(ctx.state.cards, ctx.attacker) ? 30 * energyPool(ctx.defender, ctx.state.cards).length : 0)) } },
  // Yamask – Transfer Pain: as Legends Awakened Spiritomb's.
  'bw9-54': { 'Transfer Pain': same(() => DP6['dp6-16']?.['Transfer Pain']) },
  // Cofagrigus – Slap of Misfortune: the opponent's coins are all tails next turn.
  'bw9-56': {
    'Slap of Misfortune': {
      run(ctx) {
        ctx.hit(70);
        ctx.opp.tailsUntil = ctx.turn + 1;
        ctx.log("Slap of Misfortune: your opponent's coin flips are all tails next turn.", ctx.opp.id);
      },
    },
  },
  // Nidoking – Lovestrike: 40 more for each Nidoqueen on the player's Bench.
  'bw9-58': { Lovestrike: { run: (ctx) => void ctx.hit(20 + 40 * ctx.me.bench.filter((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Nidoqueen')).length) } },
  // Weavile – Vilify: any number of Pokémon discarded from the hand, 30 for each.
  'bw9-66': {
    Vilify: {
      choices(s): ChoiceSpec[] {
        const n = (s.ownHand ?? []).filter((c) => isPokemonCard(lookupCard(s.cards, c.defId))).length;
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Vilify: how many Pokémon do you discard from your hand (30 damage each)?' }] : [];
      },
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, ctx.me.hand.filter((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId))).length);
        ctx.hit(30 * n);
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Vilify', count: n, only: 'pokemon' });
      },
    },
  },
  // Bisharp – Dragon Slayer: 40 more against a Dragon Pokémon.
  'bw9-73': { 'Dragon Slayer': { run: (ctx) => void ctx.hit(hasType(ctx.defenderDef, 'dragon') ? 120 : 80) } },
  // Hydreigon – Tractorbeam: one of the opponent's Benched Pokémon switched in, then 40 to it. Obsidian Fang: the Defending
  // Pokémon's Pokémon Tools discarded before the damage.
  'bw9-78': {
    Tractorbeam: {
      choices: (s) => opponentBenchChoice(s, "Tractorbeam: choose one of your opponent's Benched Pokémon to switch in"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined && ctx.opp.bench[ctx.choices.benchSlot]) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.hit(40);
      },
    },
    'Obsidian Fang': {
      run(ctx) {
        const defender = ctx.opp.active;
        if (defender && toolOf(ctx.state.cards, defender) && reachesDefender(ctx)) {
          while (toolOf(ctx.state.cards, defender)) {
            ctx.log(`Discarded ${toolOf(ctx.state.cards, defender)!.name} from ${pokemonName(ctx.state, defender)}.`, ctx.opp.id);
            discardTool(ctx.state, ctx.opp, defender);
          }
        }
        ctx.hit(80);
      },
    },
  },
  // Kingdra – Dragon Vortex: 20 for each Water and Lightning Energy card in the discard pile, then they're shuffled into the deck.
  'bw9-84': {
    'Dragon Vortex': {
      run(ctx) {
        const cards = discardFree(ctx) ? ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy' && (energyCardOf(ctx.state.cards, c, 'water') || energyCardOf(ctx.state.cards, c, 'lightning'))) : [];
        ctx.hit(20 * cards.length);
        if (!cards.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !cards.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...cards], ctx.state.rngState);
        ctx.log(`Shuffled ${cards.length} Energy card${cards.length === 1 ? '' : 's'} from the discard pile into the deck.`);
      },
    },
  },
  // Raticate – Transfer Junk: a Team Plasma Pokémon, Trainer card and Energy card from the discard pile into the hand.
  'bw9-88': {
    'Transfer Junk': {
      choices(s): ChoiceSpec[] {
        const options = s.discardsLocked ? [] : s.ownDiscard.filter((c) => !!lookupCard(s.cards, c.defId).teamPlasma);
        return options.length ? [{ kind: 'ownDiscard', min: 0, max: Math.min(3, options.length), options, prompt: 'Transfer Junk: choose a Team Plasma Pokémon, Trainer card and Energy card from your discard pile' }] : [];
      },
      run(ctx) {
        if (!ctx.choices.discardUids?.length || !discardFree(ctx)) return;
        const kinds = new Set<string>();
        const taken = ctx.choices.discardUids.flatMap((uid) => {
          const card = ctx.me.discard.find((c) => c.uid === uid && lookupCard(ctx.state.cards, c.defId).teamPlasma);
          if (!card || kinds.has(kindOf(ctx.state.cards, card))) return [];
          kinds.add(kindOf(ctx.state.cards, card));
          return [card];
        });
        ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
        ctx.me.hand.push(...taken);
        if (taken.length) ctx.log(`Put ${taken.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the discard pile into the hand.`);
      },
    },
  },
  // Eevee – Signs of Evolution: up to 3 Pokémon of different types that evolve from Eevee, shown.
  'bw9-90': {
    'Signs of Evolution': {
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'evolvesFrom', name: 'Eevee', reveal: true, optional: true, count: 3, distinct: 'type' })),
    },
  },
  // Hoothoot – Dual Draw: each player draws 2 cards.
  'bw9-91': {
    'Dual Draw': {
      run(ctx) {
        ctx.draw(2);
        const drawn = ctx.opp.deck.splice(0, 2);
        ctx.opp.hand.push(...drawn);
        ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, ctx.opp.id);
      },
    },
  },
  // Noctowl – Powerful Vision: 10 for each card in the opponent's hand.
  'bw9-92': { 'Powerful Vision': { run: (ctx) => void ctx.hit(10 * ctx.opp.hand.length) } },
  // Miltank – Max Milk: every damage counter off one of the player's Pokémon, then all Energy discarded from Miltank.
  'bw9-93': {
    'Max Milk': {
      choices: (s) => [{ kind: 'ownPokemon', options: [...(['active'] as Target[]), ...benchedSlots(s.ownBench)], prompt: 'Max Milk: choose one of your Pokémon to heal' }],
      run(ctx) {
        const t = ctx.choices.ownTarget ?? 'active';
        const p = t === 'active' ? ctx.me.active : ctx.me.bench[t];
        if (p) healUpTo(ctx, ctx.me, p, p.damage);
        discardOwn(ctx, energyCards(ctx.attacker));
      },
    },
  },
  // Kecleon – Imittack: one of the Defending Pokémon's attacks, with the Energy for it.
  'bw9-94': { Imittack: copyAttack('Imittack', { needsEnergy: true, flip: false }) },
  // Staraptor – Strong Breeze: the Defending Pokémon and its cards shuffled into the opponent's deck.
  'bw9-97': {
    'Strong Breeze': {
      run(ctx) {
        if (ctx.opp.active && reachesDefender(ctx)) shuffleIntoDeck(ctx, ctx.opp, ctx.opp.active);
      },
    },
  },
  // Tornadus-EX – Windfall: the hand shuffled into the deck, then 6 cards drawn. Jet Blast: 30 more for each Plasma Energy.
  'bw9-98': {
    Windfall: {
      run(ctx) {
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand.splice(0)], ctx.state.rngState);
        ctx.log('Shuffled the hand into the deck.');
        ctx.draw(6);
      },
    },
    'Jet Blast': { run: (ctx) => void ctx.hit(60 + 30 * plasmaEnergy(ctx.state.cards, ctx.attacker)) },
  },
  // Thundurus-EX (Secret Rare): as bw9-38.
  'bw9-110': { 'Raiden Knuckle': raidenKnuckle, 'Thunderous Noise': thunderousNoise },
};

