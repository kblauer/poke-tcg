// Emerging Powers (bw2) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: the Simisage, Simisear and Simipour "[type]'s Power" attacks look at the Energy the attacker provides
// (Energy provided, as "Energy attached" is read); "1 of your opponent's Pokémon" takes Weakness and Resistance on the Active
// one only (damageChosen), but Telekinesis and Feint Attack, printed without them; Nurturing evolves any of the player's
// Pokémon that could evolve this turn (not one played or evolved this turn); Roost's "can't retreat during your next turn" is
// the attacker's own next turn; Quick Tail Smash asks before the flip whether to flip at all; Shear attaches the Fighting
// Energy cards (basic or Special, energyCardOf) among the 5 discarded; Phat Sound's damage to the Active Pokémon takes Weakness
// and Resistance, to the Bench not.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { pokemonOn, targetsIn } from '../attacks.js';
import { lookupCard, type EnergyType } from '../cards.js';
import { counts, discardTheirEnergy, energyPool, type Target } from '../engine.js';
import { inPlayDef, pokemonName } from '../status.js';
import { ATTACK_TEMPLATES } from './ex-templates.js';
import { DP3 } from './dp3.js';
import { benchedSlots, damageChosen, damageOpponent, energyCards, opponentTargets, same } from './common.js';
import { energyAmount, restNextTurn } from './ex1.js';
import { energyCardOf } from './ex2.js';
import { energyCanGo, notNextTurn } from './neo3.js';
import { evolutionsOf } from './neo2.js';
import { healUpTo } from './si1.js';
import { shuffle } from '../rng.js';

/** A shared wording's effect for an attack whose words differ a little (read when used: the tables fill as the modules load). */
export const template = (key: string, damage: number, attack: string, ...args: (number | string)[]): AttackEffect => {
  let made: AttackEffect | undefined;
  return same(() => (made ??= ATTACK_TEMPLATES[key]!.make(damage, args, attack)));
};

/** The attacker has any Energy of `type` attached (Energy provided). */
export const hasEnergy = (ctx: AttackContext, type: EnergyType) => energyPool(ctx.attacker, ctx.state.cards).some((e) => counts(e, type));

/** Base damage, then `then` if the attacker has any Energy of `type` attached (Fire's Power, Water's Power, Grass' Power). */
const typePower = (damage: number, type: EnergyType, then: (ctx: AttackContext) => void): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (hasEnergy(ctx, type)) then(ctx);
  },
});

/** "Does N damage to 1 of your opponent's Pokémon" (Weakness and Resistance on the Active one only). */
export const snipeChosen = (amount: (ctx: AttackContext) => number): AttackEffect => ({
  choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to damage"),
  run: (ctx) => damageChosen(ctx, ctx.choices.oppTarget ?? 'active', amount(ctx)),
});

/** The chosen opponent's Pokémon and one of its Energy cards (Deleting Glare, Crushing Hammer's attack cousins). */
export const oppEnergyChoices = (s: Parameters<NonNullable<AttackEffect['choices']>>[0], c: Parameters<NonNullable<AttackEffect['choices']>>[1], prompt: string): ChoiceSpec[] => {
  const options = targetsIn(s.defender, s.opponentBench).filter((t) => energyCards(pokemonOn(s.defender, s.opponentBench, t)!).length);
  if (!options.length) return [];
  const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options, prompt }];
  if (c.oppTarget === undefined) return specs;
  return [...specs, { kind: 'pokemonEnergy', options: energyCards(pokemonOn(s.defender, s.opponentBench, c.oppTarget)!), prompt: 'Choose the Energy card to discard' }];
};

/** Discards the chosen Energy card from one of the opponent's Pokémon (Brock's Protection, [Keep] and Ecogym checked). */
export function discardOppEnergy(ctx: AttackContext, target: Target | undefined, uid: string | undefined) {
  const p = target === undefined ? null : pokemonOn(ctx.opp.active, ctx.opp.bench, target);
  if (!p || !uid) return;
  if (target === 'active') return ctx.discardDefenderEnergy(uid);
  if (!ctx.canAffect(ctx.opp, p) || !energyCanGo(ctx, p)) return;
  const card = p.energy.find((e) => e.uid === uid);
  if (!card) return;
  p.energy = p.energy.filter((e) => e !== card);
  ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
  discardTheirEnergy(ctx.state, ctx.opp, [card]);
}

