// Skyridge (ecard3) attack effects, by card id and attack name, and the attacks of its Technical Machines (the Miracle
// Spheres and Mystery Plates, keyed by the Trainer card's id: the Pokémon they're attached to uses them). TCGdex's Skyridge
// text matches the card images (checked) but for the Technical Machines: Miracle Sphere γ's Thunder Force costs Lightning
// (TCGdex: Water) and Miracle Sphere α's text names itself (TCGdex: "Miracle Plate α"). TCGdex has no H1–H32 holo prints,
// so they're not in the catalog.
// Rulings (from the text): questions whose answer depends on a flip are asked before it (Spinning Blow's, Spinning Head's
// and Antler Swipe's Pokémon, Aqua Trick's and Magnetic Lines' Energy card and Benched Pokémon, Overrun's Benched Pokémon,
// Miracle Powder's Special Condition). Lonely Fang and Magnetic Wave add nothing when the difference is negative. Burn
// Booster's Energy card is chosen as it's discarded; Fireblast and Scalding Steam discard theirs before the damage, as a cost.
// Bounce Off: the player whose Active Pokémon has fewer Energy cards switches (the attacker's player picks theirs after the
// attack). Electric Blast's damage counters are placed one at a time after the attack. The Mystery Plates count the
// opponent's Prize cards left when the attack is used; Retro Cave's and Healing Oasis's Pokémon are asked only when that
// count is exactly 2 (`AttackSituation.opponentPrizes`).
import { pokemonOn, targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard } from '../cards.js';
import { energyPool, isEnergyCardOf, retreatCost, type InPlayPokemon, type Target } from '../engine.js';
import type { EnergyType } from '../cards.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, benchSearch, energyCanMove, extraEnergy, flipToInflict, flipToProtect, headsUntilTails, inflicts, lure, opponentBenchChoice, opponentSwitches, perHeads, recoil, selfdestruct, whirlwind } from './common.js';
import { ECARD1, basicEnergyOn, energyCards, plasma, putCounters, typedCards } from './ecard1.js';
import { ECARD2 } from './ecard2.js';
import { benchMany, benchWhere, discardFromAttacker, noRetreat, removalFlip } from './gym1.js';
import { flipForMore } from './jungle.js';
import { NEO1, damageOpponent, opponentTargets, swift } from './neo1.js';
import { NEO4 } from './neo4.js';
import { discardFree, energyCanGo, reachesDefender } from './neo3.js';
import { flipOrNothing } from './rocket.js';
import { healUpTo } from './si1.js';

/** Base damage, or `alt` instead when `alternative` says so (Dragon's Vengeance, Syncroblast, Angry Horn). */
const baseOr = (damage: number, alt: number, alternative: (ctx: AttackContext) => boolean): AttackEffect => ({
  run(ctx) {
    const other = alternative(ctx);
    if (other) ctx.log(`The attack's base damage is ${alt}.`);
    ctx.hit(other ? alt : damage);
  },
});

/**
 * Another set's attack effect, looked up when it's used (the tables import each other through effects/index.ts, so they
 * can't be read while the modules load).
 */
const same = (get: () => AttackEffect | undefined): AttackEffect => ({
  blocked: (s) => get()?.blocked?.(s) ?? null,
  choices: (s, c) => get()?.choices?.(s, c) ?? [],
  run: (ctx) => get()?.run(ctx),
});

/** "Flip a coin. If heads, the Defending Pokémon is now X. If tails, … Y" (heads first). */
const either = (damage: number, heads: 'asleep' | 'confused' | 'paralyzed' | 'poisoned' | 'burned', tails: 'asleep' | 'confused' | 'paralyzed' | 'poisoned' | 'burned'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.inflict(ctx.flip() ? heads : tails);
  },
});

/** `damage` times the number of damage counters on the attacker (Retaliate). */
const retaliate: AttackEffect = { run: (ctx) => void ctx.hit(ctx.attacker.damage) };

/** Benched Pokémon a player has. */
const benchCount = (bench: (InPlayPokemon | null)[]) => bench.filter(Boolean).length;

/** "Choose 1 of your Benched Pokémon" asked before the flip it depends on (-1: none): Spinning Blow, Spinning Head. */
const ownBenchFirst = (prompt: string) => (s: AttackSituation): ChoiceSpec[] => {
  const options = benchedSlots(s.ownBench);
  return options.length ? [{ kind: 'ownBench', options, prompt }] : [];
};

/** The chosen Benched Pokémon (`ownBenchSlot`), switched with the attacker. */
function switchOwnChosen(ctx: AttackContext) {
  const slot = ctx.choices.ownBenchSlot;
  if (slot !== undefined && slot >= 0 && ctx.me.bench[slot]) ctx.switchOwn(slot);
}

/** Choose 1 of the opponent's Pokémon: `damage` to it, without Weakness and Resistance (Dig Under, Flitter). */
const anyOpponent = (damage: number): AttackEffect => ({
  choices: (s) => opponentTargets(s, `Choose one of your opponent's Pokémon to do ${damage} damage to`),
  run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', damage),
});

/**
 * Aqua Trick, Magnetic Lines: base damage; if the Defending Pokémon has (basic) Energy cards, a flip; heads moves the chosen
 * one to the chosen Benched Pokémon of the opponent's (both asked before the flip).
 */
const energyTrick = (damage: number, basicOnly: boolean): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const energy = s.defender.energy.filter((e) => !e.provides && (!basicOnly || isBasicEnergy(lookupCard(s.cards, e.defId))));
    const bench = benchedSlots(s.opponentBench);
    if (!energy.length || !bench.length) return [];
    return [
      { kind: 'defenderEnergy', options: energy, prompt: 'Choose an Energy card attached to the Defending Pokémon to move (on heads)' },
      { kind: 'opponentBench', options: bench, prompt: "Choose one of your opponent's Benched Pokémon to move it to" },
    ];
  },
  run(ctx) {
    ctx.hit(damage);
    const uid = ctx.choices.defenderEnergyUid;
    const to = ctx.choices.benchSlot === undefined ? null : ctx.opp.bench[ctx.choices.benchSlot];
    if (!uid || !to || !ctx.opp.active || !ctx.flip()) return;
    ctx.affectDefender(() => {
      const defender = ctx.opp.active!;
      const energy = defender.energy.find((e) => e.uid === uid);
      if (!energy || !energyCanMove(ctx, defender)) return;
      defender.energy = defender.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, defender)} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
    });
  },
});

