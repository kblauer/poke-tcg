// Gym Challenge (gym2) attack effects, by card id and attack name. Rulings follow the 1999 rulebook; `damage` has the
// printed number where TCGdex leaves it out (Hyper Needle, Earthdrill, Poison Power, Mega Peck, Risky Attack, Poison
// Sting Tackle, Ice Throw, Wild Kick, Horn Charge, Surprise Attack, Pulled Punch, Ancestral Memory, Horn Thrust).
// Attacks that only deal damage need no entry.
// Rulings: Roaring Flames discards every Fire Energy card attached (no card provides 2 Fire Energy). Bonfire discards a
// Fire Energy card per heads, as many as it has; with none to discard it does nothing. Lunar Power has no evolution
// limits besides what stops evolving (Prehistoric Power), as Rapid Evolution. Misty's Psyduck's ESP asks which attack to
// copy before the flips. Group Attack asks how many Koga's Zubat to bench (up to the room on the Bench) before searching.
import { targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicPokemon, isTrainerCard, lookupCard } from '../cards.js';
import { activeLocked, discardTheirEnergy, isEnergyCardOf, type CardInstance, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { evolutionBlocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { benchRoom, energyProtected, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { BASE1, metronome } from './base1.js';
import {
  benchedSlots,
  benchTarget,
  discardToUse,
  flipToInflict,
  flipToProtect,
  inflicts,
  opponentBenchChoice,
  perHeads,
  recoil,
  tailsSelfDamage,
} from './common.js';
import { smokescreen } from './fossil.js';
import { benchMany, discardEnergyOf, discardFromAttacker, noRetreat } from './gym1.js';
import { flipForMore } from './jungle.js';
import { flipOrNothing, shuffleIntoDeck } from './rocket.js';

/** The Fire (or Lightning…) Energy cards attached to the attacker, Rainbow Energy included. */
const cardsOf = (ctx: AttackContext, type: 'fire' | 'lightning' | 'psychic') => ctx.attacker.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, type));

const opponentTargets = (s: AttackSituation, prompt: string): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt }];

/** Damage to one of the opponent's Pokémon in play, without Weakness and Resistance. */
function damageOpponent(ctx: AttackContext, target: Target, amount: number) {
  if (target === 'active') ctx.hit(amount, { weakness: false });
  else ctx.damageBenched(ctx.opp, target, amount);
}

/** The attacker can't use this attack again while it stays in play, even benched (Hyper Needle, Ancestral Memory). */
const onceInPlay = (ctx: AttackContext, name: string) => {
  const effects = (ctx.attacker.effects ??= {});
  effects.usedOnce = [...(effects.usedOnce ?? []), name];
};

/** A Stadium in play is discarded, to its owner's discard pile (Detonate, Mega Thrash). */
function discardStadium(ctx: AttackContext) {
  const stadium = ctx.state.stadium;
  if (!stadium) return;
  ctx.state.players[stadium.owner]!.discard.push(stadium.card);
  ctx.state.stadium = null;
  ctx.log(`${lookupCard(ctx.state.cards, stadium.card.defId).name} was discarded.`, stadium.owner);
}

/** Heals up to `amount` from every damaged Pokémon of `player`. */
function healAll(ctx: AttackContext, player: PlayerState, amount: number) {
  for (const p of [player.active, ...player.bench]) {
    if (!p || p.damage < 10) continue;
    const healed = Math.min(amount, p.damage);
    p.damage -= healed;
    ctx.log(`${pokemonName(ctx.state, p)} healed ${healed} damage.`, player.id);
  }
}

/** Basic Fire or Lightning Energy cards in the attacking player's discard pile. */
const basicEnergyInDiscard = (ctx: AttackContext, type: 'fire' | 'lightning') => discardEnergyOf({ ownDiscard: ctx.me.discard, cards: ctx.state.cards } as AttackSituation, type);

/** Returns the attacker and every card with it to the attacking player's hand (Star Boomerang). */
function returnSelf(ctx: AttackContext) {
  const p = ctx.attacker;
  if (ctx.me.active !== p) return;
  const locked = activeLocked(ctx.state, ctx.me.id);
  if (locked) return ctx.log(`${locked}.`);
  ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
  ctx.me.active = null;
  ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it returned to the hand.`);
}

/** The defending player's benched Pokémon chosen, on heads, for `damage` (Shadow Attack, Overrun). */
const flipBench = (damage: number, bench: number): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, `Choose one of your opponent's benched Pokémon (heads: ${bench} damage to it)`),
  run(ctx) {
    ctx.hit(damage);
    const slot = ctx.choices.benchSlot;
    if (slot !== undefined && ctx.opp.bench[slot] && ctx.flip()) ctx.damageBenched(ctx.opp, slot, bench);
  },
});

