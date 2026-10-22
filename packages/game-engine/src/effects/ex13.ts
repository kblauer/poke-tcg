// EX Holon Phantoms (ex13) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: Harsh Fluid's damage counters go only on the Pokémon still Active at the end of the opponent's next
// turn (as Spiky Shell's); Zzzap hits every Pokémon with a Poké-Power or Poké-Body printed, working or not.
// From the text: "a Supporter card in play" is one played this turn; Fossil Charge discards the first Fossil in the hand;
// Metallic Thunder and Devo Crush ask first whether to discard; Energy Loop returns 2 Energy cards (the player's pick);
// Delta Reduction is before Weakness and Resistance, Crystal Laser's 40 more for whichever Deoxys is Active next turn;
// Super Psywave counts the Energy provided; Mind Play looks at a card at random.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, isTrainerCard } from '../cards.js';
import { energyPool, type InPlayPokemon } from '../engine.js';
import { nextRandom } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, headsUntilTails, opponentBenchChoice } from './common.js';
import { discardAtRandom } from './ex1.js';
import { discardOwn, energyCardOf, inPlay } from './ex2.js';
import { snipe } from './ex6.js';
import { EX7 } from './ex7.js';
import { chooseOpponents } from './ex8.js';
import { guardNext } from './ex10.js';
import { devolveIntoDeck, foresight, lateCounters, same } from './ex12.js';
import { discardFree } from './neo3.js';
import { healUpTo } from './si1.js';

/** The player's δ Pokémon in play. */
const deltas = (ctx: AttackContext) => inPlay(ctx.me).filter((p) => / δ$/.test(inPlayDef(ctx.state.cards, p).name)).length;

/** A Stadium with Holon in its name is in play. */
const holonStadium = (ctx: AttackContext) => !!ctx.state.stadium && lookupCard(ctx.state.cards, ctx.state.stadium.card.defId).name.includes('Holon');

/** The Pokémon has a Holon Energy card attached. */
const holonOn = (ctx: AttackContext, p: InPlayPokemon) => p.energy.some((e) => !e.provides && !e.windless && lookupCard(ctx.state.cards, e.defId).name.startsWith('Holon Energy'));

/** The player played a Supporter card this turn (it's "in play"). */
const supporterInPlay = (ctx: AttackContext) => ctx.me.supporterTurn === ctx.turn;

/** The Fossil Trainer cards Fossil Charge can discard. */
const FOSSILS = ['Claw Fossil', 'Mysterious Fossil', 'Root Fossil', 'Holon Fossil'];

/** The Omanyte and Kabuto lines (Vengeful Spikes). */
const OMANYTE_KABUTO = ['Omanyte', 'Omastar', 'Kabuto', 'Kabutops', 'Kabutops ex'];

/** A printed Poké-Power or Poké-Body (Zzzap). */
const hasPower = (ctx: AttackContext, p: InPlayPokemon) => !!inPlayDef(ctx.state.cards, p).power;

