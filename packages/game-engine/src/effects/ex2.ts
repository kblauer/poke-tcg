// EX Sandstorm (ex2) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the EX Ruby & Sapphire ones (ex1.ts). Agreed with the user: Random Curse's 5 damage
// counters go on any of the opponent's Pokémon, Active and Benched; Split Blast may do 50 to each of the opponent's
// Pokémon whenever they have a Benched Pokémon; a named Pokémon matches every variant of it (Team Aqua's Seviper, Kabuto δ,
// Dark Golbat…) but a Pokémon-ex never matches its non-ex name (namesMatch); Supernatural uses the Supporter's effect as if
// Sableye's player had played it, its questions asked during the attack (the card stays in the opponent's hand; Primal
// Veil and the one-Supporter rule don't stop it).
// From the text: "you may discard … If you do" is asked before the attack; Lure Poison's and Metal Hook's switch is the
// attacking player's pick; Judgement Knocks Out only a Pokémon the attack can affect.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, type CardLibrary, type EnergyType } from '../cards.js';
import { isEnergyCardOf, isSpecialEnergy, type CardInstance, type InPlayPokemon, type PlayerState } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { benchRoom, clearOnLeavingActive, devolvable, openBenchSlot, pokemonName, removeTopEvolution } from '../status.js';
import { benchedSlots, extraEnergy, inPlay, perHeads } from './common.js';
import { typedCards } from './ecard1.js';
import { discardAtRandom, eachDefending, energyAmount } from './ex1.js';
import { healUpTo } from './si1.js';

export { inPlay };

/** The Energy cards of `type` attached to a Pokémon, Special ones of that type too (Darkness Energy). */
export const typeCards = (cards: CardLibrary, p: InPlayPokemon, type: EnergyType) =>
  p.energy.filter((e) => {
    const d = lookupCard(cards, e.defId);
    return isEnergyCardOf(e, cards, type) || (!e.provides && !e.windless && !e.colorlessOnly && d.kind === 'energy' && d.energyType === type);
  });

/** An Energy card of `type`, basic or Special (Darkness Energy, Metal Energy), wherever it is (Lightning Burst, Super Connectivity). */
export const energyCardOf = (cards: CardLibrary, e: CardInstance, type: EnergyType) => {
  const d = lookupCard(cards, e.defId);
  return isEnergyCardOf(e, cards, type) || (!e.provides && !e.windless && !e.colorlessOnly && d.kind === 'energy' && d.energyType === type);
};

/** "You may discard a `type` Energy card attached to … If you do, `then`" (Deadly Poison, Dark Bind), asked before the attack. */
export const mayDiscardFor = (damage: number, type: EnergyType, then: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s): ChoiceSpec[] =>
    typeCards(s.cards, s.attacker, type).length ? [{ kind: 'boost', options: [true, false], prompt: `Discard a ${type[0]!.toUpperCase()}${type.slice(1)} Energy card for the attack's effect?` }] : [],
  run(ctx) {
    ctx.hit(damage);
    const [card] = typeCards(ctx.state.cards, ctx.attacker, type);
    if (!ctx.choices.boost || !card) return;
    discardOwn(ctx, [card]);
    then(ctx);
  },
});

/** Discards these Energy cards from the attacker. */
export function discardOwn(ctx: AttackContext, cards: CardInstance[]) {
  if (!cards.length) return;
  ctx.attacker.energy = ctx.attacker.energy.filter((e) => !cards.includes(e));
  ctx.me.discard.push(...cards);
  ctx.log(`Discarded ${cards.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from ${ctx.attackerDef.name}.`);
}

/** `n` damage counters on one of `owner`'s Pokémon, if the attack can affect it. */
export function putCounters(ctx: AttackContext, owner: PlayerState, p: InPlayPokemon, n: number) {
  if (n <= 0 || !ctx.canAffect(owner, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, owner.id);
}

/** The top (highest Stage) Evolution card of `owner`'s Evolved Pokémon `p` comes off it; returns that card. */
export function devolve(ctx: AttackContext, owner: PlayerState, p: InPlayPokemon): CardInstance {
  const top = removeTopEvolution(ctx.state, owner, p);
  clearOnLeavingActive(p);
  ctx.log(`Removed ${lookupCard(ctx.state.cards, top.defId).name}: it's ${pokemonName(ctx.state, p)} again.`, owner.id);
  return top;
}

/** "Remove 2 damage counters from …" (Spiral Drain), after the damage. */
const drain = (damage: number, heal: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    healUpTo(ctx, ctx.me, ctx.attacker, heal);
  },
});

