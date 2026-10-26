// EX Team Rocket Returns (ex7) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts)
// don't play, and Rocket's Tricky Gym's Feint Attack. Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: "each Defending Pokémon" is the opponent's Active Pokémon only (Double Wing Attack, Double Tackle,
// Black Suction Cups, Sheer Cold; only "all Defending Pokémon" reaches the Bench); Explosive Evolution evolves Dark Pupitar
// only on heads (as Neo Destiny's), with the usual limits; Detour uses the Supporter card in play as Supernatural does, its
// questions asked during the attack; Dark Seed's damage counters happen only to the Pokémon still Active then; Volcanic Ash
// counts the Energy cards discarded; Raging Thunder may damage Rocket's Zapdos ex itself, never with Weakness or Resistance;
// Feint Attack keeps the attacker's own boosts (Darkness Energy, R Energy).
// From the text: Brick Smash keeps Weakness; Dark Link and Rainbow Moves copy an attack with its other requirements (as
// Mini-Metronome), Dark Link only on heads; Quick Change and Dump and Draw ask how many cards first; Darkness Switch does
// nothing if its effect is prevented.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { hasType, isBasicEnergy, lookupCard } from '../cards.js';
import { canPayCost, isEnergyCardOf, retreatCost, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { clearSpecialConditions, effectId, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { handTrainerFits } from '../trainers.js';
import { attackEffect } from './index.js';
import { benchedSlots, energyCanMove, headsUntilTails, opponentBenchChoice, same } from './common.js';
import { copyAttack } from './ecard2.js';
import { ATTACK_TEMPLATES, type TemplateArg } from './ex-templates.js';
import { discardAtRandom } from './ex1.js';
import { discardOwn, energyCardOf, inPlay, putCounters, typeCards } from './ex2.js';
import { ascension, EX5 } from './ex5.js';
import { hyperPump, lookForFriends, lureIn, mayDiscardAny, notNextTurn, restNext, snipe } from './ex6.js';
import { discardFromAttacker } from './gym1.js';
import { healDefender, healUpTo } from './si1.js';

/** A shared wording's effect (ex-templates.ts), for an attack TCGdex's text keeps it from matching. */
const template = (name: string, damage: number, args: TemplateArg[], attack: string): AttackEffect => ATTACK_TEMPLATES[name]!.make(damage, args, attack);


/**
 * The attacks Dark Link (the player's other Pokémon with Dark in their names), Rainbow Moves (the opponent's Benched
 * Pokémon), Mimicry and Delta Copy (the opponent's Pokémon in play, `defender` too) can copy.
 */
type CopySides = { own: (InPlayPokemon | null)[]; opp: (InPlayPokemon | null)[]; defender: InPlayPokemon | null };
const copyOptions = (cards: AttackSituation['cards'], name: string, pokemon: (InPlayPokemon | null)[]) =>
  pokemon.flatMap((p) => (p && !p.faceDown ? inPlayDef(cards, p).attacks.filter((a) => a.name !== name).map((attack) => ({ p, attack })) : []));

/**
 * Copies an attack of one of `among`'s Pokémon (Dark Link, Rainbow Moves): the attack (with its Pokémon's name) is asked
 * first, then its Energy discard and its own questions; `flip`: heads first; `needsEnergy`: nothing happens unless the
 * attacker has the Energy for it (Mimicry).
 */
export const copyAmong = (name: string, flip: boolean, among: (sides: CopySides, cards: AttackSituation['cards']) => (InPlayPokemon | null)[], needsEnergy = false): AttackEffect => ({
  choices(s, c) {
    const list = copyOptions(s.cards, name, among({ own: s.ownBench, opp: s.opponentBench, defender: s.defender }, s.cards));
    if (!list.length) return [];
    const specs: ChoiceSpec[] = [{ kind: 'amount', options: list.map((_, i) => i), labels: list.map((o) => `${inPlayDef(s.cards, o.p).name}: ${o.attack.name}`), prompt: `${name}: choose an attack to copy` }];
    const picked = c.amount !== undefined ? list[c.amount] : undefined;
    const effect = picked && attackEffect(effectId(picked.p), picked.attack.name);
    const discard = effect?.discard;
    if (discard && discard.count !== 'all') {
      const own = s.attacker.energy.filter((e) => !discard.type || isEnergyCardOf(e, s.cards, discard.type));
      specs.push({ kind: 'ownEnergy', count: discard.count, options: own, prompt: `Choose ${discard.count} Energy to discard for ${picked!.attack.name}` });
    }
    if (effect?.choices) specs.push(...effect.choices(s, c));
    return specs;
  },
  run(ctx) {
    const list = copyOptions(ctx.state.cards, name, among({ own: ctx.me.bench, opp: ctx.opp.bench, defender: ctx.opp.active }, ctx.state.cards));
    const picked = ctx.choices.amount !== undefined ? list[ctx.choices.amount] : undefined;
    if (!picked) return ctx.log(`${name} had nothing to copy.`);
    if (flip && !ctx.flip()) return ctx.log(`${name} did nothing.`);
    if (needsEnergy && !canPayCost(ctx.attacker, picked.attack, ctx.state.cards)) return ctx.log(`${name} did nothing: ${ctx.attackerDef.name} doesn't have the Energy for ${picked.attack.name}.`);
    const source = effectId(picked.p);
    const discard = attackEffect(source, picked.attack.name)?.discard;
    if (discard) {
      const uids = new Set(discard.count === 'all' ? ctx.attacker.energy.map((e) => e.uid) : (ctx.choices.energyUids ?? []));
      const gone = ctx.attacker.energy.filter((e) => uids.has(e.uid));
      if (discard.count !== 'all' && gone.length < discard.count) return ctx.log(`${name} did nothing: not enough Energy to discard.`);
      discardFromAttacker(ctx, gone);
    }
    ctx.log(`${name} copies ${picked.attack.name}.`);
    ctx.useAttack(picked.attack, source);
  },
});

/** Moves `card` from the Defending Pokémon to the opponent's Benched Pokémon in `slot` (Aqua Trick, Magnetic Lines). */
function moveDefenderEnergy(ctx: AttackContext, uid: string | undefined, slot: number | undefined) {
  const card = ctx.defender.energy.find((e) => e.uid === uid);
  const to = slot === undefined ? null : ctx.opp.bench[slot];
  if (!card || !to) return;
  ctx.affectDefender(() => {
    if (!energyCanMove(ctx, ctx.defender)) return;
    ctx.defender.energy = ctx.defender.energy.filter((e) => e !== card);
    to.energy.push(card);
    ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${ctx.defenderDef.name} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
  });
}

/** "Move 1 Energy card (a basic one, with `basic`) attached to the Defending Pokémon to 1 of your opponent's Benched Pokémon"; `flip`: on heads only. */
export const shiftDefenderEnergy = (damage: number, basic: boolean, flip = false): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const bench = benchedSlots(s.opponentBench);
    const energy = s.defender.energy.filter((e) => !e.provides && (!basic || isBasicEnergy(lookupCard(s.cards, e.defId))));
    if (!bench.length || !energy.length) return [];
    return [
      { kind: 'defenderEnergy', options: energy, prompt: 'Choose an Energy card attached to the Defending Pokémon to move' },
      { kind: 'opponentBench', options: bench, prompt: "Choose one of your opponent's Benched Pokémon to move it to" },
    ];
  },
  run(ctx) {
    ctx.hit(damage);
    if (flip && !ctx.flip()) return;
    if (ctx.opp.active) moveDefenderEnergy(ctx, ctx.choices.defenderEnergyUid, ctx.choices.benchSlot);
  },
});

