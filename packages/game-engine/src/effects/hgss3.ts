// Undaunted (hgss3) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Solar Suggestion's damage counters are moved one at a time once the attack is over, as the player likes;
// Everyone Explode Now counts Forretress itself and does its 30 to it too; Lava Flow's Fire Energy cards are picked before
// the attack; Blessed Wings heals every one of the player's Pokémon, then shuffles Togekiss away; Moonlight Fang keeps off
// attacks of Pokémon with a printed Poké-Power or Poké-Body; Plasma Arrow counts the Energy the chosen Pokémon provides;
// Sludge Drag's Pokémon is picked by the attacking player, and with no Benched Pokémon nothing happens; Selfish Draw's card
// is taken or discarded once the attack is over; Rambunctious Party's Basic Pokémon are picked one at a time, the player
// stopping when they like (agreed 2026-10-25); Plead asks the opponent before the attack.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, isBasicPokemon, lookupCard, namesMatch } from '../cards.js';
import { energyPool, newInPlay, type Target } from '../engine.js';
import { nextRandom, shuffle } from '../rng.js';
import { clearSpecialConditions, inPlayDef, openBenchSlot } from '../status.js';
import { benchedSlots, flipToProtect, headsUntilTails, inPlay, opponentBenchChoice, opponentSwitches, opponentTargets, same } from './common.js';
import { DP4 } from './dp4.js';
import { DP7 } from './dp7.js';
import { removeDefenderEnergy, shuffleIntoDeck } from './dp1.js';
import { EX1 } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX8 } from './ex8.js';
import { GYM1 } from './gym1.js';
import { fly, healUpTo } from './si1.js';

const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const conditions = (p: AttackContext['defender']) => (p.condition ? 1 : 0) + (p.poison ? 1 : 0) + (p.burned ? 1 : 0);
const boosted = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
const fromEevee = (ctx: AttackContext, p: AttackContext['attacker']) => namesMatch(inPlayDef(ctx.state.cards, p).evolvesFrom ?? '', 'Eevee');

