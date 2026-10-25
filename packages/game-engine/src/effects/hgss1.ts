// HeartGold & SoulSilver (hgss1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts)
// don't play.
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded are picked when the cards that
// fit differ (the same-card rule, agreed); Playground lets each player bench any Basic Pokémon from their deck, the player
// first; Energy Antics moves an Energy card picked between two of the opponent's Pokémon; Graffiti makes the Defending
// Pokémon's attacks cost 1 Colorless more next turn (`graffiti`); Cosmic Cyclone's Water Energy cards, picked from any of the
// player's Pokémon, are shuffled into the deck; Static Electricity counts every Mareep in play, both players'.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, lookupCard, namesMatch } from '../cards.js';
import { energyPool, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, energyCards, inPlay, opponentBenchChoice, same } from './common.js';
import { DP3 } from './dp3.js';
import { DP5 } from './dp5.js';
import { removeDefenderEnergy } from './dp1.js';
import { discardAtRandom } from './ex1.js';
import { EX10 } from './ex10.js';
import { energyCardOf } from './ex2.js';
import { EX7 } from './ex7.js';
import { returnSelf } from './gym2.js';

const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);

export const HGSS1: Record<string, Record<string, AttackEffect>> = {
  // Clefable – Fairy Power: one of the player's Pokémon and its cards back into the hand.
  'hgss1-3': { 'Fairy Power': { run: (ctx) => ctx.pend({ kind: 'returnOwn', source: 'Fairy Power' }) } },
  // Jumpluff – Mass Attack: 10 for each Pokémon in play, both players'.
  'hgss1-6': { 'Mass Attack': { run: (ctx) => void ctx.hit(10 * (inPlay(ctx.me).length + inPlay(ctx.opp).length)) } },
  // Quagsire – Muddy Water: 20 to one of the opponent's Benched Pokémon too.
  'hgss1-9': {
    'Muddy Water': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to"),
      run(ctx) {
        ctx.hit(40);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Wobbuffet – Double Return: heads, 20 for each damage counter on it.
  'hgss1-13': { 'Double Return': { run: (ctx) => void (ctx.flip() ? ctx.hit(2 * ctx.attacker.damage) : ctx.log('Double Return did nothing.')) } },
  // Ampharos – Acceleration Bolt: up to 2 basic Energy cards from the deck attached to one of the player's Pokémon.
  'hgss1-14': {
    'Acceleration Bolt': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Acceleration Bolt', filter: 'basicEnergy', attach: true, attachSame: true, optional: true, count: 2 });
      },
    },
  },
  // Granbull – Timid Tackle: 20 to itself, then switched with a Benched Pokémon.
  'hgss1-22': {
    'Timid Tackle': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Timid Tackle: choose a Benched Pokémon to switch Granbull with' }] : []),
      run(ctx) {
        ctx.hit(50);
        ctx.selfDamage(20);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined) ctx.after(() => ctx.me.active === ctx.attacker && ctx.me.bench[slot] && ctx.attacker.damage < ctx.attackerDef.hp && ctx.switchOwn(slot));
      },
    },
  },
  // Persian – Sharpen Claws: 3 coins, a random card from the opponent's hand discarded for each heads.
  'hgss1-27': {
    'Sharpen Claws': {
      run(ctx) {
        const heads = ctx.flips(3);
        for (let i = 0; i < heads && ctx.opp.hand.length; i++) discardAtRandom(ctx);
      },
    },
  },
  // Pichu – Playground: each player may bench any Basic Pokémon from their deck, the player first; then Pichu is Asleep.
  'hgss1-28': {
    Playground: {
      run(ctx) {
        ctx.sleepSelf();
        ctx.pend({ kind: 'pickFromDeck', source: 'Playground', filter: 'basic', toBench: true, optional: true, count: 5, thenSame: ctx.opp.id, thenCount: 5 });
      },
    },
  },
  // Smoochum – Energy Antics: an Energy card moved from one of the opponent's Pokémon to another of theirs; Smoochum Asleep.
  'hgss1-30': {
    'Energy Antics': {
      choices(s, c): ChoiceSpec[] {
        const all = ['active', ...benchedSlots(s.opponentBench)] as Target[];
        const at = (t: Target) => (t === 'active' ? s.defender : s.opponentBench[t])!;
        const from = all.filter((t) => energyCards(at(t)).length);
        if (all.length < 2 || !from.length) return [];
        const src = c.oppTarget === undefined ? null : at(c.oppTarget);
        return [
          { kind: 'opponentPokemon', options: from, prompt: "Energy Antics: choose one of your opponent's Pokémon to move an Energy card from" },
          ...(src ? [{ kind: 'pokemonEnergy' as const, options: energyCards(src), prompt: 'Choose the Energy card to move' }, { kind: 'opponentPokemonTo' as const, options: all.filter((t) => t !== c.oppTarget), prompt: "Choose the other Pokémon of your opponent's to move it to" }] : []),
        ];
      },
      run(ctx) {
        ctx.sleepSelf();
        const from = ctx.choices.oppTarget === undefined ? null : theirs(ctx, ctx.choices.oppTarget);
        const to = ctx.choices.oppTo === undefined ? null : theirs(ctx, ctx.choices.oppTo);
        const card = from?.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        if (!from || !to || !card || from === to || !ctx.canAffect(ctx.opp, from)) return;
        from.energy = from.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
      },
    },
  },
  // Tyrogue – Mischievous Punch: no Weakness or Resistance; Tyrogue Asleep.
  'hgss1-33': {
    'Mischievous Punch': {
      run(ctx) {
        ctx.hit(30, { weakness: false });
        ctx.sleepSelf();
      },
    },
  },
  // Weezing – Super Explosion: 90 to itself, no Weakness.
  'hgss1-34': {
    'Super Explosion': {
      run(ctx) {
        ctx.hit(90);
        ctx.selfDamage(90);
      },
    },
  },
  // Corsola – Recover: as Secret Wonders'. Hyper Cannon: 2 heads, 50 more.
  'hgss1-37': {
    Recover: same(() => DP3['dp3-107']?.['Recover']),
    'Hyper Cannon': { run: (ctx) => void ctx.hit(ctx.flips(2) === 2 ? 70 : 20) },
  },
  // Delibird – Snowy Present: a card drawn for each Water Energy on the player's Pokémon.
  'hgss1-39': { 'Snowy Present': { run: (ctx) => ctx.draw(inPlay(ctx.me).reduce((n, p) => n + energyPool(p, ctx.state.cards).filter((e) => e === 'water' || e === 'any').length, 0)) } },
  // Dunsparce – Fade Out: back into the hand with its cards.
  'hgss1-41': {
    'Fade Out': {
      run(ctx) {
        ctx.hit(20);
        ctx.after(() => returnSelf(ctx));
      },
    },
  },
  // Heracross – Green Draw: a card drawn for each of the player's Grass Pokémon in play.
  'hgss1-43': { 'Green Draw': { run: (ctx) => ctx.draw(inPlay(ctx.me).filter((p) => hasType(inPlayDef(ctx.state.cards, p), 'grass')).length) } },
  // Igglybuff – Graffiti: Igglybuff Asleep; the Defending Pokémon's attacks cost 1 Colorless more next turn.
  'hgss1-44': {
    Graffiti: {
      run(ctx) {
        ctx.sleepSelf();
        ctx.affectDefender((e) => (e.graffiti = ctx.turn + 1));
      },
    },
  },
  // Mantine – Group Swim: a Water Pokémon from the deck, shown.
  'hgss1-45': { 'Group Swim': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Group Swim', filter: 'pokemonType', type: 'water', reveal: true })) } },
  // Miltank – Moomoo Squeeze: a Moomoo Milk card from the deck, shown.
  'hgss1-47': { 'Moomoo Squeeze': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Moomoo Squeeze', filter: 'trainerNamed', name: 'Moomoo Milk', reveal: true })) } },
  // Parasect – Sleep Drain: Asleep, 4 damage counters off Parasect.
  'hgss1-48': {
    'Sleep Drain': {
      run(ctx) {
        ctx.inflict('asleep');
        ctx.heal(40);
      },
    },
  },
  // Starmie – Cosmic Cyclone: any Water Energy cards from the player's Pokémon shuffled into the deck, 20 for each.
  'hgss1-53': {
    'Cosmic Cyclone': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownEnergyAny', options: [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p).filter((e) => energyCardOf(s.cards, e, 'water')) : [])), prompt: 'Cosmic Cyclone: choose any Water Energy cards on your Pokémon (20 damage each; they go into your deck)' }],
      run(ctx) {
        const gone = inPlay(ctx.me).flatMap((p) => {
          const these = p.energy.filter((e) => !e.provides && ctx.choices.energyUids?.includes(e.uid) && energyCardOf(ctx.state.cards, e, 'water'));
          p.energy = p.energy.filter((e) => !these.includes(e));
          return these;
        });
        ctx.hit(20 * gone.length);
        if (!gone.length) return;
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...gone.map(({ converted: _c, windless: _w, ...c }) => c)], ctx.state.rngState);
        ctx.log(`Shuffled ${gone.length} Water Energy card${gone.length === 1 ? '' : 's'} into the deck.`);
      },
    },
  },
  // Chansey – Happy Punch: heads, 3 damage counters off it.
  'hgss1-58': {
    'Happy Punch': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.heal(30);
      },
    },
  },
  // Girafarig – Show Off: as EX Team Rocket Returns' Minor Errand-Running.
  'hgss1-64': { 'Show Off': same(() => EX7['ex7-68']?.['Minor Errand-Running']) },
  // Mareep – Static Electricity: up to as many Lightning Energy cards from the deck as Mareep in play (both players'), attached to it.
  'hgss1-73': {
    'Static Electricity': {
      run(ctx) {
        const n = [...inPlay(ctx.me), ...inPlay(ctx.opp)].filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Mareep')).length;
        if (n && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Static Electricity', filter: 'typedEnergy', type: 'lightning', attachToActive: true, optional: true, count: n });
      },
    },
  },
  // Ampharos – Lightning Crush: heads, 40 more; tails, an Energy card of the Defending Pokémon discarded.
  'hgss1-105': {
    'Lightning Crush': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(80);
        ctx.hit(40);
        removeDefenderEnergy(ctx, 1, 'Lightning Crush');
      },
    },
  },
  // Typhlosion – Flare Destroy: as Majestic Dawn Flareon's Kindle.
  'hgss1-110': { 'Flare Destroy': same(() => DP5['dp5-19']?.['Kindle']) },
  // Lugia LEGEND – Elemental Blast: as EX Unseen Forces Lugia ex's.
  'hgss1-113': { 'Elemental Blast': same(() => EX10['ex10-105']?.['Elemental Blast']) },
  'hgss1-114': { 'Elemental Blast': same(() => EX10['ex10-105']?.['Elemental Blast']) },
  // Gyarados – Thrash: heads, 20 more; tails, 20 to itself.
  'hgss1-123': {
    Thrash: {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(50);
        ctx.hit(30);
        ctx.selfDamage(20);
      },
    },
  },
};
