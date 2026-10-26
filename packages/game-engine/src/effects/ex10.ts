// EX Unseen Forces (ex10) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: Spiky Shell's damage counters go only on the Pokémon still Active at the end of the opponent's
// next turn (as Dark Seed's); Meta Voltage damages Raikou ☆ too, never with Weakness; Psyloop counts as EX Deoxys's (the
// opponent's Pokémon Tools and other attached Trainer cards, and the Stadium if they played it).
// From the text: "the Defending Pokémon" with a switch first is the new one (Spider Trap); Night Song puts the Defending
// Pokémon to sleep as EX Hidden Legends Hypno's Sleep Inducer does; Pop's Energy cards go to the player's Benched Pokémon
// one at a time, as they like; Bouncy Move's damage counters are the player's pick, 0 to 5; Healing Milk's Pokémon for each
// heads are picked before the flips.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { hasType, isBasicEnergy, lookupCard, namesMatch, type EnergyType } from '../cards.js';
import { isEnergyCardOf, isSpecialEnergy } from '../engine.js';
import { clearSpecialConditions, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { shuffle } from '../rng.js';
import { trainerEffect } from './index.js';
import { benchedSlots, guardNext, opponentBenchChoice } from './common.js';
import { copyAttack } from './ecard2.js';
import { discardOwn, inPlay, putCounters, typeCards } from './ex2.js';
import { lureIn, snipe } from './ex6.js';
import { dragOff, trainersInPlay } from './ex8.js';
import { discardFree } from './neo3.js';
import { healUpTo, TYPES } from './si1.js';

/** The types of basic Energy cards attached to the Pokémon (Multi Burn, Rainbow Burn). */
const basicTypes = (ctx: AttackContext) =>
  new Set(ctx.attacker.energy.flatMap((e) => {
    const d = lookupCard(ctx.state.cards, e.defId);
    return !e.provides && isBasicEnergy(d) && d.kind === 'energy' ? [d.energyType] : [];
  })).size;

/** Multi Burn, Multi Pulse, Multi Bubble: with 3 or more types of basic Energy cards attached, 20 more and `affliction`. */
const multi = (affliction: 'burned' | 'confused' | 'asleep'): AttackEffect => ({
  run(ctx) {
    if (basicTypes(ctx) < 3) return void ctx.hit(40);
    ctx.hit(60);
    ctx.inflict(affliction);
  },
});

/** Fire Dance: a Fire Energy card from the discard pile to one of the player's Pokémon, clicked next. */
export const fireDance = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (ctx.me.discard.some((c) => isEnergyCardOf(c, ctx.state.cards, 'fire') && lookupCard(ctx.state.cards, c.defId).kind === 'energy') && discardFree(ctx)) {
      ctx.pend({ kind: 'attachFromDiscard', source: 'Fire Dance', count: 1, type: 'fire' });
    }
  },
});


/** Next turn, this attack (by `key`) does more: Extra Comet Punch, Pulse Blast, Glide. Set for the turn after. */
const nextTurn = (ctx: AttackContext, key: string) => {
  (ctx.attacker.effects ??= {}).boostedAttack = { attack: key, turn: ctx.turn + 2 };
};
const boosted = (ctx: AttackContext, key: string) => ctx.attacker.effects?.boostedAttack?.attack === key && ctx.attacker.effects.boostedAttack.turn === ctx.turn;

/** The player has fewer Prize cards left than the opponent (the Gold Stars' attacks). */
const behind = (ctx: AttackContext) => ctx.me.prizes.length < ctx.opp.prizes.length;

/** Removes a Pokémon's Special Conditions (Hyper Healing). */
function cure(ctx: AttackContext, p: AttackContext['attacker']) {
  if (!hasSpecialCondition(p)) return;
  clearSpecialConditions(p);
  ctx.log(`${pokemonName(ctx.state, p)} is no longer affected by Special Conditions.`);
}

/** Up to `count` of the opponent's Benched Pokémon, `damage` each (Double Attack). */
const benchMany = (damage: number, count: number): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = benchedSlots(s.opponentBench);
    return options.length ? [{ kind: 'opponentBenchMany', count: Math.min(count, options.length), options, prompt: `Choose ${count} of your opponent's Benched Pokémon to do ${damage} damage to` }] : [];
  },
  run(ctx) {
    for (const slot of ctx.choices.benchSlots ?? []) ctx.damageBenched(ctx.opp, slot, damage);
  },
});

