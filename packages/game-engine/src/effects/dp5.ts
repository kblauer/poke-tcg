// Majestic Dawn (dp5) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" moves and discards are asked before the attack, and the Energy cards discarded (the attacker's and
// the Defending Pokémon's) are picked when the cards that fit differ (the same-card rule, agreed); Evolution Wish plays as Make a Wish (EX Hidden Legends Jirachi's, the usual limits) without its damage counter;
// Fountain's cards go only to the Benched Pokémon; Mega Bravo counts the Fire Energy cards discarded; Pearl Blast's own card is picked
// too; Restore's Pokémon plays as a Basic Pokémon, its Energy cards attached at once.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch } from '../cards.js';
import { isSpecialEnergy, type InPlayPokemon, type Target } from '../engine.js';
import { inPlayDef } from '../status.js';
import { benchedSlots, energyCards, headsUntilTails, inPlay, opponentBenchChoice, same } from './common.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { DP4 } from './dp4.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX4 } from './ex4.js';
import { EX6 } from './ex6.js';
import { healUpTo } from './si1.js';

/** A yes-or-no question asked before the attack: yes first. */
const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
/** The player's Pokémon in play, as targets. */
const ownTargets = (s: { attacker: InPlayPokemon; ownBench: (InPlayPokemon | null)[] }): Target[] => ['active', ...benchedSlots(s.ownBench)];
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
/** The player has a Pokémon of this name on the Bench (Plusle, Minun). */
const benched = (ctx: { me: { bench: (InPlayPokemon | null)[] }; state: { cards: Parameters<typeof inPlayDef>[0] } }, name: string) => ctx.me.bench.some((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, name));

