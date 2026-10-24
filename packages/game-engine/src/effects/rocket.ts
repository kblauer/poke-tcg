// Team Rocket (base5) attack effects, by card id and attack name. Rulings follow the 1999 rulebook; where
// TCGdex's text differs from the printed card (it drops energy icons), `text` has the printed wording, and
// `damage`/`cost` the printed numbers. Attacks that only deal damage need no entry. Cards 18–31 are the
// non-holo prints of 1–14.
// Rulings (agreed): Mirror Shell does exactly the damage Dark Wartortle took back to the attacker, with no
// Weakness, Resistance or anything else. Rapid Evolution has no evolution limits (only effects that stop
// evolution, like Prehistoric Power, block it). Vanish can be used with no benched Pokémon (with none left in
// play, its player loses). Dark Magneton is Sonicboom (CC) 20 and Magnetic Lines (LL) 30 (TCGdex has both prints wrong).
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { activeLocked, isEnergyCardOf, type CardInstance, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { evolutionBlocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { BASE1 } from './base1.js';
import {
  benchedSlots,
  damageOpponent,
  discardDefenderEnergy,
  discardToUse,
  energyCanMove,
  extraEnergy,
  flipToInflict,
  inflicts,
  opponentBenchChoice,
  opponentSwitches,
  opponentTargets,
  perHeads,
  same,
} from './common.js';
import { flipForMore, rage } from './jungle.js';

/** Base damage, or nothing on tails (Giant Tail, Fickle Attack, Hyper Fang). */
export const flipOrNothing = (damage: number): AttackEffect => ({
  run(ctx) {
    if (ctx.flip()) ctx.hit(damage);
    else ctx.log('The attack did nothing.');
  },
});

/** Choose 1 of the opponent's Pokémon: `damage` to it, without Weakness and Resistance (Flitter, Dig Under). */
const anyOpponent = (damage: number): AttackEffect => ({
  choices: (s) => opponentTargets(s, `Choose one of your opponent's Pokémon to do ${damage} damage to`),
  run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', damage),
});

/** Base damage without Weakness and Resistance (Mind Shock, Sonicboom). */
const noWeakness = (damage: number): AttackEffect => ({ run: (ctx) => void ctx.hit(damage, { weakness: false }) });

/** The Fire Energy cards attached to a Pokémon (basic ones and Rainbow Energy; not Double Colorless, nor a Buzzap'd Electrode). */
const fireCards = (cards: AttackSituation['cards'], p: InPlayPokemon) => p.energy.filter((e) => isEnergyCardOf(e, cards, 'fire'));

/** Discards Energy cards from the attacker, logging it. */
function discardFromAttacker(ctx: AttackContext, gone: CardInstance[]) {
  if (!gone.length) return;
  ctx.attacker.energy = ctx.attacker.energy.filter((e) => !gone.includes(e));
  ctx.me.discard.push(...gone);
  ctx.log(`${ctx.attackerDef.name} discarded ${gone.length} Energy.`);
}

/** Shuffles a Pokémon in play and every card with it into its owner's deck, emptying its spot (Fling, Vanish). */
export function shuffleIntoDeck(ctx: AttackContext, owner: PlayerState, target: Target, discardAttached: boolean) {
  const p = (target === 'active' ? owner.active : owner.bench[target])!;
  // An Active Pokémon held by Jaw Clamp stays where it is.
  const locked = target === 'active' && activeLocked(ctx.state, owner.id);
  if (locked) return ctx.log(`${locked}.`, owner.id);
  const attached = [...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card)];
  const cards = [...p.evolvedFrom, p.card, ...(discardAttached ? [] : attached)];
  if (discardAttached) owner.discard.push(...attached);
  [owner.deck, ctx.state.rngState] = shuffle([...owner.deck, ...cards], ctx.state.rngState);
  if (target === 'active') owner.active = null;
  else owner.bench[target] = null;
  ctx.log(`${pokemonName(ctx.state, p)} was shuffled into the deck.`, owner.id);
}

/** "This attack can't be used if your opponent has no Benched Pokémon" (Fling, Drag Off, Fascinate). */
const needsOpponentBench = (s: AttackSituation) => (benchedSlots(s.opponentBench).length ? null : 'Your opponent has no benched Pokémon');

/** Mass Explosion's Pokémon. */
const EXPLODERS = ['Koffing', 'Weezing', 'Dark Weezing'];

/** Use only with Fire Energy cards attached; heads discards one of them (Fireball, Playing with Fire). */
const withFire = (s: AttackSituation) => (fireCards(s.cards, s.attacker).length ? null : 'There are no Fire Energy cards attached');

const HOLO: Record<string, Record<string, AttackEffect>> = {
  // Dark Alakazam
  'base5-1': {
    'Teleport Blast': {
      // "You may switch": -1 keeps Dark Alakazam where it is.
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options: [...options, -1], optional: true, prompt: 'You may switch Dark Alakazam with one of your benched Pokémon' }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchOwn(slot);
      },
    },
    'Mind Shock': noWeakness(40),
  },
  // Dark Arbok
  'base5-2': {
    Stare: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 10 damage to (its Pokémon Power stops working)"),
      run(ctx) {
        const target = ctx.choices.oppTarget ?? 'active';
        const p = (target === 'active' ? ctx.opp.active : ctx.opp.bench[target])!;
        if (!ctx.canAffect(ctx.opp, p)) return;
        damageOpponent(ctx, target, 10);
        if (!inPlayDef(ctx.state.cards, p).power) return;
        // Until the end of the opponent's next turn, wherever it goes (betweenTurns clears it).
        p.powerOffUntil = ctx.turn + 1;
        ctx.log(`${pokemonName(ctx.state, p)}'s ${inPlayDef(ctx.state.cards, p).power!.name} stops working until the end of the next turn.`, ctx.opp.id);
      },
    },
    'Poison Vapor': {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('poisoned');
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Dark Blastoise
  'base5-3': {
    Hydrocannon: { run: (ctx) => void ctx.hit(30 + 20 * extraEnergy(ctx, ['water', 'water'], 'water', 2)) },
    'Rocket Tackle': {
      run(ctx) {
        ctx.hit(40);
        ctx.selfDamage(10);
        if (ctx.flip()) {
          ctx.protect('preventDamage');
          ctx.log(`Damage done to ${ctx.attackerDef.name} next turn is prevented.`);
        }
      },
    },
  },
  // Dark Charizard
  'base5-4': {
    'Continuous Fireball': {
      run(ctx) {
        const heads = ctx.flips(ctx.attacker.energy.length);
        ctx.hit(50 * heads);
        if (!heads) return;
        // Discard as many Energy cards as heads: the player picks which, unless it makes no difference.
        const energy = ctx.attacker.energy;
        if (heads >= energy.length || new Set(energy.map((e) => e.defId)).size === 1) return discardFromAttacker(ctx, energy.slice(-heads));
        ctx.pend({ kind: 'discardAttached', source: 'Continuous Fireball', target: 'active', count: heads });
      },
    },
  },
  // Dark Dragonite
  'base5-5': { 'Giant Tail': flipOrNothing(70) },
  // Dark Dugtrio
  'base5-6': {
    // The opponent flips: tails does 20 more.
    'Knock Down': { run: (ctx) => void ctx.hit(ctx.oppFlip() ? 20 : 40) },
  },
  // Dark Golbat
  'base5-7': { Flitter: anyOpponent(20) },
  // Dark Gyarados
  'base5-8': { 'Ice Beam': flipToInflict(30, 'paralyzed') },
  // Dark Hypno
  'base5-9': {
    'Bench Manipulation': {
      run(ctx) {
        const coins = benchedSlots(ctx.opp.bench).length;
        let tails = 0;
        for (let i = 0; i < coins; i++) if (!ctx.oppFlip()) tails++;
        if (!tails) return ctx.log('Bench Manipulation did no damage.');
        ctx.hit(20 * tails, { weakness: false });
      },
    },
  },
  // Dark Machamp
  'base5-10': {
    Fling: {
      blocked: needsOpponentBench,
      run(ctx) {
        if (ctx.canAffect(ctx.opp, ctx.defender)) shuffleIntoDeck(ctx, ctx.opp, 'active', false);
      },
    },
  },
  // Dark Magneton
  'base5-11': {
    Sonicboom: { ...noWeakness(20), cost: ['colorless', 'colorless'], damage: '20' },
    'Magnetic Lines': {
      damage: '30',
      choices(s): ChoiceSpec[] {
        const basic = s.defender.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)));
        if (!basic.length || !benchedSlots(s.opponentBench).length) return [];
        return [
          { kind: 'defenderEnergy', options: basic, prompt: "Choose a basic Energy card on the Defending Pokémon to move to your opponent's Bench" },
          ...opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to attach it to"),
        ];
      },
      run(ctx) {
        ctx.hit(30);
        const { defenderEnergyUid: uid, benchSlot } = ctx.choices;
        const to = benchSlot === undefined ? null : ctx.opp.bench[benchSlot];
        if (!uid || !to || !ctx.opp.active) return;
        ctx.affectDefender(() => {
          const defender = ctx.opp.active!;
          const energy = defender.energy.find((e) => e.uid === uid);
          if (!energy || !energyCanMove(ctx, defender)) return;
          defender.energy = defender.energy.filter((e) => e !== energy);
          to.energy.push(energy);
          ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
        });
      },
    },
  },
  // Dark Slowbro
  'base5-12': { 'Fickle Attack': flipOrNothing(40) },
  // Dark Vileplume
  'base5-13': {
    'Petal Whirlwind': {
      run(ctx) {
        const heads = ctx.flips(3);
        ctx.hit(30 * heads);
        if (heads >= 2) ctx.confuseSelf();
      },
    },
  },
  // Dark Weezing
  'base5-14': {
    'Mass Explosion': {
      run(ctx) {
        const explodes = (p: InPlayPokemon | null) => !!p && EXPLODERS.includes(inPlayDef(ctx.state.cards, p).name);
        const count = [ctx.me, ctx.opp].reduce((n, side) => n + [side.active, ...side.bench].filter(explodes).length, 0);
        ctx.hit(20 * count);
        // Then 20 to every Koffing, Weezing and Dark Weezing in play, on both sides, without Weakness and Resistance.
        if (explodes(ctx.opp.active)) ctx.hit(20, { weakness: false });
        for (const slot of benchedSlots(ctx.opp.bench)) if (explodes(ctx.opp.bench[slot]!)) ctx.damageBenched(ctx.opp, slot, 20);
        for (const slot of benchedSlots(ctx.me.bench)) if (explodes(ctx.me.bench[slot]!)) ctx.damageBenched(ctx.me, slot, 20);
        if (explodes(ctx.attacker)) ctx.selfDamage(20);
      },
    },
    'Stun Gas': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict(ctx.flip() ? 'poisoned' : 'paralyzed');
      },
    },
  },
};

