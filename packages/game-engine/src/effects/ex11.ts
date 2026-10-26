// EX Delta Species (ex11) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// From the text: "Energy attached" counts the Energy provided (Energy Bone, as agreed for every EX set); Energy Bone and
// Sonic Signal's Pokémon are the player's picks, as EX Deoxys's Split Bomb's; Delta Aura's cost works while Latias's (Latios's)
// Poké-Body does and its partner (any Latios or Latios ex of the player's) is in play; Delta Guard works while Rayquaza has a
// Holon Energy card attached and its Poké-Body works; Critical Collection counts the Prize cards the opponent has taken and
// finds basic Energy cards; Type Match's Energy card is shown, by its type; Sleep Inducer is EX Hidden Legends Hypno's.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { hasType, isBasicEnergy, lookupCard, namesMatch, type EnergyType } from '../cards.js';
import { energyPool, isEnergyCardOf, isSpecialEnergy, PRIZE_COUNT } from '../engine.js';
import { powerActive, pokemonPower } from '../powers.js';
import { effectId, inPlayDef, pokemonName } from '../status.js';
import { powerEffect, trainerEffect } from './index.js';
import { benchedSlots, energyCanMove, guardNext } from './common.js';
import { copyAttack } from './ecard2.js';
import { inPlay } from './ex2.js';
import { lureIn, mayDiscardAny, snipe } from './ex6.js';
import { chooseOpponents } from './ex8.js';
import { fireDance } from './ex10.js';
import { discardFree } from './neo3.js';
import { healUpTo } from './si1.js';

/** The Holon Energy cards. */
const HOLON = ['Holon Energy FF', 'Holon Energy GL', 'Holon Energy WP'];
const holonCount = (ctx: Pick<AttackContext, 'state'>, p: AttackContext['attacker']) => p.energy.filter((e) => !e.provides && HOLON.includes(lookupCard(ctx.state.cards, e.defId).name)).length;

/** Delta Search: a Holon Energy card from the deck attached to the attacker. */
const deltaSearch: AttackEffect = {
  run(ctx) {
    ctx.hit(10);
    if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Delta Search', filter: 'energyNamed', name: HOLON, attachToActive: true, optional: true });
  },
};