/** Rotating Claws: an Energy card may be discarded; then another Energy card from the discard pile to it. */
export const rotatingClaws = (damage: number) =>
  mayDiscardAny(damage, (ctx) => {
    const gone = ctx.me.discard[ctx.me.discard.length - 1];
    if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
    if (ctx.me.discard.some((c) => c !== gone && lookupCard(ctx.state.cards, c.defId).kind === 'energy')) {
      ctx.pend({ kind: 'attachFromDiscard', source: 'Rotating Claws', count: 1, target: 'active', anyEnergy: true, excludeUid: gone?.uid });
    }
  });

/** "Choose 1 of your opponent's Pokémon. This attack does `per` damage for each Colorless Energy in its Retreat Cost." */
const retreatOf = (ctx: AttackContext, p: InPlayPokemon) => retreatCost(p, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card ?? null);

/** "Search your discard pile for a `type` Energy card and attach it to …" (Freeze Solid, Plasma). */
const recoverOnto = (damage: number, type: string, attack: string): AttackEffect => template('attachFromDiscard', damage, [type], attack);

/** Spring Back: `more` and `affliction` if the opponent has only 1 Prize card left. */
const springBack = (affliction: 'asleep' | 'confused' | 'poisoned'): AttackEffect => ({
  run(ctx) {
    if (ctx.opp.prizes.length !== 1) return void ctx.hit(20);
    ctx.hit(70);
    ctx.inflict(affliction);
  },
});

