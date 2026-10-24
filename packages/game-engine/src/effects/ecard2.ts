// Aquapolis (ecard2) attack effects, by card id and attack name, and the attacks of its Technical Machines (the Cubes, keyed
// by the Trainer card's id: the Pokémon they're attached to uses them). TCGdex's Aquapolis text matches the card images
// (checked) but for the Cubes, whose attacks it leaves out (TrainerEffect.technicalMachine, ecard2-trainers.ts), and
// Smeargle's "Doublslap" (Doubleslap; answered to under both names until a re-seed). Attacks that only deal damage need no
// entry. TCGdex has no images for 50, 74, 95 and 103, and no H1–H32 holo prints, so they're not in the catalog.
// Rulings (from the text): questions whose answer depends on a flip are asked before it (Miracle Tail's Special Condition,
// Stretch Tail's and Marowak's Benched Pokémon, Destructive Roar's Energy card, Tyrogue's Special Energy card, Hitmontop's
// and Smeargle's switch, Dual Burn's Energy cards). Copy and Mini-Metronome copy the attack's other requirements too (its
// Energy discards); Copy needs Sudowoodo to have the Energy for the copied attack, Mini-Metronome doesn't. Spiral Aura,
// Snatch and Metal Reversal ask whether (and with which Benched Pokémon) to switch before the attack. Aipom's Skedaddle does
// its damage, then returns Aipom and its basic Energy cards to the hand (its other cards are discarded). Lugia's Steam Blast
// discards its Energy card after the damage. Spore Evolution evolves Paras with a card from the deck, as Hatch does.
import { pokemonOn, targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, isPokemonCard, lookupCard, type Attack } from '../cards.js';
import { canPayCost, counts, energyPool, isEnergyCardOf, isSpecialEnergy, type CardInstance, type InPlayPokemon } from '../engine.js';
import { shuffle } from '../rng.js';
import { effectId, inPlayDef, pokemonName } from '../status.js';
import {
  benchedSlots,
  benchTarget,
  discardToUse,
  energyCanMove,
  extraEnergy,
  flipToInflict,
  flipToProtect,
  headsUntilTails,
  inflicts,
  lure,
  opponentBenchChoice,
  opponentSwitches,
  perHeads,
  recoil,
  recover,
  thrash,
} from './common.js';
import { energyCards, energyDraw, hideAway, plasma, reflectEnergy, typedCards } from './ecard1.js';
import { smokescreen } from './fossil.js';
import { discardFromAttacker, noRetreat, removalFlip } from './gym1.js';
import { attackEffect, trainerEffect } from './index.js';
import { flipForMore } from './jungle.js';
import { damageOpponent, opponentTargets, swift } from './neo1.js';
import { evolutionsOf } from './neo2.js';
import { attachFromDiscard, discardFree, energyCanGo, notNextTurn, reachesDefender } from './neo3.js';
import { flipOrNothing } from './rocket.js';
import { eitherCondition } from './si1.js';

/** Energy a Pokémon has of `type` (Rainbow Energy and Crystal Energy count): Water Punch-style "amount of … Energy". */
const energyOf = (ctx: Pick<AttackContext, 'state'>, p: InPlayPokemon, type: Parameters<typeof counts>[1]) => energyPool(p, ctx.state.cards).filter((t) => counts(t, type)).length;

/** Discards every Trainer card attached to the Defending Pokémon (Mug, Plunder), unless the attack can't affect it. */
export function discardDefenderTrainers(ctx: AttackContext) {
  ctx.affectDefender(() => {
    const defender = ctx.opp.active!;
    const trainers = (defender.attached ?? []).filter((a) => lookupCard(ctx.state.cards, a.card.defId).kind === 'trainer');
    if (!trainers.length) return;
    defender.attached = defender.attached!.filter((a) => !trainers.includes(a));
    ctx.opp.discard.push(...trainers.map((a) => a.card));
    ctx.log(`Discarded ${trainers.map((a) => lookupCard(ctx.state.cards, a.card.defId).name).join(', ')} from ${pokemonName(ctx.state, defender)}.`, ctx.opp.id);
  });
}

/** "You may choose 1 of your opponent's Benched Pokémon" (-1: none): Spiral Aura, Snatch, Metal Reversal. */
const mayChooseBench = (s: AttackSituation, prompt: string, fits: (p: InPlayPokemon) => boolean = () => true): ChoiceSpec[] => {
  const options = benchedSlots(s.opponentBench).filter((i) => fits(s.opponentBench[i]!));
  return options.length ? [{ kind: 'opponentBench', options: [...options, -1], optional: true, prompt }] : [];
};

/** The chosen Benched Pokémon (`benchSlot`, -1 for none), switched with the Defending Pokémon. */
function switchChosen(ctx: AttackContext) {
  const slot = ctx.choices.benchSlot;
  if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
}

/**
 * Copies one of the Defending Pokémon's attacks (Copy, Mini-Metronome), with its Energy discards and questions. `needsEnergy`:
 * nothing happens unless the attacker has the Energy for it (Copy); `flip`: heads first (Mini-Metronome).
 */