/** "Choose 1 of your Pokémon. Search your deck for a card that evolves from that Pokémon and put it onto that Pokémon." */
export const nurture = (attack: string, which: (ctx: AttackContext) => Target | undefined): AttackEffect => ({
  run(ctx) {
    const target = which(ctx);
    const p = target === undefined ? null : pokemonOn(ctx.me.active, ctx.me.bench, target);
    const names = p && p.playedTurn < ctx.turn ? evolutionsOf(ctx, inPlayDef(ctx.state.cards, p).name) : [];
    if (target !== undefined && ctx.me.deck.some((c) => names.includes(lookupCard(ctx.state.cards, c.defId).name))) return ctx.pend({ kind: 'evolveFromDeck', source: attack, target, names });
    [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
    ctx.log('Found nothing in the deck.');
  },
});

/** Base damage; heads `heads`, tails an Energy card discarded from the Defending Pokémon (chosen before the flip). */
const headsElseDiscard = (damage: number, heads: (ctx: AttackContext) => void, onHeadsDamage = damage): AttackEffect => ({
  choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if tails)' }] : []),
  run(ctx) {
    if (ctx.flip()) {
      ctx.hit(onHeadsDamage);
      heads(ctx);
      return;
    }
    ctx.hit(damage);
    if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
  },
});

