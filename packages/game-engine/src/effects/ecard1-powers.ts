// Expedition (ecard1) Poké-Powers and Poké-Bodies, by card id (the engine's Pokémon Powers: Toxic Gas, Goop Gas Attack and
// the like stop them too). Poké-Bodies always work, whatever the Pokémon's Special Conditions (`ignoresConditions`). The
// Poké-Powers say "This power can't be used if … is affected by a Special Condition", so they stop when Poisoned or Burned
// too, as every Pokémon Power does (powerActive); the two used from the Bench (Tailwind, Plunge) don't say it, and a
// Benched Pokémon has no Special Conditions anyway. The non-holo prints (33–70) take the holos' (withNonHolo).
// Rulings (from the text, as for Hatch: "Then…" parts happen only on heads): Jet Stream discards an Energy card from
// Blastoise and then one from the Defending Pokémon only on heads; Plunge moves the Energy and switches only on heads. Chaos
// Move asks whose Pokémon to move the damage counter from, which one, then whose to move it to and which (it may Knock Out).
// Psymimic's copied attacks are listed with Alakazam's own (usableAttacks); paying a copied attack's cost and using it is
// the turn's attack. Harvest Bounty attaches another Energy card from the hand to the Active Pokémon once the turn's Energy
// card from the hand went there (each Venusaur once a turn). Burning Energy turns the basic Energy cards attached to its
// player's Pokémon then into Fire Energy until the end of the turn. Major Tsunami: the opponent chooses their Pokémon that
// comes in; then the player's chosen Benched Pokémon switches with Feraligatr.
import { lookupCard } from '../cards.js';
import { afflictionBlocked, type CardInstance, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { energyFromHand, energyKept, ownTargets, pokemonAt, powerActive, type PowerChoiceSpec, type PowerContext, type PowerEffect, type PowerSituation } from '../powers.js';
import { shuffle } from '../rng.js';
import { clearSpecialConditions, countersMoved, effectId, energyProtected, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { withNonHolo } from './ecard1-prints.js';
import { energyEffect, powerEffect } from './index.js';
import { basicEnergyOn, energyCards, inPlay, onlyActive, onlyBenched, POKE_BODY } from './common.js';

/** Puts `choice` for the player, or queues it if another is being asked. */
function ask(ctx: PowerContext, choice: Parameters<PowerContext['pend']>[0]) {
  if (ctx.state.pendingChoice) (ctx.state.queuedChoices ??= []).push({ ...choice, player: ctx.me.id } as NonNullable<typeof ctx.state.pendingChoice>);
  else ctx.pend(choice);
}

/** Whether the power may discard Energy cards from this Pokémon of the opponent's: Brock's Protection and Unown K's Keep (logged). */
function oppEnergyCanGo(ctx: PowerContext, p: InPlayPokemon): boolean {
  const why = energyProtected(ctx.state.cards, p)
    ? `Brock's Protection: ${pokemonName(ctx.state, p)}'s Energy can't be removed.`
    : energyKept(ctx.opp, [ctx.opp, ctx.me], ctx.state.cards, p)
      ? `[Keep]: ${pokemonName(ctx.state, p)}'s Energy cards can't be discarded.`
      : null;
  if (why) ctx.log(why);
  return !why;
}

/** The Pokémon at `target` on the side `side` names ('own' or 'opp'). */
const onSide = (s: Pick<PowerSituation, 'me' | 'opp'>, side: 'own' | 'opp', t: Target) => pokemonAt(side === 'own' ? s.me : s.opp, t);

const HOLO: Record<string, PowerEffect> = {
  // Alakazam – Psymimic: the opponent's Pokémon's attacks can be used instead of its own (usableAttacks).
  'ecard1-1': { psymimic: true },

  // Ampharos – Energy Connect: as often as you like, a basic Energy card from one of its player's Benched Pokémon to the Active Pokémon.
  'ecard1-2': {
    blocked: (s) => (!s.me.active ? 'You have no Active Pokémon' : s.me.bench.some((p) => p && basicEnergyOn(s.cards, p).length) ? null : 'None of your Benched Pokémon has a basic Energy card'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => t !== 'active' && basicEnergyOn(s.cards, pokemonAt(s.me, t)!).length > 0), prompt: 'Take a basic Energy card from' },
      ];
      if (c.from === undefined || c.from === 'active') return specs;
      return [...specs, { kind: 'attachedEnergy', field: 'energyUid', options: basicEnergyOn(s.cards, pokemonAt(s.me, c.from)!), prompt: 'Choose the basic Energy card to move to your Active Pokémon' }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = ctx.me.active!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Blastoise – Jet Stream: as the Active Pokémon, once a turn, flip; heads discards an Energy card from Blastoise, then one from the Defending Pokémon.
  'ecard1-4': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Blastoise') ?? (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Jet Stream did nothing.');
      const own = energyCards(ctx.source);
      if (own.length === 1 || (own.length && new Set(own.map((e) => e.defId)).size === 1)) {
        const [gone] = own;
        ctx.source.energy = ctx.source.energy.filter((e) => e !== gone);
        ctx.me.discard.push(gone!);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, gone!.defId).name} from ${pokemonName(ctx.state, ctx.source)}.`);
      } else if (own.length) ask(ctx, { source: 'Jet Stream', kind: 'discardAttached', target: 'active' });
      const defender = ctx.opp.active;
      if (defender && energyCards(defender).length && oppEnergyCanGo(ctx, defender)) ask(ctx, { source: 'Jet Stream', kind: 'removeEach', targets: ['active'] });
    },
  },

  // Butterfree – Miraculous Powder: once a turn, its player's Active Pokémon is no longer affected by any Special Condition.
  'ecard1-5': {
    oncePerTurn: true,
    blocked: (s) => (s.me.active && hasSpecialCondition(s.me.active) ? null : 'Your Active Pokémon has no Special Condition'),
    use(ctx) {
      const p = ctx.me.active!;
      clearSpecialConditions(p);
      ctx.log(`${pokemonName(ctx.state, p)} is no longer affected by Special Conditions.`);
    },
  },

  // Charizard – Burning Energy: once a turn, the basic Energy attached to its player's Pokémon is Fire Energy for the rest of the turn.
  'ecard1-6': {
    oncePerTurn: true,
    blocked: (s) => (inPlay(s.me).some((p) => basicEnergyOn(s.cards, p).length) ? null : 'None of your Pokémon has a basic Energy card attached'),
    use(ctx) {
      for (const p of inPlay(ctx.me)) for (const e of basicEnergyOn(ctx.state.cards, p)) e.converted = { type: 'fire', by: ctx.source.card.uid, untied: true };
      ctx.log('All basic Energy attached to your Pokémon is Fire Energy for the rest of the turn.');
    },
  },

  // Clefable – Moonlight: once a turn, a card from the hand goes on top of the deck; then a basic Energy card from the deck into the hand.
  'ecard1-7': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length ? null : 'Your hand is empty'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card to put back on top of your deck' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid)!;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.deck.unshift(card);
      ctx.log('Put a card from the hand on top of the deck.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Moonlight', filter: 'basicEnergy', reveal: true });
    },
  },

  // Dragonite – Tailwind: once a turn, from the Bench, its player's Active Pokémon's retreat cost is 0 this turn.
  'ecard1-9': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Dragonite') ?? (s.me.active ? null : 'You have no Active Pokémon'),
    use(ctx) {
      const active = ctx.me.active!;
      (active.effects ??= {}).tailwind = ctx.state.turn;
      ctx.log(`${pokemonName(ctx.state, active)}'s retreat cost is 0 this turn.`);
    },
  },

  // Feraligatr – Major Tsunami: as the Active Pokémon, once a turn, the opponent switches their Active Pokémon; then Feraligatr switches with a Benched Pokémon, if any.
  'ecard1-12': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Feraligatr') ?? (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    choices(s) {
      const bench = ownTargets(s.me).filter((t) => t !== 'active');
      return bench.length ? [{ kind: 'ownPokemon', field: 'to', options: bench, prompt: 'Choose one of your Benched Pokémon to switch with Feraligatr' }] : [];
    },
    use(ctx) {
      const theirs = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (theirs.length === 1) swapActive(ctx.state, ctx.opp, theirs[0]!);
      else ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Major Tsunami', kind: 'switchIn' };
      if (typeof ctx.choices.to === 'number') swapActive(ctx.state, ctx.me, ctx.choices.to);
    },
  },

  // Gengar – Chaos Move: once a turn, while the opponent has 3 or fewer Prize cards left, move a damage counter from any Pokémon in play to another (it may Knock Out).
  'ecard1-13': {
    oncePerTurn: true,
    blocked(s) {
      if (s.counts.oppPrizes > 3) return 'Your opponent has more than 3 Prize cards left';
      if (![...inPlay(s.me), ...inPlay(s.opp)].some((p) => p.damage >= 10)) return 'No Pokémon in play has damage counters';
      return inPlay(s.me).length + inPlay(s.opp).length < 2 ? 'There must be 2 Pokémon in play' : null;
    },
    choices(s, c) {
      const damaged = (side: 'own' | 'opp') => ownTargets(side === 'own' ? s.me : s.opp).filter((t) => onSide(s, side, t)!.damage >= 10);
      const sides = (['own', 'opp'] as const).filter((side) => damaged(side).length);
      const specs: PowerChoiceSpec[] = [{ kind: 'side', field: 'fromSide', options: [...sides], prompt: 'Move a damage counter from whose Pokémon' }];
      if (!c.fromSide) return specs;
      const fromField = c.fromSide === 'own' ? 'from' : 'oppFrom';
      specs.push(c.fromSide === 'own' ? { kind: 'ownPokemon', field: 'from', options: damaged('own'), prompt: 'Move a damage counter from' } : { kind: 'oppPokemon', field: 'oppFrom', options: damaged('opp'), prompt: 'Move a damage counter from' });
      const from = c[fromField];
      if (from === undefined) return specs;
      const others = (side: 'own' | 'opp') => ownTargets(side === 'own' ? s.me : s.opp).filter((t) => side !== c.fromSide || t !== from);
      specs.push({ kind: 'side', field: 'toSide', options: (['own', 'opp'] as const).filter((side) => others(side).length), prompt: 'Move it to whose Pokémon' });
      if (!c.toSide) return specs;
      specs.push(c.toSide === 'own' ? { kind: 'ownPokemon', field: 'to', options: others('own'), prompt: 'Move it to' } : { kind: 'oppPokemon', field: 'oppTo', options: others('opp'), prompt: 'Move it to' });
      return specs;
    },
    use(ctx) {
      const c = ctx.choices;
      const from = c.fromSide === 'own' ? pokemonAt(ctx.me, c.from!)! : pokemonAt(ctx.opp, c.oppFrom!)!;
      const to = c.toSide === 'own' ? pokemonAt(ctx.me, c.to!)! : pokemonAt(ctx.opp, c.oppTo!)!;
      from.damage -= 10;
      countersMoved(ctx.state, from, 10);
      to.damage += 10;
      ctx.log(`Moved a damage counter from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Golem – Rock Body: attack damage to it is 10 less, after Weakness and Resistance.
  'ecard1-14': { ...POKE_BODY, damageReduction: 10 },

  // Machamp – Terraforming: once a turn, look at the top 4 cards of the deck and put them back in any order.
  'ecard1-16': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'arrangeTop', source: 'Terraforming', count: 4 }),
  },

  // Meganium – Soothing Aroma: once a turn, flip; heads removes a damage counter from each of its player's Pokémon that has any.
  'ecard1-18': {
    oncePerTurn: true,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Soothing Aroma did nothing.');
      for (const p of inPlay(ctx.me)) {
        if (p.damage < 10) continue;
        p.damage -= 10;
        ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, p)}.`);
      }
    },
  },

  // Pidgeot – Beating Wings: as the Active Pokémon, once a turn, a Benched Pokémon and every card attached go back into the deck.
  'ecard1-23': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Pidgeot') ?? (s.me.bench.some(Boolean) ? null : 'You have no Benched Pokémon'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => t !== 'active'), prompt: 'Choose one of your Benched Pokémon to shuffle into your deck' }],
    use(ctx) {
      const slot = ctx.choices.from as number;
      const p = ctx.me.bench[slot]!;
      const cards: CardInstance[] = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, converted: _c, windless: _w, ...card }) => card), ...(p.attached ?? []).map((a) => a.card)];
      [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...cards], ctx.state.rngState);
      ctx.me.bench[slot] = null;
      ctx.log(`${pokemonName(ctx.state, p)} and every card attached were shuffled into the deck.`);
    },
  },

  // Poliwrath – Plunge: once a turn, from the Bench, flip; heads moves the Active Pokémon's Energy cards to Poliwrath, then switches them.
  'ecard1-24': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Poliwrath') ?? (s.me.active ? null : 'You have no Active Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Plunge did nothing.');
      const active = ctx.me.active!;
      const moved = active.energy;
      active.energy = [];
      ctx.source.energy.push(...moved);
      if (moved.length) ctx.log(`Moved ${moved.length} Energy from ${pokemonName(ctx.state, active)} to ${pokemonName(ctx.state, ctx.source)}.`);
      swapActive(ctx.state, ctx.me, ctx.sourceTarget as number);
    },
  },

  // Typhlosion – Heat Up: once a turn, if the opponent has more Energy cards attached than the player, a Fire Energy card from the deck goes onto one of their Benched Pokémon.
  'ecard1-28': {
    oncePerTurn: true,
    blocked(s) {
      const count = (side: Pick<PlayerState, 'active' | 'bench'>) => inPlay(side).reduce((n, p) => n + energyCards(p).length, 0);
      if (count(s.opp) <= count(s.me)) return "Your opponent doesn't have more Energy cards attached than you";
      if (!s.me.bench.some(Boolean)) return 'You have no Benched Pokémon';
      return s.counts.deck ? null : 'Your deck is empty';
    },
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Heat Up', filter: 'energyType', type: 'fire', attach: true, attachOnly: { bench: true } }),
  },

  // Tyranitar – Dark Aura: all Energy attached to it is Darkness Energy.
  'ecard1-29': { ...POKE_BODY, energyAs: 'darkness' },

  // Venusaur – Harvest Bounty: once a turn, after the turn's Energy card from the hand went to the Active Pokémon, another one from the hand goes there too.
  'ecard1-30': {
    oncePerTurn: true,
    blocked(s) {
      if (s.me.activeEnergyTurn !== s.turn) return 'Attach an Energy card from your hand to your Active Pokémon first';
      if (s.me.active?.effects?.noEnergy !== undefined) return "Energy cards can't be attached to your Active Pokémon this turn";
      return s.me.hand.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'No Energy cards in your hand';
    },
    choices(s) {
      const active = s.me.active ? inPlayDef(s.cards, s.me.active) : null;
      const options = s.me.hand.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy' && !(active && energyEffect(c.defId)?.attachError?.(active, s.me.active!, s.cards)));
      return [{ kind: 'handCard', field: 'cardUid', options, prompt: 'Choose an Energy card to attach to your Active Pokémon' }];
    },
    use(ctx) {
      const energy = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid)!;
      const active = ctx.me.active!;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== energy);
      active.energy.push(energy);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, energy.defId).name} to ${pokemonName(ctx.state, active)}.`);
      energyEffect(energy.defId)?.onAttach?.(ctx.state, ctx.me, active);
      energyFromHand(ctx.state, ctx.me, 'active', energy);
    },
  },

  // Vileplume – Poison Pollen: once a turn, flip; heads, the Defending Pokémon is now Poisoned.
  'ecard1-31': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Poison Pollen did nothing.');
      poison(ctx, ctx.opp.active!);
    },
  },
};

/** The opponent's Pokémon is now Poisoned, unless it can't be affected by Special Conditions or a battle rule guards it. */
function poison(ctx: PowerContext, p: InPlayPokemon) {
  const name = pokemonName(ctx.state, p);
  const blocked = afflictionBlocked(ctx.state, ctx.opp.id, p, 'poisoned');
  if (blocked) return ctx.log(blocked);
  p.poison = Math.max(p.poison ?? 0, 10);
  ctx.log(`${name} is now Poisoned.`);
}

export const ECARD1_POWERS: Record<string, PowerEffect> = {
  ...withNonHolo(HOLO),
  // Metapod – Exoskeleton: attack damage to it is 20 less, after Weakness and Resistance.
  'ecard1-87': { ...POKE_BODY, damageReduction: 20 },
};