export const copyAttack = (name: string, { needsEnergy, flip }: { needsEnergy: boolean; flip: boolean }): AttackEffect => ({
  choices(s, c) {
    const attacks = inPlayDef(s.cards, s.defender).attacks;
    const options = attacks.flatMap((a, i) => (a.name === 'Copy' || a.name === 'Mini-Metronome' ? [] : [i]));
    if (!options.length) return [];
    const specs: ChoiceSpec[] = [{ kind: 'copyAttack', options, prompt: `${name}: choose one of the Defending Pokémon's attacks to copy` }];
    const copied = c.copyIndex !== undefined ? attacks[c.copyIndex] : undefined;
    const effect = copied && attackEffect(effectId(s.defender), copied.name);
    const discard = effect?.discard;
    if (discard && discard.count !== 'all') {
      const own = s.attacker.energy.filter((e) => !discard.type || isEnergyCardOf(e, s.cards, discard.type) || !!s.attacker.transformed);
      specs.push({ kind: 'ownEnergy', count: discard.count, options: own, prompt: `Choose ${discard.count} Energy to discard for ${copied!.name}` });
    }
    if (effect?.choices) specs.push(...effect.choices(s, c));
    return specs;
  },
  run(ctx) {
    const copied: Attack | undefined = ctx.choices.copyIndex !== undefined ? ctx.defenderDef.attacks[ctx.choices.copyIndex] : undefined;
    if (!copied) return ctx.log(`${name} had nothing to copy.`);
    if (flip && !ctx.flip()) return ctx.log(`${name} did nothing.`);
    if (needsEnergy && !canPayCost(ctx.attacker, copied, ctx.state.cards)) return ctx.log(`${name} did nothing: ${ctx.attackerDef.name} doesn't have the Energy for ${copied.name}.`);
    const source = effectId(ctx.defender);
    const discard = attackEffect(source, copied.name)?.discard;
    if (discard) {
      const uids = new Set(discard.count === 'all' ? ctx.attacker.energy.map((e) => e.uid) : (ctx.choices.energyUids ?? []));
      const gone = ctx.attacker.energy.filter((e) => uids.has(e.uid));
      if (discard.count !== 'all' && gone.length < discard.count) return ctx.log(`${name} did nothing: not enough Energy to discard.`);
      discardFromAttacker(ctx, gone);
    }
    ctx.log(`${name} copies ${copied.name}.`);
    ctx.useAttack(copied, source);
  },
});

/** Flips a coin for each `type` Energy card discarded from the attacker; `each` more damage per heads (Conduction, Discharge). */
const dischargeLike = (damage: number, each: number, type: 'lightning'): AttackEffect => ({
  run(ctx) {
    const gone = typedCards(ctx, type);
    discardFromAttacker(ctx, gone);
    ctx.hit(damage + each * ctx.flips(gone.length));
  },
});

/** Choose 1 of the opponent's Pokémon: `damage` to it, without Weakness and Resistance (Long Tongue, Splatter). */
const anyOpponent = (damage: number, opts: { swift?: boolean } = {}): AttackEffect => ({
  choices: (s) => opponentTargets(s, `Choose one of your opponent's Pokémon to do ${damage} damage to`),
  run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', damage, opts.swift),
});

/** Searches the deck for an Energy card and attaches it (Charge Up: to the attacker; Energy Support: to a Benched Pokémon). */
const energySearch = (source: string, find: { filter: 'energy' | 'energyType'; type?: 'psychic'; bench?: boolean }): AttackEffect => ({
  run(ctx) {
    if (!ctx.flip()) return ctx.log(`${source} did nothing.`);
    if (find.bench && !benchedSlots(ctx.me.bench).length) return ctx.log('You have no Benched Pokémon.');
    if (!ctx.me.deck.length) return;
    ctx.pend(
      find.bench
        ? { kind: 'pickFromDeck', source, filter: find.filter, ...(find.type && { type: find.type }), attach: true, attachOnly: { bench: true } }
        : { kind: 'pickFromDeck', source, filter: find.filter, attachToActive: true },
    );
  },
});