/** "You may return an Energy card attached to … to your hand. If you do, `then`" (Return Burn, Return Spark, Return Wave): asked first. */
const mayReturn = (damage: number, then: (ctx: AttackContext) => void, more: (s: AttackSituation) => ChoiceSpec[] = () => []): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const own = s.attacker.energy.filter((e) => !e.provides);
    return own.length ? [{ kind: 'ownEnergyUpTo', max: 1, options: own, prompt: 'You may choose an Energy card to return to your hand for the attack’s effect' }, ...more(s)] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
    if (!card) return;
    ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
    const { provides: _, ...back } = card;
    ctx.me.hand.push(back);
    ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} to the hand.`);
    then(ctx);
  },
});

/** Delta Aura: Latias's (Latios's) attack costs Lightning, Metal, Colorless while its body works and `partner` is in play. */
const deltaAura = (partner: string) => (s: AttackSituation): EnergyType[] | null => {
  const sides = [{ active: s.attacker, bench: s.ownBench }, { active: s.defender, bench: s.opponentBench }];
  const working = powerActive(s.attacker, s.cards, sides);
  const paired = s.ownBench.some((p) => p && (namesMatch(inPlayDef(s.cards, p).name, partner) || inPlayDef(s.cards, p).name === `${partner} ex`));
  return working && paired ? ['lightning', 'metal', 'colorless'] : null;
};

/** Critical Collection: up to as many basic Energy cards of `type` from the discard pile as Prize cards the opponent has taken, to the attacker. */
const criticalCollection = (type: EnergyType): AttackEffect => ({
  run(ctx) {
    ctx.hit(10);
    const taken = Math.max(0, PRIZE_COUNT - ctx.opp.prizes.length);
    const cards = ctx.me.discard.filter((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)) && isEnergyCardOf(c, ctx.state.cards, type)).length;
    if (Math.min(taken, cards) && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Critical Collection', count: Math.min(taken, cards), target: 'active', type });
  },
});

/** The Defending Pokémon can't attack during the opponent's next turn. */
const noAttackNext = (ctx: AttackContext) =>
  ctx.affectDefender((e) => {
    e.noAttack = ctx.turn + 1;
    ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
  });

export const EX11: Record<string, Record<string, AttackEffect>> = {
  // Crobat δ – Radar Jam: no Trainer cards but Supporters for the opponent next turn; Target Attack: 40 to one of the
  // opponent's Pokémon, 60 to one with damage counters.
  'ex11-2': {
    'Radar Jam': {
      run(ctx) {
        ctx.hit(30);
        ctx.opp.noItemsUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer cards but Supporters next turn.", ctx.opp.id);
      },
    },
    'Target Attack': {
      ...snipe(40),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
        const damage = p && p.damage > 0 ? 60 : 40;
        if (t === 'active') ctx.hit(damage);
        else ctx.damageBenched(ctx.opp, t, damage);
      },
    },
  },
  // Flareon δ – Delta Search; Return Burn: may return an Energy card to the hand for Burned.
  'ex11-5': { 'Delta Search': deltaSearch, 'Return Burn': mayReturn(50, (ctx) => ctx.inflict('burned')) },
  // Gardevoir δ – Psychic Rage: 10 for each damage counter on it, to one of the opponent's Pokémon; Black Magic: 20 more for each of their Benched Pokémon.
  'ex11-6': {
    'Psychic Rage': {
      ...snipe(0),
      run(ctx) {
        const damage = ctx.attacker.damage;
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(damage);
        else ctx.damageBenched(ctx.opp, t, damage);
      },
    },
    'Black Magic': { run: (ctx) => void ctx.hit(10 + 20 * ctx.opp.bench.filter(Boolean).length) },
  },
  // Jolteon δ – Delta Search; Return Spark: may return an Energy card to the hand for 20 to one of the opponent's Benched Pokémon.
  'ex11-7': {
    'Delta Search': deltaSearch,
    'Return Spark': mayReturn(
      50,
      (ctx) => void (ctx.choices.benchSlot !== undefined && ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20)),
      (s) => {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options, prompt: "If you return an Energy card, choose one of your opponent's Benched Pokémon to do 20 damage to" }] : [];
      },
    ),
  },
  // Latias δ – Extra Crush: Delta Aura's cost; nothing without a Pokémon-ex of the opponent's in play.
  'ex11-8': {
    'Extra Crush': {
      costNow: deltaAura('Latios'),
      run(ctx) {
        if (!inPlay(ctx.opp).some((p) => inPlayDef(ctx.state.cards, p).ex)) return ctx.log('Extra Crush did nothing: your opponent has no Pokémon-ex in play.');
        ctx.hit(80);
      },
    },
  },
  // Latios δ – Psychic Force: Delta Aura's cost; nothing without a Stage 2 Pokémon of the opponent's in play.
  'ex11-9': {
    'Psychic Force': {
      costNow: deltaAura('Latias'),
      run(ctx) {
        if (!inPlay(ctx.opp).some((p) => inPlayDef(ctx.state.cards, p).stage === 'stage2')) return ctx.log('Psychic Force did nothing: your opponent has no Stage 2 Pokémon in play.');
        ctx.hit(80);
      },
    },
  },
  // Marowak δ – Energy Bone: 20 to up to as many of the opponent's Pokémon as Energy attached; Metal Crusher: 90 to a Metal Pokémon.
  'ex11-10': {
    'Energy Bone': chooseOpponents((p, cards) => energyPool(p, cards).length, 20, "Choose your opponent's Pokémon to do 20 damage to, one for each Energy attached to Marowak"),
    'Metal Crusher': { run: (ctx) => void ctx.hit(hasType(ctx.defenderDef, 'metal') ? 90 : 50) },
  },
  // Metagross δ – Crush and Burn: any Energy cards discarded from the player's Pokémon, 20 more each.
  'ex11-11': {
    'Crush and Burn': {
      choices(s): ChoiceSpec[] {
        const options = [s.attacker, ...s.ownBench].flatMap((p) => (p ? p.energy.filter((e) => !e.provides) : []));
        return options.length ? [{ kind: 'ownEnergyAny', options, prompt: 'You may discard any Energy cards attached to your Pokémon: 20 more damage each' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        let discarded = 0;
        for (const p of inPlay(ctx.me)) {
          const gone = p.energy.filter((e) => uids.has(e.uid));
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          ctx.log(`Discarded ${gone.length} Energy card${gone.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
          discarded += gone.length;
        }
        ctx.hit(30 + 20 * discarded);
      },
    },
  },
  // Rayquaza δ – Lightning Storm: 7 damage counters on itself, unless Delta Guard works (a Holon Energy card attached).
  'ex11-13': {
    'Lightning Storm': {
      run(ctx) {
        ctx.hit(70);
        const sides = [ctx.me, ctx.opp];
        if (holonCount(ctx, ctx.attacker) && pokemonPower(ctx.attacker) && powerActive(ctx.attacker, ctx.state.cards, sides)) return ctx.log('Delta Guard: no damage counters on Rayquaza.');
        ctx.attacker.damage += 70;
        ctx.log(`Put 7 damage counters on ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Salamence δ – Fire Dance: as EX Unseen Forces Flareon's.
  'ex11-14': { 'Fire Dance': fireDance(30) },
  // Starmie δ – Energy Loop: an Energy card attached to it back to the hand.
  'ex11-15': {
    'Energy Loop': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.some((e) => !e.provides) ? [{ kind: 'ownEnergy', count: 1, options: s.attacker.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to return to your hand' }] : []),
      run(ctx) {
        ctx.hit(30);
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!card) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        ctx.me.hand.push(card);
        ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} to the hand.`);
      },
    },
  },
  // Tyranitar δ – Delta Crush: may discard an Energy card for 20 more.
  'ex11-16': { 'Delta Crush': mayDiscardAny(50, () => 20) },
  // Vaporeon δ – Delta Search; Return Wave: may return an Energy card to the hand, and then one of the Defending Pokémon's to the opponent's.
  'ex11-18': {
    'Delta Search': deltaSearch,
    'Return Wave': mayReturn(
      50,
      (ctx) => {
        const card = ctx.defender.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        if (!card || !ctx.canAffect(ctx.opp, ctx.defender) || !energyCanMove(ctx, ctx.defender)) return;
        ctx.defender.energy = ctx.defender.energy.filter((e) => e !== card);
        const { provides: _, ...back } = card;
        ctx.opp.hand.push(back);
        ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} to your opponent's hand.`, ctx.opp.id);
      },
      (s) => (s.defender.energy.some((e) => !e.provides) ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: "If you return an Energy card, choose one of the Defending Pokémon's to return to your opponent's hand" }] : []),
    ),
  },
  // Azurill – Type Match: a basic Energy card's type shown from the hand; a Basic Pokémon or Evolution card of that type from the deck.
  'ex11-20': {
    'Type Match': {
      choices(s): ChoiceSpec[] {
        const types = [...new Set((s.ownHand ?? []).flatMap((c) => {
          const d = lookupCard(s.cards, c.defId);
          return isBasicEnergy(d) && d.kind === 'energy' ? [d.energyType] : [];
        }))];
        return types.length ? [{ kind: 'type', options: types, prompt: 'Choose a basic Energy card in your hand to show: its type' }] : [];
      },
      run(ctx) {
        const type = ctx.choices.type;
        if (!type) return ctx.log('There are no basic Energy cards in the hand.');
        ctx.log(`Showed a basic ${type[0]!.toUpperCase()}${type.slice(1)} Energy card.`);
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Type Match', filter: 'pokemonType', type, reveal: true });
      },
    },
  },
  // Hypno – Sleep Inducer: as EX Hidden Legends Hypno's.
  'ex11-23': { 'Sleep Inducer': lureIn("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => ctx.inflict('asleep')) },
  // Mightyena δ – Delta Fang: a Defending Pokémon-ex can't attack next turn; Gang Up: 10 for each of the player's Darkness and Metal Pokémon.
  'ex11-24': {
    'Delta Fang': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.defenderDef.ex) noAttackNext(ctx);
      },
    },
    'Gang Up': { run: (ctx) => void ctx.hit(10 * inPlay(ctx.me).filter((p) => ['darkness', 'metal'].some((t) => hasType(inPlayDef(ctx.state.cards, p), t as EnergyType))).length) },
  },
  // Porygon2 – Machine Burst: with a Technical Machine attached, Asleep and Burned.
  'ex11-25': {
    'Machine Burst': {
      run(ctx) {
        ctx.hit(30);
        if (!(ctx.attacker.attached ?? []).some((a) => !!trainerEffect(a.card.defId)?.technicalMachine)) return;
        ctx.inflict('asleep');
        ctx.inflict('burned');
      },
    },
  },
  // Rain Castform – Holon Splash: 10 more for each Holon Energy card attached.
  'ex11-26': { 'Holon Splash': { run: (ctx) => void ctx.hit(30 + 10 * holonCount(ctx, ctx.attacker)) } },
  // Slowking – Psychic Option: 20 more with a Water Energy card attached; with a Psychic Energy card, a Special Energy card of the Defending Pokémon's discarded.
  'ex11-28': {
    'Psychic Option': {
      choices(s): ChoiceSpec[] {
        const special = s.defender.energy.filter((e) => isSpecialEnergy(s.cards, e));
        const psychic = s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'psychic'));
        return psychic && special.length ? [{ kind: 'defenderEnergy', options: special, prompt: 'Choose a Special Energy card to discard from the Defending Pokémon' }] : [];
      },
      run(ctx) {
        ctx.hit(ctx.attacker.energy.some((e) => isEnergyCardOf(e, ctx.state.cards, 'water')) ? 40 : 20);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Snow-cloud Castform – Holon Blizzard: with a Holon Energy card attached, 10 to each of the opponent's Benched Pokémon.
  'ex11-29': {
    'Holon Blizzard': {
      run(ctx) {
        ctx.hit(20);
        if (holonCount(ctx, ctx.attacker)) ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Sunny Castform – Holon Search: a Holon Energy card from the deck to one of the player's Pokémon.
  'ex11-31': { 'Holon Search': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Holon Search', filter: 'energyNamed', name: HOLON, attach: true, optional: true })) } },
  // Swellow – Steep Dive: heads, nothing the opponent's next attack does affects it; tails, Glide does 100 next turn.
  'ex11-32': {
    'Steep Dive': {
      run(ctx) {
        if (ctx.flip()) return ctx.protect('preventAll');
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Glide', turn: ctx.turn + 2 };
        ctx.log("Swellow's Glide does 100 damage next turn.");
      },
    },
    Glide: { run: (ctx) => void ctx.hit(ctx.attacker.effects?.boostedAttack?.attack === 'Glide' && ctx.attacker.effects.boostedAttack.turn === ctx.turn ? 100 : 40) },
  },
  // Castform – Holon Draw: a card drawn, 2 more with a Holon Energy card attached.
  'ex11-34': { 'Holon Draw': { run: (ctx) => ctx.draw(holonCount(ctx, ctx.attacker) ? 3 : 1) } },
  // Ditto – Copy: as EX Unseen Forces Sudowoodo's.
  'ex11-38': { Copy: copyAttack('Copy', { needsEnergy: true, flip: false }) },
  // Dragonair δ – Twister: 2 coins; both tails, nothing; an Energy card of the Defending Pokémon's discarded for each heads.
  'ex11-42': {
    Twister: {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Twister did nothing.');
        ctx.hit(20);
        const n = Math.min(heads, ctx.defender.energy.filter((e) => !e.provides).length);
        if (n) ctx.pend({ kind: 'removeEach', source: 'Twister', targets: Array(n).fill('active') });
      },
    },
  },
  // Golbat – Sonic Signal: 10 to 2 of the opponent's Pokémon.
  'ex11-43': { 'Sonic Signal': chooseOpponents(2, 10, "Choose 2 of your opponent's Pokémon to do 10 damage to") },
  // Hariyama – Brick Smash: only Weakness changes its damage.
  'ex11-44': { 'Brick Smash': { run: (ctx) => void ctx.hit(50, { swift: true, keepWeakness: true }) } },
  // Skarmory – Cry for Help: a Metal Pokémon (not Pokémon-ex) from the deck, shown; Steel Wing: 20 less damage to it next turn.
  'ex11-55': {
    'Cry for Help': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Cry for Help', filter: 'typesNotEx', types: ['metal'], reveal: true })) },
    'Steel Wing': guardNext(20, 20),
  },
  // Kakuna – Fast Evolution: an Evolution card from the deck, shown.
  'ex11-46': { 'Fast Evolution': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Fast Evolution', filter: 'evolution', reveal: true })) } },
  // Ditto – Spiral Drain: 3 damage counters off it.
  'ex11-64': {
    'Spiral Drain': {
      run(ctx) {
        ctx.hit(20);
        healUpTo(ctx, ctx.me, ctx.attacker, 30);
      },
    },
  },
  // Meowth – Pickup Power: an Energy card from the discard pile into the hand, shown.
  'ex11-77': {
    'Pickup Power': {
      run(ctx) {
        if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Pickup Power', count: 1, filter: 'energy', reveal: true });
      },
    },
  },
  // Staryu – Recover: a Water Energy card discarded; 4 damage counters off it.
  'ex11-85': { Recover: { discard: { count: 1, type: 'water' }, run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 40) } },
  // Taillow – Skill Dive: 10 to one of the opponent's Pokémon.
  'ex11-86': { 'Skill Dive': snipe(10) },
  // Flareon ex – Flame Screen: 20 less damage to it during the opponent's next turn.
  'ex11-108': { 'Flame Screen': guardNext(30, 20) },
  // Vaporeon ex – Fastwave: only Weakness changes its damage (as EX Emerald Deoxys ex's).
  'ex11-110': { Fastwave: { run: (ctx) => void ctx.hit(40, { swift: true, keepWeakness: true }) } },
  // Groudon, Kyogre and Metagross Star – Critical Collection; Kyogre Star – Sheer Cold: heads, the Defending Pokémon can't attack next turn.
  'ex11-111': { 'Critical Collection': criticalCollection('fighting') },
  'ex11-112': {
    'Critical Collection': criticalCollection('water'),
    'Sheer Cold': {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) noAttackNext(ctx);
      },
    },
  },
  'ex11-113': { 'Critical Collection': criticalCollection('metal') },
};