/** Focus Energy: during the attacker's next turn, its named attack is stronger (Double-edge, Quick Attack). */
const focusEnergy = (attack: string): AttackEffect => ({
  run(ctx) {
    (ctx.attacker.effects ??= {}).focusEnergy = ctx.turn + 2;
    ctx.log(`${ctx.attackerDef.name}'s ${attack} is doubled next turn.`);
  },
});
const focused = (ctx: AttackContext) => ctx.attacker.effects?.focusEnergy === ctx.turn;

/** Base damage; heads, a Special Condition; tails, another (Strange Powder, Sharp Stinger). */
const eitherCondition = (damage: number, heads: 'confused' | 'poisoned' | 'paralyzed' | 'asleep', tails: 'confused' | 'poisoned' | 'paralyzed' | 'asleep'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.inflict(ctx.flip() ? heads : tails);
  },
});

/** Search the deck for a Basic Energy card of `type` and put it into the hand (Energy Support). */
const energySearch = (source: string, type: 'psychic' | 'fire'): AttackEffect => ({
  run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source, filter: 'energyType', type, reveal: true }),
});

/** Koga's Zubat. */
const ZUBAT = "Koga's Zubat";

export const GYM2: Record<string, Record<string, AttackEffect>> = {
  // Blaine's Arcanine
  'gym2-1': {
    'Heat Tackle': recoil(40, 10),
    Firestorm: discardToUse(120, 3, 'fire', "Discard 3 Fire Energy cards attached to Blaine's Arcanine in order to use this attack."),
  },
  // Blaine's Charizard
  'gym2-2': {
    'Roaring Flames': {
      run(ctx) {
        const fire = cardsOf(ctx, 'fire');
        discardFromAttacker(ctx, fire);
        ctx.hit(20 + 20 * fire.length);
      },
    },
    'Flame Jet': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon (heads: 40 damage to it)"),
      run(ctx) {
        if (ctx.flip()) damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 40);
        else ctx.log('Flame Jet did nothing.');
      },
    },
  },
  // Erika's Venusaur
  'gym2-4': {
    Growth: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Growth did nothing.');
        if (!discardEnergyOf({ ownDiscard: ctx.me.hand, cards: ctx.state.cards } as AttackSituation, 'grass').length) return ctx.log('No Grass Energy cards in the hand.');
        ctx.pend({ kind: 'attachFromHand', source: 'Growth', type: 'grass', count: 2 });
      },
    },
    'Wide Solarbeam': benchMany(2, 20, 20),
  },
  // Giovanni's Gyarados
  'gym2-5': {
    'Summon Storm': {
      run(ctx) {
        if (ctx.flips(2) < 2) return ctx.log('Summon Storm did nothing.');
        ctx.hit(20, { weakness: false });
        ctx.benchDamage(ctx.opp, 20);
        ctx.benchDamage(ctx.me, 20);
      },
    },
    'Dragon Tornado': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to switch in (unless the attack Knocks Out)"),
      run(ctx) {
        ctx.hit(40);
        const defender = ctx.opp.active;
        if (defender && defender.damage < inPlayDef(ctx.state.cards, defender).hp && ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
      },
    },
  },
  // Giovanni's Machamp
  'gym2-6': { 'Hurricane Punch': perHeads(4, 30) },
  // Giovanni's Nidoking
  'gym2-7': {
    Intimidate: {
      run(ctx) {
        if (ctx.defenderDef.hp > 50) return ctx.log(`${ctx.defenderDef.name} has more than 50 HP: Intimidate did nothing.`);
        const target = (ctx.attacker.evolvedFrom[0] ?? ctx.attacker.card).uid;
        ctx.affectDefender((e) => {
          e.cantAttack = { target, until: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name} can't attack ${ctx.attackerDef.name} next turn.`);
        });
      },
    },
    'Tumbling Attack': flipForMore(40, 30),
  },
  // Giovanni's Persian
  'gym2-8': { Ambush: flipForMore(20, 20) },
  // Koga's Beedrill
  'gym2-9': {
    'Nerve Poison': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
    'Hyper Needle': {
      damage: '70',
      run(ctx) {
        onceInPlay(ctx, 'Hyper Needle');
        if (ctx.flip()) ctx.hit(70);
        else ctx.log('Hyper Needle did nothing.');
      },
    },
  },
  // Koga's Ditto
  'gym2-10': {
    'Giant Growth': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Giant Growth did nothing.');
        (ctx.attacker.effects ??= {}).giantGrowth = true;
        ctx.log(`${ctx.attackerDef.name}'s maximum HP are now 80, and its Pound does 30.`);
      },
    },
    Pound: { run: (ctx) => void ctx.hit(ctx.attacker.effects?.giantGrowth ? 30 : 10) },
  },
  // Lt. Surge's Raichu
  'gym2-11': {
    Kerzap: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(20);
        ctx.hit(50);
        discardFromAttacker(ctx, cardsOf(ctx, 'lightning'));
      },
    },
    Thundertackle: {
      run(ctx) {
        ctx.hit(40);
        if (ctx.flip()) ctx.inflict('paralyzed');
        else ctx.selfDamage(20);
      },
    },
  },
  // Misty's Golduck
  'gym2-12': {
    'Electro Beam': {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.flip()) discardFromAttacker(ctx, ctx.attacker.energy.filter((e) => !e.provides));
      },
    },
    'Super Removal': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Super Removal did nothing.');
        const targets: Target[] = [];
        for (const t of targetsIn(ctx.opp.active, ctx.opp.bench)) {
          const p = (t === 'active' ? ctx.opp.active : ctx.opp.bench[t])!;
          const energy = p.energy.filter((e) => !e.provides);
          if (!energy.length || !ctx.canAffect(ctx.opp, p)) continue;
          if (energyProtected(ctx.state.cards, p)) {
            ctx.log(`Brock's Protection: ${pokemonName(ctx.state, p)}'s Energy can't be removed.`, ctx.opp.id);
            continue;
          }
          // Identical cards need no choice.
          if (new Set(energy.map((e) => e.defId)).size > 1) targets.push(t);
          else {
            p.energy = p.energy.filter((e) => e !== energy[0]);
            ctx.log(`Super Removal: discarded ${lookupCard(ctx.state.cards, energy[0]!.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
            discardTheirEnergy(ctx.state, ctx.opp, [energy[0]!]);
          }
        }
        if (targets.length) ctx.pend({ kind: 'removeEach', source: 'Super Removal', targets });
      },
    },
  },
  // Rocket's Mewtwo
  'gym2-14': {
    Juxtapose: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Juxtapose did nothing.');
        if (!ctx.canAffect(ctx.opp, ctx.defender)) return;
        const [mine, theirs] = [ctx.attacker.damage, ctx.defender.damage];
        ctx.attacker.damage = theirs;
        ctx.defender.damage = mine;
        ctx.log(`Switched the damage counters on ${ctx.attackerDef.name} and ${ctx.defenderDef.name}.`);
      },
    },
    Hypnoblast: flipToInflict(20, 'asleep'),
  },
  // Rocket's Zapdos
  'gym2-15': {
    Plasma: {
      run(ctx) {
        ctx.hit(20);
        const [energy] = basicEnergyInDiscard(ctx, 'lightning');
        if (!energy || ctx.me.active !== ctx.attacker) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== energy);
        ctx.attacker.energy.push(energy);
        ctx.log(`Attached a Lightning Energy card from the discard pile to ${ctx.attackerDef.name}.`);
      },
    },
    Electroburn: {
      run(ctx) {
        ctx.hit(70);
        const lightning = cardsOf(ctx, 'lightning').length;
        if (lightning) ctx.selfDamage(10 * lightning);
      },
    },
  },
  // Sabrina's Alakazam
  'gym2-16': {
    'Mega Burn': {
      run(ctx) {
        ctx.hit(60);
        (ctx.attacker.effects ??= {}).amnesia = { attack: 'Mega Burn', until: ctx.turn + 2 };
      },
    },
  },
  // Blaine's Ninetales
  'gym2-21': {
    'Burn Up': {
      run(ctx) {
        ctx.hit(50);
        if (!ctx.flip()) discardFromAttacker(ctx, cardsOf(ctx, 'fire'));
      },
    },
  },
  // Brock's Dugtrio
  'gym2-22': {
    'Lie Low': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 20, until: ctx.turn + 1 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} next turn is reduced by 20.`);
      },
    },
    Earthdrill: {
      damage: '60',
      blocked: (s) => (s.attacker.effects?.lastAttack?.name === 'Lie Low' && s.attacker.effects.lastAttack.turn === s.turn - 2 ? null : "Brock's Dugtrio didn't use Lie Low last turn"),
      run: (ctx) => void ctx.hit(60),
    },
  },
  // Giovanni's Nidoqueen
  'gym2-23': {
    'Love Lariat': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Love Lariat did nothing.');
        const nidoking = ctx.me.bench.some((p) => p && inPlayDef(ctx.state.cards, p).name === "Giovanni's Nidoking");
        ctx.hit(nidoking ? 100 : 50);
      },
    },
  },
  // Giovanni's Pinsir
  'gym2-24': {
    'Snapping Pincers': flipForMore(10, 10),
    'Overhead Toss': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon (tails: 20 damage to it)' }] : [];
      },
      run(ctx) {
        ctx.hit(40);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && ctx.me.bench[slot] && !ctx.flip()) ctx.damageBenched(ctx.me, slot, 20);
      },
    },
  },
  // Koga's Arbok
  'gym2-25': {
    'Poison Buildup': {
      run(ctx) {
        ctx.attacker.poison = Math.max(ctx.attacker.poison ?? 0, 10);
        ctx.log(`${ctx.attackerDef.name} is now Poisoned.`);
      },
    },
    'Poison Power': {
      damage: '20',
      run(ctx) {
        if (!ctx.attacker.poison) return void ctx.hit(20);
        ctx.hit(40);
        ctx.inflict('poisoned');
      },
    },
  },
  // Koga's Pidgeotto
  'gym2-27': {
    'Quick Turn': perHeads(2, 30),
    'Aerial Maneuvers': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(10);
        ctx.hit(40);
        ctx.protect('preventAll');
      },
    },
  },
  // Lt. Surge's Jolteon
  'gym2-28': {
    'High Voltage': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        ctx.log("The opponent can't play Trainer cards next turn.");
      },
    },
    'Thunder Flare': {
      run(ctx) {
        ctx.hit(30 + ctx.attacker.damage);
        if (!ctx.flip()) ctx.selfDamage(30);
      },
    },
  },
  // Sabrina's Gengar
  'gym2-29': {
    'Dark Wave': {
      run(ctx) {
        ctx.hit(20);
        ctx.me.powersOffUntil = ctx.opp.powersOffUntil = ctx.turn + 1;
        ctx.log("All Pokémon Powers stop working until the end of the opponent's next turn.");
      },
    },
    'Shadow Bind': noRetreat(40),
  },
  // Sabrina's Golduck
  'gym2-30': {
    'Damage Shift': {
      run(ctx) {
        if (!ctx.canAffect(ctx.opp, ctx.defender)) return;
        let moved = 0;
        for (const p of [ctx.me.active, ...ctx.me.bench]) {
          if (!p || p.damage < 10) continue;
          p.damage -= 10;
          moved++;
        }
        if (!moved) return ctx.log('None of your Pokémon have damage counters.');
        ctx.defender.damage += 10 * moved;
        ctx.log(`Moved ${moved} damage counter${moved === 1 ? '' : 's'} to ${ctx.defenderDef.name}.`);
      },
    },
    'Water Spray': flipForMore(20, 20),
  },
  // Blaine's Charmeleon
  'gym2-31': {
    Bonfire: {
      run(ctx) {
        const heads = ctx.flips(3);
        const fire = cardsOf(ctx, 'fire').slice(0, heads);
        if (!fire.length) return ctx.log('Bonfire did nothing.');
        discardFromAttacker(ctx, fire);
        ctx.hit(10 * heads, { weakness: false });
        for (const slot of benchedSlots(ctx.opp.bench)) ctx.damageBenched(ctx.opp, slot, 10 * heads);
      },
    },
  },
  // Blaine's Dodrio
  'gym2-32': { 'Mega Peck': { ...flipOrNothing(50), damage: '50' } },
  // Blaine's Rapidash
  'gym2-33': {
    Stamp: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(30);
        ctx.hit(40);
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Brock's Graveler
  'gym2-34': {
    Detonate: {
      run(ctx) {
        ctx.hit(50);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
        ctx.selfDamage(50);
        discardStadium(ctx);
      },
    },
  },
  // Brock's Primeape
  'gym2-35': {
    'Mega Thrash': {
      run(ctx) {
        ctx.hit(60);
        ctx.selfDamage(20);
        discardStadium(ctx);
      },
    },
  },
  // Brock's Sandslash
  'gym2-36': { Swift: { run: (ctx) => void ctx.hit(20, { swift: true }) }, 'Needle Ball': flipToInflict(0, 'poisoned') },
  // Brock's Vulpix
  'gym2-37': { 'Hypnotic Gaze': inflicts(0, 'asleep'), 'Fire Ring': benchTarget(20, 10) },
  // Erika's Bellsprout
  'gym2-38': { 'Stretch Vine': benchTarget(10, 10) },
  // Erika's Bulbasaur
  'gym2-39': {
    'Sleep Seed': inflicts(10, 'asleep'),
    'Errand-Running': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Errand-Running did nothing.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Errand-Running', filter: 'trainer', reveal: true, optional: true });
      },
    },
  },
  // Erika's Clefairy
  'gym2-40': {
    'Lunar Power': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Lunar Power did nothing.');
        const blocked = evolutionBlocked([ctx.me, ctx.opp], ctx.state.cards);
        if (blocked) return ctx.log(`Lunar Power: ${blocked}.`);
        if (!benchedSlots(ctx.me.bench).length) return ctx.log('No benched Pokémon to evolve.');
        ctx.pend({ kind: 'lunarPower', source: 'Lunar Power' });
      },
    },
  },
  // Erika's Ivysaur
  'gym2-41': { 'Double Razor Leaf': perHeads(2, 40) },
  // Giovanni's Machoke
  'gym2-42': {
    'Risky Attack': {
      damage: '60',
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(60);
        ctx.log('Risky Attack did no damage to the Defending Pokémon.');
        ctx.selfDamage(100);
      },
    },
    Headlock: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(20);
        ctx.hit(40);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Giovanni's Meowth
  'gym2-43': {
    'False Charity': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('False Charity did nothing.');
        const top = ctx.opp.deck.shift();
        if (!top) return ctx.log("The opponent's deck is empty.");
        const trainer = isTrainerCard(lookupCard(ctx.state.cards, top.defId));
        (trainer ? ctx.opp.discard : ctx.opp.hand).push(top);
        ctx.log(`The top card of the deck was ${lookupCard(ctx.state.cards, top.defId).name}: ${trainer ? 'discarded' : 'put into the hand'}.`, ctx.opp.id);
      },
    },
    'Double Scratch': perHeads(2, 20),
  },
  // Giovanni's Nidorina
  'gym2-44': {
    'Poison Sting Tackle': {
      damage: '30',
      run(ctx) {
        ctx.hit(30);
        ctx.selfDamage(20);
        if (ctx.flip()) ctx.inflict('poisoned');
      },
    },
    'Body Slam': flipToInflict(20, 'paralyzed'),
  },
  // Giovanni's Nidorino
  'gym2-45': { Rend: { run: (ctx) => void ctx.hit(ctx.defender.damage > 0 ? 40 : 20) } },
  // Koga's Golbat
  'gym2-46': { 'Sonic Scream': flipToInflict(30, 'confused') },
  // Koga's Kakuna
  'gym2-47': {
    'Toxic Secretion': {
      run(ctx) {
        if (ctx.flip()) ctx.inflict('toxic');
        else ctx.log('Toxic Secretion did nothing.');
      },
    },
  },
  // Koga's Koffing
  'gym2-48': {
    Smokescreen: smokescreen(10),
    'Obscuring Gas': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip() && ctx.me.active === ctx.attacker) shuffleIntoDeck(ctx, ctx.me, 'active', false);
      },
    },
  },
  // Koga's Pidgey
  'gym2-49': {
    Messenger: {
      run(ctx) {
        const p = ctx.attacker;
        const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
        ctx.me.deck.unshift(...cards);
        ctx.me.active = null;
        ctx.log(`Put ${ctx.attackerDef.name} and all cards attached to it on top of the deck.`);
        ctx.pend({ kind: 'pickFromDeck', source: 'Messenger', filter: 'pokemonNotNamed', name: "Koga's Pidgey", reveal: true });
      },
    },
  },
  // Koga's Weezing
  'gym2-50': {
    'Spontaneous Explosion': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(10);
        ctx.hit(40);
        ctx.selfDamage(30);
      },
    },
    'Toxic Cloud': {
      run(ctx) {
        if (ctx.flip()) ctx.inflict('toxic');
        else ctx.log('Toxic Cloud did nothing.');
      },
    },
  },
  // Lt. Surge's Eevee
  'gym2-51': {
    Surprise: {
      run(ctx) {
        if (!ctx.opp.hand.length) return ctx.log("The opponent's hand is empty.");
        let order: CardInstance[];
        [order, ctx.state.rngState] = shuffle(ctx.opp.hand, ctx.state.rngState);
        const card = order[0]!;
        ctx.opp.hand = ctx.opp.hand.filter((c) => c !== card);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, card], ctx.state.rngState);
        ctx.log(`Surprise: ${lookupCard(ctx.state.cards, card.defId).name} was shuffled into the deck.`, ctx.opp.id);
      },
    },
  },
  // Lt. Surge's Electrode
  'gym2-52': { 'Power Ball': { run: (ctx) => void ctx.hit(30 + 10 * ctx.flips(3)) } },
  // Lt. Surge's Raticate
  'gym2-53': {
    'Focus Energy': focusEnergy('Double-edge'),
    'Double-edge': {
      run(ctx) {
        const twice = focused(ctx) ? 2 : 1;
        ctx.hit(40 * twice);
        ctx.selfDamage(20 * twice);
      },
    },
  },
  // Misty's Dewgong
  'gym2-54': {
    'Ice Throw': { damage: '20', run: (ctx) => void ctx.hit(ctx.defenderDef.type === 'fighting' ? 40 : 20) },
    'Take Down': recoil(60, 20),
  },
  // Sabrina's Haunter
  'gym2-55': {
    Nightmare: inflicts(20, 'asleep'),
    'Shadow Attack': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (heads: 30 damage to it)"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot] && ctx.flip()) ctx.damageBenched(ctx.opp, slot, 30);
        else ctx.log('Shadow Attack did nothing.');
      },
    },
  },
  // Sabrina's Hypno
  'gym2-56': {
    Invigorate: {
      blocked: (s) => (invigorateOptions(s).length ? null : 'No Basic Pokémon in a discard pile with room on its Bench'),
      choices: (s): ChoiceSpec[] => [{ kind: 'eitherDiscard', options: invigorateOptions(s), prompt: 'Choose a Basic Pokémon in either discard pile to put onto its owner’s Bench' }],
      run(ctx) {
        const uid = ctx.choices.discardUids?.[0];
        const owner = [ctx.me, ctx.opp].find((p) => p.discard.some((c) => c.uid === uid));
        const slot = owner ? openBenchSlot(owner.bench, ctx.state.cards, ctx.state.stadium?.card) : -1;
        if (!owner || slot < 0) return;
        const card = owner.discard.find((c) => c.uid === uid)!;
        owner.discard = owner.discard.filter((c) => c !== card);
        const p: InPlayPokemon = { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: ctx.turn };
        p.damage = Math.floor(inPlayDef(ctx.state.cards, p).hp / 20) * 10;
        owner.bench[slot] = p;
        ctx.log(`${pokemonName(ctx.state, p)} was put onto the Bench with ${p.damage / 10} damage counters.`, owner.id);
      },
    },
    'Pendulum Curse': { run: (ctx) => void ctx.hit(20 * ctx.flips(Math.floor(ctx.defender.damage / 10))) },
  },
  // Sabrina's Jynx
  'gym2-57': {
    'Helping Hand': {
      choices(s, c): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => (t === 'active' ? s.defender : s.opponentBench[t]!).damage >= 10);
        if (!options.length) return [];
        const pick: ChoiceSpec = { kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon to remove damage counters from" };
        if (c.oppTarget === undefined) return [pick];
        const p = c.oppTarget === 'active' ? s.defender : s.opponentBench[c.oppTarget];
        const counters = Math.floor((p?.damage ?? 0) / 10);
        return [pick, { kind: 'amount', options: Array.from({ length: counters + 1 }, (_, i) => i), prompt: 'How many damage counters to remove (you draw that many cards)' }];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        const n = Math.min(ctx.choices.amount ?? 0, Math.floor((p?.damage ?? 0) / 10));
        if (!p || !n) return ctx.log('Helping Hand removed nothing.');
        p.damage -= 10 * n;
        ctx.log(`Removed ${n} damage counter${n === 1 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
        ctx.draw(n);
      },
    },
    Hug: {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`);
        });
      },
    },
  },
  // Sabrina's Kadabra
  'gym2-58': {
    'Life Drain': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Life Drain did nothing.');
        const left = ctx.defenderDef.hp - ctx.defender.damage;
        if (left <= 10 || !ctx.canAffect(ctx.opp, ctx.defender)) return;
        ctx.defender.damage = ctx.defenderDef.hp - 10;
        ctx.log(`Put damage counters on ${ctx.defenderDef.name}: it has 10 HP left.`, ctx.opp.id);
      },
    },
  },
  // Sabrina's Mr. Mime
  'gym2-59': {
    'Magic Darts': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 10 damage per heads to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 10 * ctx.flips(3)),
    },
  },
  // Blaine's Charmander
  'gym2-60': {
    'Fire Tail Slap': {
      blocked: (s) => (s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'fire')) ? null : 'There are no Fire Energy cards attached'),
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) discardFromAttacker(ctx, cardsOf(ctx, 'fire').slice(0, 1));
      },
    },
  },
  // Blaine's Doduo
  'gym2-61': { 'Wild Kick': { ...flipOrNothing(20), damage: '20' }, Retaliate: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Blaine's Growlithe
  'gym2-62': {
    Stoke: { run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Stoke', filter: 'energyType', type: 'fire', attachToActive: true }) },
    'Body Slam': flipToInflict(20, 'paralyzed'),
  },
  // Blaine's Mankey
  'gym2-63': {
    Pranks: {
      choices: (s): ChoiceSpec[] => (s.opponentDiscard?.length ? [{ kind: 'oppDiscard', options: s.opponentDiscard, prompt: "Choose a card in your opponent's discard pile (heads: it goes on top of their deck)" }] : []),
      run(ctx) {
        const card = ctx.opp.discard.find((c) => c.uid === ctx.choices.oppDiscardUid);
        if (!card || !ctx.flip()) return ctx.log('Pranks did nothing.');
        ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
        ctx.opp.deck.unshift(card);
        ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} on top of the deck.`, ctx.opp.id);
      },
    },
    'Fury Swipes': perHeads(3, 10),
  },
  // Blaine's Ponyta
  'gym2-64': {
    'Hind Kick': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: "Choose one of your benched Pokémon (heads: Blaine's Ponyta switches with it)" }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && ctx.me.bench[slot] && ctx.flip()) ctx.switchOwn(slot);
      },
    },
  },
  // Blaine's Rhyhorn
  'gym2-65': { 'Horn Charge': { ...flipOrNothing(30), damage: '30' }, Overrun: flipBench(20, 20) },
  // Blaine's Vulpix
  'gym2-66': {
    "Call Will-o'-the-wisp": {
      run(ctx) {
        const heads = ctx.flips(3);
        const fire = basicEnergyInDiscard(ctx, 'fire').slice(0, heads);
        if (!fire.length) return ctx.log("Call Will-o'-the-wisp found nothing.");
        ctx.me.discard = ctx.me.discard.filter((c) => !fire.includes(c));
        ctx.me.hand.push(...fire);
        ctx.log(`Put ${fire.length} Fire Energy card${fire.length === 1 ? '' : 's'} from the discard pile into the hand.`);
      },
    },
  },
  // Brock's Diglett
  'gym2-67': {
    'Surprise Attack': { ...flipOrNothing(20), damage: '20' },
    Tremor: {
      run(ctx) {
        ctx.hit(40);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Brock's Geodude
  'gym2-68': { 'Rock Toss': perHeads(3, 10) },
  // Erika's Jigglypuff
  'gym2-69': {
    'Group Therapy': {
      run(ctx) {
        healAll(ctx, ctx.me, 10);
        healAll(ctx, ctx.opp, 10);
      },
    },
    'Pulled Punch': { damage: '40-', run: (ctx) => void ctx.hit(ctx.defender.damage > 0 ? 10 : 40) },
  },
  // Erika's Oddish
  'gym2-70': { 'Strange Powder': eitherCondition(10, 'confused', 'asleep') },
  // Erika's Paras
  'gym2-71': {
    'Poison Spore': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Poison Spore did nothing.');
        ctx.inflict('poisoned');
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Giovanni's Machop
  'gym2-72': {
    'Fury Punch': {
      run(ctx) {
        if (ctx.flip()) ctx.hit(2 * ctx.attacker.damage);
        else ctx.log('Fury Punch did nothing.');
      },
    },
  },
  // Giovanni's Magikarp
  'gym2-73': {
    'Ancestral Memory': {
      damage: '40',
      run(ctx) {
        onceInPlay(ctx, 'Ancestral Memory');
        if (ctx.flip()) ctx.hit(40);
        else ctx.log('Ancestral Memory did nothing.');
      },
    },
    'Flail Around': perHeads(3, 10),
  },
  // Giovanni's Meowth
  'gym2-74': { 'Cat Fleas': flipToInflict(0, 'confused') },
  // Giovanni's Nidoran ♀
  'gym2-75': { 'Horn Thrust': { ...flipOrNothing(20), damage: '20' }, 'Double-edge': recoil(30, 20) },
  // Giovanni's Nidoran ♂
  'gym2-76': {
    'Double Kick': perHeads(2, 10),
    Retaliation: {
      blocked: (s) => (s.attacker.damage >= 20 ? null : "Giovanni's Nidoran ♂ needs 2 or more damage counters"),
      run: (ctx) => void ctx.hit(30),
    },
  },
  // Koga's Ekans
  'gym2-77': {
    'Fast-Acting Poison': {
      run(ctx) {
        if (ctx.flips(2) < 2) return ctx.log('Fast-Acting Poison did nothing.');
        ctx.inflict('confused');
        ctx.inflict('poisoned');
      },
    },
  },
  // Koga's Grimer
  'gym2-78': {
    'Sludge Grip': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (heads: it's switched in and Poisoned)"),
      run(ctx) {
        ctx.hit(10);
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot] || !ctx.flip()) return;
        ctx.switchDefender(slot);
        ctx.inflict('poisoned');
      },
    },
  },
  // Koga's Koffing
  'gym2-79': {
    'Smelly Gas': {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Koga's Pidgey
  'gym2-80': { 'Sand-attack': smokescreen(20) },
  // Koga's Tangela
  'gym2-81': {
    'Sleep Powder': inflicts(10, 'asleep'),
    'Grasping Vine': {
      run(ctx) {
        if (ctx.flip()) ctx.draw(2);
        else ctx.log('Grasping Vine did nothing.');
      },
    },
  },
  // Koga's Weedle
  'gym2-82': { 'Sharp Stinger': eitherCondition(0, 'poisoned', 'paralyzed') },
  // Koga's Zubat
  'gym2-83': {
    'Group Attack': {
      choices(s): ChoiceSpec[] {
        const room = benchRoom(s.ownBench, s.cards, s.stadium);
        return room ? [{ kind: 'amount', options: Array.from({ length: room + 1 }, (_, i) => i), prompt: "How many Koga's Zubat to put onto your Bench from your deck first" }] : [];
      },
      run(ctx) {
        let wanted = ctx.choices.amount ?? 0;
        if (wanted) {
          for (const card of ctx.me.deck.filter((c) => isBasicPokemon(lookupCard(ctx.state.cards, c.defId)) && lookupCard(ctx.state.cards, c.defId).name === ZUBAT)) {
            const slot = openBenchSlot(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card);
            if (!wanted || slot < 0) break;
            ctx.me.deck = ctx.me.deck.filter((c) => c !== card);
            ctx.me.bench[slot] = { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: ctx.turn };
            wanted--;
            ctx.log(`Put ${ZUBAT} onto the Bench.`);
          }
          [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        }
        const zubats = [ctx.me.active, ...ctx.me.bench].filter((p) => p && inPlayDef(ctx.state.cards, p).name === ZUBAT).length;
        ctx.hit(10 * zubats);
      },
    },
  },
  // Lt. Surge's Pikachu
  'gym2-84': { 'Quick Attack': flipForMore(10, 20) },
  // Lt. Surge's Rattata
  'gym2-85': {
    'Focus Energy': focusEnergy('Quick Attack'),
    'Quick Attack': { run: (ctx) => void ctx.hit((focused(ctx) ? 20 : 10) + (ctx.flip() ? 20 : 0)) },
  },
  // Lt. Surge's Voltorb
  'gym2-86': { 'Bouncing Ball': tailsSelfDamage(30, 10) },
  // Misty's Horsea
  'gym2-87': {
    'Ink Spurt': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.inkSpurt = true;
          ctx.log(`${ctx.defenderDef.name}'s attacks need heads until it evolves or is benched.`);
        });
      },
    },
  },
  // Misty's Magikarp
  'gym2-88': { 'Play Dead': flipToProtect(0, 'preventAll') },
  // Misty's Poliwag
  'gym2-89': {
    Bubbles: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) return;
        (ctx.attacker.effects ??= {}).amnesia = { attack: 'Bubbles', until: ctx.turn + 2 };
        ctx.log(`${ctx.attackerDef.name} can't use Bubbles next turn.`);
      },
    },
    Amnesia: BASE1['base1-38']!.Amnesia!,
  },
  // Misty's Psyduck
  'gym2-90': {
    ESP: {
      choices: metronome.choices,
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads === 1) return ctx.draw(1);
        if (heads === 2) return void ctx.hit(20);
        if (heads === 3) return metronome.run(ctx);
        ctx.log('ESP did nothing.');
      },
    },
  },
  // Misty's Seel
  'gym2-91': { Frostbite: noRetreat(10), Mirage: smokescreen(10) },
  // Misty's Staryu
  'gym2-92': {
    'Star Boomerang': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.after(() => returnSelf(ctx));
      },
    },
  },
  // Sabrina's Abra
  'gym2-93': {
    Synchronize: {
      blocked: (s) => (s.attacker.energy.length === s.defender.energy.length ? null : "Sabrina's Abra and the Defending Pokémon don't have the same number of Energy cards"),
      run: (ctx) => void ctx.hit(40),
    },
  },
  // Sabrina's Abra
  'gym2-94': {
    Psyscan: {
      run(ctx) {
        ctx.log("Looked at the opponent's hand.");
        ctx.pend({ kind: 'lookOppHand', source: 'Psyscan' });
      },
    },
    'Quick Attack': flipForMore(10, 20),
  },
  // Sabrina's Drowzee
  'gym2-95': { 'Energy Support': energySearch('Energy Support', 'psychic'), 'Mind Shock': { run: (ctx) => void ctx.hit(20, { weakness: false }) } },
  // Sabrina's Gastly
  'gym2-96': {
    Lick: flipToInflict(10, 'paralyzed'),
    'Fade Out': {
      run(ctx) {
        ctx.hit(30);
        ctx.after(() => {
          const p = ctx.attacker;
          if (ctx.me.active !== p) return;
          ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c));
          ctx.me.discard.push(...(p.attached ?? []).map((a) => a.card));
          ctx.me.active = null;
          ctx.log(`${pokemonName(ctx.state, p)} and its Energy cards returned to the hand.`);
        });
      },
    },
  },
  // Sabrina's Porygon
  'gym2-98': {
    'Barrier Attack': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 10, until: ctx.turn + 1 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} next turn is reduced by 10.`);
      },
    },
  },
  // Sabrina's Psyduck
  'gym2-99': {
    'Random ESP': {
      run(ctx) {
        if (ctx.flip()) {
          ctx.hit(20);
          return ctx.inflict('confused');
        }
        ctx.log('Random ESP did no damage.');
        ctx.confuseSelf();
      },
    },
  },
};

/** Invigorate: Basic Pokémon cards in either discard pile whose owner's Bench has room. */
function invigorateOptions(s: AttackSituation): CardInstance[] {
  const basics = (pile: CardInstance[]) => pile.filter((c) => isBasicPokemon(lookupCard(s.cards, c.defId)));
  const room = (bench: (InPlayPokemon | null)[]) => openBenchSlot(bench, s.cards, s.stadium) >= 0;
  return [...(room(s.ownBench) ? basics(s.ownDiscard) : []), ...(room(s.opponentBench) ? basics(s.opponentDiscard ?? []) : [])];
}
