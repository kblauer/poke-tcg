// Attack wordings the EX sets share (Sandstorm to Power Keepers): each wording, whatever card it's on, is played by one
// building block, with the numbers and words in it. scripts/generate-ex-templates.ts matches every EX card's attack text
// (TCGdex's, normalised: normText) against these and writes the matches to ex-template-data.ts; a set's own effects file
// still has the last word on any attack (index.ts). Only wordings whose rules are settled are here: the EX Ruby & Sapphire
// rulings ("each Defending Pokémon" is the Active one and every Benched one, Special Conditions only on the Active one;
// "Energy attached" counts the Energy provided, "not used to pay" less the cost) and the older cards' that word them alike.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { isEnergyCardOf, PRIZE_COUNT, type Affliction, type CardInstance, type InPlayPokemon } from '../engine.js';
import { nextRandom, shuffle } from '../rng.js';
import { hasSpecialCondition } from '../status.js';
import { benchedSlots, benchTarget, discardToUse, extraEnergy, flipToInflict, flipToProtect, headsUntilTails, inflicts, opponentSwitches, perHeads, recoil, tailsSelfDamage } from './common.js';
import { discardDefenderTrainers } from './ecard2.js';
import { discardAtRandom, eachDefending, energyAmount, restNextTurn } from './ex1.js';
import { smokescreen } from './fossil.js';
import { benchMany, noRetreat } from './gym1.js';
import { flipForMore } from './jungle.js';
import { damageOpponent, opponentTargets, rapidSpin } from './neo1.js';
import { attachFromDiscard } from './neo3.js';
import { flipOrNothing } from './rocket.js';
import { healUpTo } from './si1.js';

/** A number or word from the wording (a type, a Special Condition), or the attack's cost ("water,colorless") where it's needed. */
export type TemplateArg = number | string;

export interface AttackTemplate {
  /** The normalised wording (normText); its captures are the template's arguments, numbers as numbers. */
  pattern: RegExp;
  /** Passes the attack's cost on as the last argument (Energy beyond the cost). */
  cost?: true;
  /** Whether the wording fits the card's printed damage (the base damage it repeats must be the same). */
  fits?: (damage: number, args: TemplateArg[]) => boolean;
  /** The effect, from the printed damage, the arguments and the attack's name. */
  make: (damage: number, args: TemplateArg[], attack: string) => AttackEffect;
}

/** A Pokémon's name as its own text repeats it: "Team Magma's Houndoom", "Latias ex", "Flygon δ" also as plain "Houndoom", "Latias", "Flygon". */
const baseName = (name: string) => name.replace(/ (ex|δ|☆|Star)$/, '').replace(/^(Dark|Light|Shining|Team Magma's|Team Aqua's|Rocket's|Holon's) /, '');

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The attack text as the templates read it: lower case, no accents, plain apostrophes and spaces, the Pokémon's own name as "@", no full stop at the end. */
export function normText(text: string, name: string): string {
  let s = fold(text).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  for (const n of new Set([name, baseName(name)])) s = s.split(fold(n)).join('@');
  return s;
}

const TYPE = '(grass|fire|water|lightning|psychic|fighting|darkness|metal)';
const CONDITION = '(paralyzed|confused|asleep|poisoned|burned)';
const BENCH_RULE = " \\(don't apply weakness and resistance for benched pokemon\\.\\)";

const re = (source: string) => new RegExp(`^${source}$`);
const num = (a: TemplateArg | undefined) => a as number;
const word = <T extends string>(a: TemplateArg | undefined) => a as T;
const costOf = (a: TemplateArg | undefined) => String(a).split(',').filter(Boolean) as EnergyType[];

/** Base damage, then `more` if `when` holds ("If the Defending Pokémon is Pokémon-ex, this attack does 30 damage plus 30 more damage"). */
const bonusIf = (base: number, more: number, when: (ctx: AttackContext) => boolean): AttackEffect => ({
  run: (ctx) => void ctx.hit(when(ctx) ? base + more : base),
});

/** Base damage, then `rest`. */
const thenDo = (damage: number, rest: (ctx: AttackContext) => void): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    rest(ctx);
  },
});

/** Its damage counters (10 damage each). */
const counters = (p: InPlayPokemon) => Math.floor(p.damage / 10);

/** Basic Energy cards of `type` attached to the Pokémon, as Battle Blast counts them. */
const typedCount = (ctx: AttackContext, p: InPlayPokemon, type: EnergyType) => p.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, type)).length;