export const EX13: Record<string, Record<string, AttackEffect>> = {
  // Armaldo δ – Delta Edge: 20 instead of 70 with a Supporter card in play; Fossil Charge: may discard a Fossil from the hand
  // for 30 to one of the opponent's Benched Pokémon.
  'ex13-1': {
    'Delta Edge': { run: (ctx) => void ctx.hit(supporterInPlay(ctx) ? 20 : 70) },
    'Fossil Charge': {
      choices(s): ChoiceSpec[] {
        const bench = opponentBenchChoice(s, "If you discard a Fossil, choose one of your opponent's Benched Pokémon to do 30 damage to");
        return [{ kind: 'boost', options: [true, false], prompt: 'Discard a Claw, Mysterious, Root or Holon Fossil from your hand?' }, ...bench];
      },
      run(ctx) {
        ctx.hit(50);
        const fossil = ctx.choices.boost && ctx.me.hand.find((c) => FOSSILS.includes(lookupCard(ctx.state.cards, c.defId).name));
        if (!fossil) return;
        ctx.me.hand = ctx.me.hand.filter((c) => c !== fossil);
        ctx.me.discard.push(fossil);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, fossil.defId).name} from the hand.`);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 30);
      },
    },
  },
  // Cradily δ – Harsh Fluid: 5 damage counters at the end of the opponent's next turn.
  'ex13-2': { 'Harsh Fluid': lateCounters(20, 5) },
  // Deoxys δ – Energy Loop: 2 Energy cards back to the hand; Delta Reduction: 30 less damage to it next turn, before Weakness
  // and Resistance; Crystal Laser: 40 more for its attacks next turn.
  'ex13-3': {
    'Energy Loop': {
      choices(s): ChoiceSpec[] {
        const own = s.attacker.energy.filter((e) => !e.provides);
        return own.length > 2 ? [{ kind: 'ownEnergy', count: 2, options: own, prompt: 'Choose 2 Energy cards to return to your hand' }] : [];
      },
      run(ctx) {
        ctx.hit(60);
        const own = ctx.attacker.energy.filter((e) => !e.provides);
        const back = own.length > 2 ? own.filter((e) => ctx.choices.energyUids?.includes(e.uid)) : own;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !back.includes(e));
        ctx.me.hand.push(...back);
        if (back.length) ctx.log(`Returned ${back.length} Energy card${back.length === 1 ? '' : 's'} to the hand.`);
      },
    },
  },
  'ex13-4': {
    'Delta Reduction': {
      run(ctx) {
        ctx.hit(30);
        (ctx.attacker.effects ??= {}).reduceBefore = { amount: 30, until: ctx.turn + 1 };
        ctx.log(`Damage to ${ctx.attackerDef.name} is reduced by 30 next turn.`);
      },
    },
  },
  'ex13-5': {
    'Crystal Laser': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).nextTurnMore = { amount: 40, turn: ctx.turn + 2 };
        ctx.log(`${ctx.attackerDef.name}'s attacks do 40 more next turn.`);
      },
    },
  },
  // Kabutops δ – Vital Drain: if the Defending Pokémon is Knocked Out, every Special Condition and 7 damage counters off it.
  'ex13-9': {
    'Vital Drain': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.defender.damage < inPlayDef(ctx.state.cards, ctx.defender).hp) return;
        const p = ctx.attacker;
        p.condition = null;
        p.poison = 0;
        p.burned = false;
        delete p.paralyzedTurn;
        healUpTo(ctx, ctx.me, p, 70);
      },
    },
  },
  // Omastar δ – Vengeful Spikes: 10 more for each Omanyte line and Kabuto line card in the discard pile, at most 60 more.
  'ex13-13': {
    'Vengeful Spikes': {
      run(ctx) {
        const n = ctx.me.discard.filter((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'pokemon' && !d.trainerText && OMANYTE_KABUTO.some((name) => namesMatch(d.name, name));
        }).length;
        ctx.hit(30 + Math.min(60, 10 * n));
      },
    },
  },
  // Pidgeot δ – Rotating Claws: as EX Team Rocket Returns' (an Energy card discarded, another from the discard pile attached).
  'ex13-14': { 'Rotating Claws': same(() => EX7['ex7-101']?.['Rotating Claws']) },
  // Raichu δ – Zzzap: 20 to each Pokémon with a Poké-Power or Poké-Body, either player's, no Weakness or Resistance; Metallic
  // Thunder: may discard 2 Metal Energy for 90 instead of 50.
  'ex13-15': {
    Zzzap: {
      run(ctx) {
        if (hasPower(ctx, ctx.defender)) ctx.hit(20, { weakness: false, resistance: false });
        ctx.opp.bench.forEach((p, i) => p && hasPower(ctx, p) && ctx.damageBenched(ctx.opp, i, 20));
        if (hasPower(ctx, ctx.attacker)) ctx.selfDamage(20);
        ctx.me.bench.forEach((p, i) => p && hasPower(ctx, p) && ctx.damageBenched(ctx.me, i, 20));
      },
    },
    'Metallic Thunder': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.filter((e) => energyCardOf(s.cards, e, 'metal')).length >= 2 ? [{ kind: 'boost', options: [true, false], prompt: 'Discard 2 Metal Energy for 90 damage instead of 50?' }] : []),
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(50);
        discardOwn(ctx, ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'metal')).slice(0, 2));
        ctx.hit(90);
      },
    },
  },
  // Rayquaza δ – Delta Search: a Holon Energy card from the deck attached to it.
  'ex13-16': { 'Delta Search': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Delta Search', filter: 'energyNamed', name: ['Holon Energy FF', 'Holon Energy GL', 'Holon Energy WP'], attachToActive: true, optional: true })) } },
  // Vileplume δ – Poltergeist: the opponent's hand shown; 10 more for each Trainer card in it.
  'ex13-17': {
    Poltergeist: {
      run(ctx) {
        ctx.log(`Your opponent's hand: ${ctx.opp.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
        ctx.hit(30 + 10 * ctx.opp.hand.filter((c) => isTrainerCard(lookupCard(ctx.state.cards, c.defId))).length);
      },
    },
  },
  // Absol – Foresight.
  'ex13-18': { Foresight: foresight },
  // Bellossom δ – Aqua Flower: no Weakness during the opponent's next turn.
  'ex13-19': {
    'Aqua Flower': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).weaknessOffUntil = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} has no Weakness next turn.`);
      },
    },
  },
  // Blaziken – Blaze Kick: heads, 20 more; tails, Burned.
  'ex13-20': {
    'Blaze Kick': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(60);
        ctx.hit(40);
        ctx.inflict('burned');
      },
    },
  },
  // Mewtwo δ – Swift.
  'ex13-24': { Swift: { run: (ctx) => void ctx.hit(40, { swift: true }) } },
  // Rayquaza δ – Outrage: tails, nothing; heads, 10 more for each damage counter on it. Flamethrower: a Fire Energy discarded.
  'ex13-26': {
    Outrage: { run: (ctx) => (ctx.flip() ? void ctx.hit(10 + ctx.attacker.damage) : ctx.log('Outrage did nothing.')) },
    Flamethrower: { discard: { count: 1, type: 'fire' }, run: (ctx) => void ctx.hit(40) },
  },
  // Regirock – Rock Slide: 10 to 2 of the opponent's Benched Pokémon.
  'ex13-28': {
    'Rock Slide': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBenchMany', count: Math.min(2, options.length), options, prompt: "Choose 2 of your opponent's Benched Pokémon to do 10 damage to" }] : [];
      },
      run(ctx) {
        ctx.hit(40);
        for (const slot of [...new Set(ctx.choices.benchSlots ?? [])]) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Zangoose – Fury Cutter: 3 coins; 10, 20 or 40 more for 1, 2 or 3 heads.
  'ex13-34': { 'Fury Cutter': { run: (ctx) => void ctx.hit(10 + [0, 10, 20, 40][ctx.flips(3)]!) } },
  // Aerodactyl δ – Granite Head: 10 less damage to it next turn.
  'ex13-35': { 'Granite Head': guardNext(30, 10) },
  // Exeggutor δ – Delta Circle: 10 more for each of the player's δ Pokémon; Split Bomb: 30 to 2 of the opponent's Pokémon.
  'ex13-41': {
    'Delta Circle': { run: (ctx) => void ctx.hit(10 + 10 * deltas(ctx)) },
    'Split Bomb': chooseOpponents(2, 30, "Choose 2 of your opponent's Pokémon to do 30 damage to"),
  },
  // Golduck δ – Mind Play: a card from the opponent's hand at random: a Trainer card, 30 more and discarded; otherwise back.
  'ex13-43': {
    'Mind Play': {
      run(ctx) {
        if (!ctx.opp.hand.length) return void ctx.hit(30);
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        const card = ctx.opp.hand[Math.floor(r * ctx.opp.hand.length)]!;
        const d = lookupCard(ctx.state.cards, card.defId);
        ctx.log(`Mind Play chose ${d.name}.`);
        if (!isTrainerCard(d)) return void ctx.hit(30);
        ctx.hit(60);
        ctx.opp.hand = ctx.opp.hand.filter((c) => c !== card);
        ctx.opp.discard.push(card);
        ctx.log(`Discarded ${d.name} from your opponent's hand.`, ctx.opp.id);
      },
    },
  },
  // Holon's Castform – Delta Draw: up to as many cards as the player's δ Pokémon.
  'ex13-44': {
    'Delta Draw': {
      run(ctx) {
        const n = Math.min(deltas(ctx), ctx.me.deck.length);
        if (n) ctx.pend({ kind: 'drawCount', source: 'Delta Draw', max: n });
        else ctx.log('Delta Draw drew nothing.');
      },
    },
  },
  // Masquerain – Sweet Scent: 2 damage counters off one of the player's Pokémon.
  'ex13-47': {
    'Sweet Scent': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(s.attacker, s.ownBench).filter((t) => (t === 'active' ? s.attacker : s.ownBench[t])!.damage > 0);
        return options.length ? [{ kind: 'ownPokemon', options, prompt: 'Choose one of your Pokémon to remove 2 damage counters from' }] : [];
      },
      run(ctx) {
        const t = ctx.choices.ownTarget;
        const p = t === undefined ? null : t === 'active' ? ctx.attacker : ctx.me.bench[t];
        if (p) healUpTo(ctx, ctx.me, p, 20);
      },
    },
  },
  // Persian δ – Scratch and Draw: 3 cards drawn while a Holon Stadium is in play; Deceive: the opponent puts 4 damage counters on one of their Pokémon.
  'ex13-48': {
    'Scratch and Draw': {
      run(ctx) {
        ctx.hit(30);
        if (holonStadium(ctx)) ctx.draw(3);
      },
    },
    Deceive: { run: (ctx) => ctx.opponentChooses({ kind: 'ownCounters', source: 'Deceive', count: 4 }) },
  },
  // Primeape δ – Wreck: 30 more and the Stadium discarded; Flames of Rage: 2 Energy discarded, 20 more for each damage counter on it.
  'ex13-50': {
    Wreck: {
      run(ctx) {
        const stadium = ctx.state.stadium;
        ctx.hit(stadium ? 60 : 30);
        if (!stadium) return;
        ctx.state.players[stadium.owner]!.discard.push(stadium.card);
        ctx.state.stadium = null;
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, stadium.card.defId).name}.`);
      },
    },
    'Flames of Rage': { discard: { count: 2 }, run: (ctx) => void ctx.hit(10 + 2 * ctx.attacker.damage) },
  },
  // Sharpedo δ – Brush Aside: with a Holon Energy card attached, a card from the opponent's hand at random discarded; Swift
  // Turn: 30 more against Fighting Resistance.
  'ex13-53': {
    'Brush Aside': {
      run(ctx) {
        ctx.hit(30);
        if (holonOn(ctx, ctx.attacker)) discardAtRandom(ctx);
      },
    },
    'Swift Turn': {
      run(ctx) {
        const d = ctx.defenderDef;
        ctx.hit([d.resistance?.type, ...(d.moreResistance ?? [])].includes('fighting') ? 80 : 50);
      },
    },
  },
  // Pichu δ – Paste: an Energy card from the discard pile to one of the player's δ Pokémon.
  'ex13-76': {
    Paste: {
      run(ctx) {
        const energy = ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        if (energy && deltas(ctx) && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Paste', count: 1, anyEnergy: true, onlyName: 'δ' });
      },
    },
  },
  // Holon Lake – Delta Call: a δ Pokémon from the deck, shown.
  'ex13-87': { 'Delta Call': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Delta Call', filter: 'deltaPokemon', reveal: true })) } },
  // Mew ex – Devo Crush: may discard 2 Energy; if so, may devolve the Defending Pokémon, its top card shuffled into the opponent's deck.
  'ex13-100': {
    'Devo Crush': {
      choices(s, c): ChoiceSpec[] {
        const own = s.attacker.energy.filter((e) => !e.provides);
        if (own.length < 2) return [];
        const specs: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: 'Discard 2 Energy to devolve the Defending Pokémon?' }];
        if (c.boost) specs.push({ kind: 'ownEnergy', count: 2, options: own, prompt: 'Choose 2 Energy cards to discard' });
        return specs;
      },
      run(ctx) {
        ctx.hit(50);
        if (!ctx.choices.boost) return;
        discardOwn(ctx, ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid)));
        if (ctx.opp.active) devolveIntoDeck(ctx, ctx.opp.active);
      },
    },
  },
  // Gyarados ☆ δ – Spiral Growth: a basic Energy card from the discard pile to it for each heads; All-out Blast: the deck
  // discarded down to 1 card, 20 more for each Energy card discarded.
  'ex13-102': {
    'Spiral Growth': {
      run(ctx) {
        ctx.hit(20);
        const heads = headsUntilTails(ctx);
        const basics = ctx.me.discard.filter((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId))).length;
        if (Math.min(heads, basics) && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Spiral Growth', count: Math.min(heads, basics), target: 'active' });
      },
    },
    'All-out Blast': {
      run(ctx) {
        const gone = ctx.me.deck.splice(0, Math.max(0, ctx.me.deck.length - 1));
        ctx.me.discard.push(...gone);
        const energy = gone.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length;
        ctx.log(`Discarded ${gone.length} cards from the deck (${energy} Energy).`);
        ctx.hit(50 + 20 * energy);
      },
    },
  },
  // Mewtwo ☆ – Psychic Star: against an Evolved Pokémon, all its Energy discarded for 50 more.
  'ex13-103': {
    'Psychic Star': {
      run(ctx) {
        if (!ctx.defender.evolvedFrom.length) return void ctx.hit(50);
        discardOwn(ctx, ctx.attacker.energy.filter((e) => !e.provides));
        ctx.hit(100);
      },
    },
  },
  // Pikachu ☆ – Spring Back: 50 more when the opponent has 1 Prize card left.
  'ex13-104': { 'Spring Back': { run: (ctx) => void ctx.hit(ctx.opp.prizes.length === 1 ? 70 : 20) } },
  // Mew – Super Psywave: as many damage counters as Energy attached, on one of the opponent's Pokémon.
  'ex13-111': {
    'Super Psywave': {
      ...snipe(0),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        if (!p || !ctx.canAffect(ctx.opp, p)) return;
        const n = energyPool(p, ctx.state.cards).length;
        p.damage += 10 * n;
        ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
  },
};

