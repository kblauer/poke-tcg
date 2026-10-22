// EX Deoxys (ex8) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: Bay Dance (as Dragon Dance) is for whichever Pokémon is its player's Active one next turn, never for
// damage to the Bench; "each Defending Pokémon" is the opponent's Active Pokémon only, so Raging Tremble's flip changes
// nothing; Psyloop counts the opponent's Pokémon Tools, attached Technical Machines and the Stadium if they played it.
// From the text: Split Bomb, Triple Breach and the other "choose N of your opponent's Pokémon" attacks take as many as
// there are; Healing Steps and Pull Away ask how many cards first (the opponent picks theirs); Foresight looks at either
// player's deck; Psychic Burst counts the Energy cards discarded and the Energy provided on the Defending Pokémon; Holy Star
// does 100 to every Pokémon-ex of the opponent's (Weakness and Resistance only on the Active one).
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, type CardLibrary } from '../cards.js';
import { counts, energyPool, isEnergyCardOf, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { effectId, inPlayDef, pokemonName } from '../status.js';
import { powerEffect } from './index.js';
import { benchedSlots, opponentBenchChoice } from './common.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf, inPlay, putCounters, typeCards } from './ex2.js';
import { knockOver } from './ex4.js';
import { ascension } from './ex5.js';
import { chargeUp, snipe } from './ex6.js';
import { fly, healUpTo } from './si1.js';

const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: Target) => (t === 'active' ? side.active : side.bench[t]) ?? null;

/** `damage` to one of the opponent's Pokémon at `t` (no Weakness or Resistance on the Bench). */
const damageAt = (ctx: AttackContext, t: Target, damage: number) => (t === 'active' ? void ctx.hit(damage) : ctx.damageBenched(ctx.opp, t, damage));

/** "Before doing damage, you may switch 1 of your opponent's Benched Pokémon with the Defending Pokémon" (Drag Off, Luring Antenna). */
export const dragOff = (damage: number): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = benchedSlots(s.opponentBench);
    return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : [];
  },
  run(ctx) {
    const slot = ctx.choices.benchSlot;
    if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
    ctx.hit(damage);
  },
});

/**
 * "Choose `n` of your opponent's Pokémon": every one of them if there are no more, else the player's picks (-1: the Active
 * one). `n` may depend on the attacker (Energy Bone: the Energy attached).
 */
export const chooseOpponents = (count: number | ((attacker: InPlayPokemon, cards: CardLibrary) => number), damage: number, prompt: string): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const n = typeof count === 'number' ? count : count(s.attacker, s.cards);
    const all = targetsIn(s.defender, s.opponentBench);
    return n && all.length > n ? [{ kind: 'opponentBenchMany', count: n, options: [-1, ...benchedSlots(s.opponentBench)], prompt }] : [];
  },
  run(ctx) {
    const n = typeof count === 'number' ? count : count(ctx.attacker, ctx.state.cards);
    const all = targetsIn(ctx.opp.active, ctx.opp.bench);
    const picked: Target[] = all.length > n ? (ctx.choices.benchSlots ?? []).map((s) => (s === -1 ? 'active' : s)) : all;
    for (const t of [...new Set(picked)].slice(0, n)) damageAt(ctx, t, damage);
  },
});

/** Whether a Pokémon's power is a Poké-Body (a Poké-Power or older Pokémon Power, `powers`). */
const hasPower = (cards: AttackContext['state']['cards'], p: InPlayPokemon, body: boolean) => !!inPlayDef(cards, p).power && !!powerEffect(effectId(p))?.body === body;

/** The opponent's Trainer cards in play: Pokémon Tools, Technical Machines and the like on their Pokémon, and their Stadium. */
export const trainersInPlay = (ctx: AttackContext) =>
  inPlay(ctx.opp).reduce((n, p) => n + (p.attached ?? []).filter((a) => lookupCard(ctx.state.cards, a.card.defId).kind === 'trainer').length, 0) +
  (ctx.state.stadium?.owner === ctx.opp.id ? 1 : 0);

