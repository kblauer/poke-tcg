// EX Crystal Guardians (ex14) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// From the text: Pick and Choose asks Burned or Poisoned first, then Asleep or Confused; Shield Beam stops every Poké-Power
// of the opponent's during their next turn, Pokémon put into play then included (powerError); Star Light takes 1 Colorless
// off Shield Beam and Super Psy Bolt while the opponent has a Pokémon-ex or an Evolved Stage 2 Pokémon in play; Skill Copy
// discards the card even when Alakazam ☆ doesn't have the Energy for the attack; Burn Away's recoil is the damage done less
// the HP the Defending Pokémon had left; Ultra Pump's 2 cards are picked once its damage is done; Mining's Pokémon Tool may
// go on any of the player's Pokémon it fits.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { lookupCard, type Attack, type CardLibrary, type EnergyType } from '../cards.js';
import { canPayCost, energyPool, toolOf, type CardInstance } from '../engine.js';
import { powerActive } from '../powers.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { attackEffect } from './index.js';
import { opponentBenchChoice } from './common.js';
import { discardOwn, energyCardOf, inPlay } from './ex2.js';
import { counterPicks } from './ex4.js';
import { ascension } from './ex5.js';
import { notNextTurn, snipe } from './ex6.js';
import { chooseOpponents, dragOff, EX8 } from './ex8.js';
import { derail, EX12, exProof, same } from './ex12.js';
import { discardFromAttacker, healEach } from './gym1.js';
import { discardFree } from './neo3.js';

/** The Pokémon at the target of the opponent's side. */
const oppAt = (ctx: AttackContext, t: ReturnType<typeof targetsIn>[number]) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]) ?? null;

/** `damage` to the chosen one of the opponent's Pokémon, no Weakness or Resistance on the Bench. */
export const damageAt = (ctx: AttackContext, t: ReturnType<typeof targetsIn>[number], damage: number) => (t === 'active' ? void ctx.hit(damage) : ctx.damageBenched(ctx.opp, t, damage));

/** Star Light: 1 Colorless less while the opponent has a Pokémon-ex or an Evolved Stage 2 Pokémon in play and it works. */
const starLight = (cost: EnergyType[]) => (s: AttackSituation): EnergyType[] | null => {
  const sides = [{ active: s.attacker, bench: s.ownBench }, { active: s.defender, bench: s.opponentBench }];
  const big = [s.defender, ...s.opponentBench].some((p) => p && (inPlayDef(s.cards, p).ex || (inPlayDef(s.cards, p).stage === 'stage2' && p.evolvedFrom.length > 0)));
  return big && powerActive(s.attacker, s.cards, sides) ? cost : null;
};

/** "Put any 1 card from your discard pile into your hand" (Psychic Select). */
export const anyCardBack = (source: string): AttackEffect => ({
  run(ctx) {
    if (ctx.me.discard.length && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source, count: 1, filter: 'any' });
  },
});

/** The attacks of the Basic Pokémon and Evolution cards in a hand (Skill Copy). */
const handAttacks = (cards: CardLibrary, hand: CardInstance[], name: string) =>
  hand.flatMap((card) => {
    const d = lookupCard(cards, card.defId);
    return d.kind === 'pokemon' && !d.trainerText ? d.attacks.filter((a) => a.name !== name).map((attack: Attack) => ({ card, attack })) : [];
  });

