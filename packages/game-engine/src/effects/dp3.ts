// Secret Wonders (dp3) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" discards and amounts are asked before the attack; the Energy cards Blast Burn, Blaze Roar, Flare
// Tail and Dragon Finish discard are picked when the cards that fit differ (the same-card rule, agreed; nothing happens without
// enough); Psychic Cut asks how many face-down Prize cards to turn up; Ghost
// Head asks how many damage counters; Spine Missile's Pokémon are picked before the flips, the first ones for each heads;
// Healing Milk heals one Pokémon, picked first; Rummage's player picks any of the Trainer cards among the top 5 (agreed); Hidden Power (Unown Z) moves
// every damage counter from the player's Unown; Re-creation and Trace copy with the copied attack's own questions, as Metronome;
// Bring Down asks which Pokémon when several share the fewest HP left; Dig Trap's 6 counters are placed at the end of the
// opponent's next turn, the Dugtrio still Active (betweenTurns); Tag Play (+) can hit only the opponent's Bench.
import { targetsIn, type AttackContext, type AttackEffect, type ChoiceSpec } from '../attacks.js';
import { hasType, isBasicEnergy, isTrainerCard, lookupCard, namesMatch } from '../cards.js';
import { counts, energyPool, isEnergyCardOf, isSpecialEnergy, retreatCost, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { nextRandom, shuffle } from '../rng.js';
import { effectId, evolvedFromName, inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, damageOpponent, energyCards, inPlay, opponentBenchChoice, opponentSwitches, opponentTargets, same } from './common.js';
import { discardOwnEnergy } from './dp1.js';
import { discardAtRandom, energyAmount, EX1, restNextTurn } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX3 } from './ex3.js';
import { attackEffect } from './index.js';
import { evolutionsOf } from './neo2.js';
import { attachFromDiscard, notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

/** The opponent's Pokémon at a target. */
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
/** The player's own Pokémon at a target. */
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
/** The player's Pokémon in play, as targets. */
const ownTargets = (s: { attacker: InPlayPokemon; ownBench: (InPlayPokemon | null)[] }, fits: (p: InPlayPokemon) => boolean = () => true): Target[] => [
  ...(fits(s.attacker) ? ['active' as const] : []),
  ...benchedSlots(s.ownBench).filter((i) => fits(s.ownBench[i]!)),
];
/** A yes-or-no question asked before the attack: yes first. */
const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
/** Damage counters on one of the opponent's Pokémon (not attack damage), if the attack can affect it. */
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}
/** Damage counters moved from the attacker to the Defending Pokémon. */
function moveCounters(ctx: AttackContext, n: number) {
  const moved = Math.min(n, Math.floor(ctx.attacker.damage / 10));
  if (!moved || !ctx.canAffect(ctx.opp, ctx.defender)) return;
  ctx.attacker.damage -= 10 * moved;
  ctx.defender.damage += 10 * moved;
  ctx.log(`Moved ${moved} damage counter${moved === 1 ? '' : 's'} to ${ctx.defenderDef.name}.`);
}
/** The first `n` Energy cards attached to the attacker that pass `fits`, or null if there aren't that many. */
const firstEnergy = (ctx: AttackContext, n: number, fits: (e: CardInstance) => boolean = (e) => !e.provides) => {
  const cards = ctx.attacker.energy.filter(fits).slice(0, n);
  return cards.length === n ? cards : null;
};
/** How much Energy of a type a Pokémon has. */
const typedAmount = (ctx: AttackContext, p: InPlayPokemon, type: EnergyTypeName) => energyPool(p, ctx.state.cards).filter((e) => counts(e, type)).length;
type EnergyTypeName = Parameters<typeof counts>[1];

/** Copies an attack chosen from `pokemon` (Trace: one of the opponent's Benched Pokémon), with its questions; `flip` first. */
const copyFromBench = (name: string): AttackEffect => ({
  choices(s, c) {
    const sources = benchedSlots(s.opponentBench).filter((i) => inPlayDef(s.cards, s.opponentBench[i]!).attacks.length > 0);
    if (!sources.length) return [];
    const specs: ChoiceSpec[] = [{ kind: 'copySource', options: sources, prompt: `${name}: choose one of your opponent's Benched Pokémon to copy an attack of (if heads)` }];
    const from = typeof c.copyFrom === 'number' ? s.opponentBench[c.copyFrom] : null;
    if (!from) return specs;
    const attacks = inPlayDef(s.cards, from).attacks;
    specs.push({ kind: 'copyAttack', of: c.copyFrom, options: attacks.flatMap((a, i) => (a.name === name ? [] : [i])), prompt: `Choose one of ${inPlayDef(s.cards, from).name}'s attacks to copy` });
    const copied = c.copyIndex !== undefined ? attacks[c.copyIndex] : undefined;
    const effect = copied && attackEffect(effectId(from), copied.name);
    if (effect?.choices) specs.push(...effect.choices(s, c));
    return specs;
  },
  run(ctx) {
    const from = typeof ctx.choices.copyFrom === 'number' ? ctx.opp.bench[ctx.choices.copyFrom] : null;
    const copied = from && ctx.choices.copyIndex !== undefined ? inPlayDef(ctx.state.cards, from).attacks[ctx.choices.copyIndex] : undefined;
    if (!from || !copied) return ctx.log(`${name} had nothing to copy.`);
    if (!ctx.flip()) return ctx.log(`${name} did nothing.`);
    ctx.log(`${name} copies ${copied.name}.`);
    ctx.useAttack(copied, effectId(from));
  },
});

