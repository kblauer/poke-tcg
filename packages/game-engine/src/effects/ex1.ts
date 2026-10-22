// EX Ruby & Sapphire (ex1) attack effects, by card id and attack name. Rulings follow the card text (the EX rulebook).
// Attacks that only deal damage need no entry. "Choose 1 card from your opponent's hand without looking" is a card at
// random. Questions whose answer depends on a flip are asked before it (Removal Beam's Energy card).
// Rulings (agreed with the user) for the wording made for 2 Active Pokémon a side: "each Defending Pokémon" is the Active
// Pokémon only (changed 2026-10-22: only "all Defending Pokémon" reaches the Bench); "the other Defending Pokémon" is one
// of the Benched ones, picked by the player whose Energy card moves (Fast Stream); "Active Pokémon" otherwise (Invisible
// Hand, Repulsion, Max Energy Source) is the one Active Pokémon.
// "Energy attached" counts the Energy provided (Double Colorless is 2); "not used to pay for this attack's cost" is that
// less the cost (Water Gun counts only Water Energy, its Colorless paid with other Energy first: extraEnergy).
import { type AttackContext, type AttackEffect, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard } from '../cards.js';
import { energyPool, isEnergyCardOf, type InPlayPokemon } from '../engine.js';
import { nextRandom } from '../rng.js';
import { pokemonName } from '../status.js';
import { benchedSlots, benchTarget, discardToUse, extraEnergy, flipToInflict, flipToProtect, headsUntilTails, inflicts, opponentSwitches, perHeads, recoil, tailsSelfDamage } from './common.js';
import { basicEnergyOn, typedCards } from './ecard1.js';
import { smokescreen } from './fossil.js';
import { benchMany, noRetreat } from './gym1.js';
import { flipForMore, rage } from './jungle.js';
import { attachFromDiscard } from './neo3.js';
import { energyAbsorption } from './promos.js';
import { flipOrNothing } from './rocket.js';
import { healUpTo } from './si1.js';

/** Discards a card from the opponent's hand at random ("without looking": Shakedown, Knock Off). */
export function discardAtRandom(ctx: AttackContext) {
  if (!ctx.opp.hand.length) return ctx.log("Your opponent's hand is empty.");
  const [r, next] = nextRandom(ctx.state.rngState);
  ctx.state.rngState = next;
  const [card] = ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1);
  ctx.opp.discard.push(card!);
  ctx.log(`Discarded ${lookupCard(ctx.state.cards, card!.defId).name} from the opponent's hand.`, ctx.opp.id);
}

/** Basic Energy cards attached to the attacker to discard `count` of ("Discard 2 basic Energy cards … or this attack does nothing"). */
const basicDiscardChoice = (count: number, name: string) => (s: Parameters<NonNullable<AttackEffect['choices']>>[0]): ChoiceSpec[] => {
  const options = basicEnergyOn(s.cards, s.attacker);
  return options.length >= count ? [{ kind: 'ownEnergy', count, options, prompt: `Choose ${count === 1 ? 'a basic Energy card' : `${count} basic Energy cards`} to discard from ${name}` }] : [];
};

/** Discards the chosen basic Energy cards from the attacker; false if there weren't enough ("or this attack does nothing"). */
function discardChosen(ctx: AttackContext, count: number): boolean {
  const uids = new Set(ctx.choices.energyUids ?? []);
  const gone = ctx.attacker.energy.filter((e) => uids.has(e.uid));
  if (gone.length < count) {
    ctx.log('The attack did nothing.');
    return false;
  }
  ctx.attacker.energy = ctx.attacker.energy.filter((e) => !uids.has(e.uid));
  ctx.me.discard.push(...gone);
  ctx.log(`Discarded ${gone.length} basic Energy card${gone.length === 1 ? '' : 's'} from ${ctx.attackerDef.name}.`);
  return true;
}

