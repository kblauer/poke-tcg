// Mysterious Treasures (dp2) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Charity Tail and Trick Play ask the opponent before the attack (beforeAttack: Charity Tail only with 2
// or more cards in their hand); Trick Play's coin is the player's choice (heads first), Weakness and Resistance apply
// unless the guess is right; Ice Bind asks the opponent after it (iceBind); Tail Influence's Energy cards are picked by the
// attacking player when they differ (the same-card rule, agreed); Energy Cyclone asks how many Energy cards to show and takes them from the
// hand in order; Defensive Claw heals the first damaged Teddiursa on the Bench; Bad Temper's 60 more is the Defending
// Pokémon's next attack's, to the Active Pokémon; Persuade's new Defending Pokémon can't retreat during the opponent's next
// turn; Pulse Barrier protects only when it discarded something; Hidden Power (Unown I) turns the Energy card face down
// until the end of the opponent's next turn.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, isBasicEnergy, lookupCard, namesMatch, type CardLibrary } from '../cards.js';
import { counts, discardTool, energyPool, isEnergyCardOf, isSpecialEnergy, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { evolvedFromName, inPlayDef, pokemonName } from '../status.js';
import { attachFromDiscard } from './neo3.js';
import { benchedSlots, damageChosen, energyCards, headsUntilTails, inPlay, opponentBenchChoice, opponentTargets, same, targetOf } from './common.js';
import { DP1, removeDefenderEnergy, shuffleIntoDeck } from './dp1.js';
import { discardAtRandom, energyAmount, restNextTurn } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX13 } from './ex13.js';
import { discardStadium } from './gym2.js';
import { notNextTurn } from './neo3.js';
import { evolutionsOf } from './neo2.js';
import { healUpTo } from './si1.js';

/** The opponent's Pokémon at a target. */
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);

/** The player's own Pokémon at a target. */
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);

/** The player's Pokémon in play, as targets. */
const ownTargets = (s: { attacker: InPlayPokemon; ownBench: (InPlayPokemon | null)[] }): Target[] => ['active', ...benchedSlots(s.ownBench)];

/** Damage counters on one of the opponent's Pokémon (not attack damage), if the attack can affect it. */
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}

/** Basic Energy cards attached to a Pokémon. */
const basicEnergy = (cards: CardLibrary, p: InPlayPokemon) => p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(cards, e.defId)));

/** The damage an attack did to the attacker during the opponent's last turn (0 if none). */
const damagedLastTurn = (ctx: AttackContext) => {
  const last = ctx.attacker.effects?.attackedOn;
  return last && last.turn === ctx.turn - 1 ? last.damage : 0;
};

/** The player has a Pokémon of each name in play. */
const haveInPlay = (ctx: AttackContext, ...names: string[]) => names.every((n) => inPlay(ctx.me).some((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, n)));

/** Cards from the discard pile into the hand, shown (Gather Up, Rescue). */
const fromDiscard = (source: string, count: number, filter: 'energy' | 'any'): AttackEffect => ({
  run(ctx) {
    if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
    ctx.pend({ kind: 'discardToHand', source, count, filter, reveal: true });
  },
});

/** Choose one of the opponent's Pokémon; `amount` damage to it (Weakness and Resistance for the Active Pokémon only). */
const snipe = (amount: number, then?: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s) => opponentTargets(s, `Choose one of your opponent's Pokémon to do ${amount} damage to`),
  run(ctx) {
    damageChosen(ctx, ctx.choices.oppTarget ?? 'active', amount);
    then?.(ctx);
  },
});

/** A yes-or-no question asked before the attack: yes first. */
const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });

/** Its attack `name` does more this turn, from an earlier attack or power (Hustle, Energetic Impulse). */
const boostedNow = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;

