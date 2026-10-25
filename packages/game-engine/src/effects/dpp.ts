// DP Black Star Promos (dpp) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't
// play; most promos reprint an earlier card and take its effects.
// From the text: Roar of Time puts the 3 Pokémon picked on top after the shuffle; Reaper Pulse moves as many counters as it
// can, up to 2; Learning levels up any of the player's Pokémon with a Pokémon LV.X of its name (the usual limits); Darkness
// Lost sends what it Knocks Out to the Lost Zone (out of the game); Metallic Bolt and Dragon Rush's Energy cards are picked
// when the cards that fit differ (the same-card rule, agreed); Energy Flare moves any Energy cards among the player's Pokémon, one at a time.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isPokemonCard, lookupCard } from '../cards.js';
import { type InPlayPokemon, type Target } from '../engine.js';
import { pokemonPower } from '../powers.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, damageOpponent, energyCards, inPlay, opponentBenchChoice, opponentTargets, same } from './common.js';
import { DP1, discardOwnEnergy } from './dp1.js';
import { DP2 } from './dp2.js';
import { DP4 } from './dp4.js';
import { DP6 } from './dp6.js';
import { DP7 } from './dp7.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { trainerEffect } from './index.js';
import { notNextTurn } from './neo3.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
/** Technical Machines attached to a Pokémon. */
const machinesOn = (p: InPlayPokemon) => (p.attached ?? []).filter((a) => trainerEffect(a.card.defId)?.technicalMachine);
/** Evolution Wish, as Time Call: a card from the deck that evolves from one of the player's Pokémon. */
const evolutionWish = (source: string): AttackEffect => ({
  run(ctx) {
    const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
    if (ctx.me.deck.length) ctx.pend({ kind: 'evolveMany', source, names, done: [], once: true, limits: true });
  },
});

