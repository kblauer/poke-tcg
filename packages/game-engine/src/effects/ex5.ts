// EX Hidden Legends (ex5) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't
// play, and the Ancient Technical Machines' attacks (Ice Generator, Stone Generator, Steel Generator). Rulings follow the card
// text and the earlier EX sets'.
// Agreed with the user: Darkness Chant and Shadow Steal count discard piles while Allergic Pollen works (it stops taking or
// using cards there, not counting them); Make a Wish and Ascension keep the usual limits for evolving; Steel Wave counts a
// Benched Pokémon sharing either of the Defending Pokémon's types; Ice Generator discards the Stadium too when the opponent
// played it; Chime uses a Supporter from the opponent's discard pile as Supernatural does from their hand.
// From the text: Sweet Temptation and Intense Glare switch in the Benched Pokémon the attacking player picks; Mass
// Destruction does nothing with a Special Energy card attached to Electrode.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { hasType, isBasicEnergy, lookupCard, typesOf } from '../cards.js';
import { counts, energyPool, energyProvided, evolvesOnto, isEnergyCardOf, isSpecialEnergy, type CardInstance } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, energyCanMove, opponentBenchChoice } from './common.js';
import { energyAmount } from './ex1.js';
import { discardOwn, inPlay, mayDiscardFor, putCounters, typeCards } from './ex2.js';
import { pullDown } from './ex4.js';
import { healUpTo } from './si1.js';

/** A basic Energy card. */
const basic = (ctx: Pick<AttackContext, 'state'>, c: CardInstance) => !c.provides && isBasicEnergy(lookupCard(ctx.state.cards, c.defId));

/** The attacker's Energy cards the player may pick. */
const ownCards = (s: Parameters<NonNullable<AttackEffect['choices']>>[0]) => s.attacker.energy.filter((e) => !e.provides);

/** Base damage, then `more` if `when` holds. */
const moreIf = (base: number, more: number, when: (ctx: AttackContext) => boolean): AttackEffect => ({ run: (ctx) => void ctx.hit(when(ctx) ? base + more : base) });

/** The name of the Stadium in play, if any. */
const stadiumName = (ctx: AttackContext) => (ctx.state.stadium ? lookupCard(ctx.state.cards, ctx.state.stadium.card.defId).name : null);

/** Switch one of the opponent's Benched Pokémon (the player's pick) in, then `then` to the new Defending Pokémon (Sweet Temptation, Intense Glare). */
const lureIn = (prompt: string, then: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, prompt),
  run(ctx) {
    if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
    then(ctx);
  },
});

/** "Search your deck for a card that evolves from … and put it on …" for the attacker itself (Ascension), with the usual limits (agreed). */
export const ascension: AttackEffect = {
  run(ctx) {
    if (ctx.turn <= 2 || ctx.attacker.playedTurn === ctx.turn || ctx.attacker.effects?.noEvolve !== undefined) return ctx.log(`${ctx.attackerDef.name} can't evolve this turn.`);
    const current = lookupCard(ctx.state.cards, ctx.attacker.card.defId);
    const names = [...new Set(ctx.me.deck.map((c) => lookupCard(ctx.state.cards, c.defId)).filter((d) => d.kind === 'pokemon' && evolvesOnto(d, current)).map((d) => d.name))];
    if (names.length) ctx.pend({ kind: 'evolveFromDeck', source: 'Ascension', target: 'active', names });
    else ctx.log('Found nothing in the deck.');
  },
};

/** Lightning Strike: all Lightning Energy may be discarded for `boosted` instead of `damage`. */
const lightningStrike = (damage: number, boosted: number): AttackEffect => ({
  choices: () => [{ kind: 'boost', options: [true, false], prompt: `Discard all Lightning Energy for ${boosted} damage instead of ${damage}?` }],
  run(ctx) {
    if (!ctx.choices.boost) return void ctx.hit(damage);
    discardOwn(ctx, typeCards(ctx.state.cards, ctx.attacker, 'lightning'));
    ctx.hit(boosted);
  },
});

