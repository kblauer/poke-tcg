// Great Encounters (dp4) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" discards are asked before the attack; Flame Kick, Black Fire and Huntail's Threaten and Drop discard
// the first Energy cards that fit; Twister and Arm Thrust discard the first Energy cards on the Defending Pokémon (Arm Thrust's
// is picked); Guzzle attaches up to 2 basic Water Energy cards from the hand by itself; Pick Out turns over a random face-down
// Prize card of the side picked (they're face down, so picking one is blind); Smash Short shows the opponent's hand in the log;
// Unown L's Hidden Power puts the cards back so the first picked is on top; Sweet Kiss asks the opponent.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, isPokemonCard, lookupCard, namesMatch } from '../cards.js';
import { counts, energyPool, isSpecialEnergy, type InPlayPokemon, type Target } from '../engine.js';
import { pokemonPower } from '../powers.js';
import { nextRandom, shuffle } from '../rng.js';
import { clearSpecialConditions, evolvedFromName, inPlayDef, pokemonName } from '../status.js';
import { basicEnergyOn, benchedSlots, damageOpponent, energyCards, inPlay, lure, opponentBenchChoice, opponentSwitches, opponentTargets, same } from './common.js';
import { DP1 } from './dp1.js';
import { DP3 } from './dp3.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX11 } from './ex11.js';
import { trainerEffect } from './index.js';
import { healUpTo } from './si1.js';

/** A yes-or-no question asked before the attack: yes first. */
const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
/** The player's Pokémon in play, as targets. */
const ownTargets = (s: { attacker: InPlayPokemon; ownBench: (InPlayPokemon | null)[] }, fits: (p: InPlayPokemon) => boolean = () => true): Target[] => [
  ...(fits(s.attacker) ? ['active' as const] : []),
  ...benchedSlots(s.ownBench).filter((i) => fits(s.ownBench[i]!)),
];
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
/** The attacker's Energy cards of a type, basic or Special. */
const typed = (ctx: AttackContext, type: Parameters<typeof energyCardOf>[2]) => ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, type));
/** How much Energy of a type a Pokémon has. */
const hasEnergy = (ctx: AttackContext, p: InPlayPokemon, type: Parameters<typeof counts>[1]) => energyPool(p, ctx.state.cards).some((e) => counts(e, type));
/** "During your next turn, this attack's base damage is …" (Psych Up): the boosted damage on the turn it's set for. */
const boosted = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
/** Switch in one of the opponent's Benched Pokémon, then `then` (Sweet Temptation). */
const lureThen = (then: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in"),
  run(ctx) {
    if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
    then(ctx);
  },
});
/** A coin; heads, a search of the deck (Present, Find a Friend). */
const flipSearch = (source: string, filter: 'any' | 'pokemon'): AttackEffect => ({
  run(ctx) {
    if (!ctx.flip() || !ctx.me.deck.length) return ctx.log(`${source} did nothing.`);
    ctx.pend({ kind: 'pickFromDeck', source, filter, reveal: filter === 'pokemon', optional: true });
  },
});