export const DP2: Record<string, Record<string, AttackEffect>> = {
  // Aggron – Heap Up: all Energy cards from the discard pile shuffled into the deck, 30 more with a Special Metal Energy among them.
  'dp2-1': {
    'Heap Up': {
      run(ctx) {
        const energy = discardsLocked([ctx.me, ctx.opp], ctx.state.cards) ? [] : ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        const metal = energy.some((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'energy' && d.basic === false && d.energyType === 'metal';
        });
        ctx.hit(metal ? 70 : 40);
        if (!energy.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !energy.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...energy], ctx.state.rngState);
        ctx.log(`Shuffled ${energy.length} Energy card${energy.length === 1 ? '' : 's'} from the discard pile into the deck.`);
      },
    },
  },
  // Alakazam – Psychic Guard: 30 less damage from the opponent's Stage 2 Evolved Pokémon next turn.
  'dp2-2': {
    'Psychic Guard': {
      run(ctx) {
        ctx.hit(50);
        (ctx.attacker.effects ??= {}).stage2Guard = { amount: 30, until: ctx.turn + 1 };
        ctx.log("Damage to Alakazam from your opponent's Stage 2 Pokémon is reduced by 30 next turn.");
      },
    },
  },
  // Ambipom – Tail Influence: the opponent flips until heads; an Energy card of the Defending Pokémon to the bottom of their deck
  // for each tails. Charity Tail: 10 instead if the opponent discarded 2 cards first (beforeAttack).
  'dp2-3': {
    'Tail Influence': {
      run(ctx) {
        ctx.hit(30);
        let tails = 0;
        while (!ctx.oppFlip()) tails++;
        removeDefenderEnergy(ctx, tails, 'Tail Influence', { toBottom: true });
      },
    },
    'Charity Tail': { askOpponent: 'discardTwo', run: (ctx) => void ctx.hit(ctx.choices.answer === 1 ? 10 : 80) },
  },
  // Azelf – Bind Pulse: no Special Energy cards from the opponent's hand next turn.
  'dp2-4': {
    'Bind Pulse': {
      run(ctx) {
        ctx.hit(10);
        ctx.opp.noSpecialEnergyUntil = ctx.turn + 1;
        ctx.log("Your opponent can't attach Special Energy cards from their hand next turn.", ctx.opp.id);
      },
    },
  },
  // Blissey – Happy Chance: first, may attach a basic Energy card from the discard pile to it; 10 more for each Energy.
  'dp2-5': {
    'Happy Chance': {
      choices: (s): ChoiceSpec[] => (s.ownDiscard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) && !s.discardsLocked ? [may('Happy Chance: attach a basic Energy card from your discard pile to Blissey first?')] : []),
      run(ctx) {
        if (ctx.choices.boost) attachFromDiscard(ctx, (c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)));
        ctx.hit(20 + 10 * energyAmount(ctx, ctx.attacker));
      },
    },
  },
  // Celebi – Leaf Tornado: any basic Grass Energy cards moved among the player's Pokémon as they like.
  'dp2-7': {
    'Leaf Tornado': {
      run(ctx) {
        ctx.hit(30);
        if (inPlay(ctx.me).length > 1) ctx.pend({ kind: 'deltaSwitch', source: 'Leaf Tornado', exclude: '', type: 'grass' });
      },
    },
  },
  // Feraligatr – Energy Cyclone: Energy cards from the hand shown (as many as the player says), 20 for each, then shuffled into the deck.
  'dp2-8': {
    'Energy Cyclone': {
      choices(s): ChoiceSpec[] {
        const n = (s.ownHand ?? []).filter((c) => lookupCard(s.cards, c.defId).kind === 'energy').length;
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Energy Cyclone: how many Energy cards from your hand do you show?' }] : [];
      },
      run(ctx) {
        const shown = ctx.me.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').slice(0, ctx.choices.amount ?? 0);
        ctx.hit(20 * shown.length);
        if (!shown.length) return;
        ctx.me.hand = ctx.me.hand.filter((c) => !shown.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...shown], ctx.state.rngState);
        ctx.log(`Shuffled ${shown.length} Energy card${shown.length === 1 ? '' : 's'} from the hand into the deck.`);
      },
    },
  },
  // Lumineon – Reverse Stream: 10 more for each Water Energy, then its Water Energy back to the hand.
  'dp2-11': {
    'Reverse Stream': {
      run(ctx) {
        ctx.hit(30 + 10 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'water')).length);
        const water = ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'water'));
        if (!water.length) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !water.includes(e));
        ctx.me.hand.push(...water);
        ctx.log(`Returned ${water.length} Water Energy to the hand.`);
      },
    },
  },
  // Magmortar – Flame Drum: without Magby under it, 2 Energy cards from the hand discarded (nothing without them).
  'dp2-12': {
    'Flame Drum': {
      run(ctx) {
        if (evolvedFromName(ctx.state.cards, ctx.attacker, 'Magby')) return void ctx.hit(80);
        if (ctx.me.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length < 2) return ctx.log("Flame Drum did nothing: you don't have 2 Energy cards in your hand.");
        ctx.pend({ kind: 'discardFromHand', source: 'Flame Drum', count: 2, energyOnly: true });
        ctx.hit(80);
      },
    },
  },
  // Meganium – Ultra Powder: 3 coins: Poisoned, Burned, Paralyzed for each heads in turn.
  'dp2-13': {
    'Ultra Powder': {
      run(ctx) {
        ctx.hit(20);
        for (const c of ['poisoned', 'burned', 'paralyzed'] as const) if (ctx.flip()) ctx.inflict(c);
      },
    },
  },
  // Raichu – Explosive Thunder: all its basic Lightning Energy cards discarded, 30 for each.
  'dp2-15': {
    'Explosive Thunder': {
      run(ctx) {
        const gone = basicEnergy(ctx.state.cards, ctx.attacker).filter((e) => isEnergyCardOf(e, ctx.state.cards, 'lightning'));
        discardOwn(ctx, gone);
        ctx.hit(30 * gone.length);
      },
    },
  },
  // Typhlosion – Evaporating Heat: a Water Energy attached to the Defending Pokémon discarded.
  'dp2-16': {
    'Evaporating Heat': {
      choices: (s): ChoiceSpec[] => {
        const water = s.defender.energy.filter((e) => energyCardOf(s.cards, e, 'water'));
        return water.length ? [{ kind: 'defenderEnergy', options: water, prompt: 'Choose a Water Energy card to discard from the Defending Pokémon' }] : [];
      },
      run(ctx) {
        ctx.hit(60);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Tyranitar – Payback: with the opponent at 1 Prize card, 40 more and the top 3 cards of their deck discarded. Ground Burn:
  // each player's top card discarded, 20 more for each Energy card among them.
  'dp2-17': {
    Payback: {
      run(ctx) {
        const last = ctx.opp.prizes.length === 1;
        ctx.hit(last ? 80 : 40);
        if (!last) return;
        const top = ctx.opp.deck.splice(0, 3);
        ctx.opp.discard.push(...top);
        ctx.log(`Discarded the top ${top.length} cards of the deck.`, ctx.opp.id);
      },
    },
    'Ground Burn': {
      run(ctx) {
        let energy = 0;
        for (const player of [ctx.me, ctx.opp]) {
          const [top] = player.deck.splice(0, 1);
          if (!top) continue;
          player.discard.push(top);
          if (lookupCard(ctx.state.cards, top.defId).kind === 'energy') energy++;
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, player.id);
        }
        ctx.hit(80 + 20 * energy);
      },
    },
  },
  // Uxie – Mind Off: with Mesprit and Azelf in play, 20 more and the Defending Pokémon is Asleep.
  'dp2-18': {
    'Mind Off': {
      run(ctx) {
        const trio = haveInPlay(ctx, 'Mesprit', 'Azelf');
        ctx.hit(trio ? 30 : 10);
        if (trio) ctx.inflict('asleep');
      },
    },
  },
  // Abomasnow – Heavy Blizzard: heads, a damage counter on each of the opponent's Benched Pokémon.
  'dp2-19': {
    'Heavy Blizzard': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) for (const p of ctx.opp.bench) putCounters(ctx, p, 1);
      },
    },
  },
  // Bastiodon – Anger Revenge: damaged by an attack last turn, 40 to one of the opponent's Benched Pokémon.
  'dp2-21': {
    'Anger Revenge': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 40 damage to (if Bastiodon was damaged last turn)"),
      run(ctx) {
        ctx.hit(60);
        if (damagedLastTurn(ctx) && ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 40);
      },
    },
  },
  // Chimecho – Call In: a card drawn, 2 more with Chingling under it. Strange Bell: a Basic Defending Pokémon is Confused.
  'dp2-22': {
    'Call In': { run: (ctx) => ctx.draw(evolvedFromName(ctx.state.cards, ctx.attacker, 'Chingling') ? 3 : 1) },
    'Strange Bell': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.defenderDef.stage === 'basic') ctx.inflict('confused');
      },
    },
  },
  // Crobat – Strike and Fade: 50 to one of the opponent's Pokémon; tails, Crobat and its cards shuffled into the deck.
  'dp2-23': {
    'Strike and Fade': snipe(50, (ctx) => {
      if (!ctx.flip() && ctx.me.active === ctx.attacker) shuffleIntoDeck(ctx, ctx.me, ctx.attacker);
    }),
  },
  // Exeggutor – String Bomb: a coin for each basic Energy card on it and the Defending Pokémon, 30 for each heads.
  'dp2-24': { 'String Bomb': { run: (ctx) => void ctx.hit(30 * ctx.flips(basicEnergy(ctx.state.cards, ctx.attacker).length + basicEnergy(ctx.state.cards, ctx.defender).length)) } },
  // Glalie – Intimidation Pebble: heads, no Trainer or Supporter cards from the opponent's hand next turn.
  'dp2-25': {
    'Intimidation Pebble': {
      run(ctx) {
        ctx.hit(50);
        if (!ctx.flip()) return;
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer or Supporter cards next turn.", ctx.opp.id);
      },
    },
  },
  // Gyarados – Enrage: flips until tails, a card from the opponent's hand discarded at random for each heads; a first tails Confuses it.
  'dp2-26': {
    Enrage: {
      run(ctx) {
        ctx.hit(80);
        const heads = headsUntilTails(ctx);
        for (let i = 0; i < heads; i++) discardAtRandom(ctx);
        if (!heads) ctx.confuseSelf();
      },
    },
  },
  // Kricketune – Concerto: 10 more for each Kricketot and Kricketune the player has in play.
  'dp2-27': { Concerto: { run: (ctx) => void ctx.hit(40 + 10 * inPlay(ctx.me).filter((p) => ['Kricketot', 'Kricketune'].some((n) => namesMatch(inPlayDef(ctx.state.cards, p).name, n))).length) } },
  // Manectric – Lightning Twister: 20 for each basic Energy card on it. Chain Lightning: 20 to each of the opponent's Benched
  // Pokémon of a type the Defending Pokémon has.
  'dp2-28': {
    'Lightning Twister': { run: (ctx) => void ctx.hit(20 * basicEnergy(ctx.state.cards, ctx.attacker).length) },
    'Chain Lightning': {
      run(ctx) {
        ctx.hit(70);
        const types = [ctx.defenderDef.type, ...(ctx.defenderDef.types ?? [])];
        ctx.opp.bench.forEach((p, i) => p && types.some((t) => hasType(inPlayDef(ctx.state.cards, p), t)) && ctx.damageBenched(ctx.opp, i, 20));
      },
    },
  },
  // Mr. Mime – Trick Play: the player's hidden coin (heads first); the opponent's wrong guess, 50 to the Defending Pokémon; a right one, 20 to Mr. Mime, no Weakness or Resistance.
  'dp2-30': {
    'Trick Play': {
      askOpponent: 'guessCoin',
      choices: () => [may('Trick Play: put the coin down heads up? (No: tails up)')],
      run(ctx) {
        const coin = ctx.choices.boost === false ? 1 : 0;
        if (ctx.choices.answer !== coin) return void ctx.hit(50);
        ctx.selfDamage(20);
      },
    },
  },
  // Nidoqueen – Give Aid: base 50 with as many Benched Pokémon as the opponent or fewer.
  'dp2-31': { 'Give Aid': { run: (ctx) => void ctx.hit(benchedSlots(ctx.me.bench).length <= benchedSlots(ctx.opp.bench).length ? 50 : 90) } },
  // Rampardos – Assurance: base 60 against 60 HP or less left. Hasty Headbutt: 20 to itself; nothing on the Defending Pokémon changes the damage.
  'dp2-33': {
    Assurance: { run: (ctx) => void ctx.hit(ctx.defenderDef.hp - ctx.defender.damage <= 60 ? 60 : 30) },
    'Hasty Headbutt': {
      run(ctx) {
        ctx.selfDamage(20);
        ctx.hit(100, { swift: true });
      },
    },
  },
  // Slaking – Lazy Blow: base 130 the turn a heads Energetic Impulse says so (dp2-powers.ts).
  'dp2-34': { 'Lazy Blow': { run: (ctx) => void ctx.hit(boostedNow(ctx, 'Lazy Blow') ? 130 : 50) } },
  // Sudowoodo – Sidestep: with Bonsly under it, heads prevents all effects of attacks on it next turn. Persuade: the opponent
  // switches, and the new Defending Pokémon can't retreat next turn.
  'dp2-35': {
    Sidestep: {
      run(ctx) {
        ctx.hit(20);
        if (evolvedFromName(ctx.state.cards, ctx.attacker, 'Bonsly') && ctx.flip()) ctx.protect('preventAll');
      },
    },
    Persuade: {
      run(ctx) {
        ctx.hit(30);
        const slots = benchedSlots(ctx.opp.bench);
        if (!slots.length || !ctx.opp.active) return;
        if (slots.length > 1) return ctx.opponentChooses({ kind: 'switchIn', source: 'Persuade', noRetreat: ctx.turn + 1 });
        const before = ctx.opp.active;
        ctx.switchDefender(slots[0]!);
        if (ctx.opp.active !== before) (ctx.opp.active!.effects ??= {}).noRetreat = ctx.turn + 1;
      },
    },
  },
  // Unown I – Hidden Power: an Energy card of the Defending Pokémon face down (1 Colorless Energy, no effects) until the end of the opponent's next turn.
  'dp2-37': {
    'Hidden Power': {
      choices: (s): ChoiceSpec[] => (energyCards(s.defender).length ? [{ kind: 'defenderEnergy', options: energyCards(s.defender), prompt: 'Choose an Energy card of the Defending Pokémon to turn face down' }] : []),
      run(ctx) {
        const card = ctx.defender.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        if (!card) return;
        ctx.affectDefender(() => {
          card.faceDownUntil = ctx.turn + 1;
          ctx.log(`${lookupCard(ctx.state.cards, card.defId).name} is face down until the end of the next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Ursaring – Bad Temper: Confused, and its attacks do 60 more next turn. Defensive Claw: 20 more with Teddiursa on the Bench,
  // 40 more and that Teddiursa healed when it has damage counters.
  'dp2-38': {
    'Bad Temper': {
      run(ctx) {
        ctx.hit(30);
        ctx.inflict('confused');
        ctx.affectDefender((e) => {
          e.nextTurnMore = { amount: 60, turn: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name}'s attacks do 60 more damage next turn.`, ctx.opp.id);
        });
      },
    },
    'Defensive Claw': {
      run(ctx) {
        const teddies = ctx.me.bench.filter((p): p is InPlayPokemon => !!p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Teddiursa'));
        const hurt = teddies.find((p) => p.damage > 0);
        ctx.hit(hurt ? 100 : teddies.length ? 80 : 60);
        if (hurt) healUpTo(ctx, ctx.me, hurt, hurt.damage);
      },
    },
  },
  // Walrein – Ice Bind: the opponent discards a card from their hand, or the Defending Pokémon is Paralyzed (iceBind).
  'dp2-39': {
    'Ice Bind': {
      run(ctx) {
        ctx.hit(70);
        if (!ctx.opp.active || !ctx.canAffect(ctx.opp, ctx.opp.active)) return;
        if (ctx.opp.hand.length) return ctx.opponentChooses({ kind: 'iceBind', source: 'Ice Bind' });
        ctx.inflict('paralyzed');
      },
    },
  },
  // Dunsparce – Triple Pick: 30 to each of 3 of the opponent's Evolved Pokémon.
  'dp2-46': {
    'Triple Pick': {
      choices(s): ChoiceSpec[] {
        const options = [s.defender, ...s.opponentBench].flatMap((p, i) => (p && p.evolvedFrom.length ? [i - 1] : []));
        return options.length ? [{ kind: 'opponentBenchMany', count: 3, options, prompt: "Choose 3 of your opponent's Evolved Pokémon to do 30 damage to each" }] : [];
      },
      run(ctx) {
        for (const slot of new Set(ctx.choices.benchSlots ?? [])) {
          if (slot === -1) ctx.hit(30);
          else ctx.damageBenched(ctx.opp, slot, 30);
        }
      },
    },
  },
  // Gabite – Gather Up: up to 2 Energy cards from the discard pile, shown. Marvelous Shine: heads, 4 damage counters on one of the
  // opponent's Pokémon; tails, 4 off one of the player's (both asked first).
  'dp2-48': {
    'Gather Up': fromDiscard('Gather Up', 2, 'energy'),
    'Marvelous Shine': {
      choices: (s): ChoiceSpec[] => [
        ...opponentTargets(s, "Choose one of your opponent's Pokémon to put 4 damage counters on (if heads)"),
        { kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to remove 4 damage counters from (if tails)' },
      ],
      run(ctx) {
        if (ctx.flip()) return putCounters(ctx, theirs(ctx, ctx.choices.oppTarget ?? 'active'), 4);
        const p = mine(ctx, ctx.choices.ownTarget ?? 'active');
        if (p) healUpTo(ctx, ctx.me, p, 40);
      },
    },
  },
  // Graveler – Rock Slide: as EX Holon Phantoms'.
  'dp2-51': { 'Rock Slide': same(() => EX13['ex13-28']?.['Rock Slide']) },
  // Lairon – Mend: a Metal Energy card from the discard pile attached to it, and 2 damage counters off if one was.
  'dp2-53': {
    Mend: {
      run(ctx) {
        const before = ctx.attacker.energy.length;
        attachFromDiscard(ctx, (c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'energy' && !d.anyType && d.energyType === 'metal';
        });
        if (ctx.attacker.energy.length > before) healUpTo(ctx, ctx.me, ctx.attacker, 20);
      },
    },
  },
  // Masquerain – Swirling Ripple: with a Water Pokémon of the opponent's in play, 30 more and Confused.
  'dp2-55': {
    'Swirling Ripple': {
      run(ctx) {
        const water = inPlay(ctx.opp).some((p) => hasType(inPlayDef(ctx.state.cards, p), 'water'));
        ctx.hit(water ? 60 : 30);
        if (water) ctx.inflict('confused');
      },
    },
  },
  // Nidorina – Rescue: up to 2 Pokémon from the discard pile, shown.
  'dp2-56': {
    Rescue: {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'discardToHand', source: 'Rescue', count: 2, reveal: true });
      },
    },
  },
  // Octillery – Crash Bomber: with a Special Energy card on the Defending Pokémon, 30 more and one discarded.
  'dp2-57': {
    'Crash Bomber': {
      choices: (s): ChoiceSpec[] => {
        const special = s.defender.energy.filter((e) => isSpecialEnergy(s.cards, e));
        return special.length ? [{ kind: 'defenderEnergy', options: special, prompt: 'Choose a Special Energy card to discard from the Defending Pokémon' }] : [];
      },
      run(ctx) {
        const special = ctx.defender.energy.some((e) => isSpecialEnergy(ctx.state.cards, e));
        ctx.hit(special ? 60 : 30);
        if (special && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Parasect – Wild Spores: evolved from Paras this turn, 40 and Asleep and Poisoned.
  'dp2-58': {
    'Wild Spores': {
      run(ctx) {
        const fresh = ctx.attacker.playedTurn === ctx.turn && namesMatch(lookupCard(ctx.state.cards, ctx.attacker.evolvedFrom.at(-1)?.defId ?? ctx.attacker.card.defId).name, 'Paras') && ctx.attacker.evolvedFrom.length > 0;
        ctx.hit(fresh ? 40 : 20);
        if (!fresh) return;
        ctx.inflict('asleep');
        ctx.inflict('poisoned');
      },
    },
  },
  // Pupitar – Rocket Tackle: 10 to itself; heads, no attack damage to it next turn.
  'dp2-59': {
    'Rocket Tackle': {
      run(ctx) {
        ctx.hit(50);
        ctx.selfDamage(10);
        if (ctx.flip()) ctx.protect('preventDamage');
      },
    },
  },
  // Sandslash – Spike Armor: damaged by the opponent's attack next turn, 4 damage counters on the Attacking Pokémon. Poison Spike:
  // Poisoned if it already had damage counters.
  'dp2-61': {
    'Spike Armor': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).spikeArmor = ctx.turn + 1;
        ctx.log("If Sandslash is damaged by your opponent's attack next turn, 4 damage counters go on the Attacking Pokémon.");
      },
    },
    'Poison Spike': {
      run(ctx) {
        const hurt = ctx.defender.damage > 0;
        ctx.hit(60);
        if (hurt) ctx.inflict('poisoned');
      },
    },
  },
  // Tropius – Bonus Leaf: 3 damage counters off each of the player's Benched Pokémon with Grass Energy attached.
  'dp2-64': {
    'Bonus Leaf': {
      run(ctx) {
        for (const p of ctx.me.bench) if (p && energyPool(p, ctx.state.cards).some((e) => counts(e, 'grass'))) healUpTo(ctx, ctx.me, p, 30);
      },
    },
  },
  // Unown E – Hidden Power: the opponent's coins are all tails next turn.
  'dp2-65': {
    'Hidden Power': {
      run(ctx) {
        ctx.opp.tailsUntil = ctx.turn + 1;
        ctx.log("Your opponent's coin flips are all tails next turn.", ctx.opp.id);
      },
    },
  },
  // Unown M – Hidden Power: heads, 30 to the Defending Pokémon; tails, 30 to one of the player's Pokémon (asked first), no Weakness or Resistance.
  'dp2-66': {
    'Hidden Power': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to do 30 damage to (if tails)' }],
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(30);
        const t = ctx.choices.ownTarget ?? 'active';
        if (t === 'active') return ctx.selfDamage(30);
        const p = ctx.me.bench[t];
        if (!p) return;
        p.damage += 30;
        ctx.log(`${pokemonName(ctx.state, p)} took 30 damage.`);
      },
    },
  },
  // Unown T – Hidden Power: a card from the opponent's hand shuffled into their deck, then one from the player's, picked by the opponent.
  'dp2-67': {
    'Hidden Power': {
      run(ctx) {
        if (ctx.opp.hand.length) ctx.pend({ kind: 'oppHandTrainer', source: 'Hidden Power', any: true });
        if (ctx.me.hand.length) (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Hidden Power', kind: 'oppHandTrainer', any: true, afterAttack: true });
      },
    },
  },
  // Vigoroth – Wake-up Punch: evolved this turn from an Asleep Slakoth, base 60.
  'dp2-68': {
    'Wake-up Punch': {
      run(ctx) {
        const under = ctx.attacker.evolvedFrom.at(-1);
        const woke = ctx.attacker.evolvedAsleep === ctx.turn && !!under && namesMatch(lookupCard(ctx.state.cards, under.defId).name, 'Slakoth');
        ctx.hit(woke ? 60 : 10);
      },
    },
  },
  // Abra – Play Search: one of the top 5 cards into the hand, the rest shuffled back. Ultra Evolution: Alakazam from the deck onto it.
  'dp2-69': {
    'Play Search': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromTop', source: 'Play Search', looked: ctx.me.deck.slice(0, 5).map((c) => c.uid), take: 1, shuffleRest: true })) },
    'Ultra Evolution': {
      run(ctx) {
        const names = evolutionsOf(ctx, 'Kadabra').filter((n) => namesMatch(n, 'Alakazam'));
        if (ctx.me.deck.some((c) => namesMatch(lookupCard(ctx.state.cards, c.defId).name, 'Alakazam'))) return ctx.pend({ kind: 'evolveFromDeck', source: 'Ultra Evolution', target: 'active', names: names.length ? names : ['Alakazam'] });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Found no Alakazam in the deck.');
      },
    },
  },
  // Aipom – Throw Off: the chosen Pokémon's Pokémon Tools discarded first, then 20 to it.
  'dp2-70': {
    'Throw Off': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = theirs(ctx, t);
        if (p && ctx.canAffect(ctx.opp, p)) while ((p.attached ?? []).some((a) => a.tool)) discardTool(ctx.state, ctx.opp, p);
        damageChosen(ctx, t, 20);
      },
    },
  },
  // Croagunk – Ghastly Sound: heads, no Supporter cards from the opponent's hand next turn.
  'dp2-78': {
    'Ghastly Sound': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Ghastly Sound did nothing.');
        ctx.opp.noSupportersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Supporter cards next turn.", ctx.opp.id);
      },
    },
  },
  // Electrike – Electromagnetic Jam: heads, no Energy cards from the opponent's hand to their Active Pokémon next turn.
  'dp2-81': {
    'Electromagnetic Jam': {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.opp.freezeLockUntil = ctx.turn + 1;
        ctx.log("Your opponent can't attach Energy cards from their hand to their Active Pokémon next turn.", ctx.opp.id);
      },
    },
  },
  // Exeggcute – Direct-hit Bomb: a coin for each Energy on it, 10 for each heads to one of the opponent's Pokémon.
  'dp2-82': {
    'Direct-hit Bomb': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 10 damage to for each heads"),
      run(ctx) {
        const heads = ctx.flips(energyAmount(ctx, ctx.attacker));
        if (heads) damageChosen(ctx, ctx.choices.oppTarget ?? 'active', 10 * heads);
      },
    },
  },
  // Larvitar – Mountain Bite: may discard the top card of the deck for 10 more, then Asleep.
  'dp2-87': {
    'Mountain Bite': {
      choices: () => [may('Mountain Bite: discard the top card of your deck for 10 more damage (Larvitar is then Asleep)?')],
      run(ctx) {
        const [top] = ctx.choices.boost ? ctx.me.deck.splice(0, 1) : [];
        if (!top) return void ctx.hit(10);
        ctx.me.discard.push(top);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`);
        ctx.hit(20);
        ctx.sleepSelf();
      },
    },
  },
  // Nidoran ♀ – Call for Family: a Nidoran ♂ or Nidoran ♀ from the deck onto the Bench.
  'dp2-91': {
    'Call for Family': {
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicNamed', name: ['Nidoran ♂', 'Nidoran ♀'], toBench: true, optional: true })),
    },
  },
  // Spheal – Rollout: base 40 the turn after a heads Hustle.
  'dp2-102': {
    Rollout: { run: (ctx) => void ctx.hit(boostedNow(ctx, 'Rollout') ? 40 : 10) },
    Hustle: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Hustle did nothing.');
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Rollout', turn: ctx.turn + 2 };
        ctx.log("Spheal's Rollout's base damage is 40 next turn.");
      },
    },
  },
  // Surskit – Sleep Inducer: as Diamond & Pearl Combee's Soliciting Nectar.
  'dp2-104': { 'Sleep Inducer': same(() => DP1['dp1-79']?.['Soliciting Nectar']) },
  // Teddiursa – Sweet Palm: a damage counter off the Defending Pokémon first.
  'dp2-105': {
    'Sweet Palm': {
      run(ctx) {
        if (ctx.defender.damage >= 10 && ctx.canAffect(ctx.opp, ctx.defender)) {
          ctx.defender.damage -= 10;
          ctx.log(`Removed a damage counter from ${ctx.defenderDef.name}.`, ctx.opp.id);
        }
        ctx.hit(30);
      },
    },
  },
  // Electivire LV.X – Pulse Barrier: the opponent's Pokémon Tools and Stadium discarded; if any were, all effects of attacks on it prevented next turn.
  'dp2-121': {
    'Pulse Barrier': {
      run(ctx) {
        ctx.hit(50);
        let gone = 0;
        for (const p of inPlay(ctx.opp)) {
          while ((p.attached ?? []).some((a) => a.tool)) {
            discardTool(ctx.state, ctx.opp, p);
            gone++;
          }
        }
        if (ctx.state.stadium?.owner === ctx.opp.id) {
          discardStadium(ctx);
          gone++;
        }
        if (gone) ctx.protect('preventAll');
      },
    },
  },
  // Magmortar LV.X – Flame Bluster: 2 Fire Energy discarded, 100 to one of the opponent's Pokémon; not again next turn.
  'dp2-123': {
    'Flame Bluster': {
      discard: { count: 2, type: 'fire' },
      ...snipe(100, (ctx) => notNextTurn(ctx, 'Flame Bluster')),
    },
  },
};

