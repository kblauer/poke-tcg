// Fossil (base3) attack effects, by card id and attack name. Rulings follow the 1999 rulebook;
// where TCGdex's text differs from the printed card, `text` has the printed wording.
// Attacks that only deal damage need no entry. Cards 16–30 are the non-holo prints of 1–15.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { isTrainerCard, lookupCard, type EnergyType } from '../cards.js';
import { pokemonTower } from '../trainers.js';
import {
  benchedSlots,
  benchSearch,
  benchTarget,
  discardDefenderEnergy,
  extraEnergy,
  flipToInflict,
  flipToProtect,
  inflicts,
  leechLife,
  opponentSwitches,
  perHeads,
  selfdestruct,
} from './common.js';

/** "Water Gun": base damage plus 10 for each Water Energy beyond the cost, at most 20 more (TCGdex drops the Water icon). */
const waterGun = (damage: number, cost: EnergyType[], name: string, wording = 'in this way'): AttackEffect => ({
  text: `Does ${damage} damage plus 10 more damage for each Water Energy attached to ${name} but not used to pay for this attack's Energy cost. You can't add more than 20 damage ${wording}.`,
  run: (ctx) => void ctx.hit(damage + 10 * extraEnergy(ctx, cost, 'water', 2)),
});

/** Base damage; the Defending Pokémon needs heads to attack next turn (Smokescreen). */
const smokescreen = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.smokescreen = ctx.turn + 1;
      ctx.log(`${ctx.defenderDef.name} needs heads to attack next turn.`);
    });
  },
});

/** Pokémon Tower is in play, so cards from a discard pile can't go into the hand. */
const towerKeeps = (ctx: AttackContext) => pokemonTower({ stadium: ctx.state.stadium?.card, cards: ctx.state.cards });

/** Energy cards in the attacking player's discard pile. */
const discardEnergy = (s: AttackSituation) => s.ownDiscard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');

const darkMind = benchTarget(30, 10);
const supersonic = flipToInflict(0, 'confused');
const furySwipes = (damage: number) => perHeads(3, damage);
const spikeCannon = perHeads(2, 30);

