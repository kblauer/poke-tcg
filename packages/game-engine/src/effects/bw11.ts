// Legendary Treasures (bw11) attack effects, by card id and attack name (its Radiant Collection's too, the RC cards): the ones
// the shared wordings (ex-templates.ts) and the word-for-word reprints (bw-reprints.ts) don't play.
// From the text: Color Coordination looks for a basic Energy card of any of the Defending Pokémon's types; Howling Rampage counts
// the Prize cards both players have taken; Aqua Boomerang takes Phione back once the attack is done (its player then promotes);
// Fortunate Draw is Rock-Paper-Scissors (the attacking player first, a tie played again): the winner draws 3, the loser discards
// the top 3 cards of their deck; Energy Gift attaches each Psychic Energy card to the Pokémon clicked; Dig Out's basic Energy
// card goes to the Pokémon clicked; Eternal Radiance moves the counters only if the attack can affect the Defending Pokémon;
// Picnic Weather takes a Teddiursa from the discard pile for the player and asks only for the Energy card (the user's); Tiptoe Step counts the
// Psychic Energy attached (Energy provided).
import type { AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, typesOf, type CardLibrary } from '../cards.js';
import { counts, energyPool, newInPlay, PRIZE_COUNT, type CardInstance } from '../engine.js';
import { countersMoved, openBenchSlot, pokemonName } from '../status.js';
import { benchedSlots } from './common.js';
import { removeDefenderEnergy } from './dp1.js';
import { returnSelf } from './gym2.js';
import { discardFree, notNextTurn, reachesDefender } from './neo3.js';
import { healUpTo } from './si1.js';

/** A Teddiursa card (Picnic Weather). */
const isTeddiursa = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'pokemon' && !d.trainerText && namesMatch(d.name, 'Teddiursa');
};

