// Dragon Vault (dv1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Dragon Pulse discards the top card of its player's own deck, after the damage; Sky Heal heals Latias itself
// (20, after the damage) and Sky Blade does 20 more, while the partner's name is on the player's Bench (any of its variants,
// namesMatch); Axe Slugger's Colorless Pokémon is one of that type (hasType).
import type { AttackContext, AttackEffect } from '../attacks.js';
import { hasType, namesMatch } from '../cards.js';
import { inPlayDef } from '../status.js';
import { healUpTo } from './si1.js';

/** The player has a Pokémon with this name on their Bench. */
const benched = (ctx: AttackContext, name: string) => ctx.me.bench.some((p) => !!p && namesMatch(inPlayDef(ctx.state.cards, p).name, name));

/** Base damage, then the top card of the player's deck discarded (Dragon Pulse). */
const dragonPulse = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    const top = ctx.me.deck.splice(0, 1);
    ctx.me.discard.push(...top);
    if (top.length) ctx.log('Discarded the top card of the deck.');
  },
});

export const DV1: Record<string, Record<string, AttackEffect>> = {
  // Dragonair – Dragon Pulse: the top card of the player's deck discarded.
  'dv1-3': { 'Dragon Pulse': dragonPulse(70) },
  // Latias – Sky Heal: with Latios on the Bench, 20 damage off it.
  'dv1-9': {
    'Sky Heal': {
      run(ctx) {
        ctx.hit(40);
        if (benched(ctx, 'Latios')) healUpTo(ctx, ctx.me, ctx.attacker, 20);
      },
    },
  },
  // Latios – Sky Blade: 20 more with Latias on the Bench.
  'dv1-10': { 'Sky Blade': { run: (ctx) => void ctx.hit(benched(ctx, 'Latias') ? 40 : 20) } },
  // Axew – Signs of Evolution: heads, a Fraxure from the deck into the hand, shown.
  'dv1-12': {
    'Signs of Evolution': {
      run(ctx) {
        if (ctx.flip() && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'named', name: 'Fraxure', reveal: true });
      },
    },
  },
  // Haxorus – Axe Slugger: 60 more to a Colorless Pokémon. Dragon Pulse: as Dragonair's.
  'dv1-16': {
    'Axe Slugger': { run: (ctx) => void ctx.hit(hasType(ctx.defenderDef, 'colorless') ? 120 : 60) },
    'Dragon Pulse': dragonPulse(100),
  },
};
