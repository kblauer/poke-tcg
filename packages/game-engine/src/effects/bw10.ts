// Plasma Blast (bw10) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Plasma Energy attached is counted with Plasma Storm's isPlasmaEnergy (plasmaEnergy, bw9.ts); a Team Plasma Pokémon is one
// with Team Plasma on its card or Team Plasma Badge attached (isPlasmaPokemon); Lifesplosion finds a Stage 2 Pokémon for
// each Energy attached (Energy provided, as "Energy attached" counts for every set), while the Bench has room; Retribution
// looks at the Pokémon Knocked Out by damage from the opponent's attack during their last turn (an Escavalier, any variant);
// Fossil Hunt and Fossil Clutch take Item cards with Fossil in their names (Plume Fossil, Root Fossil Lileep…); Crush and Burn
// discards Energy cards from any of the player's Pokémon; Psyjamming moves the Special Energy cards one at a time until the
// player stops (the CPUs move none); Shoulder Throw counts the Defending Pokémon's Retreat Cost as it is now; Strike of the
// Champion Knocks the Pokémon Out without damage.
import type { AttackEffect, ChoiceSpec } from '../attacks.js';
import { lookupCard, namesMatch } from '../cards.js';
import { counts, discardTool, energyPool, isSpecialEnergy, retireStadium, retreatCost, toolOf, type CardInstance } from '../engine.js';
import { inPlayDef, isPlasmaPokemon, openBenchSlot, pokemonName } from '../status.js';
import { isItemCard } from '../trainers.js';
import { benchedSlots, energyCanMove, energyCards, inPlay, opponentBenchChoice } from './common.js';
import { energyCardOf } from './ex2.js';
import { discardFree, reachesDefender } from './neo3.js';
import { plasmaEnergy } from './bw9.js';

/** An Item card with Fossil in its name (Fossil Hunt, Fossil Clutch). */
const fossilItem = (cards: Parameters<typeof isItemCard>[0], c: CardInstance) => isItemCard(cards, c) && lookupCard(cards, c.defId).name.includes('Fossil');

/** `more` more damage against a Team Plasma Pokémon (Kick of Righteousness, Blazing Claws). */
const againstPlasma = (damage: number, more: number, burn = false): AttackEffect => ({
  run(ctx) {
    const plasma = isPlasmaPokemon(ctx.state.cards, ctx.defender);
    ctx.hit(damage + (plasma ? more : 0));
    if (plasma && burn) ctx.inflict('burned');
  },
});