/** The Pokémon in the opponent's discard pile with attacks (Re-creation). */
const discardAttackers = (s: { opponentDiscard?: CardInstance[]; cards: Parameters<typeof lookupCard>[0] }) =>
  (s.opponentDiscard ?? []).filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return d.kind === 'pokemon' && !d.trainerText && d.attacks.length > 0;
  });

export const DP3: Record<string, Record<string, AttackEffect>> = {
  // Ampharos – Cluster Bolt: may discard all its Lightning Energy for 20 to each of the opponent's Benched Pokémon with Energy cards attached.
  'dp3-1': {
    'Cluster Bolt': {
      choices: (s) => (s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'lightning')) ? [may('Cluster Bolt: discard all Lightning Energy attached to Ampharos for 20 damage to each of your opponent\'s Benched Pokémon with Energy attached?')] : []),
      run(ctx) {
        ctx.hit(70);
        if (!ctx.choices.boost) return;
        discardOwn(ctx, ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'lightning')));
        ctx.opp.bench.forEach((p, i) => p && energyCards(p).length && ctx.damageBenched(ctx.opp, i, 20));
      },
    },
  },
  // Charizard – Blast Burn: heads, 2 Energy cards discarded; tails, 4 (nothing without them).
  'dp3-3': {
    'Blast Burn': {
      run(ctx) {
        const n = ctx.flip() ? 2 : 4;
        if (energyCards(ctx.attacker).length < n) return ctx.log("Blast Burn did nothing: Charizard doesn't have enough Energy cards.");
        discardOwnEnergy(ctx, n, 'Blast Burn');
        ctx.hit(120);
      },
    },
  },
  // Entei – Blaze Roar: 20 to one of the opponent's Benched Pokémon; tails, 2 Fire Energy discarded.
  'dp3-4': {
    'Blaze Roar': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to"),
      run(ctx) {
        ctx.hit(60);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
        if (!ctx.flip()) discardOwnEnergy(ctx, 2, 'Blaze Roar', ['fire']);
      },
    },
  },
  // Flygon – Sand Sonic: 20 more if a Fighting Energy card was attached to it from the hand this turn.
  'dp3-5': {
    'Sand Sonic': {
      run(ctx) {
        const from = ctx.attacker.fromHand;
        const fighting = from?.turn === ctx.turn && from.defIds.some((id) => {
          const d = lookupCard(ctx.state.cards, id);
          return d.kind === 'energy' && (d.energyType === 'fighting' || !!d.anyType);
        });
        ctx.hit(fighting ? 80 : 60);
      },
    },
  },
  // Gallade – Sonic Blade: damage counters until the Defending Pokémon has 50 HP left; if any, the opponent switches. Psychic Cut:
  // face-down Prize cards turned up, 20 more for each.
  'dp3-6': {
    'Sonic Blade': {
      run(ctx) {
        const left = ctx.defenderDef.hp - ctx.defender.damage;
        if (left <= 50 || !ctx.canAffect(ctx.opp, ctx.defender)) return ctx.log('Sonic Blade did nothing.');
        ctx.defender.damage = ctx.defenderDef.hp - 50;
        ctx.log(`Put damage counters on ${ctx.defenderDef.name}: it has 50 HP left.`, ctx.opp.id);
        opponentSwitches(ctx, 'Sonic Blade');
      },
    },
    'Psychic Cut': {
      choices(s): ChoiceSpec[] {
        const down = s.ownPrizes ?? 6;
        return down ? [{ kind: 'amount', options: Array.from({ length: down + 1 }, (_, i) => i), prompt: 'Psychic Cut: how many face-down Prize cards do you turn face up (20 more damage each)?' }] : [];
      },
      run(ctx) {
        const faceDown = ctx.me.prizes.filter((c) => !ctx.me.faceUpPrizes?.includes(c.uid));
        const n = Math.min(ctx.choices.amount ?? 0, faceDown.length);
        for (const card of faceDown.slice(0, n)) (ctx.me.faceUpPrizes ??= []).push(card.uid);
        if (n) ctx.log(`Turned ${n} Prize card${n === 1 ? '' : 's'} face up.`);
        ctx.hit(60 + 20 * n);
      },
    },
  },
  // Gardevoir – Psychic Lock: no Poké-Powers for the opponent next turn.
  'dp3-7': {
    'Psychic Lock': {
      run(ctx) {
        ctx.hit(60);
        ctx.opp.powerTurns = { ...ctx.opp.powerTurns, 'Psychic Lock': ctx.turn + 1 };
        ctx.log("Your opponent can't use Poké-Powers next turn.", ctx.opp.id);
      },
    },
  },
  // Gastrodon West Sea – Wild Waves: a damage counter on each Benched Pokémon, both players'.
  'dp3-9': {
    'Wild Waves': {
      run(ctx) {
        ctx.hit(80);
        for (const p of ctx.opp.bench) putCounters(ctx, p, 1);
        for (const p of ctx.me.bench) if (p) p.damage += 10;
      },
    },
  },
  // Ho-Oh – Rainbow Wing: 20 for each type of basic Energy card attached.
  'dp3-10': {
    'Rainbow Wing': {
      run(ctx) {
        const types = new Set(ctx.attacker.energy.flatMap((e) => {
          const d = lookupCard(ctx.state.cards, e.defId);
          return !e.provides && d.kind === 'energy' && isBasicEnergy(d) ? [d.energyType] : [];
        }));
        ctx.hit(20 * types.size);
      },
    },
  },
  // Jumpluff – Cottonweed Punch: 2 coins, 30 for each heads to one of the opponent's Pokémon.
  'dp3-11': {
    'Cottonweed Punch': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 30 damage to for each heads"),
      run(ctx) {
        const heads = ctx.flips(2);
        if (heads) damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 30 * heads);
      },
    },
  },
  // Lickilicky – Tongue Reel: a Benched Pokémon chosen is switched in first; 20 to the one chosen, heads Paralyzed. Boundless Power.
  'dp3-12': {
    'Tongue Reel': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon (a Benched one is switched in first)"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        if (typeof t === 'number' && ctx.opp.bench[t]) ctx.switchDefender(t);
        ctx.hit(20);
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
    'Boundless Power': { run: (ctx) => (ctx.hit(80), restNextTurn(ctx)) },
  },
  // Ludicolo – Nature Power: 20 more with the player's Stadium in play; the opponent's, Confused.
  'dp3-13': {
    'Nature Power': {
      run(ctx) {
        const owner = ctx.state.stadium?.owner;
        ctx.hit(owner === ctx.me.id ? 80 : 60);
        if (owner === ctx.opp.id) ctx.inflict('confused');
      },
    },
  },
  // Lugia – Silver Wing: heads, an Energy card of the Defending Pokémon back to the opponent's hand. Psychic Destruction: base 40
  // against a Pokémon with Energy cards attached.
  'dp3-14': {
    'Silver Wing': {
      choices: (s): ChoiceSpec[] => (energyCards(s.defender).length ? [{ kind: 'defenderEnergy', options: energyCards(s.defender), prompt: 'Choose an Energy card to return to your opponent\'s hand (if heads)' }] : []),
      run(ctx) {
        ctx.hit(20);
        const card = ctx.defender.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        if (!card || !ctx.flip()) return;
        ctx.affectDefender(() => {
          ctx.defender.energy = ctx.defender.energy.filter((e) => e !== card);
          ctx.opp.hand.push(card);
          ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} to the hand.`, ctx.opp.id);
        });
      },
    },
    'Psychic Destruction': { run: (ctx) => void ctx.hit(energyCards(ctx.defender).length ? 40 : 120) },
  },
  // Mew – Psychic Balance: draws up to the opponent's hand size. Re-creation: an attack of a Pokémon in the opponent's discard pile.
  'dp3-15': {
    'Psychic Balance': {
      run(ctx) {
        if (ctx.me.hand.length >= ctx.opp.hand.length) return ctx.log('Psychic Balance did nothing.');
        ctx.draw(ctx.opp.hand.length - ctx.me.hand.length);
      },
    },
    'Re-creation': {
      choices(s, c): ChoiceSpec[] {
        if (s.discardsLocked) return [];
        const options = discardAttackers(s);
        if (!options.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'oppDiscard', options, prompt: "Re-creation: choose a Pokémon in your opponent's discard pile" }];
        const card = options.find((x) => x.uid === c.oppDiscardUid);
        const d = card && lookupCard(s.cards, card.defId);
        if (d?.kind !== 'pokemon') return specs;
        specs.push({ kind: 'amount', options: d.attacks.map((_, i) => i), labels: d.attacks.map((a) => a.name), prompt: `Choose ${d.name}'s attack to copy` });
        const copied = c.amount !== undefined ? d.attacks[c.amount] : undefined;
        const effect = copied && attackEffect(d.id, copied.name);
        if (effect?.choices) specs.push(...effect.choices(s, c));
        return specs;
      },
      run(ctx) {
        const card = ctx.opp.discard.find((c) => c.uid === ctx.choices.oppDiscardUid);
        const d = card && lookupCard(ctx.state.cards, card.defId);
        const copied = d?.kind === 'pokemon' && ctx.choices.amount !== undefined ? d.attacks[ctx.choices.amount] : undefined;
        if (!card || !copied) return ctx.log('Re-creation had nothing to copy.');
        ctx.log(`Re-creation copies ${copied.name}.`);
        ctx.useAttack(copied, card.defId);
      },
    },
  },
  // Raikou – Thunder Climb: the top 3 cards discarded, 10 more for each Lightning Energy card, those attached to one of the player's Pokémon.
  'dp3-16': {
    'Thunder Climb': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to attach the Lightning Energy cards discarded to' }],
      run(ctx) {
        const top = ctx.me.deck.splice(0, 3);
        ctx.me.discard.push(...top);
        const lightning = top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy' && isEnergyCardOf(c, ctx.state.cards, 'lightning'));
        ctx.log(`Discarded the top ${top.length} cards of the deck.`);
        ctx.hit(50 + 10 * lightning.length);
        const to = mine(ctx, ctx.choices.ownTarget ?? 'active');
        if (!to || !lightning.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !lightning.includes(c));
        to.energy.push(...lightning);
        ctx.log(`Attached ${lightning.length} Lightning Energy card${lightning.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Salamence – Dragon Finish: 2 basic Fire Energy for 100 to the Defending Pokémon, or 2 basic Water Energy for 100 to one of the opponent's Benched Pokémon.
  'dp3-18': {
    'Dragon Finish': {
      choices: (s): ChoiceSpec[] => [may('Dragon Finish: discard 2 basic Fire Energy for 100 to the Defending Pokémon? (No: 2 basic Water Energy for 100 to a Benched Pokémon)'), ...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon (if you discard Water Energy)")],
      run(ctx) {
        const fire = ctx.choices.boost !== false;
        const gone = firstEnergy(ctx, 2, (e) => isEnergyCardOf(e, ctx.state.cards, fire ? 'fire' : 'water') && isBasicEnergy(lookupCard(ctx.state.cards, e.defId)));
        if (!gone) return ctx.log("Dragon Finish did nothing: Salamence doesn't have those Energy cards.");
        discardOwn(ctx, gone);
        if (fire) return void ctx.hit(100);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 100);
      },
    },
  },
  // Venusaur – Giant Bloom: heads, 4 damage counters off it.
  'dp3-20': {
    'Giant Bloom': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) healUpTo(ctx, ctx.me, ctx.attacker, 40);
      },
    },
  },
  // Absol – Baleful Wind: a card from the opponent's hand at random discarded, another if it was a Trainer card. Dark Raid: base 40 the turn Absol was played from the hand.
  'dp3-21': {
    'Baleful Wind': {
      run(ctx) {
        const before = ctx.opp.discard.length;
        discardAtRandom(ctx);
        const gone = ctx.opp.discard[before];
        if (gone && isTrainerCard(lookupCard(ctx.state.cards, gone.defId))) discardAtRandom(ctx);
      },
    },
    'Dark Raid': { run: (ctx) => void ctx.hit(ctx.attacker.playedTurn === ctx.turn && !ctx.attacker.evolvedFrom.length ? 40 : 10) },
  },
  // Banette – Ghost Head: as many damage counters as the player says on Banette, as many on the Defending Pokémon. Spiteful Pain:
  // 40 more with a Banette in the discard pile, which is shuffled into the deck.
  'dp3-23': {
    'Ghost Head': {
      choices(s): ChoiceSpec[] {
        const most = Math.max(0, Math.floor((inPlayDef(s.cards, s.attacker).hp - s.attacker.damage) / 10));
        return most ? [{ kind: 'amount', options: Array.from({ length: most + 1 }, (_, i) => most - i), prompt: 'Ghost Head: how many damage counters do you put on Banette (as many on the Defending Pokémon)?' }] : [];
      },
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, Math.floor((ctx.attackerDef.hp - ctx.attacker.damage) / 10));
        if (!n) return ctx.log('Ghost Head did nothing.');
        ctx.attacker.damage += 10 * n;
        ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on Banette.`);
        putCounters(ctx, ctx.defender, n);
      },
    },
    'Spiteful Pain': {
      run(ctx) {
        const banette = discardsLocked([ctx.me, ctx.opp], ctx.state.cards) ? undefined : ctx.me.discard.find((c) => namesMatch(lookupCard(ctx.state.cards, c.defId).name, 'Banette'));
        ctx.hit(banette ? 80 : 40);
        if (!banette) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== banette);
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, banette], ctx.state.rngState);
        ctx.log('Shuffled Banette from the discard pile into the deck.');
      },
    },
  },
  // Dugtrio – Dig Trap: tails, nothing; heads, all effects of attacks on it prevented next turn, and 6 damage counters on one of the
  // opponent's Benched Pokémon at its end if Dugtrio is still Active. Pit Trap: the opponent's tails, 50 more.
  'dp3-24': {
    'Dig Trap': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Dig Trap did nothing.');
        ctx.protect('preventAll');
        (ctx.attacker.effects ??= {}).digTrap = ctx.turn + 1;
        ctx.log("If Dugtrio is still your Active Pokémon at the end of your opponent's next turn, 6 damage counters go on one of their Benched Pokémon.");
      },
    },
    'Pit Trap': { run: (ctx) => void ctx.hit(ctx.oppFlip() ? 50 : 100) },
  },
  // Electivire – Discharge: all its Lightning Energy discarded, a coin for each, 50 for each heads.
  'dp3-25': {
    Discharge: {
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'lightning'));
        discardOwn(ctx, gone);
        ctx.hit(50 * ctx.flips(gone.length));
      },
    },
  },
  // Furret – Keen Eye: as EX Ruby & Sapphire Delcatty's Seek Out (2 cards).
  'dp3-27': { 'Keen Eye': same(() => EX1['ex1-38']?.['Seek Out']) },
  // Golduck – Encore: the Defending Pokémon can use only the attack chosen next turn. Break Beam: may do 20 more, then Confused.
  'dp3-28': {
    Encore: {
      choices: (s): ChoiceSpec[] => {
        const options = inPlayDef(s.cards, s.defender).attacks.map((_, i) => i);
        return options.length ? [{ kind: 'defenderAttack', options, prompt: "Choose the only attack the Defending Pokémon can use next turn" }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const attack = ctx.choices.attackIndex !== undefined ? ctx.defenderDef.attacks[ctx.choices.attackIndex] : undefined;
        if (!attack) return;
        ctx.affectDefender((e) => {
          e.encore = { attack: attack.name, until: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name} can use only ${attack.name} next turn.`, ctx.opp.id);
        });
      },
    },
    'Break Beam': {
      choices: () => [may('Break Beam: do 20 more damage (Golduck is then Confused)?')],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 60 : 40);
        if (ctx.choices.boost) ctx.confuseSelf();
      },
    },
  },
  // Golem – Megaton Rock: may do 40 instead, for 40 less damage to it next turn.
  'dp3-29': {
    'Megaton Rock': {
      choices: () => [may('Megaton Rock: do 40 damage instead of 80, for 40 less damage to Golem next turn?')],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(80);
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 40, until: ctx.turn + 1 };
        ctx.log('Damage to Golem is reduced by 40 next turn.');
      },
    },
  },
  // Jynx – Lovely Kiss: 2 damage counters moved from Jynx to the Defending Pokémon, 4 with Smoochum under it.
  'dp3-30': { 'Lovely Kiss': { run: (ctx) => moveCounters(ctx, evolvedFromName(ctx.state.cards, ctx.attacker, 'Smoochum') ? 4 : 2) } },
  // Magmortar – Flame Blast: 20 for each Fire Energy attached.
  'dp3-31': { 'Flame Blast': { run: (ctx) => void ctx.hit(20 * typedAmount(ctx, ctx.attacker, 'fire')) } },
  // Minun – Tag Play (-): with Plusle on the Bench, may move an Energy card from Minun to one of the player's Benched Pokémon.
  'dp3-32': {
    'Tag Play (-)': {
      choices(s): ChoiceSpec[] {
        const plusle = s.ownBench.some((p) => p && namesMatch(inPlayDef(s.cards, p).name, 'Plusle'));
        const options = benchedSlots(s.ownBench);
        if (!plusle || !options.length || !energyCards(s.attacker).length) return [];
        return [
          { kind: 'ownBench', options: [-1, ...options], optional: true, prompt: 'You may choose one of your Benched Pokémon to move an Energy card to' },
          { kind: 'ownEnergy', count: 1, options: energyCards(s.attacker), prompt: 'Choose the Energy card to move' },
        ];
      },
      run(ctx) {
        ctx.hit(20);
        const slot = ctx.choices.ownBenchSlot;
        const to = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        const card = ctx.attacker.energy.find((e) => e.uid === ctx.choices.energyUids?.[0]);
        if (!to || !card) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Mothim – Raging Scales: 40 more with damage counters on it.
  'dp3-33': { 'Raging Scales': { run: (ctx) => void ctx.hit(ctx.attacker.damage ? 70 : 30) } },
  // Nidoking – Poison Rub: first, may switch in one of the opponent's Benched Pokémon; the Defending Pokémon is Poisoned. Pride
  // Attack: a coin for each Nidoqueen on the Bench, 30 more for each heads.
  'dp3-34': {
    'Poison Rub': {
      choices: (s): ChoiceSpec[] => {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to switch in first" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) ctx.switchDefender(slot);
        ctx.hit(20);
        ctx.inflict('poisoned');
      },
    },
    'Pride Attack': { run: (ctx) => void ctx.hit(60 + 30 * ctx.flips(ctx.me.bench.filter((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Nidoqueen')).length)) },
  },
  // Plusle – Tag Play (+): with Minun on the Bench, may do 20 to one of the opponent's Benched Pokémon instead.
  'dp3-36': {
    'Tag Play (+)': {
      choices: (s): ChoiceSpec[] => {
        const minun = s.ownBench.some((p) => p && namesMatch(inPlayDef(s.cards, p).name, 'Minun'));
        const options = benchedSlots(s.opponentBench);
        return minun && options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon to do the 20 damage to instead" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0 && ctx.opp.bench[slot]) return ctx.damageBenched(ctx.opp, slot, 20);
        ctx.hit(20);
      },
    },
  },
  // Sharpedo – Strike Wound: 20 more against 2 or more damage counters; nothing on the Defending Pokémon changes the damage.
  'dp3-37': { 'Strike Wound': { run: (ctx) => void ctx.hit(ctx.defender.damage >= 20 ? 80 : 60, { swift: true }) } },
  // Sunflora – Petal Dance: 3 coins, 30 for each heads; 2 or more heads, Confused.
  'dp3-38': {
    'Petal Dance': {
      run(ctx) {
        const heads = ctx.flips(3);
        ctx.hit(30 * heads);
        if (heads >= 2) ctx.confuseSelf();
      },
    },
  },
  // Wormadam Plant Cloak – Leaf Hurricane: Confused if the Defending Pokémon has fewer HP left than Wormadam.
  'dp3-41': {
    'Leaf Hurricane': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.defenderDef.hp - ctx.defender.damage < inPlayDef(ctx.state.cards, ctx.attacker).hp - ctx.attacker.damage) ctx.inflict('confused');
      },
    },
  },
  // Xatu – Energy Singe: 20 to one of the opponent's Pokémon, 10 more for each Energy attached to it.
  'dp3-44': {
    'Energy Singe': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do damage to"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = theirs(ctx, t);
        if (p) damageOpponent(ctx, t, 20 + 10 * energyAmount(ctx, p));
      },
    },
  },
  // Breloom – Drain Punch: a damage counter off it for each Energy on the Defending Pokémon. Homing Uppercut: 60 more against no Retreat Cost.
  'dp3-45': {
    'Drain Punch': {
      run(ctx) {
        ctx.hit(40);
        healUpTo(ctx, ctx.me, ctx.attacker, 10 * energyAmount(ctx, ctx.defender));
      },
    },
    'Homing Uppercut': { run: (ctx) => void ctx.hit(retreatCost(ctx.defender, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card) === 0 ? 120 : 60) },
  },
  // Charmeleon – Flare Tail: heads, a Fire Energy discarded and 20 more.
  'dp3-46': {
    'Flare Tail': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(50);
        discardOwnEnergy(ctx, 1, 'Flare Tail', ['fire']);
        ctx.hit(70);
      },
    },
  },
  // Cloyster – Spine Missile: 4 coins; 20 for each heads to the Pokémon picked (the same any number of times).
  'dp3-47': {
    'Spine Missile': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentBenchMany', count: 4, options: [-1, ...benchedSlots(s.opponentBench)], repeat: true, prompt: "Choose 4 of your opponent's Pokémon (the same one again if you like), in order: one for each heads" }],
      run(ctx) {
        const heads = ctx.flips(4);
        const picks: Target[] = (ctx.choices.benchSlots ?? []).slice(0, heads).map((s) => (s === -1 ? 'active' : s));
        for (const t of new Set(picks)) damageOpponent(ctx, t, 20 * picks.filter((p) => p === t).length);
      },
    },
  },
  // Donphan – Bash In: 60 more against a Pokémon Tool.
  'dp3-48': { 'Bash In': { run: (ctx) => void ctx.hit((ctx.defender.attached ?? []).some((a) => a.tool) ? 130 : 70) } },
  // Farfetch'd – Swords Dance: Leek Slap's base damage is 60 next turn. Leek Slap: not again next turn.
  'dp3-49': {
    'Swords Dance': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Leek Slap', turn: ctx.turn + 2 };
        ctx.log("Farfetch'd's Leek Slap's base damage is 60 next turn.");
      },
    },
    'Leek Slap': {
      run(ctx) {
        const boosted = ctx.attacker.effects?.boostedAttack?.attack === 'Leek Slap' && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
        ctx.hit(boosted ? 60 : 30);
        notNextTurn(ctx, 'Leek Slap');
      },
    },
  },
  // Kecleon – Blind Scratch: tails, no damage to the Defending Pokémon; 20 to one of the player's Pokémon (asked first) instead.
  'dp3-52': {
    'Blind Scratch': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to do 20 damage to (if tails)' }],
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(60);
        const t = ctx.choices.ownTarget ?? 'active';
        if (t === 'active') return ctx.selfDamage(20);
        const p = ctx.me.bench[t];
        if (!p) return;
        p.damage += 20;
        ctx.log(`${pokemonName(ctx.state, p)} took 20 damage.`);
      },
    },
  },
  // Kirlia – Psychic Research: the effect of a Supporter card in the player's discard pile (it stays there).
  'dp3-53': {
    'Psychic Research': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        ctx.pend({ kind: 'supernatural', source: 'Psychic Research', ownDiscard: true });
      },
    },
  },
  // Lombre – Torment: as Mysterious Treasures Croagunk's Ghastly Sound, with damage.
  'dp3-54': {
    Torment: {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.opp.noSupportersUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Supporter cards next turn.", ctx.opp.id);
      },
    },
  },
  // Miltank – Healing Milk: 2 coins, 3 damage counters off one of the player's Pokémon (asked first) for each heads.
  'dp3-55': {
    'Healing Milk': {
      choices: (s): ChoiceSpec[] => {
        const options = ownTargets(s, (p) => p.damage > 0);
        return options.length ? [{ kind: 'ownPokemon', options, prompt: 'Choose one of your Pokémon to heal' }] : [];
      },
      run(ctx) {
        const heads = ctx.flips(2);
        const p = ctx.choices.ownTarget === undefined ? null : mine(ctx, ctx.choices.ownTarget);
        if (p && heads) healUpTo(ctx, ctx.me, p, 30 * heads);
      },
    },
  },
  // Pinsir – Power Guillotine: base 10 unless both coins are heads.
  'dp3-59': { 'Power Guillotine': { run: (ctx) => void ctx.hit(ctx.flips(2) === 2 ? 100 : 10) } },
  // Sableye – Rummage: any Trainer cards among the top 5 into the hand, shown; the rest shuffled back. Shadow Sneak: 20 more
  // when the players have different numbers of Prize cards left.
  'dp3-63': {
    Rummage: {
      run(ctx) {
        const top = ctx.me.deck.slice(0, 5);
        if (top.some((c) => isTrainerCard(lookupCard(ctx.state.cards, c.defId)))) return ctx.pend({ kind: 'pickFromTop', source: 'Rummage', looked: top.map((c) => c.uid), take: 5, trainer: true });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Rummage found no Trainer cards.');
      },
    },
    'Shadow Sneak': { run: (ctx) => void ctx.hit(ctx.me.prizes.length !== ctx.opp.prizes.length ? 40 : 20) },
  },
  // Shelgon – Focus Energy: Protect Charge's base damage is 80 next turn. Protect Charge: 30 less damage to it next turn.
  'dp3-64': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Protect Charge', turn: ctx.turn + 2 };
        ctx.log("Shelgon's Protect Charge's base damage is 80 next turn.");
      },
    },
    'Protect Charge': {
      run(ctx) {
        const boosted = ctx.attacker.effects?.boostedAttack?.attack === 'Protect Charge' && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
        ctx.hit(boosted ? 80 : 30);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 30, until: ctx.turn + 1 };
      },
    },
  },
  // Smeargle – Color Pick: up to 3 basic Energy cards from the deck, shown. Trace: heads, an attack of one of the opponent's Benched Pokémon.
  'dp3-66': {
    'Color Pick': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Color Pick', filter: 'basicEnergy', count: 3, reveal: true, optional: true })) },
    Trace: copyFromBench('Trace'),
  },
  // Smoochum – Psykiss: heads, a Special Energy card of one of the opponent's Pokémon shuffled into their deck.
  'dp3-67': {
    Psykiss: {
      choices(s, c): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => (t === 'active' ? s.defender : s.opponentBench[t])!.energy.some((e) => isSpecialEnergy(s.cards, e)));
        if (!options.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon with a Special Energy card (if heads)" }];
        const p = c.oppTarget === undefined ? null : c.oppTarget === 'active' ? s.defender : s.opponentBench[c.oppTarget];
        if (p) specs.push({ kind: 'pokemonEnergy', options: p.energy.filter((e) => isSpecialEnergy(s.cards, e)), prompt: 'Choose the Special Energy card' });
        return specs;
      },
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Psykiss did nothing.');
        const p = ctx.choices.oppTarget === undefined ? null : theirs(ctx, ctx.choices.oppTarget);
        const card = p?.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        if (!p || !card || !ctx.canAffect(ctx.opp, p)) return;
        p.energy = p.energy.filter((e) => e !== card);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, card], ctx.state.rngState);
        ctx.log(`Shuffled ${lookupCard(ctx.state.cards, card.defId).name} into the deck.`, ctx.opp.id);
      },
    },
  },
  // Unown Z – Hidden Power: every damage counter on the player's Unown moved to the Defending Pokémon.
  'dp3-72': {
    'Hidden Power': {
      run(ctx) {
        let n = 0;
        for (const p of inPlay(ctx.me)) {
          if (!inPlayDef(ctx.state.cards, p).name.includes('Unown')) continue;
          n += Math.floor(p.damage / 10);
          p.damage %= 10;
        }
        if (n) putCounters(ctx, ctx.defender, n);
        else ctx.log('Hidden Power did nothing.');
      },
    },
  },
  // Venomoth – Disturbance Dive: no effects but damage from attacks on it next turn.
  'dp3-73': {
    'Disturbance Dive': {
      run(ctx) {
        ctx.hit(50);
        (ctx.attacker.effects ??= {}).effectProof = ctx.turn + 1;
        ctx.log("Attacks' effects other than damage don't affect Venomoth next turn.");
      },
    },
  },
  // Carvanha – Bite Away: heads, a card from the opponent's hand at random discarded.
  'dp3-81': { 'Bite Away': { run: (ctx) => (ctx.hit(20), ctx.flip() && discardAtRandom(ctx)) } },
  // Corsola – Rally: up to 3 Basic Pokémon of different types from the deck onto the Bench.
  'dp3-84': { Rally: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Rally', filter: 'basic', toBench: true, optional: true, count: 3, distinct: 'type' })) } },
  // Diglett – Down Draw: the bottom card of the deck drawn.
  'dp3-85': {
    'Down Draw': {
      run(ctx) {
        const card = ctx.me.deck.pop();
        if (!card) return ctx.log('Your deck is empty.');
        ctx.me.hand.push(card);
        ctx.log('Drew the bottom card of the deck.');
      },
    },
  },
  // Duskull – Astonish: heads, a card from the opponent's hand at random shuffled into their deck.
  'dp3-86': {
    Astonish: {
      run(ctx) {
        if (!ctx.flip() || !ctx.opp.hand.length) return ctx.log('Astonish did nothing.');
        const [card] = ctx.opp.hand.splice(rngIndex(ctx, ctx.opp.hand.length), 1);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, card!], ctx.state.rngState);
        ctx.log("Shuffled a card from the opponent's hand into their deck.", ctx.opp.id);
      },
    },
  },
  // Natu – Bothering Wave: tails, nothing; heads, an Energy card of the Defending Pokémon discarded.
  'dp3-96': {
    'Bothering Wave': {
      choices: (s): ChoiceSpec[] => (energyCards(s.defender).length ? [{ kind: 'defenderEnergy', options: energyCards(s.defender), prompt: 'Choose an Energy card to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Bothering Wave did nothing.');
        ctx.hit(20);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Nidoran ♂ – Poison Skin: Poisoned unless both coins are tails.
  'dp3-97': { 'Poison Skin': { run: (ctx) => void (ctx.flips(2) && ctx.inflict('poisoned')) } },
  // Psyduck – Delusion: Confused, 2 cards drawn.
  'dp3-100': { Delusion: { run: (ctx) => (ctx.attacker.condition === 'confused' ? ctx.draw(2) : ctx.log('Delusion did nothing.')) } },
  // Sentret – Grope: one of the top 2 cards into the hand, the other on the bottom.
  'dp3-104': { Grope: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromTop', source: 'Grope', looked: ctx.me.deck.slice(0, 2).map((c) => c.uid), take: 1, shuffleRest: true, toBottom: true })) } },
  // Shellos East Sea – Shell Hunting: up to 2 Shellos (either) from the deck onto the Bench.
  'dp3-106': { 'Shell Hunting': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Shell Hunting', filter: 'basicNamed', name: ['Shellos West Sea', 'Shellos East Sea'], toBench: true, optional: true, count: 2 })) } },
  // Shellos West Sea – Recover: a Water Energy discarded, all damage counters off.
  'dp3-107': {
    Recover: {
      discard: { count: 1, type: 'water' },
      run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, ctx.attacker.damage),
    },
  },
  // Shuckle – Ferment Poison: Poisoned; while it stays Poisoned, no Poké-Bodies (powerActive).
  'dp3-109': {
    'Ferment Poison': {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('poisoned');
        if (ctx.defender.poison) ctx.affectDefender((e) => (e.fermentPoison = true));
      },
    },
  },
  // Shuppet – Gossip: as EX Dragon Shuppet's Night Attack.
  'dp3-110': { Gossip: same(() => EX3['ex3-43']?.['Night Attack']) },
  // Spinda – Dish Out: the top and the bottom card drawn. Synchro Punch: 30 more when a basic Energy card on it shares a type with the Defending Pokémon's Energy.
  'dp3-111': {
    'Dish Out': {
      run(ctx) {
        const top = ctx.me.deck.shift();
        const bottom = ctx.me.deck.pop();
        ctx.me.hand.push(...[top, bottom].filter((c): c is CardInstance => !!c));
        ctx.log('Drew the top and the bottom card of the deck.');
      },
    },
    'Synchro Punch': {
      run(ctx) {
        const theirs = energyPool(ctx.defender, ctx.state.cards);
        const sync = ctx.attacker.energy.some((e) => {
          const d = lookupCard(ctx.state.cards, e.defId);
          return !e.provides && d.kind === 'energy' && isBasicEnergy(d) && theirs.some((t) => counts(t, d.energyType));
        });
        ctx.hit(sync ? 40 : 10);
      },
    },
  },
  // Stantler – Frighten Horn: a Defending Pokémon that isn't an Evolved Pokémon is Confused.
  'dp3-113': {
    'Frighten Horn': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.defender.evolvedFrom.length) ctx.inflict('confused');
      },
    },
  },
  // Sunkern – Sun Soak: heads, all damage counters off and a card that evolves from it from the deck onto it.
  'dp3-114': {
    'Sun Soak': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Sun Soak did nothing.');
        healUpTo(ctx, ctx.me, ctx.attacker, ctx.attacker.damage);
        const names = evolutionsOf(ctx, ctx.attackerDef.name);
        if (ctx.me.deck.some((c) => names.includes(lookupCard(ctx.state.cards, c.defId).name))) return ctx.pend({ kind: 'evolveFromDeck', source: 'Sun Soak', target: 'active', names });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      },
    },
  },
  // Gardevoir LV.X – Bring Down: the Pokémon in play (not Gardevoir) with the fewest HP left is Knocked Out (the player picks among a tie).
  'dp3-131': {
    'Bring Down': {
      choices(s): ChoiceSpec[] {
        const all = [...targetsIn(s.defender, s.opponentBench).map((t) => ({ side: 'opponent' as const, t, p: (t === 'active' ? s.defender : s.opponentBench[t])! })), ...benchedSlots(s.ownBench).map((t) => ({ side: 'own' as const, t: t as Target, p: s.ownBench[t]! }))];
        const left = (p: InPlayPokemon) => inPlayDef(s.cards, p).hp - p.damage;
        const least = Math.min(...all.map((x) => left(x.p)));
        const tied = all.filter((x) => left(x.p) === least);
        if (tied.length <= 1) return [];
        const opp = tied.filter((x) => x.side === 'opponent').map((x) => x.t);
        const own = tied.filter((x) => x.side === 'own').map((x) => x.t);
        return [
          ...(opp.length && own.length ? [{ kind: 'side' as const, options: ['opponent', 'own'] as ('own' | 'opponent')[], prompt: "Bring Down: your opponent's Pokémon or yours?" }] : []),
          ...(opp.length ? [{ kind: 'opponentPokemon' as const, options: opp, prompt: 'Choose the Pokémon to Knock Out' }] : []),
          ...(own.length ? [{ kind: 'ownPokemon' as const, options: own, prompt: 'Choose your Pokémon to Knock Out' }] : []),
        ];
      },
      run(ctx) {
        const all = [...inPlay(ctx.opp).map((p) => ({ owner: ctx.opp, p })), ...ctx.me.bench.filter((p): p is InPlayPokemon => !!p).map((p) => ({ owner: ctx.me, p }))];
        if (!all.length) return;
        const left = (p: InPlayPokemon) => inPlayDef(ctx.state.cards, p).hp - p.damage;
        const least = Math.min(...all.map((x) => left(x.p)));
        const tied = all.filter((x) => left(x.p) === least);
        const pickedOwn = ctx.choices.side === 'own' || (ctx.choices.oppTarget === undefined && ctx.choices.ownTarget !== undefined);
        const picked = tied.length === 1 ? tied[0] : pickedOwn ? tied.find((x) => x.owner === ctx.me && x.p === mine(ctx, ctx.choices.ownTarget ?? 0)) : tied.find((x) => x.owner === ctx.opp && x.p === theirs(ctx, ctx.choices.oppTarget ?? 'active'));
        const target = picked ?? tied[0]!;
        if (target.owner === ctx.opp && !ctx.canAffect(ctx.opp, target.p)) return;
        target.p.damage = Math.max(target.p.damage, inPlayDef(ctx.state.cards, target.p).hp);
        ctx.log(`Bring Down: ${pokemonName(ctx.state, target.p)} is Knocked Out.`, target.owner.id);
      },
    },
  },
  // Honchkrow LV.X – Darkness Wing: if the damage Knocks Out the Defending Pokémon, may take any card from the discard pile, shown.
  'dp3-132': {
    'Darkness Wing': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.defender.damage < ctx.defenderDef.hp || discardsLocked([ctx.me, ctx.opp], ctx.state.cards) || !ctx.me.discard.length) return;
        ctx.pend({ kind: 'discardToHand', source: 'Darkness Wing', count: 1, filter: 'any', reveal: true });
      },
    },
  },
};

/** A random index below `n`, from the game's random state. */
function rngIndex(ctx: AttackContext, n: number) {
  const [r, next] = nextRandom(ctx.state.rngState);
  ctx.state.rngState = next;
  return Math.floor(r * n);
}