const ownInPlay = (ctx: AttackContext) => [ctx.me.active, ...ctx.me.bench].filter((p): p is InPlayPokemon => !!p);
const oppInPlay = (ctx: AttackContext) => [ctx.opp.active, ...ctx.opp.bench].filter((p): p is InPlayPokemon => !!p);

/** Energy cards of `type` (or any, or basic) in the discard pile, for "search your discard pile for … and attach it to …". */
const discardMatch = (ctx: AttackContext, kind: string) => (c: CardInstance) => {
  const d = lookupCard(ctx.state.cards, c.defId);
  if (d.kind !== 'energy') return false;
  if (kind === 'any') return true;
  if (kind === 'basic') return isBasicEnergy(d);
  return isEnergyCardOf(c, ctx.state.cards, kind as EnergyType);
};

/** "Choose 1 of your opponent's Pokémon. This attack does 20 damage to that Pokémon." (Weakness and Resistance on the Active one only, unless `noWR`). */
const snipe = (amount: number, noWR: boolean): AttackEffect => ({
  choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: ['active', ...benchedSlots(s.opponentBench)], prompt: `Choose one of your opponent's Pokémon to do ${amount} damage to` }],
  run(ctx) {
    const t = ctx.choices.oppTarget ?? 'active';
    if (t === 'active') ctx.hit(amount, noWR ? { weakness: false } : {});
    else ctx.damageBenched(ctx.opp, t, amount);
  },
});

/** Damage to the Defending Pokémon and the same to each of the opponent's Benched Pokémon. */
const spread = (amount: number) => (ctx: AttackContext) => {
  ctx.hit(amount);
  ctx.benchDamage(ctx.opp, amount);
};

/** "Choose 1 of the Defending Pokémon's attacks. That Pokémon can't use that attack during your opponent's next turn." */
const amnesia = (damage: number): AttackEffect => ({
  choices: (s) => {
    const d = lookupCard(s.cards, s.defender.card.defId);
    const options = d.kind === 'pokemon' ? d.attacks.map((_, i) => i) : [];
    return options.length ? [{ kind: 'defenderAttack', options, prompt: "Choose one of the Defending Pokémon's attacks to block" }] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    const attack = ctx.choices.attackIndex !== undefined ? ctx.defenderDef.attacks[ctx.choices.attackIndex] : undefined;
    if (!attack) return;
    ctx.affectDefender((e) => {
      e.amnesia = { attack: attack.name, until: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name} can't use ${attack.name} next turn.`);
    });
  },
});

/** Switch the attacker with one of its player's Benched Pokémon, after the damage (`optional`: "you may"). */
const switchSelf = (damage: number, optional: boolean): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = benchedSlots(s.ownBench);
    return options.length ? [{ kind: 'ownBench', options: optional ? [-1, ...options] : options, optional, prompt: `Choose one of your Benched Pokémon to switch with${optional ? ' (or none)' : ''}` }] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    const slot = ctx.choices.ownBenchSlot;
    if (slot !== undefined && slot >= 0) ctx.switchOwn(slot);
  },
});

/** Heads (chosen before the flip): an Energy card attached to the Defending Pokémon discarded. */
const flipDiscardDefenderEnergy = (damage: number): AttackEffect => ({
  choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
  run(ctx) {
    ctx.hit(damage);
    if (ctx.flip() && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
  },
});

/** A card from the opponent's hand at random, looked at, then shuffled into their deck. */
function shuffleRandomIntoDeck(ctx: AttackContext) {
  if (!ctx.opp.hand.length) return ctx.log("Your opponent's hand is empty.");
  const [r, next] = nextRandom(ctx.state.rngState);
  ctx.state.rngState = next;
  const [card] = ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1);
  ctx.opp.deck.push(card!);
  [ctx.opp.deck, ctx.state.rngState] = shuffle(ctx.opp.deck, ctx.state.rngState);
  ctx.log(`Shuffled ${lookupCard(ctx.state.cards, card!.defId).name} from the opponent's hand into their deck.`, ctx.opp.id);
}