export const ECARD2: Record<string, Record<string, AttackEffect>> = {
  // Ampharos – Thundershock; Reflect Energy.
  'ecard2-1': { Thundershock: flipToInflict(20, 'paralyzed'), 'Reflect Energy': reflectEnergy(50, 'Ampharos') },
  // Arcanine – Fire Blow: may discard Fire Energy cards; a coin for each, 30 more for each heads.
  'ecard2-2': {
    'Fire Blow': {
      choices(s): ChoiceSpec[] {
        const options = s.attacker.energy.filter((e) => isEnergyCardOf(e, s.cards, 'fire'));
        return options.length ? [{ kind: 'ownEnergyUpTo', options, prompt: 'Discard any number of Fire Energy cards: a coin for each, 30 more damage per heads' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        const gone = ctx.attacker.energy.filter((e) => uids.has(e.uid));
        discardFromAttacker(ctx, gone);
        ctx.hit(30 + 30 * ctx.flips(gone.length));
      },
    },
  },
  // Ariados – Spider Force: heads 10 more; tails Paralyzed.
  'ecard2-3': {
    'Spider Force': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(30);
        ctx.hit(20);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Azumarill – Aqua Sonic: no Resistance.
  'ecard2-4': { 'Aqua Sonic': { run: (ctx) => void ctx.hit(40, { resistance: false }) } },
  // Bellossom – Knife Leaf.
  'ecard2-5': { 'Knife Leaf': perHeads(3, 30) },
  // Blissey – Smash Bomber.
  'ecard2-6': { 'Smash Bomber': flipOrNothing(50) },
  // Donphan – Earthquake: 10 to each of its player's Benched Pokémon; Double Stab.
  'ecard2-7': {
    Earthquake: {
      run(ctx) {
        ctx.hit(30);
        ctx.benchDamage(ctx.me, 10);
      },
    },
    'Double Stab': perHeads(2, 40),
  },
  // Electrode – Swift.
  'ecard2-8': { Swift: swift(30) },
  // Elekid – Energy Kick: heads, the opponent moves the chosen Energy card from the Defending Pokémon to another of their Pokémon.
  'ecard2-9': {
    'Energy Kick': {
      choices: (s) => (s.defender.energy.some((e) => !e.provides) && benchedSlots(s.opponentBench).length ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card on the Defending Pokémon (your opponent moves it on heads)' }] : []),
      run(ctx) {
        const uid = ctx.choices.defenderEnergyUid;
        if (!uid || !benchedSlots(ctx.opp.bench).length) return ctx.log('Energy Kick did nothing.');
        if (!ctx.flip()) return ctx.log('Energy Kick did nothing.');
        ctx.affectDefender(() => {
          const defender = ctx.opp.active!;
          const card = defender.energy.find((e) => e.uid === uid);
          if (!card || !energyCanMove(ctx, defender)) return;
          defender.energy = defender.energy.filter((e) => e !== card);
          ctx.opponentChooses({ kind: 'attachCard', source: 'Energy Kick', card, only: { bench: true } });
        });
      },
    },
  },
  // Entei – Burning Fang: may flip; heads discards a Fire Energy card from Entei and Burns the Defending Pokémon.
  'ecard2-10': {
    'Burning Fang': {
      choices: (s) => (s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'fire')) ? [{ kind: 'boost', options: [true, false], prompt: 'Flip a coin? Heads: discard a Fire Energy card and the Defending Pokémon is now Burned' }] : []),
      run(ctx) {
        ctx.hit(40);
        if (!ctx.choices.boost || !ctx.flip()) return;
        const [fire] = typedCards(ctx, 'fire');
        if (fire) discardFromAttacker(ctx, [fire]);
        ctx.inflict('burned');
      },
    },
  },
  // Espeon – Damage Blast: a coin for each damage counter on the Defending Pokémon, 10 more for each heads.
  'ecard2-11': { 'Damage Blast': { run: (ctx) => void ctx.hit(30 + 10 * ctx.flips(Math.floor(ctx.defender.damage / 10))) } },
  // Exeggutor – Super Eggsplosion: discard any Energy cards from your Pokémon, a coin for each, 40 per heads; Called Shot.
  'ecard2-12': {
    'Super Eggsplosion': {
      choices(s): ChoiceSpec[] {
        const options = [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p) : []));
        return options.length ? [{ kind: 'ownEnergyAny', options, prompt: 'Discard any number of Energy cards from your Pokémon: a coin for each, 40 damage per heads' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        let discarded = 0;
        for (const p of [ctx.me.active, ...ctx.me.bench]) {
          const gone = p ? p.energy.filter((e) => uids.has(e.uid)) : [];
          if (!p || !gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          ctx.log(`Discarded ${gone.length} Energy from ${pokemonName(ctx.state, p)}.`);
          discarded += gone.length;
        }
        ctx.hit(40 * ctx.flips(discarded));
      },
    },
    'Called Shot': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon: 10 damage for each Grass Energy attached to Exeggutor"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined) ctx.damageBenched(ctx.opp, slot, 10 * energyOf(ctx, ctx.attacker, 'grass'));
      },
    },
  },
  // Exeggutor – Big Eggsplosion: a coin for each Energy attached; Lateral Eggsplosion: a coin for each Energy on the Bench.
  'ecard2-13': {
    'Big Eggsplosion': { run: (ctx) => void ctx.hit(20 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).length)) },
    'Lateral Eggsplosion': { run: (ctx) => void ctx.hit(30 + 10 * ctx.flips(ctx.me.bench.reduce((n, p) => n + (p ? energyPool(p, ctx.state.cards).length : 0), 0))) },
  },
  // Houndoom – Smokescreen; Burn Up: tails discards all its Fire Energy cards.
  'ecard2-14': {
    Smokescreen: smokescreen(10),
    'Burn Up': {
      run(ctx) {
        ctx.hit(60);
        if (!ctx.flip()) discardFromAttacker(ctx, typedCards(ctx, 'fire'));
      },
    },
  },
  // Houndoom – Fireworks: tails discards a Fire Energy card; Dark Impact: the Defending Pokémon can't use Poké-Powers next turn.
  'ecard2-15': {
    Fireworks: {
      run(ctx) {
        ctx.hit(30);
        const [fire] = typedCards(ctx, 'fire');
        if (fire && !ctx.flip()) discardFromAttacker(ctx, [fire]);
      },
    },
    'Dark Impact': {
      run(ctx) {
        ctx.hit(40);
        ctx.affectDefender((e) => {
          e.noPokePowers = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't use Poké-Powers until the end of the next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Hypno – Spiral Aura: if the Defending Pokémon isn't Knocked Out, may switch it with a Benched Pokémon.
  'ecard2-16': {
    'Spiral Aura': {
      choices: (s) => mayChooseBench(s, "Switch the Defending Pokémon (if it isn't Knocked Out) with one of your opponent's Benched Pokémon?"),
      run(ctx) {
        ctx.hit(30);
        const defender = ctx.opp.active;
        if (defender && defender.damage < inPlayDef(ctx.state.cards, defender).hp) switchChosen(ctx);
      },
    },
  },
  // Jumpluff – Cotton Punch.
  'ecard2-17': { 'Cotton Punch': perHeads(2, 30) },
  // Jynx – Meditate: 10 more for each damage counter on the Defending Pokémon; Confuse Ray.
  'ecard2-18': { Meditate: { run: (ctx) => void ctx.hit(10 + 10 * Math.floor(ctx.defender.damage / 10)) }, 'Confuse Ray': flipToInflict(20, 'confused') },
  // Kingdra – Rapids.
  'ecard2-19': { Rapids: removalFlip(50) },
  // Lanturn – Conduction: discards all Lightning Energy cards, a coin for each, 40 more for each heads.
  'ecard2-20': { Conduction: dischargeLike(30, 40, 'lightning') },
  // Lanturn – Electric Tackle: 10 more for each Lightning Energy; tails 10 to itself for each.
  'ecard2-21': {
    'Electric Tackle': {
      run(ctx) {
        const n = energyOf(ctx, ctx.attacker, 'lightning');
        ctx.hit(20 + 10 * n);
        if (n && !ctx.flip()) ctx.selfDamage(10 * n);
      },
    },
  },
  // Magneton – Steel Wave: 10 to each of the opponent's Benched Pokémon of the Defending Pokémon's type.
  'ecard2-22': {
    'Steel Wave': {
      run(ctx) {
        const type = ctx.defenderDef.type;
        ctx.hit(30);
        for (const slot of benchedSlots(ctx.opp.bench)) if (inPlayDef(ctx.state.cards, ctx.opp.bench[slot]!).type === type) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Muk – Burning Sludge: a coin for each Grass Energy; any heads, the Defending Pokémon is Poisoned and Burned.
  'ecard2-23': {
    'Burning Sludge': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flips(energyOf(ctx, ctx.attacker, 'grass')) === 0) return;
        ctx.inflict('poisoned');
        ctx.inflict('burned');
      },
    },
  },
  // Nidoking – Giant Horn.
  'ecard2-24': { 'Giant Horn': flipForMore(50, 30) },
  // Ninetales – Miracle Tail: heads, the Special Condition chosen; Roasting Heat: 20 more if the Defending Pokémon is Burned.
  'ecard2-25': {
    'Miracle Tail': {
      choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon (on heads)' }],
      run(ctx) {
        ctx.hit(10);
        if (ctx.choices.condition && ctx.flip()) ctx.inflict(ctx.choices.condition);
      },
    },
    'Roasting Heat': { run: (ctx) => void ctx.hit(ctx.defender.burned ? 60 : 40) },
  },
  // Octillery – Smokescreen.
  'ecard2-26': { Smokescreen: smokescreen(40) },
  // Parasect – Sleep Inducer: switch in one of the opponent's Benched Pokémon; it's Asleep. Rapture Pollen.
  'ecard2-27': {
    'Sleep Inducer': {
      blocked: (s) => (benchedSlots(s.opponentBench).length ? null : 'Your opponent has no Benched Pokémon'),
      choices: lure.choices,
      run(ctx) {
        if (ctx.choices.benchSlot === undefined) return;
        ctx.switchDefender(ctx.choices.benchSlot);
        ctx.inflict('asleep');
      },
    },
    'Rapture Pollen': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.inflict('asleep');
        else ctx.heal(20);
      },
    },
  },
  // Porygon2 – Hypnotic Ray.
  'ecard2-28': { 'Hypnotic Ray': inflicts(20, 'asleep') },
  // Primeape – Karate Chop: 10 less for each damage counter on it; Sudden Charge: 10 to itself, then the opponent switches.
  'ecard2-29': {
    'Karate Chop': { run: (ctx) => void ctx.hit(Math.max(0, 40 - ctx.attacker.damage)) },
    'Sudden Charge': {
      run(ctx) {
        ctx.hit(40);
        ctx.selfDamage(10);
        opponentSwitches(ctx, 'Sudden Charge');
      },
    },
  },
  // Quagsire – Water Gun: 10 more for each Water Energy beyond the cost, up to 20; Slam.
  'ecard2-30': { 'Water Gun': { run: (ctx) => void ctx.hit(20 + 10 * extraEnergy(ctx, ['water'], 'water', 2)) }, Slam: perHeads(2, 50) },
  // Rapidash – Agility; Gallop: heads discards a Fire Energy card for 20 more.
  'ecard2-31': {
    Agility: flipToProtect(10, 'preventAll'),
    Gallop: {
      run(ctx) {
        const [fire] = typedCards(ctx, 'fire');
        if (!ctx.flip()) return void ctx.hit(30);
        if (fire) discardFromAttacker(ctx, [fire]);
        ctx.hit(50);
      },
    },
  },
  // Scizor – Snatch: may switch in a Benched Pokémon with no damage counters first; Heavy Metal: a coin for each Metal Energy.
  'ecard2-32': {
    Snatch: {
      choices: (s) => mayChooseBench(s, "Switch one of your opponent's Benched Pokémon with no damage counters in first?", (p) => p.damage === 0),
      run(ctx) {
        switchChosen(ctx);
        ctx.hit(20);
      },
    },
    'Heavy Metal': { run: (ctx) => void ctx.hit(30 + 20 * ctx.flips(energyOf(ctx, ctx.attacker, 'metal'))) },
  },
  // Slowbro – Energy Cannon: 10 more for each Energy beyond the cost, up to 20.
  'ecard2-33': { 'Energy Cannon': { run: (ctx) => void ctx.hit(30 + 10 * Math.min(2, Math.max(0, energyPool(ctx.attacker, ctx.state.cards).length - 2))) } },
  // Slowking – Bursting Hand: 10 for each Energy card in the opponent's hand; Shuffle Attack: rearrange the top of their deck.
  'ecard2-34': {
    'Bursting Hand': {
      run(ctx) {
        const energy = ctx.opp.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy').length;
        ctx.log(`Looked at the opponent's hand: ${energy} Energy card${energy === 1 ? '' : 's'}.`);
        ctx.hit(10 * energy);
      },
    },
    'Shuffle Attack': {
      run(ctx) {
        const count = energyCards(ctx.defender).length;
        ctx.hit(40);
        if (count && ctx.opp.deck.length) ctx.pend({ kind: 'arrangeTop', source: 'Shuffle Attack', count, deckOwner: ctx.opp.id });
      },
    },
  },
  // Steelix – Earth Rift: 10 to each of the opponent's Benched Pokémon; tails, not next turn. Iron Smash.
  'ecard2-35': {
    'Earth Rift': {
      run(ctx) {
        ctx.hit(10);
        ctx.benchDamage(ctx.opp, 10);
        if (!ctx.flip()) notNextTurn(ctx, 'Earth Rift');
      },
    },
    'Iron Smash': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (heads === 0) return ctx.log('Iron Smash did nothing.');
        ctx.hit(heads === 2 ? 70 : 50);
      },
    },
  },
  // Sudowoodo – Copy; Energy Draw.
  'ecard2-36': { Copy: copyAttack('Copy', { needsEnergy: true, flip: false }), 'Energy Draw': energyDraw },
  // Suicune – Hypno Wave: heads 20 more; tails Asleep.
  'ecard2-37': {
    'Hypno Wave': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(50);
        ctx.hit(30);
        ctx.inflict('asleep');
      },
    },
  },
  // Tentacruel – Poison Sting.
  'ecard2-38': { 'Poison Sting': flipToInflict(20, 'poisoned') },
  // Togetic – Mini-Metronome.
  'ecard2-39': { 'Mini-Metronome': copyAttack('Mini-Metronome', { needsEnergy: false, flip: true }) },
  // Tyranitar – Destructive Roar: heads discards the chosen Energy card from one of the opponent's Pokémon; Gigacrush.
  'ecard2-40': {
    'Destructive Roar': {
      choices(s, c): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => energyCards(pokemonOn(s.defender, s.opponentBench, t)!).length);
        if (!options.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon (an Energy card is discarded from it on heads)" }];
        if (c.oppTarget === undefined) return specs;
        return [...specs, { kind: 'pokemonEnergy', options: energyCards(pokemonOn(s.defender, s.opponentBench, c.oppTarget)!), prompt: 'Choose the Energy card to discard' }];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : pokemonOn(ctx.opp.active, ctx.opp.bench, t);
        if (!p || !ctx.choices.oppEnergyUid) return ctx.log('Destructive Roar did nothing.');
        if (!ctx.flip()) return ctx.log('Destructive Roar did nothing.');
        if (!ctx.canAffect(ctx.opp, p) || !energyCanGo(ctx, p)) return;
        if (t === 'active') return ctx.discardDefenderEnergy(ctx.choices.oppEnergyUid);
        const card = p.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        if (!card) return;
        p.energy = p.energy.filter((e) => e !== card);
        ctx.opp.discard.push(card);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
    Gigacrush: {
      run(ctx) {
        ctx.hit(60);
        for (const player of [ctx.me, ctx.opp]) {
          const gone = player.deck.splice(0, 3);
          player.discard.push(...gone);
          if (gone.length) ctx.log(`Discarded the top ${gone.length} card${gone.length === 1 ? '' : 's'} of the deck.`, player.id);
        }
      },
    },
  },
  // Umbreon – Shadow Bind.
  'ecard2-41': { 'Shadow Bind': noRetreat(30) },
  // Victreebel – Corrosive Acid.
  'ecard2-42': { 'Corrosive Acid': flipToInflict(40, 'burned') },
  // Vileplume – Poison Scent; Addictive Pollen: heads, the opponent can't play Supporter cards next turn.
  'ecard2-43': {
    'Poison Scent': {
      run(ctx) {
        ctx.inflict('poisoned');
        ctx.inflict(ctx.flip() ? 'confused' : 'asleep');
      },
    },
    'Addictive Pollen': {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.flip()) return;
        ctx.opp.noSupportersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Supporter cards next turn.", ctx.opp.id);
      },
    },
  },
  // Zapdos – Plasma; Lightning Storm: tails puts 2 damage counters on Zapdos.
  'ecard2-44': {
    Plasma: plasma(10, 'lightning'),
    'Lightning Storm': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) return;
        ctx.attacker.damage += 20;
        ctx.log(`Put 2 damage counters on ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Bellsprout – Blot: remove a damage counter from it.
  'ecard2-45': {
    Blot: {
      run(ctx) {
        ctx.hit(20);
        ctx.heal(10);
      },
    },
  },
  // Dodrio – Tri Attack; Peck Attack: 1 heads 20, 2 heads 50, 2 tails Confused.
  'ecard2-46': {
    'Tri Attack': perHeads(3, 10),
    'Peck Attack': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (heads === 0) return ctx.inflict('confused');
        ctx.hit(heads === 2 ? 50 : 20);
      },
    },
  },
  // Flaaffy – Thundershock; Spark.
  'ecard2-47': { Thundershock: flipToInflict(10, 'paralyzed'), Spark: benchTarget(30, 10) },
  // Gloom – Sleep Sap: the Defending Pokémon and Gloom are now Asleep.
  'ecard2-49': {
    'Sleep Sap': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('asleep');
        ctx.sleepSelf();
      },
    },
  },
  // Growlithe – Ember.
  'ecard2-51': { Ember: discardToUse(30, 1, 'fire') },
  // Magnemite – Attract.
  'ecard2-52': { Attract: lure },
  // Marill – Sleepy Ball.
  'ecard2-53': { 'Sleepy Ball': inflicts(10, 'asleep') },
  // Marowak – Triple Bone: 3 coins, 10 for each heads to the chosen Benched Pokémon; Bone Rush.
  'ecard2-54': {
    'Triple Bone': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon: 3 coins, 10 damage for each heads"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined) return ctx.log('Triple Bone did nothing.');
        const heads = ctx.flips(3);
        if (heads) ctx.damageBenched(ctx.opp, slot, 10 * heads);
      },
    },
    'Bone Rush': { run: (ctx) => void ctx.hit(50 * headsUntilTails(ctx)) },
  },
  // Nidorino – Poison Horn; Take Down.
  'ecard2-55': { 'Poison Horn': flipToInflict(10, 'poisoned'), 'Take Down': recoil(40, 10) },
  // Pupitar – Thrash.
  'ecard2-56': { Thrash: thrash(30) },
  // Scyther – Quick Turn; Cross-Cut: 20 more against an Evolved Pokémon.
  'ecard2-57': { 'Quick Turn': perHeads(2, 10), 'Cross-Cut': { run: (ctx) => void ctx.hit(ctx.defender.evolvedFrom.length ? 40 : 20) } },
  // Seadra – Water Bullet: a coin for each Water Energy, 10 more for each heads.
  'ecard2-58': { 'Water Bullet': { run: (ctx) => void ctx.hit(30 + 10 * ctx.flips(energyOf(ctx, ctx.attacker, 'water'))) } },
  // Seaking – Flail; Undulate.
  'ecard2-59': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) }, Undulate: flipToProtect(30, 'preventAll') },
  // Skiploom – Break Powder: heads 20 more; tails Asleep.
  'ecard2-60': {
    'Break Powder': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(30);
        ctx.hit(10);
        ctx.inflict('asleep');
      },
    },
  },
  // Smoochum – Energy Kiss: a coin for each Energy card on the Defending Pokémon.
  'ecard2-61': { 'Energy Kiss': { run: (ctx) => void ctx.hit(10 * ctx.flips(energyCards(ctx.defender).length)) } },
  // Spinarak – Gooey Thread.
  'ecard2-62': { 'Gooey Thread': noRetreat(20) },
  // Tyrogue – Energy Punch: heads discards the chosen Special Energy card from the Defending Pokémon; tails nothing.
  'ecard2-63': {
    'Energy Punch': {
      choices(s): ChoiceSpec[] {
        const options = s.defender.energy.filter((e) => isSpecialEnergy(s.cards, e));
        return options.length ? [{ kind: 'defenderEnergy', options, prompt: 'Choose a Special Energy card to discard from the Defending Pokémon (on heads)' }] : [];
      },
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Energy Punch did nothing.');
        ctx.hit(10);
        const uid = ctx.choices.defenderEnergyUid;
        if (uid && ctx.opp.active?.energy.some((e) => e.uid === uid) && reachesDefender(ctx) && energyCanGo(ctx, ctx.opp.active)) ctx.discardDefenderEnergy(uid);
      },
    },
  },
  // Voltorb – Thundershock.
  'ecard2-64': { Thundershock: flipToInflict(20, 'paralyzed') },
  // Weepinbell – Growth: up to 2 Grass Energy cards from the hand; Double Razor Leaf.
  'ecard2-65': {
    Growth: {
      run(ctx) {
        if (ctx.me.hand.some((c) => isEnergyCardOf(c, ctx.state.cards, 'grass'))) ctx.pend({ kind: 'attachFromHand', source: 'Growth', type: 'grass', count: 2 });
      },
    },
    'Double Razor Leaf': perHeads(2, 30),
  },
  // Wooper – Deep Dive: 3 coins, a damage counter off for each heads.
  'ecard2-66': {
    'Deep Dive': {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads) ctx.heal(10 * heads);
      },
    },
  },
  // Aipom – Stretch Tail: heads, 10 to the chosen Benched Pokémon; Skedaddle: Aipom and its basic Energy cards go back to the hand.
  'ecard2-67': {
    'Stretch Tail': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon (10 damage on heads)"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.flip()) return ctx.log('Stretch Tail did nothing.');
        ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
    Skedaddle: {
      run(ctx) {
        if (!benchedSlots(ctx.me.bench).length) return ctx.log('Skedaddle did nothing.');
        ctx.hit(20);
        const aipom = ctx.attacker;
        if (ctx.me.active !== aipom) return;
        const basic = aipom.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId)));
        const rest = [...aipom.energy.filter((e) => !basic.includes(e)), ...(aipom.attached ?? []).map((a) => a.card)];
        ctx.me.hand.push(...aipom.evolvedFrom, aipom.card, ...basic);
        ctx.me.discard.push(...rest);
        ctx.me.active = null;
        ctx.log(`${ctx.attackerDef.name} and its basic Energy cards went back to the hand.`);
      },
    },
  },
  // Bellsprout – Poison Vine; Sharp Leaf.
  'ecard2-68': { 'Poison Vine': flipToInflict(0, 'poisoned'), 'Sharp Leaf': flipForMore(10, 10) },
  // Chansey – Double-edge.
  'ecard2-69': { 'Double-edge': recoil(40, 40) },
  // Chinchou – Float.
  'ecard2-70': { Float: flipToProtect(0, 'preventAll') },
  // Chinchou – Jolt; Confuse Ray.
  'ecard2-71': { Jolt: flipToInflict(0, 'paralyzed'), 'Confuse Ray': flipToInflict(10, 'confused') },
  // Cubone – Teary Eyes: 20 less damage to it during the opponent's next turn.
  'ecard2-72': {
    'Teary Eyes': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 20, until: ctx.turn + 1 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks is reduced by 20 next turn.`);
      },
    },
  },
  // Doduo – Super Speed.
  'ecard2-73': { 'Super Speed': flipToProtect(0, 'preventAll') },
  // Eevee – Charge Up: heads, an Energy card from the deck attached to Eevee; Lunge.
  'ecard2-75': { 'Charge Up': energySearch('Charge Up', { filter: 'energy' }), Lunge: flipOrNothing(20) },
  // Exeggcute – Growth Spurt: an Energy card from the hand attached to it; Sleep Powder.
  'ecard2-76': {
    'Growth Spurt': {
      run(ctx) {
        if (ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'attachFromHand', source: 'Growth Spurt', count: 1 });
      },
    },
    'Sleep Powder': inflicts(10, 'asleep'),
  },
  // Exeggcute – Continuous Eggsplosion; Energy Support: heads, a Psychic Energy card from the deck onto a Benched Pokémon.
  'ecard2-77': {
    'Continuous Eggsplosion': { run: (ctx) => void ctx.hit(10 * headsUntilTails(ctx)) },
    'Energy Support': energySearch('Energy Support', { filter: 'energyType', type: 'psychic', bench: true }),
  },
  // Goldeen – Knock Away.
  'ecard2-78': { 'Knock Away': flipForMore(10, 10) },
  // Grimer – Poison Sludge.
  'ecard2-79': { 'Poison Sludge': flipToInflict(0, 'poisoned') },
  // Growlithe – Roar: the opponent switches the Defending Pokémon; Firebreathing.
  'ecard2-80': { Roar: { run: (ctx) => opponentSwitches(ctx, 'Roar') }, Firebreathing: flipForMore(10, 10) },
  // Hitmonchan – Rush: 5 coins; it can't attack next turn. Smash Punch.
  'ecard2-81': {
    Rush: {
      run(ctx) {
        ctx.hit(10 * ctx.flips(5));
        (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
      },
    },
    'Smash Punch': flipOrNothing(50),
  },
  // Hitmontop – Double Kick; Triple Spin: 2 or more heads switches it with the chosen Benched Pokémon.
  'ecard2-82': {
    'Double Kick': perHeads(2, 20),
    'Triple Spin': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to switch with Hitmontop (on 2 or more heads)' }] : [];
      },
      run(ctx) {
        const heads = ctx.flips(3);
        ctx.hit(20 * heads);
        const slot = ctx.choices.ownBenchSlot;
        if (heads >= 2 && slot !== undefined && slot >= 0) ctx.switchOwn(slot);
      },
    },
  },
  // Hoppip – Careless Tackle.
  'ecard2-83': { 'Careless Tackle': recoil(20, 10) },
  // Horsea – Bubble.
  'ecard2-84': { Bubble: flipToInflict(10, 'paralyzed') },
  // Horsea – Reverse Thrust.
  'ecard2-85': { 'Reverse Thrust': hideAway(20) },
  // Houndour – Singe.
  'ecard2-86': { Singe: flipToInflict(0, 'burned') },
  // Houndour – Feint Attack: 20 to the chosen Pokémon, nothing on it changing the damage.
  'ecard2-87': { 'Feint Attack': anyOpponent(20, { swift: true }) },
  // Kangaskhan – Baby Outing: one of the top 3 cards into the hand, the rest shuffled back.
  'ecard2-88': {
    'Baby Outing': {
      run(ctx) {
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromTop', source: 'Baby Outing', looked: ctx.me.deck.slice(0, 3).map((c) => c.uid), take: 1, shuffleRest: true });
      },
    },
  },
  // Larvitar – Mountain Eater: the opponent discards the top card of their deck; a damage counter off Larvitar. Rising Lunge.
  'ecard2-89': {
    'Mountain Eater': {
      run(ctx) {
        const [top] = ctx.opp.deck.splice(0, 1);
        if (top) {
          ctx.opp.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, ctx.opp.id);
        }
        ctx.heal(10);
      },
    },
    'Rising Lunge': flipForMore(10, 10),
  },
  // Lickitung – Long Tongue; Body Slam.
  'ecard2-90': { 'Long Tongue': anyOpponent(10), 'Body Slam': flipToInflict(20, 'paralyzed') },
  // Magnemite – Magnetic Bomb.
  'ecard2-91': { 'Magnetic Bomb': thrash(20) },
  // Mankey – Mug: discards the Trainer cards attached to the Defending Pokémon first; Rage.
  'ecard2-92': {
    Mug: {
      run(ctx) {
        discardDefenderTrainers(ctx);
        ctx.hit(10);
      },
    },
    Rage: { run: (ctx) => void ctx.hit(10 + ctx.attacker.damage) },
  },
  // Mareep – Charge: a Lightning Energy card from the discard pile attached to Mareep.
  'ecard2-93': {
    Charge: {
      run(ctx) {
        if (discardFree(ctx)) attachFromDiscard(ctx, (c) => isEnergyCardOf(c, ctx.state.cards, 'lightning') && isBasicEnergy(lookupCard(ctx.state.cards, c.defId)));
      },
    },
  },
  // Miltank – Continuous Tumble.
  'ecard2-94': { 'Continuous Tumble': { run: (ctx) => void ctx.hit(20 * headsUntilTails(ctx)) } },
  // Nidoran ♂ – Poison Horn.
  'ecard2-96': { 'Poison Horn': flipToInflict(0, 'poisoned') },
  // Oddish – Stun Spore.
  'ecard2-97': { 'Stun Spore': flipToInflict(0, 'paralyzed') },
  // Onix – Crush: a coin for each Energy attached.
  'ecard2-98': { Crush: { run: (ctx) => void ctx.hit(20 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).length)) } },
  // Paras – Spore; Spore Evolution: a card that evolves from Paras, from the deck, evolves it.
  'ecard2-99': {
    Spore: inflicts(0, 'asleep'),
    'Spore Evolution': {
      run(ctx) {
        const names = evolutionsOf(ctx, ctx.attackerDef.name);
        if (ctx.me.deck.some((c) => names.includes(lookupCard(ctx.state.cards, c.defId).name))) return ctx.pend({ kind: 'evolveFromDeck', source: 'Spore Evolution', target: 'active', names });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Found nothing in the deck.');
      },
    },
  },
  // Phanpy – Flail.
  'ecard2-100': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Pinsir – Horn Grab: heads 20 and Paralyzed, tails nothing; Super Slice: any tails, nothing.
  'ecard2-101': {
    'Horn Grab': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Horn Grab did nothing.');
        ctx.hit(20);
        ctx.inflict('paralyzed');
      },
    },
    'Super Slice': {
      run(ctx) {
        if (ctx.flips(2) < 2) return ctx.log('Super Slice did nothing.');
        ctx.hit(90);
      },
    },
  },
  // Ponyta – Ember.
  'ecard2-102': { Ember: discardToUse(30, 1, 'fire') },
  // Remoraid – Splatter.
  'ecard2-105': { Splatter: anyOpponent(10) },
  // Scyther – Swift.
  'ecard2-106': { Swift: swift(20) },
  // Sentret – Spy: look at the top 3 cards of the opponent's deck; Double Scratch.
  'ecard2-107': {
    Spy: {
      run(ctx) {
        if (ctx.opp.deck.length) ctx.pend({ kind: 'lookOppDeck', source: 'Spy', count: 3 });
      },
    },
    'Double Scratch': perHeads(2, 10),
  },
  // Slowpoke – Fishing Tail: a Baby, Basic or Evolution card or a basic Energy card from the discard pile into the hand.
  'ecard2-108': {
    'Fishing Tail': {
      run(ctx) {
        const fits = (c: CardInstance) => isPokemonCard(lookupCard(ctx.state.cards, c.defId)) || isBasicEnergy(lookupCard(ctx.state.cards, c.defId));
        if (ctx.me.discard.some(fits) && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Fishing Tail', count: 1, filter: 'pokemonOrBasicEnergy', reveal: true });
      },
    },
  },
  // Smeargle – Paint Trick: heads Confused; then Smeargle switches with the chosen Benched Pokémon. Doubleslap.
  'ecard2-109': {
    'Paint Trick': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to switch Smeargle with' }] : [];
      },
      run(ctx) {
        if (ctx.flip()) ctx.inflict('confused');
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchOwn(slot);
      },
    },
    Doubleslap: perHeads(2, 20),
    Doublslap: perHeads(2, 20),
  },
  // Sneasel – Rob: the Technical Machine and Pokémon Tool cards in the opponent's hand go into their deck; Claw.
  'ecard2-110': {
    Rob: {
      run(ctx) {
        const robbed = ctx.opp.hand.filter((c) => !!trainerEffect(c.defId)?.tool || !!trainerEffect(c.defId)?.technicalMachine);
        ctx.log(`Looked at the opponent's hand: ${robbed.length ? robbed.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') : 'no Technical Machine or Pokémon Tool cards'}.`);
        if (!robbed.length) return;
        ctx.opp.hand = ctx.opp.hand.filter((c) => !robbed.includes(c));
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, ...robbed], ctx.state.rngState);
        ctx.log(`Shuffled ${robbed.length} card${robbed.length === 1 ? '' : 's'} into the deck.`, ctx.opp.id);
      },
    },
    Claw: flipOrNothing(30),
  },
  // Spinarak – Sharp Stinger.
  'ecard2-111': { 'Sharp Stinger': eitherCondition(0, 'poisoned', 'paralyzed') },
  // Tangela – Tickling Vines: heads, the Defending Pokémon can't attack next turn; Double Kick.
  'ecard2-112': {
    'Tickling Vines': {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
        });
      },
    },
    'Double Kick': perHeads(2, 30),
  },
  // Tentacool – Poison Sting; Recover.
  'ecard2-113': { 'Poison Sting': flipToInflict(0, 'poisoned'), Recover: recover('water', 'Discard 1 Water Energy card attached to Tentacool in order to use this attack. Remove all damage counters from Tentacool.') },
  // Togepi – Minor Errand-Running: 2 coins, a basic Energy card from the deck for each heads.
  'ecard2-114': {
    'Minor Errand-Running': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Minor Errand-Running did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Minor Errand-Running', filter: 'basicEnergy', reveal: true, count: heads, optional: true });
      },
    },
  },
  // Voltorb – Swift.
  'ecard2-115': { Swift: swift(20) },
  // Vulpix – Collect Fire.
  'ecard2-116': { 'Collect Fire': plasma(10, 'fire') },
  // Wooper – Bubble.
  'ecard2-117': { Bubble: flipToInflict(10, 'paralyzed') },
  // Kingdra – Aquabomb: 10 to itself; Dual Burn: 2 coins, an Energy card discarded for each tails (the ones chosen, in order).
  'ecard2-148': {
    Aquabomb: recoil(40, 10),
    'Dual Burn': {
      choices(s): ChoiceSpec[] {
        const own = energyCards(s.attacker);
        return own.length > 1 && new Set(own.map((e) => e.defId)).size > 1 ? [{ kind: 'ownEnergy', count: Math.min(2, own.length), options: own, prompt: 'Choose the Energy cards to discard if you flip tails (the first for 1 tails)' }] : [];
      },
      run(ctx) {
        ctx.hit(60);
        const tails = 2 - ctx.flips(2);
        if (!tails) return;
        const chosen = (ctx.choices.energyUids ?? []).flatMap((uid) => ctx.attacker.energy.filter((e) => e.uid === uid));
        const own = energyCards(ctx.attacker);
        discardFromAttacker(ctx, [...chosen, ...own.filter((e) => !chosen.includes(e))].slice(0, tails));
      },
    },
  },
  // Lugia – Psychic: 10 for each Energy card on the Defending Pokémon; Steam Blast: discards an Energy card after the damage.
  'ecard2-149': {
    Psychic: { run: (ctx) => void ctx.hit(10 * energyCards(ctx.defender).length) },
    'Steam Blast': {
      choices(s): ChoiceSpec[] {
        const own = energyCards(s.attacker);
        return new Set(own.map((e) => e.defId)).size > 1 ? [{ kind: 'ownEnergy', count: 1, options: own, prompt: 'Choose an Energy card to discard from Lugia after the damage' }] : [];
      },
      run(ctx) {
        ctx.hit(50);
        const chosen = ctx.attacker.energy.find((e) => e.uid === ctx.choices.energyUids?.[0]) ?? energyCards(ctx.attacker)[0];
        if (chosen && ctx.me.active === ctx.attacker) discardFromAttacker(ctx, [chosen]);
      },
    },
  },
  // Nidoking – Poison Horn; Rolling Thunder: heads 10 to each of the opponent's Benched Pokémon, tails to each of its player's.
  'ecard2-150': {
    'Poison Horn': inflicts(20, 'poisoned'),
    'Rolling Thunder': {
      run(ctx) {
        ctx.hit(50);
        ctx.benchDamage(ctx.flip() ? ctx.opp : ctx.me, 10);
      },
    },
  },

  // The Technical Machines' attacks (ecard2-trainers.ts): Darkness Cube 01's Plunder discards the Defending Pokémon's Trainer
  // cards first; Fighting Cube 01's Violent Rage flips a coin for each damage counter on its Pokémon; Lightning Cube 01's
  // Discharge discards its Lightning Energy cards, a coin for each; Metal Cube 01's Metal Reversal may switch in a Benched
  // Pokémon first; Water Cube 01's Splatter does 20 to the chosen Pokémon without Weakness or Resistance.
  'ecard2-119': {
    Plunder: {
      run(ctx) {
        discardDefenderTrainers(ctx);
        ctx.hit(10);
      },
    },
  },
  'ecard2-121': { 'Violent Rage': { run: (ctx) => void ctx.hit(10 * ctx.flips(Math.floor(ctx.attacker.damage / 10))) } },
  'ecard2-122': { Singe: inflicts(0, 'burned') },
  'ecard2-124': {
    'Sleep Poison': {
      run(ctx) {
        ctx.inflict('asleep');
        ctx.inflict('poisoned');
      },
    },
  },
  'ecard2-127': { Discharge: dischargeLike(0, 40, 'lightning') },
  'ecard2-129': {
    'Metal Reversal': {
      choices: (s) => mayChooseBench(s, "Switch one of your opponent's Benched Pokémon with the Defending Pokémon first?"),
      run(ctx) {
        switchChosen(ctx);
        ctx.hit(10);
      },
    },
  },
  'ecard2-132': { 'Psy Confuse': inflicts(0, 'confused') },
  'ecard2-140': { Splatter: anyOpponent(20) },
};
