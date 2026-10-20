// Aquapolis (ecard2) Poké-Powers and Poké-Bodies, by card id. As in Expedition (ecard1-powers.ts), Poké-Powers stop with any
// Special Condition (Poisoned and Burned too: those that say so; the ones used from the Bench don't need to), Poké-Bodies
// always work (`body`, `ignoresConditions`).
// Rulings (from the text): questions whose answer depends on a flip are asked before it (Flower Supplement's Energy card and
// Benched Pokémon, Super Dynamo's Lightning Energy card and Pokémon, Magnetic Flow's Energy cards, Fragrance Trap's Benched
// Pokémon). Happy Healing counts the Energy attached to Blissey (Double Colorless is 2). Miracle Shift may attach the card it
// just discarded. Dark Moon takes up to as many cards as Darkness Energy attached to Umbreon, one at a time; the opponent
// then draws as many. Ion Coating's Water Energy lasts the turn, until that Pokémon leaves the Active spot. Crystal Type's
// type lasts until the end of the turn (a new attachment changes it again). Pure Body discards an Energy card after the
// Fire (Entei) or Water (Suicune) Energy card is attached from the hand, as the promo Suicune's does. Extreme Speed and
// Lightweight count Energy (Double Colorless is 2), Conductive Body the Magnemite on the Bench (both Magnemite cards).
import { conditionProof, isBasicEnergy, lookupCard, type CardLibrary, type EnergyType } from '../cards.js';
import { counts, energyPool, isEnergyCardOf, type CardInstance, type InPlayPokemon, type PlayerState } from '../engine.js';
import { attachBlocked, discardsLocked, energyFromHand, ownTargets, pokemonAt, powerActive, type PowerChoiceSpec, type PowerContext, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, effectId, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { powerEffect } from './index.js';

/** A Poké-Body: always on, whatever its Pokémon's Special Conditions. */
const POKE_BODY = { ignoresConditions: true, body: true } as const;

/** Energy cards attached to a Pokémon. */
const energyCards = (p: InPlayPokemon) => p.energy.filter((e) => !e.provides);

/** Basic Energy cards (not a Pokémon attached as Energy). */
const isBasicCard = (cards: CardLibrary, c: CardInstance) => !c.provides && isBasicEnergy(lookupCard(cards, c.defId));

const onlyActive = (s: PowerSituation, name: string) => (s.source === 'active' ? null : `${name} must be your Active Pokémon`);
const onlyBenched = (s: PowerSituation, name: string) => (s.source !== 'active' ? null : `${name} must be on your Bench`);

/** The player's Benched Pokémon, by target. */
const benched = (s: Pick<PowerSituation, 'me'>) => ownTargets(s.me).filter((t) => t !== 'active');

/**
 * `pokemon` (of `owner`) is now `condition`, unless it can't be affected by Special Conditions (Thick Skinned, Clefairy Doll,
 * Flash Touch, Pollen Shield) or a battle rule guards it (Sleep Pendulum).
 */
export function afflict(ctx: PowerContext, owner: PlayerState, pokemon: InPlayPokemon, condition: 'asleep') {
  const name = pokemonName(ctx.state, pokemon);
  const thickSkinned = powerActive(pokemon, ctx.state.cards, [ctx.me, ctx.opp]) && powerEffect(effectId(pokemon))?.noConditions;
  const shielded = (pokemon.effects?.flashTouch && owner.active === pokemon) || (pokemon.effects?.pollenShield ?? -1) >= ctx.state.turn;
  if (conditionProof(inPlayDef(ctx.state.cards, pokemon)) || thickSkinned || shielded) return addLog(ctx.state, `${name} can't be affected by Special Conditions.`, owner.id);
  const guard = ctx.state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === owner.id && r.conditions.includes(condition));
  if (guard) return addLog(ctx.state, `${guard.label ?? 'A battle rule'} protected ${name} from that.`, owner.id);
  pokemon.condition = condition;
  delete pokemon.paralyzedTurn;
  addLog(ctx.state, `${name} is now Asleep.`, owner.id);
}

