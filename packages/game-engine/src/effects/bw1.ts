// Black & White (bw1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Leaf Storm heals each of the player's Grass Pokémon, the attacker too; Leaf Tornado moves the player's
// Grass Energy one at a time, as they like, after the damage (energyAnyWay); Nature Power counts the Grass Energy on every
// Pokémon in play, both players'; Foul Play uses one of the Defending Pokémon's attacks without paying its cost (as
// Diamond & Pearl Clefable's Metronome); Pickup takes an Item card (agreed: any Trainer card but a Supporter or a Stadium,
// isItemCard); Revenge counts a Knock Out by the opponent's attack damage during their last turn (`knockedOutByAttack`).
import type { AttackContext, AttackEffect } from '../attacks.js';
import { hasType } from '../cards.js';
import { counts, energyPool } from '../engine.js';
import { inPlayDef } from '../status.js';
import { inPlay } from './common.js';
import { copyAttack } from './ecard2.js';
import { healUpTo } from './si1.js';

/** "Heal 20 damage from each of your Grass Pokémon", after the damage. */
const healGrass = (damage: number, amount: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    for (const p of inPlay(ctx.me)) if (hasType(inPlayDef(ctx.state.cards, p), 'grass')) healUpTo(ctx, ctx.me, p, amount);
  },
});

/** The Grass Energy attached to every Pokémon in play, both players' (Energy provided). */
const grassInPlay = (ctx: AttackContext) =>
  [...inPlay(ctx.me), ...inPlay(ctx.opp)].reduce((n, p) => n + energyPool(p, ctx.state.cards).filter((e) => counts(e, 'grass')).length, 0);

export const BW1: Record<string, Record<string, AttackEffect>> = {
  // Serperior – Leaf Storm: 20 off each of the player's Grass Pokémon. Leaf Tornado: Grass Energy moved as the player likes.
  'bw1-5': { 'Leaf Storm': healGrass(60, 20) },
  'bw1-6': {
    'Leaf Tornado': {
      run(ctx) {
        ctx.hit(60);
        ctx.pend({ kind: 'energyAnyWay', source: 'Leaf Tornado', type: 'grass' });
      },
    },
  },
  // Lilligant – Leaf Storm: as Serperior's.
  'bw1-10': { 'Leaf Storm': healGrass(30, 20) },
  // Maractus – Constant Rattle: 3 coins; 10 for 1 heads, 30 for 2, 60 for 3.
  'bw1-12': { 'Constant Rattle': { run: (ctx) => void ctx.hit([0, 10, 30, 60][ctx.flips(3)]!) } },
  // Sawsbuck – Nature Power: 10 more for each Grass Energy on every Pokémon in play.
  'bw1-14': { 'Nature Power': { run: (ctx) => void ctx.hit(20 + 10 * grassInPlay(ctx)) } },
  // Duosion – Recover: an Energy discarded, then all of its damage healed.
  'bw1-56': { Recover: { discard: { count: 1 }, run: (ctx) => ctx.heal('all') } },
  // Scrafty – Spit Acid: Burned, and Paralyzed too on heads.
  'bw1-69': {
    'Spit Acid': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('burned');
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Zoroark – Nasty Plot: any card from the deck into the hand. Foul Play: one of the Defending Pokémon's attacks, its cost unpaid.
  'bw1-71': {
    'Nasty Plot': { run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Nasty Plot', filter: 'any' }) },
    'Foul Play': copyAttack('Foul Play', { needsEnergy: false, flip: false }),
  },
  // Lillipup – Pickup: an Item card from the discard pile into the hand.
  'bw1-80': { Pickup: { run: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'Pickup', count: 1, filter: 'item' }) } },
  // Stoutland – Odor Sleuth: 3 coins; a card from the discard pile into the hand for each heads.
  'bw1-83': {
    'Odor Sleuth': {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads) ctx.pend({ kind: 'discardToHand', source: 'Odor Sleuth', count: heads, filter: 'any' });
      },
    },
  },
  // Unfezant – Fly: tails, nothing; heads, 50 and every effect of attacks on it prevented next turn.
  'bw1-86': {
    Fly: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fly did nothing.');
        ctx.hit(50);
        ctx.protect('preventAll');
      },
    },
  },
  // Cinccino – Do the Wave: 20 for each of the player's Benched Pokémon.
  'bw1-89': { 'Do the Wave': { run: (ctx) => void ctx.hit(20 * ctx.me.bench.filter(Boolean).length) } },
  // Bouffalant – Revenge: 70 more if the opponent's attack Knocked Out one of the player's Pokémon during their last turn.
  'bw1-91': { Revenge: { run: (ctx) => void ctx.hit(ctx.me.knockedOutByAttack === ctx.turn - 1 ? 90 : 20) } },
};
