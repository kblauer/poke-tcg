// Mysterious Treasures (dp2) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// The Baby Evolution powers play as the EX sets' (agreed). Several are the engine's own rules, named by a flag: Power Cancel
// (usePower), Downer Material and Mother Pheromone (attackError), Upper Material, Sticky and Jumbo Fin (retreatBodies), Rainbow
// Scale, Dragon DNA, Craggy Face, Airy Wall and Cold Fat (attacks.ts), Dark Genes and Dragon DNA's attacks (usableAttacks),
// Shocking Tail (attaching Energy), Poison Sacs (evolving).
// From the text: Power Cancel is asked of its player whenever the opponent uses a Poké-Power (not a Poké-Body), with 2 or more
// cards in their hand, once a turn for each Alakazam; Downer Material adds 1 Colorless however many Azelf; Mother Pheromone takes
// 1 Colorless off for each Nidoqueen; Sticky adds 1 for each Ariados; Memory Out, Stance and the evolving powers' "you may" are
// asked only where it could matter: Memory Out and Stance always work; Kind Egg puts the cards back one at a time, up to its
// limit, then draws as many; Unown I's ITEM is once a turn for the player, whichever Unown I.
import { lookupCard, typesOf } from '../cards.js';
import { activeLocked, afflictBetweenTurns, energyPool, isEnergyCardOf } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, evolvedFromName, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { onlyActive, onlyBenched, targetOf } from './common.js';
import { EX1_POWERS } from './ex1-powers.js';
import { EX14_POWERS } from './ex14-powers.js';
import { babyEvolution, POKE_BODY } from './ex2-powers.js';