/** Pure Body: after a `type` basic Energy card from the hand is attached, an Energy card is discarded from the Pokémon. */
export const pureBody = (type: EnergyType): PowerEffect => ({
  ...POKE_BODY,
  onEnergyFromHand(state, owner, pokemon, target, energy) {
    const d = lookupCard(state.cards, energy.defId);
    if (energy.provides || !isBasicEnergy(d) || d.kind !== 'energy' || d.energyType !== type) return;
    // Identical cards make no difference, so only a real choice is asked.
    if (new Set(pokemon.energy.map((e) => e.defId)).size > 1) {
      state.pendingChoice = { player: owner.id, source: 'Pure Body', kind: 'discardAttached', target };
      return;
    }
    const discarded = pokemon.energy.pop()!;
    owner.discard.push(discarded);
    addLog(state, `Pure Body: discarded ${lookupCard(state.cards, discarded.defId).name} from ${pokemonName(state, pokemon)}.`, owner.id);
  },
});

/** Crystal Type: a basic Energy card of one of `types` attached from the hand makes the Pokémon that type for the turn. */
export const crystalType = (types: EnergyType[]): PowerEffect => ({
  ...POKE_BODY,
  onEnergyFromHand(state, owner, pokemon, _target, energy) {
    const d = lookupCard(state.cards, energy.defId);
    if (energy.provides || !isBasicEnergy(d) || d.kind !== 'energy' || !types.includes(d.energyType)) return;
    pokemon.crystalType = d.energyType;
    addLog(state, `Crystal Type: ${lookupCard(state.cards, pokemon.card.defId).name} is a ${d.energyType[0]!.toUpperCase()}${d.energyType.slice(1)} Pokémon this turn.`, owner.id);
  },
});

/** A retreat cost change (a Poké-Body): Extreme Speed, Heavyweight, Lightweight, Conductive Body. */
const retreat = (change: (pokemon: InPlayPokemon, cards: CardLibrary, owner: Pick<PlayerState, 'active' | 'bench'>) => number): PowerEffect => ({ ...POKE_BODY, retreatChange: change });

/** Every basic Energy card in the player's hand that can go on this Pokémon (Anti-Lightning). */
const attachable = (s: PowerSituation, p: InPlayPokemon) => s.me.hand.filter((c) => isBasicCard(s.cards, c) && !attachBlocked(s.cards, [s.me, s.opp], p, c));

