// Boundaries Crossed (bw7) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "the amount of Grass (Psychic) Energy attached" counts Energy provided (as "Energy attached", agreed for the
// EX sets); Firefighting's Fire Energy is a card providing Fire, basic or Special (energyCardOf); Astonish (Dusclops) has no
// coin; Land's Judgment discards every Fighting Energy card; Flying Beatdown's two Energy cards are different cards, a basic
// one taken before a Special one; Super Fang puts damage counters (not damage) on, so nothing on the Defending Pokémon
// changes them; Fluffy Tag's 40 more is for the Pokémon switched in, on the player's next turn; Assist's attack is picked
// before the flip and used with its own questions and effect but not its cost (as Trace and Metronome); Defog's Stadium may be
// either player's.
import { type AttackContext, type AttackEffect, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard } from '../cards.js';
import { counts, energyPool, retireStadium, type CardInstance } from '../engine.js';
import { attackEffect } from './index.js';
import { nextRandom, shuffle } from '../rng.js';
import { effectId, inPlayDef } from '../status.js';
import { benchedSlots, inPlay, same } from './common.js';
import { DP4 } from './dp4.js';
import { energyCardOf, discardOwn, putCounters } from './ex2.js';
import { notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

/** The Energy of `type` a Pokémon's cards provide ("the amount of Grass Energy attached"). */
const provided = (ctx: AttackContext, type: Parameters<typeof counts>[1]) => energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, type)).length;

/** The Energy cards attached to the attacker that are `type` cards (basic or Special), basic ones first. */
const typedCards = (ctx: AttackContext, type: Parameters<typeof energyCardOf>[2]) =>
  ctx.attacker.energy
    .filter((e) => !e.provides && energyCardOf(ctx.state.cards, e, type))
    .sort((a, b) => Number(isBasicEnergy(lookupCard(ctx.state.cards, b.defId))) - Number(isBasicEnergy(lookupCard(ctx.state.cards, a.defId))));

/** A card from the opponent's hand at random, shown, then shuffled into their deck (Astonish, with no coin). */
function astonish(ctx: AttackContext) {
  if (!ctx.opp.hand.length) return ctx.log("Astonish did nothing: your opponent's hand is empty.");
  const [r, next] = nextRandom(ctx.state.rngState);
  ctx.state.rngState = next;
  const [card] = ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1) as [CardInstance];
  ctx.log(`Astonish chose ${lookupCard(ctx.state.cards, card.defId).name}.`);
  [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, card], ctx.state.rngState);
  ctx.log('Shuffled it into the deck.', ctx.opp.id);
}