/** "When you play this from your hand to evolve 1 of your Pokémon, you may …": a yes-or-no question as it evolves. */
const onEvolveMay = (power: 'freezeUp' | 'evolutionaryVitality' | 'evolutionaryToxic', source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

/** The opponent's Benched Pokémon, as targets: those that pass `fits`. */
const oppBenched = (s: PowerSituation, fits: (p: NonNullable<PowerSituation['opp']['bench'][number]>) => boolean = () => true) => s.opp.bench.flatMap((p, i) => (p && fits(p) ? [i] : []));

/** The source has a Pokémon of this name under it (Kind Egg, Electro Recycle). */
const under = (s: PowerSituation, name: string) => {
  const source = pokemonAt(s.me, s.source);
  return !!source && evolvedFromName(s.cards, source, name);
};

/** Switches the opponent's Benched Pokémon at `slot` with their Active Pokémon (Lure Ring, MAGNET), unless something stops it. */
function gust(ctx: Parameters<NonNullable<PowerEffect['use']>>[0], slot: unknown) {
  const locked = activeLocked(ctx.state, ctx.opp.id);
  if (locked) return ctx.log(locked);
  if (typeof slot === 'number' && ctx.opp.bench[slot]) swapActive(ctx.state, ctx.opp, slot);
}

/** The Unown named, on the player's Bench (ITEM). */
const benchHas = (s: PowerSituation, name: string) => s.me.bench.some((p) => p && inPlayDef(s.cards, p).name === name);

export const DP2_POWERS: Record<string, PowerEffect> = {
  // Alakazam – Power Cancel (usePower).
  'dp2-2': { powerCancel: true },
  // Azelf – Downer Material (attackError).
  'dp2-4': { ...POKE_BODY, downerMaterial: true },
  // Blissey – Kind Egg: with Happiny under it, up to as many hand cards as it has Energy back into the deck, then as many drawn.
  'dp2-5': {
    oncePerTurn: true,
    blocked(s) {
      if (!under(s, 'Happiny')) return "Happiny isn't under Blissey";
      const source = pokemonAt(s.me, s.source)!;
      if (!energyPool(source, s.cards).length) return 'Blissey has no Energy attached';
      return s.me.hand.length ? null : 'Your hand is empty';
    },
    use: (ctx) => ctx.pend({ kind: 'shuffleFromHand', source: 'Kind Egg', count: Math.min(energyPool(ctx.source, ctx.state.cards).length, ctx.me.hand.length), thenDraw: true }),
  },
  // Bronzong – Miracle Oracle: a card drawn, then one discarded; an Energy card discarded draws another.
  'dp2-6': {
    oncePerTurn: true,
    use(ctx) {
      const [drawn] = ctx.me.deck.splice(0, 1);
      if (drawn) {
        ctx.me.hand.push(drawn);
        ctx.log('Drew a card.');
      }
      if (ctx.me.hand.length) ctx.pend({ kind: 'discardFromHand', source: 'Miracle Oracle', count: 1, drawIfEnergy: 1 });
    },
  },
  // Garchomp – Rainbow Scale; Honchkrow – Dark Genes (attacks.ts, usableAttacks).
  'dp2-9': { ...POKE_BODY, rainbowScale: true },
  'dp2-10': { ...POKE_BODY, darkGenes: true },
  // Lumineon – Lure Ring: as the Active Pokémon, one of the opponent's Benched Pokémon with 100 HP or more switched in.
  'dp2-11': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Lumineon') ?? (oppBenched(s, (p) => inPlayDef(s.cards, p).hp >= 100).length ? null : 'Your opponent has no Benched Pokémon with 100 HP or more'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: oppBenched(s, (p) => inPlayDef(s.cards, p).hp >= 100), prompt: "Choose one of your opponent's Benched Pokémon to switch in" }],
    use: (ctx) => gust(ctx, ctx.choices.oppTo),
  },
  // Mesprit – Upper Material (retreatBodies).
  'dp2-14': { ...POKE_BODY, upperMaterial: true },
  // Typhlosion – Firestarter: as EX Ruby & Sapphire Blaziken's.
  'dp2-16': EX1_POWERS['ex1-3']!,
  // Uxie – Memory Out: damaged by the opponent's attack, the Attacking Pokémon can't use that attack during their next turn.
  'dp2-18': {
    onAttackDamage(ctx) {
      if (!ctx.attackName) return;
      (ctx.attacker.effects ??= {}).amnesia = { attack: ctx.attackName, until: ctx.turn + 2 };
      ctx.log(`Memory Out: ${ctx.attackerDef.name} can't use ${ctx.attackName} next turn.`, ctx.opp.id);
    },
  },
  // Abomasnow – Glacier Snow: as EX Crystal Guardians Wigglytuff's Fluffy Fur. Bastiodon – Protective Wall: as its Sand Veil.
  'dp2-19': EX14_POWERS['ex14-13']!,
  'dp2-21': EX14_POWERS['ex14-5']!,
  // Ariados – Sticky (retreatBodies).
  'dp2-20': { ...POKE_BODY, sticky: true },
  // Crobat – Evolutionary Toxic; Walrein – Freeze-up; Croconaw – Evolutionary Vitality: asked as they evolve from the hand.
  'dp2-23': onEvolveMay('evolutionaryToxic', 'Evolutionary Toxic'),
  'dp2-39': onEvolveMay('freezeUp', 'Freeze-up'),
  'dp2-44': onEvolveMay('evolutionaryVitality', 'Evolutionary Vitality'),
  // Glalie – Craggy Face; Gyarados – Dragon DNA; Mantine – Jumbo Fin; Mr. Mime – Airy Wall; Nidoqueen – Mother Pheromone;
  // Toxicroak – Poison Sacs; Dewgong – Cold Fat; Electivire LV.X – Shocking Tail.
  'dp2-25': { ...POKE_BODY, stage2Less: 20 },
  'dp2-26': { ...POKE_BODY, dragonDna: true },
  'dp2-29': { ...POKE_BODY, jumboFin: true },
  'dp2-30': { ...POKE_BODY, airyWall: true },
  'dp2-31': { ...POKE_BODY, motherPheromone: true },
  'dp2-36': { ...POKE_BODY, poisonSacs: true },
  'dp2-45': { ...POKE_BODY, coldFat: true },
  'dp2-121': { ...POKE_BODY, shockingTail: true },
  // Ninetales – Color Shift: the type (or types) of one of the opponent's Pokémon until the end of the turn.
  'dp2-32': {
    oncePerTurn: true,
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppFrom', options: ownTargets(s.opp), prompt: "Choose one of your opponent's Pokémon to take the type of" }],
    use(ctx) {
      const t = ctx.choices.oppFrom;
      const p = t === undefined ? null : t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
      if (!p) return;
      ctx.source.typesCopied = typesOf(inPlayDef(ctx.state.cards, p));
      ctx.log(`Ninetales is ${ctx.source.typesCopied.join(' and ')} type until the end of the turn.`);
    },
  },
  // Slaking – Energetic Impulse: as the Active Pokémon, heads: Lazy Blow's base damage is 130 this turn; tails: it can't attack or retreat this turn.
  'dp2-34': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Slaking'),
    use(ctx) {
      const e = (ctx.source.effects ??= {});
      if (ctx.flip()) {
        e.boostedAttack = { attack: 'Lazy Blow', turn: ctx.state.turn };
        return ctx.log("Lazy Blow's base damage is 130 this turn.");
      }
      e.noAttack = ctx.state.turn;
      e.noRetreat = ctx.state.turn;
      ctx.log("Slaking can't attack or retreat this turn.");
    },
  },
  // Unown I – ITEM: with Unown I, T, E and M on the Bench, a Trainer card from the deck, shown; once a turn for the player.
  'dp2-37': {
    oncePerTurn: true,
    blocked(s) {
      if (!['Unown I', 'Unown T', 'Unown E', 'Unown M'].every((n) => benchHas(s, n))) return 'You need Unown I, Unown T, Unown E and Unown M on your Bench';
      if ((s.me.powerTurns?.ITEM ?? -1) >= s.turn) return 'You already used ITEM this turn';
      return s.counts.deck ? null : 'Your deck is empty';
    },
    use(ctx) {
      ctx.me.powerTurns = { ...ctx.me.powerTurns, ITEM: ctx.state.turn };
      ctx.pend({ kind: 'pickFromDeck', source: 'ITEM', filter: 'trainer', reveal: true, optional: true });
    },
  },
  // Baby Evolution: Chingling, Happiny, Magby, Pichu.
  'dp2-42': babyEvolution('Chimecho'),
  'dp2-52': babyEvolution('Chansey'),
  'dp2-88': babyEvolution('Magmar'),
  'dp2-93': babyEvolution('Pikachu'),
  // Unown E – EQUIP: from the Bench, its cards discarded and itself attached to another of the player's Pokémon as a Pokémon Tool (10 more HP).
  'dp2-65': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown E') ?? (equipTargets(s).length ? null : 'None of your other Pokémon can take a Pokémon Tool'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: equipTargets(s), prompt: 'Choose one of your Pokémon to attach Unown E to' }],
    use(ctx) {
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!to || to === ctx.source || (to.attached ?? []).some((a) => a.tool)) return;
      const unown = ctx.source;
      ctx.me.discard.push(...unown.energy.map(({ provides: _, ...card }) => card), ...(unown.attached ?? []).map((a) => a.card));
      ctx.me.bench = ctx.me.bench.map((p) => (p === unown ? null : p));
      (to.attached ??= []).push({ card: unown.card, until: Number.MAX_SAFE_INTEGER, tool: true, equip: true });
      ctx.log(`Attached Unown E to ${pokemonName(ctx.state, to)} as a Pokémon Tool.`);
    },
  },
  // Unown M – MAGNET: as the Active Pokémon, heads: one of the opponent's Benched Pokémon switched in.
  'dp2-66': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Unown M') ?? (oppBenched(s).length ? null : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: oppBenched(s), prompt: "Choose one of your opponent's Benched Pokémon to switch in (if heads)" }],
    use(ctx) {
      if (!ctx.flip()) return ctx.log('MAGNET did nothing.');
      gust(ctx, ctx.choices.oppTo);
    },
  },
  // Unown T – THROW: as the Active Pokémon, a card from the hand discarded; heads: 2 damage counters on one of the opponent's Benched Pokémon.
  'dp2-67': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Unown T') ?? (s.me.hand.length ? null : 'Your hand is empty'),
    choices: (s) => [
      { kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card from your hand to discard' },
      ...(oppBenched(s).length ? [{ kind: 'oppPokemon' as const, field: 'oppTo' as const, options: oppBenched(s), prompt: "Choose one of your opponent's Benched Pokémon for 2 damage counters (if heads)" }] : []),
    ],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name}.`);
      const p = typeof ctx.choices.oppTo === 'number' ? ctx.opp.bench[ctx.choices.oppTo] : null;
      if (!ctx.flip() || !p) return;
      p.damage += 20;
      ctx.log(`Put 2 damage counters on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Pikachu – Electro Recycle: with Pichu under it, a Lightning Energy card from the discard pile into the hand, shown.
  'dp2-94': {
    oncePerTurn: true,
    blocked: (s) => (!under(s, 'Pichu') ? "Pichu isn't under Pikachu" : discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : lightningInDiscard(s).length ? null : 'No Lightning Energy cards in your discard pile'),
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: lightningInDiscard(s), prompt: 'Choose a Lightning Energy card from your discard pile' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.hand.push(card);
      ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} into the hand.`);
    },
  },
  // Lucario LV.X – Stance: levelled up from the hand onto the Active Lucario, no effects of attacks on it during the opponent's next turn.
  'dp2-122': {
    onPlayFromHand(state, owner, pokemon) {
      if (owner.active !== pokemon || !pokemon.levelUpFrom || hasSpecialCondition(pokemon)) return;
      (pokemon.effects ??= {}).preventAll = state.turn + 1;
      addLog(state, 'Stance: all effects of attacks on Lucario are prevented during the next turn.', owner.id);
    },
  },
  // Magmortar LV.X – Torrid Wave: as the Active Pokémon, the opponent's Active Pokémon Burned, 3 damage counters between turns.
  'dp2-123': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Magmortar'),
    use(ctx) {
      const target = ctx.opp.active;
      if (!target) return;
      afflictBetweenTurns(ctx.state, ctx.opp.id, target, 'burned');
      if (target.burned) target.burnDamage = 30;
    },
  },
};

/** The player's Pokémon Unown E can be attached to: any other without a Pokémon Tool. */
function equipTargets(s: PowerSituation) {
  return ownTargets(s.me).filter((t) => t !== s.source && !(pokemonAt(s.me, t)!.attached ?? []).some((a) => a.tool));
}

/** Lightning Energy cards in the player's discard pile (Electro Recycle). */
function lightningInDiscard(s: PowerSituation) {
  return s.me.discard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy' && isEnergyCardOf(c, s.cards, 'lightning'));
}
