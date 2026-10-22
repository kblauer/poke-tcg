// EX Emerald (ex9) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: Dragon Dance is for whichever Pokémon is its player's Active one next turn, never for damage to the
// Bench; a partner "in play" (the Regi ex) is its player's own.
// From the text: Eruption counts the Energy cards both players discard from the top of their decks; Dragon Mist and Fastwave
// keep Weakness (as Brick Smash); Shadow Beam counts the Energy provided; Mend heals only if it attached a Fighting Energy card;
// Sky Kick looks for a Fighting Resistance, a second printed one too.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { benchedSlots } from './common.js';
import { isBasicEnergy, lookupCard, namesMatch } from '../cards.js';
import { isEnergyCardOf } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { effectId, inPlayDef, pokemonName } from '../status.js';
import { powerEffect } from './index.js';
import { energyAmount } from './ex1.js';
import { inPlay, putCounters } from './ex2.js';
import { snipe } from './ex6.js';
import { dance } from './ex8.js';
import { healUpTo } from './si1.js';

/** Eruption: each player discards the top card of their deck; `more` for each Energy card discarded. */
const eruption = (base: number, more: number): AttackEffect => ({
  run(ctx) {
    let energy = 0;
    for (const player of [ctx.me, ctx.opp]) {
      const [top] = player.deck.splice(0, 1);
      if (!top) continue;
      player.discard.push(top);
      const d = lookupCard(ctx.state.cards, top.defId);
      if (d.kind === 'energy') energy++;
      ctx.log(`Discarded ${d.name} from the top of the deck.`, player.id);
    }
    ctx.hit(base + more * energy);
  },
});

/** The player has a Pokémon called `name` in play (a Regi ex's partner). */
const partner = (ctx: AttackContext, name: string) => inPlay(ctx.me).some((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, name));

export const EX9: Record<string, Record<string, AttackEffect>> = {
  // Rayquaza – Dragon Dance: 30 more next turn (agreed: whichever Pokémon is Active, never the Bench).
  'ex9-9': { 'Dragon Dance': { run: dance('Dragon Dance', 30) } },
  // Groudon, Camerupt ex – Eruption.
  'ex9-14': { Eruption: eruption(40, 20) },
  'ex9-92': { Eruption: eruption(60, 20) },
  // Breloom – Power Blow: heads, 10 more for each Energy attached.
  'ex9-22': { 'Power Blow': { run: (ctx) => void ctx.hit(ctx.flip() ? 10 + 10 * energyAmount(ctx, ctx.attacker) : 10) } },
  // Plusle – Thundershock: heads, Paralyzed (TCGdex's comma keeps the shared wording from matching).
  'ex9-39': {
    Thundershock: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Altaria ex – Dragon Mist; Deoxys ex – Fastwave: only Weakness changes their damage.
  'ex9-90': { 'Dragon Mist': { run: (ctx) => void ctx.hit(70, { swift: true, keepWeakness: true }) } },
  'ex9-93': { Fastwave: { run: (ctx) => void ctx.hit(50, { swift: true, keepWeakness: true }) } },
  // Dusclops ex – Shadow Beam: 2 damage counters for each Energy attached to it.
  'ex9-94': { 'Shadow Beam': { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, 2 * energyAmount(ctx, ctx.attacker)) } },
  // Medicham ex – Pure Power: 3 damage counters on the opponent's Pokémon, as the player likes; Sky Kick: 40 more against Fighting Resistance.
  'ex9-95': {
    'Pure Power': { run: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Pure Power', count: 3, active: true }) },
    'Sky Kick': {
      run(ctx) {
        const d = ctx.defenderDef;
        const resists = [d.resistance?.type, ...(d.moreResistance ?? [])].includes('fighting');
        ctx.hit(resists ? 100 : 60);
      },
    },
  },
  // Milotic ex – Reflect Energy: a basic Energy card moves from it to one of the player's Benched Pokémon.
  'ex9-96': {
    'Reflect Energy': {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        const basics = s.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)));
        return bench.length && basics.length
          ? [
              { kind: 'ownEnergy', count: 1, options: basics, prompt: 'Choose a basic Energy card to move from Milotic ex' },
              { kind: 'ownBench', options: bench, prompt: 'Choose the Benched Pokémon to move it to' },
            ]
          : [];
      },
      run(ctx) {
        ctx.hit(70);
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        const to = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (!card || !to) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Raichu ex – Power Short: 30 to one of the opponent's Pokémon, 20 more if it has a Poké-Power.
  'ex9-97': {
    'Power Short': {
      ...snipe(30),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        const powered = !!p && !!inPlayDef(ctx.state.cards, p).power && !powerEffect(effectId(p))?.body;
        if (t === 'active') ctx.hit(powered ? 50 : 30);
        else ctx.damageBenched(ctx.opp, t, powered ? 50 : 30);
      },
    },
  },
  // Regice ex – Iceberg Crush: with Regirock ex in play, heads discards an Energy card from the Defending Pokémon.
  'ex9-98': {
    'Iceberg Crush': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads, with Regirock ex in play)' }] : []),
      run(ctx) {
        ctx.hit(40);
        if (partner(ctx, 'Regirock ex') && ctx.flip() && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Regirock ex – Mend: a Fighting Energy card from the discard pile to it, then a damage counter off it; Metal Crush: 20 more with Registeel ex in play.
  'ex9-99': {
    Mend: {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        const card = ctx.me.discard.find((c) => isEnergyCardOf(c, ctx.state.cards, 'fighting') && lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        if (!card) return ctx.log('There are no Fighting Energy cards in the discard pile.');
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        ctx.attacker.energy.push(card);
        ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${ctx.attackerDef.name}.`);
        healUpTo(ctx, ctx.me, ctx.attacker, 10);
      },
    },
    'Metal Crush': { run: (ctx) => void ctx.hit(partner(ctx, 'Registeel ex') ? 60 : 40) },
  },
  // Registeel ex – Block Signal: with Regice ex in play, heads Confused.
  'ex9-100': {
    'Block Signal': {
      run(ctx) {
        ctx.hit(10);
        if (partner(ctx, 'Regice ex') && ctx.flip()) ctx.inflict('confused');
      },
    },
  },
};