export const DPP: Record<string, Record<string, AttackEffect>> = {
  // Shieldon – Hard Face: 20 less damage to it next turn.
  'dpp-DP08': {
    'Hard Face': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 20, until: ctx.turn + 1 };
      },
    },
  },
  // Infernape LV.X – Flare Up: as Diamond & Pearl's.
  'dpp-DP10': { 'Flare Up': same(() => DP1['dp1-121']?.['Flare Up']) },
  // Palkia LV.X – Hydro Reflect; Darkrai LV.X – Endless Darkness: as Great Encounters'.
  'dpp-DP18': { 'Hydro Reflect': same(() => DP4['dp4-106']?.['Hydro Reflect']) },
  'dpp-DP19': { 'Endless Darkness': same(() => DP4['dp4-104']?.['Endless Darkness']) },
  // Magmortar – Flame Drum; Raichu – Explosive Thunder: as Mysterious Treasures'.
  'dpp-DP20': { 'Flame Drum': same(() => DP2['dp2-12']?.['Flame Drum']) },
  'dpp-DP21': { 'Explosive Thunder': same(() => DP2['dp2-15']?.['Explosive Thunder']) },
  // Darkrai – Spacial Rend: as Diamond & Pearl Palkia's. Roar of Time: 3 Pokémon from the discard pile on top of the deck (nothing without 3).
  'dpp-DP24': {
    'Spacial Rend': same(() => DP1['dp1-11']?.['Spacial Rend']),
    'Roar of Time': {
      choices(s): ChoiceSpec[] {
        const options = (s.ownDiscard ?? []).filter((c) => isPokemonCard(lookupCard(s.cards, c.defId)));
        return options.length >= 3 && !s.discardsLocked ? [{ kind: 'ownDiscard', min: 3, max: 3, options, prompt: 'Roar of Time: choose 3 Pokémon in your discard pile to put on top of your deck' }] : [];
      },
      run(ctx) {
        const picked = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid) && isPokemonCard(lookupCard(ctx.state.cards, c.defId)));
        if (picked.length < 3) return ctx.log('Roar of Time did nothing.');
        ctx.hit(80);
        ctx.me.discard = ctx.me.discard.filter((c) => !picked.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.me.deck.unshift(...picked);
        ctx.log(`Put ${picked.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} on top of the deck.`);
      },
    },
  },
  // Dialga – Flash Cannon; Palkia – Spacial Rend, Transback: as Diamond & Pearl's.
  'dpp-DP26': { 'Flash Cannon': same(() => DP1['dp1-1']?.['Flash Cannon']) },
  'dpp-DP27': { 'Spacial Rend': same(() => DP1['dp1-11']?.['Spacial Rend']), Transback: same(() => DP1['dp1-11']?.Transback) },
  // Rhyperior LV.X – Hard Crush, Upthrow: as Legends Awakened's. Regigigas LV.X – Giga Blaster: as Stormfront's.
  'dpp-DP29': { 'Hard Crush': same(() => DP6['dp6-145']?.['Hard Crush']), Upthrow: same(() => DP6['dp6-145']?.Upthrow) },
  'dpp-DP30': { 'Giga Blaster': same(() => DP7['dp7-100']?.['Giga Blaster']) },
  // Dusknoir – Reaper Pulse: up to 2 damage counters moved from Dusknoir to one of the opponent's Benched Pokémon.
  'dpp-DP33': {
    'Reaper Pulse': {
      choices: (s) => (s.attacker.damage ? opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to move damage counters to") : []),
      run(ctx) {
        ctx.hit(70);
        const p = ctx.choices.benchSlot === undefined ? null : ctx.opp.bench[ctx.choices.benchSlot];
        const n = Math.min(2, Math.floor(ctx.attacker.damage / 10));
        if (!p || !n || !ctx.canAffect(ctx.opp, p)) return;
        ctx.attacker.damage -= 10 * n;
        p.damage += 10 * n;
        ctx.log(`Moved ${n} damage counter${n === 1 ? '' : 's'} to ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
  },
  // Drifblim – Wind Wave: as Diamond & Pearl's.
  'dpp-DP34': { 'Wind Wave': same(() => DP1['dp1-24']?.['Wind Wave']) },
  // Porygon-Z – Learning: a Pokémon LV.X from the deck levels up one of the player's Pokémon. Overload: 20 more for each Technical Machine attached.
  'dpp-DP35': {
    Learning: {
      run(ctx) {
        const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
        if (ctx.me.deck.length) ctx.pend({ kind: 'evolveMany', source: 'Learning', names, done: [], once: true, limits: true, levelUp: true });
      },
    },
    Overload: { run: (ctx) => void ctx.hit(40 + 20 * machinesOn(ctx.attacker).length) },
  },
  // Gliscor – Cutting Turn: heads, damage counters until the Defending Pokémon has 10 HP left, then Gliscor and its cards shuffled into the deck.
  'dpp-DP36': {
    'Cutting Turn': {
      run(ctx) {
        const left = ctx.defenderDef.hp - ctx.defender.damage;
        if (!ctx.flip() || left <= 10 || !ctx.canAffect(ctx.opp, ctx.defender)) return ctx.log('Cutting Turn did nothing.');
        ctx.defender.damage = ctx.defenderDef.hp - 10;
        ctx.log(`Put damage counters on ${ctx.defenderDef.name}: it has 10 HP left.`, ctx.opp.id);
        const p = ctx.attacker;
        const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
        ctx.me.active = null;
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...cards], ctx.state.rngState);
        ctx.log('Gliscor and its cards were shuffled into the deck.');
      },
    },
  },
  // Giratina LV.X – Darkness Lost: 30 to each of the opponent's Pokémon; what it Knocks Out goes to the Lost Zone.
  'dpp-DP38': {
    'Darkness Lost': {
      run(ctx) {
        for (const t of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) {
          damageOpponent(ctx, t, 30);
          const p = theirs(ctx, t);
          if (p && p.damage >= inPlayDef(ctx.state.cards, p).hp) p.lostZone = ctx.turn;
        }
      },
    },
  },
  // Shaymin LV.X – Energy Flare: may move any Energy cards among the player's Pokémon.
  'dpp-DP39': {
    'Energy Flare': {
      run(ctx) {
        ctx.hit(50);
        if (inPlay(ctx.me).length > 1 && inPlay(ctx.me).some((p) => energyCards(p).length)) ctx.pend({ kind: 'deltaSwitch', source: 'Energy Flare', exclude: '', anyEnergy: true });
      },
    },
  },
  // Regigigas – Drag Off: may switch in one of the opponent's Benched Pokémon first.
  'dpp-DP40': {
    'Drag Off': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.opponentBench).length ? [{ kind: 'opponentBench', options: [-1, ...benchedSlots(s.opponentBench)], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : []),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
        ctx.hit(30);
      },
    },
  },
  // Toxicroak G – Poison Revenge: after one of the player's Pokémon was Knocked Out by an attack last turn, 40 more and Poisoned.
  'dpp-DP41': {
    'Poison Revenge': {
      run(ctx) {
        const revenge = ctx.me.knockedOutByAttack === ctx.turn - 1;
        ctx.hit(revenge ? 60 : 20);
        if (revenge) ctx.inflict('poisoned');
      },
    },
  },
  // Carnivine G – Power Whip: 10 for each Energy attached to it, to one of the opponent's Pokémon.
  'dpp-DP42': {
    'Power Whip': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 10 * energyAmount(ctx, ctx.attacker)),
    },
  },
  // Probopass G – Nose Unit: 20 to each of the opponent's Pokémon with a Poké-Body. Loud Snort: no Retreat Cost until the end of the next turn.
  'dpp-DP43': {
    'Nose Unit': {
      run(ctx) {
        for (const t of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) {
          const p = theirs(ctx, t);
          if (p && inPlayDef(ctx.state.cards, p).power && pokemonPower(p)?.body) damageOpponent(ctx, t, 20);
        }
      },
    },
    'Loud Snort': {
      run(ctx) {
        ctx.hit(70);
        (ctx.attacker.effects ??= {}).tailwind = ctx.turn + 2;
      },
    },
  },
  // Magnezone – Metallic Bolt: may discard a Lightning and a Metal Energy for base 120.
  'dpp-DP44': {
    'Metallic Bolt': {
      choices: (s) => (s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'lightning')) && s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'metal')) ? [may('Metallic Bolt: discard a Lightning and a Metal Energy for 120 damage?')] : []),
      run(ctx) {
        const lightning = ctx.attacker.energy.find((e) => energyCardOf(ctx.state.cards, e, 'lightning'));
        const metal = ctx.attacker.energy.find((e) => e !== lightning && energyCardOf(ctx.state.cards, e, 'metal'));
        if (!ctx.choices.boost || !lightning || !metal) return void ctx.hit(60);
        discardOwnEnergy(ctx, 1, 'Metallic Bolt', ['lightning']);
        discardOwnEnergy(ctx, 1, 'Metallic Bolt', ['metal']);
        ctx.hit(120);
      },
    },
  },
  // Charizard G LV.X – Malevolent Fire: tails, all its Energy discarded.
  'dpp-DP45': {
    'Malevolent Fire': {
      run(ctx) {
        ctx.hit(150);
        if (!ctx.flip()) discardOwn(ctx, energyCards(ctx.attacker));
      },
    },
  },
  // Garchomp C LV.X – Dragon Rush: 2 Energy discarded, 80 to one of the opponent's Pokémon; not next turn.
  'dpp-DP46': {
    'Dragon Rush': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 80 damage to"),
      run(ctx) {
        discardOwnEnergy(ctx, 2, 'Dragon Rush');
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 80);
        notNextTurn(ctx, 'Dragon Rush');
      },
    },
  },
  // Rayquaza C LV.X – Final Blowup: all its Energy discarded, unless the hand is empty.
  'dpp-DP47': {
    'Final Blowup': {
      run(ctx) {
        ctx.hit(200);
        if (ctx.me.hand.length) discardOwn(ctx, energyCards(ctx.attacker));
      },
    },
  },
  // Dialga – Time Call: as Majestic Dawn Phione's Evolution Wish. Time Wager: base 50 unless both coins are heads.
  'dpp-DP49': {
    'Time Call': evolutionWish('Time Call'),
    'Time Wager': { run: (ctx) => void ctx.hit(ctx.flips(2) === 2 ? 100 : 50) },
  },
  // Arceus – Judgment: all its Energy cards discarded, 10 to each of the opponent's Benched Pokémon.
  'dpp-DP50': {
    Judgment: {
      run(ctx) {
        discardOwn(ctx, energyCards(ctx.attacker));
        ctx.hit(80);
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Arceus LV.X – Meteor Blast: tails, base 50.
  'dpp-DP56': { 'Meteor Blast': { run: (ctx) => void ctx.hit(ctx.flip() ? 100 : 50) } },
};