/** Metal Ball: `n` damage counters on the Defending Pokémon. */
const counters = (n: number): AttackEffect => ({ run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, n) });

export const EX5: Record<string, Record<string, AttackEffect>> = {
  // Banette – Shadow Steal: 20 more for each Special Energy card in the opponent's discard pile; Darkness Chant: a damage
  // counter for each Basic Pokémon or Evolution card in the player's discard pile, at most 6 (both count while Allergic Pollen works, agreed).
  'ex5-1': {
    'Shadow Steal': { run: (ctx) => void ctx.hit(10 + 20 * ctx.opp.discard.filter((c) => isSpecialEnergy(ctx.state.cards, c)).length) },
    'Darkness Chant': {
      run(ctx) {
        const pokemon = ctx.me.discard.filter((c) => { const d = lookupCard(ctx.state.cards, c.defId); return d.kind === 'pokemon' && !d.trainerText; }).length;
        putCounters(ctx, ctx.opp, ctx.defender, Math.min(6, pokemon));
      },
    },
  },
  // Claydol – Muddy Eye: 10 for each basic Energy card attached to Claydol and the Defending Pokémon.
  'ex5-2': { 'Muddy Eye': { run: (ctx) => void ctx.hit(10 * [ctx.attacker, ctx.defender].reduce((n, p) => n + p.energy.filter((e) => basic(ctx, e)).length, 0)) } },
  // Crobat – Flutter Trick: heads, a card the player picks from the opponent's hand is discarded; Triple Poison: 3 damage counters between turns.
  'ex5-3': {
    'Flutter Trick': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip() && ctx.opp.hand.length) ctx.pend({ kind: 'oppHandTrainer', source: 'Flutter Trick', any: true, place: 'discard' });
      },
    },
    'Triple Poison': {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('poisoned');
        if (ctx.defender.poison) ctx.defender.poison = 30;
      },
    },
  },
  // Dark Celebi – Dark Provide: up to 1 Grass or Darkness Energy card from the hand to one of the player's Pokémon.
  'ex5-4': {
    'Dark Provide': {
      run(ctx) {
        const fits = ctx.me.hand.some((c) => { const d = lookupCard(ctx.state.cards, c.defId); return d.kind === 'energy' && !d.anyType && (d.energyType === 'grass' || d.energyType === 'darkness'); });
        if (fits) ctx.pend({ kind: 'attachFromHand', source: 'Dark Provide', types: ['grass', 'darkness'], count: 1, anyTarget: true });
        else ctx.log('There are no Grass or Darkness Energy cards in the hand.');
      },
    },
  },
  // Electrode – Mass Destruction: both Electrode and the Defending Pokémon Knocked Out, unless Electrode has a Special Energy card.
  'ex5-5': {
    'Mass Destruction': {
      run(ctx) {
        if (ctx.attacker.energy.some((e) => isSpecialEnergy(ctx.state.cards, e))) return ctx.log('Mass Destruction did nothing.');
        ctx.affectDefender(() => {
          ctx.defender.damage = Math.max(ctx.defender.damage, ctx.defenderDef.hp);
          ctx.log(`${ctx.defenderDef.name} is Knocked Out.`, ctx.opp.id);
        });
        ctx.attacker.damage = Math.max(ctx.attacker.damage, ctx.attackerDef.hp);
        ctx.log(`${ctx.attackerDef.name} is Knocked Out.`);
      },
    },
  },
  // Exploud – Bass Control: 30 to one of the opponent's Pokémon.
  'ex5-6': {
    'Bass Control': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon to do 30 damage to" }],
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(30);
        else ctx.damageBenched(ctx.opp, t, 30);
      },
    },
  },
  // Heracross – Extra Draw: with a Pokémon-ex of the opponent's in play, up to 2 Grass Energy cards from the deck to Heracross.
  'ex5-7': {
    'Extra Draw': {
      run(ctx) {
        if (!inPlay(ctx.opp).some((p) => inPlayDef(ctx.state.cards, p).ex)) return ctx.log('Your opponent has no Pokémon-ex in play.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Extra Draw', filter: 'energyType', type: 'grass', attachToActive: true, optional: true, count: 2 });
      },
    },
  },
  // Jirachi – Make a Wish: a card from the deck that evolves from one of the player's Pokémon goes on it (usual limits, agreed), then a damage counter on Jirachi.
  'ex5-8': {
    'Make a Wish': {
      run(ctx) {
        const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
        if (ctx.me.deck.length) ctx.pend({ kind: 'evolveMany', source: 'Make a Wish', names, done: [], once: true, limits: true, counterOn: ctx.attacker.card.uid });
      },
    },
  },
  // Medicham – Chakra Points: 10 more for each card in the opponent's hand.
  'ex5-10': { 'Chakra Points': { run: (ctx) => void ctx.hit(10 + 10 * ctx.opp.hand.length) } },
  // Milotic – Distorted Wave: 3 damage counters off the Defending Pokémon first.
  'ex5-12': {
    'Distorted Wave': {
      run(ctx) {
        ctx.affectDefender(() => healUpTo(ctx, ctx.opp, ctx.defender, 30));
        ctx.hit(80);
      },
    },
  },
  // Shiftry – Push Aside: a Basic Pokémon or Evolution card the player picks from the opponent's hand to the bottom of their
  // deck; Supernatural Power: 40 more with as many cards in hand as the opponent.
  'ex5-14': {
    'Push Aside': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.opp.hand.length) ctx.pend({ kind: 'oppHandTrainer', source: 'Push Aside', filter: 'pokemon', place: 'bottom' });
      },
    },
    'Supernatural Power': moreIf(40, 40, (ctx) => ctx.me.hand.length === ctx.opp.hand.length),
  },
  // Walrein – Sheer Cold: heads, the Defending Pokémon can't attack next turn.
  'ex5-15': {
    'Sheer Cold': {
      run(ctx) {
        ctx.hit(50);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Bellossom – Miracle Powder: heads, the Special Condition the player picks.
  'ex5-16': {
    'Miracle Powder': {
      choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon (on heads)' }],
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Chimecho – Chime: a Supporter card's effect from the opponent's discard pile (as Supernatural).
  'ex5-17': {
    Chime: {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'supernatural', source: 'Chime', fromDiscard: true });
      },
    },
  },
  // Gorebyss – Mystic Water: 10 more for each Psychic Energy in play.
  'ex5-18': { 'Mystic Water': { run: (ctx) => void ctx.hit(20 + 10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].reduce((n, p) => n + energyPool(p, ctx.state.cards).filter((e) => counts(e, 'psychic')).length, 0)) } },
  // Huntail – Dark Splash: 10 more for each Darkness Pokémon in play (either of its types counts).
  'ex5-19': { 'Dark Splash': { run: (ctx) => void ctx.hit(40 + 10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].filter((p) => hasType(inPlayDef(ctx.state.cards, p), 'darkness')).length) } },
  // Masquerain – Silver Wind: attacks that damage the Defending Pokémon next turn do 30 more.
  'ex5-20': {
    'Silver Wind': {
      run(ctx) {
        ctx.hit(30);
        ctx.affectDefender((e) => {
          e.silverWind = ctx.turn + 2;
          ctx.log(`Attacks that damage ${ctx.defenderDef.name} next turn do 30 more.`, ctx.opp.id);
        });
      },
    },
  },
  // Rain Castform – Scattered Shower: the hand shuffled into the deck, then up to 5 drawn; Rainy Day Blues: Confused with Low Pressure System in play.
  'ex5-23': {
    'Scattered Shower': {
      run(ctx) {
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand.splice(0)], ctx.state.rngState);
        ctx.log('Shuffled the hand into the deck.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'drawCount', source: 'Scattered Shower', max: 5 });
      },
    },
    'Rainy Day Blues': {
      run(ctx) {
        ctx.hit(20);
        if (stadiumName(ctx) === 'Low Pressure System') ctx.inflict('confused');
      },
    },
  },
  // Snow-cloud Castform – White Snow: 20 more with Magnetic Storm in play.
  'ex5-25': { 'White Snow': moreIf(50, 20, (ctx) => stadiumName(ctx) === 'Magnetic Storm') },
  // Sunny Castform – Sunshine: a Stadium card from the discard pile into the hand, shown; Sunburn: Burned with High Pressure System in play.
  'ex5-26': {
    Sunshine: {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'discardToHand', source: 'Sunshine', count: 1, filter: 'stadium', reveal: true });
      },
    },
    Sunburn: {
      run(ctx) {
        ctx.hit(40);
        if (stadiumName(ctx) === 'High Pressure System') ctx.inflict('burned');
      },
    },
  },
  // Tropius – Fruition: an Energy card moves from Tropius to another of the player's Pokémon, then 4 damage counters off that one.
  'ex5-27': {
    Fruition: {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        if (!bench.length || !ownCards(s).length) return [];
        return [
          { kind: 'ownEnergy', count: 1, options: ownCards(s), prompt: 'Choose an Energy card to move from Tropius' },
          { kind: 'ownBench', options: bench, prompt: 'Choose the Pokémon to move it to' },
        ];
      },
      run(ctx) {
        const slot = ctx.choices.ownBenchSlot;
        const to = slot === undefined ? null : ctx.me.bench[slot];
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!to || !card) return ctx.log('Fruition did nothing.');
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
        healUpTo(ctx, ctx.me, to, 40);
      },
    },
  },
  // Beldum – Metal Charge: a damage counter on Beldum.
  'ex5-29': {
    'Metal Charge': {
      run(ctx) {
        ctx.hit(30);
        ctx.attacker.damage += 10;
        ctx.log(`Put a damage counter on ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Castform – Forecast: a Stadium card from the deck goes into play (not one with the name of the Stadium in play, agreed).
  'ex5-30': { Forecast: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'stadiumFromDiscard', source: 'Forecast', fromDeck: true })) } },
  // Claydol – Hyper Beam: heads, an Energy card attached to the Defending Pokémon discarded (chosen before the flip).
  'ex5-31': {
    'Hyper Beam': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip() && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Corsola – Coral Glow: up to as many cards as the opponent has Basic Pokémon in play, at most 10 in the hand.
  'ex5-32': {
    'Coral Glow': {
      run(ctx) {
        const basics = inPlay(ctx.opp).filter((p) => inPlayDef(ctx.state.cards, p).stage === 'basic').length;
        const max = Math.min(basics, Math.max(0, 10 - ctx.me.hand.length));
        if (max && ctx.me.deck.length) ctx.pend({ kind: 'drawCount', source: 'Coral Glow', max });
      },
    },
  },
  // Dodrio – Slashing Strike: tails, not again next turn.
  'ex5-33': {
    'Slashing Strike': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.flip()) return;
        (ctx.attacker.effects ??= {}).amnesia = { attack: 'Slashing Strike', until: ctx.turn + 2 };
        ctx.log(`${ctx.attackerDef.name} can't use Slashing Strike next turn.`);
      },
    },
  },
  // Glalie – Heavy Blizzard: heads, a damage counter on each of the opponent's Benched Pokémon.
  'ex5-34': {
    'Heavy Blizzard': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flip()) ctx.opp.bench.forEach((p) => p && putCounters(ctx, ctx.opp, p, 1));
      },
    },
  },
  // Igglybuff – Set Song: a Basic Pokémon and a basic Energy card from the deck, shown.
  'ex5-37': {
    'Set Song': {
      run(ctx) {
        if (!ctx.me.deck.length) return;
        ctx.pend({ kind: 'pickFromDeck', source: 'Set Song', filter: 'basic', reveal: true, optional: true });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Set Song', kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true, optional: true });
      },
    },
  },
  // Lanturn – Lightning Strike: 90 instead with all Lightning Energy discarded.
  'ex5-38': { 'Lightning Strike': lightningStrike(50, 90) },
  // Luvdisc – Loving Draw: draw until as many cards as the opponent; Sweet Temptation: a Benched Pokémon switched in, 10 to it.
  'ex5-40': {
    'Loving Draw': { run: (ctx) => ctx.draw(Math.max(0, ctx.opp.hand.length - ctx.me.hand.length)) },
    'Sweet Temptation': lureIn("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => void ctx.hit(10)),
  },
  // Medicham – Power Heal: 10 more for each damage counter on it, then one off.
  'ex5-42': {
    'Power Heal': {
      run(ctx) {
        ctx.hit(10 + ctx.attacker.damage);
        healUpTo(ctx, ctx.me, ctx.attacker, 10);
      },
    },
  },
  // Metang, Beldum – Metal Ball.
  'ex5-43': { 'Metal Ball': counters(5) },
  'ex5-54': { 'Metal Ball': counters(1) },
  // Sealeo – Super Icy Wind: 10 to each of the opponent's Pokémon, without Weakness or Resistance.
  'ex5-47': {
    'Super Icy Wind': {
      run(ctx) {
        ctx.hit(10, { weakness: false });
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Spinda – The Hula-la: heads Confused; tails both Confused.
  'ex5-48': {
    'The Hula-la': {
      run(ctx) {
        const heads = ctx.flip();
        ctx.inflict('confused');
        if (!heads) ctx.confuseSelf();
      },
    },
  },
  // Starmie – Rainbow Star: 10 more for each type of basic Energy attached to the Defending Pokémon.
  'ex5-49': {
    'Rainbow Star': { run: (ctx) => void ctx.hit(50 + 10 * new Set(ctx.defender.energy.filter((e) => basic(ctx, e)).map((e) => energyProvided(e, ctx.state.cards).type)).size) },
  },
  // Swalot – Swallow Up: 30 more if the Defending Pokémon has less HP left than Swalot.
  'ex5-50': {
    'Swallow Up': moreIf(50, 30, (ctx) => ctx.defenderDef.hp - ctx.defender.damage < ctx.attackerDef.hp - ctx.attacker.damage),
  },
  // Tentacruel – Long Tentacle: heads Confused, tails an Energy card attached to the Defending Pokémon discarded.
  'ex5-51': {
    'Long Tentacle': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (if tails)' }] : []),
      run(ctx) {
        if (ctx.flip()) ctx.inflict('confused');
        else if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Chinchou – Spark: 10 to 2 of the opponent's Benched Pokémon.
  'ex5-56': {
    Spark: {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBenchMany', count: 2, options, prompt: "Choose 2 of your opponent's Benched Pokémon to do 10 damage to" }] : [];
      },
      run(ctx) {
        ctx.hit(10);
        for (const slot of ctx.choices.benchSlots ?? []) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Feebas, Vulpix – Ascension.
  'ex5-61': { Ascension: ascension },
  'ex5-81': { Ascension: ascension },
  // Meditite – Calm Mind: 2 damage counters off it.
  'ex5-65': { 'Calm Mind': { run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 20) } },
  // Minun – Minus Energy: heads, an Energy card attached to the Defending Pokémon back to the opponent's hand (chosen before the flip).
  'ex5-67': {
    'Minus Energy': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card for your opponent to return to their hand (if heads)' }] : []),
      run(ctx) {
        ctx.hit(10);
        const card = ctx.defender.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        if (!ctx.flip() || !card) return;
        ctx.affectDefender(() => {
          if (!energyCanMove(ctx, ctx.defender)) return;
          ctx.defender.energy = ctx.defender.energy.filter((e) => e !== card);
          ctx.opp.hand.push(card);
          ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} to the hand.`, ctx.opp.id);
        });
      },
    },
  },
  // Plusle – Plus Energy: heads, a Lightning Energy card from the hand to one of the player's Pokémon.
  'ex5-69': {
    'Plus Energy': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Plus Energy did nothing.');
        if (ctx.me.hand.some((c) => basic(ctx, c) && isEnergyCardOf(c, ctx.state.cards, 'lightning'))) ctx.pend({ kind: 'attachFromHand', source: 'Plus Energy', type: 'lightning', basic: true, count: 1, anyTarget: true });
      },
    },
  },
  // Seedot – Growth Spurt.
  'ex5-71': {
    'Growth Spurt': {
      run(ctx) {
        if (ctx.me.hand.some((c) => basic(ctx, c) && isEnergyCardOf(c, ctx.state.cards, 'grass'))) ctx.pend({ kind: 'attachFromHand', source: 'Growth Spurt', type: 'grass', basic: true, count: 1 });
        else ctx.log('There are no Grass Energy cards in the hand.');
      },
    },
  },
  // Shuppet – Shadow Crush: a Psychic Energy card may be discarded; then the opponent discards an Energy card from the Defending Pokémon.
  'ex5-72': {
    'Shadow Crush': mayDiscardFor(10, 'psychic', (ctx) => {
      if (ctx.defender.energy.length && ctx.canAffect(ctx.opp, ctx.defender)) ctx.opponentChooses({ kind: 'discardAttached', source: 'Shadow Crush', target: 'active' });
    }),
  },
  // Totodile – Flail: 10 for each damage counter on Totodile.
  'ex5-79': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Voltorb – Recharge: a Lightning Energy card from the deck to Voltorb.
  'ex5-80': { Recharge: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Recharge', filter: 'energyType', type: 'lightning', attachToActive: true })) } },
  // Groudon ex – Crushing Mantle: any Energy cards from the hand discarded, 10 more each.
  'ex5-93': {
    'Crushing Mantle': {
      choices(s): ChoiceSpec[] {
        // The number of Energy cards in the hand isn't in the situation: 0 to 10, checked when the attack resolves.
        return [{ kind: 'amount', options: Array.from({ length: 11 }, (_, i) => i), prompt: 'How many Energy cards to discard from your hand (10 more damage each)?' }];
      },
      run(ctx) {
        const energy = ctx.me.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length;
        const n = Math.min(ctx.choices.amount ?? 0, energy);
        ctx.hit(50 + 10 * n);
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Crushing Mantle', count: n, energyOnly: true });
      },
    },
  },
  // Kyogre ex – Super Tidal Wave: the hand may be shown, 10 more for each Energy card in it, then those Energy cards shuffled into the deck.
  'ex5-94': {
    'Super Tidal Wave': {
      choices: () => [{ kind: 'boost', options: [true, false], prompt: 'Show your hand to your opponent (10 more damage for each Energy card in it)?' }],
      run(ctx) {
        const energy = ctx.choices.boost ? ctx.me.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') : [];
        if (ctx.choices.boost) ctx.log(`Hand: ${ctx.me.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
        ctx.hit(50 + 10 * energy.length);
        if (!energy.length) return;
        ctx.me.hand = ctx.me.hand.filter((c) => !energy.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...energy], ctx.state.rngState);
        ctx.log(`Shuffled ${energy.length} Energy card${energy.length === 1 ? '' : 's'} into the deck.`);
      },
    },
  },
  // Metagross ex – Metal Reversal: a Benched Pokémon may be switched in first; Extra Comet Punch: 50 more next turn.
  'ex5-95': {
    'Metal Reversal': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
        ctx.hit(40);
      },
    },
    'Extra Comet Punch': {
      run(ctx) {
        ctx.hit(ctx.attacker.effects?.cometPunch === ctx.turn ? 100 : 50);
        (ctx.attacker.effects ??= {}).cometPunch = ctx.turn + 2;
      },
    },
  },
  // Ninetales ex – Intense Glare: a Benched Pokémon switched in, Burned and Confused.
  'ex5-96': {
    'Intense Glare': lureIn("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => {
      ctx.inflict('burned');
      ctx.inflict('confused');
    }),
  },
  // Regice ex – Freeze Lock: heads, no Energy cards from the hand to the Defending Pokémon next turn.
  'ex5-97': {
    'Freeze Lock': {
      run(ctx) {
        ctx.hit(60);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noEnergy = ctx.turn + 1;
          ctx.log(`Energy cards can't be attached to ${ctx.defenderDef.name} from the hand next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Regirock ex – Tonnage: 80 instead, with 30 to itself, if the player likes.
  'ex5-98': {
    Tonnage: {
      choices: () => [{ kind: 'boost', options: [true, false], prompt: 'Do 80 damage instead of 60 (Regirock ex does 30 damage to itself)?' }],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 80 : 60);
        if (ctx.choices.boost) ctx.selfDamage(30);
      },
    },
  },
  // Registeel ex – Steel Wave: 20 to each Benched Pokémon sharing a type with the Defending Pokémon (agreed: either type).
  'ex5-99': {
    'Steel Wave': {
      run(ctx) {
        const types = typesOf(ctx.defenderDef);
        ctx.hit(50);
        ctx.opp.bench.forEach((p, i) => p && types.some((t) => hasType(inPlayDef(ctx.state.cards, p), t)) && ctx.damageBenched(ctx.opp, i, 20));
      },
    },
  },
  // Vileplume ex – Special Formula: heads Asleep and Poisoned, tails Confused.
  'ex5-100': {
    'Special Formula': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flip()) {
          ctx.inflict('asleep');
          ctx.inflict('poisoned');
        } else ctx.inflict('confused');
      },
    },
  },
  // Wigglytuff ex – Do the Wave: 10 more for each of the player's Benched Pokémon.
  'ex5-101': { 'Do the Wave': { run: (ctx) => void ctx.hit(30 + 10 * benchedSlots(ctx.me.bench).length) } },

  // Ancient Technical Machine [Ice] – Ice Generator: every Trainer card of the opponent's in play discarded (their Stadium too,
  // agreed); if any was, nothing the opponent's attacks do affects the attacker next turn.
  'ex5-84': {
    'Ice Generator': {
      run(ctx) {
        let discarded = 0;
        for (const p of inPlay(ctx.opp)) {
          const trainers = (p.attached ?? []).filter((a) => lookupCard(ctx.state.cards, a.card.defId).kind === 'trainer');
          if (!trainers.length) continue;
          p.attached = p.attached!.filter((a) => !trainers.includes(a));
          ctx.opp.discard.push(...trainers.map((a) => a.card));
          discarded += trainers.length;
        }
        const stadium = ctx.state.stadium;
        if (stadium && stadium.owner === ctx.opp.id) {
          ctx.opp.discard.push(stadium.card);
          ctx.state.stadium = null;
          discarded++;
        }
        if (!discarded) return ctx.log('Your opponent has no Trainer cards in play.');
        ctx.log(`Discarded ${discarded} of the opponent's Trainer card${discarded === 1 ? '' : 's'} in play.`, ctx.opp.id);
        ctx.protect('preventAll');
      },
    },
  },
  // Ancient Technical Machine [Rock] – Stone Generator: as Pull Down.
  'ex5-85': { 'Stone Generator': { run: pullDown } },
  // Ancient Technical Machine [Steel] – Steel Generator: with a power on the Defending Pokémon, up to 2 basic Energy cards
  // from one of the opponent's Pokémon to it.
  'ex5-86': {
    'Steel Generator': {
      choices(s): ChoiceSpec[] {
        if (!inPlayDef(s.cards, s.defender).power) return [];
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => t !== 'active' && (s.opponentBench[t]?.energy ?? []).some((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId))));
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Benched Pokémon to move up to 2 basic Energy cards from" }] : [];
      },
      run(ctx) {
        if (!ctx.defenderDef.power) return ctx.log('The Defending Pokémon has no Poké-Power or Poké-Body.');
        const t = ctx.choices.oppTarget;
        const from = typeof t === 'number' ? ctx.opp.bench[t] : null;
        if (!from) return;
        const moving = from.energy.filter((e) => basic(ctx, e)).slice(0, 2);
        from.energy = from.energy.filter((e) => !moving.includes(e));
        ctx.defender.energy.push(...moving);
        ctx.log(`Moved ${moving.length} basic Energy card${moving.length === 1 ? '' : 's'} to ${ctx.defenderDef.name}.`, ctx.opp.id);
      },
    },
  },
};