/** Miracle Blow, Miracle Essence: heads, the Special Condition the player picks on the Defending Pokémon. */
const miracle = (damage: number): AttackEffect => ({
  choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon (on heads)' }],
  run(ctx) {
    if (damage) ctx.hit(damage);
    if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
  },
});

/** Positive Spark, Negative Spark: 20 to each of the opponent's Pokémon with a Poké-Power (or older Pokémon Power) or a Poké-Body. */
const spark = (body: boolean): AttackEffect => ({
  run(ctx) {
    if (ctx.opp.active && hasPower(ctx.state.cards, ctx.opp.active, body)) ctx.hit(20, { weakness: false });
    ctx.opp.bench.forEach((p, i) => p && hasPower(ctx.state.cards, p, body) && ctx.damageBenched(ctx.opp, i, 20));
  },
});

/** Shooting Star, Shining Star: against the Pokémon `when` names, every Energy card discarded for 100 more. */
const star = (when: (ctx: AttackContext) => boolean): AttackEffect => ({
  run(ctx) {
    if (!when(ctx)) return void ctx.hit(50);
    discardOwn(ctx, ctx.attacker.energy.filter((e) => !e.provides));
    ctx.hit(150);
  },
});

/** Dragon Dance, Bay Dance: next turn, the attacks of whichever Pokémon is the player's Active one do `more` more to the Defending Pokémon. */
export const dance = (source: string, more: number): ((ctx: AttackContext) => void) => (ctx) => {
  Object.assign(ctx.me, { dragonDanceTurn: ctx.turn + 2, dragonDanceMore: more, dragonDanceSource: source });
  ctx.log(`${source}: your attacks do ${more} more damage next turn.`);
};