const HOLO: Record<string, Record<string, AttackEffect>> = {
  // Articuno
  'base3-2': {
    'Freeze Dry': flipToInflict(30, 'paralyzed'),
    Blizzard: {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flip()) ctx.benchDamage(ctx.opp, 10);
        else ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Dragonite
  'base3-4': { Slam: perHeads(2, 40) },
  // Gengar
  'base3-5': { 'Dark Mind': darkMind },
  // Haunter
  'base3-6': { Nightmare: inflicts(10, 'asleep') },
  // Hitmonlee
  'base3-7': { 'Stretch Kick': benchTarget(0, 20) },
  // Hypno
  'base3-8': {
    Prophecy: {
      choices: (): ChoiceSpec[] => [{ kind: 'deck', options: ['own', 'opponent'], prompt: "Choose whose deck to look at the top 3 cards of" }],
      run(ctx) {
        const owner = ctx.choices.deck === 'opponent' ? ctx.opp : ctx.me;
        const count = Math.min(3, owner.deck.length);
        if (!count) return ctx.log('Prophecy found no cards to look at.');
        ctx.log(`Looked at the top ${count} cards of ${owner === ctx.me ? 'their own' : "the opponent's"} deck.`);
        ctx.pend({ kind: 'arrangeTop', source: 'Prophecy', count, deckOwner: owner.id });
      },
    },
    'Dark Mind': darkMind,
  },
  // Kabutops
  'base3-9': {
    Absorb: {
      // Half the damage done, rounded up to the nearest 10.
      run: (ctx) => ctx.heal(Math.ceil(ctx.hit(40) / 20) * 10),
    },
  },
  // Lapras
  'base3-10': { 'Water Gun': waterGun(10, ['water'], 'Lapras', 'this way'), 'Confuse Ray': flipToInflict(10, 'confused') },
  // Magneton
  'base3-11': {
    Sonicboom: { run: (ctx) => void ctx.hit(20, { weakness: false }) },
    Selfdestruct: selfdestruct(100, 20),
  },
  // Moltres
  'base3-12': {
    Wildfire: {
      text: 'You may discard any number of Fire Energy cards attached to Moltres when you use this attack. If you do, discard that many cards from the top of your opponent\'s deck.',
      choices(s): ChoiceSpec[] {
        // Fire Energy cards: not Double Colorless, and not energy that only counts as Fire (Energy Burn).
        const options = s.attacker.energy.filter((e) => {
          const d = lookupCard(s.cards, e.defId);
          return !e.provides && d.kind === 'energy' && d.energyType === 'fire' && d.basic !== false;
        });
        return options.length ? [{ kind: 'ownEnergyUpTo', options, prompt: "Choose any number of Fire Energy to discard (each discards the top card of your opponent's deck)" }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        if (!uids.size) return ctx.log('Wildfire discarded nothing.');
        ctx.me.discard.push(...ctx.attacker.energy.filter((e) => uids.has(e.uid)));
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !uids.has(e.uid));
        ctx.log(`${ctx.attackerDef.name} discarded ${uids.size} Fire Energy.`);
        const milled = ctx.opp.deck.splice(0, uids.size);
        ctx.opp.discard.push(...milled);
        ctx.log(`Discarded ${milled.length} card${milled.length === 1 ? '' : 's'} from the top of the deck.`);
      },
    },
    'Dive Bomb': {
      run(ctx) {
        if (ctx.flip()) ctx.hit(80);
        else ctx.log('Dive Bomb did nothing.');
      },
    },
  },
  // Muk
  'base3-13': { Sludge: flipToInflict(30, 'poisoned') },
  // Raichu
  'base3-14': {
    Gigashock: {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBenchMany', count: 3, options, prompt: "Choose 3 of your opponent's benched Pokémon to do 10 damage to" }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        for (const slot of ctx.choices.benchSlots ?? []) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Zapdos
  'base3-15': {
    Thunderstorm: {
      run(ctx) {
        ctx.hit(40);
        let tails = 0;
        for (const slot of benchedSlots(ctx.opp.bench)) {
          if (ctx.flip()) ctx.damageBenched(ctx.opp, slot, 20);
          else tails++;
        }
        if (tails) ctx.selfDamage(10 * tails);
      },
    },
  },
};

export const FOSSIL: Record<string, Record<string, AttackEffect>> = {
  ...HOLO,
  ...Object.fromEntries(Object.entries(HOLO).map(([id, effects]) => [`base3-${Number(id.slice(6)) + 15}`, effects])),
  // Arbok
  'base3-31': {
    'Terror Strike': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) opponentSwitches(ctx, 'Terror Strike');
      },
    },
    'Poison Fang': inflicts(20, 'poisoned'),
  },
  // Cloyster
  'base3-32': {
    Clamp: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Clamp did nothing.');
        ctx.hit(30);
        ctx.inflict('paralyzed');
      },
    },
    'Spike Cannon': spikeCannon,
  },
  // Gastly
  'base3-33': {
    Lick: flipToInflict(10, 'paralyzed'),
    'Energy Conversion': {
      blocked: (s) => (discardEnergy(s).length ? null : 'There are no Energy cards in your discard pile'),
      choices: (s): ChoiceSpec[] => [
        { kind: 'ownDiscard', min: 1, max: 2, options: discardEnergy(s), prompt: 'Choose up to 2 Energy cards from your discard pile to put into your hand' },
      ],
      run(ctx) {
        const uids = new Set(ctx.choices.discardUids ?? []);
        const taken = ctx.me.discard.filter((c) => uids.has(c.uid));
        if (towerKeeps(ctx)) ctx.log('Pokémon Tower: the Energy cards stay in the discard pile.');
        else {
          ctx.me.discard = ctx.me.discard.filter((c) => !uids.has(c.uid));
          ctx.me.hand.push(...taken);
          ctx.log(`Put ${taken.length} Energy card${taken.length === 1 ? '' : 's'} from the discard pile into the hand.`);
        }
        ctx.selfDamage(10);
      },
    },
  },
  // Golbat
  'base3-34': { 'Leech Life': leechLife(20) },
  // Golduck
  'base3-35': { Psyshock: flipToInflict(10, 'paralyzed'), 'Hyper Beam': discardDefenderEnergy(20) },
  // Golem
  'base3-36': { Selfdestruct: selfdestruct(100, 20) },
  // Graveler
  'base3-37': { Harden: { run: (ctx) => ctx.protect('harden') } },
  // Kingler
  'base3-38': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Magmar
  'base3-39': { Smokescreen: smokescreen(10), Smog: flipToInflict(20, 'poisoned') },
  // Omastar
  'base3-40': { 'Water Gun': waterGun(20, ['water', 'colorless'], 'Omastar'), 'Spike Cannon': spikeCannon },
  // Sandslash
  'base3-41': { 'Fury Swipes': furySwipes(20) },
  // Seadra
  'base3-42': { 'Water Gun': waterGun(20, ['water', 'colorless'], 'Seadra'), Agility: flipToProtect(20, 'preventAll') },
  // Slowbro
  'base3-43': { Psyshock: flipToInflict(20, 'paralyzed') },
  // Tentacruel
  'base3-44': { Supersonic: supersonic, 'Jellyfish Sting': inflicts(10, 'poisoned') },
  // Weezing
  'base3-45': { Smog: flipToInflict(20, 'poisoned'), Selfdestruct: selfdestruct(60, 10) },
  // Ekans
  'base3-46': { 'Spit Poison': flipToInflict(0, 'poisoned'), Wrap: flipToInflict(20, 'paralyzed') },
  // Geodude
  'base3-47': {
    'Stone Barrage': {
      run(ctx) {
        let heads = 0;
        // Flip until tails (capped, in case of a very long run of heads).
        while (heads < 100 && ctx.flip()) heads++;
        ctx.hit(10 * heads);
      },
    },
  },
  // Grimer
  'base3-48': {
    'Nasty Goo': flipToInflict(10, 'paralyzed'),
    Minimize: {
      run(ctx) {
        ctx.protect('minimize');
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks next turn is reduced by 20.`);
      },
    },
  },
  // Horsea
  'base3-49': { Smokescreen: smokescreen(10) },
  // Krabby
  'base3-51': {
    'Call for Family': benchSearch('Call for Family', { filter: 'basicNamed', name: 'Krabby' }),
  },
  // Omanyte
  'base3-52': { 'Water Gun': waterGun(10, ['water'], 'Omanyte') },
  // Psyduck
  'base3-53': {
    Headache: {
      run(ctx) {
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("The opponent can't play Trainer cards next turn.");
      },
    },
    'Fury Swipes': furySwipes(10),
  },
  // Shellder
  'base3-54': { Supersonic: supersonic, 'Hide in Shell': flipToProtect(0, 'preventDamage') },
  // Slowpoke
  'base3-55': {
    'Spacing Out': {
      blocked: (s) => (s.attacker.damage === 0 ? 'Slowpoke has no damage counters' : null),
      run(ctx) {
        if (ctx.flip()) ctx.heal(10);
        else ctx.log('Spacing Out did nothing.');
      },
    },
    Scavenge: {
      text: 'Discard 1 Psychic Energy card attached to Slowpoke in order to use this attack. Put a Trainer card from your discard pile into your hand.',
      discard: { count: 1, type: 'psychic' },
      choices(s): ChoiceSpec[] {
        const options = s.ownDiscard.filter((c) => isTrainerCard(lookupCard(s.cards, c.defId)));
        return options.length ? [{ kind: 'ownDiscard', min: 1, max: 1, options, prompt: 'Choose a Trainer card from your discard pile to put into your hand' }] : [];
      },
      run(ctx) {
        const [uid] = ctx.choices.discardUids ?? [];
        const card = ctx.me.discard.find((c) => c.uid === uid);
        if (!card) return ctx.log('Scavenge found no Trainer card.');
        if (towerKeeps(ctx)) return ctx.log('Pokémon Tower: the Trainer card stays in the discard pile.');
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        ctx.me.hand.push(card);
        ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile into the hand.`);
      },
    },
  },
  // Zubat
  'base3-57': { Supersonic: supersonic, 'Leech Life': leechLife(10) },
};
