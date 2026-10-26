// HGSS Black Star Promos (hgssp) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts)
// don't play. Most reprint HeartGold & SoulSilver's cards and play as those.
// From the text: Sacred Fire's Pokémon is picked before the attack; Recharge's Lightning Energy card is basic or Special;
// Energy Assist attaches to a Benched Pokémon only; Infinite Wind needs Latios on the Bench.
import type { AttackEffect } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch } from '../cards.js';
import { discardsLocked } from '../powers.js';
import { inPlayDef } from '../status.js';
import { opponentTargets, same } from './common.js';
import { HGSS1 } from './hgss1.js';
import { trainerEffect } from './index.js';
import { healUpTo } from './si1.js';

export const HGSSP: Record<string, Record<string, AttackEffect>> = {
  // Ho-Oh – Sacred Fire: heads, 80 to one of the opponent's Pokémon, no Weakness or Resistance.
  'hgssp-HGSS01': {
    'Sacred Fire': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 80 damage to (on heads)"),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Sacred Fire did nothing.');
        const target = ctx.choices.oppTarget ?? 'active';
        if (target === 'active') ctx.hit(80, { weakness: false, resistance: false });
        else ctx.damageBenched(ctx.opp, target, 80);
      },
    },
  },
  // Pikachu – Recharge: heads, a Lightning Energy card from the deck attached to Pikachu.
  'hgssp-HGSS03': {
    Recharge: {
      run(ctx) {
        if (!ctx.flip() || !ctx.me.deck.length) return ctx.log('Recharge did nothing.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Recharge', filter: 'typedEnergy', type: 'lightning', attachToActive: true, optional: true });
      },
    },
  },
  // Typhlosion – Flare Destroy: as HeartGold & SoulSilver Typhlosion's.
  'hgssp-HGSS09': { 'Flare Destroy': same(() => HGSS1['hgss1-110']?.['Flare Destroy']) },
  // Latias – Energy Assist: a basic Energy card from the discard pile attached to a Benched Pokémon. Infinite Wind: with
  // Latios on the Bench, 2 damage counters off each Benched Pokémon.
  'hgssp-HGSS10': {
    'Energy Assist': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.me.bench.some(Boolean) && !discardsLocked([ctx.me, ctx.opp], ctx.state.cards) && ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Assist', count: 1, benchOnly: true });
      },
    },
    'Infinite Wind': {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.me.bench.some((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Latios'))) return;
        for (const p of ctx.me.bench) if (p?.damage) healUpTo(ctx, ctx.me, p, 20);
      },
    },
  },
  // Smoochum – Energy Antics: as HeartGold & SoulSilver Smoochum's.
  'hgssp-HGSS13': { 'Energy Antics': same(() => HGSS1['hgss1-30']?.['Energy Antics']) },
  // Lapras – Ferry: a Supporter card from the discard pile into the hand, shown.
  'hgssp-HGSS14': {
    Ferry: {
      run(ctx) {
        if (ctx.me.discard.some((c) => trainerEffect(c.defId)?.supporter)) ctx.pend({ kind: 'discardToHand', source: 'Ferry', count: 1, filter: 'supporter', reveal: true });
      },
    },
  },
};