export const EX14: Record<string, Record<string, AttackEffect>> = {
  // Banette – Night Murmurs: a Basic Defending Pokémon is now Confused.
  'ex14-1': {
    'Night Murmurs': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.defenderDef.stage === 'basic') ctx.inflict('confused');
      },
    },
  },
  // Blastoise δ – Enraged Linear Attack: as EX Legend Maker Blastoise's.
  'ex14-2': { 'Enraged Linear Attack': same(() => EX12['ex12-6']?.['Enraged Linear Attack']) },
  // Charizard δ – Metal Burn: every Metal Energy card attached discarded.
  'ex14-4': {
    'Metal Burn': {
      run(ctx) {
        ctx.hit(120);
        discardOwn(ctx, ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'metal')));
      },
    },
  },
  // Luvdisc – Even Game: up to as many Basic Pokémon from the deck onto the Bench as the opponent has Pokémon; Stadium Play:
  // with the player's Stadium, a damage counter off each of their Pokémon; with the opponent's, 10 to each of their Benched Pokémon.
  'ex14-7': {
    'Even Game': {
      run(ctx) {
        const n = inPlay(ctx.opp).length;
        if (n && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Even Game', filter: 'basic', toBench: true, count: n, optional: true });
      },
    },
    'Stadium Play': {
      run(ctx) {
        ctx.hit(10);
        const owner = ctx.state.stadium?.owner;
        if (owner === ctx.me.id) healEach(ctx, 10);
        else if (owner === ctx.opp.id) ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Manectric – Strong Current: with a Pokémon Tool attached, 20 to each of the opponent's Benched Pokémon-ex.
  'ex14-8': {
    'Strong Current': {
      run(ctx) {
        ctx.hit(50);
        if (!toolOf(ctx.state.cards, ctx.attacker)) return;
        ctx.opp.bench.forEach((p, i) => p && inPlayDef(ctx.state.cards, p).ex && ctx.damageBenched(ctx.opp, i, 20));
      },
    },
  },
  // Mawile – Mining: a Trainer card from the deck, shown; a Pokémon Tool may be attached instead.
  'ex14-9': { Mining: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Mining', filter: 'trainer', reveal: true, toolMayAttach: true })) } },
  // Swalot – Pick and Choose: Burned or Poisoned, and Asleep or Confused.
  'ex14-11': {
    'Pick and Choose': {
      choices: (): ChoiceSpec[] => [
        { kind: 'condition', options: ['burned', 'poisoned'], prompt: 'Pick and Choose: Burned or Poisoned?' },
        { kind: 'amount', options: [0, 1], labels: ['Asleep', 'Confused'], prompt: 'Pick and Choose: Asleep or Confused?' },
      ],
      run(ctx) {
        ctx.inflict(ctx.choices.condition === 'burned' ? 'burned' : 'poisoned');
        ctx.inflict(ctx.choices.amount === 1 ? 'confused' : 'asleep');
      },
    },
  },
  // Cacturne δ – Triple Needle: 10 to 3 of the opponent's Pokémon.
  'ex14-15': { 'Triple Needle': chooseOpponents(3, 10, "Choose 3 of your opponent's Pokémon to do 10 damage to") },
  // Combusken – Focus Energy: its High Jump Kick's base damage is 70 next turn.
  'ex14-16': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).focusEnergy = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name}'s High Jump Kick's base damage is 70 next turn.`);
      },
    },
    'High Jump Kick': { run: (ctx) => void ctx.hit(ctx.attacker.effects?.focusEnergy === ctx.turn ? 70 : 30) },
  },
  // Dusclops – Psychic Shield: the opponent's Pokémon-ex's attacks do nothing to it next turn.
  'ex14-17': { 'Psychic Shield': exProof(50) },
  // Venusaur – Toxic Sleep: Asleep and Poisoned, 2 damage counters between turns.
  'ex14-28': {
    'Toxic Sleep': {
      run(ctx) {
        ctx.inflict('asleep');
        ctx.inflict('toxic');
      },
    },
  },
  // Lairon – Metal Charge: a damage counter on it.
  'ex14-36': {
    'Metal Charge': {
      run(ctx) {
        ctx.hit(50);
        ctx.attacker.damage += 10;
        ctx.log(`Put a damage counter on ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Nuzleaf – Self Charge: a Darkness Energy card from the hand attached to it.
  'ex14-39': { 'Self Charge': { run: (ctx) => void (ctx.me.hand.length && ctx.pend({ kind: 'attachFromHand', source: 'Self Charge', count: 1, types: ['darkness'], target: 'active' })) } },
  // Shuppet – Ascension.
  'ex14-40': { Ascension: ascension },
  // Bulbasaur – Growth: a Grass Energy card from the hand attached to it.
  'ex14-46': { Growth: { run: (ctx) => void (ctx.me.hand.length && ctx.pend({ kind: 'attachFromHand', source: 'Growth', count: 1, types: ['grass'], target: 'active' })) } },
  // Electrike – Sniff Out: as EX Deoxys Electrike's.
  'ex14-52': { 'Sniff Out': same(() => EX8['ex8-41']?.['Sniff Out']) },
  // Meditite – Pure Power: 2 damage counters on the opponent's Pokémon, as the player likes.
  'ex14-56': { 'Pure Power': { run: (ctx) => counterPicks(ctx, 'Pure Power', 2) } },
  // Aggron ex – Split Bomb: 30 to 2 of the opponent's Pokémon; Mega Burn: not again next turn.
  'ex14-89': {
    'Split Bomb': chooseOpponents(2, 30, "Choose 2 of your opponent's Pokémon to do 30 damage to"),
    'Mega Burn': {
      run(ctx) {
        ctx.hit(100);
        notNextTurn(ctx, 'Mega Burn');
      },
    },
  },
  // Blaziken ex – Drag Off; Burn Away: no Weakness, Resistance or other effects; if it Knocks Out, the damage beyond the HP left to itself.
  'ex14-90': {
    'Drag Off': dragOff(30),
    'Burn Away': {
      run(ctx) {
        const hp = inPlayDef(ctx.state.cards, ctx.defender).hp;
        const left = Math.max(0, hp - ctx.defender.damage);
        const done = ctx.hit(100, { swift: true });
        if (ctx.defender.damage >= hp && done > left) ctx.selfDamage(done - left);
      },
    },
  },
  // Delcatty ex – Upstream: every Energy card in the discard pile shuffled into the deck, 10 for each.
  'ex14-91': {
    Upstream: {
      run(ctx) {
        const energy = discardFree(ctx) ? ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') : [];
        ctx.hit(10 * energy.length);
        if (!energy.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !energy.includes(c));
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...energy], ctx.state.rngState);
        ctx.log(`Shuffled ${energy.length} Energy card${energy.length === 1 ? '' : 's'} from the discard pile into the deck.`);
      },
    },
  },
  // Exploud ex – Derail.
  'ex14-92': { Derail: derail(40) },
  // Groudon ex – Power Blast: 2 Energy discarded.
  'ex14-93': { 'Power Blast': { discard: { count: 2 }, run: (ctx) => void ctx.hit(100) } },
  // Jirachi ex – Shield Beam: no Poké-Powers for the opponent next turn; Super Psy Bolt. Both cheaper with Star Light.
  'ex14-94': {
    'Shield Beam': {
      costNow: starLight(['psychic']),
      run(ctx) {
        ctx.hit(30);
        (ctx.opp.powerTurns ??= {})['Shield Beam'] = ctx.turn + 1;
        ctx.log("Your opponent can't use Poké-Powers during their next turn.", ctx.opp.id);
      },
    },
    'Super Psy Bolt': { costNow: starLight(['psychic', 'colorless']), run: (ctx) => void ctx.hit(50) },
  },
  // Kyogre ex – Hydro Shot: 2 Energy discarded, 70 to one of the opponent's Pokémon.
  'ex14-95': { 'Hydro Shot': { ...snipe(70), discard: { count: 2 } } },
  // Shiftry ex – Target Attack: 30 to one of the opponent's Pokémon, 50 if it has damage counters.
  'ex14-97': {
    'Target Attack': {
      ...snipe(30),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        damageAt(ctx, t, oppAt(ctx, t)?.damage ? 50 : 30);
      },
    },
  },
  // Swampert ex – Ultra Pump: 2 cards from the hand may be discarded for 20 more and 20 to one of the opponent's Benched Pokémon.
  'ex14-98': {
    'Ultra Pump': {
      choices(s, c): ChoiceSpec[] {
        if ((s.ownHand?.length ?? 0) < 2) return [];
        const specs: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: 'Discard 2 cards from your hand for 20 more damage and 20 to one of your opponent\'s Benched Pokémon?' }];
        if (c.boost) specs.push(...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to"));
        return specs;
      },
      run(ctx) {
        if (!ctx.choices.boost || ctx.me.hand.length < 2) return void ctx.hit(60);
        ctx.hit(80);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
        ctx.pend({ kind: 'discardFromHand', source: 'Ultra Pump', count: 2 });
      },
    },
  },
  // Alakazam ☆ – Psychic Select: any card from the discard pile into the hand; Skill Copy: a Basic Pokémon or Evolution card
  // from the hand discarded, one of its attacks copied (nothing without the Energy for it).
  'ex14-99': {
    'Psychic Select': anyCardBack('Psychic Select'),
    'Skill Copy': {
      choices(s, c) {
        const list = handAttacks(s.cards, s.ownHand ?? [], 'Skill Copy');
        if (!list.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'amount', options: list.map((_, i) => i), labels: list.map((o) => `${lookupCard(s.cards, o.card.defId).name}: ${o.attack.name}`), prompt: 'Skill Copy: choose a card in your hand to discard and its attack to copy' }];
        const picked = c.amount !== undefined ? list[c.amount] : undefined;
        const effect = picked && attackEffect(picked.card.defId, picked.attack.name);
        const discard = effect?.discard;
        if (discard && discard.count !== 'all') specs.push({ kind: 'ownEnergy', count: discard.count, options: s.attacker.energy, prompt: `Choose ${discard.count} Energy to discard for ${picked!.attack.name}` });
        if (effect?.choices) specs.push(...effect.choices(s, c));
        return specs;
      },
      run(ctx) {
        const picked = ctx.choices.amount !== undefined ? handAttacks(ctx.state.cards, ctx.me.hand, 'Skill Copy')[ctx.choices.amount] : undefined;
        if (!picked) return ctx.log('Skill Copy had nothing to copy.');
        ctx.me.hand = ctx.me.hand.filter((c) => c !== picked.card);
        ctx.me.discard.push(picked.card);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, picked.card.defId).name} from the hand.`);
        if (!canPayCost(ctx.attacker, picked.attack, ctx.state.cards)) return ctx.log(`Skill Copy did nothing: ${ctx.attackerDef.name} doesn't have the Energy for ${picked.attack.name}.`);
        const discard = attackEffect(picked.card.defId, picked.attack.name)?.discard;
        if (discard) {
          const uids = new Set(discard.count === 'all' ? ctx.attacker.energy.map((e) => e.uid) : (ctx.choices.energyUids ?? []));
          const gone = ctx.attacker.energy.filter((e) => uids.has(e.uid));
          if (discard.count !== 'all' && gone.length < discard.count) return ctx.log('Skill Copy did nothing: not enough Energy to discard.');
          discardFromAttacker(ctx, gone);
        }
        ctx.log(`Skill Copy copies ${picked.attack.name}.`);
        ctx.useAttack(picked.attack, picked.card.defId);
      },
    },
  },
  // Celebi ☆ – Leaf Shade: as many damage counters as Energy attached to it, on one of the opponent's Pokémon.
  'ex14-100': {
    'Leaf Shade': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon to put damage counters on" }],
      run(ctx) {
        const p = oppAt(ctx, ctx.choices.oppTarget ?? 'active');
        if (!p || !ctx.canAffect(ctx.opp, p)) return;
        const n = energyPool(ctx.attacker, ctx.state.cards).length;
        p.damage += 10 * n;
        ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
  },
};