export const BW10: Record<string, Record<string, AttackEffect>> = {
  // Cradily – Lifesplosion: a Stage 2 Pokémon from the deck onto the Bench for each Energy attached to it.
  'bw10-4': {
    Lifesplosion: {
      blocked: (s) => (openBenchSlot({ bench: s.ownBench, benchLimit: s.ownBenchLimit }, s.cards, s.stadium) < 0 ? 'Your Bench is full' : energyPool(s.attacker, s.cards).length ? null : 'Cradily has no Energy attached'),
      run(ctx) {
        const n = energyPool(ctx.attacker, ctx.state.cards).length;
        if (n && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Lifesplosion', filter: 'stage2', toBench: true, count: n, optional: true });
      },
    },
  },
  // Accelgor – Retribution: after the opponent's attack Knocked Out an Escavalier during their last turn, all Energy attached to
  // the Defending Pokémon into the opponent's hand.
  'bw10-8': {
    Retribution: {
      run(ctx) {
        ctx.hit(20);
        const avenged = ctx.me.knockedOutByAttack === ctx.turn - 1 && (ctx.me.knockedOutByAttackNames ?? []).some((n) => namesMatch(n, 'Escavalier'));
        const defender = ctx.opp.active;
        if (!avenged || !defender || !defender.energy.length || !reachesDefender(ctx) || !energyCanMove(ctx, defender)) return;
        const energy = defender.energy.map(({ provides: _, ...c }) => c);
        defender.energy = [];
        ctx.opp.hand.push(...energy);
        ctx.log(`Retribution: ${energy.length} Energy card${energy.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, defender)} into the hand.`, ctx.opp.id);
      },
    },
  },
  // Virizion-EX – Emerald Slash: up to 2 Grass Energy cards from the deck onto one of the player's Benched Pokémon.
  'bw10-9': {
    'Emerald Slash': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.me.deck.length && ctx.me.bench.some(Boolean)) ctx.pend({ kind: 'pickFromDeck', source: 'Emerald Slash', filter: 'energyType', type: 'grass', attach: true, attachSame: true, attachOnly: { bench: true }, count: 2, optional: true });
      },
    },
  },
  // Genesect – Call for Family: up to 2 Grass Basic Pokémon from the deck onto the Bench.
  'bw10-10': {
    'Call for Family': {
      blocked: (s) => (openBenchSlot({ bench: s.ownBench, benchLimit: s.ownBenchLimit }, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicType', type: 'grass', toBench: true, count: 2, optional: true })),
    },
  },
  // Volcarona – Solar Transporter: the Team Plasma cards among the top 5 into the hand, the rest discarded.
  'bw10-13': {
    'Solar Transporter': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 5);
        const plasma = top.filter((c) => !!lookupCard(ctx.state.cards, c.defId).teamPlasma);
        ctx.me.hand.push(...plasma);
        ctx.me.discard.push(...top.filter((c) => !plasma.includes(c)));
        ctx.log(`Solar Transporter: ${plasma.length ? `took ${plasma.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}` : 'no Team Plasma cards'}; discarded ${top.length - plasma.length}.`);
      },
    },
  },
  // Glalie – Reflect Energy: a Water Energy moved from it to one of the player's Benched Pokémon.
  'bw10-22': {
    'Reflect Energy': {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        const water = energyCards(s.attacker).filter((e) => energyCardOf(s.cards, e, 'water'));
        return bench.length && water.length
          ? [
              { kind: 'ownEnergy', count: 1, options: water, prompt: 'Reflect Energy: choose a Water Energy to move from Glalie' },
              { kind: 'ownBench', options: bench, prompt: 'Move it to which of your Benched Pokémon?' },
            ]
          : [];
      },
      run(ctx) {
        ctx.hit(60);
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        const to = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (!card || !to || ctx.me.active !== ctx.attacker) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Relicanth – Fossil Hunt: 2 Item cards with Fossil in their names from the discard pile into the hand.
  'bw10-24': {
    'Fossil Hunt': {
      choices(s): ChoiceSpec[] {
        const options = s.discardsLocked ? [] : s.ownDiscard.filter((c) => fossilItem(s.cards, c));
        const n = Math.min(2, options.length);
        return n ? [{ kind: 'ownDiscard', min: n, max: n, options, prompt: `Fossil Hunt: choose ${n} Item card${n === 1 ? '' : 's'} with Fossil in ${n === 1 ? 'its name' : 'their names'}` }] : [];
      },
      run(ctx) {
        const taken = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid) && fossilItem(ctx.state.cards, c)).slice(0, 2);
        if (!taken.length || !discardFree(ctx)) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
        ctx.me.hand.push(...taken);
        ctx.log(`Put ${taken.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the discard pile into the hand.`);
      },
    },
  },
  // Carracosta – Fossil Clutch: an Item card with Fossil in its name may be discarded from the hand for 50 more.
  'bw10-28': {
    'Fossil Clutch': {
      choices(s): ChoiceSpec[] {
        const cards = (s.ownHand ?? []).filter((c) => fossilItem(s.cards, c));
        if (!cards.length) return [];
        return [{ kind: 'amount', options: [-1, ...cards.map((_, i) => i)], labels: ["Don't discard", ...cards.map((c) => lookupCard(s.cards, c.defId).name)], prompt: 'Fossil Clutch: you may discard an Item card with Fossil in its name for 50 more damage' }];
      },
      run(ctx) {
        const i = ctx.choices.amount ?? -1;
        const card = i >= 0 ? ctx.me.hand.filter((c) => fossilItem(ctx.state.cards, c))[i] : undefined;
        if (card) {
          ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
          ctx.me.discard.push(card);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from the hand.`);
        }
        ctx.hit(card ? 100 : 50);
      },
    },
  },
  // Eelektross – Crush and Burn: any Energy cards discarded from the player's Pokémon, 30 for each.
  'bw10-33': {
    'Crush and Burn': {
      choices(s): ChoiceSpec[] {
        const options = [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p) : []));
        return options.length ? [{ kind: 'ownEnergyAny', options, prompt: 'Crush and Burn: discard any Energy attached to your Pokémon (30 damage each)' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        let discarded = 0;
        for (const p of inPlay(ctx.me)) {
          const gone = energyCards(p).filter((e) => uids.has(e.uid));
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          ctx.log(`Discarded ${gone.length} Energy card${gone.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
          discarded += gone.length;
        }
        ctx.hit(30 * discarded);
      },
    },
  },
  // Azelf – Psyjamming: Special Energy moved between the opponent's Pokémon as the player likes, one at a time.
  'bw10-38': {
    Psyjamming: {
      run(ctx) {
        if (inPlay(ctx.opp).length > 1 && inPlay(ctx.opp).some((p) => p.energy.some((e) => isSpecialEnergy(ctx.state.cards, e)))) {
          ctx.pend({ kind: 'energyAnyWay', source: 'Psyjamming', oppSpecial: true });
        }
      },
    },
  },
  // Musharna – Precognitive Dream: 3 cards drawn, then it's Asleep.
  'bw10-40': {
    'Precognitive Dream': {
      run(ctx) {
        ctx.draw(3);
        ctx.sleepSelf();
      },
    },
  },
  // Golurk – Iron Fist of Justice: nothing while the player has a Team Plasma Pokémon in play.
  'bw10-46': {
    'Iron Fist of Justice': {
      run(ctx) {
        if (inPlay(ctx.me).some((p) => isPlasmaPokemon(ctx.state.cards, p))) return ctx.log('Iron Fist of Justice did nothing.');
        ctx.hit(60);
      },
    },
  },
  // Machoke – Last-Chance Chop: 70 more with exactly 10 HP left.
  'bw10-48': { 'Last-Chance Chop': { run: (ctx) => void ctx.hit(inPlayDef(ctx.state.cards, ctx.attacker).hp - ctx.attacker.damage === 10 ? 90 : 20) } },
  // Machamp – Close Combat: tails, attack damage to it 30 more next turn, after Weakness and Resistance.
  'bw10-49': {
    'Close Combat': {
      run(ctx) {
        ctx.hit(120);
        if (ctx.flip()) return;
        (ctx.attacker.effects ??= {}).takeMore = { amount: 30, until: ctx.turn + 1 };
        ctx.log(`Attack damage to ${ctx.attackerDef.name} is 30 more next turn.`);
      },
    },
  },
  // Throh – Shoulder Throw: 20 less for each Colorless in the Defending Pokémon's Retreat Cost.
  'bw10-51': {
    'Shoulder Throw': {
      run(ctx) {
        const cost = retreatCost(ctx.defender, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card);
        ctx.hit(Math.max(0, 80 - 20 * cost));
      },
    },
  },
  // Sawk – Kick of Righteousness: 40 more against a Team Plasma Pokémon.
  'bw10-52': { 'Kick of Righteousness': againstPlasma(10, 40) },
  // Archeops – Swift Dive: with 50 HP or less left, its base damage is 50.
  'bw10-54': { 'Swift Dive': { run: (ctx) => void ctx.hit(inPlayDef(ctx.state.cards, ctx.attacker).hp - ctx.attacker.damage <= 50 ? 50 : 100) } },
  // Houndoom – Blazing Claws: against a Team Plasma Pokémon, 60 more and it's Burned.
  'bw10-56': { 'Blazing Claws': againstPlasma(60, 60, true) },
  // Salamence – Gaia Crush: the Stadium in play discarded.
  'bw10-64': {
    'Gaia Crush': {
      run(ctx) {
        ctx.hit(100);
        retireStadium(ctx.state);
      },
    },
  },
  // Dialga-EX – Reverse Edge: heads, a card from the discard pile into the hand. Fast Forward: the top card of the opponent's
  // deck discarded for each Plasma Energy attached.
  'bw10-65': {
    'Reverse Edge': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flip() && ctx.me.discard.length && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Reverse Edge', count: 1, filter: 'any' });
      },
    },
    'Fast Forward': {
      run(ctx) {
        ctx.hit(90);
        const top = ctx.opp.deck.splice(0, plasmaEnergy(ctx.state.cards, ctx.attacker));
        ctx.opp.discard.push(...top);
        if (top.length) ctx.log(`Fast Forward: discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck.`, ctx.opp.id);
      },
    },
  },
  // Palkia-EX – Dimension Heal: 20 off it for each Plasma Energy attached.
  'bw10-66': {
    'Dimension Heal': {
      run(ctx) {
        ctx.hit(80);
        const n = plasmaEnergy(ctx.state.cards, ctx.attacker);
        if (n) ctx.heal(20 * n);
      },
    },
  },
  // Axew – Strong Bond: a Supporter card named Iris from the deck, shown.
  'bw10-67': { 'Strong Bond': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Strong Bond', filter: 'trainerNamed', name: 'Iris', reveal: true, optional: true })) } },
  // Haxorus – Dragonaxe: 40 for each Metal Energy attached. Strike of the Champion: a Team Plasma Pokémon is Knocked Out.
  'bw10-69': {
    Dragonaxe: { run: (ctx) => void ctx.hit(40 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'metal')).length) },
    'Strike of the Champion': {
      run(ctx) {
        const defender = ctx.opp.active;
        if (!defender || !isPlasmaPokemon(ctx.state.cards, defender)) return ctx.log('Strike of the Champion did nothing.');
        if (!reachesDefender(ctx)) return;
        defender.damage = Math.max(defender.damage, inPlayDef(ctx.state.cards, defender).hp);
        ctx.log(`Strike of the Champion: ${pokemonName(ctx.state, defender)} is Knocked Out.`, ctx.opp.id);
      },
    },
  },
  // G Booster (the Pokémon Tool's attack, Genesect-EX's): 2 Energy discarded; nothing on the Defending Pokémon but Weakness and
  // Resistance changes the damage.
  'bw10-92': { 'G Booster': { discard: { count: 2 }, run: (ctx) => void ctx.hit(200, { swift: true, keepWeakness: true, keepResistance: true }) } },
  // G Scope (the Pokémon Tool's attack, Genesect-EX's): 100 to one of the opponent's Benched Pokémon.
  'bw10-93': {
    'G Scope': {
      choices: (s) => opponentBenchChoice(s, "G Scope: choose one of your opponent's Benched Pokémon to do 100 damage to"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 100);
      },
    },
  },
  // Chatot – Misinformation: every Pokémon Tool attached to the opponent's Pokémon discarded.
  'bw10-77': {
    Misinformation: {
      run(ctx) {
        for (const p of inPlay(ctx.opp)) {
          if (!toolOf(ctx.state.cards, p) || !ctx.canAffect(ctx.opp, p)) continue;
          while (toolOf(ctx.state.cards, p)) {
            ctx.log(`Discarded ${toolOf(ctx.state.cards, p)!.name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
            discardTool(ctx.state, ctx.opp, p);
          }
        }
      },
    },
  },
};