export const ECARD2_POWERS: Record<string, PowerEffect> = {
  // Arcanine – Extreme Speed: 1 less to retreat for each Energy attached.
  'ecard2-2': retreat((p, cards) => -energyPool(p, cards).length),

  // Ariados – Gluey Slime: each player's Active Pokémon costs 1 more to retreat (only 1, however many Ariados).
  'ecard2-3': { ...POKE_BODY, glueySlime: true },

  // Azumarill – Bubble Turn: once a turn, from the Bench, flip; heads returns Azumarill and its cards to the hand.
  'ecard2-4': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Azumarill'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Bubble Turn did nothing.');
      const p = ctx.source;
      const slot = ctx.sourceTarget as number;
      ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, converted: _c, windless: _w, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
      ctx.me.bench[slot] = null;
      ctx.log(`${pokemonName(ctx.state, p)} and every card attached went back to the hand.`);
    },
  },

  // Bellossom – Flower Supplement: once a turn, flip; heads attaches a basic Energy card from the hand to a Benched Pokémon.
  'ecard2-5': {
    oncePerTurn: true,
    blocked: (s) => (!benched(s).length ? 'You have no Benched Pokémon' : s.me.hand.some((c) => isBasicCard(s.cards, c)) ? null : 'No basic Energy cards in your hand'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'to', options: benched(s), prompt: 'Attach a basic Energy card (on heads) to' }];
      if (c.to === undefined) return specs;
      return [...specs, { kind: 'handCard', field: 'cardUid', options: attachable(s, pokemonAt(s.me, c.to)!), prompt: 'Choose a basic Energy card from your hand' }];
    },
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Flower Supplement did nothing.');
      const energy = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== energy);
      to.energy.push(energy);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, energy.defId).name} to ${pokemonName(ctx.state, to)}.`);
      energyFromHand(ctx.state, ctx.me, ctx.choices.to!, energy);
    },
  },

  // Blissey – Happy Healing: once a turn, choose a Benched Pokémon and flip; heads removes a damage counter from it for each Energy on Blissey.
  'ecard2-6': {
    oncePerTurn: true,
    blocked: (s) => (benched(s).length ? null : 'You have no Benched Pokémon'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: benched(s), prompt: 'Choose one of your Benched Pokémon to heal (on heads)' }],
    use(ctx) {
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      if (!ctx.flip()) return ctx.log('Happy Healing did nothing.');
      const healed = Math.min(to.damage, 10 * energyPool(ctx.source, ctx.state.cards).length);
      to.damage -= healed;
      ctx.log(`${pokemonName(ctx.state, to)} healed ${healed} damage.`);
    },
  },

  // Electrode – Super Dynamo: as the Active Pokémon, once a turn, flip; heads attaches a Lightning Energy card from the discard pile to one of your Pokémon.
  'ecard2-8': {
    oncePerTurn: true,
    blocked(s) {
      if (s.source !== 'active') return 'Electrode must be your Active Pokémon';
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return s.me.discard.some((c) => isBasicCard(s.cards, c) && isEnergyCardOf(c, s.cards, 'lightning')) ? null : 'No Lightning Energy cards in your discard pile';
    },
    choices: (s) => [
      { kind: 'discardCard', field: 'cardUid', options: s.me.discard.filter((c) => isBasicCard(s.cards, c) && isEnergyCardOf(c, s.cards, 'lightning')), prompt: 'Choose a Lightning Energy card from your discard pile' },
      { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me), prompt: 'Attach it (on heads) to' },
    ],
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Super Dynamo did nothing.');
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      to.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Entei – Pure Body (Fire).
  'ecard2-10': pureBody('fire'),

  // Espeon – Energy Return: as often as you like, an Energy card attached to one of your Pokémon goes back to the hand.
  'ecard2-11': {
    blocked: (s) => (ownTargets(s.me).some((t) => energyCards(pokemonAt(s.me, t)!).length) ? null : 'None of your Pokémon has an Energy card attached'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => energyCards(pokemonAt(s.me, t)!).length), prompt: 'Return an Energy card from' }];
      if (c.from === undefined) return specs;
      return [...specs, { kind: 'attachedEnergy', field: 'energyUid', options: energyCards(pokemonAt(s.me, c.from)!), prompt: 'Choose the Energy card to return to your hand' }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const card = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== card);
      const { converted: _c, windless: _w, ...plain } = card;
      ctx.me.hand.push(plain);
      ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to the hand.`);
    },
  },

  // Hypno – Sleep Pendulum: as the Active Pokémon, once a turn, the Defending Pokémon is now Asleep.
  'ecard2-16': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Hypno') ?? (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use: (ctx) => afflict(ctx, ctx.opp, ctx.opp.active!, 'asleep'),
  },

  // Jumpluff – Fluff: with a damage counter on it, a flip whenever the opponent's attack does anything to it; heads prevents all of it.
  'ecard2-17': { ...POKE_BODY, fluff: true },

  // Kingdra – Water Cyclone: as often as you like, a Water Energy card from the Active Pokémon to a Benched Pokémon.
  'ecard2-19': {
    blocked(s) {
      if (!s.me.active?.energy.some((e) => isEnergyCardOf(e, s.cards, 'water'))) return 'Your Active Pokémon has no Water Energy card attached';
      return benched(s).length ? null : 'You have no Benched Pokémon';
    },
    choices: (s) => [
      { kind: 'attachedEnergy', field: 'energyUid', options: s.me.active!.energy.filter((e) => isEnergyCardOf(e, s.cards, 'water')), prompt: 'Choose a Water Energy card on your Active Pokémon' },
      { kind: 'ownPokemon', field: 'to', options: benched(s), prompt: 'Move it to' },
    ],
    use(ctx) {
      const from = ctx.me.active!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const card = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Lanturn – Ion Coating: once a turn, the Lightning Energy on the Active Pokémon is Water Energy for the turn.
  'ecard2-21': {
    oncePerTurn: true,
    blocked: (s) => (s.me.active?.energy.some((e) => isBasicCard(s.cards, e) && isEnergyCardOf(e, s.cards, 'lightning')) ? null : 'Your Active Pokémon has no Lightning Energy card attached'),
    use(ctx) {
      const active = ctx.me.active!;
      for (const e of active.energy) if (isBasicCard(ctx.state.cards, e) && isEnergyCardOf(e, ctx.state.cards, 'lightning')) e.converted = { type: 'water', by: ctx.source.card.uid, activeOnly: true, untied: true };
      ctx.log(`The Lightning Energy on ${pokemonName(ctx.state, active)} is Water Energy for the rest of the turn.`);
    },
  },

  // Magneton – Magnetic Flow: as the Active Pokémon, once a turn, flip; heads switches an Energy card between 2 of the opponent's Pokémon.
  'ecard2-22': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Magneton') ?? (ownTargets(s.opp).filter((t) => energyCards(pokemonAt(s.opp, t)!).length).length >= 2 ? null : "Your opponent needs 2 Pokémon with Energy cards attached"),
    choices(s, c) {
      const withEnergy = ownTargets(s.opp).filter((t) => energyCards(pokemonAt(s.opp, t)!).length);
      const specs: PowerChoiceSpec[] = [{ kind: 'oppPokemon', field: 'oppFrom', options: withEnergy, prompt: "Choose one of your opponent's Pokémon with Energy" }];
      if (c.oppFrom === undefined) return specs;
      specs.push({ kind: 'oppPokemon', field: 'oppTo', options: withEnergy.filter((t) => t !== c.oppFrom), prompt: 'Choose another' });
      if (c.oppTo === undefined) return specs;
      specs.push({ kind: 'attachedEnergy', field: 'energyUid', options: energyCards(pokemonAt(s.opp, c.oppFrom)!), prompt: 'Choose the Energy card to move from the first' });
      specs.push({ kind: 'attachedEnergy', field: 'energyUid2', options: energyCards(pokemonAt(s.opp, c.oppTo)!), prompt: 'Choose the Energy card to move from the second' });
      return specs;
    },
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Magnetic Flow did nothing.');
      const a = pokemonAt(ctx.opp, ctx.choices.oppFrom!)!;
      const b = pokemonAt(ctx.opp, ctx.choices.oppTo!)!;
      const ea = a.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      const eb = b.energy.find((e) => e.uid === ctx.choices.energyUid2)!;
      a.energy = [...a.energy.filter((e) => e !== ea), eb];
      b.energy = [...b.energy.filter((e) => e !== eb), ea];
      ctx.log(`Switched ${lookupCard(ctx.state.cards, ea.defId).name} on ${pokemonName(ctx.state, a)} with ${lookupCard(ctx.state.cards, eb.defId).name} on ${pokemonName(ctx.state, b)}.`);
    },
  },

  // Muk – Heavyweight: 2 more to retreat while a Grass Energy is attached.
  'ecard2-23': retreat((p, cards) => (energyPool(p, cards).some((t) => counts(t, 'grass')) ? 2 : 0)),

  // Nidoking – Earth Rage: as the Active Pokémon, once a turn, flip; heads puts a damage counter on each of the opponent's Benched Pokémon.
  'ecard2-24': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Nidoking') ?? (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Earth Rage did nothing.');
      for (const p of ctx.opp.bench) {
        if (!p) continue;
        p.damage += 10;
        addLog(ctx.state, `Put a damage counter on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      }
    },
  },

  // Octillery – Suction Cups: as the Active Pokémon, the opponent's Active Pokémon that retreats has every Energy card discarded (RETREAT).
  'ecard2-26': { ...POKE_BODY, suctionCups: true },

  // Porygon2 – Backup: once a turn, with 2 or fewer cards in the hand, draw until there are 3.
  'ecard2-28': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length > 2 ? 'You have more than 2 cards in your hand' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const drawn = ctx.me.deck.splice(0, 3 - ctx.me.hand.length);
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
    },
  },

  // Scizor – Poison Resistance: it can't be Poisoned.
  'ecard2-32': { ...POKE_BODY, noPoison: true },

  // Slowbro – Dense Body: 20 less damage from Basic Pokémon's attacks (not Baby Pokémon's).
  'ecard2-33': { ...POKE_BODY, basicGuard: 20 },

  // Suicune – Pure Body (Water).
  'ecard2-37': pureBody('water'),

  // Tentacruel – Strange Tentacles: once a turn, while the Defending Pokémon has fewer Energy cards than your Active Pokémon, an Energy card from the opponent's discard pile onto it.
  'ecard2-38': {
    oncePerTurn: true,
    blocked(s) {
      if (!s.me.active || !s.opp.active) return 'There must be an Active Pokémon on each side';
      if (energyCards(s.opp.active).length >= energyCards(s.me.active).length) return "The Defending Pokémon doesn't have fewer Energy cards than your Active Pokémon";
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return s.opp.discard.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : "No Energy cards in your opponent's discard pile";
    },
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: s.opp.discard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy'), prompt: "Choose an Energy card from your opponent's discard pile to attach to the Defending Pokémon" }],
    use(ctx) {
      const card = ctx.opp.discard.find((c) => c.uid === ctx.choices.cardUid)!;
      ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
      ctx.opp.active!.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the opponent's discard pile to ${pokemonName(ctx.state, ctx.opp.active!)}.`);
    },
  },

  // Togetic – Miracle Shift: once a turn, discard a basic Energy card from one of your Pokémon; then a basic Energy card from the discard pile onto it.
  'ecard2-39': {
    oncePerTurn: true,
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : ownTargets(s.me).some((t) => pokemonAt(s.me, t)!.energy.some((e) => isBasicCard(s.cards, e))) ? null : 'None of your Pokémon has a basic Energy card attached'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.energy.some((e) => isBasicCard(s.cards, e))), prompt: 'Discard a basic Energy card from' }];
      if (c.from === undefined) return specs;
      const own = pokemonAt(s.me, c.from)!.energy.filter((e) => isBasicCard(s.cards, e));
      specs.push({ kind: 'attachedEnergy', field: 'energyUid', options: own, prompt: 'Choose the basic Energy card to discard' });
      if (c.energyUid === undefined) return specs;
      const discarded = own.filter((e) => e.uid === c.energyUid);
      return [...specs, { kind: 'discardCard', field: 'cardUid', options: [...discarded, ...s.me.discard.filter((d) => isBasicCard(s.cards, d))], prompt: 'Choose a basic Energy card from your discard pile to attach to it' }];
    },
    use(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.from!)!;
      const gone = p.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      p.energy = p.energy.filter((e) => e !== gone);
      const { converted: _c, windless: _w, ...plain } = gone;
      ctx.me.discard.push(plain);
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid)!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      p.energy.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, gone.defId).name} from ${pokemonName(ctx.state, p)} and attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile.`);
    },
  },

  // Umbreon – Dark Moon: as the Active Pokémon with a Darkness Energy attached, once a turn, up to that many cards from the opponent's hand go into their deck; they draw as many.
  'ecard2-41': {
    oncePerTurn: true,
    blocked(s) {
      if (s.source !== 'active') return 'Umbreon must be your Active Pokémon';
      if (!energyPool(s.me.active!, s.cards).some((t) => counts(t, 'darkness'))) return 'Umbreon has no Darkness Energy attached';
      return s.counts.oppHand ? null : "Your opponent's hand is empty";
    },
    use(ctx) {
      const count = energyPool(ctx.source, ctx.state.cards).filter((t) => counts(t, 'darkness')).length;
      ctx.pend({ kind: 'oppHandTrainer', source: 'Dark Moon', any: true, count });
    },
  },

  // Victreebel – Fragrance Trap: once a turn, flip; heads switches the chosen Benched Pokémon of the opponent's with their Active Pokémon.
  'ecard2-42': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: ownTargets(s.opp).filter((t) => t !== 'active'), prompt: "Choose one of your opponent's Benched Pokémon to switch in (on heads)" }],
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Fragrance Trap did nothing.');
      swapActive(ctx.state, ctx.opp, ctx.choices.oppTo as number);
    },
  },

  // Zapdos – Anti-Lightning: Lightning Energy cards can't be attached to it from the hand.
  'ecard2-44': { ...POKE_BODY, antiAttach: 'lightning' },

  // Furret – Scavenger Hunt: once a turn, 2 cards from the hand into the deck; then an Energy card from the deck into the hand.
  'ecard2-48': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length < 2 ? 'You need 2 cards in your hand' : null),
    use(ctx) {
      ctx.pend({ kind: 'shuffleFromHand', source: 'Scavenger Hunt', count: 2 });
      (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Scavenger Hunt', kind: 'pickFromDeck', filter: 'energy', reveal: true });
    },
  },

  // Gloom – Enervating Pollen: Resistance on each Active Pokémon takes off at most 10.
  'ecard2-49': { ...POKE_BODY, enervatingPollen: true },

  // Skiploom – Lightweight: 1 less to retreat for each Grass Energy.
  'ecard2-60': retreat((p, cards) => -energyPool(p, cards).filter((t) => counts(t, 'grass')).length),

  // Hoppip – Lightweight.
  'ecard2-83': retreat((p, cards) => -energyPool(p, cards).filter((t) => counts(t, 'grass')).length),

  // Magnemite – Conductive Body: 1 less to retreat for each Magnemite on your Bench.
  'ecard2-91': retreat((_p, cards, owner) => -owner.bench.filter((q) => q && inPlayDef(cards, q).name === 'Magnemite').length),

  // Kingdra, Lugia, Nidoking – Crystal Type.
  'ecard2-148': crystalType(['water', 'lightning', 'psychic']),
  'ecard2-149': crystalType(['fire', 'water', 'psychic']),
  'ecard2-150': crystalType(['grass', 'lightning', 'fire']),
};