export const BW7: Record<string, Record<string, AttackEffect>> = {
  // Tangrowth – Hundred Furious Lashes: 30 for each Grass Energy attached; not again on the player's next turn.
  'bw7-6': {
    'Hundred Furious Lashes': {
      run(ctx) {
        ctx.hit(30 * provided(ctx, 'grass'));
        notNextTurn(ctx, 'Hundred Furious Lashes');
      },
    },
  },
  // Shaymin – Leaf Drain: heads, 30 off itself.
  'bw7-10': {
    'Leaf Drain': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.heal(30);
      },
    },
  },
  // Whimsicott – Fluffy Tag: switched with a Benched Pokémon, whose attacks do 40 more to the Active Pokémon on the player's next turn.
  'bw7-15': {
    'Fluffy Tag': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to switch with' }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || !ctx.me.bench[slot]) return ctx.log('Fluffy Tag did nothing.');
        ctx.switchOwn(slot);
        const next = ctx.me.active;
        if (!next || next === ctx.attacker) return;
        (next.effects ??= {}).nextTurnMore = { amount: 40, turn: ctx.turn + 2 };
        ctx.log(`${inPlayDef(ctx.state.cards, next).name}'s attacks do 40 more damage next turn.`);
      },
    },
  },
  // Darmanitan – Damage Counterpunch: 60 more with any damage counters on it.
  'bw7-28': { 'Damage Counterpunch': { run: (ctx) => void ctx.hit(ctx.attacker.damage > 0 ? 120 : 60) } },
  // Psyduck – Firefighting: a Fire Energy attached to the Defending Pokémon discarded.
  'bw7-33': {
    Firefighting: {
      choices(s): ChoiceSpec[] {
        const options = s.defender.energy.filter((e) => !e.provides && energyCardOf(s.cards, e, 'fire'));
        return options.length ? [{ kind: 'defenderEnergy', options, prompt: 'Choose a Fire Energy to discard from the Defending Pokémon' }] : [];
      },
      run(ctx) {
        const uid = ctx.choices.defenderEnergyUid;
        const card = ctx.defender.energy.find((e) => e.uid === uid);
        if (!card || !energyCardOf(ctx.state.cards, card, 'fire')) return ctx.log('Firefighting did nothing.');
        ctx.discardDefenderEnergy(card.uid);
      },
    },
  },
  // Azumarill – Deep Dive: 2 coins, 40 off itself for each heads.
  'bw7-37': {
    'Deep Dive': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (heads) ctx.heal(40 * heads);
      },
    },
  },
  // Delibird – Present: as Great Encounters Delibird's.
  'bw7-38': { Present: same(() => DP4['dp4-36']?.Present) },
  // Swanna – Defog: the Stadium in play may be discarded, for 40 more.
  'bw7-43': {
    Defog: {
      choices: (s): ChoiceSpec[] => (s.stadium ? [{ kind: 'boost', options: [true, false], prompt: 'Discard the Stadium in play for 40 more damage?' }] : []),
      run(ctx) {
        if (!ctx.choices.boost || !ctx.state.stadium) return void ctx.hit(60);
        retireStadium(ctx.state);
        ctx.hit(100);
      },
    },
  },
  // Electivire – Electriwave: 30 to each of the opponent's Benched Pokémon.
  'bw7-54': { Electriwave: { run: (ctx) => ctx.benchDamage(ctx.opp, 30) } },
  // Dusclops – Astonish: a card from the opponent's hand at random shuffled into their deck.
  'bw7-62': { Astonish: { run: astonish } },
  // Musharna – Dream Waltz: usable while Asleep; 30 more if it is.
  'bw7-69': { 'Dream Waltz': { whileAsleep: true, run: (ctx) => void ctx.hit(ctx.attacker.condition === 'asleep' ? 90 : 60) } },
  // Swoobat – Jet Woofer: the top card of the opponent's deck discarded for each Psychic Energy attached.
  'bw7-71': {
    'Jet Woofer': {
      run(ctx) {
        const milled = ctx.opp.deck.splice(0, provided(ctx, 'psychic'));
        ctx.opp.discard.push(...milled);
        ctx.log(`Discarded ${milled.length} card${milled.length === 1 ? '' : 's'} from the top of the deck.`, ctx.opp.id);
      },
    },
  },
  // Landorus-EX – Land's Judgment: every Fighting Energy attached may be discarded, for 70 more.
  'bw7-89': {
    "Land's Judgment": {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.some((e) => !e.provides && energyCardOf(s.cards, e, 'fighting')) ? [{ kind: 'boost', options: [true, false], prompt: 'Discard all Fighting Energy for 70 more damage?' }] : []),
      run(ctx) {
        const fighting = typedCards(ctx, 'fighting');
        if (!ctx.choices.boost || !fighting.length) return void ctx.hit(80);
        discardOwn(ctx, fighting);
        ctx.hit(150);
      },
    },
  },
  // Liepard – Assist: heads, one of the player's Benched Pokémon's attacks, picked before the flip, used as this attack.
  'bw7-91': {
    Assist: {
      choices(s, c) {
        const sources = benchedSlots(s.ownBench).filter((i) => inPlayDef(s.cards, s.ownBench[i]!).attacks.some((a) => a.name !== 'Assist'));
        if (!sources.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'ownBench', options: sources, prompt: 'Assist: choose one of your Benched Pokémon to use an attack of (if heads)' }];
        const from = c.ownBenchSlot !== undefined && sources.includes(c.ownBenchSlot) ? s.ownBench[c.ownBenchSlot]! : null;
        if (!from) return specs;
        const attacks = inPlayDef(s.cards, from).attacks;
        const options = attacks.flatMap((a, i) => (a.name === 'Assist' ? [] : [i]));
        specs.push({ kind: 'amount', options, labels: options.map((i) => attacks[i]!.name), prompt: `Choose one of ${inPlayDef(s.cards, from).name}'s attacks` });
        const copied = c.amount !== undefined ? attacks[c.amount] : undefined;
        const effect = copied && attackEffect(effectId(from), copied.name);
        if (effect?.choices) specs.push(...effect.choices(s, c));
        return specs;
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        const from = slot !== undefined ? ctx.me.bench[slot] : null;
        const copied = from && ctx.choices.amount !== undefined ? inPlayDef(ctx.state.cards, from).attacks[ctx.choices.amount] : undefined;
        if (!from || !copied || copied.name === 'Assist') return ctx.log('Assist had no attack to use.');
        if (!ctx.flip()) return ctx.log('Assist did nothing.');
        ctx.log(`Assist uses ${copied.name}.`);
        ctx.useAttack(copied, effectId(from));
      },
    },
  },
  // Scizor – Steel Slash: no damage to it from Pokémon-EX's attacks during the opponent's next turn (attacks.ts).
  'bw7-94': {
    'Steel Slash': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).pokemonEXProof = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} takes no damage from Pokémon-EX next turn.`);
      },
    },
  },
  // Flygon – Flying Beatdown: a Grass and a Fighting Energy may be discarded; if they are, the Defending Pokémon is Paralyzed.
  'bw7-99': {
    'Flying Beatdown': {
      choices(s): ChoiceSpec[] {
        const cards = s.attacker.energy.filter((e) => !e.provides);
        const grass = cards.filter((e) => energyCardOf(s.cards, e, 'grass'));
        const pair = grass.some((g) => cards.some((e) => e !== g && energyCardOf(s.cards, e, 'fighting')));
        return pair ? [{ kind: 'boost', options: [true, false], prompt: 'Discard a Grass and a Fighting Energy to Paralyze the Defending Pokémon?' }] : [];
      },
      run(ctx) {
        ctx.hit(80);
        if (!ctx.choices.boost) return;
        const grass = typedCards(ctx, 'grass');
        // The Grass card that leaves a Fighting one (a card providing both is used for whichever is missing).
        const g = grass.find((c) => typedCards(ctx, 'fighting').some((f) => f !== c));
        const f = g && typedCards(ctx, 'fighting').find((c) => c !== g);
        if (!g || !f) return;
        discardOwn(ctx, [g, f]);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Raticate – Super Fang: damage counters on the Defending Pokémon until it has 10 HP left.
  'bw7-105': {
    'Super Fang': {
      run(ctx) {
        const left = ctx.defenderDef.hp - ctx.defender.damage;
        putCounters(ctx, ctx.opp, ctx.defender, Math.floor((left - 10) / 10));
      },
    },
  },
  // Delcatty – Gather Energy: a basic Energy card from the deck attached to one of the player's Pokémon.
  'bw7-114': {
    'Gather Energy': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Gather Energy', filter: 'basicEnergy', attach: true });
      },
    },
  },
  // Lopunny – Healing Melody: heads, 60 off each of the player's Pokémon.
  'bw7-117': {
    'Healing Melody': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Healing Melody did nothing.');
        for (const p of inPlay(ctx.me)) healUpTo(ctx, ctx.me, p, 60);
      },
    },
  },
};