export const EX8: Record<string, Record<string, AttackEffect>> = {
  // Beautifly – Luring Antenna: a Benched Pokémon may be switched in first; 20 to the Defending Pokémon.
  'ex8-2': { 'Luring Antenna': dragOff(20) },
  // Breloom – Leaf Poison: Poisoned with Grass Energy attached; Hustle Punch: 50 instead of 70 the next turn.
  'ex8-3': {
    'Leaf Poison': {
      run(ctx) {
        ctx.hit(20);
        if (energyPool(ctx.attacker, ctx.state.cards).some((e) => counts(e, 'grass'))) ctx.inflict('poisoned');
      },
    },
    'Hustle Punch': {
      run(ctx) {
        ctx.hit(ctx.attacker.effects?.hustle === ctx.turn ? 50 : 70);
        (ctx.attacker.effects ??= {}).hustle = ctx.turn + 2;
      },
    },
  },
  // Camerupt – Back Burner: up to 2 basic Energy cards from the discard pile to the player's Pokémon; Split Bomb: 30 to 2 of the opponent's Pokémon.
  'ex8-4': {
    'Back Burner': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        if (ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromDiscard', source: 'Back Burner', count: 2 });
      },
    },
    'Split Bomb': chooseOpponents(2, 30, "Choose 2 of your opponent's Pokémon to do 30 damage to"),
  },
  // Claydol – Ancient Mantra: Confused with Psychic Energy attached, 20 more with Fighting Energy attached.
  'ex8-5': {
    'Ancient Mantra': {
      run(ctx) {
        const pool = energyPool(ctx.attacker, ctx.state.cards);
        ctx.hit(pool.some((e) => counts(e, 'fighting')) ? 40 : 20);
        if (pool.some((e) => counts(e, 'psychic'))) ctx.inflict('confused');
      },
    },
  },
  // Dusclops – Psychic Removal: 2 heads, every Energy card on the Defending Pokémon discarded; Powerful Hand: a damage
  // counter for each card in the hand, at most 7.
  'ex8-7': {
    'Psychic Removal': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flips(2) < 2) return;
        for (const e of ctx.defender.energy.filter((c) => !c.provides)) ctx.discardDefenderEnergy(e.uid);
      },
    },
    'Powerful Hand': { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, Math.min(7, ctx.me.hand.length)) },
  },
  // Gyarados – Full Retaliation: 20 for each damage counter on the player's Magikarp; Pulverize: 50 more with 2 or more damage counters on it.
  'ex8-8': {
    'Full Retaliation': { run: (ctx) => void ctx.hit(2 * inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Magikarp')).reduce((n, p) => n + p.damage, 0)) },
    Pulverize: { damage: '50+', run: (ctx) => void ctx.hit(ctx.defender.damage >= 20 ? 100 : 50) },
  },
  // Jirachi – Metallic Blow: 30 more against a Pokémon with a Poké-Body.
  'ex8-9': { 'Metallic Blow': { run: (ctx) => void ctx.hit(hasPower(ctx.state.cards, ctx.defender, true) ? 50 : 20) } },
  // Ludicolo – Healing Steps: any number of cards from the hand discarded, that many damage counters off it.
  'ex8-10': {
    'Healing Steps': {
      choices: () => [{ kind: 'amount', options: Array.from({ length: 11 }, (_, i) => i), prompt: 'How many cards to discard from your hand (a damage counter off Ludicolo for each)?' }],
      run(ctx) {
        ctx.hit(30);
        const n = Math.min(ctx.choices.amount ?? 0, ctx.me.hand.length);
        if (!n) return;
        healUpTo(ctx, ctx.me, ctx.attacker, 10 * n);
        ctx.pend({ kind: 'discardFromHand', source: 'Healing Steps', count: n });
      },
    },
  },
  // Mightyena – Seek Out: any card from the deck; Pull Away: with 5 or more cards, the opponent discards down to 4.
  'ex8-12': {
    'Seek Out': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Seek Out', filter: 'any' })) },
    'Pull Away': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.opp.hand.length >= 5) ctx.opponentChooses({ kind: 'discardFromHand', source: 'Pull Away', count: ctx.opp.hand.length - 4 });
      },
    },
  },
  // Ninjask – Swords Dance: next turn, Slash's base damage is 80.
  'ex8-13': {
    'Swords Dance': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).swordsDance = ctx.turn + 2;
        ctx.log("Next turn, Ninjask's Slash does 80 base damage.");
      },
    },
    Slash: { run: (ctx) => void ctx.hit(ctx.attacker.effects?.swordsDance === ctx.turn ? 80 : 30) },
  },
  // Shedinja – Extra Curse: 2 damage counters, 4 on a Pokémon-ex.
  'ex8-14': { 'Extra Curse': { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, ctx.defenderDef.ex ? 4 : 2) } },
  // Deoxys – Barrier Attack: 30 less attack damage to it next turn.
  'ex8-18': {
    'Barrier Attack': {
      damage: '20',
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 30, until: ctx.turn + 1 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks next turn is reduced by 30.`);
      },
    },
  },
  // Magcargo – Knock Over.
  'ex8-20': { 'Knock Over': knockOver(10) },
  // Pelipper – Bay Dance: 30 more next turn (agreed: whichever Pokémon is Active, never the Bench).
  'ex8-21': {
    'Bay Dance': {
      run(ctx) {
        ctx.hit(10);
        dance('Bay Dance', 30)(ctx);
      },
    },
  },
  // Sableye – Limitation: the opponent can't play Supporter cards next turn.
  'ex8-23': {
    Limitation: {
      run(ctx) {
        ctx.opp.noSupportersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Supporter cards next turn.", ctx.opp.id);
      },
    },
  },
  // Seaking – Triple Breach: 10 to 3 of the opponent's Pokémon.
  'ex8-24': { 'Triple Breach': chooseOpponents(3, 10, "Choose 3 of your opponent's Pokémon to do 10 damage to") },
  // Shiftry – Stadium Power: 20 more with a Stadium in play.
  'ex8-25': { 'Stadium Power': { run: (ctx) => void ctx.hit(ctx.state.stadium ? 70 : 50) } },
  // Tropius – Miracle Blow.
  'ex8-27': { 'Miracle Blow': miracle(0) },
  // Whiscash – Raging Tremble: 10 for each damage counter on it, to the Defending Pokémon either way (agreed).
  'ex8-28': {
    'Raging Tremble': {
      run(ctx) {
        ctx.flip();
        ctx.hit(ctx.attacker.damage);
      },
    },
  },
  // Xatu – Psyloop: 30 more for each Trainer card the opponent has in play (agreed: Tools, Technical Machines, their Stadium).
  'ex8-29': { Psyloop: { run: (ctx) => void ctx.hit(30 + 30 * trainersInPlay(ctx)) } },
  // Lunatone – Foresight: the top 5 cards of either deck, put back in any order; Target Beam: 10 more for each Solrock in play.
  'ex8-36': {
    Foresight: {
      choices: () => [{ kind: 'deck', options: ['own', 'opponent'], prompt: "Look at the top 5 cards of whose deck?" }],
      run(ctx) {
        const deckOwner = ctx.choices.deck === 'opponent' ? ctx.opp : ctx.me;
        if (deckOwner.deck.length) ctx.pend({ kind: 'arrangeTop', source: 'Foresight', count: Math.min(5, deckOwner.deck.length), deckOwner: deckOwner.id });
      },
    },
    'Target Beam': { run: (ctx) => void ctx.hit(20 + 10 * inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Solrock')).length) },
  },
  // Magcargo – Burning Ball: Burned with 2 or more Fire Energy attached.
  'ex8-37': {
    'Burning Ball': {
      run(ctx) {
        ctx.hit(50);
        if (energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'fire')).length >= 2) ctx.inflict('burned');
      },
    },
  },
  // Manectric – Magnetic Tackle: 10 more for each Lightning Energy, with 10 to itself, if the player likes.
  'ex8-38': {
    'Magnetic Tackle': {
      choices: () => [{ kind: 'boost', options: [true, false], prompt: 'Do 10 more damage for each Lightning Energy (Manectric does 10 damage to itself)?' }],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(40);
        ctx.hit(40 + 10 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'lightning')).length);
        ctx.selfDamage(10);
      },
    },
  },
  // Minun – Sniff Out: any card from the discard pile into the hand; Negative Spark: 20 to each of the opponent's Pokémon with a Poké-Body.
  'ex8-41': {
    'Sniff Out': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        if (ctx.me.discard.length) ctx.pend({ kind: 'discardToHand', source: 'Sniff Out', count: 1, filter: 'any' });
      },
    },
    'Negative Spark': spark(true),
  },
  // Plusle – Positive Spark: 20 to each of the opponent's Pokémon with a Poké-Power.
  'ex8-44': { 'Positive Spark': spark(false) },
  // Silcoon – Advanced Armor: next turn, attacks by the opponent's Evolved Pokémon don't affect it.
  'ex8-46': {
    'Advanced Armor': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).evolvedProof = ctx.turn + 1;
        ctx.log("Attacks by your opponent's Evolved Pokémon don't affect Silcoon next turn.");
      },
    },
  },
  // Solrock – Reflected Beam: 10 to one of the opponent's Benched Pokémon for each Lunatone in play.
  'ex8-47': {
    'Reflected Beam': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon"),
      run(ctx) {
        const n = inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Lunatone')).length;
        if (ctx.choices.benchSlot !== undefined && n) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 10 * n);
      },
    },
  },
  // Starmie – Energy Flip: 10 to one of the opponent's Benched Pokémon; an Energy card from it may move to another of theirs.
  'ex8-48': {
    'Energy Flip': {
      choices(s, c): ChoiceSpec[] {
        const bench = benchedSlots(s.opponentBench);
        if (!bench.length) return [];
        const picked = c.benchSlot !== undefined ? s.opponentBench[c.benchSlot] : null;
        const energy = picked?.energy.filter((e) => !e.provides) ?? [];
        const others = targetsIn(s.defender, s.opponentBench).filter((t) => t !== c.benchSlot);
        return [
          { kind: 'opponentBench', options: bench, prompt: "Choose one of your opponent's Benched Pokémon to do 10 damage to" },
          ...(energy.length && others.length ? [{ kind: 'pokemonEnergy' as const, options: energy, prompt: 'You may choose an Energy card attached to it to move' }] : []),
          ...(c.oppEnergyUid ? [{ kind: 'opponentPokemonTo' as const, options: others, prompt: "Choose another of your opponent's Pokémon to move it to" }] : []),
        ];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        const from = slot === undefined ? null : ctx.opp.bench[slot];
        if (slot === undefined || !from) return;
        ctx.damageBenched(ctx.opp, slot, 10);
        const card = from.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        const to = ctx.choices.oppTo === undefined ? null : at(ctx.opp, ctx.choices.oppTo);
        if (!card || !to || to === from || !ctx.canAffect(ctx.opp, from)) return;
        from.energy = from.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
      },
    },
  },
  // Swellow – Mid-air Crush: 20 to one of the opponent's Pokémon, then heads, its owner discards an Energy card from it.
  'ex8-49': {
    'Mid-air Crush': snipe(20, (ctx) => {
      const t = ctx.choices.oppTarget ?? 'active';
      const p = at(ctx.opp, t);
      if (ctx.flip() && p && p.energy.some((e) => !e.provides) && ctx.canAffect(ctx.opp, p)) ctx.opponentChooses({ kind: 'discardAttached', source: 'Mid-air Crush', target: t });
    }),
  },
  // Weezing – Liability: damage counters until the Defending Pokémon has 10 HP left, and 70 to itself; Smogscreen: Poisoned,
  // and its attacks next turn need heads.
  'ex8-51': {
    Liability: {
      run(ctx) {
        const left = ctx.defenderDef.hp - ctx.defender.damage;
        if (left > 10) putCounters(ctx, ctx.opp, ctx.defender, (left - 10) / 10);
        ctx.selfDamage(70);
      },
    },
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
  // Baltoy – Selfdestruct: 10 to each Benched Pokémon (both players'), 50 to itself.
  'ex8-53': {
    Selfdestruct: {
      run(ctx) {
        ctx.hit(40);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
        ctx.selfDamage(50);
      },
    },
  },
  // Beldum – Flip Over: 10 to itself.
  'ex8-55': {
    'Flip Over': {
      run(ctx) {
        ctx.hit(30);
        ctx.selfDamage(10);
      },
    },
  },
  // Electrike – High Voltage: heads, the opponent can't play Trainer cards next turn; Recharge: a Lightning Energy card from the deck to it.
  'ex8-59': {
    'High Voltage': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('High Voltage did nothing.');
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer cards next turn.", ctx.opp.id);
      },
    },
  },
  'ex8-60': { Recharge: chargeUp('Recharge', 'lightning', 1) },
  // Makuhita – Thrust: tails nothing; heads 10 and an Energy card of the Defending Pokémon's (the player's pick) discarded.
  'ex8-65': {
    Thrust: {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Thrust did nothing.');
        ctx.hit(10);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Taillow – Fly: as Southern Islands'.
  'ex8-80': { Fly: fly(10) },
  // Wurmple – Ascension; Miracle Essence: heads, the Special Condition the player picks (the Active Pokémon only, agreed).
  'ex8-82': { Ascension: ascension, 'Miracle Essence': miracle(0) },
  // Crobat ex – Cross Attack: 4 flips, 20 for each heads; Confused with 2 or more.
  'ex8-96': {
    'Cross Attack': {
      run(ctx) {
        const heads = ctx.flips(4);
        ctx.hit(20 * heads);
        if (heads >= 2) ctx.inflict('confused');
      },
    },
  },
  // Deoxys ex – Energy Burst: 10 more for each Energy on it and the Defending Pokémon; Psychic Burst: 2 Energy cards may be
  // discarded for 20 more for each Energy on the Defending Pokémon; Psychic Shield: attacks by the opponent's Pokémon-ex don't affect it next turn.
  'ex8-97': { 'Energy Burst': { run: (ctx) => void ctx.hit(10 + 10 * (energyAmount(ctx, ctx.attacker) + energyAmount(ctx, ctx.defender))) } },
  'ex8-98': {
    'Psychic Burst': {
      choices(s): ChoiceSpec[] {
        const own = s.attacker.energy.filter((e) => !e.provides);
        return own.length >= 2 ? [{ kind: 'ownEnergyUpTo', max: 2, options: own, prompt: 'You may choose 2 Energy cards to discard (20 more damage for each Energy on the Defending Pokémon)' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        if (gone.length !== 2) return void ctx.hit(50);
        discardOwn(ctx, gone);
        ctx.hit(50 + 20 * energyAmount(ctx, ctx.defender));
      },
    },
  },
  'ex8-99': {
    'Psychic Shield': {
      run(ctx) {
        ctx.hit(50);
        (ctx.attacker.effects ??= {}).exProof = ctx.turn + 1;
        ctx.log("Attacks by your opponent's Pokémon-ex don't affect Deoxys ex next turn.");
      },
    },
  },
  // Hariyama ex – Pivot Throw: next turn, attacks do 10 more to it.
  'ex8-100': {
    'Pivot Throw': {
      run(ctx) {
        ctx.hit(80);
        (ctx.attacker.effects ??= {}).pivot = ctx.turn + 1;
        ctx.log(`Attacks do 10 more damage to ${ctx.attackerDef.name} next turn.`);
      },
    },
  },
  // Manectric ex – Disconnect: the opponent can't play Trainer cards but Supporters next turn; Mega Shot: every Lightning
  // Energy card discarded, then 80 to one of the opponent's Pokémon.
  'ex8-101': {
    Disconnect: {
      run(ctx) {
        ctx.hit(40);
        ctx.opp.noItemsUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer cards but Supporters next turn.", ctx.opp.id);
      },
    },
    'Mega Shot': {
      ...snipe(80),
      run(ctx) {
        discardOwn(ctx, typeCards(ctx.state.cards, ctx.attacker, 'lightning'));
        snipe(80).run(ctx);
      },
    },
  },
  // Rayquaza ex – Spiral Blast: 20 for each basic Energy card attached.
  'ex8-102': { 'Spiral Blast': { run: (ctx) => void ctx.hit(20 * ctx.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId))).length) } },
  // Salamence ex – Bright Flame: 2 Energy cards discarded.
  'ex8-103': { 'Bright Flame': { discard: { count: 2 }, run: (ctx) => void ctx.hit(120) } },
  // Sharpedo ex – Drag Off; Darkness Blast: a Darkness Energy card may be discarded for 20 more and one of the Defending Pokémon's discarded.
  'ex8-104': {
    'Drag Off': dragOff(20),
    'Darkness Blast': {
      choices(s): ChoiceSpec[] {
        const dark = s.attacker.energy.filter((e) => energyCardOf(s.cards, e, 'darkness'));
        const theirs = s.defender.energy.filter((e) => !e.provides);
        return dark.length
          ? [
              { kind: 'ownEnergyUpTo', max: 1, options: dark, prompt: 'You may choose a Darkness Energy card to discard (20 more damage, and an Energy card discarded from the Defending Pokémon)' },
              ...(theirs.length ? [{ kind: 'defenderEnergy' as const, options: theirs, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if you discard one)' }] : []),
            ]
          : [];
      },
      run(ctx) {
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!card) return void ctx.hit(60);
        discardOwn(ctx, [card]);
        ctx.hit(80);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Latias ☆ – Shooting Star (against a Pokémon-ex); Latios ☆ – Shining Star (against a Stage 2 Pokémon), Miraculous Light.
  'ex8-105': { 'Shooting Star': star((ctx) => !!ctx.defenderDef.ex) },
  'ex8-106': {
    'Shining Star': star((ctx) => ctx.defenderDef.stage === 'stage2'),
    'Miraculous Light': {
      run(ctx) {
        ctx.hit(10);
        Object.assign(ctx.attacker, { condition: null, poison: 0, burned: false });
        delete ctx.attacker.paralyzedTurn;
        healUpTo(ctx, ctx.me, ctx.attacker, 10);
      },
    },
  },
  // Rayquaza ☆ – Holy Star: every Energy card discarded, then 100 to each of the opponent's Pokémon-ex.
  'ex8-107': {
    'Holy Star': {
      run(ctx) {
        discardOwn(ctx, ctx.attacker.energy.filter((e) => !e.provides));
        if (ctx.defenderDef.ex) ctx.hit(100);
        ctx.opp.bench.forEach((p, i) => p && inPlayDef(ctx.state.cards, p).ex && ctx.damageBenched(ctx.opp, i, 100));
      },
    },
  },
};
