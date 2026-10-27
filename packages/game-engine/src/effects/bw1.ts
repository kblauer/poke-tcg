// Black & White (bw1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Leaf Storm heals each of the player's Grass Pokémon, the attacker too; Nature Power counts the Grass Energy
// on every Pokémon in play, both players'; Pickup takes an Item card (agreed: any Trainer card but a Supporter or a Stadium,
// isItemCard).
import type { AttackContext, AttackEffect } from '../attacks.js';
import { hasType } from '../cards.js';
import { counts, energyPool } from '../engine.js';
import { inPlayDef } from '../status.js';
import { inPlay } from './common.js';
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
  // Serperior – Leaf Storm: 20 off each of the player's Grass Pokémon.
  'bw1-5': { 'Leaf Storm': healGrass(60, 20) },
  // Lilligant – Leaf Storm: as Serperior's.
  'bw1-10': { 'Leaf Storm': healGrass(30, 20) },
  // Maractus – Constant Rattle: 3 coins; 10 for 1 heads, 30 for 2, 60 for 3.
  'bw1-12': { 'Constant Rattle': { run: (ctx) => void ctx.hit([0, 10, 30, 60][ctx.flips(3)]!) } },
  // Sawsbuck – Nature Power: 10 more for each Grass Energy on every Pokémon in play.
  'bw1-14': { 'Nature Power': { run: (ctx) => void ctx.hit(20 + 10 * grassInPlay(ctx)) } },
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
};
