// Dragons Exalted (bw6) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Triple Energy's 3 basic Energy cards are each of a different type, each attached to any of the player's
// Pokémon (up to 3: the deck may not have them); Rainbow Burn counts the types of the basic Energy cards attached (a Blend or
// Rainbow Energy card is no basic Energy card); Water Cannon on tails does its 30; Clear Search takes 3 cards (all there
// are, with fewer); Energy Assist's 2 basic Energy cards go to the one Benched Pokémon picked before the attack; Rapid Spin's
// attacker switches first (its player's pick), then the opponent switches the Defending Pokémon (their pick); Celestial
// Roar's Energy cards are attached from among the 3 discarded; Dragon Burst discards every basic Fire, or every basic
// Lightning, Energy card attached (its player's pick when it has both), 60 for each; Hand Fling counts the cards in the hand
// as the attack is used; Shadow Steal counts Special Energy cards; Chirp's Pokémon have Fighting Resistance printed (up to 2).
// Honchkrow's Whirlwind asks its player first whether the opponent switches; Magnetic Lines whether an Energy moves (asked
// before the attack, as other "may" choices).
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { counts, energyPool, isSpecialEnergy, type InPlayPokemon } from '../engine.js';
import { shuffle } from '../rng.js';
import { pokemonAt } from '../powers.js';
import { clearSpecialConditions, pokemonName } from '../status.js';
import { benchedSlots, basicEnergyOn, energyCanMove, lure, opponentSwitches, opponentTargets } from './common.js';
import { discardOwn, putCounters } from './ex2.js';
import { discardFree, notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

/** "Put N damage counters on 1 of your opponent's Pokémon" (Sneaky Placement, Plentiful Placement). */
const placement = (n: number): AttackEffect => ({
  choices: (s) => opponentTargets(s, `Choose one of your opponent's Pokémon to put ${n} damage counter${n === 1 ? '' : 's'} on`),
  run(ctx) {
    const p = pokemonAt(ctx.opp, ctx.choices.oppTarget ?? 'active');
    if (p) putCounters(ctx, ctx.opp, p, n);
  },
});

/** One of the player's Benched Pokémon, for an attack that moves or switches to it. */
const ownBenchChoice = (s: Parameters<NonNullable<AttackEffect['choices']>>[0], prompt: string): ChoiceSpec[] => {
  const options = benchedSlots(s.ownBench);
  return options.length ? [{ kind: 'ownBench', options, prompt }] : [];
};

/** The type a basic Energy card attached provides (a converted one's new type). */
const basicType = (ctx: AttackContext, p: InPlayPokemon) => basicEnergyOn(ctx.state.cards, p).map((e) => e.converted?.type ?? (lookupCard(ctx.state.cards, e.defId) as { energyType: EnergyType }).energyType);

/** The basic Energy cards of `type` attached to `p` (Dragon Burst). */
const basicOfType = (cards: AttackContext['state']['cards'], p: InPlayPokemon, type: EnergyType) =>
  basicEnergyOn(cards, p).filter((e) => (e.converted?.type ?? (lookupCard(cards, e.defId) as { energyType: EnergyType }).energyType) === type);

export const BW6: Record<string, Record<string, AttackEffect>> = {
  // Beautifly – Triple Energy: 3 basic Energy cards of different types from the deck, attached to the player's Pokémon as they like.
  'bw6-8': { 'Triple Energy': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Triple Energy', filter: 'basicEnergy', distinct: 'type', taken: [], attach: true, optional: true, count: 3 })) } },
  // Cascoon – Tangle Drag: one of the opponent's Benched Pokémon (the player's pick) switched in.
  'bw6-9': { 'Tangle Drag': lure },
  // Roselia – Relaxing Fragrance: 30 damage and every Special Condition off it.
  'bw6-12': {
    'Relaxing Fragrance': {
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 30);
        clearSpecialConditions(ctx.attacker);
        ctx.log(`${ctx.attackerDef.name} has no Special Conditions.`);
      },
    },
  },
  // Ho-Oh-EX – Rainbow Burn: 20 more for each type of basic Energy attached to it.
  'bw6-22': { 'Rainbow Burn': { run: (ctx) => void ctx.hit(20 + 20 * new Set(basicType(ctx, ctx.attacker)).size) } },
  // Wailord – Water Cannon: heads, 30 for each Water Energy attached to it; tails, 30.
  'bw6-26': { 'Water Cannon': { run: (ctx) => void ctx.hit(ctx.flip() ? 30 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'water')).length : 30) } },
  // Feebas – Add-a-Dash: 2 coins, a card drawn for each heads.
  'bw6-27': { 'Add-a-Dash': { run: (ctx) => ctx.draw(ctx.flips(2)) } },
  // Milotic – Clear Search: any 3 cards from the deck into the hand.
  'bw6-28': { 'Clear Search': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Clear Search', filter: 'any', count: Math.min(3, ctx.me.deck.length) })) } },
  // Walrein – Ice Entomb: Paralyzed; it can't use Ice Entomb during the player's next turn.
  'bw6-31': {
    'Ice Entomb': {
      run(ctx) {
        ctx.hit(60);
        ctx.inflict('paralyzed');
        notNextTurn(ctx, 'Ice Entomb');
      },
    },
  },
  // Manectric – Energy Assist: 2 basic Energy cards from the discard pile onto 1 of the player's Benched Pokémon.
  'bw6-44': {
    'Energy Assist': {
      choices: (s) => (s.ownDiscard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) && !s.discardsLocked ? ownBenchChoice(s, 'Choose one of your Benched Pokémon to attach 2 basic Energy cards to') : []),
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        const n = Math.min(2, ctx.me.discard.filter((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId))).length);
        if (slot === undefined || !ctx.me.bench[slot] || !n || !discardFree(ctx)) return;
        ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Assist', count: n, target: slot });
      },
    },
  },
  // Dustox – Hazardous Scales: Asleep, Burned and Poisoned.
  'bw6-47': {
    'Hazardous Scales': {
      run(ctx) {
        ctx.inflict('asleep');
        ctx.inflict('burned');
        ctx.inflict('poisoned');
      },
    },
  },
  // Drifloon – Sneaky Placement: a damage counter on 1 of the opponent's Pokémon.
  'bw6-49': { 'Sneaky Placement': placement(1) },
  // Drifblim – Shadow Steal: 50 for each Special Energy card in the opponent's discard pile. Plentiful Placement: 4 damage counters on 1 of their Pokémon.
  'bw6-51': {
    'Shadow Steal': { run: (ctx) => void ctx.hit(50 * ctx.opp.discard.filter((c) => isSpecialEnergy(ctx.state.cards, c)).length) },
    'Plentiful Placement': placement(4),
  },
  // Gothitelle – Doom Decree: 2 heads, the Defending Pokémon is Knocked Out.
  'bw6-57': {
    'Doom Decree': {
      run(ctx) {
        if (ctx.flips(2) < 2) return ctx.log('Doom Decree did nothing.');
        ctx.affectDefender(() => {
          ctx.defender.damage = Math.max(ctx.defender.damage, ctx.defenderDef.hp);
          ctx.log(`Doom Decree: ${ctx.defenderDef.name} is Knocked Out.`, ctx.opp.id);
        });
      },
    },
  },
  // Marowak – Vortex Chop: 30 more if the Defending Pokémon has any Resistance.
  'bw6-61': { 'Vortex Chop': { run: (ctx) => void ctx.hit(ctx.defenderDef.resistance || ctx.defenderDef.moreResistance?.length ? 90 : 60) } },
  // Baltoy – Reverse Spin: the opponent shuffles their hand into their deck and draws 4 cards.
  'bw6-63': {
    'Reverse Spin': {
      run(ctx) {
        const { opp } = ctx;
        [opp.deck, ctx.state.rngState] = shuffle([...opp.deck, ...opp.hand], ctx.state.rngState);
        opp.hand = [];
        const drawn = opp.deck.splice(0, 4);
        opp.hand.push(...drawn);
        ctx.log(`Shuffled the hand into the deck and drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, opp.id);
      },
    },
  },
  // Claydol – Rapid Spin: it switches with 1 of the player's Benched Pokémon, then the opponent switches the Defending Pokémon.
  'bw6-64': {
    'Rapid Spin': {
      choices: (s) => ownBenchChoice(s, 'Choose one of your Benched Pokémon to switch Claydol with'),
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
        opponentSwitches(ctx, 'Rapid Spin');
      },
    },
  },
  // Gigalith – Revenge Cannon: 10 more for each damage counter on the player's Benched Pokémon.
  'bw6-67': { 'Revenge Cannon': { run: (ctx) => void ctx.hit(10 + 10 * ctx.me.bench.reduce((n, p) => n + (p ? Math.floor(p.damage / 10) : 0), 0)) } },
  // Sawk – Defensive Stance: 30 damage off it, then it switches with 1 of the player's Benched Pokémon.
  'bw6-69': {
    'Defensive Stance': {
      choices: (s) => ownBenchChoice(s, 'Choose one of your Benched Pokémon to switch Sawk with'),
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 30);
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Terrakion-EX – Pump-up Smash: 2 basic Energy cards from the hand onto the player's Benched Pokémon as they like.
  'bw6-71': {
    'Pump-up Smash': {
      run(ctx) {
        ctx.hit(90);
        if (ctx.me.bench.some(Boolean) && ctx.me.hand.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromHand', source: 'Pump-up Smash', count: 2, basic: true, anyTarget: true, benchOnly: true });
      },
    },
  },
  // Honchkrow – Whirlwind: the player may have the opponent switch the Defending Pokémon (their pick).
  'bw6-73': {
    Whirlwind: {
      choices: (s): ChoiceSpec[] => (s.opponentBench.some(Boolean) ? [{ kind: 'boost', options: [true, false], prompt: 'Whirlwind: have your opponent switch the Defending Pokémon with 1 of their Benched Pokémon?' }] : []),
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.boost) opponentSwitches(ctx, 'Whirlwind');
      },
    },
  },
  // Skuntank – Smogscreen: Poisoned, and its attacks next turn need heads (as Koffing's).
  'bw6-77': {
    Smogscreen: {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('poisoned');
        ctx.affectDefender((e) => {
          e.smokescreen = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name}'s attacks next turn need heads.`, ctx.opp.id);
        });
      },
    },
  },
  // Probopass – Magnetic Lines: may move an Energy attached to the Defending Pokémon to 1 of the opponent's Benched Pokémon.
  'bw6-82': {
    'Magnetic Lines': {
      choices(s, c): ChoiceSpec[] {
        if (!s.defender.energy.length || !s.opponentBench.some(Boolean)) return [];
        const may: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: "Magnetic Lines: move an Energy attached to the Defending Pokémon to 1 of your opponent's Benched Pokémon?" }];
        if (!c.boost) return may;
        return [
          ...may,
          { kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy attached to the Defending Pokémon' },
          { kind: 'opponentBench', options: benchedSlots(s.opponentBench), prompt: "Move it to which of your opponent's Benched Pokémon?" },
        ];
      },
      run(ctx) {
        ctx.hit(30);
        const defender = ctx.opp.active;
        const to = ctx.choices.benchSlot === undefined ? null : ctx.opp.bench[ctx.choices.benchSlot];
        const energy = defender?.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        if (!ctx.choices.boost || !defender || !to || !energy) return;
        ctx.affectDefender(() => {
          if (!energyCanMove(ctx, defender)) return;
          defender.energy = defender.energy.filter((e) => e !== energy);
          to.energy.push(energy);
          ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, defender)} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
        });
      },
    },
  },
  // Rayquaza-EX – Celestial Roar: the top 3 cards of the deck discarded, the Energy cards among them attached to it.
  // Dragon Burst: every basic Fire or every basic Lightning Energy card on it discarded, 60 for each.
  'bw6-85': {
    'Celestial Roar': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 3);
        const energy = top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        ctx.me.discard.push(...top.filter((c) => !energy.includes(c)));
        ctx.attacker.energy.push(...energy);
        ctx.log(`Discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck${energy.length ? ` and attached ${energy.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} to ${ctx.attackerDef.name}` : ''}.`);
      },
    },
    'Dragon Burst': {
      choices(s): ChoiceSpec[] {
        const types = (['fire', 'lightning'] as const).filter((t) => basicOfType(s.cards, s.attacker, t).length);
        return types.length > 1 ? [{ kind: 'type', options: [...types], prompt: 'Dragon Burst: discard all basic Fire or all basic Lightning Energy?' }] : [];
      },
      run(ctx) {
        const types = (['fire', 'lightning'] as const).filter((t) => basicOfType(ctx.state.cards, ctx.attacker, t).length);
        const type = ctx.choices.type && types.includes(ctx.choices.type as 'fire') ? ctx.choices.type : types[0];
        const gone = type ? basicOfType(ctx.state.cards, ctx.attacker, type) : [];
        discardOwn(ctx, gone);
        ctx.hit(60 * gone.length);
      },
    },
  },
  // Ambipom – Hand Fling: 10 for each card in the player's hand.
  'bw6-100': { 'Hand Fling': { run: (ctx) => void ctx.hit(10 * ctx.me.hand.length) } },
  // Audino – Wake-up Beam: every Special Condition off the Defending Pokémon.
  'bw6-108': {
    'Wake-up Beam': {
      run(ctx) {
        ctx.hit(40);
        ctx.affectDefender(() => {
          clearSpecialConditions(ctx.defender);
          ctx.log(`${ctx.defenderDef.name} has no Special Conditions.`, ctx.opp.id);
        });
      },
    },
  },
  // Rufflet – Chirp: 2 Pokémon with Fighting Resistance from the deck into the hand, shown.
  'bw6-111': { Chirp: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Chirp', filter: 'resistanceType', type: 'fighting', reveal: true, optional: true, count: 2 })) } },
};