/** The attacker can't attack during its player's next turn (Critical Move, Slack Off). */
export const restNextTurn = (ctx: AttackContext) => {
  (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
  ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
};

/** The Energy attached to a Pokémon, by what it provides (Double Colorless is 2). */
export const energyAmount = (ctx: AttackContext, p: InPlayPokemon) => energyPool(p, ctx.state.cards).length;

/** "Each Defending Pokémon" (agreed 2026-10-22): the opponent's Active Pokémon only; only "all Defending Pokémon" reaches the Bench. */
export const eachDefending = (ctx: AttackContext, damage: number) => void ctx.hit(damage);

/** "Flip a coin. If heads, each Defending Pokémon is now …": only the Active Pokémon can have a Special Condition (agreed). */
const flipEachDefending = (affliction: 'confused' | 'paralyzed' | 'burned'): AttackEffect => ({
  run(ctx) {
    if (ctx.flip()) ctx.inflict(affliction);
    else ctx.log('The attack did nothing.');
  },
});

/** Water Arrow: 20 to 1 of the opponent's Pokémon (no Weakness or Resistance for a Benched one). */
const waterArrow: AttackEffect = {
  choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: ['active', ...benchedSlots(s.opponentBench)], prompt: "Choose one of your opponent's Pokémon to do 20 damage to" }],
  run(ctx) {
    const t = ctx.choices.oppTarget ?? 'active';
    if (t === 'active') ctx.hit(20);
    else ctx.damageBenched(ctx.opp, t, 20);
  },
};

/** Stockpile's turn on the attacker: during its player's next turn Spit Up and Swallow do more. */
const stockpiled = (ctx: AttackContext) => (ctx.attacker.effects?.stockpile ?? -1) >= ctx.turn;