/** "Before using this effect, you may switch the Defending Pokémon with 1 of your opponent's Benched Pokémon" (the attacking player picks). */
const maySwitchDefender = (s: Parameters<NonNullable<AttackEffect['choices']>>[0], prompt: string): ChoiceSpec[] => {
  const options = benchedSlots(s.opponentBench);
  return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt }] : [];
};

/** Search for named Pokémon (and, with `orBasic`, any Basic Pokémon) to put onto the Bench as Basic Pokémon (Team Assembly, Influence). */
const benchNamed = (source: string, names: string[], most: number, orBasic: boolean): AttackEffect => ({
  blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
  run(ctx) {
    const room = Math.min(most, benchRoom(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card));
    if (ctx.me.deck.length && room) ctx.pend({ kind: 'pickFromDeck', source, filter: 'named', name: names, orBasic, toBench: true, optional: true, count: room });
  },
});

/** Team Assembly: Omanyte, Kabuto or any Basic Pokémon, as many as there's room for. */
const teamAssembly = benchNamed('Team Assembly', ['Omanyte', 'Kabuto'], 5, true);

export const EX2: Record<string, Record<string, AttackEffect>> = {
  // Cradily – Lure Poison: the Defending Pokémon may be switched first, then it's Poisoned; Spiral Drain.
  'ex2-3': {
    'Lure Poison': {
      choices: (s) => maySwitchDefender(s, "You may choose one of your opponent's Benched Pokémon to switch in first"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
        ctx.inflict('poisoned');
      },
    },
    'Spiral Drain': drain(50, 20),
  },
  // Dusclops – Judgement: 2 heads Knock Out the Defending Pokémon; Random Curse: 5 damage counters on the opponent's Pokémon as the player likes.
  'ex2-4': {
    Judgement: {
      run(ctx) {
        if (ctx.flips(2) < 2) return ctx.log('Judgement did nothing.');
        ctx.affectDefender(() => {
          ctx.defender.damage = Math.max(ctx.defender.damage, ctx.defenderDef.hp);
          ctx.log(`Judgement: ${ctx.defenderDef.name} is Knocked Out.`, ctx.opp.id);
        });
      },
    },
    'Random Curse': {
      run(ctx) {
        const skip = inPlay(ctx.opp).filter((p) => !ctx.canAffect(ctx.opp, p)).map((p) => p.card.uid);
        if (inPlay(ctx.opp).length > skip.length) ctx.pend({ kind: 'placeCounters', source: 'Random Curse', count: 5, active: true, skip });
      },
    },
  },
  // Jolteon – Lightning Strike: the player may discard all Lightning Energy cards for 70 instead of 40.
  'ex2-6': {
    'Lightning Strike': {
      choices: () => [{ kind: 'boost', options: [true, false], prompt: 'Discard all Lightning Energy cards for 70 damage instead of 40?' }],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(40);
        discardOwn(ctx, typedCards(ctx, 'lightning'));
        ctx.hit(70);
      },
    },
  },
  // Mawile – Scam: a Supporter card from the opponent's hand may be shuffled into their deck, then they draw a card; Metal
  // Hook: one of the opponent's Benched Pokémon may be switched in first.
  'ex2-9': {
    Scam: {
      run(ctx) {
        if (ctx.opp.hand.length) ctx.pend({ kind: 'oppHandTrainer', source: 'Scam', filter: 'supporter', count: 1 });
        else ctx.log("Your opponent's hand is empty.");
      },
    },
    'Metal Hook': {
      choices: (s) => maySwitchDefender(s, "You may choose one of your opponent's Benched Pokémon to switch in before the damage"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
        ctx.hit(20);
      },
    },
  },
  // Sableye – Supernatural: the effect of a Supporter card in the opponent's hand (agreed); Dark Bind.
  'ex2-10': {
    Supernatural: {
      run(ctx) {
        if (ctx.opp.hand.length) ctx.pend({ kind: 'supernatural', source: 'Supernatural' });
        else ctx.log("Your opponent's hand is empty.");
      },
    },
    'Dark Bind': mayDiscardFor(20, 'darkness', (ctx) => ctx.inflict('paralyzed')),
  },
  // Seviper – Deadly Poison.
  'ex2-11': { 'Deadly Poison': mayDiscardFor(10, 'grass', (ctx) => ctx.inflict('poisoned')) },
  // Shiftry – Light Touch Throw: 10 less for each Energy attached to the Defending Pokémon.
  'ex2-12': { 'Light Touch Throw': { damage: '80-', run: (ctx) => void ctx.hit(Math.max(0, 80 - 10 * energyAmount(ctx, ctx.defender))) } },
  // Zangoose – Target Slash: 30 more against a Seviper (a variant too, agreed).
  'ex2-14': { 'Target Slash': { run: (ctx) => void ctx.hit(namesMatch(ctx.defenderDef.name, 'Seviper') ? 40 : 10) } },
  // Arcanine – Burn Up: tails discards all Fire Energy cards.
  'ex2-15': {
    'Burn Up': {
      run(ctx) {
        ctx.hit(60);
        if (!ctx.flip()) discardOwn(ctx, typedCards(ctx, 'fire'));
      },
    },
  },
  // Espeon – Energy Crush: 10 more for each Energy attached to the opponent's Pokémon.
  'ex2-16': { 'Energy Crush': { run: (ctx) => void ctx.hit(20 + 10 * inPlay(ctx.opp).reduce((n, p) => n + energyAmount(ctx, p), 0)) } },
  // Golduck – Special Blow: 40 more if the Defending Pokémon has a Special Energy card attached.
  'ex2-17': { 'Special Blow': { run: (ctx) => void ctx.hit(ctx.defender.energy.some((e) => isSpecialEnergy(ctx.state.cards, e)) ? 70 : 30) } },
  // Omastar – Pull Down: each of the opponent's Evolved Pokémon loses its top Evolution card, to their hand.
  'ex2-19': {
    'Pull Down': {
      run(ctx) {
        const evolved = inPlay(ctx.opp).filter((p) => devolvable(ctx.state.cards, p));
        if (!evolved.length) return ctx.log('Your opponent has no Evolved Pokémon.');
        for (const p of evolved) if (ctx.canAffect(ctx.opp, p)) ctx.opp.hand.push(devolve(ctx, ctx.opp, p));
      },
    },
  },
  // Pichu – Energy Retrieval: up to 2 basic Energy cards from the discard pile to 1 of the player's Pokémon, a damage counter for each.
  'ex2-20': {
    'Energy Retrieval': {
      choices(s): ChoiceSpec[] {
        const basics = s.discardsLocked ? [] : s.ownDiscard.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));
        if (!basics.length) return [];
        return [
          { kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to attach basic Energy cards to' },
          { kind: 'ownDiscard', min: 1, max: 2, options: basics, prompt: 'Choose up to 2 basic Energy cards from your discard pile' },
        ];
      },
      run(ctx) {
        const t = ctx.choices.ownTarget;
        const p = t === undefined ? null : t === 'active' ? ctx.me.active : ctx.me.bench[t];
        const cards = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid));
        if (!p || !cards.length || discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Energy Retrieval found nothing.');
        ctx.me.discard = ctx.me.discard.filter((c) => !cards.includes(c));
        p.energy.push(...cards);
        p.damage += 10 * cards.length;
        ctx.log(`Attached ${cards.length} basic Energy card${cards.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, p)}, and put as many damage counters on it.`);
      },
    },
  },
  // Sandslash – Sand Swirl: 20 to each Defending Pokémon, and the Active one can't retreat; Earthquake: 10 to each of its player's Benched Pokémon.
  'ex2-21': {
    'Sand Swirl': {
      run(ctx) {
        eachDefending(ctx, 20);
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`, ctx.opp.id);
        });
      },
    },
    Earthquake: {
      run(ctx) {
        ctx.hit(60);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Wobbuffet – Flip Over: 10 to itself (no Weakness or Resistance).
  'ex2-26': {
    'Flip Over': {
      run(ctx) {
        ctx.hit(50);
        ctx.selfDamage(10);
      },
    },
  },
  // Anorith – Fast Evolution: an Evolution card from the deck, shown.
  'ex2-27': { 'Fast Evolution': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Fast Evolution', filter: 'evolution', reveal: true })) } },
  // Azumarill – Drizzle: any number of Water Energy cards from the hand to the Active Pokémon; Max Bubbles: a coin for each Energy attached to it.
  'ex2-30': {
    Drizzle: {
      run(ctx) {
        const water = ctx.me.hand.filter((c) => isEnergyCardOf(c, ctx.state.cards, 'water') && isBasicEnergy(lookupCard(ctx.state.cards, c.defId))).length;
        if (water) ctx.pend({ kind: 'attachFromHand', source: 'Drizzle', type: 'water', basic: true, count: water });
        else ctx.log('There are no Water Energy cards in the hand.');
      },
    },
    'Max Bubbles': { run: (ctx) => void ctx.hit(30 * ctx.flips(energyAmount(ctx, ctx.attacker))) },
  },
  // Azurill – Jump Catch: a Trainer card from the deck, shown.
  'ex2-31': { 'Jump Catch': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Jump Catch', filter: 'trainer', reveal: true })) } },
  // Delcatty – Ultra Energy Source: 10 for each basic Energy card attached to the two Active Pokémon.
  'ex2-34': {
    'Ultra Energy Source': {
      run: (ctx) => void ctx.hit(10 * [ctx.attacker, ctx.defender].reduce((n, p) => n + p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId))).length, 0)),
    },
  },
  // Elekid – Gather Energy: a basic Energy card from the deck to 1 of the player's Pokémon.
  'ex2-36': { 'Gather Energy': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Gather Energy', filter: 'basicEnergy', attach: true })) } },
  // Kabuto, Omanyte – Team Assembly.
  'ex2-39': { 'Team Assembly': teamAssembly },
  'ex2-70': { 'Team Assembly': teamAssembly },
  // Lileep – Influence: up to 2 of Omanyte, Kabuto, Aerodactyl, Lileep and Anorith onto the Bench; Time Spiral: heads, an
  // Evolved Pokémon of the opponent's loses its top Evolution card, shuffled into their deck.
  'ex2-42': {
    Influence: benchNamed('Influence', ['Omanyte', 'Kabuto', 'Aerodactyl', 'Lileep', 'Anorith'], 2, false),
    'Time Spiral': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => devolvable(s.cards, (t === 'active' ? s.defender : s.opponentBench[t])!));
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Evolved Pokémon" }] : [];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        if (!p || !devolvable(ctx.state.cards, p)) return ctx.log('Your opponent has no Evolved Pokémon.');
        if (!ctx.flip() || !ctx.canAffect(ctx.opp, p)) return;
        const top = devolve(ctx, ctx.opp, p);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, top], ctx.state.rngState);
      },
    },
  },
  // Linoone – Sniff Out: any card from the discard pile into the hand.
  'ex2-44': {
    'Sniff Out': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        if (ctx.me.discard.length) ctx.pend({ kind: 'discardToHand', source: 'Sniff Out', count: 1, filter: 'any' });
      },
    },
  },
  // Lombre – Fury Swipes.
  'ex2-46': { 'Fury Swipes': perHeads(3, 20) },
  // Pelipper – Water Gun: 10 more for each Water Energy beyond the cost, at most 20 more.
  'ex2-50': { 'Water Gun': { run: (ctx) => void ctx.hit(30 + 10 * extraEnergy(ctx, ['colorless', 'colorless'], 'water', 2)) } },
  // Quilava – Burning Claw.
  'ex2-51': { 'Burning Claw': mayDiscardFor(40, 'fire', (ctx) => ctx.inflict('burned')) },
  // Vigoroth – Focus Energy: Slash's base damage is 90 next turn.
  'ex2-52': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).focusEnergy = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name}'s Slash's base damage is 90 next turn.`);
      },
    },
    Slash: { run: (ctx) => void ctx.hit(ctx.attacker.effects?.focusEnergy === ctx.turn ? 90 : 40) },
  },
  // Wynaut – Alluring Smile: a Basic Pokémon or Evolution card for each Energy attached, shown.
  'ex2-54': {
    'Alluring Smile': {
      run(ctx) {
        const count = energyAmount(ctx, ctx.attacker);
        if (count && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Alluring Smile', filter: 'pokemon', reveal: true, optional: true, count });
      },
    },
  },
  // Xatu – Psyimpact: a damage counter on each of the opponent's Pokémon.
  'ex2-55': { Psyimpact: { run: (ctx) => inPlay(ctx.opp).forEach((p) => putCounters(ctx, ctx.opp, p, 1)) } },
  // Dunsparce – Strike and Run: up to 3 Basic Pokémon from the deck onto the Bench, then it may switch with a Benched Pokémon.
  'ex2-60': {
    'Strike and Run': {
      run(ctx) {
        const room = Math.min(3, benchRoom(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card));
        if (room && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Strike and Run', filter: 'basic', toBench: true, optional: true, count: room });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Strike and Run', kind: 'switchIn', optional: true });
      },
    },
  },
  // Duskull – Haunt: a damage counter on the Defending Pokémon.
  'ex2-62': { Haunt: { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, 1) } },
  // Eevee – Signs of Evolution: up to 3 cards that evolve from Eevee, shown.
  'ex2-63': {
    'Signs of Evolution': {
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'evolvesFrom', name: 'Eevee', reveal: true, optional: true, count: 3 })),
    },
  },
  // Marill – Double Bubble: 10 for each heads of 2; Paralyzed if either is heads.
  'ex2-68': {
    'Double Bubble': {
      run(ctx) {
        const heads = ctx.flips(2);
        ctx.hit(10 * heads);
        if (heads) ctx.inflict('paralyzed');
      },
    },
  },
  // Shroomish – Growth Spurt: a Grass Energy card from the hand to Shroomish.
  'ex2-78': {
    'Growth Spurt': {
      run(ctx) {
        if (ctx.me.hand.some((c) => isEnergyCardOf(c, ctx.state.cards, 'grass') && isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromHand', source: 'Growth Spurt', type: 'grass', basic: true, count: 1 });
        else ctx.log('There are no Grass Energy cards in the hand.');
      },
    },
  },
  // Skitty – Energy Catch: a basic Energy card from the discard pile into the hand, shown.
  'ex2-79': {
    'Energy Catch': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        if (ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'discardToHand', source: 'Energy Catch', count: 1, filter: 'basicEnergy', reveal: true });
      },
    },
  },
  // Gardevoir ex – Feedback: a damage counter on the Defending Pokémon for each card in the opponent's hand; Psystorm: 10 for each Energy in play.
  'ex2-96': {
    Feedback: { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, ctx.opp.hand.length) },
    Psystorm: { run: (ctx) => void ctx.hit(10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].reduce((n, p) => n + energyAmount(ctx, p), 0)) },
  },
  // Kabutops ex – Hydrocutter: a coin for each Energy attached, at most 3; Spiral Drain.
  'ex2-97': {
    Hydrocutter: { run: (ctx) => void ctx.hit(40 * ctx.flips(Math.min(3, energyAmount(ctx, ctx.attacker)))) },
    'Spiral Drain': drain(70, 20),
  },
  // Typhlosion ex – Ring of Fire: Burned and can't retreat; Split Blast: an Energy card discarded; 50 to each of the
  // opponent's Pokémon instead, if the player likes, whenever they have a Benched Pokémon (agreed).
  'ex2-99': {
    'Ring of Fire': {
      run(ctx) {
        ctx.hit(40);
        ctx.inflict('burned');
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`, ctx.opp.id);
        });
      },
    },
    'Split Blast': {
      choices(s): ChoiceSpec[] {
        const energy = s.attacker.energy.filter((e) => !e.provides);
        return [
          ...(energy.length ? [{ kind: 'ownEnergy' as const, count: 1, options: energy, prompt: 'Choose an Energy card to discard from Typhlosion ex' }] : []),
          ...(benchedSlots(s.opponentBench).length ? [{ kind: 'boost' as const, options: [true, false], prompt: "Do 50 damage to each of your opponent's Pokémon instead of 100 to the Defending Pokémon?" }] : []),
        ];
      },
      run(ctx) {
        if (ctx.choices.boost) {
          ctx.hit(50);
          ctx.benchDamage(ctx.opp, 50);
        } else ctx.hit(100);
        discardOwn(ctx, ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid)));
      },
    },
  },
  // Wailord ex – Super Deep Dive: with a Benched Pokémon, 3 damage counters off, then it switches with one of them.
  'ex2-100': {
    'Super Deep Dive': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to switch with' }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || !ctx.me.bench[slot]) return ctx.log('Super Deep Dive did nothing.');
        healUpTo(ctx, ctx.me, ctx.attacker, 30);
        ctx.switchOwn(slot);
      },
    },
  },
};

/** Bad News (Absol), Pick On (Skarmory): the opponent's hand down to 5. */
export function downToFive(ctx: AttackContext) {
  if (ctx.opp.hand.length < 6) return ctx.log('Your opponent has fewer than 6 cards in their hand.');
  while (ctx.opp.hand.length > 5) discardAtRandom(ctx);
}