export const BW2: Record<string, Record<string, AttackEffect>> = {
  // Simisage – Fire's Power: Burned, with any Fire Energy attached.
  'bw2-2': { "Fire's Power": typePower(30, 'fire', (ctx) => ctx.inflict('burned')) },
  // Leavanny – Nurturing: any of the player's Pokémon evolved from the deck.
  'bw2-7': {
    Nurturing: {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to evolve from your deck' }],
      run: nurture('Nurturing', (ctx) => ctx.choices.ownTarget ?? 'active').run,
    },
  },
  // Whimsicott – Helping Hand: a basic Energy card from the deck onto a Benched Pokémon. Encore: as Golduck's (Secret Wonders).
  'bw2-11': {
    // It can't be used when it would do nothing (the user's, 2026-10-26): with no Benched Pokémon.
    'Helping Hand': {
      blocked: (s) => (benchedSlots(s.ownBench).length ? null : 'You have no Benched Pokémon'),
      run: (ctx) => void (ctx.me.deck.length && ctx.me.bench.some(Boolean) && ctx.pend({ kind: 'pickFromDeck', source: 'Helping Hand', filter: 'basicEnergy', attach: true, attachOnly: { bench: true } })),
    },
  },
  'bw2-12': { Encore: same(() => DP3['dp3-28']?.['Encore']) },
  // Lilligant – Bemusing Aroma: heads Paralyzed and Poisoned, tails Confused.
  'bw2-14': {
    'Bemusing Aroma': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return ctx.inflict('confused');
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Simisear – Water's Power: Asleep, with any Water Energy attached.
  'bw2-19': { "Water's Power": typePower(30, 'water', (ctx) => ctx.inflict('asleep')) },
  // Simipour – Grass' Power: 20 off itself, with any Grass Energy attached.
  'bw2-23': { "Grass' Power": typePower(30, 'grass', (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 20)) },
  // Basculin – Final Gambit: 2 tails, 80 to itself. Splatter: 30 to 1 of the opponent's Pokémon.
  'bw2-24': {
    'Final Gambit': {
      run(ctx) {
        ctx.hit(80);
        if (ctx.flips(2) === 0) ctx.selfDamage(80);
      },
    },
  },
  'bw2-25': { Splatter: snipeChosen(() => 30) },
  // Ducklett – Roost: 40 off itself; it can't retreat during the player's next turn.
  'bw2-26': {
    Roost: {
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 40);
        (ctx.attacker.effects ??= {}).noRetreat = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} can't retreat next turn.`);
      },
    },
  },
  // Cubchoo – Rest: 60 off itself, then Asleep.
  'bw2-28': {
    Rest: {
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 60);
        ctx.sleepSelf();
      },
    },
  },
  // Swoobat – Phat Sound: 3 coins, 10 for each heads to each of the opponent's Pokémon.
  'bw2-37': {
    'Phat Sound': {
      run(ctx) {
        const damage = 10 * ctx.flips(3);
        if (!damage) return ctx.log('Phat Sound did nothing.');
        ctx.hit(damage);
        ctx.benchDamage(ctx.opp, damage);
      },
    },
  },
  // Sigilyph – Telekinesis: 50 to 1 of the opponent's Pokémon, no Weakness or Resistance.
  'bw2-41': {
    Telekinesis: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 50 damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 50),
    },
  },
  // Gothorita – Deleting Glare: heads, an Energy card off 1 of the opponent's Pokémon.
  'bw2-46': {
    'Deleting Glare': {
      choices: (s, c) => oppEnergyChoices(s, c, "Choose one of your opponent's Pokémon (an Energy card is discarded from it on heads)"),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Deleting Glare did nothing.');
        discardOppEnergy(ctx, ctx.choices.oppTarget, ctx.choices.oppEnergyUid);
      },
    },
  },
  // Gothitelle – Mental Shock: heads Confused, tails an Energy card off the Defending Pokémon.
  'bw2-48': { 'Mental Shock': headsElseDiscard(60, (ctx) => ctx.inflict('confused')) },
  // Boldore – Smack Down: 60 more against a Fighting Resistance (a second printed one too).
  'bw2-51': {
    'Smack Down': {
      run(ctx) {
        const d = ctx.defenderDef;
        ctx.hit([d.resistance?.type, ...(d.moreResistance ?? [])].includes('fighting') ? 80 : 20);
      },
    },
  },
  // Gigalith – Shear: the top 5 cards of the deck discarded; the Fighting Energy cards among them attached to it.
  'bw2-53': {
    Shear: {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 5);
        const fighting = top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy' && energyCardOf(ctx.state.cards, c, 'fighting'));
        ctx.me.discard.push(...top.filter((c) => !fighting.includes(c)));
        ctx.attacker.energy.push(...fighting);
        ctx.log(`Discarded ${top.length - fighting.length} card${top.length - fighting.length === 1 ? '' : 's'} from the top of the deck and attached ${fighting.length} Fighting Energy to ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Sawk – Five Fierce Chops: 5 coins, 20 for each heads; it can't attack next turn.
  'bw2-59': {
    'Five Fierce Chops': {
      run(ctx) {
        ctx.hit(20 * ctx.flips(5));
        restNextTurn(ctx);
      },
    },
  },
  // Liepard – Feint Attack: as the shared wording (Aquapolis's), 30 to 1 of the opponent's Pokémon.
  'bw2-65': { 'Feint Attack': template('feintAttack', 0, 'Feint Attack', 30) },
  // Ferrothorn – Power Whip: 10 for each Energy attached to it, to 1 of the opponent's Pokémon.
  'bw2-73': { 'Power Whip': snipeChosen((ctx) => 10 * energyAmount(ctx, ctx.attacker)) },
  // Klinklang – Zap Cannon: tails, it can't use Zap Cannon next turn.
  'bw2-76': {
    'Zap Cannon': {
      run(ctx) {
        ctx.hit(80);
        if (!ctx.flip()) notNextTurn(ctx, 'Zap Cannon');
      },
    },
  },
  // Watchog – Watcheck: the top 5 cards of the opponent's deck in any order. Quick Tail Smash: may flip; heads 60 more, tails nothing.
  'bw2-79': {
    Watcheck: { run: (ctx) => void (ctx.opp.deck.length && ctx.pend({ kind: 'arrangeTop', source: 'Watcheck', count: Math.min(5, ctx.opp.deck.length), deckOwner: ctx.opp.id })) },
    'Quick Tail Smash': {
      choices: (): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt: 'Quick Tail Smash: flip a coin (heads 60 more damage, tails nothing)?' }],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(20);
        if (ctx.flip()) return void ctx.hit(80);
        ctx.log('Quick Tail Smash did nothing.');
      },
    },
  },
  // Unfezant – Tailwind: an Energy card from the hand onto any of the player's Pokémon. Feather Strike: heads 40 more, tails an
  // Energy card off the Defending Pokémon.
  'bw2-82': {
    // It can't be used when it would do nothing (the user's, 2026-10-26): with no Energy card in the hand.
    Tailwind: {
      blocked: (s) => (!s.ownHand || s.ownHand.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'You have no Energy cards in your hand'),
      run: (ctx) => void (ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') && ctx.pend({ kind: 'attachFromHand', source: 'Tailwind', count: 1, anyTarget: true })),
    },
    'Feather Strike': headsElseDiscard(40, () => {}, 80),
  },
};