export const DP4: Record<string, Record<string, AttackEffect>> = {
  // Blaziken – Fire Dance: as EX Delta Species Blaziken's. Flame Kick: 2 Fire Energy discarded, 80 to one of the opponent's Pokémon.
  'dp4-1': {
    'Fire Dance': same(() => EX11['ex11-14']?.['Fire Dance']),
    'Flame Kick': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 80 damage to"),
      run(ctx) {
        discardOwn(ctx, typed(ctx, 'fire').slice(0, 2));
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 80);
      },
    },
  },
  // Cresselia – Moon Twinkle: 2 damage counters off it with a Stadium in play. Lunar Dance: may discard 2 Energy cards to heal a Benched Pokémon.
  'dp4-2': {
    'Moon Twinkle': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.state.stadium) healUpTo(ctx, ctx.me, ctx.attacker, 20);
      },
    },
    'Lunar Dance': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage > 0);
        return options.length && energyCards(s.attacker).length >= 2 ? [{ kind: 'ownBench', options: [-1, ...options], optional: true, prompt: 'Lunar Dance: you may discard 2 Energy cards from Cresselia to heal one of your Benched Pokémon' }] : [];
      },
      run(ctx) {
        ctx.hit(50);
        const slot = ctx.choices.ownBenchSlot;
        const p = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        if (!p) return;
        discardOwn(ctx, energyCards(ctx.attacker).slice(0, 2));
        healUpTo(ctx, ctx.me, p, p.damage);
      },
    },
  },
  // Darkrai – Darkness Pursuit: base 100 against Cresselia.
  'dp4-3': { 'Darkness Pursuit': { run: (ctx) => void ctx.hit(namesMatch(ctx.defenderDef.name, 'Cresselia') ? 100 : 50) } },
  // Darkrai – Darkness Roar: may have the opponent switch. Sleep Hole: 40 more against an Asleep Pokémon; otherwise it falls Asleep.
  'dp4-4': {
    'Darkness Roar': {
      choices: (s) => (benchedSlots(s.opponentBench).length ? [may('Darkness Roar: have your opponent switch the Defending Pokémon?')] : []),
      run(ctx) {
        ctx.hit(10);
        if (ctx.choices.boost) opponentSwitches(ctx, 'Darkness Roar');
      },
    },
    'Sleep Hole': {
      run(ctx) {
        const asleep = ctx.defender.condition === 'asleep';
        ctx.hit(asleep ? 80 : 40);
        if (!asleep) ctx.inflict('asleep');
      },
    },
  },
  // Pachirisu – Smash Short: 30 more against a Pokémon Tool, which is discarded with the Pokémon Tools of its name in the opponent's hand.
  'dp4-5': {
    'Smash Short': {
      run(ctx) {
        const tool = (ctx.defender.attached ?? []).find((a) => a.tool);
        if (!tool) return void ctx.hit(10);
        ctx.hit(40);
        ctx.affectDefender(() => {
          ctx.defender.attached = (ctx.defender.attached ?? []).filter((a) => a !== tool);
          ctx.opp.discard.push(tool.card);
          const name = lookupCard(ctx.state.cards, tool.card.defId).name;
          const same = ctx.opp.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).name === name);
          ctx.opp.hand = ctx.opp.hand.filter((c) => !same.includes(c));
          ctx.opp.discard.push(...same);
          ctx.log(`Discarded ${name}${same.length ? `, and ${same.length} more from the opponent's hand` : ''}. The opponent's hand: ${ctx.opp.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
        });
      },
    },
  },
  // Tangrowth – Power Whip: 10 for each basic Energy card on it, to one of the opponent's Pokémon.
  'dp4-10': {
    'Power Whip': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 10 * basicEnergyOn(ctx.state.cards, ctx.attacker).length),
    },
  },
  // Togekiss – Air Scroll: heads, 30 more; tails, 3 damage counters off it.
  'dp4-11': {
    'Air Scroll': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(70);
        ctx.hit(40);
        healUpTo(ctx, ctx.me, ctx.attacker, 30);
      },
    },
  },
  // Altaria – Cotton Cloud: 30 less damage from the opponent's Evolved Pokémon next turn.
  'dp4-12': {
    'Cotton Cloud': {
      run(ctx) {
        ctx.hit(60);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 30, until: ctx.turn + 1, evolvedOnly: true };
      },
    },
  },
  // Beedrill – Band Attack: 30 for each of the player's Beedrill in play.
  'dp4-13': { 'Band Attack': { run: (ctx) => void ctx.hit(30 * inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Beedrill')).length) } },
  // Butterfree – Parallel Drain: as many damage counters off one of the player's Pokémon (picked first) as the damage done.
  'dp4-14': {
    'Parallel Drain': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to heal by the damage done' }],
      run(ctx) {
        const done = ctx.hit(30);
        const p = mine(ctx, ctx.choices.ownTarget ?? 'active');
        if (p && done) healUpTo(ctx, ctx.me, p, done);
      },
    },
  },
  // Dialga – Flash Cannon: as Diamond & Pearl Dialga's.
  'dp4-16': { 'Flash Cannon': same(() => DP1['dp1-1']?.['Flash Cannon']) },
  // Exploud – Ambient Noise: first coin, 50 to the Defending Pokémon or 20 to each Benched; second, Confused or no Trainer cards next turn.
  'dp4-17': {
    'Ambient Noise': {
      run(ctx) {
        const [first, second] = [ctx.flip(), ctx.flip()];
        if (first) ctx.hit(50);
        else ctx.benchDamage(ctx.opp, 20);
        if (second) return void ctx.inflict('confused');
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer, Supporter or Stadium cards next turn.", ctx.opp.id);
      },
    },
  },
  // Houndoom – Black Fire: may discard a Fire Energy (Burned) or a Darkness Energy (30 more).
  'dp4-18': {
    'Black Fire': {
      choices(s): ChoiceSpec[] {
        const fire = s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'fire'));
        const dark = s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'darkness'));
        if (!fire && !dark) return [];
        const options = [0, ...(fire ? [1] : []), ...(dark ? [2] : [])];
        const labels = ["Don't discard", ...(fire ? ['Discard a Fire Energy: Burned'] : []), ...(dark ? ['Discard a Darkness Energy: 30 more damage'] : [])];
        return [{ kind: 'amount', options, labels, prompt: 'Black Fire: discard an Energy card?' }];
      },
      run(ctx) {
        const pick = ctx.choices.amount ?? 0;
        const card = pick ? typed(ctx, pick === 1 ? 'fire' : 'darkness')[0] : undefined;
        if (card) discardOwn(ctx, [card]);
        ctx.hit(card && pick === 2 ? 70 : 40);
        if (card && pick === 1) ctx.inflict('burned');
      },
    },
  },
  // Hypno – Dream Catcher: against an Asleep Pokémon, every damage counter moved from Hypno to it.
  'dp4-19': {
    'Dream Catcher': {
      run(ctx) {
        if (ctx.defender.condition !== 'asleep' || !ctx.attacker.damage || !ctx.canAffect(ctx.opp, ctx.defender)) return ctx.log('Dream Catcher did nothing.');
        ctx.defender.damage += ctx.attacker.damage;
        ctx.log(`Moved ${ctx.attacker.damage / 10} damage counters to ${ctx.defenderDef.name}.`);
        ctx.attacker.damage = 0;
      },
    },
  },
  // Kingler – Scissor Blow: 30 to itself if it Knocks Out the Defending Pokémon.
  'dp4-20': {
    'Scissor Blow': {
      run(ctx) {
        ctx.hit(80);
        if (ctx.defender.damage >= inPlayDef(ctx.state.cards, ctx.defender).hp) ctx.selfDamage(30);
      },
    },
  },
  // Lapras – Carry In: a Pokémon Tool, a Supporter and a basic Energy card from the deck, shown.
  'dp4-21': {
    'Carry In': {
      run(ctx) {
        if (!ctx.me.deck.length) return ctx.log('Your deck is empty.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Carry In', filter: 'tool', reveal: true, optional: true });
        (ctx.state.queuedChoices ??= []).push(
          { player: ctx.me.id, source: 'Carry In', kind: 'pickFromDeck', filter: 'supporter', reveal: true, optional: true },
          { player: ctx.me.id, source: 'Carry In', kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true, optional: true },
        );
      },
    },
  },
  // Latias – Miraculous Light: 2 damage counters and every Special Condition off it.
  'dp4-22': {
    'Miraculous Light': {
      run(ctx) {
        ctx.hit(10);
        healUpTo(ctx, ctx.me, ctx.attacker, 20);
        clearSpecialConditions(ctx.attacker);
      },
    },
  },
  // Latios – Energy Draw: heads, a basic Energy card from the deck attached to it.
  'dp4-23': {
    'Energy Draw': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip() && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Energy Draw', filter: 'basicEnergy', attachToActive: true, optional: true });
      },
    },
  },
  // Mawile – Pick Out: a face-down Prize card turned face up; a Supporter's effect used.
  'dp4-24': {
    'Pick Out': {
      choices(s): ChoiceSpec[] {
        const own = (s.ownPrizes ?? 0) > 0;
        const opp = (s.opponentPrizes ?? 0) > 0;
        return own && opp ? [{ kind: 'side', options: ['own', 'opponent'], prompt: "Pick Out: one of your face-down Prize cards, or your opponent's?" }] : [];
      },
      run(ctx) {
        const faceDown = (p: typeof ctx.me) => p.prizes.filter((c) => !p.faceUpPrizes?.includes(c.uid));
        const side = ctx.choices.side ?? (faceDown(ctx.me).length ? 'own' : 'opponent');
        const owner = side === 'own' ? ctx.me : ctx.opp;
        const down = faceDown(owner);
        if (!down.length) return ctx.log('Pick Out did nothing.');
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        const card = down[Math.floor(r * down.length)]!;
        (owner.faceUpPrizes ??= []).push(card.uid);
        ctx.log(`Turned a Prize card face up: ${lookupCard(ctx.state.cards, card.defId).name}.`, owner.id);
        if (trainerEffect(card.defId)?.supporter) ctx.pend({ kind: 'supernatural', source: 'Pick Out', fromPrizes: side === 'own' ? 'own' : 'opp', cardUid: card.uid, choices: {} });
      },
    },
  },
  // Milotic – Twister: 2 coins, both tails nothing; an Energy card of the Defending Pokémon discarded for each heads.
  'dp4-25': {
    Twister: {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Twister did nothing.');
        ctx.hit(50);
        for (const card of energyCards(ctx.defender).slice(0, heads)) ctx.discardDefenderEnergy(card.uid);
      },
    },
  },
  // Palkia – Spacial Rend, Transback: as Diamond & Pearl Palkia's.
  'dp4-26': { 'Spacial Rend': same(() => DP1['dp1-11']?.['Spacial Rend']), Transback: same(() => DP1['dp1-11']?.Transback) },
  // Primeape – Whump: Primeape Confused; heads, the Defending Pokémon can't attack next turn.
  'dp4-27': {
    Whump: {
      run(ctx) {
        ctx.hit(50);
        ctx.confuseSelf();
        if (ctx.flip()) ctx.affectDefender((e) => (e.noAttack = ctx.turn + 1));
      },
    },
  },
  // Slowking – Psych Up: base 60 next turn.
  'dp4-28': {
    'Psych Up': {
      run(ctx) {
        ctx.hit(boosted(ctx, 'Psych Up') ? 60 : 30);
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Psych Up', turn: ctx.turn + 2 };
      },
    },
  },
  // Unown H – Hidden Power: a card from the hand discarded (nothing without one).
  'dp4-29': {
    'Hidden Power': {
      run(ctx) {
        if (!ctx.me.hand.length) return ctx.log('Hidden Power did nothing: your hand is empty.');
        ctx.hit(30);
        ctx.pend({ kind: 'discardFromHand', source: 'Hidden Power', count: 1 });
      },
    },
  },
  // Wailord – Sink Deep: with damage counters on it, Wailord falls Asleep.
  'dp4-30': {
    'Sink Deep': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.attacker.damage) ctx.sleepSelf();
      },
    },
  },
  // Wigglytuff – Balloon Attack: 20 more with Igglybuff under it.
  'dp4-32': { 'Balloon Attack': { run: (ctx) => void ctx.hit(evolvedFromName(ctx.state.cards, ctx.attacker, 'Igglybuff') ? 60 : 40) } },
  // Arbok – Deadly Poison: 40 more against a Poisoned Pokémon; otherwise Poisoned.
  'dp4-33': {
    'Deadly Poison': {
      run(ctx) {
        const poisoned = !!ctx.defender.poison;
        ctx.hit(poisoned ? 50 : 10);
        if (!poisoned) ctx.inflict('poisoned');
      },
    },
  },
  // Delibird – Present; Togepi – Find a Friend: heads, a card (a Pokémon, shown) from the deck.
  'dp4-36': { Present: flipSearch('Present', 'any') },
  'dp4-88': { 'Find a friend': flipSearch('Find a Friend', 'pokemon') },
  // Gorebyss – Sweet Temptation: a Benched Pokémon switched in, 10 to it. Psychic Snap: with Psychic Energy, 20 more and Confused.
  'dp4-38': {
    'Sweet Temptation': lureThen((ctx) => void ctx.hit(10)),
    'Psychic Snap': {
      run(ctx) {
        const psychic = hasEnergy(ctx, ctx.attacker, 'psychic');
        ctx.hit(psychic ? 50 : 30);
        if (psychic) ctx.inflict('confused');
      },
    },
  },
  // Hariyama – Spirited Throw: base 80 with fewer HP left than the Defending Pokémon.
  'dp4-41': { 'Spirited Throw': { run: (ctx) => void ctx.hit(inPlayDef(ctx.state.cards, ctx.attacker).hp - ctx.attacker.damage < ctx.defenderDef.hp - ctx.defender.damage ? 80 : 50) } },
  // Huntail – Threaten and Drop: with Darkness Energy, 20 more and a Special Energy card of the Defending Pokémon discarded.
  'dp4-42': {
    'Threaten and Drop': {
      run(ctx) {
        if (!hasEnergy(ctx, ctx.attacker, 'darkness')) return void ctx.hit(30);
        ctx.hit(50);
        const special = ctx.defender.energy.find((e) => isSpecialEnergy(ctx.state.cards, e));
        if (special) ctx.discardDefenderEnergy(special.uid);
      },
    },
  },
  // Linoone – Switcheroo: a Pokémon Tool moved from one of the opponent's Pokémon to another of theirs without one.
  'dp4-43': {
    Switcheroo: {
      choices(s): ChoiceSpec[] {
        const all = [['active', s.defender], ...benchedSlots(s.opponentBench).map((i) => [i, s.opponentBench[i]!])] as [Target, InPlayPokemon][];
        const tooled = all.filter(([, p]) => (p.attached ?? []).some((a) => a.tool)).map(([t]) => t);
        const free = all.filter(([, p]) => !(p.attached ?? []).some((a) => a.tool)).map(([t]) => t);
        return tooled.length && free.length
          ? [
              { kind: 'opponentPokemon', options: tooled, prompt: "Choose one of your opponent's Pokémon to move its Pokémon Tool from" },
              { kind: 'opponentPokemonTo', options: free, prompt: 'Choose the Pokémon to move it to' },
            ]
          : [];
      },
      run(ctx) {
        const from = ctx.choices.oppTarget === undefined ? null : theirs(ctx, ctx.choices.oppTarget);
        const to = ctx.choices.oppTo === undefined ? null : theirs(ctx, ctx.choices.oppTo);
        const tool = from?.attached?.find((a) => a.tool);
        if (!from || !to || !tool || (to.attached ?? []).some((a) => a.tool) || !ctx.canAffect(ctx.opp, from) || !ctx.canAffect(ctx.opp, to)) return ctx.log('Switcheroo did nothing.');
        from.attached = from.attached!.filter((a) => a !== tool);
        (to.attached ??= []).push(tool);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, tool.card.defId).name} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
      },
    },
  },
  // Magcargo – Lava Plume: may discard the top card of the deck to Burn the Defending Pokémon.
  'dp4-45': {
    'Lava Plume': {
      choices: () => [may('Lava Plume: discard the top card of your deck to Burn the Defending Pokémon?')],
      run(ctx) {
        ctx.hit(60);
        if (!ctx.choices.boost || !ctx.me.deck.length) return;
        ctx.me.discard.push(ctx.me.deck.shift()!);
        ctx.log('Discarded the top card of the deck.');
        ctx.inflict('burned');
      },
    },
  },
  // Marshtomp – Muddy Bomb: 30 to one of the opponent's Pokémon, 10 to each of the others.
  'dp4-46': {
    'Muddy Bomb': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 30 damage to"),
      run(ctx) {
        const picked = ctx.choices.oppTarget ?? 'active';
        for (const t of ['active', ...benchedSlots(ctx.opp.bench)] as Target[]) damageOpponent(ctx, t, t === picked ? 30 : 10);
      },
    },
  },
  // Pelipper – Guzzle: up to 2 basic Water Energy cards from the hand attached, 2 damage counters off for each. Jet Return:
  // 30 for each Energy card, which are then shuffled into the deck.
  'dp4-48': {
    Guzzle: {
      run(ctx) {
        const water = ctx.me.hand.filter((c) => energyCardOf(ctx.state.cards, c, 'water') && isBasicEnergy(lookupCard(ctx.state.cards, c.defId))).slice(0, 2);
        if (!water.length) return ctx.log('Guzzle did nothing.');
        ctx.me.hand = ctx.me.hand.filter((c) => !water.includes(c));
        ctx.attacker.energy.push(...water);
        ctx.log(`Attached ${water.length} Water Energy card${water.length === 1 ? '' : 's'} to Pelipper.`);
        healUpTo(ctx, ctx.me, ctx.attacker, 20 * water.length);
      },
    },
    'Jet Return': {
      run(ctx) {
        const cards = energyCards(ctx.attacker);
        ctx.hit(30 * cards.length);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !cards.includes(e));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...cards], ctx.state.rngState);
        if (cards.length) ctx.log('Shuffled the Energy cards on Pelipper into the deck.');
      },
    },
  },
  // Relicanth – Primal Calling: up to 3 Trainer cards with Fossil in their names from the deck, shown.
  'dp4-51': { 'Primal Calling': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Primal Calling', filter: 'fossil', count: 3, reveal: true, optional: true })) } },
  // Seviper – Tail Blade: heads, no Trainer (Item) cards for the opponent next turn.
  'dp4-52': {
    'Tail Blade': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.opp.noItemsUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer cards next turn.", ctx.opp.id);
      },
    },
  },
  // Togetic – Sweet Kiss: the opponent may draw a card.
  'dp4-55': {
    'Sweet Kiss': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.opp.deck.length) ctx.opponentChooses({ source: 'Sweet Kiss', kind: 'drawCount', max: 1 });
      },
    },
  },
  // Unown F – Hidden Power: may flip; tails nothing, heads base 30.
  'dp4-56': {
    'Hidden Power': {
      choices: () => [may('Hidden Power: flip a coin (tails: nothing; heads: 30 damage instead of 10)?')],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(10);
        if (ctx.flip()) ctx.hit(30);
        else ctx.log('Hidden Power did nothing.');
      },
    },
  },
  // Unown G – Hidden Power: base 10 with damage counters on it.
  'dp4-57': { 'Hidden Power': { run: (ctx) => void ctx.hit(ctx.attacker.damage ? 10 : 50) } },
  // Zangoose – Cutting Claw: 50 more with Seviper in play on the opponent's side.
  'dp4-59': { 'Cutting Claw': { run: (ctx) => void ctx.hit(inPlay(ctx.opp).some((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Seviper')) ? 90 : 40) } },
  // Baltoy – Psychic Balance: as Secret Wonders Mew's.
  'dp4-60': { 'Psychic Balance': same(() => DP3['dp3-15']?.['Psychic Balance']) },
  // Glameow – Captivate; Tangela – Vine Invite: a Benched Pokémon switched in.
  'dp4-68': { Captivate: lure },
  'dp4-87': { 'Vine Invite': lure },
  // Igglybuff – Inquire: a card drawn, 2 more without a Supporter played this turn.
  'dp4-70': { Inquire: { run: (ctx) => ctx.draw(ctx.me.supporterTurn === ctx.turn ? 1 : 3) } },
  // Illumise – Firefly Scent: Asleep if the Defending Pokémon has a Poké-Body.
  'dp4-71': {
    'Firefly Scent': {
      run(ctx) {
        ctx.hit(30);
        if (pokemonPower(ctx.defender)?.body) ctx.inflict('asleep');
      },
    },
  },
  // Koffing – Smogscreen: Poisoned, and its attacks next turn need heads.
  'dp4-74': {
    Smogscreen: {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('poisoned');
        ctx.affectDefender((e) => {
          e.smokescreen = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name}'s attacks next turn need heads.`, ctx.opp.id);
        });
      },
    },
  },
  // Luvdisc – Rendezvous: the top card into the hand, shown; a Pokémon draws 2 more. Synchro Dance: 20 more with as much Energy as the Defending Pokémon.
  'dp4-77': {
    Rendezvous: {
      run(ctx) {
        const card = ctx.me.deck.shift();
        if (!card) return ctx.log('Your deck is empty.');
        ctx.me.hand.push(card);
        ctx.log(`Revealed ${lookupCard(ctx.state.cards, card.defId).name} and put it into the hand.`);
        if (isPokemonCard(lookupCard(ctx.state.cards, card.defId))) ctx.draw(2);
      },
    },
    'Synchro Dance': { run: (ctx) => void ctx.hit(energyAmount(ctx, ctx.attacker) === energyAmount(ctx, ctx.defender) ? 30 : 10) },
  },
  // Makuhita – Arm Thrust: tails nothing; heads, an Energy card of the Defending Pokémon discarded.
  'dp4-78': {
    'Arm Thrust': {
      choices: (s): ChoiceSpec[] => (energyCards(s.defender).length ? [{ kind: 'defenderEnergy', options: energyCards(s.defender), prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Arm Thrust did nothing.');
        ctx.hit(40);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Porygon – Calculate: the top 3 cards put back in any order.
  'dp4-81': { Calculate: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'arrangeTop', source: 'Calculate', count: Math.min(3, ctx.me.deck.length) })) } },
  // Solrock – Sol Charge: a basic Energy card from the discard pile attached to one of the player's Benched Pokémon.
  'dp4-85': {
    'Sol Charge': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.ownBench);
        return options.length && !s.discardsLocked ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to attach a basic Energy card to' }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || !ctx.me.bench[slot] || !basicInDiscard(ctx)) return;
        ctx.pend({ kind: 'attachFromDiscard', source: 'Sol Charge', count: 1, target: slot });
      },
    },
  },
  // Unown L – Hidden Power: up to 2 cards from either player's discard pile on top of that player's deck.
  'dp4-91': {
    'Hidden Power': {
      choices(s, c): ChoiceSpec[] {
        if (s.discardsLocked) return [];
        const own = s.ownDiscard ?? [];
        const opp = s.opponentDiscard ?? [];
        const sides = [...(own.length ? ['own' as const] : []), ...(opp.length ? ['opponent' as const] : [])];
        if (!sides.length) return [];
        const specs: ChoiceSpec[] = sides.length > 1 ? [{ kind: 'side', options: sides, prompt: "Hidden Power: your discard pile or your opponent's?" }] : [];
        const side = c.side ?? (sides.length === 1 ? sides[0] : undefined);
        if (side) specs.push({ kind: 'ownDiscard', min: 0, max: 2, options: side === 'own' ? own : opp, prompt: `Choose up to 2 cards to put on top of ${side === 'own' ? 'your' : "your opponent's"} deck (the first on top)` });
        return specs;
      },
      run(ctx) {
        const owner = (ctx.choices.side ?? (ctx.me.discard.length ? 'own' : 'opponent')) === 'own' ? ctx.me : ctx.opp;
        const picked = (ctx.choices.discardUids ?? []).map((uid) => owner.discard.find((c) => c.uid === uid)).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 2);
        if (!picked.length) return ctx.log('Hidden Power did nothing.');
        owner.discard = owner.discard.filter((c) => !picked.includes(c));
        owner.deck.unshift(...picked);
        ctx.log(`Put ${picked.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(' and ')} on top of the deck.`, owner.id);
      },
    },
  },
  // Zigzagoon – Pull Out: a card from the discard pile on top of the deck, shown.
  'dp4-96': { 'Pull Out': { run: (ctx) => void (ctx.me.discard.length && ctx.pend({ kind: 'pickFromDiscard', source: 'Pull Out' })) } },
  // Cresselia LV.X – Moon Skip: 1 more Prize card if it Knocks Out the Defending Pokémon.
  'dp4-103': {
    'Moon Skip': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).morePrize = ctx.turn;
        ctx.hit(40);
      },
    },
  },
  // Darkrai LV.X – Endless Darkness: Asleep, 2 coins between turns (engine.ts).
  'dp4-104': {
    'Endless Darkness': {
      run(ctx) {
        ctx.hit(40);
        ctx.inflict('asleep');
        if (ctx.defender.condition === 'asleep') ctx.affectDefender((e) => (e.endlessDarkness = true));
      },
    },
  },
  // Palkia LV.X – Hydro Reflect: may move all its Energy cards to the Benched Pokémon, any way.
  'dp4-106': {
    'Hydro Reflect': {
      choices: (s) => (benchedSlots(s.ownBench).length && energyCards(s.attacker).length ? [may('Hydro Reflect: move all Energy cards on Palkia to your Benched Pokémon?')] : []),
      run(ctx) {
        ctx.hit(60);
        const cards = energyCards(ctx.attacker);
        if (!ctx.choices.boost || !cards.length || !ctx.me.bench.some(Boolean)) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !cards.includes(e));
        ctx.pend({ kind: 'distributeEnergy', source: 'Hydro Reflect', cards });
      },
    },
  },
};

/** A basic Energy card in the player's discard pile (Sol Charge). */
function basicInDiscard(ctx: AttackContext) {
  return ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)));
}