/** Miracle Powder with no damage (Hoppip). */
const miraclePowder = (damage: number): AttackEffect => ({
  choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon (on heads)' }],
  run(ctx) {
    if (damage) ctx.hit(damage);
    if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
  },
});

/** The Pokémon Tool and Rocket's Secret Machine cards in the discard pile (Dark Aid). */
const toolsOrSecrets = (pile: CardInstance[]) => pile.filter((c) => handTrainerFits(c, 'toolOrSecret'));

export const EX7: Record<string, Record<string, AttackEffect>> = {
  // Dark Ampharos – Shock Bolt: every Lightning Energy card discarded.
  'ex7-2': {
    'Shock Bolt': {
      run(ctx) {
        ctx.hit(70);
        discardOwn(ctx, typeCards(ctx.state.cards, ctx.attacker, 'lightning'));
      },
    },
  },
  // Dark Crobat – Dark Drain: 10 to each of the opponent's Pokémon, then as many damage counters off Dark Crobat; Skill Dive: 30 to one of them.
  'ex7-3': {
    'Dark Drain': {
      run(ctx) {
        const count = inPlay(ctx.opp).length;
        ctx.hit(10);
        ctx.benchDamage(ctx.opp, 10);
        healUpTo(ctx, ctx.me, ctx.attacker, 10 * count);
      },
    },
    'Skill Dive': snipe(30),
  },
  // Dark Electrode – Energy Bomb: its Energy cards may move to the player's Benched Pokémon, each where they like.
  'ex7-4': {
    'Energy Bomb': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.length && benchedSlots(s.ownBench).length ? [{ kind: 'boost', options: [true, false], prompt: 'Move all Energy cards attached to Dark Electrode to your Benched Pokémon?' }] : []),
      run(ctx) {
        ctx.hit(30);
        if (!ctx.choices.boost || !ctx.attacker.energy.length) return;
        const cards = ctx.attacker.energy;
        ctx.attacker.energy = [];
        ctx.pend({ kind: 'distributeEnergy', source: 'Energy Bomb', cards });
      },
    },
  },
  // Dark Houndoom – Shakedown: a card from the opponent's hand at random discarded; Dark Fire: a Fire or Darkness Energy card may be discarded for 20 more.
  'ex7-5': {
    Shakedown: {
      run(ctx) {
        ctx.hit(20);
        discardAtRandom(ctx);
      },
    },
    'Dark Fire': {
      choices(s): ChoiceSpec[] {
        const options = s.attacker.energy.filter((e) => energyCardOf(s.cards, e, 'fire') || energyCardOf(s.cards, e, 'darkness'));
        return options.length ? [{ kind: 'ownEnergyUpTo', max: 1, options, prompt: 'You may choose a Fire or Darkness Energy card to discard (20 more damage)' }] : [];
      },
      run(ctx) {
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (card) discardOwn(ctx, [card]);
        ctx.hit(card ? 60 : 40);
      },
    },
  },
  // Dark Hypno – Dark Link: heads, an attack of another of the player's Pokémon with Dark in its name.
  'ex7-6': { 'Dark Link': copyAmong('Dark Link', true, (sides, cards) => sides.own.filter((p) => p && /\bDark\b/.test(inPlayDef(cards, p).name))) },
  // Dark Marowak – Brick Smash: only Weakness changes its damage; Hard Bone: a Basic Pokémon or Evolution card from the hand discarded, or nothing.
  'ex7-7': {
    'Brick Smash': { run: (ctx) => void ctx.hit(30, { swift: true, keepWeakness: true }) },
    'Hard Bone': {
      run(ctx) {
        if (!ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'pokemon')) return ctx.log('Hard Bone did nothing: no Basic Pokémon or Evolution card in the hand.');
        ctx.hit(70);
        ctx.pend({ kind: 'discardFromHand', source: 'Hard Bone', count: 1, only: 'pokemon' });
      },
    },
  },
  // Dark Octillery – Black Suction Cups: 10 to the Defending Pokémon, heads Paralyzed (agreed: the Active Pokémon only).
  'ex7-8': {
    'Black Suction Cups': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Dark Slowking – Litter: up to 2 Pokémon Tool and Rocket's Secret Machine cards from the hand discarded, 30 more each.
  'ex7-9': {
    Litter: {
      choices: () => [{ kind: 'amount', options: [0, 1, 2], prompt: "How many Pokémon Tool and Rocket's Secret Machine cards to discard from your hand (30 more damage each)?" }],
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, ctx.me.hand.filter((c) => handTrainerFits(c, 'toolOrSecret')).length);
        ctx.hit(20 + 30 * n);
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Litter', count: n, only: 'toolOrSecret' });
      },
    },
  },
  // Kingdra – Hyper Whirlpool: flips until tails; an Energy card of the Defending Pokémon's (the player's pick) discarded for each heads.
  'ex7-12': {
    'Hyper Whirlpool': {
      run(ctx) {
        ctx.hit(20);
        const heads = headsUntilTails(ctx);
        const n = Math.min(heads, ctx.defender.energy.filter((e) => !e.provides).length);
        if (n && ctx.canAffect(ctx.opp, ctx.defender)) ctx.pend({ kind: 'removeEach', source: 'Hyper Whirlpool', targets: Array<Target>(n).fill('active') });
      },
    },
  },
  // Piloswine – Sheer Cold: heads, the Defending Pokémon can't attack next turn; Tonnage: 40 more with 30 to itself, if the player likes.
  'ex7-13': {
    'Sheer Cold': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
        });
      },
    },
    Tonnage: {
      choices: () => [{ kind: 'boost', options: [true, false], prompt: 'Do 100 damage instead of 60 (Piloswine does 30 damage to itself)?' }],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 100 : 60);
        if (ctx.choices.boost) ctx.selfDamage(30);
      },
    },
  },
  // Togetic – Rainbow Moves: an attack of one of the opponent's Benched Pokémon.
  'ex7-14': { 'Rainbow Moves': copyAmong('Rainbow Moves', false, (sides) => sides.opp) },
  // Dark Muk – Slimy Water: 10 for each Colorless Energy in the Defending Pokémon's Retreat Cost.
  'ex7-16': { 'Slimy Water': { run: (ctx) => void ctx.hit(10 * retreatOf(ctx, ctx.defender)) } },
  // Dark Raticate – Dark Seed: the Defending Pokémon can't retreat, and 5 damage counters on it at the end of the opponent's
  // next turn; Spread Poison: Poisoned, and 20 to one of the opponent's Benched Pokémon.
  'ex7-17': {
    'Dark Seed': {
      run(ctx) {
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          e.delayed = { counters: 5, turn: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn, and will have 5 damage counters put on it at its end.`, ctx.opp.id);
        });
      },
    },
    'Spread Poison': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options, prompt: "Choose one of your opponent's Benched Pokémon to do 20 damage to" }] : [];
      },
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('poisoned');
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
      },
    },
  },
  // Delibird – Souvenir: 3 flips; 1 heads 4 damage counters, 2 heads a damage counter off, 3 heads 10 damage counters, none all off.
  'ex7-21': {
    Souvenir: {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads === 1) putCounters(ctx, ctx.opp, ctx.defender, 4);
        else if (heads === 2) healDefender(ctx, 10);
        else if (heads === 3) putCounters(ctx, ctx.opp, ctx.defender, 10);
        else healDefender(ctx, 'all');
      },
    },
  },
  // Furret – Quick Change: up to 3 cards from the hand on top of the deck, then as many cards from the deck into the hand;
  // Quick Tail Smash: the player may flip first, heads 80 instead, tails nothing.
  'ex7-22': {
    'Quick Change': {
      choices: () => [{ kind: 'amount', options: [0, 1, 2, 3], prompt: 'How many cards from your hand to put on top of your deck (then search your deck for as many)?' }],
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, ctx.me.hand.length);
        if (!n) return ctx.log('Quick Change did nothing.');
        ctx.pend({ kind: 'handToDeck', source: 'Quick Change' });
        const more = Array.from({ length: n - 1 }, () => ({ player: ctx.me.id, source: 'Quick Change', kind: 'handToDeck' as const }));
        (ctx.state.queuedChoices ??= []).push(...more, { player: ctx.me.id, source: 'Quick Change', kind: 'pickFromDeck', filter: 'any', count: n });
      },
    },
    'Quick Tail Smash': {
      choices: () => [{ kind: 'boost', options: [true, false], prompt: 'Flip a coin first (heads: 80 damage instead; tails: nothing)?' }],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(30);
        if (ctx.flip()) ctx.hit(80);
        else ctx.log('Quick Tail Smash did nothing.');
      },
    },
  },
  // Magby – Detour: the effect of the player's Supporter card in play (as Supernatural).
  'ex7-24': {
    Detour: {
      text: 'If you have a Supporter card in play, use the effect on that card as the effect of this attack.',
      run(ctx) {
        if (ctx.me.supporterTurn !== ctx.turn || !ctx.me.supporterUid) return ctx.log('Detour did nothing: you have no Supporter card in play.');
        ctx.pend({ kind: 'supernatural', source: 'Detour', own: true });
      },
    },
  },
  // Quagsire – Hyper Pump: 20 more for each basic Energy card beyond the cost, at most 60 more.
  'ex7-26': { 'Hyper Pump': hyperPump(20, 20, 60, 1) },
  // Yanma – Quick Charge: up to 4 basic Energy cards of different types from the deck, shown.
  'ex7-28': {
    'Quick Charge': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Quick Charge', filter: 'basicEnergy', reveal: true, optional: true, count: 4, distinct: 'type' })) },
  },
  // Dark Arbok – Swallow Up: 30 more if the Defending Pokémon has less HP left than Dark Arbok.
  'ex7-29': {
    'Swallow Up': { run: (ctx) => void ctx.hit(ctx.defenderDef.hp - ctx.defender.damage < ctx.attackerDef.hp - ctx.attacker.damage ? 40 : 10) },
  },
  // Dark Ariados – Breaking Impact: 20 to one of the opponent's Pokémon for each Colorless Energy in its Retreat Cost.
  'ex7-30': {
    'Breaking Impact': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon (20 damage for each Energy in its Retreat Cost)" }],
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        if (!p) return;
        const damage = 20 * retreatOf(ctx, p);
        if (t === 'active') ctx.hit(damage);
        else ctx.damageBenched(ctx.opp, t, damage);
      },
    },
  },
  // Dark Flaaffy – Thunder Slash: a Basic Defending Pokémon is Paralyzed; not again next turn.
  'ex7-33': {
    'Thunder Slash': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.defenderDef.stage === 'basic') ctx.inflict('paralyzed');
        notNextTurn(ctx, 'Thunder Slash');
      },
    },
  },
  // Dark Golbat – Night Ambush: 30 to one of the opponent's Pokémon; it can't attack next turn.
  'ex7-34': { 'Night Ambush': snipe(30, restNext) },
  // Dark Golduck – Darkness Shield: heads, nothing the opponent's attacks do affects it next turn; Cold Crush: an Energy card
  // may be discarded, then one of the Defending Pokémon's (the player's pick) discarded.
  'ex7-35': {
    'Darkness Shield': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.protect('preventAll');
      },
    },
    'Cold Crush': {
      choices(s): ChoiceSpec[] {
        const own = s.attacker.energy.filter((e) => !e.provides);
        const theirs = s.defender.energy.filter((e) => !e.provides);
        return own.length && theirs.length
          ? [
              { kind: 'ownEnergyUpTo', max: 1, options: own, prompt: 'You may choose an Energy card to discard (then one attached to the Defending Pokémon is discarded)' },
              { kind: 'defenderEnergy', options: theirs, prompt: 'Choose an Energy card attached to the Defending Pokémon to discard (if you discard one)' },
            ]
          : [];
      },
      run(ctx) {
        ctx.hit(40);
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!card) return;
        discardOwn(ctx, [card]);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Dark Houndoom – Fire Payback: 20 more with fewer Benched Pokémon than the opponent.
  'ex7-37': { 'Fire Payback': { run: (ctx) => void ctx.hit(benchedSlots(ctx.me.bench).length < benchedSlots(ctx.opp.bench).length ? 60 : 40) } },
  // Dark Magcargo – Energy Press: 10 more for each basic Energy card attached to the player's Active Pokémon.
  'ex7-38': { 'Energy Press': { run: (ctx) => void ctx.hit(10 + 10 * ctx.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId))).length) } },
  // Dark Magneton – Magnetic Lines: a basic Energy card moves from the Defending Pokémon to another of the opponent's Pokémon.
  'ex7-39': { 'Magnetic Lines': shiftDefenderEnergy(20, true) },
  // Dark Pupitar – Explosive Evolution: heads, 10 to each of the opponent's Pokémon (no Weakness or Resistance), then a Dark
  // Tyranitar from the deck on it (agreed: only on heads, with the usual limits).
  'ex7-40': {
    'Explosive Evolution': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Explosive Evolution did nothing.');
        ctx.hit(10, { weakness: false });
        ctx.benchDamage(ctx.opp, 10);
        ascension.run(ctx);
      },
    },
  },
  // Dark Weezing – Darkness Charge: 2 damage counters on Dark Weezing.
  'ex7-42': {
    'Darkness Charge': {
      run(ctx) {
        ctx.hit(50);
        ctx.attacker.damage += 20;
        ctx.log(`Put 2 damage counters on ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Heracross – Get Even: 10 more for each Prize card the player has left beyond the opponent's.
  'ex7-43': { 'Get Even': { run: (ctx) => void ctx.hit(20 + 10 * Math.max(0, ctx.me.prizes.length - ctx.opp.prizes.length)) } },
  // Magmar – Dump and Draw: up to 2 Energy cards from the hand discarded, then 2 cards drawn for each.
  'ex7-44': {
    'Dump and Draw': {
      choices: () => [{ kind: 'amount', options: [0, 1, 2], prompt: 'How many Energy cards to discard from your hand (2 cards drawn for each)?' }],
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, ctx.me.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length);
        if (!n) return ctx.log('Dump and Draw did nothing.');
        ctx.pend({ kind: 'discardFromHand', source: 'Dump and Draw', count: n, energyOnly: true });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Dump and Draw', kind: 'drawCount', max: 2 * n, allOrNone: true });
      },
    },
  },
  // Rocket's Meowth – Snatch and Run: a Pokémon Tool or Rocket's Secret Machine card from the deck, shown; if one is found, it
  // may switch with a Benched Pokémon; Miraculous Comeback: a flip for each Pokémon in play, 10 for each heads, 10 to itself for each tails.
  'ex7-46': {
    'Snatch and Run': {
      run(ctx) {
        const found = ctx.me.deck.some((c) => handTrainerFits(c, 'toolOrSecret'));
        if (!ctx.me.deck.length) return;
        ctx.pend({ kind: 'pickFromDeck', source: 'Snatch and Run', filter: 'toolOrSecret', reveal: true });
        if (found && benchedSlots(ctx.me.bench).length) (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Snatch and Run', kind: 'switchIn', optional: true });
      },
    },
    'Miraculous Comeback': {
      run(ctx) {
        const n = inPlay(ctx.me).length + inPlay(ctx.opp).length;
        const heads = ctx.flips(n);
        ctx.hit(10 * heads);
        if (n - heads) ctx.selfDamage(10 * (n - heads));
      },
    },
  },
  // Rocket's Wobbuffet – Dark Aid: from the discard pile, a Pokémon Tool or Rocket's Secret Machine card into the hand, shown, or 3 of them shuffled into the deck.
  'ex7-47': {
    'Dark Aid': {
      choices(s, c): ChoiceSpec[] {
        const cards = toolsOrSecrets(s.ownDiscard);
        if (!cards.length) return [];
        const modes = cards.length >= 3 ? [0, 1] : [0];
        return [
          { kind: 'amount', options: modes, labels: ['Put 1 into your hand', 'Shuffle 3 into your deck'], prompt: 'Dark Aid: put a card into your hand, or shuffle 3 into your deck?' },
          ...(c.amount !== undefined ? [{ kind: 'ownDiscard' as const, min: c.amount ? 3 : 1, max: c.amount ? 3 : 1, options: cards, prompt: `Choose ${c.amount ? 3 : 1} Pokémon Tool or Rocket's Secret Machine card${c.amount ? 's' : ''}` }] : []),
        ];
      },
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        const picked = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid) && handTrainerFits(c, 'toolOrSecret'));
        if (!picked.length) return ctx.log('Dark Aid did nothing.');
        ctx.me.discard = ctx.me.discard.filter((c) => !picked.includes(c));
        const names = picked.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ');
        if (ctx.choices.amount) {
          ctx.me.deck.push(...picked);
          shuffleOwnDeck(ctx);
          ctx.log(`Shuffled ${names} into the deck.`);
        } else {
          ctx.me.hand.push(...picked);
          ctx.log(`Put ${names} into the hand.`);
        }
      },
    },
  },
  // Seadra – Aqua Trick: an Energy card moves from the Defending Pokémon to one of the opponent's Benched Pokémon.
  'ex7-48': { 'Aqua Trick': shiftDefenderEnergy(30, false) },
  // Skiploom, Hoppip – Miracle Powder.
  'ex7-49': { 'Miracle Powder': same(() => EX5['ex5-16']?.['Miracle Powder']) },
  'ex7-57': { 'Miracle Powder': miraclePowder(0) },
  // Togepi – Mini-Metronome: heads, one of the Defending Pokémon's attacks.
  'ex7-50': { 'Mini-Metronome': copyAttack('Mini-Metronome', { needsEnergy: false, flip: true }) },
  // Cubone – Look for Friends.
  'ex7-51': { 'Look for Friends': { run: lookForFriends } },
  // Grimer – Taunt: one of the opponent's Benched Pokémon switched in.
  'ex7-56': { Taunt: lureIn("Choose one of your opponent's Benched Pokémon to switch in") },
  // Horsea – Water Plant: up to 2 Water Energy cards from the discard pile into the hand, shown.
  'ex7-58': {
    'Water Plant': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'discardToHand', source: 'Water Plant', count: 2, filter: 'waterEnergy', reveal: true });
      },
    },
  },
  // Ledyba – Call for Family: a Grass Basic Pokémon from the deck onto the Bench.
  'ex7-64': {
    'Call for Family': {
      blocked: (s) => (openBenchSlot({ bench: s.ownBench, benchLimit: s.ownBenchLimit }, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicType', type: 'grass', toBench: true, optional: true })),
    },
  },
  // Mareep, Marill – Minor Errand-Running: up to 1 (2) basic Energy cards from the deck, shown.
  'ex7-67': { 'Minor Errand-Running': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Minor Errand-Running', filter: 'basicEnergy', reveal: true, optional: true })) } },
  'ex7-68': { 'Minor Errand-Running': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Minor Errand-Running', filter: 'basicEnergy', reveal: true, optional: true, count: 2 })) } },
  // Onix – Granite Head: 10 less attack damage to it next turn.
  'ex7-69': {
    'Granite Head': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 10, until: ctx.turn + 1 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks next turn is reduced by 10.`);
      },
    },
  },
  // Psyduck – Headache: heads, the opponent can't play Trainer cards from their hand next turn.
  'ex7-70': {
    Headache: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Headache did nothing.');
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer cards next turn.", ctx.opp.id);
      },
    },
  },
  // Remoraid – Energy Draw: heads, a basic Energy card from the deck to it.
  'ex7-73': {
    'Energy Draw': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Energy Draw did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Energy Draw', filter: 'basicEnergy', attachToActive: true, optional: true });
      },
    },
  },
  // Sentret – Friend Search: a Basic Pokémon or Evolution card from the top 5 cards, shown; the deck shuffled after.
  'ex7-75': {
    'Friend Search': {
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromTop', source: 'Friend Search', looked: ctx.me.deck.slice(0, 5).map((c) => c.uid), take: 1, master: true })),
    },
  },
  // Swinub – Rest: every Special Condition and damage counter off it, then Asleep.
  'ex7-79': {
    Rest: {
      run(ctx) {
        clearSpecialConditions(ctx.attacker);
        ctx.heal('all');
        ctx.sleepSelf();
      },
    },
  },
  // Voltorb – Psycho Waves: an Energy card discarded from it, then Confused.
  'ex7-80': { 'Psycho Waves': { discard: { count: 1 }, run: (ctx) => ctx.inflict('confused') } },
  // Rocket's Tricky Gym – Feint Attack: 20 to one of the opponent's Pokémon that nothing on it changes (agreed: the attacker's boosts still add).
  'ex7-90': { 'Feint Attack': template('feintAttack', 0, [20], 'Feint Attack') },
  // Rocket's Articuno ex – Freeze Solid: a Water Energy card from the discard pile to it.
  'ex7-96': { 'Freeze Solid': recoverOnto(10, 'water', 'Freeze Solid') },
  // Rocket's Entei ex – Volcanic Ash: 2 Energy cards discarded (agreed: cards), then 60 to one of the opponent's Pokémon.
  'ex7-97': { 'Volcanic Ash': { ...snipe(60), discard: { count: 2 } } },
  // Rocket's Mewtwo ex – Darkness Switch: an Energy card discarded, then its damage counters and the Defending Pokémon's swapped.
  'ex7-99': {
    'Darkness Switch': {
      discard: { count: 1 },
      run(ctx) {
        ctx.affectDefender(() => {
          const mine = ctx.attacker.damage;
          ctx.attacker.damage = ctx.defender.damage;
          ctx.defender.damage = mine;
          ctx.log(`Switched the damage counters on ${ctx.attackerDef.name} and ${ctx.defenderDef.name}.`);
        });
      },
    },
  },
  // Rocket's Moltres ex – Fire Dance: a Fire Energy card from the discard pile to one of the player's Pokémon.
  'ex7-100': {
    'Fire Dance': {
      run(ctx) {
        ctx.hit(30);
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        if (ctx.me.discard.some((c) => isEnergyCardOf(c, ctx.state.cards, 'fire') && isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromDiscard', source: 'Fire Dance', count: 1, type: 'fire' });
      },
    },
  },
  // Rocket's Scizor ex – Rotating Claws: an Energy card may be discarded; then another Energy card from the discard pile to it.
  'ex7-101': { 'Rotating Claws': rotatingClaws(50) },
  // Rocket's Scyther ex – Slashing Strike: not again next turn.
  'ex7-102': {
    'Slashing Strike': {
      run(ctx) {
        ctx.hit(40);
        notNextTurn(ctx, 'Slashing Strike');
      },
    },
  },
  // Rocket's Sneasel ex – Drag Off: one of the opponent's Benched Pokémon may be switched in first, then 10 to the Defending
  // Pokémon; Dark Ring: 10 more for each of the player's Darkness Pokémon in play.
  'ex7-103': {
    'Drag Off': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
        ctx.hit(10);
      },
    },
    'Dark Ring': { run: (ctx) => void ctx.hit(30 + 10 * inPlay(ctx.me).filter((p) => hasType(inPlayDef(ctx.state.cards, p), 'darkness')).length) },
  },
  // Rocket's Zapdos ex – Plasma: a Lightning Energy card from the discard pile to it; Raging Thunder: 30 to one of the player's
  // Pokémon (agreed: Rocket's Zapdos ex itself may be chosen; no Weakness or Resistance).
  'ex7-106': {
    Plasma: recoverOnto(10, 'lightning', 'Plasma'),
    'Raging Thunder': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to do 30 damage to' }],
      run(ctx) {
        ctx.hit(60);
        const t = ctx.choices.ownTarget ?? 'active';
        if (t === 'active') ctx.selfDamage(30);
        else ctx.damageBenched(ctx.me, t, 30);
      },
    },
  },
  // Mudkip ☆, Torchic ☆, Treecko ☆ – Spring Back: with the opponent at 1 Prize card left, 50 more and a Special Condition.
  'ex7-107': { 'Spring Back': springBack('asleep') },
  'ex7-108': { 'Spring Back': springBack('confused') },
  'ex7-109': { 'Spring Back': springBack('poisoned') },
};

/** Shuffles the attacking player's deck. */
function shuffleOwnDeck(ctx: AttackContext) {
  [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
}