/** "Flip a coin. If heads, look at your opponent's hand… choose 1 of them. Your opponent shuffles that card into his or her deck." */
const handShuffle = (damage: number, source: string, filter?: 'pokemon' | 'energy'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip()) return ctx.log(`${source} did nothing more.`);
    ctx.pend({ kind: 'oppHandTrainer', source, ...(filter && { filter }) });
  },
});

/** A Technical Machine attack's Energy test: basic Energy cards of both types attached to the attacker. */
const hasBasic = (ctx: AttackContext, ...types: EnergyType[]) =>
  types.every((t) => basicEnergyOn(ctx.state.cards, ctx.attacker).some((e) => (lookupCard(ctx.state.cards, e.defId) as { energyType?: EnergyType }).energyType === t));

/** The opponent's Prize cards left (the Mystery Plates). */
const oppPrizes = (ctx: AttackContext) => ctx.opp.prizes.length;
/** Retro Cave and Healing Oasis ask for their Pokémon only when the opponent has exactly 2 Prize cards left (or it's not known). */
const twoPrizes = (s: AttackSituation) => s.opponentPrizes === undefined || s.opponentPrizes === 2;

/** Puts a damage counter on the attacker for each `n` (Lightning Storm: 2; Continuous Charge: 1 per heads). */
function selfCounters(ctx: AttackContext, n: number) {
  if (n <= 0) return;
  ctx.attacker.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${ctx.attackerDef.name}.`);
}

/** The attacking player's Pokémon in play. */
const ownInPlay = (ctx: AttackContext) => [ctx.me.active, ...ctx.me.bench].filter((p): p is InPlayPokemon => !!p);

export const ECARD3: Record<string, Record<string, AttackEffect>> = {
  // Aerodactyl – Rising Lunge.
  'ecard3-1': { 'Rising Lunge': flipForMore(20, 20) },
  // Alakazam – Psychic: 10 more for each Energy card attached to the Defending Pokémon.
  'ecard3-2': { Psychic: { run: (ctx) => void ctx.hit(30 + 10 * energyCards(ctx.defender).length) } },
  // Arcanine – Shake: the opponent switches; White Flames: discards every Fire Energy card attached to Arcanine.
  'ecard3-3': {
    Shake: {
      run(ctx) {
        ctx.hit(10);
        opponentSwitches(ctx, 'Shake');
      },
    },
    'White Flames': {
      run(ctx) {
        ctx.hit(70);
        discardFromAttacker(ctx, typedCards(ctx, 'fire'));
      },
    },
  },
  // Articuno – Freeze Solid; Ice Cyclone: heads, 10 to each of the opponent's Benched Pokémon; tails, 10 to each of the player's Pokémon.
  'ecard3-4': {
    'Freeze Solid': plasma(10, 'water'),
    'Ice Cyclone': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flip()) return ctx.benchDamage(ctx.opp, 10);
        ctx.selfDamage(10);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Beedrill – Needle Rush: 10, 20, 50 or 90 more for 1 to 4 heads.
  'ecard3-5': { 'Needle Rush': { run: (ctx) => void ctx.hit(10 + [0, 10, 20, 50, 90][ctx.flips(4)]!) } },
  // Crobat – Double Cross: 2 tails Confuses and Poisons.
  'ecard3-6': {
    'Double Cross': {
      run(ctx) {
        const heads = ctx.flips(2);
        ctx.hit(40 * heads);
        if (heads) return;
        ctx.inflict('confused');
        ctx.inflict('poisoned');
      },
    },
  },
  // Dewgong – Freeze Lock: heads, no Energy cards from the opponent's hand to their Active Pokémon next turn; Crushing Ice.
  'ecard3-7': {
    'Freeze Lock': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.opp.freezeLockUntil = ctx.turn + 1;
        ctx.log("Your opponent can't attach Energy cards from their hand to their Active Pokémon next turn.", ctx.opp.id);
      },
    },
    'Crushing Ice': {
      run(ctx) {
        const cost = retreatCost(ctx.defender, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card);
        ctx.hit(40 + 10 * cost);
      },
    },
  },
  // Flareon – Singe; Burn Booster: discard an Energy card; 10 more if it's a Fire Energy card.
  'ecard3-8': {
    Singe: inflicts(0, 'burned'),
    'Burn Booster': {
      discard: { count: 1 },
      run(ctx) {
        const gone = ctx.me.discard.find((c) => ctx.choices.energyUids?.includes(c.uid));
        ctx.hit(gone && isEnergyCardOf(gone, ctx.state.cards, 'fire') ? 50 : 40);
      },
    },
  },
  // Forretress – Spinning Blow: 2 heads switches it with the chosen Benched Pokémon; Scatterbomb: 10 to each Benched Pokémon of the opponent's (heads) or the player's (tails), per coin.
  'ecard3-9': {
    'Spinning Blow': {
      choices: ownBenchFirst('Choose one of your Benched Pokémon to switch Forretress with (on 2 heads)'),
      run(ctx) {
        const heads = ctx.flips(2);
        ctx.hit(20 * heads);
        if (heads === 2) switchOwnChosen(ctx);
      },
    },
    Scatterbomb: {
      run(ctx) {
        ctx.hit(40);
        for (let i = 0; i < 2; i++) ctx.benchDamage(ctx.flip() ? ctx.opp : ctx.me, 10);
      },
    },
  },
  // Gengar – Hydrokinesis: heads Burned, tails Confused.
  'ecard3-10': { Hydrokinesis: either(40, 'burned', 'confused') },
  // Gyarados – Dragon's Vengeance: base damage 100 with 7 or more damage counters on it.
  'ecard3-11': { "Dragon's Vengeance": baseOr(50, 100, (ctx) => ctx.attacker.damage >= 70) },
  // Houndoom – Ambush; Lonely Fang: 20 more for each Benched Pokémon the opponent has more than the player.
  'ecard3-12': {
    Ambush: flipForMore(10, 20),
    'Lonely Fang': { run: (ctx) => void ctx.hit(30 + 20 * Math.max(0, benchCount(ctx.opp.bench) - benchCount(ctx.me.bench))) },
  },
  // Jolteon – Thundershock; Thunderspark: 10 to each Benched Pokémon (both players') with an Energy card attached.
  'ecard3-13': {
    Thundershock: flipToInflict(10, 'paralyzed'),
    Thunderspark: {
      run(ctx) {
        ctx.hit(40);
        for (const side of [ctx.opp, ctx.me]) benchWhere(ctx, side, 10, (p) => energyCards(p).length > 0);
      },
    },
  },
  // Kabutops – Dual Cut.
  'ecard3-14': { 'Dual Cut': perHeads(2, 50) },
  // Ledian – Pollen Shield: no Special Conditions (Burned included) next turn; Swift.
  'ecard3-15': {
    'Pollen Shield': {
      run(ctx) {
        ctx.hit(10);
        (ctx.attacker.effects ??= {}).conditionProof = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} can't become affected by a Special Condition next turn.`);
      },
    },
    Swift: swift(50),
  },
  // Machamp – Drag Off: first, one of the opponent's Benched Pokémon (if any) is switched in; Hurricane Punch.
  'ecard3-16': {
    'Drag Off': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in (it takes the damage)"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined && ctx.opp.bench[ctx.choices.benchSlot]) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.hit(20);
      },
    },
    'Hurricane Punch': perHeads(4, 30),
  },
  // Magcargo – Eruption: each player discards their top card; 20 more for each Fire Energy card; Fire Stream: 10 to each of the opponent's Benched Pokémon.
  'ecard3-17': {
    Eruption: {
      run(ctx) {
        let fire = 0;
        for (const side of [ctx.me, ctx.opp]) {
          const top = side.deck.shift();
          if (!top) continue;
          side.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, side.id);
          if (isEnergyCardOf(top, ctx.state.cards, 'fire')) fire++;
        }
        ctx.hit(20 + 20 * fire);
      },
    },
    'Fire Stream': {
      discard: { count: 1, type: 'fire' },
      run(ctx) {
        ctx.hit(60);
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Magcargo – Crushing Lava: may discard a Fire (Burns) or Fighting (20 more) basic Energy card.
  'ecard3-18': {
    'Crushing Lava': {
      choices(s): ChoiceSpec[] {
        const options = basicEnergyOn(s.cards, s.attacker).filter((e) => ['fire', 'fighting'].includes((lookupCard(s.cards, e.defId) as { energyType?: string }).energyType ?? ''));
        return options.length ? [{ kind: 'ownEnergyUpTo', options, max: 1, prompt: 'You may discard a Fire (Burns) or Fighting (20 more damage) basic Energy card' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        const type = gone && (lookupCard(ctx.state.cards, gone.defId) as { energyType?: EnergyType }).energyType;
        if (gone) discardFromAttacker(ctx, [gone]);
        ctx.hit(type === 'fighting' ? 60 : 40);
        if (type === 'fire') ctx.inflict('burned');
      },
    },
  },
  // Magneton – Electric Blast: may discard every Lightning Energy card; that many damage counters on the opponent's Benched Pokémon, as the player likes.
  'ecard3-19': {
    'Electric Blast': {
      choices: (s): ChoiceSpec[] =>
        s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'lightning'))
          ? [{ kind: 'boost', options: [true, false], prompt: "Discard all Lightning Energy cards attached to Magneton for as many damage counters on your opponent's Benched Pokémon?" }]
          : [],
      run(ctx) {
        ctx.hit(40);
        if (!ctx.choices.boost) return;
        const gone = typedCards(ctx, 'lightning');
        discardFromAttacker(ctx, gone);
        if (gone.length && benchedSlots(ctx.opp.bench).length) ctx.pend({ kind: 'placeCounters', source: 'Electric Blast', count: gone.length });
      },
    },
  },
  // Magneton – Bounce Off: the player whose Active Pokémon has fewer Energy cards switches it; Magnetic Wave: 10 more for each Benched Pokémon the player has more than the opponent.
  'ecard3-20': {
    'Bounce Off': {
      run(ctx) {
        ctx.hit(20);
        const mine = energyCards(ctx.attacker).length;
        const theirs = ctx.opp.active ? energyCards(ctx.opp.active).length : mine;
        if (mine > theirs) return opponentSwitches(ctx, 'Bounce Off');
        if (mine === theirs || ctx.me.active !== ctx.attacker) return;
        const slots = benchedSlots(ctx.me.bench);
        if (slots.length === 1) ctx.switchOwn(slots[0]!);
        else if (slots.length) ctx.pend({ kind: 'switchIn', source: 'Bounce Off' });
      },
    },
    'Magnetic Wave': { run: (ctx) => void ctx.hit(30 + 10 * Math.max(0, benchCount(ctx.me.bench) - benchCount(ctx.opp.bench))) },
  },
  // Moltres – Collect Fire; Burning Tail: tails discards a Fire Energy card.
  'ecard3-21': {
    'Collect Fire': plasma(10, 'fire'),
    'Burning Tail': {
      run(ctx) {
        ctx.hit(60);
        const [fire] = typedCards(ctx, 'fire');
        if (fire && !ctx.flip()) discardFromAttacker(ctx, [fire]);
      },
    },
  },
  // Nidoqueen – Double Claw: 20 more for each heads.
  'ecard3-22': { 'Double Claw': { run: (ctx) => void ctx.hit(30 + 20 * ctx.flips(2)) } },
  // Omastar – Spook.
  'ecard3-23': { Spook: noRetreat(50) },
  // Piloswine – Freezing Breath; Trample: a flip for each Benched Pokémon (both players'), 20 to it on heads.
  'ecard3-24': {
    'Freezing Breath': either(20, 'paralyzed', 'asleep'),
    Trample: {
      run(ctx) {
        ctx.hit(40);
        for (const side of [ctx.opp, ctx.me]) for (const slot of benchedSlots(side.bench)) if (ctx.flip()) ctx.damageBenched(side, slot, 20);
      },
    },
  },
  // Politoed – Sudden Growth: any number of basic Energy cards from the hand; Frog Hop; Energy Splash: 2 Water Energy cards to 1 or 2 Benched Pokémon.
  'ecard3-25': {
    'Sudden Growth': {
      run(ctx) {
        if (ctx.me.hand.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromHand', source: 'Sudden Growth', count: 60, basic: true });
      },
    },
    'Frog Hop': flipForMore(30, 20),
    'Energy Splash': {
      run(ctx) {
        ctx.hit(70);
        if (!benchedSlots(ctx.me.bench).length || ctx.me.active !== ctx.attacker) return;
        const water = typedCards(ctx, 'water').slice(0, 2);
        if (!water.length) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !water.includes(e));
        ctx.pend({ kind: 'distributeEnergy', source: 'Energy Splash', cards: water });
      },
    },
  },
  // Poliwrath – Spiral Punch.
  'ecard3-26': { 'Spiral Punch': { run: (ctx) => void ctx.hit(40 + 20 * headsUntilTails(ctx)) } },
  // Raichu – Zzzap: 20 to each Pokémon with a Poké-Body or Poké-Power; Lightning Storm: tails, 2 damage counters on Raichu.
  'ecard3-27': {
    Zzzap: same(() => NEO1['neo1-12']?.Zzzap),
    'Lightning Storm': {
      run(ctx) {
        ctx.hit(50);
        if (!ctx.flip()) selfCounters(ctx, 2);
      },
    },
  },
  // Raikou – Lightning Sphere: may flip; heads discards every Lightning Energy card, 20 more for each.
  'ecard3-28': {
    'Lightning Sphere': {
      choices: (): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt: 'Flip a coin? Heads discards all Lightning Energy cards attached to Raikou, for 20 more damage each' }],
      run(ctx) {
        if (!ctx.choices.boost || !ctx.flip()) return void ctx.hit(40);
        const gone = typedCards(ctx, 'lightning');
        discardFromAttacker(ctx, gone);
        ctx.hit(40 + 20 * gone.length);
      },
    },
  },
  // Rhydon – Stomp; Giant Tail.
  'ecard3-29': { Stomp: flipForMore(30, 20), 'Giant Tail': flipOrNothing(100) },
  // Starmie – Energy Burst: heads, 10 for each Energy attached to Starmie and the Defending Pokémon; Star Back: a basic Energy card from the discard pile to one of the player's Pokémon.
  'ecard3-30': {
    'Energy Burst': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Energy Burst did nothing.');
        ctx.hit(10 * (energyPool(ctx.attacker, ctx.state.cards).length + energyPool(ctx.defender, ctx.state.cards).length));
      },
    },
    'Star Back': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId))) && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Star Back', count: 1 });
      },
    },
  },
  // Steelix – Squeeze: heads, 10 more and Paralyzed; Metal Tail: may flip first, 80 on heads and nothing on tails.
  'ecard3-31': {
    Squeeze: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(20);
        ctx.hit(30);
        ctx.inflict('paralyzed');
      },
    },
    'Metal Tail': {
      choices: (): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt: 'Flip a coin? Heads, 80 damage; tails, this attack does nothing' }],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(40);
        if (ctx.flip()) ctx.hit(80);
        else ctx.log('Metal Tail did nothing.');
      },
    },
  },
  // Umbreon – Sharp Claws.
  'ecard3-32': { 'Sharp Claws': flipForMore(10, 30) },
  // Vaporeon – Hypnosplash; Aqua Trick.
  'ecard3-33': { Hypnosplash: inflicts(10, 'asleep'), 'Aqua Trick': energyTrick(40, false) },
  // Wigglytuff – Do the Wave: heads, 10 for each of the player's Pokémon in play.
  'ecard3-34': {
    'Do the Wave': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Do the Wave did nothing.');
        ctx.hit(10 * ownInPlay(ctx).length);
      },
    },
  },
  // Xatu – Warp Hole: heads puts a card from the discard pile on top of the deck.
  'ecard3-35': {
    'Warp Hole': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.discard.length && ctx.flip() && discardFree(ctx)) ctx.pend({ kind: 'pickFromDiscard', source: 'Warp Hole' });
      },
    },
  },
  // Electrode – Plasma; Selfdestruct.
  'ecard3-36': { Plasma: plasma(20, 'lightning'), Selfdestruct: selfdestruct(100, 20) },
  // Machoke – Focus Energy: Mega Punch's base damage is 80 next turn.
  'ecard3-38': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).focusEnergy = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name}'s Mega Punch's base damage is 80 next turn.`);
      },
    },
    'Mega Punch': baseOr(40, 80, (ctx) => ctx.attacker.effects?.focusEnergy === ctx.turn),
  },
  // Misdreavus – Hypnoblast; Gift of Spite: a damage counter on the Defending Pokémon for each of the player's damaged Pokémon.
  'ecard3-39': {
    Hypnoblast: flipToInflict(10, 'asleep'),
    'Gift of Spite': { run: (ctx) => putCounters(ctx, 'active', ownInPlay(ctx).filter((p) => p.damage > 0).length) },
  },
  // Noctowl – Triple Smash.
  'ecard3-40': { 'Triple Smash': { run: (ctx) => void ctx.hit(10 + 10 * ctx.flips(3)) } },
  // Omanyte – Water of Evolution: an Omastar from the hand onto Omanyte; Drag Off: may switch in one of the opponent's Benched Pokémon first.
  'ecard3-41': {
    'Water of Evolution': {
      run(ctx) {
        if (ctx.me.active !== ctx.attacker) return;
        if (!ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).name === 'Omastar')) return ctx.log('Water of Evolution: no Omastar in the hand.');
        ctx.pend({ kind: 'evolveFromHand', source: 'Water of Evolution', target: 'active', names: ['Omastar'] });
      },
    },
    'Drag Off': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options: [...options, -1], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in (it takes the damage)" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
        ctx.hit(20);
      },
    },
  },
  // Persian – Surprise Slash: heads, a Trainer card from the opponent's hand into their deck; Lunge.
  'ecard3-42': { 'Surprise Slash': handShuffle(20, 'Surprise Slash'), Lunge: flipOrNothing(50) },
  // Piloswine – Continuous Charge: 20 more and a damage counter on Piloswine for each heads.
  'ecard3-43': {
    'Continuous Charge': {
      run(ctx) {
        const heads = ctx.flips(4);
        ctx.hit(30 + 20 * heads);
        selfCounters(ctx, heads);
      },
    },
  },
  // Starmie – Water Gun: 20 more for each unused Water Energy (40 at most); Core Blast.
  'ecard3-44': {
    'Water Gun': { run: (ctx) => void ctx.hit(10 + 20 * extraEnergy(ctx, ['water'], 'water', 2)) },
    'Core Blast': same(() => NEO4['neo4-47']?.['Core Blast']),
  },
  // Wobbuffet – Return Attack: either of 2 coins heads, 10 for each damage counter on Wobbuffet.
  'ecard3-45': {
    'Return Attack': {
      run(ctx) {
        if (ctx.flips(2) === 0) return ctx.log('Return Attack did nothing.');
        ctx.hit(ctx.attacker.damage);
      },
    },
  },
  // Cleffa – Energy Recycle: a basic Energy card from the discard pile into the deck.
  'ecard3-48': {
    'Energy Recycle': {
      run(ctx) {
        if (ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId))) && discardFree(ctx)) ctx.pend({ kind: 'discardToDeck', source: 'Energy Recycle', count: 1, of: 1, filter: 'basicEnergy' });
      },
    },
  },
  // Delibird – Limited Delivery: a Technical Machine or Pokémon Tool card from the deck; Kick Away.
  'ecard3-49': {
    'Limited Delivery': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Limited Delivery', filter: 'toolOrMachine', reveal: true })) },
    'Kick Away': whirlwind(20),
  },
  // Diglett – Burrow.
  'ecard3-50': { Burrow: flipToProtect(10, 'preventDamage') },
  // Ditto – Copy (as Sudowoodo's).
  'ecard3-51': { Copy: same(() => ECARD2['ecard2-36']?.Copy) },
  // Dugtrio – Burrow; Dig Under.
  'ecard3-52': { Burrow: flipToProtect(20, 'preventDamage'), 'Dig Under': anyOpponent(30) },
  // Dunsparce – Tail Shake.
  'ecard3-53': { 'Tail Shake': inflicts(10, 'asleep') },
  // Eevee – Take Down.
  'ecard3-54': { 'Take Down': recoil(30, 10) },
  // Farfetch'd – Whirlwind; Leek Rush.
  'ecard3-55': { Whirlwind: whirlwind(0), 'Leek Rush': { run: (ctx) => void ctx.hit(10 * headsUntilTails(ctx)) } },
  // Forretress – Shell Rupture: 10 to each of the opponent's Benched Pokémon; Double Spin.
  'ecard3-56': { 'Shell Rupture': { run: (ctx) => ctx.benchDamage(ctx.opp, 10) }, 'Double Spin': perHeads(2, 40) },
  // Gastly – Haunt.
  'ecard3-57': { Haunt: { run: (ctx) => putCounters(ctx, 'active', 1) } },
  // Girafarig – Energy Patch (as Expedition's); Syncroblast: 10 instead of 40 unless both have as many Energy cards.
  'ecard3-58': {
    'Energy Patch': same(() => ECARD1['ecard1-22']?.['Energy Patch']),
    Syncroblast: baseOr(40, 10, (ctx) => energyCards(ctx.attacker).length !== energyCards(ctx.defender).length),
  },
  // Gligar – Sharp Stinger.
  'ecard3-59': { 'Sharp Stinger': either(10, 'poisoned', 'paralyzed') },
  // Golbat – Poison Sound Wave; Strength in Numbers: 10 more for each Zubat, Golbat and Crobat on the Bench.
  'ecard3-60': {
    'Poison Sound Wave': either(0, 'confused', 'poisoned'),
    'Strength in Numbers': {
      run(ctx) {
        const bats = ctx.me.bench.filter((p) => p && ['Zubat', 'Golbat', 'Crobat'].includes(inPlayDef(ctx.state.cards, p).name)).length;
        ctx.hit(30 + 10 * bats);
      },
    },
  },
  // Granbull – Fling.
  'ecard3-61': { Fling: whirlwind(20) },
  // Growlithe – Double Kick.
  'ecard3-62': { 'Double Kick': perHeads(2, 20) },
  // Haunter – Confuse Ray; Shadow Hand: may discard up to 2 cards from the hand and draw as many.
  'ecard3-63': {
    'Confuse Ray': flipToInflict(10, 'confused'),
    'Shadow Hand': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.hand.length) ctx.pend({ kind: 'discardDraw', source: 'Shadow Hand', discarded: 0, max: 2 });
      },
    },
  },
  // Heracross – Angry Horn: base damage 50 with 4 or more damage counters on it.
  'ecard3-64': { 'Angry Horn': baseOr(30, 50, (ctx) => ctx.attacker.damage >= 40) },
  // Hoothoot – Hypnosis; Eerie Light.
  'ecard3-65': { Hypnosis: inflicts(0, 'asleep'), 'Eerie Light': flipToInflict(0, 'confused') },
  // Houndour – Retaliate; Fireworks: tails discards a Fire Energy card.
  'ecard3-66': {
    Retaliate: retaliate,
    Fireworks: {
      run(ctx) {
        ctx.hit(20);
        const [fire] = typedCards(ctx, 'fire');
        if (fire && !ctx.flip()) discardFromAttacker(ctx, [fire]);
      },
    },
  },
  // Igglybuff – Energy Heal: a damage counter off one of the player's Pokémon with an Energy card attached.
  'ecard3-67': {
    'Energy Heal': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(s.attacker, s.ownBench).filter((t) => energyCards(pokemonOn(s.attacker, s.ownBench, t)!).length > 0);
        return options.length ? [{ kind: 'ownPokemon', options, prompt: 'Choose one of your Pokémon with an Energy card attached to remove a damage counter from' }] : [];
      },
      run(ctx) {
        const p = ctx.choices.ownTarget === undefined ? null : pokemonOn(ctx.me.active, ctx.me.bench, ctx.choices.ownTarget);
        if (p) healUpTo(ctx, ctx.me, p, 10);
      },
    },
  },
  // Jigglypuff – Nap; Lullaby.
  'ecard3-68': { Nap: { run: (ctx) => ctx.heal(10) }, Lullaby: inflicts(10, 'asleep') },
  // Kadabra – Nightmare; Mind Shock.
  'ecard3-69': { Nightmare: inflicts(10, 'asleep'), 'Mind Shock': { run: (ctx) => void ctx.hit(40, { weakness: false, resistance: false }) } },
  // Kakuna – Poisonpowder.
  'ecard3-70': { Poisonpowder: inflicts(0, 'poisoned') },
  // Lapras – Assist: a Supporter card from the deck; Hypnoblast.
  'ecard3-71': {
    Assist: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Assist', filter: 'supporter', reveal: true })) },
    Hypnoblast: flipToInflict(30, 'asleep'),
  },
  // Ledyba – Teary Eyes (as Cubone's); Quick Turn.
  'ecard3-72': { 'Teary Eyes': same(() => ECARD2['ecard2-72']?.['Teary Eyes']), 'Quick Turn': perHeads(2, 10) },
  // Ledyba – Slam.
  'ecard3-73': { Slam: perHeads(2, 20) },
  // Machop – Smash Punch; Fling.
  'ecard3-74': { 'Smash Punch': flipOrNothing(20), Fling: whirlwind(20) },
  // Magikarp – Signs of Evolution: heads, a card that evolves from Magikarp from the deck.
  'ecard3-75': {
    'Signs of Evolution': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Signs of Evolution did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'evolvesFrom', name: 'Magikarp', reveal: true });
      },
    },
  },
  // Magnemite – Thunder Wave; Magnetic Lines.
  'ecard3-76': { 'Thunder Wave': flipToInflict(0, 'paralyzed'), 'Magnetic Lines': energyTrick(10, true) },
  // Mantine – Fin Smack; Aqua Sonic.
  'ecard3-77': { 'Fin Smack': perHeads(2, 10), 'Aqua Sonic': { run: (ctx) => void ctx.hit(30, { resistance: false }) } },
  // Meowth – Sudden Swipe: heads, an Energy card from the opponent's hand into their deck.
  'ecard3-78': { 'Sudden Swipe': handShuffle(10, 'Sudden Swipe', 'energy') },
  // Murkrow – Evil Eye: a damage counter on one of the opponent's Pokémon; Blindside: 20 to one with damage counters, without Weakness and Resistance.
  'ecard3-79': {
    'Evil Eye': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to put a damage counter on"),
      run: (ctx) => putCounters(ctx, ctx.choices.oppTarget ?? 'active', 1),
    },
    Blindside: {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => pokemonOn(s.defender, s.opponentBench, t)!.damage > 0);
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon with damage counters to do 20 damage to" }] : [];
      },
      run(ctx) {
        if (ctx.choices.oppTarget === undefined) return ctx.log('Blindside did nothing: no Pokémon with damage counters.');
        damageOpponent(ctx, ctx.choices.oppTarget, 20);
      },
    },
  },
  // Natu – Foresight: the top 3 cards of either deck, rearranged; Removal Beam.
  'ecard3-80': {
    Foresight: {
      choices: (): ChoiceSpec[] => [{ kind: 'deck', options: ['own', 'opponent'], prompt: 'Choose whose deck to look at the top 3 cards of' }],
      run(ctx) {
        const owner = ctx.choices.deck === 'opponent' ? ctx.opp : ctx.me;
        const count = Math.min(3, owner.deck.length);
        if (!count) return ctx.log('Foresight found no cards to look at.');
        ctx.pend({ kind: 'arrangeTop', source: 'Foresight', count, deckOwner: owner.id });
      },
    },
    'Removal Beam': removalFlip(10),
  },
  // Nidoran ♀ – Call for Family.
  'ecard3-81': { 'Call for Family': benchSearch('Call for Family', { filter: 'basicNamed', name: ['Nidoran♀', 'Nidoran♂'] }) },
  // Nidoran ♀ – Poison Sting.
  'ecard3-82': { 'Poison Sting': inflicts(10, 'poisoned') },
  // Nidorina – Poison Claws.
  'ecard3-83': { 'Poison Claws': flipToInflict(30, 'poisoned') },
  // Pikachu – Max Voltage: discards every Lightning Energy card, 10 more for each.
  'ecard3-84': {
    'Max Voltage': {
      run(ctx) {
        const gone = typedCards(ctx, 'lightning');
        discardFromAttacker(ctx, gone);
        ctx.hit(20 + 10 * gone.length);
      },
    },
  },
  // Pineco – Surprise Attack.
  'ecard3-85': { 'Surprise Attack': flipOrNothing(20) },
  // Pineco – Double-edge.
  'ecard3-86': { 'Double-edge': recoil(30, 10) },
  // Poliwag – Sleep Bubble; Doubleslap.
  'ecard3-87': { 'Sleep Bubble': inflicts(10, 'asleep'), Doubleslap: perHeads(2, 20) },
  // Poliwhirl – Twiddle; Double Kick.
  'ecard3-88': { Twiddle: either(0, 'confused', 'asleep'), 'Double Kick': perHeads(2, 30) },
  // Raticate – Continuous Bite: 10, 30 or 60 more for 1 to 3 heads.
  'ecard3-89': { 'Continuous Bite': { run: (ctx) => void ctx.hit(10 + [0, 10, 30, 60][ctx.flips(3)]!) } },
  // Rattata – Call for Friends: a Baby or Basic Pokémon from the deck onto the Bench; Body Slam.
  'ecard3-90': { 'Call for Friends': benchSearch('Call for Friends', { filter: 'basic' }), 'Body Slam': flipToInflict(10, 'paralyzed') },
  // Rhyhorn – Retaliate.
  'ecard3-91': { Retaliate: retaliate },
  // Sandshrew – Double Scratch; Dig Under.
  'ecard3-92': { 'Double Scratch': perHeads(2, 10), 'Dig Under': anyOpponent(10) },
  // Sandslash – Sand Trap: 10 to each of up to 2 of the opponent's Benched Pokémon; Poison Needle Rush: Poisoned on any heads.
  'ecard3-93': {
    'Sand Trap': benchMany(2, 10, 10),
    'Poison Needle Rush': {
      run(ctx) {
        const heads = ctx.flips(3);
        ctx.hit(20 * heads);
        if (heads) ctx.inflict('poisoned');
      },
    },
  },
  // Seel – Cold Breath.
  'ecard3-94': { 'Cold Breath': flipToInflict(10, 'asleep') },
  // Seel – Double Headbutt; Ice Beam.
  'ecard3-95': { 'Double Headbutt': perHeads(2, 10), 'Ice Beam': flipToInflict(10, 'paralyzed') },
  // Shuckle – Poisonous Saliva.
  'ecard3-96': { 'Poisonous Saliva': inflicts(10, 'poisoned') },
  // Skarmory – Double Peck; Spinning Head: heads switches it with the chosen Benched Pokémon.
  'ecard3-97': {
    'Double Peck': perHeads(2, 10),
    'Spinning Head': {
      choices: ownBenchFirst('Choose one of your Benched Pokémon to switch Skarmory with (on heads)'),
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) switchOwnChosen(ctx);
      },
    },
  },
  // Slugma – Scorching Lava: discard a Fire Energy card; Burned.
  'ecard3-98': { 'Scorching Lava': { discard: { count: 1, type: 'fire' }, run: (ctx) => ctx.inflict('burned') } },
  // Slugma – Singe.
  'ecard3-99': { Singe: inflicts(10, 'burned') },
  // Snorlax – Continuous Tumble.
  'ecard3-100': { 'Continuous Tumble': { run: (ctx) => void ctx.hit(30 * headsUntilTails(ctx)) } },
  // Snubbull – Scary Face (as Neo Genesis's).
  'ecard3-101': { 'Scary Face': same(() => NEO1['neo1-75']?.['Scary Face']) },
  // Stantler – Threaten (as Neo Destiny's); Antler Swipe: heads 20 to the Defending Pokémon, tails 20 to the chosen Benched Pokémon (no Weakness or Resistance).
  'ecard3-102': {
    Threaten: same(() => NEO4['neo4-9']?.Threaten),
    'Antler Swipe': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to (on tails)"),
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(20, { weakness: false, resistance: false });
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Staryu – Energy Healing: 2 damage counters off for each Energy attached; Doubleslap.
  'ecard3-103': { 'Energy Healing': { run: (ctx) => ctx.heal(20 * energyPool(ctx.attacker, ctx.state.cards).length) }, Doubleslap: perHeads(2, 10) },
  // Staryu – Confuse Ray.
  'ecard3-104': { 'Confuse Ray': flipToInflict(10, 'confused') },
  // Sunflora – Energy Plant: a basic Energy card from the deck attached to one of the player's Pokémon; Trip Over.
  'ecard3-105': {
    'Energy Plant': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Energy Plant', filter: 'basicEnergy', attach: true })) },
    'Trip Over': flipForMore(30, 30),
  },
  // Sunkern – Blot: a damage counter off Sunkern.
  'ecard3-106': {
    Blot: {
      run(ctx) {
        ctx.hit(10);
        ctx.heal(10);
      },
    },
  },
  // Swinub – Freezing Breath.
  'ecard3-107': { 'Freezing Breath': either(0, 'paralyzed', 'asleep') },
  // Swinub – Overrun: heads, 10 to the chosen Benched Pokémon of the opponent's.
  'ecard3-108': {
    Overrun: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 10 damage to (on heads)"),
      run(ctx) {
        ctx.hit(10);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot] && ctx.flip()) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Teddiursa – Surprise Attack; Rage.
  'ecard3-109': { 'Surprise Attack': flipOrNothing(20), Rage: { run: (ctx) => void ctx.hit(10 + ctx.attacker.damage) } },
  // Ursaring – Bear Hug; Rend: 20 more if the Defending Pokémon already has damage counters.
  'ecard3-110': { 'Bear Hug': noRetreat(30), Rend: { run: (ctx) => void ctx.hit(ctx.defender.damage > 0 ? 60 : 40) } },
  // Venomoth – Healing Dust: a damage counter off each of the player's Pokémon per heads; Miracle Powder: heads, the Special Condition chosen.
  'ecard3-111': {
    'Healing Dust': {
      run(ctx) {
        const heads = ctx.flips(2);
        for (const p of ownInPlay(ctx)) healUpTo(ctx, ctx.me, p, 10 * heads);
      },
    },
    'Miracle Powder': {
      choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon (on heads)' }],
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.condition && ctx.flip()) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Venonat – Double Spin; Supersonic.
  'ecard3-112': { 'Double Spin': perHeads(2, 10), Supersonic: flipToInflict(10, 'confused') },
  // Voltorb – Magnetic Pull: switch in one of the opponent's Benched Pokémon; Spin Tackle.
  'ecard3-113': { 'Magnetic Pull': lure, 'Spin Tackle': recoil(30, 10) },
  // Weedle – Fury Attack.
  'ecard3-114': { 'Fury Attack': perHeads(3, 10) },
  // Weedle – Entangling Thread; Poison Horn.
  'ecard3-115': { 'Entangling Thread': flipToInflict(0, 'paralyzed'), 'Poison Horn': flipToInflict(0, 'poisoned') },
  // Yanma – Agility; Triple Smash.
  'ecard3-116': { Agility: flipToProtect(10, 'preventAll'), 'Triple Smash': { run: (ctx) => void ctx.hit(20 + 10 * ctx.flips(3)) } },
  // Zubat – Sound Waves; Flitter.
  'ecard3-117': { 'Sound Waves': flipToInflict(0, 'confused'), Flitter: anyOpponent(10) },
  // Zubat – Poison Spray.
  'ecard3-118': { 'Poison Spray': inflicts(10, 'poisoned') },

  // Miracle Sphere α – Fire Force: with Fire and Lightning basic Energy cards, Confused; with Fire and Fighting, 10 more and 3 damage counters off the attacker.
  'ecard3-129': {
    'Fire Force': {
      run(ctx) {
        const fighting = hasBasic(ctx, 'fire', 'fighting');
        ctx.hit(fighting ? 40 : 30);
        if (hasBasic(ctx, 'fire', 'lightning')) ctx.inflict('confused');
        if (fighting) ctx.heal(30);
      },
    },
  },
  // Miracle Sphere β – Freezing Force: with Fire and Water basic Energy cards, 10 more and Burned; with Water and Psychic, an Energy card on the Defending Pokémon shuffled into the opponent's deck.
  'ecard3-130': {
    'Freezing Force': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.some((e) => !e.provides) ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: "Choose an Energy card for your opponent to shuffle into their deck (with Water and Psychic basic Energy cards)" }] : []),
      run(ctx) {
        const fire = hasBasic(ctx, 'fire', 'water');
        ctx.hit(fire ? 40 : 30);
        if (fire) ctx.inflict('burned');
        const uid = ctx.choices.defenderEnergyUid;
        const defender = ctx.opp.active;
        if (!uid || !defender || !hasBasic(ctx, 'water', 'psychic') || !reachesDefender(ctx) || !energyCanGo(ctx, defender)) return;
        const energy = defender.energy.find((e) => e.uid === uid);
        if (!energy) return;
        defender.energy = defender.energy.filter((e) => e !== energy);
        const { converted: _c, windless: _w, ...card } = energy;
        ctx.opp.deck.push(card);
        shuffleDeck(ctx, ctx.opp.id);
        ctx.log(`Shuffled ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, defender)} into the deck.`, ctx.opp.id);
      },
    },
  },
  // Miracle Sphere γ – Thunder Force: with Grass and Lightning basic Energy cards, Asleep and Poisoned; with Water and Lightning, 10 more and a damage counter on each of the opponent's Benched Pokémon.
  'ecard3-131': {
    'Thunder Force': {
      run(ctx) {
        const water = hasBasic(ctx, 'water', 'lightning');
        ctx.hit(water ? 40 : 30);
        if (hasBasic(ctx, 'grass', 'lightning')) {
          ctx.inflict('asleep');
          ctx.inflict('poisoned');
        }
        if (water) for (const slot of benchedSlots(ctx.opp.bench)) putCounters(ctx, slot, 1);
      },
    },
  },
  // Mystery Plate α – Desert Burn: 5 or more Prizes left, a Trainer card from the deck; only 1, Burned, Paralyzed and Poisoned.
  'ecard3-133': {
    'Desert Burn': {
      run(ctx) {
        const prizes = oppPrizes(ctx);
        if (prizes >= 5 && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Desert Burn', filter: 'trainer', reveal: true });
        if (prizes !== 1) return;
        ctx.inflict('burned');
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Mystery Plate β – Stone Crush: 5 or more Prizes left, draw 3; only 1, 2 Energy cards on the Defending Pokémon (1 if it has 1) shuffled into the opponent's deck.
  'ecard3-134': {
    'Stone Crush': {
      run(ctx) {
        const prizes = oppPrizes(ctx);
        if (prizes >= 5) ctx.draw(3);
        const defender = ctx.opp.active;
        if (prizes !== 1 || !defender || !reachesDefender(ctx) || !energyCanGo(ctx, defender)) return;
        const count = Math.min(2, energyCards(defender).length);
        if (count) ctx.pend({ kind: 'removeEach', source: 'Stone Crush', targets: Array<Target>(count).fill('active'), toDeck: true });
      },
    },
  },
  // Mystery Plate γ – Retro Cave: 5 or more Prizes left, the hand shuffled into the deck and 6 drawn; exactly 2, the chosen Evolved Pokémon's top card goes to the bottom of the opponent's deck.
  'ecard3-135': {
    'Retro Cave': {
      choices(s): ChoiceSpec[] {
        if (!twoPrizes(s)) return [];
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => pokemonOn(s.defender, s.opponentBench, t)!.evolvedFrom.length > 0);
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Evolved Pokémon to devolve" }] : [];
      },
      run(ctx) {
        const prizes = oppPrizes(ctx);
        if (prizes >= 5) {
          ctx.me.deck.push(...ctx.me.hand);
          ctx.me.hand = [];
          shuffleDeck(ctx, ctx.me.id);
          ctx.log('Shuffled the hand into the deck.');
          ctx.draw(6);
        }
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : pokemonOn(ctx.opp.active, ctx.opp.bench, t);
        if (prizes !== 2 || !p?.evolvedFrom.length) return;
        const devolve = () => {
          const top = p.card;
          p.card = p.evolvedFrom.pop()!;
          ctx.opp.deck.push(top);
          ctx.log(`Put ${lookupCard(ctx.state.cards, top.defId).name} on the bottom of the deck; it's ${pokemonName(ctx.state, p)} again.`, ctx.opp.id);
        };
        if (t === 'active') ctx.affectDefender(devolve);
        else if (ctx.canAffect(ctx.opp, p)) devolve();
      },
    },
  },
  // Mystery Plate δ – Healing Oasis: 5 or more Prizes left, up to 3 basic Energy cards from the deck; exactly 2, every damage counter off the chosen Pokémon of the player's.
  'ecard3-136': {
    'Healing Oasis': {
      choices(s): ChoiceSpec[] {
        if (!twoPrizes(s)) return [];
        const options = targetsIn(s.attacker, s.ownBench).filter((t) => pokemonOn(s.attacker, s.ownBench, t)!.damage > 0);
        return options.length ? [{ kind: 'ownPokemon', options, prompt: 'Choose one of your Pokémon to remove all damage counters from' }] : [];
      },
      run(ctx) {
        const prizes = oppPrizes(ctx);
        if (prizes >= 5 && ctx.me.deck.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'pickFromDeck', source: 'Healing Oasis', filter: 'basicEnergy', count: 3, optional: true, reveal: true });
        const p = ctx.choices.ownTarget === undefined ? null : pokemonOn(ctx.me.active, ctx.me.bench, ctx.choices.ownTarget);
        if (prizes === 2 && p) healUpTo(ctx, ctx.me, p, p.damage);
      },
    },
  },

  // Celebi – Empathic Healing: 2 damage counters off Celebi and each of the player's Pokémon of its type; Mind Bend.
  'ecard3-145': {
    'Empathic Healing': {
      run(ctx) {
        const type = ctx.attackerDef.type;
        for (const p of ownInPlay(ctx)) if (p === ctx.attacker || inPlayDef(ctx.state.cards, p).type === type) healUpTo(ctx, ctx.me, p, 20);
      },
    },
    'Mind Bend': flipToInflict(20, 'confused'),
  },
  // Charizard – Fireblast: discard an Energy card; Dragon Tail.
  'ecard3-146': { Fireblast: { discard: { count: 1 }, run: (ctx) => void ctx.hit(40) }, 'Dragon Tail': perHeads(2, 50) },
  // Crobat – Poison Flame: heads, Burned and Poisoned; Squared Attack.
  'ecard3-147': {
    'Poison Flame': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.inflict('burned');
        ctx.inflict('poisoned');
      },
    },
    'Squared Attack': perHeads(4, 20),
  },
  // Golem – Earth Bomb: 20 to itself and 10 to each Benched Pokémon (both players').
  'ecard3-148': {
    'Earth Bomb': {
      run(ctx) {
        ctx.hit(50);
        ctx.selfDamage(20);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Ho-oh – Scalding Steam: discard an Energy card; heads, Burned.
  'ecard3-149': { 'Scalding Steam': { ...flipToInflict(40, 'burned'), discard: { count: 1 } } },
  // Kabutops – Draining Cut: a damage counter off Kabutops; Triple Cutter.
  'ecard3-150': {
    'Draining Cut': {
      run(ctx) {
        ctx.hit(20);
        ctx.heal(10);
      },
    },
    'Triple Cutter': perHeads(3, 30),
  },
};

/** Shuffles a player's deck with the game's random numbers. */
function shuffleDeck(ctx: AttackContext, player: string) {
  const owner = ctx.state.players[player]!;
  [owner.deck, ctx.state.rngState] = shuffle(owner.deck, ctx.state.rngState);
}
