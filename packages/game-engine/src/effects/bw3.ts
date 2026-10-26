// Noble Victories (bw3) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Mysterious Evolution's partner "in play" is the player's own (as agreed for the EX sets' partners); Frost
// Vanish is offered only with a Benched Pokémon to take its place; Damagriiigus moves damage counters (not damage: no Weakness
// or Resistance, and Heal Block doesn't put them back); Core Cannon counts the Fighting Energy provided; Devour counts every
// Durant the player has in play, the attacker too; Synchronoise reaches the opponent's Benched Pokémon that share any type
// with the Defending Pokémon.
import { pokemonOn, targetsIn, type AttackEffect, type ChoiceSpec } from '../attacks.js';
import { hasType, isBasicEnergy, lookupCard, namesMatch, typesOf } from '../cards.js';
import { counts, energyPool } from '../engine.js';
import { countersMoved, inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, inPlay } from './common.js';
import { nurture, snipeChosen } from './bw2.js';
import { returnSelf } from './gym2.js';
import { healUpTo } from './si1.js';

/** "If [partner] is in play, search your deck for a card that evolves from this Pokémon and put it onto this Pokémon." */
const mysteriousEvolution = (partner: string): AttackEffect => {
  const evolve = nurture('Mysterious Evolution', () => 'active');
  return {
    run(ctx) {
      if (!inPlay(ctx.me).some((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, partner))) return ctx.log(`${partner} isn't in play: Mysterious Evolution did nothing.`);
      evolve.run(ctx);
    },
  };
};

export const BW3: Record<string, Record<string, AttackEffect>> = {
  // Lilligant – Aromax: all damage off 1 of the player's Benched Pokémon.
  'bw3-5': {
    Aromax: {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to heal' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (p) healUpTo(ctx, ctx.me, p, p.damage);
      },
    },
  },
  // Karrablast, Shelmet – Mysterious Evolution: evolved from the deck while the other is in play.
  'bw3-8': { 'Mysterious Evolution': mysteriousEvolution('Shelmet') },
  'bw3-11': { 'Mysterious Evolution': mysteriousEvolution('Karrablast') },
  // Victini – V-create: nothing with 4 or fewer Benched Pokémon.
  'bw3-15': { 'V-create': { run: (ctx) => (benchedSlots(ctx.me.bench).length <= 4 ? ctx.log('V-create did nothing.') : void ctx.hit(100)) } },
  // Volcarona – Fiery Dance: a basic Energy card from the discard pile onto any of the player's Pokémon.
  'bw3-21': {
    'Fiery Dance': {
      choices: (s): ChoiceSpec[] => {
        const energy = s.discardsLocked ? [] : s.ownDiscard.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));
        return energy.length
          ? [
              { kind: 'ownDiscard', min: 1, max: 1, options: energy, prompt: 'Choose a basic Energy card from your discard pile' },
              { kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to attach it to' },
            ]
          : [];
      },
      run(ctx) {
        ctx.hit(30);
        const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids?.[0]);
        const to = ctx.choices.ownTarget === undefined ? null : pokemonOn(ctx.me.active, ctx.me.bench, ctx.choices.ownTarget);
        if (!card || !to) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        to.energy.push(card);
        ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Vanilluxe – Double Freeze: 2 coins, 40 for each heads; any heads, Paralyzed.
  'bw3-29': {
    'Double Freeze': {
      run(ctx) {
        const heads = ctx.flips(2);
        ctx.hit(40 * heads);
        if (heads) ctx.inflict('paralyzed');
      },
    },
  },
  // Cryogonal – Ice Shard: 40 more to a Fighting Pokémon. Frost Vanish: may return itself and its cards to the hand.
  'bw3-32': { 'Ice Shard': { run: (ctx) => void ctx.hit(hasType(ctx.defenderDef, 'fighting') ? 70 : 30) } },
  'bw3-33': {
    'Frost Vanish': {
      choices: (s): ChoiceSpec[] => (s.ownBench.some(Boolean) ? [{ kind: 'boost', options: [true, false], prompt: 'Frost Vanish: return Cryogonal and all cards attached to it to your hand?' }] : []),
      run(ctx) {
        ctx.hit(40);
        if (ctx.choices.boost) ctx.after(() => returnSelf(ctx));
      },
    },
  },
  // Emolga – Electrichain: 20 more with any Lightning Pokémon on the Bench.
  'bw3-37': { Electrichain: { run: (ctx) => void ctx.hit(ctx.me.bench.some((p) => p && hasType(inPlayDef(ctx.state.cards, p), 'lightning')) ? 30 : 10) } },
  // Cofagrigus – Damagriiigus: every damage counter on 1 of the player's Benched Pokémon moved to the Defending Pokémon.
  'bw3-46': {
    Damagriiigus: {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage > 0);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to move its damage counters from' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (!p?.damage) return ctx.log('Damagriiigus did nothing.');
        ctx.affectDefender(() => {
          const moved = p.damage;
          p.damage = 0;
          countersMoved(ctx.state, p, moved);
          ctx.defender.damage += moved;
          ctx.log(`Moved ${moved / 10} damage counter${moved === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)} to ${ctx.defenderDef.name}.`);
        });
      },
    },
  },
  // Beheeyem – Synchronoise: 20 to each of the opponent's Benched Pokémon sharing a type with the Defending Pokémon.
  'bw3-56': {
    Synchronoise: {
      run(ctx) {
        ctx.hit(20);
        const types = typesOf(ctx.defenderDef);
        ctx.opp.bench.forEach((p, i) => {
          if (p && types.some((t) => hasType(inPlayDef(ctx.state.cards, p), t))) ctx.damageBenched(ctx.opp, i, 20);
        });
      },
    },
  },
  // Gigalith – Core Cannon: 20 for each Fighting Energy attached to it, to 1 of the opponent's Pokémon.
  'bw3-61': { 'Core Cannon': snipeChosen((ctx) => 20 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'fighting')).length) },
  // Durant – Devour: the top card of the opponent's deck discarded for each of the player's Durant in play.
  'bw3-83': {
    Devour: {
      run(ctx) {
        const n = inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Durant')).length;
        const gone = ctx.opp.deck.splice(0, n);
        ctx.opp.discard.push(...gone);
        ctx.log(`Discarded ${gone.length} card${gone.length === 1 ? '' : 's'} from the top of the opponent's deck.`, ctx.opp.id);
      },
    },
  },
};