export const DP5: Record<string, Record<string, AttackEffect>> = {
  // Articuno – Blizzard: heads, 10 to each of the opponent's Benched Pokémon; tails, to each of the player's.
  'dp5-1': {
    Blizzard: {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) ctx.benchDamage(ctx.opp, 10);
        else ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Darkrai – Dark Slumber: the Defending Pokémon Asleep at the end of the opponent's next turn. Dark Resolve: against an Asleep Pokémon, 4 damage counters off Darkrai.
  'dp5-3': {
    'Dark Slumber': {
      run(ctx) {
        ctx.hit(10);
        ctx.affectDefender((e) => {
          e.delayed = { affliction: 'asleep', turn: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name} will be Asleep at the end of your opponent's next turn.`, ctx.opp.id);
        });
      },
    },
    'Dark Resolve': {
      run(ctx) {
        const asleep = ctx.defender.condition === 'asleep';
        ctx.hit(40);
        if (asleep) healUpTo(ctx, ctx.me, ctx.attacker, 40);
      },
    },
  },
  // Manaphy – Chase Up: as Great Encounters Delibird's Present. Fountain: up to 2 basic Water Energy cards from the hand to the Benched Pokémon.
  'dp5-8': {
    'Chase Up': same(() => DP4['dp4-36']?.Present),
    Fountain: {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.bench.some(Boolean) && ctx.me.hand.some((c) => energyCardOf(ctx.state.cards, c, 'water'))) ctx.pend({ kind: 'attachFromHand', source: 'Fountain', type: 'water', basic: true, count: 2, anyTarget: true, benchOnly: true });
      },
    },
  },
  // Mewtwo – Recover: a Psychic Energy discarded, 6 damage counters off.
  'dp5-9': { Recover: { discard: { count: 1, type: 'psychic' }, run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 60) } },
  // Palkia – Pearl Blast: may return an Energy card to the hand, then one of the Defending Pokémon's to the opponent's.
  'dp5-11': {
    'Pearl Blast': {
      choices: (s, c): ChoiceSpec[] =>
        energyCards(s.attacker).length && energyCards(s.defender).length
          ? [
              may("Pearl Blast: return an Energy card on Palkia to your hand, and one on the Defending Pokémon to your opponent's?"),
              ...(c.boost
                ? ([
                    { kind: 'ownEnergy', count: 1, options: energyCards(s.attacker), prompt: 'Choose the Energy card on Palkia to return to your hand' },
                    { kind: 'defenderEnergy', options: energyCards(s.defender), prompt: "Choose the Energy card to return to your opponent's hand" },
                  ] satisfies ChoiceSpec[])
                : []),
            ]
          : [],
      run(ctx) {
        ctx.hit(60);
        const theirs = ctx.defender.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        const own = energyCards(ctx.attacker).find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!ctx.choices.boost || !own) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== own);
        ctx.me.hand.push(own);
        ctx.log(`Returned ${lookupCard(ctx.state.cards, own.defId).name} to the hand.`);
        if (!theirs) return;
        ctx.affectDefender(() => {
          ctx.defender.energy = ctx.defender.energy.filter((e) => e !== theirs);
          ctx.opp.hand.push(theirs);
          ctx.log(`Returned ${lookupCard(ctx.state.cards, theirs.defId).name} to the hand.`, ctx.opp.id);
        });
      },
    },
  },
  // Phione – Evolution Wish: a card from the deck that evolves from one of the player's Pokémon put onto it.
  'dp5-12': {
    'Evolution Wish': {
      run(ctx) {
        const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
        if (ctx.me.deck.length) ctx.pend({ kind: 'evolveMany', source: 'Evolution Wish', names, done: [], once: true, limits: true });
      },
    },
  },
  // Rotom – Dual Trans: up to 2 basic Energy cards from the discard pile attached to one of the player's Pokémon.
  'dp5-13': {
    'Dual Trans': {
      choices: (s): ChoiceSpec[] => (s.discardsLocked ? [] : [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to attach basic Energy cards to' }]),
      run(ctx) {
        const t = ctx.choices.ownTarget ?? 'active';
        if (mine(ctx, t) && ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId))))
          ctx.pend({ kind: 'attachFromDiscard', source: 'Dual Trans', count: 2, target: t });
      },
    },
  },
  // Zapdos – Raging Thunder: 40 to one of the player's Pokémon, without Weakness or Resistance.
  'dp5-14': {
    'Raging Thunder': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to do 40 damage to' }],
      run(ctx) {
        ctx.hit(80);
        const t = ctx.choices.ownTarget ?? 'active';
        if (t === 'active') return ctx.selfDamage(40);
        const p = ctx.me.bench[t];
        if (p) ctx.damageBenched(ctx.me, t, 40);
      },
    },
  },
  // Bronzong – Pain Amplifier: as EX Team Magma vs Team Aqua Team Aqua's Banette's.
  'dp5-16': { 'Pain Amplifier': same(() => EX4['ex4-32']?.['Pain Amplifier']) },
  // Empoleon – Surf Together: 10 more for each Benched Pokémon; tails, 10 to each of them.
  'dp5-17': {
    'Surf Together': {
      run(ctx) {
        ctx.hit(50 + 10 * ctx.me.bench.filter(Boolean).length);
        if (!ctx.flip()) ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Espeon – Morning Sun: may move an Energy card to one of the Benched Pokémon.
  'dp5-18': {
    'Morning Sun': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        if (!options.length || !energyCards(s.attacker).length) return [];
        return [
          { kind: 'ownBench', options: [-1, ...options], optional: true, prompt: 'You may choose one of your Benched Pokémon to move an Energy card to' },
          { kind: 'ownEnergy', count: 1, options: energyCards(s.attacker), prompt: 'Choose the Energy card to move' },
        ];
      },
      run(ctx) {
        ctx.hit(60);
        const slot = ctx.choices.ownBenchSlot;
        const to = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        const card = ctx.attacker.energy.find((e) => e.uid === ctx.choices.energyUids?.[0]);
        if (!to || !card) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${inPlayDef(ctx.state.cards, to).name}.`);
      },
    },
  },
  // Flareon – Kindle: an Energy card discarded from Flareon, then one from the Defending Pokémon.
  'dp5-19': {
    Kindle: {
      choices: (s): ChoiceSpec[] => (energyCards(s.defender).length ? [{ kind: 'defenderEnergy', options: energyCards(s.defender), prompt: 'Choose an Energy card to discard from the Defending Pokémon' }] : []),
      run(ctx) {
        ctx.hit(70);
        discardOwnEnergy(ctx, 1, 'Kindle');
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Infernape – Mega Bravo: every Fire Energy discarded, 40 for each.
  'dp5-22': {
    'Mega Bravo': {
      run(ctx) {
        const fire = ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'fire'));
        discardOwn(ctx, fire);
        ctx.hit(40 * fire.length);
      },
    },
  },
  // Jolteon – Lightning Strike: may discard 2 Energy cards for base 90.
  'dp5-23': {
    'Lightning Strike': {
      choices: (s) => (energyCards(s.attacker).length >= 2 ? [may('Lightning Strike: discard 2 Energy cards for 90 damage?')] : []),
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(50);
        discardOwnEnergy(ctx, 2, 'Lightning Strike');
        ctx.hit(90);
      },
    },
  },
  // Minun – (+) Spark: with Plusle on the Bench, 20 to one of the opponent's Benched Pokémon too.
  'dp5-25': {
    '(+) Spark': {
      choices: (s) => (s.ownBench.some((p) => p && namesMatch(inPlayDef(s.cards, p).name, 'Plusle')) ? opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to") : []),
      run(ctx) {
        ctx.hit(20);
        if (benched(ctx, 'Plusle') && ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
      },
    },
  },
  // Plusle – (-) Boost: 20 more with Minun on the Bench.
  'dp5-28': { '(-) Boost': { run: (ctx) => void ctx.hit(benched(ctx, 'Minun') ? 40 : 20) } },
  // Scizor – Special Blow: 50 more against a Special Energy card.
  'dp5-29': { 'Special Blow': { run: (ctx) => void ctx.hit(ctx.defender.energy.some((e) => isSpecialEnergy(ctx.state.cards, e)) ? 80 : 30) } },
  // Toxicroak – Paralyze Poison: Poisoned; heads, Paralyzed too.
  'dp5-31': {
    'Paralyze Poison': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('poisoned');
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Unown P – Hidden Power: each player's top card discarded, 20 more for each Unown.
  'dp5-33': {
    'Hidden Power': {
      run(ctx) {
        let unown = 0;
        for (const side of [ctx.me, ctx.opp]) {
          const top = side.deck.shift();
          if (!top) continue;
          side.discard.push(top);
          const name = lookupCard(ctx.state.cards, top.defId).name;
          ctx.log(`Discarded ${name} from the top of the deck.`, side.id);
          if (name.startsWith('Unown')) unown++;
        }
        ctx.hit(20 + 20 * unown);
      },
    },
  },
  // Vaporeon – Hyper Whirlpool: coins until tails, an Energy card of the Defending Pokémon discarded for each heads.
  'dp5-34': {
    'Hyper Whirlpool': {
      run(ctx) {
        ctx.hit(60);
        const heads = headsUntilTails(ctx);
        removeDefenderEnergy(ctx, heads, 'Hyper Whirlpool');
      },
    },
  },
  // Grotle – Planting: a Grass Energy card from the hand attached to one of the player's Pokémon.
  'dp5-37': {
    Planting: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.me.hand.some((c) => energyCardOf(ctx.state.cards, c, 'grass'))) ctx.pend({ kind: 'attachFromHand', source: 'Planting', types: ['grass'], count: 1, anyTarget: true });
      },
    },
  },
  // Manectric – Volt Crush: heads, an Energy card discarded and 30 more.
  'dp5-40': {
    'Volt Crush': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(40);
        discardOwnEnergy(ctx, 1, 'Volt Crush');
        ctx.hit(70);
      },
    },
  },
  // Mothim – Get Help: 30 for each type of Wormadam on the Bench.
  'dp5-42': { 'Get Help': { run: (ctx) => void ctx.hit(30 * new Set(ctx.me.bench.flatMap((p) => (p && inPlayDef(ctx.state.cards, p).name.startsWith('Wormadam') ? [inPlayDef(ctx.state.cards, p).name] : []))).size) } },
  // Pachirisu – Trans Tail: a Lightning Energy card from the discard pile into the hand, shown.
  'dp5-43': {
    'Trans Tail': {
      run(ctx) {
        if (ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'lightning'))) ctx.pend({ kind: 'discardToHand', source: 'Trans Tail', count: 1, filter: 'lightningEnergy', reveal: true });
        else ctx.log('Trans Tail found nothing.');
      },
    },
  },
  // Scyther – Fury Cutter: as EX FireRed & LeafGreen Scyther's.
  'dp5-46': { 'Fury Cutter': same(() => EX6['ex6-29']?.['Fury Cutter']) },
  // Aipom – Hand Trick: Aipom and its cards back into the hand (nothing without Benched Pokémon).
  'dp5-50': {
    'Hand Trick': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.me.bench.some(Boolean)) return;
        const p = ctx.attacker;
        ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
        ctx.me.active = null;
        ctx.log('Aipom and its cards went back into the hand.');
      },
    },
  },
  // Drifloon – Delivery: heads, any card from the discard pile into the hand.
  'dp5-61': {
    Delivery: {
      run(ctx) {
        if (!ctx.flip() || !ctx.me.discard.length) return ctx.log('Delivery did nothing.');
        ctx.pend({ kind: 'discardToHand', source: 'Delivery', count: 1, filter: 'any' });
      },
    },
  },
  // Eevee – Call for Family: any number of Eevee from the deck onto the Bench.
  'dp5-62': { 'Call for Family': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicNamed', name: 'Eevee', toBench: true, optional: true, count: 5 })) } },
  // Garchomp LV.X – Restore: a Pokémon (not LV.X) from the discard pile onto the Bench as a Basic Pokémon, then up to 3 basic Energy cards on it.
  'dp5-97': {
    Restore: {
      run(ctx) {
        if (ctx.me.bench.every(Boolean)) return ctx.log('Your Bench is full.');
        ctx.pend({ kind: 'discardToBench', source: 'Restore', filter: 'restore', energy: 3 });
      },
    },
  },
  // Leafeon LV.X – Verdant Dance: 10 more for each Energy on all of the player's Pokémon.
  'dp5-99': { 'Verdant Dance': { run: (ctx) => void ctx.hit(30 + 10 * inPlay(ctx.me).reduce((n, p) => n + energyAmount(ctx, p), 0)) } },
};