/** The first Energy card of `type` attached to the attacker discarded (Fireworks). */
function discardOwnTyped(ctx: AttackContext, type: EnergyType) {
  const card = ctx.attacker.energy.find((e) => isEnergyCardOf(e, ctx.state.cards, type));
  if (!card) return;
  ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
  ctx.me.discard.push(card);
  ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from ${ctx.attackerDef.name}.`);
}

/** The Defending Pokémon can't attack during the opponent's next turn. */
const noAttack = (ctx: AttackContext) =>
  ctx.affectDefender((e) => {
    e.noAttack = ctx.turn + 1;
    ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
  });

const noRetreatNow = (ctx: AttackContext) =>
  ctx.affectDefender((e) => {
    e.noRetreat = ctx.turn + 1;
    ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`);
  });

/** How many Special Conditions the Pokémon has (Asleep, Confused or Paralyzed is one; Poisoned and Burned one each). */
const conditionCount = (p: InPlayPokemon) => (p.condition ? 1 : 0) + (p.poison ? 1 : 0) + (p.burned ? 1 : 0);

const sameBase = (index: number) => (damage: number, args: TemplateArg[]) => args[index] === damage;

export const ATTACK_TEMPLATES: Record<string, AttackTemplate> = {
  // Coin flips for more damage.
  flipForMore: { pattern: re('flip a coin\\. if heads, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => flipForMore(num(base), num(more)) },
  perHeads: { pattern: re('flip (\\d+) coins\\. this attack does (\\d+) damage times the number of heads'), fits: sameBase(1), make: (_, [coins, each]) => perHeads(num(coins), num(each)) },
  perHeadsMore: { pattern: re('flip (\\d+) coins\\. this attack does (\\d+) damage plus (\\d+) more damage for each heads'), fits: sameBase(1), make: (_, [coins, base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * ctx.flips(num(coins))) }) },
  untilTails: { pattern: re('flip a coin until you get tails\\. this attack does (\\d+) damage times the number of heads'), fits: sameBase(0), make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * headsUntilTails(ctx)) }) },
  flipPerEnergy: { pattern: re('flip a coin for each energy attached to @\\. this attack does (\\d+) damage times the number of heads'), fits: sameBase(0), make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * ctx.flips(energyAmount(ctx, ctx.attacker))) }) },
  flipPerTypedMore: { pattern: re(`flip a coin for each ${TYPE} energy attached to @\\. this attack does (\\d+) damage plus (\\d+) more damage for each heads`), fits: sameBase(1), make: (_, [type, base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * ctx.flips(typedCount(ctx, ctx.attacker, word(type)))) }) },
  tailsNothing: { pattern: re('flip a coin\\. if tails, this attack does nothing'), make: (d) => flipOrNothing(d) },
  tailsSelfDamage: { pattern: re('flip a coin\\. if tails, @ does (\\d+) damage to itself'), make: (d, [self]) => tailsSelfDamage(d, num(self)) },

  // Special Conditions.
  flipCondition: { pattern: re(`flip a coin\\. if heads, (?:the|each) defending pokemon is now ${CONDITION}`), make: (d, [c]) => flipToInflict(d, word<Affliction>(c)) },
  condition: { pattern: re(`(?:the|each) defending pokemon is now ${CONDITION}`), make: (d, [c]) => inflicts(d, word<Affliction>(c)) },
  twoConditions: { pattern: re(`the defending pokemon is now ${CONDITION} and ${CONDITION}`), make: (d, [a, b]) => thenDo(d, (ctx) => (ctx.inflict(word(a)), ctx.inflict(word(b)))) },
  flipTwoConditions: {
    pattern: re(`flip a coin\\. if heads, the defending pokemon is now ${CONDITION} and ${CONDITION}`),
    make: (d, [a, b]) => thenDo(d, (ctx) => ctx.flip() && (ctx.inflict(word(a)), ctx.inflict(word(b)))),
  },
  headsOrTails: {
    pattern: re(`flip a coin\\. if heads, the defending pokemon is now ${CONDITION}\\. if tails, the defending pokemon is now ${CONDITION}`),
    make: (d, [heads, tails]) => thenDo(d, (ctx) => ctx.inflict(word(ctx.flip() ? heads : tails))),
  },
  toxic: { pattern: re('the defending pokemon is now poisoned\\. put 2 damage counters instead of 1 on the defending pokemon between turns'), make: (d) => inflicts(d, 'toxic') },
  poisonNoRetreat: { pattern: re("the defending pokemon is now poisoned\\. the defending pokemon can't retreat during your opponent's next turn"), make: (d) => thenDo(d, (ctx) => (ctx.inflict('poisoned'), noRetreatNow(ctx))) },
  evolvedCondition: { pattern: re(`if the defending pokemon is an evolved pokemon, the defending pokemon is now ${CONDITION}`), make: (d, [c]) => thenDo(d, (ctx) => ctx.defender.evolvedFrom.length > 0 && ctx.inflict(word(c))) },
  exConditions: { pattern: re(`if the defending pokemon is pokemon-ex, the defending pokemon is now ${CONDITION} and ${CONDITION}`), make: (d, [a, b]) => thenDo(d, (ctx) => ctx.defenderDef.ex && (ctx.inflict(word(a)), ctx.inflict(word(b)))) },
  bothConfused: { pattern: re('both @ and the defending pokemon are now confused'), make: (d) => thenDo(d, (ctx) => (ctx.inflict('confused'), ctx.confuseSelf())) },
  selfAsleep: { pattern: re('@ is now asleep'), make: (d) => thenDo(d, (ctx) => ctx.sleepSelf()) },
  flipDamageOrCondition: {
    pattern: re(`flip a coin\\. if heads, this attack does (\\d+) damage to the defending pokemon\\. if tails, the defending pokemon is now ${CONDITION}`),
    fits: (d) => d === 0,
    make: (_, [amount, c]) => ({ run: (ctx) => (ctx.flip() ? void ctx.hit(num(amount)) : ctx.inflict(word(c))) }),
  },
  tailsNothingHeadsCondition: {
    pattern: re(`flip a coin\\. if tails, this attack does nothing\\. if heads, the defending pokemon is now ${CONDITION}`),
    make: (d, [c]) => ({
      run(ctx) {
        if (!ctx.flip()) return ctx.log('The attack did nothing.');
        ctx.hit(d);
        ctx.inflict(word(c));
      },
    }),
  },

  // Damage that depends on the Pokémon in play.
  exMore: { pattern: re('if the defending pokemon is pokemon-ex, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => !!ctx.defenderDef.ex) },
  evolvedMore: { pattern: re('if the defending pokemon is an evolved pokemon, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => ctx.defender.evolvedFrom.length > 0) },
  stageMore: {
    pattern: re('if the defending pokemon is a stage (1|2) evolved pokemon, this attack does (\\d+) damage plus (\\d+) more damage'),
    fits: sameBase(1),
    make: (_, [stage, base, more]) => bonusIf(num(base), num(more), (ctx) => ctx.defenderDef.stage === `stage${stage}`),
  },
  conditionMore: { pattern: re('if the defending pokemon is affected by a special condition, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => hasSpecialCondition(ctx.defender)) },
  damagedMore: { pattern: re('if the defending pokemon (?:already )?has any damage counters on it, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => ctx.defender.damage > 0) },
  atLeastMore: {
    pattern: re('if the defending pokemon already has at least (\\d+) damage counters on it, this attack does (\\d+) damage plus (\\d+) more damage'),
    fits: sameBase(1),
    make: (_, [n, base, more]) => bonusIf(num(base), num(more), (ctx) => counters(ctx.defender) >= num(n)),
  },
  powerMore: { pattern: re('if the defending pokemon has any poke-powers or poke-bodies, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => !!ctx.defenderDef.power) },
  toolMore: { pattern: re('if @ has a pokemon tool card attached to it, this attack does (\\d+) damage plus (\\d+) more damage'), fits: sameBase(0), make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => (ctx.attacker.attached ?? []).some((a) => a.tool)) },
  lessEnergyMore: {
    pattern: re('if @ has less energy attached to it than the defending pokemon, this attack does (\\d+) damage plus (\\d+) more damage'),
    fits: sameBase(0),
    make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => energyAmount(ctx, ctx.attacker) < energyAmount(ctx, ctx.defender)),
  },
  morePrizesMore: {
    pattern: re('if you have more prize cards left than your opponent, this attack does (\\d+) damage plus (\\d+) more damage'),
    fits: sameBase(0),
    make: (_, [base, more]) => bonusIf(num(base), num(more), (ctx) => ctx.me.prizes.length > ctx.opp.prizes.length),
  },
  linkBlast: {
    pattern: re("if @ and the defending pokemon have a different amount of energy attached to them, this attack's base damage is (\\d+) instead of (\\d+)"),
    fits: sameBase(1),
    make: (_, [low, base]) => ({
      run(ctx) {
        const differ = energyAmount(ctx, ctx.attacker) !== energyAmount(ctx, ctx.defender);
        if (differ) ctx.log(`The attack's base damage is ${low}.`);
        ctx.hit(num(differ ? low : base));
      },
    }),
  },
  notAsleepNothing: { pattern: re('if the defending pokemon is not asleep, this attack does nothing'), make: (d) => ({ run: (ctx) => (ctx.defender.condition === 'asleep' ? void ctx.hit(d) : ctx.log('The attack did nothing.')) }) },

  // Damage for each of something.
  rage: { pattern: re('does (\\d+) damage plus (\\d+) more damage for each damage counter on @'), fits: sameBase(0), make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * counters(ctx.attacker)) }) },
  flail: { pattern: re('does (\\d+) damage times the number of damage counters on @'), fits: sameBase(0), make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * counters(ctx.attacker)) }) },
  karateChop: { pattern: re('does (\\d+) damage minus (\\d+) damage for each damage counter on @'), fits: sameBase(0), make: (_, [base, less]) => ({ run: (ctx) => void ctx.hit(Math.max(0, num(base) - num(less) * counters(ctx.attacker))) }) },
  meditate: { pattern: re('does (\\d+) damage plus (\\d+) more damage for each damage counter on the defending pokemon'), fits: sameBase(0), make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * counters(ctx.defender)) }) },
  perOwnEnergy: { pattern: re('does (\\d+) damage times the amount of energy attached to @'), fits: sameBase(0), make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * energyAmount(ctx, ctx.attacker)) }) },
  perOwnEnergyMore: { pattern: re('does (\\d+) damage plus (\\d+) more damage for each energy attached to @'), fits: sameBase(0), make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * energyAmount(ctx, ctx.attacker)) }) },
  perDefenderEnergy: { pattern: re('does (\\d+) damage times the amount of energy attached to the defending pokemon'), fits: sameBase(0), make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * energyAmount(ctx, ctx.defender)) }) },
  perDefenderEnergyMore: { pattern: re('does (\\d+) damage plus (\\d+) more damage for each energy attached to the defending pokemon'), fits: sameBase(0), make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * energyAmount(ctx, ctx.defender)) }) },
  energyBurst: {
    pattern: re('does (\\d+) damage times the total amount of energy attached to @ and the defending pokemon'),
    fits: sameBase(0),
    make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * (energyAmount(ctx, ctx.attacker) + energyAmount(ctx, ctx.defender))) }),
  },
  perTypedMore: { pattern: re(`does (\\d+) damage plus (\\d+) more damage for each ${TYPE} energy attached to @`), fits: sameBase(0), make: (_, [base, more, type]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * typedCount(ctx, ctx.attacker, word(type))) }) },
  perOwnTypedAllMore: {
    pattern: re(`does (\\d+) damage plus (\\d+) more damage for each ${TYPE} energy attached to all of your pokemon`),
    fits: sameBase(0),
    make: (_, [base, more, type]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * ownInPlay(ctx).reduce((n, p) => n + typedCount(ctx, p, word(type)), 0)) }),
  },
  perOwnEnergyAll: {
    pattern: re('does (\\d+) damage times the amount of energy attached to all of your pokemon \\(including @\\)'),
    fits: sameBase(0),
    make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * ownInPlay(ctx).reduce((n, p) => n + energyAmount(ctx, p), 0)) }),
  },
  perOppEnergyAllMore: {
    pattern: re("does (\\d+) damage plus (\\d+) more damage for each energy attached to all of your opponent's pokemon"),
    fits: sameBase(0),
    make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * oppInPlay(ctx).reduce((n, p) => n + energyAmount(ctx, p), 0)) }),
  },
  perConditionMore: {
    pattern: re('does (\\d+) damage plus (\\d+) more damage for each special condition affecting the defending pokemon'),
    fits: sameBase(0),
    make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * conditionCount(ctx.defender)) }),
  },
  perPrizeTakenMore: {
    pattern: re('does (\\d+) damage plus (\\d+) more damage for each prize card your opponent has taken'),
    fits: sameBase(0),
    make: (_, [base, more]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * Math.max(0, PRIZE_COUNT - ctx.opp.prizes.length)) }),
  },
  perOppBenched: { pattern: re("does (\\d+) damage times the number of your opponent's benched pokemon"), fits: sameBase(0), make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * benchedSlots(ctx.opp.bench).length) }) },
  perInPlay: {
    pattern: re("does (\\d+) damage times the number of pokemon in play \\(both yours and your opponent's\\), excluding @"),
    fits: sameBase(0),
    make: (_, [each]) => ({ run: (ctx) => void ctx.hit(num(each) * (ownInPlay(ctx).length + oppInPlay(ctx).length - 1)) }),
  },
  extraTyped: {
    pattern: re(`does (\\d+) damage plus (\\d+) more damage for each ${TYPE} energy attached to @ but not used to pay for this attack's energy cost\\. you can't add more than (\\d+) damage in this way`),
    cost: true,
    fits: sameBase(0),
    make: (_, [base, more, type, cap, cost]) => ({ run: (ctx) => void ctx.hit(num(base) + num(more) * extraEnergy(ctx, costOf(cost), word(type), num(cap) / num(more))) }),
  },
  extraEnergy: {
    pattern: re("does (\\d+) damage plus (\\d+) more damage for each energy attached to @ but not used to pay for this attack's energy cost\\. you can't add more than (\\d+) damage in this way"),
    cost: true,
    fits: sameBase(0),
    make: (_, [base, more, cap, cost]) => ({ run: (ctx) => void ctx.hit(num(base) + Math.min(num(cap), num(more) * Math.max(0, energyAmount(ctx, ctx.attacker) - costOf(cost).length))) }),
  },

  // Damage rules.
  swift: { pattern: re("this attack's damage isn't affected by weakness, resistance, poke-powers, poke-bodies, or any other effects on the defending pokemon"), make: (d) => ({ run: (ctx) => void ctx.hit(d, { swift: true }) }) },
  noResistance: { pattern: re("this attack's damage (?:isn't|is not) affected by resistance"), make: (d) => ({ run: (ctx) => void ctx.hit(d, { resistance: false }) }) },
  noWeaknessResistance: { pattern: re("this attack's damage isn't affected by weakness or resistance"), make: (d) => ({ run: (ctx) => void ctx.hit(d, { weakness: false }) }) },
  recoil: { pattern: re('@ does (\\d+) damage to itself'), make: (d, [self]) => recoil(d, num(self)) },

  // Damage to other Pokémon.
  snipe: { pattern: re(`choose 1 of your opponent's pokemon\\. this attack does (\\d+) damage to that pokemon\\.${BENCH_RULE}`), fits: (d) => d === 0, make: (_, [amount]) => snipe(num(amount), false) },
  // As Aquapolis's Feint Attack: nothing on the chosen Pokémon changes the damage.
  feintAttack: {
    pattern: re("choose 1 of your opponent's pokemon\\. this attack does (\\d+) damage to that pokemon\\. this attack's damage isn't affected by weakness, resistance, poke-powers, poke-bodies,? or any other effects on that pokemon"),
    fits: (d) => d === 0,
    make: (_, [amount]) => ({
      choices: (s) => opponentTargets(s, `Choose one of your opponent's Pokémon to do ${amount} damage to`),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', num(amount), true),
    }),
  },
  snipeNoWR: { pattern: re("choose 1 of your opponent's pokemon\\. this attack does (\\d+) damage to that pokemon\\. this attack's damage isn't affected by weakness or resistance"), fits: (d) => d === 0, make: (_, [amount]) => snipe(num(amount), true) },
  benchOne: { pattern: re(`(?:does (\\d+) damage to 1 of your opponent's benched pokemon|choose 1 of your opponent's benched pokemon\\. this attack does (\\d+) damage to that pokemon)\\.${BENCH_RULE}`), make: (d, [a, b]) => benchTarget(d, num(a ?? b)) },
  benchTwo: { pattern: re(`does (\\d+) damage to 2 of your opponent's benched pokemon \\(1 if there is only 1\\)\\.${BENCH_RULE}`), make: (d, [amount]) => benchMany(2, d, num(amount)) },
  benchAll: { pattern: re(`does (\\d+) damage to each of your opponent's benched pokemon\\.${BENCH_RULE}`), make: (d, [amount]) => thenDo(d, (ctx) => ctx.benchDamage(ctx.opp, num(amount))) },
  ownBench: { pattern: re(`does (\\d+) damage to each of your benched pokemon\\.${BENCH_RULE}`), make: (d, [amount]) => thenDo(d, (ctx) => ctx.benchDamage(ctx.me, num(amount))) },
  bothBenches: {
    pattern: re(`does (\\d+) damage to each benched pokemon \\(both yours and your opponent's\\)\\.${BENCH_RULE}`),
    make: (d, [amount]) => thenDo(d, (ctx) => (ctx.benchDamage(ctx.opp, num(amount)), ctx.benchDamage(ctx.me, num(amount)))),
  },
  spreadAll: {
    pattern: re(`(?:this attack )?does (\\d+) damage to each of your opponent's pokemon\\.${BENCH_RULE}`),
    fits: (d, [amount]) => d === 0 || d === amount,
    make: (_, [amount]) => ({ run: spread(num(amount)) }),
  },
  flipSpreadAll: {
    pattern: re(`flip a coin\\. if heads, this attack does (\\d+) damage to each of your opponent's pokemon\\.${BENCH_RULE}`),
    fits: (d) => d === 0,
    make: (_, [amount]) => ({ run: (ctx) => (ctx.flip() ? spread(num(amount))(ctx) : ctx.log('The attack did nothing.')) }),
  },
  eachDefending: { pattern: re('does (\\d+) damage to each defending pokemon'), fits: (d) => d === 0, make: (_, [amount]) => ({ run: (ctx) => eachDefending(ctx, num(amount)) }) },

  // Protection and limits.
  agility: { pattern: re("flip a coin\\. if heads, prevent all effects of an attack, including damage, done to @ during your opponent's next turn"), make: (d) => flipToProtect(d, 'preventAll') },
  smokescreen: { pattern: re("if the defending pokemon tries to attack during your opponent's next turn, your opponent flips a coin\\. if tails, that attack does nothing"), make: (d) => smokescreen(d) },
  noRetreat: { pattern: re("the defending pokemon can't retreat (?:during|until the end of) your opponent's next turn"), make: (d) => noRetreat(d) },
  flipNoAttack: { pattern: re("flip a coin\\. if heads, the defending pokemon can't attack during your opponent's next turn"), make: (d) => thenDo(d, (ctx) => ctx.flip() && noAttack(ctx)) },
  flipNoAttackOrRetreat: { pattern: re("flip a coin\\. if heads, the defending pokemon can't attack or retreat during your opponent's next turn"), make: (d) => thenDo(d, (ctx) => ctx.flip() && (noAttack(ctx), noRetreatNow(ctx))) },
  amnesia: { pattern: re("choose 1 of the defending pokemon's attacks\\. that pokemon can't use that attack during your opponent's next turn"), make: (d) => amnesia(d) },
  rest: { pattern: re("@ can't attack during your next turn"), make: (d) => thenDo(d, restNextTurn) },

  // Switching.
  teleport: { pattern: re('switch @ with 1 of your benched pokemon'), make: (d) => switchSelf(d, false) },
  maySwitchSelf: { pattern: re('after your attack, you may switch @ with 1 of your benched pokemon'), make: (d) => switchSelf(d, true) },
  opponentSwitches: { pattern: re('your opponent switches the defending pokemon with 1 of his or her benched pokemon(?:, if any)?'), make: (d, _, attack) => thenDo(d, (ctx) => opponentSwitches(ctx, attack)) },
  rapidSpin: {
    pattern: re('your opponent switches the defending pokemon with 1 of his or her benched pokemon, if any\\. you switch @ with 1 of your benched pokemon, if any'),
    make: (d, _, attack) => rapidSpin(d, attack),
  },

  // Cards.
  draw: { pattern: re('draw (?:a card|(\\d+) cards)'), make: (d, [n]) => thenDo(d, (ctx) => ctx.draw(n === undefined ? 1 : num(n))) },
  evolvedDraw: { pattern: re('if your opponent has any evolved pokemon in play, draw (\\d+) cards'), make: (d, [n]) => thenDo(d, (ctx) => oppInPlay(ctx).some((p) => p.evolvedFrom.length > 0) && ctx.draw(num(n))) },
  randomDiscard: { pattern: re("choose 1 card from your opponent's hand without looking and discard it"), make: (d) => thenDo(d, discardAtRandom) },
  randomToDeck: {
    pattern: re("choose 1 card from your opponent's hand without looking\\. look at the card you chose, then have your opponent shuffle that card into his or her deck"),
    make: (d) => thenDo(d, shuffleRandomIntoDeck),
  },
  millOpponent: {
    pattern: re('your opponent discards the top card of his or her deck'),
    make: (d) =>
      thenDo(d, (ctx) => {
        const [card] = ctx.opp.deck.splice(0, 1);
        if (!card) return;
        ctx.opp.discard.push(card);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from the top of the opponent's deck.`, ctx.opp.id);
      }),
  },
  mug: { pattern: re('before doing damage, discard all trainer cards attached to the defending pokemon'), make: (d) => ({ run: (ctx) => (discardDefenderTrainers(ctx), void ctx.hit(d)) }) },
  benchSearch: {
    pattern: re('search your deck for (?:a basic pokemon and put it|up to (\\d+) basic pokemon and put them) onto your bench\\. shuffle your deck afterward'),
    make: (d, [n], attack) =>
      thenDo(d, (ctx) => {
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: attack, filter: 'basic', toBench: true, optional: true, count: n === undefined ? 1 : num(n) });
      }),
  },

  // Energy.
  discardTyped: { pattern: re(`discard (?:a|an) ${TYPE} energy(?: card)? attached to @`), make: (d, [type]) => discardToUse(d, 1, word(type)) },
  discardAll: { pattern: re('discard all energy cards attached to @'), make: (d) => discardToUse(d, 'all', undefined) },
  tailsDiscardTyped: { pattern: re(`flip a coin\\. if tails, discard a ${TYPE} energy card attached to @`), make: (d, [type]) => thenDo(d, (ctx) => !ctx.flip() && discardOwnTyped(ctx, word(type))) },
  flipDiscardDefenderEnergy: { pattern: re('flip a coin\\. if heads, discard an energy(?: card)? attached to the defending pokemon'), make: (d) => flipDiscardDefenderEnergy(d) },
  attachFromDiscard: {
    pattern: re(`search your discard pile for (?:an energy card|a (basic|${TYPE.slice(1, -1)}) energy card) and attach it to @`),
    make: (d, [kind]) => thenDo(d, (ctx) => attachFromDiscard(ctx, discardMatch(ctx, String(kind ?? 'any')))),
  },
  flipAttachFromDiscard: {
    pattern: re(`flip a coin\\. if heads, search your discard pile for a ${TYPE} energy card and attach it to @`),
    make: (d, [type]) => thenDo(d, (ctx) => ctx.flip() && attachFromDiscard(ctx, discardMatch(ctx, String(type)))),
  },

  // Healing.
  heal: { pattern: re('remove (\\d+) damage counters? from @'), make: (d, [n]) => thenDo(d, (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 10 * num(n))) },
  healAll: { pattern: re('remove 1 damage counter from each of your pokemon \\(including @\\)'), make: (d) => thenDo(d, (ctx) => ownInPlay(ctx).forEach((p) => healUpTo(ctx, ctx.me, p, 10))) },
  drain: {
    pattern: re('after your attack, remove from @ the number of damage counters equal to the damage you did to the defending pokemon\\. if @ has fewer damage counters than that, remove all of them'),
    make: (d) => ({ run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, ctx.hit(d)) }),
  },
};