/** Mega Tidal Wave: the opponent's top 5 cards discarded, 30 to each of their Benched Pokémon for each Energy card among them. */
const megaTidalWave: AttackEffect = {
  run(ctx) {
    const top = ctx.opp.deck.splice(0, 5);
    ctx.opp.discard.push(...top);
    const energy = top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length;
    ctx.log(`Discarded the top ${top.length} cards of the deck${top.length ? ` (${top.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')})` : ''}.`, ctx.opp.id);
    if (energy) for (const slot of benchedSlots(ctx.opp.bench)) ctx.damageBenched(ctx.opp, slot, 30 * energy);
  },
};

export const HGSS3: Record<string, Record<string, AttackEffect>> = {
  // Espeon – Solar Suggestion: up to 4 damage counters moved from the player's Pokémon to the opponent's.
  'hgss3-2': {
    'Solar Suggestion': {
      run(ctx) {
        if (inPlay(ctx.me).some((p) => p.damage > 0) && inPlay(ctx.opp).length) ctx.pend({ kind: 'moveCounters', source: 'Solar Suggestion', count: 4 });
      },
    },
  },
  // Forretress – Everyone Explode Now: 30 for each Pineco and Forretress in play, 30 to each of them.
  'hgss3-3': {
    'Everyone Explode Now': {
      run(ctx) {
        const bomb = (p: AttackContext['attacker']) => ['Pineco', 'Forretress'].some((n) => namesMatch(inPlayDef(ctx.state.cards, p).name, n));
        ctx.hit(30 * inPlay(ctx.me).filter(bomb).length);
        if (bomb(ctx.attacker)) ctx.selfDamage(30);
        for (const slot of benchedSlots(ctx.me.bench)) if (bomb(ctx.me.bench[slot]!)) ctx.damageBenched(ctx.me, slot, 30);
      },
    },
  },
  // Gliscor – Ninja Fang: Paralyzed if it had no damage counters and is damaged.
  'hgss3-4': {
    'Ninja Fang': {
      run(ctx) {
        const clean = ctx.defender.damage === 0;
        if (ctx.hit(30) > 0 && clean) ctx.inflict('paralyzed');
      },
    },
  },
  // Houndoom – Dark Roar: the opponent discards a card from their hand.
  'hgss3-5': {
    'Dark Roar': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.opp.hand.length) ctx.opponentChooses({ kind: 'discardFromHand', source: 'Dark Roar', count: 1 });
      },
    },
  },
  // Magcargo – Lava Flow: any Fire Energy cards discarded, 20 more for each.
  'hgss3-6': {
    'Lava Flow': {
      choices(s): ChoiceSpec[] {
        const fire = s.attacker.energy.filter((e) => !e.provides && energyCardOf(s.cards, e, 'fire'));
        return fire.length ? [{ kind: 'ownEnergyUpTo', options: fire, prompt: 'You may choose any Fire Energy cards to discard (20 more damage each)' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && !e.provides && energyCardOf(ctx.state.cards, e, 'fire'));
        discardOwn(ctx, gone);
        ctx.hit(60 + 20 * gone.length);
      },
    },
  },
  // Togekiss – Blessed Wings: all damage counters off each of the player's Pokémon, then Togekiss shuffled into the deck.
  'hgss3-9': {
    'Blessed Wings': {
      run(ctx) {
        for (const p of inPlay(ctx.me)) if (p.damage) healUpTo(ctx, ctx.me, p, p.damage);
        ctx.after(() => ctx.me.active === ctx.attacker && shuffleIntoDeck(ctx, ctx.me, ctx.attacker));
      },
    },
  },
  // Umbreon – Moonlight Fang: nothing from the opponent's Pokémon with a Poké-Power or Poké-Body next turn. Quick Blow: heads, 30 more.
  'hgss3-10': {
    'Moonlight Fang': {
      run(ctx) {
        ctx.hit(30);
        (ctx.attacker.effects ??= {}).moonlightFang = ctx.turn + 1;
      },
    },
    'Quick Blow': { run: (ctx) => void ctx.hit(ctx.flip() ? 60 : 30) },
  },
  // Dodrio – Incessant Peck: coins until tails, 20 more for each heads.
  'hgss3-11': { 'Incessant Peck': { run: (ctx) => void ctx.hit(20 + 20 * headsUntilTails(ctx)) } },
  // Drifblim – Take Away: as Gym Heroes Misty's Tentacruel's.
  'hgss3-12': { 'Take Away': same(() => GYM1['gym1-4']?.['Take Away']) },
  // Forretress – Gyro Ball: may switch with a Benched Pokémon; then the opponent switches too.
  'hgss3-13': {
    'Gyro Ball': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: [-1, ...benchedSlots(s.ownBench)], optional: true, prompt: 'You may choose one of your Benched Pokémon to switch Forretress with' }] : []),
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || slot < 0 || !ctx.me.bench[slot]) return;
        ctx.switchOwn(slot);
        opponentSwitches(ctx, 'Gyro Ball');
      },
    },
  },
  // Honchkrow – Vengeance: 10 more for each Darkness Pokémon in the discard pile.
  'hgss3-16': {
    Vengeance: {
      run(ctx) {
        const dark = ctx.me.discard.filter((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'pokemon' && hasType(d, 'darkness');
        }).length;
        ctx.hit(10 + 10 * dark);
      },
    },
  },
  // Leafeon – Miasma Wind: 50 for each Special Condition on the Defending Pokémon.
  'hgss3-17': { 'Miasma Wind': { run: (ctx) => void ctx.hit(50 * conditions(ctx.defender)) } },
  // Mismagius – Poltergeist: as Stormfront Mismagius's.
  'hgss3-19': { Poltergeist: same(() => DP7['dp7-18']?.['Poltergeist']) },
  // Rotom – Plasma Arrow: 20 for each Energy on one of the opponent's Pokémon, no Weakness or Resistance.
  'hgss3-20': {
    'Plasma Arrow': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon (20 damage for each Energy attached to it)"),
      run(ctx) {
        const target = ctx.choices.oppTarget ?? 'active';
        const p = theirs(ctx, target);
        if (!p) return;
        const amount = 20 * energyPool(p, ctx.state.cards).length;
        if (target === 'active') ctx.hit(amount, { weakness: false, resistance: false });
        else if (amount) ctx.damageBenched(ctx.opp, target, amount);
      },
    },
  },
  // Tropius – Fresh-Picked Fruit: 6 damage counters off one of the player's Benched Pokémon.
  'hgss3-22': {
    'Fresh-Picked Fruit': {
      choices: (s): ChoiceSpec[] => {
        const hurt = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage > 0);
        return hurt.length ? [{ kind: 'ownBench', options: hurt, prompt: 'Fresh-Picked Fruit: choose one of your Benched Pokémon to remove 6 damage counters from' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (p) healUpTo(ctx, ctx.me, p, 60);
      },
    },
  },
  // Vespiquen – Mach Wind: no Retreat Cost during the player's next turn.
  'hgss3-23': {
    'Mach Wind': {
      run(ctx) {
        ctx.hit(60);
        (ctx.attacker.effects ??= {}).hoverHit = ctx.turn + 2;
      },
    },
  },
  // Gloom – Miracle Powder: heads, the Special Condition chosen.
  'hgss3-27': {
    'Miracle Powder': {
      choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon (on heads)' }],
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Muk – Sludge Drag: one of the opponent's Benched Pokémon switched in, Confused and Poisoned.
  'hgss3-31': {
    'Sludge Drag': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot]) return ctx.log('Sludge Drag did nothing.');
        const before = ctx.opp.active;
        ctx.switchDefender(slot);
        if (ctx.opp.active === before) return;
        ctx.inflict('confused');
        ctx.inflict('poisoned');
      },
    },
  },
  // Raticate – Razor-Sharp Incisors: 10 for each damage counter on the Defending Pokémon. Gnaw Up: a Special Energy card discarded from it.
  'hgss3-34': {
    'Razor-Sharp Incisors': { run: (ctx) => void ctx.hit(ctx.defender.damage) },
    'Gnaw Up': {
      run(ctx) {
        ctx.hit(30);
        removeDefenderEnergy(ctx, 1, 'Gnaw Up', { onlySpecial: true });
      },
    },
  },
  // Sableye – Pull Out: as Great Encounters'. Dark Hand: 30 more with more cards in the hand than the opponent.
  'hgss3-35': {
    'Pull Out': same(() => DP4['dp4-96']?.['Pull Out']),
    'Dark Hand': { run: (ctx) => void ctx.hit(ctx.me.hand.length > ctx.opp.hand.length ? 50 : 20) },
  },
  // Scyther – Afterimage Strike: next turn, a flip as an attack would damage it; heads prevents the damage (Dodge).
  'hgss3-36': {
    'Afterimage Strike': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).dodge = ctx.turn + 1;
      },
    },
  },
  // Slowbro – Full-Belly Refresh: every Special Condition and 3 damage counters off it.
  'hgss3-38': {
    'Full-Belly Refresh': {
      run(ctx) {
        clearSpecialConditions(ctx.attacker);
        ctx.heal(30);
        ctx.log(`${ctx.attackerDef.name} recovered from its Special Conditions.`);
      },
    },
  },
  // Togetic – Chase Up: as EX Deoxys Togetic's Seek Out. Fly: as Southern Islands'.
  'hgss3-39': { 'Chase Up': same(() => EX8['ex8-12']?.['Seek Out']), Fly: fly(30) },
  // Combee – Enraged Assault: with a damaged Vespiquen on the Bench, 60 more and Poisoned.
  'hgss3-44': {
    'Enraged Assault': {
      run(ctx) {
        const angry = ctx.me.bench.some((p) => p && p.damage > 0 && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Vespiquen'));
        ctx.hit(angry ? 80 : 20);
        if (angry) ctx.inflict('poisoned');
      },
    },
  },
  // Drifloon – Pull: heads, one of the opponent's Benched Pokémon switched in.
  'hgss3-46': {
    Pull: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in (if heads)"),
      run(ctx) {
        if (ctx.flip() && ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
      },
    },
  },
  // Grimer – Sticky Liquid: the Defending Pokémon costs 1 more to retreat next turn.
  'hgss3-50': { 'Sticky Liquid': { run: (ctx) => ctx.affectDefender((e) => (e.heavier = ctx.turn + 1)) } },
  // Hitmonchan – Detect: heads, no effects of attacks to it next turn.
  'hgss3-51': { Detect: flipToProtect(0, 'preventAll') },
  // Mawile – Selfish Draw: the top card into the hand, or discarded and a card drawn.
  'hgss3-56': {
    'Selfish Draw': {
      run(ctx) {
        const top = ctx.me.deck[0];
        if (top) ctx.pend({ kind: 'pickFromTop', source: 'Selfish Draw', looked: [top.uid], take: 1, elseDraw: true });
      },
    },
  },
  // Misdreavus – Dual Draw: each player draws 3 cards.
  'hgss3-57': {
    'Dual Draw': {
      run(ctx) {
        ctx.draw(3);
        const drawn = ctx.opp.deck.splice(0, 3);
        ctx.opp.hand.push(...drawn);
        ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, ctx.opp.id);
      },
    },
  },
  // Murkrow – Astonish: heads, a card from the opponent's hand at random shuffled into their deck.
  'hgss3-58': {
    Astonish: {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip() || !ctx.opp.hand.length) return;
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        const [card] = ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1);
        ctx.log(`Astonish chose ${lookupCard(ctx.state.cards, card!.defId).name}.`);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, card!], ctx.state.rngState);
        ctx.log("Shuffled a card from the opponent's hand into their deck.", ctx.opp.id);
      },
    },
  },
  // Oddish – Find a Friend: heads, a Grass Pokémon from the deck, shown.
  'hgss3-60': {
    'Find a Friend': {
      run(ctx) {
        if (!ctx.flip() || !ctx.me.deck.length) return ctx.log('Find a Friend did nothing.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Find a Friend', filter: 'pokemonType', type: 'grass', reveal: true, optional: true });
      },
    },
  },
  // Pineco – Focus Energy: Surprise Attack's base damage is 80 next turn. Surprise Attack: tails, nothing.
  'hgss3-63': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Surprise Attack', turn: ctx.turn + 2 };
        ctx.log("Pineco's Surprise Attack's base damage is 80 next turn.");
      },
    },
    'Surprise Attack': {
      run(ctx) {
        if (ctx.flip()) ctx.hit(boosted(ctx, 'Surprise Attack') ? 80 : 40);
      },
    },
  },
  // Slowpoke – Rambunctious Party: the Basic Pokémon among the top 5 cards onto the Bench; the rest shuffled back.
  'hgss3-66': {
    'Rambunctious Party': {
      run(ctx) {
        const top = ctx.me.deck.slice(0, 5);
        ctx.log(`Rambunctious Party shows ${top.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
        if (top.some((c) => isBasicPokemon(lookupCard(ctx.state.cards, c.defId))) && openBenchSlot(ctx.me, ctx.state.cards, ctx.state.stadium?.card) >= 0) ctx.pend({ kind: 'pickFromTop', source: 'Rambunctious Party', looked: top.map((c) => c.uid), take: 5, toBench: true });
        else [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      },
    },
  },
  // Sneasel – Beat Up: as EX Ruby & Sapphire Sneasel ex's.
  'hgss3-68': { 'Beat Up': same(() => EX1['ex1-103']?.['Beat Up']) },
  // Togepi – Plead: the opponent's answer; yes, 2 cards drawn; no, 20 to the Defending Pokémon.
  'hgss3-70': {
    Plead: {
      askOpponent: 'plead',
      run(ctx) {
        if (ctx.choices.answer === 0) ctx.draw(2);
        else ctx.hit(20);
      },
    },
  },
  // Umbreon – Evoblast: 10 more for each of the player's Pokémon in play that evolves from Eevee.
  'hgss3-86': { Evoblast: { run: (ctx) => void ctx.hit(50 + 10 * inPlay(ctx.me).filter((p) => fromEevee(ctx, p)).length) } },
  // Kyogre & Groudon LEGEND – Mega Tidal Wave (on both halves).
  'hgss3-87': { 'Mega Tidal Wave': megaTidalWave },
  'hgss3-88': { 'Mega Tidal Wave': megaTidalWave },
};