/** The Fire Energy text TCGdex drops from Fireball and Playing with Fire. */
const FIRE = (name: string) => `Use this attack only if there are any Fire Energy cards attached to ${name}.`;

export const ROCKET: Record<string, Record<string, AttackEffect>> = {
  ...HOLO,
  ...Object.fromEntries(Object.entries(HOLO).map(([id, effects]) => [`base5-${Number(id.slice(6)) + 17}`, effects])),
  // Dark Charmeleon
  'base5-32': {
    Fireball: {
      text: `${FIRE('Dark Charmeleon')} Flip a coin. If heads, discard 1 of those Energy cards. If tails, this attack does nothing (not even damage).`,
      blocked: withFire,
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fireball did nothing.');
        discardFromAttacker(ctx, fireCards(ctx.state.cards, ctx.attacker).slice(0, 1));
        ctx.hit(70);
      },
    },
  },
  // Dark Dragonair
  'base5-33': { 'Tail Strike': flipForMore(20, 20) },
  // Dark Electrode
  'base5-34': {
    'Energy Bomb': {
      run(ctx) {
        ctx.hit(30);
        const energy = ctx.attacker.energy;
        if (!energy.length) return;
        ctx.attacker.energy = [];
        const bench = benchedSlots(ctx.me.bench);
        if (!bench.length) {
          ctx.me.discard.push(...energy.map(({ provides: _, ...card }) => card));
          return ctx.log(`${ctx.attackerDef.name} discarded its ${energy.length} Energy (no benched Pokémon).`);
        }
        // With one benched Pokémon there's nothing to choose; otherwise each card goes where the player clicks.
        if (bench.length === 1) {
          const to = ctx.me.bench[bench[0]!]!;
          to.energy.push(...energy);
          return ctx.log(`Moved ${energy.length} Energy to ${pokemonName(ctx.state, to)}.`);
        }
        ctx.pend({ kind: 'distributeEnergy', source: 'Energy Bomb', cards: energy });
      },
    },
  },
  // Dark Flareon
  'base5-35': {
    Rage: rage(10),
    'Playing with Fire': {
      text: `${FIRE('Dark Flareon')} Flip a coin. If heads, discard 1 of those Energy cards and this attack does 30 damage plus 20 more damage; if tails, this attack does 30 damage.`,
      blocked: withFire,
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(30);
        discardFromAttacker(ctx, fireCards(ctx.state.cards, ctx.attacker).slice(0, 1));
        ctx.hit(50);
      },
    },
  },
  // Dark Gloom
  'base5-36': { Poisonpowder: inflicts(10, 'poisoned') },
  // Dark Golduck
  'base5-37': {
    'Third Eye': {
      discard: { count: 1 },
      run(ctx) {
        if (!ctx.me.deck.length) return ctx.log('No cards left to draw.');
        ctx.pend({ kind: 'drawCount', source: 'Third Eye', max: 3 });
      },
    },
  },
  // Dark Jolteon
  'base5-38': {
    'Lightning Flash': {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => {
          e.sandAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} needs heads to attack next turn.`);
        });
      },
    },
    'Thunder Attack': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.inflict('paralyzed');
        else ctx.selfDamage(10);
      },
    },
  },
  // Dark Kadabra
  'base5-39': { 'Mind Shock': noWeakness(30) },
  // Dark Machoke
  'base5-40': {
    'Drag Off': {
      blocked: needsOpponentBench,
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to drag in (it takes the damage)"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.hit(20);
      },
    },
    'Knock Back': {
      run(ctx) {
        ctx.hit(30);
        opponentSwitches(ctx, 'Knock Back');
      },
    },
  },
  // Dark Muk
  'base5-41': { 'Sludge Punch': inflicts(20, 'poisoned') },
  // Dark Persian
  'base5-42': {
    Fascinate: {
      blocked: needsOpponentBench,
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to switch in (on heads)"),
      run(ctx) {
        if (ctx.flip() && ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
        else ctx.log('Fascinate did nothing.');
      },
    },
    'Poison Claws': flipToInflict(10, 'poisoned'),
  },
  // Dark Primeape
  'base5-43': {
    'Frenzied Attack': {
      run(ctx) {
        ctx.hit(40);
        ctx.confuseSelf();
      },
    },
  },
  // Dark Rapidash
  'base5-44': {
    'Flame Pillar': {
      text: 'You may discard 1 Fire Energy card attached to Dark Rapidash when you use this attack. If you do and if your opponent has any Benched Pokémon, choose 1 of them and this attack does 10 damage to it. (Don\'t apply Weakness and Resistance for Benched Pokémon.)',
      choices(s): ChoiceSpec[] {
        const fire = fireCards(s.cards, s.attacker);
        if (!fire.length) return [];
        return [
          { kind: 'ownEnergyUpTo', options: fire, max: 1, prompt: 'You may discard a Fire Energy card (then 10 damage to a benched Pokémon)' },
          ...opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon for 10 damage (if you discard)"),
        ];
      },
      run(ctx) {
        const discarded = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        discardFromAttacker(ctx, discarded);
        ctx.hit(30);
        if (discarded.length && ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 10);
      },
    },
  },
  // Dark Vaporeon
  'base5-45': { Whirlpool: discardDefenderEnergy(20) },
  // Dark Wartortle
  'base5-46': {
    Doubleslap: perHeads(2, 10),
    'Mirror Shell': {
      run(ctx) {
        ctx.protect('mirrorShell');
        ctx.log(`Attack damage to ${ctx.attackerDef.name} next turn is done back to the attacker.`);
      },
    },
  },
  // Magikarp
  'base5-47': {
    'Rapid Evolution': {
      run(ctx) {
        const blocked = evolutionBlocked([ctx.me, ctx.opp], ctx.state.cards);
        if (blocked) return ctx.log(`Rapid Evolution: ${blocked}.`);
        ctx.pend({ kind: 'evolveFromDeck', source: 'Rapid Evolution', target: 'active', names: ['Gyarados', 'Dark Gyarados'] });
      },
    },
  },
  // Porygon
  'base5-48': { 'Conversion 1': same(() => BASE1['base1-39']?.['Conversion 1']), Psybeam: flipToInflict(20, 'confused') },
  // Abra
  'base5-49': {
    // With no benched Pokémon, its player is left with none in play and loses (agreed).
    Vanish: { run: (ctx) => shuffleIntoDeck(ctx, ctx.me, 'active', true) },
    Psyshock: flipToInflict(10, 'paralyzed'),
  },
  // Dark Raticate
  'base5-51': { 'Hyper Fang': flipOrNothing(50) },
  // Diglett
  'base5-52': { 'Dig Under': anyOpponent(10) },
  // Dratini
  'base5-53': { Wrap: flipToInflict(10, 'paralyzed') },
  // Drowzee
  'base5-54': { Nightmare: inflicts(10, 'asleep') },
  // Eevee
  'base5-55': { 'Sand-attack': same(() => BASE1['base1-62']?.['Sand-attack']) },
  // Ekans
  'base5-56': { 'Poison Sting': flipToInflict(20, 'poisoned') },
  // Grimer
  'base5-57': {
    'Poison Gas': inflicts(0, 'asleep'),
    'Sticky Hands': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(10);
        ctx.hit(30);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Koffing
  'base5-58': { 'Poison Gas': flipToInflict(20, 'poisoned') },
  // Magnemite
  'base5-60': {
    Magnetism: {
      run(ctx) {
        const magnets = ctx.me.bench.filter((p) => p && ['Magnemite', 'Magneton', 'Dark Magneton'].includes(inPlayDef(ctx.state.cards, p).name)).length;
        ctx.hit(10 + 10 * magnets);
      },
    },
  },
  // Mankey
  'base5-61': {
    Mischief: {
      run(ctx) {
        [ctx.opp.deck, ctx.state.rngState] = shuffle(ctx.opp.deck, ctx.state.rngState);
        ctx.log("Shuffled the opponent's deck.");
      },
    },
    Anger: flipForMore(20, 20),
  },
  // Meowth
  'base5-62': {
    'Coin Hurl': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon (heads: 20 damage to it)"),
      run(ctx) {
        if (ctx.flip()) damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 20);
        else ctx.log('Coin Hurl did nothing.');
      },
    },
  },
  // Oddish
  'base5-63': { 'Sleep Powder': inflicts(0, 'asleep'), Poisonpowder: inflicts(0, 'poisoned') },
  // Ponyta
  'base5-64': { Ember: discardToUse(30, 1, 'fire', 'Discard 1 Fire Energy card attached to Ponyta in order to use this attack.') },
  // Psyduck
  'base5-65': {
    Dizziness: { run: (ctx) => ctx.draw(1) },
    'Water Gun': {
      text: "Does 20 damage plus 10 more damage for each Water Energy attached to Psyduck but not used to pay for this attack. You can't add more than 20 damage in this way.",
      run: (ctx) => void ctx.hit(20 + 10 * extraEnergy(ctx, ['colorless', 'water'], 'water', 2)),
    },
  },
  // Rattata
  'base5-66': { 'Quick Attack': flipForMore(10, 10) },
  // Slowpoke
  'base5-67': {
    'Afternoon Nap': {
      text: 'Search your deck for a Psychic Energy card and attach it to Slowpoke. Shuffle your deck afterward.',
      run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Afternoon Nap', filter: 'energyType', type: 'psychic' as EnergyType, attachToActive: true }),
    },
  },
  // Dark Raichu
  'base5-83': {
    'Surprise Thunder': {
      run(ctx) {
        ctx.hit(30);
        if (!ctx.flip()) return;
        ctx.benchDamage(ctx.opp, ctx.flip() ? 20 : 10);
      },
    },
  },
};