export const EX1: Record<string, Record<string, AttackEffect>> = {
  // Aggron – Retaliate: heads, 10 for each damage counter on Aggron; Double Lariat.
  'ex1-1': {
    Retaliate: { run: (ctx) => void ctx.hit(ctx.flip() ? ctx.attacker.damage : 0) },
    'Double Lariat': perHeads(2, 70),
  },
  // Beautifly – Stun Spore; Parallel Gain: a damage counter off each of its player's Pokémon.
  'ex1-2': {
    'Stun Spore': flipToInflict(20, 'paralyzed'),
    'Parallel Gain': {
      run(ctx) {
        ctx.hit(50);
        for (const p of [ctx.me.active, ...ctx.me.bench]) if (p) healUpTo(ctx, ctx.me, p, 10);
      },
    },
  },
  // Blaziken – Fire Stream: a Fire Energy card from Blaziken discarded, then 10 to each of the opponent's Benched Pokémon.
  'ex1-3': {
    'Fire Stream': {
      run(ctx) {
        ctx.hit(50);
        const [fire] = typedCards(ctx, 'fire');
        if (!fire) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== fire);
        ctx.me.discard.push(fire);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, fire.defId).name} from ${ctx.attackerDef.name}.`);
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Camerupt – Lava Burn: 10 to a Benched Pokémon; Fire Spin: 2 basic Energy cards discarded, or nothing.
  'ex1-4': {
    'Lava Burn': benchTarget(20, 10),
    'Fire Spin': {
      choices: basicDiscardChoice(2, 'Camerupt'),
      run(ctx) {
        if (discardChosen(ctx, 2)) ctx.hit(100);
      },
    },
  },
  // Delcatty – Max Energy Source: 10 for each Energy attached to its player's Active Pokémon.
  'ex1-5': { 'Max Energy Source': { run: (ctx) => void ctx.hit(10 * energyAmount(ctx, ctx.attacker)) } },
  // Dustox – Toxic: 2 damage counters between turns.
  'ex1-6': { Toxic: inflicts(0, 'toxic') },
  // Gardevoir – Energy Burst: 10 for each Energy attached to Gardevoir and the Defending Pokémon.
  'ex1-7': { 'Energy Burst': { run: (ctx) => void ctx.hit(10 * (energyAmount(ctx, ctx.attacker) + energyAmount(ctx, ctx.defender))) } },
  // Hariyama – Super Slap Push: 20 to each Defending Pokémon; Mega Throw: 40 more against a Pokémon-ex.
  'ex1-8': {
    'Super Slap Push': { run: (ctx) => eachDefending(ctx, 20) },
    'Mega Throw': { run: (ctx) => void ctx.hit(ctx.defenderDef.ex ? 80 : 40) },
  },
  // Manectric – Attract Current: a Lightning Energy card from the deck to 1 of its player's Pokémon; Thunder Jolt.
  'ex1-9': {
    'Attract Current': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Attract Current', filter: 'energyType', type: 'lightning', attach: true });
      },
    },
    'Thunder Jolt': tailsSelfDamage(50, 10),
  },
  // Mightyena – Shakedown: heads, a card from the opponent's hand at random discarded.
  'ex1-10': {
    Shakedown: {
      run(ctx) {
        ctx.hit(40);
        if (ctx.flip()) discardAtRandom(ctx);
      },
    },
  },
  // Sceptile – Lizard Poison: Special Conditions by the Energy attached to Sceptile.
  'ex1-11': {
    'Lizard Poison': {
      run(ctx) {
        ctx.hit(20);
        const n = energyAmount(ctx, ctx.attacker);
        if (n === 1 || n === 3 || n >= 4) ctx.inflict('asleep');
        if (n >= 4) ctx.inflict('burned');
        if (n >= 2) ctx.inflict('poisoned');
      },
    },
  },
  // Slaking – Critical Move: a basic Energy card discarded or nothing; Slaking can't attack next turn.
  'ex1-12': {
    'Critical Move': {
      choices: basicDiscardChoice(1, 'Slaking'),
      run(ctx) {
        if (!discardChosen(ctx, 1)) return;
        ctx.hit(100);
        restNextTurn(ctx);
      },
    },
  },
  // Swampert – Hypno Splash.
  'ex1-13': { 'Hypno Splash': inflicts(50, 'asleep') },
  // Wailord – Take Down.
  'ex1-14': { 'Take Down': recoil(50, 20) },
  // Blaziken – Clutch; Flamethrower.
  'ex1-15': { Clutch: noRetreat(20), Flamethrower: discardToUse(80, 1, 'fire') },
  // Breloom – Battle Blast: 10 more for each Fighting Energy attached.
  'ex1-16': {
    'Battle Blast': {
      run: (ctx) => void ctx.hit(40 + 10 * ctx.attacker.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, 'fighting')).length),
    },
  },
  // Donphan – Rend: 20 more if the Defending Pokémon has damage counters; Double Spin.
  'ex1-17': {
    Rend: { run: (ctx) => void ctx.hit(ctx.defender.damage > 0 ? 40 : 20) },
    'Double Spin': perHeads(2, 60),
  },
  // Nosepass – Invisible Hand: with an Evolved Pokémon as the opponent's Active Pokémon, any card from the deck; Repulsion:
  // heads, the Defending Pokémon and its cards back to the opponent's hand (nothing if they have no Benched Pokémon).
  'ex1-18': {
    'Invisible Hand': {
      run(ctx) {
        if (!ctx.defender.evolvedFrom.length) return ctx.log('Invisible Hand did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Invisible Hand', filter: 'any' });
      },
    },
    Repulsion: {
      run(ctx) {
        if (!ctx.opp.bench.some(Boolean) || !ctx.flip()) return ctx.log('Repulsion did nothing.');
        ctx.returnDefender();
      },
    },
  },
  // Pelipper – Stockpile; Spit Up (70 after Stockpile); Swallow (60 after Stockpile): damage counters off as the damage done.
  'ex1-19': {
    Stockpile: {
      run(ctx) {
        (ctx.attacker.effects ??= {}).stockpile = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} stockpiled: Spit Up and Swallow do more next turn.`);
      },
    },
    'Spit Up': { run: (ctx) => void ctx.hit(stockpiled(ctx) ? 70 : 30) },
    Swallow: {
      run(ctx) {
        const done = ctx.hit(stockpiled(ctx) ? 60 : 20);
        if (done > 0) healUpTo(ctx, ctx.me, ctx.attacker, done);
      },
    },
  },
  // Sceptile – Tail Rap.
  'ex1-20': { 'Tail Rap': perHeads(2, 50) },
  // Seaking – Water Arrow; Fast Stream: the opponent moves an Energy card from the Defending Pokémon to one of their Benched Pokémon (they pick both).
  'ex1-21': {
    'Water Arrow': waterArrow,
    'Fast Stream': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.defender.energy.length && ctx.opp.bench.some(Boolean) && ctx.canAffect(ctx.opp, ctx.defender)) ctx.opponentChooses({ kind: 'fastStream', source: 'Fast Stream' });
      },
    },
  },
  // Sharpedo – Dark Slash: may discard a Darkness Energy card for 30 more.
  'ex1-22': {
    'Dark Slash': {
      choices: (s) => (s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'darkness')) ? [{ kind: 'boost', options: [true, false], prompt: 'Discard a Darkness Energy card attached to Sharpedo for 30 more damage?' }] : []),
      run(ctx) {
        const dark = ctx.choices.boost ? ctx.attacker.energy.find((e) => isEnergyCardOf(e, ctx.state.cards, 'darkness')) : undefined;
        if (dark) {
          ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== dark);
          ctx.me.discard.push(dark);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, dark.defId).name} from ${ctx.attackerDef.name}.`);
        }
        ctx.hit(dark ? 70 : 40);
      },
    },
  },
  // Swampert – Water Arrow.
  'ex1-23': { 'Water Arrow': waterArrow },
  // Weezing – Confusion Gas; Poison Smog: the Active Pokémon Poisoned (only it can be), 10 to each Benched one.
  'ex1-24': {
    'Confusion Gas': inflicts(10, 'confused'),
    'Poison Smog': {
      run(ctx) {
        ctx.inflict('poisoned');
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Aron – Double Stab.
  'ex1-25': { 'Double Stab': perHeads(2, 20) },
  // Cascoon – Poison Thread.
  'ex1-26': { 'Poison Thread': inflicts(0, 'poisoned') },
  // Combusken – Double Kick.
  'ex1-27': { 'Double Kick': perHeads(2, 40) },
  // Combusken – Lunge.
  'ex1-28': { Lunge: flipOrNothing(50) },
  // Delcatty – Energy Call: an Energy card from the discard pile to Delcatty; Cannonball: 10 more for each Energy beyond its cost of 2.
  'ex1-29': {
    'Energy Call': {
      choices: (s): ChoiceSpec[] => {
        const options = s.ownDiscard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');
        return options.length && !s.discardsLocked ? [{ kind: 'ownDiscard', min: 1, max: 1, options, prompt: 'Choose an Energy card from your discard pile to attach to your Active Pokémon' }] : [];
      },
      run(ctx) {
        ctx.hit(10);
        const uid = ctx.choices.discardUids?.[0];
        if (uid) attachFromDiscard(ctx, (c) => c.uid === uid);
      },
    },
    Cannonball: { run: (ctx) => void ctx.hit(30 + 10 * Math.max(0, energyAmount(ctx, ctx.attacker) - 2)) },
  },
  // Electrike – Charge: a Lightning Energy card from the discard pile to Electrike; Thunder Jolt.
  'ex1-30': {
    Charge: { run: (ctx) => attachFromDiscard(ctx, (c) => isEnergyCardOf(c, ctx.state.cards, 'lightning')) },
    'Thunder Jolt': tailsSelfDamage(30, 10),
  },
  // Grovyle – Poison Breath; Swift: nothing on the Defending Pokémon changes the damage.
  'ex1-31': {
    'Poison Breath': inflicts(0, 'poisoned'),
    Swift: { run: (ctx) => void ctx.hit(30, { swift: true }) },
  },
  // Hariyama – Shove; Slap Down: 10 more for each heads of 2.
  'ex1-33': {
    Shove: flipToInflict(20, 'paralyzed'),
    'Slap Down': { run: (ctx) => void ctx.hit(40 + 10 * ctx.flips(2)) },
  },
  // Kirlia – Removal Beam: heads, an Energy card attached to the Defending Pokémon discarded (chosen before the flip).
  'ex1-34': {
    'Removal Beam': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip() && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Kirlia – Dazzle Dance: heads, the Defending Pokémon is Confused; Life Drain: heads, damage counters until it has 10 HP left.
  'ex1-35': {
    'Dazzle Dance': flipEachDefending('confused'),
    'Life Drain': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Life Drain did nothing.');
        const left = ctx.defenderDef.hp - ctx.defender.damage;
        if (left <= 10 || !ctx.canAffect(ctx.opp, ctx.defender)) return;
        ctx.defender.damage = ctx.defenderDef.hp - 10;
        ctx.log(`Put damage counters on ${ctx.defenderDef.name}: it has 10 HP left.`, ctx.opp.id);
      },
    },
  },
  // Lairon – Magnitude: 10 to each Benched Pokémon, both players'; One-Two Strike.
  'ex1-37': {
    Magnitude: {
      run(ctx) {
        ctx.hit(20);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
      },
    },
    'One-Two Strike': { run: (ctx) => void ctx.hit(30 + 20 * ctx.flips(2)) },
  },
  // Linoone – Seek Out: up to 2 cards from the deck; Continuous Headbutt.
  'ex1-38': {
    'Seek Out': {
      run(ctx) {
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Seek Out', filter: 'any', count: 2, optional: true });
      },
    },
    'Continuous Headbutt': { run: (ctx) => void ctx.hit(40 * headsUntilTails(ctx)) },
  },
  // Manectric – Thundershock; Gigashock: 10 to 2 of the opponent's Benched Pokémon.
  'ex1-39': { Thundershock: flipToInflict(20, 'paralyzed'), Gigashock: benchMany(2, 40, 10) },
  // Marshtomp – Bubble.
  'ex1-40': { Bubble: flipToInflict(10, 'paralyzed') },
  // Marshtomp – Aqua Sonic: no Resistance.
  'ex1-41': { 'Aqua Sonic': { run: (ctx) => void ctx.hit(20, { resistance: false }) } },
  // Mightyena – Ambush.
  'ex1-42': { Ambush: flipForMore(30, 30) },
  // Silcoon – Gooey Thread.
  'ex1-43': { 'Gooey Thread': noRetreat(10) },
  // Skitty – Minor Errand-Running: 2 basic Energy cards from the deck, shown; Lullaby.
  'ex1-44': {
    'Minor Errand-Running': {
      run(ctx) {
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Minor Errand-Running', filter: 'basicEnergy', reveal: true, count: 2, optional: true });
      },
    },
    Lullaby: inflicts(10, 'asleep'),
  },
  // Slakoth – Claw; Slack Off: every damage counter off Slakoth, and it can't attack next turn.
  'ex1-45': {
    Claw: flipOrNothing(20),
    'Slack Off': {
      run(ctx) {
        ctx.heal('all');
        restNextTurn(ctx);
      },
    },
  },
  // Vigoroth – Fury Swipes; Rage.
  'ex1-47': { 'Fury Swipes': perHeads(3, 20), Rage: rage(20) },
  // Wailmer – Rest: its Special Conditions and 4 damage counters off, then Asleep; Water Gun: 10 more for each Water Energy beyond the cost (at most 20).
  'ex1-48': {
    Rest: {
      run(ctx) {
        Object.assign(ctx.attacker, { condition: null, poison: 0, burned: false });
        delete ctx.attacker.paralyzedTurn;
        healUpTo(ctx, ctx.me, ctx.attacker, 40);
        ctx.sleepSelf();
      },
    },
    'Water Gun': { run: (ctx) => void ctx.hit(20 + 10 * extraEnergy(ctx, ['water', 'colorless'], 'water', 2)) },
  },
  // Aron – Teary Eyes: 10 less damage to Aron during the opponent's next turn.
  'ex1-49': {
    'Teary Eyes': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 10, until: ctx.turn + 1 };
        ctx.log(`Damage to ${ctx.attackerDef.name} is reduced by 10 next turn.`);
      },
    },
  },
  // Carvanha – Big Bite.
  'ex1-51': { 'Big Bite': noRetreat(10) },
  // Electrike – Super Thunder Wave.
  'ex1-53': { 'Super Thunder Wave': flipEachDefending('paralyzed') },
  // Koffing – Double-edge.
  'ex1-54': { 'Double-edge': recoil(30, 10) },
  // Goldeen – Flail: 10 for each damage counter on Goldeen.
  'ex1-55': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Makuhita – Fling: the opponent switches the Defending Pokémon with one of their Benched Pokémon.
  'ex1-57': { Fling: { run: (ctx) => opponentSwitches(ctx, 'Fling') } },
  // Makuhita – Fake Out.
  'ex1-58': { 'Fake Out': flipToInflict(10, 'paralyzed') },
  // Mudkip – Bubble.
  'ex1-59': { Bubble: flipToInflict(10, 'paralyzed') },
  // Mudkip – Fury Swipes.
  'ex1-60': { 'Fury Swipes': perHeads(3, 10) },
  // Numel – Burn Off.
  'ex1-61': { 'Burn Off': flipEachDefending('burned') },
  // Phanpy – Trembler: heads, 10 to each Defending Pokémon, and the Active one Paralyzed.
  'ex1-62': {
    Trembler: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Trembler did nothing.');
        eachDefending(ctx, 10);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Poochyena – Knock Off: heads, a card from the opponent's hand at random discarded.
  'ex1-64': {
    'Knock Off': {
      run(ctx) {
        if (ctx.flip()) discardAtRandom(ctx);
        else ctx.log('Knock Off did nothing.');
      },
    },
  },
  // Poochyena – Shadow Bind.
  'ex1-65': { 'Shadow Bind': noRetreat(10) },
  // Ralts – Confuse Ray.
  'ex1-66': { 'Confuse Ray': flipToInflict(10, 'confused') },
  // Ralts – Hypnoblast.
  'ex1-67': { Hypnoblast: inflicts(20, 'asleep') },
  // Ralts – Link Blast: 10 instead of 40 if Ralts and the Defending Pokémon have different amounts of Energy attached.
  'ex1-68': {
    'Link Blast': {
      run(ctx) {
        const differ = energyAmount(ctx, ctx.attacker) !== energyAmount(ctx, ctx.defender);
        if (differ) ctx.log("Link Blast's base damage is 10.");
        ctx.hit(differ ? 10 : 40);
      },
    },
  },
  // Shroomish – Sleep Powder.
  'ex1-69': { 'Sleep Powder': inflicts(10, 'asleep') },
  // Skitty – Plus Energy: a basic Energy card from the hand to 1 of its player's Pokémon.
  'ex1-70': {
    'Plus Energy': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: [...(s.attacker ? ['active' as const] : []), ...benchedSlots(s.ownBench)], prompt: 'Choose one of your Pokémon to attach a basic Energy card from your hand to' }],
      run(ctx) {
        const target = ctx.choices.ownTarget ?? 'active';
        if (ctx.me.hand.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromHand', source: 'Plus Energy', count: 1, basic: true, target });
        else ctx.log('There are no basic Energy cards in the hand.');
      },
    },
  },
  // Skitty – Lunge.
  'ex1-71': { Lunge: flipOrNothing(30) },
  // Torchic – Fireworks: tails, a Fire Energy card attached to Torchic discarded.
  'ex1-73': {
    Fireworks: {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) return;
        const [fire] = typedCards(ctx, 'fire');
        if (!fire) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== fire);
        ctx.me.discard.push(fire);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, fire.defId).name} from ${pokemonName(ctx.state, ctx.attacker)}.`);
      },
    },
  },
  // Torchic – Singe.
  'ex1-74': { Singe: flipToInflict(0, 'burned') },
  // Treecko – Poison Breath.
  'ex1-75': { 'Poison Breath': flipToInflict(0, 'poisoned') },
  // Wingull – Surprise Attack.
  'ex1-77': { 'Surprise Attack': flipOrNothing(20) },
  // Wurmple – Signs of Evolution: Silcoon and Beautifly, or Cascoon and Dustox, from the deck (1 or both of the pair, shown); Poison Barb.
  'ex1-78': {
    'Signs of Evolution': {
      choices: (): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt: 'Search for Silcoon and Beautifly? (No: Cascoon and Dustox)' }],
      run(ctx) {
        if (!ctx.me.deck.length) return;
        const name = ctx.choices.boost === false ? ['Cascoon', 'Dustox'] : ['Silcoon', 'Beautifly'];
        ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'named', name, count: 2, optional: true, reveal: true, distinct: 'name' });
      },
    },
    'Poison Barb': inflicts(0, 'poisoned'),
  },
  // Zigzagoon – Fury Swipes.
  'ex1-79': { 'Fury Swipes': perHeads(3, 10) },
  // Chansey ex – Healing Egg: 2 damage counters off each of its player's other Pokémon; Double-edge.
  'ex1-96': {
    'Healing Egg': {
      run(ctx) {
        for (const p of [ctx.me.active, ...ctx.me.bench]) if (p && p !== ctx.attacker) healUpTo(ctx, ctx.me, p, 20);
      },
    },
    'Double-edge': recoil(80, 60),
  },
  // Electabuzz ex – Thundershock; Quick Attack.
  'ex1-97': { Thundershock: flipToInflict(10, 'paralyzed'), 'Quick Attack': flipForMore(40, 20) },
  // Hitmonchan ex – Steady Punch; Sky Uppercut: no Resistance.
  'ex1-98': {
    'Steady Punch': flipForMore(10, 10),
    'Sky Uppercut': { run: (ctx) => void ctx.hit(50, { resistance: false }) },
  },
  // Lapras ex – Energy Ball: 10 more for each Energy beyond its cost of 1 (at most 20); Confuse Ray.
  'ex1-99': {
    'Energy Ball': { run: (ctx) => void ctx.hit(10 + Math.min(20, 10 * Math.max(0, energyAmount(ctx, ctx.attacker) - 1))) },
    'Confuse Ray': inflicts(30, 'confused'),
  },
  // Magmar ex – Smokescreen; Super Singe.
  'ex1-100': { Smokescreen: smokescreen(10), 'Super Singe': inflicts(40, 'burned') },
  // Mewtwo ex – Energy Absorption: up to 2 Energy cards from the discard pile to Mewtwo ex.
  'ex1-101': { 'Energy Absorption': energyAbsorption },
  // Scyther ex – Agility.
  'ex1-102': { Agility: flipToProtect(10, 'preventAll') },
  // Sneasel ex – Double Scratch; Beat Up: a coin for each of its player's Pokémon in play.
  'ex1-103': {
    'Double Scratch': perHeads(2, 10),
    'Beat Up': { run: (ctx) => void ctx.hit(20 * ctx.flips([ctx.me.active, ...ctx.me.bench].filter(Boolean).length)) },
  },
};