/** An attack's template and its arguments, as ex-template-data.ts stores them: the key, the printed damage, then the arguments. */
export type TemplateUse = [key: string, damage: number, ...args: TemplateArg[]];

/** The template an attack's wording matches, if any (for the generator): its key and arguments, or why the wording didn't fit. */
export function matchTemplate(text: string, name: string, damage: number, cost: string[]): TemplateUse | { misfit: string } | null {
  const t = normText(text, name);
  for (const [key, template] of Object.entries(ATTACK_TEMPLATES)) {
    const m = template.pattern.exec(t);
    if (!m) continue;
    // Optional captures are alternatives or last, so leaving out the missing ones keeps the others in place.
    const args: TemplateArg[] = m.slice(1).flatMap((a) => (a === undefined ? [] : [/^\d+$/.test(a) ? Number(a) : a]));
    if (template.fits && !template.fits(damage, args)) return { misfit: key };
    return [key, damage, ...args, ...(template.cost ? [cost.map((c) => c.toLowerCase()).join(',')] : [])];
  }
  return null;
}

/** The attack effects of every card in the generated data (by card id, then attack name). */
export const templateEffects = (data: Record<string, Record<string, TemplateUse>>): Record<string, Record<string, AttackEffect>> =>
  Object.fromEntries(
    Object.entries(data).map(([id, attacks]) => [id, Object.fromEntries(Object.entries(attacks).map(([name, [key, damage, ...args]]) => [name, ATTACK_TEMPLATES[key]!.make(damage, args, name)]))]),
  );