export const EX10: Record<string, Record<string, AttackEffect>> = {
  // Ampharos – Miraculous Thunder: may discard all its Lightning Energy; then Burned and Confused.
  'ex10-1': {
    'Miraculous Thunder': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'lightning')) ? [{ kind: 'boost', options: [true, false], prompt: 'Discard all Lightning Energy attached to Ampharos to make the Defending Pokémon Burned and Confused?' }] : []),
      run(ctx) {
        ctx.hit(50);
        if (!ctx.choices.boost) return;
        discardOwn(ctx, typeCards(ctx.state.cards, ctx.attacker, 'lightning'));
        ctx.inflict('burned');
        ctx.inflict('confused');
      },
    },
  },
  // Ariados – Spider Trap: one of the opponent's Benched Pokémon may be switched in first; Asleep and Poisoned.
  'ex10-2': {
    'Spider Trap': {
      choices: (s): ChoiceSpec[] => opponentBenchChoice(s, "You may choose one of your opponent's Benched Pokémon to switch in first").map((c) => ({ ...c, optional: true }) as ChoiceSpec),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.inflict('asleep');
        ctx.inflict('poisoned');
      },
    },
  },
  // Bellossom – Green Dance: up to 2 Grass Pokémon from the deck, shown; with any found, it may switch with a Benched Pokémon
  // (asked first). Full Bloom: 50 more with 3 Bellossom in play.
  'ex10-3': {
    'Green Dance': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, optional: true, prompt: 'If you find any Grass Pokémon, you may switch Bellossom with one of your Benched Pokémon: choose it, or skip' }] : [];
      },
      run(ctx) {
        const grass = ctx.me.deck.some((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'pokemon' && !d.trainerText && hasType(d, 'grass');
        });
        if (!grass) {
          if (ctx.me.deck.length) [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
          return ctx.log('There are no Grass Pokémon in the deck.');
        }
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
        ctx.pend({ kind: 'pickFromDeck', source: 'Green Dance', filter: 'pokemonType', type: 'grass', count: 2, reveal: true, optional: true });
      },
    },
    'Full Bloom': { run: (ctx) => void ctx.hit(inPlay(ctx.me).filter((p) => namesMatch(inPlayDef(ctx.state.cards, p).name, 'Bellossom')).length >= 3 ? 100 : 50) },
  },
  // Feraligatr – Pull Away: with 5 or more cards in their hand, the opponent discards down to 4; Tonnage: may do 30 more and 30 to itself.
  'ex10-4': {
    'Pull Away': {
      run(ctx) {
        ctx.hit(30);
        const over = ctx.opp.hand.length - 4;
        if (ctx.opp.hand.length >= 5) ctx.opponentChooses({ kind: 'discardFromHand', source: 'Pull Away', count: over });
      },
    },
    Tonnage: {
      choices: (): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt: 'Do 30 more damage, and 30 damage to Feraligatr?' }],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 80 : 50);
        if (ctx.choices.boost) ctx.selfDamage(30);
      },
    },
  },
  // Flareon – Fire Dance; Multi Burn.
  'ex10-5': { 'Fire Dance': fireDance(20), 'Multi Burn': multi('burned') },
  // Forretress – Spiky Shell: 3 damage counters on the Defending Pokémon at the end of the opponent's next turn, if it's still
  // Active (agreed, as Dark Seed); Pop: 7 damage counters on it, and its Energy cards to the player's Benched Pokémon.
  'ex10-6': {
    'Spiky Shell': {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => {
          e.delayed = { counters: 3, turn: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name} will have 3 damage counters put on it at the end of the next turn.`, ctx.opp.id);
        });
      },
    },
    Pop: {
      run(ctx) {
        ctx.hit(100);
        ctx.attacker.damage += 70;
        ctx.log(`Put 7 damage counters on ${ctx.attackerDef.name}.`);
        const cards = ctx.attacker.energy.filter((e) => !e.provides);
        if (!cards.length || !ctx.me.bench.some(Boolean)) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e.provides);
        ctx.pend({ kind: 'distributeEnergy', source: 'Pop', cards });
      },
    },
  },
  // Jolteon – Attract Current: heads, a Lightning Energy card from the deck to one of the player's Pokémon; Multi Pulse.
  'ex10-8': {
    'Attract Current': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip() && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Attract Current', filter: 'energyType', type: 'lightning', attach: true, optional: true });
      },
    },
    'Multi Pulse': multi('confused'),
  },
  // Meganium – Bouncy Move: up to 5 damage counters on itself, 10 more for each.
  'ex10-9': {
    'Bouncy Move': {
      choices: (): ChoiceSpec[] => [{ kind: 'amount', options: [0, 1, 2, 3, 4, 5], prompt: 'How many damage counters to put on Meganium (10 more damage each)?' }],
      run(ctx) {
        const n = ctx.choices.amount ?? 0;
        if (n) {
          ctx.attacker.damage += 10 * n;
          ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${ctx.attackerDef.name}.`);
        }
        ctx.hit(50 + 10 * n);
      },
    },
  },
  // Octillery – Standing By: an Energy card discarded; next turn, Pulse Blast does 120.
  'ex10-10': {
    'Standing By': {
      discard: { count: 1 },
      run(ctx) {
        nextTurn(ctx, 'Pulse Blast');
        ctx.log("Octillery's Pulse Blast does 120 damage next turn.");
      },
    },
    'Pulse Blast': { run: (ctx) => void ctx.hit(boosted(ctx, 'Pulse Blast') ? 120 : 30) },
  },
  // Poliwrath – Beatdown: 30 more to a Darkness Pokémon or one with Dark in its name.
  'ex10-11': { Beatdown: { run: (ctx) => void ctx.hit(hasType(ctx.defenderDef, 'darkness') || /\bDark\b/.test(ctx.defenderDef.name) ? 70 : 40) } },
  // Porygon2 – Data Retrieval: draw up to 8 cards in the hand; Scramble Trip: with Scramble Energy attached, 20 more and Confused.
  'ex10-12': {
    'Data Retrieval': { run: (ctx) => ctx.draw(Math.max(0, 8 - ctx.me.hand.length)) },
    'Scramble Trip': {
      run(ctx) {
        if (!ctx.attacker.energy.some((e) => !e.provides && !e.windless && lookupCard(ctx.state.cards, e.defId).name === 'Scramble Energy')) return void ctx.hit(40);
        ctx.hit(60);
        ctx.inflict('confused');
      },
    },
  },
  // Slowking – Aftermath: 10 more for each Pokémon Tool card in the discard pile, at most 60 more.
  'ex10-14': { Aftermath: { run: (ctx) => void ctx.hit(20 + Math.min(60, 10 * ctx.me.discard.filter((c) => !!trainerEffect(c.defId)?.tool).length)) } },
  // Sudowoodo – Copy: as Aquapolis Smeargle's.
  'ex10-15': { Copy: copyAttack('Copy', { needsEnergy: true, flip: false }) },
  // Ursaring – Drag Off.
  'ex10-18': { 'Drag Off': dragOff(20) },
  // Vaporeon – Aqua Supply: may attach a basic Energy card from the hand to one of the player's Pokémon; Multi Bubble.
  'ex10-19': {
    'Aqua Supply': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.me.hand.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromHand', source: 'Aqua Supply', count: 1, basic: true, anyTarget: true });
      },
    },
    'Multi Bubble': multi('asleep'),
  },
  // Chansey – Hyper Healing: a damage counter and every Special Condition off its player's Active Pokémon.
  'ex10-20': {
    'Hyper Healing': {
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 10);
        cure(ctx, ctx.attacker);
      },
    },
  },
  // Cleffa – Eeeeeeek: the hand shuffled into the deck, then 6 cards drawn.
  'ex10-21': {
    Eeeeeeek: {
      run(ctx) {
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand], ctx.state.rngState);
        ctx.me.hand = [];
        ctx.log('Shuffled the hand into the deck.');
        ctx.draw(6);
      },
    },
  },
  // Electabuzz – Double Shock: 10 for each heads, Paralyzed with any heads; Luster Blast: 3 Energy discarded.
  'ex10-22': {
    'Double Shock': {
      run(ctx) {
        const heads = ctx.flips(2);
        ctx.hit(10 * heads);
        if (heads) ctx.inflict('paralyzed');
      },
    },
    'Luster Blast': { discard: { count: 3 }, run: (ctx) => void ctx.hit(70) },
  },
  // Elekid – Magnetic Trip: Confused while Low Pressure System is in play.
  'ex10-23': {
    'Magnetic Trip': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.state.stadium && lookupCard(ctx.state.cards, ctx.state.stadium.card.defId).name === 'Low Pressure System') ctx.inflict('confused');
      },
    },
  },
  // Ho-Oh – Sacred Fire: heads, 60 to one of the opponent's Pokémon (picked first), with no Weakness or Resistance.
  'ex10-27': {
    'Sacred Fire': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon to do 60 damage to, if heads" }],
      run(ctx) {
        if (!ctx.flip()) return;
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(60, { weakness: false, resistance: false });
        else ctx.damageBenched(ctx.opp, t, 60);
      },
    },
  },
  // Jynx – Pure Power: 4 damage counters on the opponent's Pokémon, as the player likes.
  'ex10-28': { 'Pure Power': { run: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Pure Power', count: 4, active: true }) } },
  // Murkrow – Night Song: one of the opponent's Benched Pokémon switched in, then Asleep (as EX Hidden Legends Hypno's Sleep Inducer).
  'ex10-30': { 'Night Song': lureIn("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => ctx.inflict('asleep')) },
  // Smoochum – Blown Kiss: a damage counter on one of the opponent's Pokémon.
  'ex10-31': { 'Blown Kiss': { run: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Blown Kiss', count: 1, active: true }) } },
  // Stantler – Push Away: a Trainer card from the opponent's hand, discarded.
  'ex10-32': {
    'Push Away': {
      run(ctx) {
        ctx.hit(20);
        ctx.pend({ kind: 'oppHandTrainer', source: 'Push Away', place: 'discard' });
      },
    },
  },
  // Tyrogue – Desperate Punch: 10 for each Pokémon the opponent has in play more than the player.
  'ex10-33': { 'Desperate Punch': { run: (ctx) => void ctx.hit(10 * Math.max(0, inPlay(ctx.opp).length - inPlay(ctx.me).length)) } },
  // Clefable – Extra Comet Punch: 30 more the next turn.
  'ex10-36': {
    'Extra Comet Punch': {
      run(ctx) {
        ctx.hit(boosted(ctx, 'Extra Comet Punch') ? 60 : 30);
        nextTurn(ctx, 'Extra Comet Punch');
      },
    },
  },
  // Corsola – Cry for Help: a Water or Fighting Pokémon (not Pokémon-ex) from the deck, shown; Double Attack: 10 to 2 Benched Pokémon.
  'ex10-37': {
    'Cry for Help': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Cry for Help', filter: 'typesNotEx', types: ['water', 'fighting'], reveal: true })) },
    'Double Attack': benchMany(10, 2),
  },
  // Miltank – Healing Milk: 2 coins; for each heads, 2 damage counters off one of the player's Pokémon (both picked first).
  'ex10-42': {
    'Healing Milk': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(s.attacker, s.ownBench).filter((t) => (t === 'active' ? s.attacker : s.ownBench[t])!.damage > 0);
        if (!options.length) return [];
        return [
          { kind: 'ownPokemon', options, prompt: 'Choose the Pokémon to remove 2 damage counters from for the first heads' },
          { kind: 'ownPokemonTo', options, prompt: 'Choose the Pokémon to remove 2 damage counters from for the second heads' },
        ];
      },
      run(ctx) {
        const heads = ctx.flips(2);
        const picks = [ctx.choices.ownTarget, ctx.choices.ownTo].slice(0, heads);
        for (const t of picks) {
          const p = t === undefined ? null : t === 'active' ? ctx.attacker : ctx.me.bench[t];
          if (p) healUpTo(ctx, ctx.me, p, 20);
        }
      },
    },
  },
  // Scyther – Twin Play: up to 2 Scyther and Scyther ex from the deck onto the Bench.
  'ex10-46': { 'Twin Play': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Twin Play', filter: 'named', name: ['Scyther', 'Scyther ex'], toBench: true, count: 2, optional: true })) } },
  // Yanma – Grand Loop: 2 cards drawn; may switch with a Benched Pokémon.
  'ex10-50': {
    'Grand Loop': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, optional: true, prompt: 'You may choose a Benched Pokémon to switch Yanma with' }] : [];
      },
      run(ctx) {
        ctx.draw(2);
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Onix – Dig Deep: an Energy card from the discard pile into the hand, shown.
  'ex10-65': {
    'Dig Deep': {
      run(ctx) {
        if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Dig Deep', count: 1, filter: 'energy', reveal: true });
      },
    },
  },
  // Slowpoke – Fishing Tail: a Basic Pokémon, Evolution card or basic Energy card from the discard pile into the hand, shown.
  'ex10-72': {
    'Fishing Tail': {
      run(ctx) {
        const fits = (c: (typeof ctx.me.discard)[number]) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return (d.kind === 'pokemon' && !d.trainerText) || isBasicEnergy(d);
        };
        if (ctx.me.discard.some(fits) && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Fishing Tail', count: 1, filter: 'pokemonOrBasicEnergy', reveal: true });
      },
    },
  },
  // Sunkern – Minor Errand-Running: a basic Energy card from the deck, shown.
  'ex10-76': { 'Minor Errand-Running': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Minor Errand-Running', filter: 'basicEnergy', reveal: true })) } },
  // Teddiursa – Teary Eyes: 20 less damage to it during the opponent's next turn.
  'ex10-77': { 'Teary Eyes': guardNext(0, 20) },
  // Blissey ex – Energy Absorption: up to 3 Energy cards from the discard pile to it.
  'ex10-101': {
    'Energy Absorption': {
      run(ctx) {
        const energy = ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length;
        if (energy && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Absorption', count: Math.min(3, energy), target: 'active', anyEnergy: true });
      },
    },
  },
  // Espeon ex – Psyloop: 30 more for each Trainer card the opponent has in play (attached to their Pokémon, or a Stadium they played).
  'ex10-102': {
    Psyloop: { run: (ctx) => void ctx.hit(60 + 30 * trainersInPlay(ctx)) },
  },
  // Ho-Oh ex – Rainbow Burn: 20 more for each type of basic Energy card attached.
  'ex10-104': { 'Rainbow Burn': { run: (ctx) => void ctx.hit(10 + 20 * basicTypes(ctx)) } },
  // Lugia ex – Elemental Blast: a Fire, a Water and a Lightning Energy discarded.
  'ex10-105': {
    'Elemental Blast': {
      run(ctx) {
        const gone: typeof ctx.attacker.energy = [];
        for (const type of ['fire', 'water', 'lightning'] as EnergyType[]) {
          const card = typeCards(ctx.state.cards, ctx.attacker, type).find((e) => !gone.includes(e));
          if (card) gone.push(card);
        }
        discardOwn(ctx, gone);
        ctx.hit(200);
      },
    },
  },
  // Meganium ex – Power Poison: an Energy discarded; Poisoned.
  'ex10-106': {
    'Power Poison': {
      discard: { count: 1 },
      run(ctx) {
        ctx.hit(90);
        ctx.inflict('poisoned');
      },
    },
  },
  // Politoed ex – Upward Lick: 30 to one of the opponent's Pokémon, 50 to a Stage 2 one; Swallow Up: 120 if the Defending
  // Pokémon has less HP left than Politoed ex.
  'ex10-107': {
    'Upward Lick': {
      ...snipe(30),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        const damage = p && inPlayDef(ctx.state.cards, p).stage === 'stage2' ? 50 : 30;
        if (t === 'active') ctx.hit(damage);
        else ctx.damageBenched(ctx.opp, t, damage);
      },
    },
    'Swallow Up': {
      run(ctx) {
        const left = (p: AttackContext['attacker']) => inPlayDef(ctx.state.cards, p).hp - p.damage;
        ctx.hit(left(ctx.defender) < left(ctx.attacker) ? 120 : 70);
      },
    },
  },
  // Scizor ex – Steel Wing: 20 less damage to it during the opponent's next turn.
  'ex10-108': { 'Steel Wing': guardNext(40, 20) },
  // Steelix ex – Metal Charge: a damage counter on itself; Mudslide: 2 Fighting Energy discarded, 100 to one of the opponent's Pokémon.
  'ex10-109': {
    'Metal Charge': {
      run(ctx) {
        ctx.hit(70);
        ctx.attacker.damage += 10;
        ctx.log(`Put a damage counter on ${ctx.attackerDef.name}.`);
      },
    },
    Mudslide: { ...snipe(100), discard: { count: 2, type: 'fighting' } },
  },
  // Typhlosion ex – Kindle: an Energy card discarded from it, then one from the Defending Pokémon.
  'ex10-110': {
    Kindle: {
      discard: { count: 1 },
      choices: (s): ChoiceSpec[] => (s.defender.energy.some((e) => !e.provides) ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to discard from the Defending Pokémon' }] : []),
      run(ctx) {
        ctx.hit(80);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Tyranitar ex – Shatter: the Stadium discarded; Derail: a Special Energy card from the Defending Pokémon discarded; Losing
  // Control: the top 3 cards of the deck discarded.
  'ex10-111': {
    Shatter: {
      run(ctx) {
        ctx.hit(30);
        const stadium = ctx.state.stadium;
        if (!stadium) return;
        ctx.state.players[stadium.owner]!.discard.push(stadium.card);
        ctx.state.stadium = null;
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, stadium.card.defId).name}.`);
      },
    },
    Derail: {
      choices(s): ChoiceSpec[] {
        const special = s.defender.energy.filter((e) => isSpecialEnergy(s.cards, e));
        return special.length ? [{ kind: 'defenderEnergy', options: special, prompt: 'Choose a Special Energy card to discard from the Defending Pokémon' }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
    'Losing Control': {
      run(ctx) {
        ctx.hit(120);
        const top = ctx.me.deck.splice(0, 3);
        ctx.me.discard.push(...top);
        if (top.length) ctx.log(`Discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck.`);
      },
    },
  },
  // Umbreon ex – Black Cry: the Defending Pokémon can't retreat or use Poké-Powers next turn.
  'ex10-112': {
    'Black Cry': {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          e.noPokePowers = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat or use Poké-Powers next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Entei ☆ – Detonation: behind on Prize cards, the top 10 cards of the deck discarded.
  'ex10-113': {
    Detonation: {
      run(ctx) {
        ctx.hit(70);
        if (!behind(ctx)) return;
        const top = ctx.me.deck.splice(0, 10);
        ctx.me.discard.push(...top);
        ctx.log(`Discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck.`);
      },
    },
  },
  // Raikou ☆ – Meta Voltage: behind on Prize cards, 40 to each of the player's Pokémon, Raikou ☆ too (agreed), never with Weakness.
  'ex10-114': {
    'Meta Voltage': {
      run(ctx) {
        ctx.hit(70);
        if (!behind(ctx)) return;
        ctx.selfDamage(40);
        ctx.benchDamage(ctx.me, 40);
      },
    },
  },
  // Suicune ☆ – Cross Wind: behind on Prize cards, every Energy card attached to the player's Pokémon discarded.
  'ex10-115': {
    'Cross Wind': {
      run(ctx) {
        ctx.hit(70);
        if (!behind(ctx)) return;
        for (const p of inPlay(ctx.me)) {
          const cards = p.energy.filter((e) => !e.provides);
          if (!cards.length) continue;
          p.energy = p.energy.filter((e) => e.provides);
          ctx.me.discard.push(...cards);
          ctx.log(`Discarded ${cards.length} Energy card${cards.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
        }
      },
    },
  },
  // Celebi ex – Spiral Leaf: heads, a damage counter on each of the opponent's Pokémon; tails, one off each of the player's.
  // Time Trap: heads, the opponent's top 4 cards back in the player's order; tails, the player's own.
  'ex10-117': {
    'Spiral Leaf': {
      run(ctx) {
        if (ctx.flip()) for (const p of inPlay(ctx.opp)) putCounters(ctx, ctx.opp, p, 1);
        else for (const p of inPlay(ctx.me)) healUpTo(ctx, ctx.me, p, 10);
      },
    },
    'Time Trap': {
      run(ctx) {
        ctx.hit(30);
        const owner = ctx.flip() ? ctx.opp : ctx.me;
        const count = Math.min(4, owner.deck.length);
        if (count > 1) ctx.pend({ kind: 'arrangeTop', source: 'Time Trap', count, deckOwner: owner.id });
      },
    },
  },
};