export const BW11: Record<string, Record<string, AttackEffect>> = {
  // Shuckle – Share: 40 off one of the player's Benched Pokémon.
  'bw11-3': {
    Share: {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage > 0);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Share: choose one of your Benched Pokémon to heal 40 damage from' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (p) healUpTo(ctx, ctx.me, p, 40);
      },
    },
  },
  // Carnivine – Ambush Bite: heads, 20 more and an Energy of the Defending Pokémon's discarded.
  'bw11-5': {
    'Ambush Bite': {
      run(ctx) {
        const heads = ctx.flip();
        ctx.hit(heads ? 40 : 20);
        if (heads) removeDefenderEnergy(ctx, 1, 'Ambush Bite');
      },
    },
  },
  // Ninetales – Color Coordination: 40 more with a basic Energy card of the Defending Pokémon's type attached.
  'bw11-21': {
    'Color Coordination': {
      run(ctx) {
        const types = typesOf(ctx.defenderDef);
        const matched = ctx.attacker.energy.some((e) => {
          const d = lookupCard(ctx.state.cards, e.defId);
          return !e.provides && isBasicEnergy(d) && d.kind === 'energy' && types.includes(d.energyType);
        });
        ctx.hit(matched ? 90 : 50);
      },
    },
  },
  // Gyarados – Howling Rampage: 20 for each Prize card both players have taken.
  'bw11-31': { 'Howling Rampage': { run: (ctx) => void ctx.hit(20 * Math.max(0, 2 * PRIZE_COUNT - ctx.me.prizes.length - ctx.opp.prizes.length)) } },
  // Phione – Aqua Boomerang: then it and every card attached to it back into the hand.
  'bw11-36': {
    'Aqua Boomerang': {
      run(ctx) {
        ctx.hit(20);
        ctx.after(() => returnSelf(ctx));
      },
    },
  },
  // Xatu – Fortunate Draw: Rock-Paper-Scissors; the winner draws 3 cards, the loser discards the top 3 of their deck.
  'bw11-56': { 'Fortunate Draw': { run: (ctx) => ctx.pend({ kind: 'rps', source: 'Fortunate Draw', fortunate: true }) } },
  // Swoobat – Energy Gift: heads, up to 2 Psychic Energy cards from the deck onto the player's Pokémon as they like.
  'bw11-65': {
    'Energy Gift': {
      run(ctx) {
        if (ctx.flip() && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Energy Gift', filter: 'energyType', type: 'psychic', attach: true, count: 2, optional: true });
      },
    },
  },
  // Gallade – Pandemonium Blade: 20 more for each of the player's Benched Pokémon with damage counters.
  'bw11-81': { 'Pandemonium Blade': { run: (ctx) => void ctx.hit(60 + 20 * ctx.me.bench.filter((p) => p && p.damage >= 10).length) } },
  // Excadrill-EX – Dig Out: the top card of the deck discarded; a basic Energy card goes onto one of the player's Pokémon instead.
  'bw11-82': {
    'Dig Out': {
      run(ctx) {
        ctx.hit(40);
        const [card] = ctx.me.deck.splice(0, 1);
        if (!card) return;
        const d = lookupCard(ctx.state.cards, card.defId);
        ctx.log(`Dig Out: discarded ${d.name} from the top of the deck.`);
        if (!isBasicEnergy(d)) return void ctx.me.discard.push(card);
        ctx.pend({ kind: 'attachCard', source: 'Dig Out', card });
      },
    },
  },
  // Snivy – Growth: a Grass Energy card from the hand onto it.
  'bw11-RC1': { Growth: { run: (ctx) => void (ctx.me.hand.length && ctx.pend({ kind: 'attachFromHand', source: 'Growth', type: 'grass', count: 1 })) } },
  // Growlithe – Rest: every damage counter off it, then it's Asleep.
  'bw11-RC4': {
    Rest: {
      run(ctx) {
        ctx.heal('all');
        ctx.sleepSelf();
      },
    },
  },
  // Kirlia – Tiptoe Step: a card drawn for each Psychic Energy attached.
  'bw11-RC9': { 'Tiptoe Step': { run: (ctx) => ctx.draw(energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'psychic')).length) } },
  // Gardevoir – Eternal Radiance: every damage counter on it moved to the Defending Pokémon; not again next turn.
  'bw11-RC10': {
    'Eternal Radiance': {
      run(ctx) {
        const moved = Math.floor(ctx.attacker.damage / 10) * 10;
        const defender = ctx.opp.active;
        if (moved && defender && reachesDefender(ctx)) {
          ctx.attacker.damage -= moved;
          countersMoved(ctx.state, ctx.attacker, moved);
          defender.damage += moved;
          ctx.log(`Eternal Radiance: moved ${moved / 10} damage counter${moved === 10 ? '' : 's'} to ${pokemonName(ctx.state, defender)}.`);
        }
        notNextTurn(ctx, 'Eternal Radiance');
      },
    },
  },
  // Ursaring – Picnic Weather: a Teddiursa from the discard pile onto the Bench, then an Energy card from the discard pile onto it.
  // The user's (2026-10-26): the Teddiursa is taken for the player, who picks only the Energy card; with no Teddiursa in the
  // discard pile it can't be used.
  'bw11-RC16': {
    'Picnic Weather': {
      blocked: (s) => (s.ownDiscard.some((c) => isTeddiursa(s.cards, c)) ? null : 'You have no Teddiursa in your discard pile'),
      choices(s): ChoiceSpec[] {
        if (s.discardsLocked || openBenchSlot({ bench: s.ownBench, benchLimit: s.ownBenchLimit }, s.cards, s.stadium) < 0) return [];
        const energy = s.ownDiscard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');
        return energy.length ? [{ kind: 'ownDiscard', min: 1, max: 1, options: energy, prompt: 'Picnic Weather: choose an Energy card from your discard pile to attach to Teddiursa' }] : [];
      },
      run(ctx) {
        const teddiursa = ctx.me.discard.find((c) => isTeddiursa(ctx.state.cards, c));
        const slot = openBenchSlot(ctx.me, ctx.state.cards, ctx.state.stadium?.card);
        if (!teddiursa || slot < 0 || !discardFree(ctx)) return;
        const energy = ctx.me.discard.find((c) => ctx.choices.discardUids?.includes(c.uid));
        ctx.me.discard = ctx.me.discard.filter((c) => c !== teddiursa && c !== energy);
        const p = newInPlay(teddiursa, ctx.turn);
        if (energy) p.energy.push(energy);
        ctx.me.bench[slot] = p;
        ctx.log(`Picnic Weather: put ${pokemonName(ctx.state, p)} onto the Bench${energy ? ` with ${lookupCard(ctx.state.cards, energy.defId).name}` : ''}.`);
      },
    },
  },
};

