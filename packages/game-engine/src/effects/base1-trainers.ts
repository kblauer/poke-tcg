// Base Set (base1) Trainer cards, by card id. Rulings (agreed): a Knocked Out Clefairy Doll gives
// no prize; Scoop Up can't take your only Pokémon in play; Devolution Spray can Knock Out (prize as
// usual); PlusPower's +10 comes before Defender's −20, both after weakness and resistance.
import { isBasicEnergy, isBasicPokemon, isBenchable, isPokemonCard, isTrainerCard, type CardLibrary, type PokemonCardDef } from '../cards.js';
import { activeLock, discardTheirEnergy, newInPlay, type CardInstance, type GameState, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { energyKept, evolutionBlocked, offerChainReaction, playedFromHand, pokemonAt, trainerProof } from '../powers.js';
import { clearOnLeavingActive, clearSpecialConditions, devolvable, energyProtected, evolvedHook, hasSpecialCondition, inPlayDef, openBenchSlot } from '../status.js';
import { def, otherHandCards, own, targetsOf, theirs, type TrainerChoiceSpec, type TrainerEffect, type TrainerSituation } from '../trainers.js';

const pokemonDef = (s: { cards: TrainerSituation['cards'] }, p: InPlayPokemon): PokemonCardDef => inPlayDef(s.cards, p);

/** "Discard/shuffle/trade N of the other cards from your hand." */
const otherCards = (s: TrainerSituation, n: number, prompt: string): TrainerChoiceSpec => ({
  kind: 'cards',
  field: 'handUids',
  min: n,
  max: n,
  options: otherHandCards(s),
  prompt,
});
const needOthers = (s: TrainerSituation, n: number) => (otherHandCards(s).length < n ? `You need ${n} other card${n === 1 ? '' : 's'} in your hand` : null);

/** The opponent's Pokémon at `t` has Energy that Trainers can remove (not with Brock's Protection attached, nor an Unown kept by Unown K). */
const removable = (s: TrainerSituation, t: Target) => theirs(s, t)!.energy.length > 0 && !energyProtected(s.cards, theirs(s, t)!) && !energyKept(s.opp, [s.opp, s.me], s.cards, theirs(s, t)!);
const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: Target) => pokemonAt(side, t)!;
/** An empty Bench slot of `side` (none while Narrow Gym leaves no room), given the Stadium in play. */
const emptySlot = (side: Pick<PlayerState, 'bench'>, s: { cards: CardLibrary; stadium?: CardInstance | null }) => openBenchSlot(side.bench, s.cards, s.stadium);

/** Switches the active with the benched Pokémon in `slot`. */
function switchActive(side: PlayerState, slot: number) {
  const benched = side.bench[slot]!;
  clearOnLeavingActive(side.active!);
  side.bench[slot] = side.active;
  side.active = benched;
}

/** Removes a Pokémon from play, putting all its cards in the discard pile except `keep`. */
function removeFromPlay(side: PlayerState, t: Target, keep?: CardInstance) {
  const p = at(side, t);
  const cards = [...p.evolvedFrom, p.card, ...p.energy, ...(p.attached ?? []).map((a) => a.card)];
  side.discard.push(...cards.filter((c) => c !== keep));
  if (t === 'active') side.active = null;
  else side.bench[t] = null;
}

/** A Pokémon LV.X is never devolved (devolvable): its rank is only for the type. */
const STAGE_ORDER = { basic: 0, stage1: 1, stage2: 2, levelUp: 3 } as const;
/** Whether the Pokémon can be devolved (not with a Pokémon LV.X on top: devolvable). */
const hasEvolution = (s: TrainerSituation, p: InPlayPokemon) => devolvable(s.cards, p);

export const BASE1_TRAINERS: Record<string, TrainerEffect> = {
  // Clefairy Doll: played onto the Bench as a 10 HP Pokémon (see isBenchable and the doll rules in the engine).
  'base1-70': { asPokemon: { hp: 10 } },

  // Computer Search
  'base1-71': {
    blocked: (s) => needOthers(s, 2),
    choices: (s) => [otherCards(s, 2, 'Choose 2 other cards to discard')],
    play(ctx) {
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.pend({ kind: 'pickFromDeck', source: 'Computer Search', filter: 'any' });
    },
  },

  // Devolution Spray
  'base1-72': {
    blocked: (s) => (targetsOf(s.me).some((t) => hasEvolution(s, own(s, t)!)) ? null : 'None of your Pokémon are evolved'),
    choices(s, c) {
      const specs: TrainerChoiceSpec[] = [
        { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => hasEvolution(s, own(s, t)!)), prompt: 'Choose one of your evolved Pokémon' },
      ];
      if (c.target === undefined) return specs;
      const p = own(s, c.target)!;
      const stages = [...p.evolvedFrom, p.card].map((card) => (def(s, card) as PokemonCardDef).stage).filter((st) => st === 'stage1' || st === 'stage2') as ('stage1' | 'stage2')[];
      return [...specs, { kind: 'stage', field: 'stage', options: stages.reverse(), prompt: 'Discard Evolution cards of this Stage and higher' }];
    },
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      const cards = [...p.evolvedFrom, p.card];
      const cut = STAGE_ORDER[ctx.choices.stage!];
      const keep = cards.filter((c) => STAGE_ORDER[(ctx.state.cards[c.defId] as PokemonCardDef).stage] < cut);
      ctx.me.discard.push(...cards.filter((c) => !keep.includes(c)));
      p.card = keep.at(-1)!;
      p.evolvedFrom = keep.slice(0, -1);
      // As if it had evolved: Special Conditions and attack effects end. A Knock Out is handled after.
      clearOnLeavingActive(p);
      ctx.log(`${pokemonDef(ctx.state, p).name} was devolved.`);
    },
  },

  // Impostor Professor Oak
  'base1-73': {
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.opp, ctx.opp.hand.splice(0));
      ctx.log('Shuffled their hand into their deck.', ctx.opp.id);
      ctx.draw(ctx.opp, 7);
    },
  },

  // Item Finder
  'base1-74': {
    discardToHand: true,
    blocked: (s) => needOthers(s, 2) ?? (s.me.discard.some((c) => isTrainerCard(def(s, c))) ? null : 'No Trainer cards in your discard pile'),
    choices: (s) => [
      otherCards(s, 2, 'Choose 2 other cards to discard'),
      { kind: 'cards', field: 'discardUids', min: 1, max: 1, options: s.me.discard.filter((c) => isTrainerCard(def(s, c))), prompt: 'Choose a Trainer card from your discard pile' },
    ],
    play(ctx) {
      const [found] = ctx.choices.discardUids!;
      const card = ctx.me.discard.find((c) => c.uid === found)!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.me.hand.push(card);
      ctx.log(`Took ${def(ctx.state, card).name} from the discard pile.`);
    },
  },

  // Lass
  'base1-75': {
    play(ctx) {
      for (const player of [ctx.me, ctx.opp]) {
        const names = player.hand.map((c) => def(ctx.state, c).name);
        ctx.log(`Hand: ${names.length ? names.join(', ') : 'empty'}.`, player.id);
        const trainers = player.hand.filter((c) => isTrainerCard(def(ctx.state, c)));
        player.hand = player.hand.filter((c) => !trainers.includes(c));
        ctx.shuffleIntoDeck(player, trainers);
        if (trainers.length) ctx.log(`Shuffled ${trainers.length} Trainer card${trainers.length === 1 ? '' : 's'} into the deck.`, player.id);
      }
    },
  },

  // Pokémon Breeder
  'base1-76': {
    blocked(s) {
      if (s.turn <= 2) return "You can't evolve on your first turn";
      const blocked = evolutionBlocked([s.me, s.opp], s.cards);
      if (blocked) return blocked;
      return otherHandCards(s).some((c) => breederTargets(s, c).length) ? null : 'No Stage 2 card in your hand matches a Basic Pokémon you can evolve';
    },
    choices(s, c) {
      const stage2s = otherHandCards(s).filter((card) => breederTargets(s, card).length);
      const specs: TrainerChoiceSpec[] = [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: stage2s, prompt: 'Choose a Stage 2 card from your hand' }];
      const chosen = c.handUids && s.me.hand.find((card) => card.uid === c.handUids![0]);
      if (!chosen) return specs;
      return [...specs, { kind: 'pokemon', field: 'target', side: 'own', options: breederTargets(s, chosen), prompt: 'Put it on' }];
    },
    play(ctx) {
      const [stage2] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      const p = at(ctx.me, ctx.choices.target!);
      const basicName = pokemonDef(ctx.state, p).name;
      p.evolvedFrom.push(p.card);
      p.card = stage2!;
      p.playedTurn = ctx.turn;
      clearOnLeavingActive(p);
      ctx.log(`${basicName} evolved into ${pokemonDef(ctx.state, p).name}.`);
      evolvedHook(ctx.state, ctx.me.id, p);
      // The Stage 2 was played from the hand: its power may react (Summon Minions…, agreed), then Chain Reaction.
      playedFromHand(ctx.state, ctx.me, p);
      if (!ctx.state.pendingChoice) offerChainReaction(ctx.state);
    },
  },

  // Pokémon Trader
  'base1-77': {
    blocked: (s) => (otherHandCards(s).some((c) => isPokemonCard(def(s, c))) ? null : 'No Pokémon card in your hand to trade'),
    choices: (s) => [
      { kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => isPokemonCard(def(s, c))), prompt: 'Choose a Pokémon card from your hand to trade' },
    ],
    play(ctx) {
      ctx.log(`Offered ${def(ctx.state, ctx.me.hand.find((c) => c.uid === ctx.choices.handUids![0])!).name}.`);
      ctx.pend({ kind: 'pickFromDeck', source: 'Pokémon Trader', filter: 'pokemon', tradeUid: ctx.choices.handUids![0] });
    },
  },

  // Scoop Up
  'base1-78': {
    blocked: (s) => (targetsOf(s.me).length < 2 ? "You can't Scoop Up your only Pokémon in play" : null),
    // Not an Active Pokémon held by Jaw Clamp.
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => t !== 'active' || !activeLock(s.me, [s.me, s.opp], s.cards)), prompt: 'Choose a Pokémon to return to your hand' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      const basic = p.evolvedFrom[0] ?? p.card;
      removeFromPlay(ctx.me, ctx.choices.target!, basic);
      ctx.me.hand.push(basic);
      ctx.log(`Returned ${def(ctx.state, basic).name} to the hand.`);
    },
  },

  // Super Energy Removal
  'base1-79': {
    blocked(s) {
      if (!targetsOf(s.me).some((t) => own(s, t)!.energy.length)) return 'None of your Pokémon have Energy to discard';
      return targetsOf(s.opp).some((t) => removable(s, t)) ? null : "None of your opponent's Pokémon have Energy";
    },
    choices(s, c) {
      const specs: TrainerChoiceSpec[] = [
        { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => own(s, t)!.energy.length), prompt: 'Discard an Energy from which of your Pokémon' },
      ];
      if (c.target !== undefined) specs.push({ kind: 'cards', field: 'energyUids', min: 1, max: 1, options: own(s, c.target)!.energy, prompt: 'Choose your Energy to discard' });
      specs.push({ kind: 'pokemon', field: 'oppTarget', side: 'opp', options: targetsOf(s.opp).filter((t) => removable(s, t)), prompt: "Choose one of your opponent's Pokémon" });
      if (c.oppTarget !== undefined) specs.push({ kind: 'cards', field: 'oppEnergyUids', min: 1, max: 2, options: theirs(s, c.oppTarget)!.energy, prompt: 'Choose up to 2 of its Energy to discard' });
      return specs;
    },
    play(ctx) {
      discardEnergy(ctx.me, at(ctx.me, ctx.choices.target!), ctx.choices.energyUids!);
      discardTheirs(ctx.state, ctx.opp, at(ctx.opp, ctx.choices.oppTarget!), ctx.choices.oppEnergyUids!);
      ctx.log(`Discarded ${ctx.choices.oppEnergyUids!.length} Energy from ${pokemonDef(ctx.state, at(ctx.opp, ctx.choices.oppTarget!)).name}.`, ctx.opp.id);
    },
  },

  // Defender
  'base1-80': {
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me), prompt: 'Attach Defender to' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      // Discarded at the end of the opponent's next turn.
      ctx.attachTo(p, ctx.turn + 1);
      ctx.log(`Attached Defender to ${pokemonDef(ctx.state, p).name}.`);
    },
  },

  // Energy Retrieval
  'base1-81': {
    discardToHand: true,
    blocked: (s) => needOthers(s, 1) ?? (s.me.discard.some((c) => isBasicEnergy(def(s, c))) ? null : 'No basic Energy cards in your discard pile'),
    choices: (s) => [
      otherCards(s, 1, 'Choose another card to discard'),
      { kind: 'cards', field: 'discardUids', min: 1, max: 2, options: s.me.discard.filter((c) => isBasicEnergy(def(s, c))), prompt: 'Choose up to 2 basic Energy cards from your discard pile' },
    ],
    play(ctx) {
      const taken = ctx.me.discard.filter((c) => ctx.choices.discardUids!.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.me.hand.push(...taken);
      ctx.log(`Took ${taken.length} Energy from the discard pile.`);
    },
  },

  // Full Heal
  'base1-82': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.active && hasSpecialCondition(s.me.active) ? null : 'Your Active Pokémon has no Special Condition'),
    play(ctx) {
      const p = ctx.me.active!;
      clearSpecialConditions(p);
      ctx.log(`${pokemonDef(ctx.state, p).name} is no longer affected by Special Conditions.`);
    },
  },

  // Maintenance
  'base1-83': {
    blocked: (s) => needOthers(s, 2),
    choices: (s) => [otherCards(s, 2, 'Choose 2 other cards to shuffle into your deck')],
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.me, ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.draw(ctx.me, 1);
    },
  },

  // PlusPower
  'base1-84': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.active ? null : 'No Active Pokémon'),
    play(ctx) {
      // Discarded at the end of this turn.
      ctx.attachTo(ctx.me.active!, ctx.turn);
      ctx.log(`Attached PlusPower to ${pokemonDef(ctx.state, ctx.me.active!).name}.`);
    },
  },

  // Pokémon Center
  'base1-85': {
    blocked: (s) => (targetsOf(s.me).some((t) => own(s, t)!.damage > 0) ? null : 'None of your Pokémon have damage counters'),
    play(ctx) {
      for (const t of targetsOf(ctx.me)) {
        const p = at(ctx.me, t);
        if (!p.damage || trainerProof(ctx.me, [ctx.me, ctx.opp], ctx.state.cards, p)) continue;
        p.damage = 0;
        ctx.me.discard.push(...p.energy);
        p.energy = [];
        ctx.log(`Healed ${pokemonDef(ctx.state, p).name} and discarded its Energy.`);
      }
    },
  },

  // Pokémon Flute
  'base1-86': {
    blocked(s) {
      if (emptySlot(s.opp, s) < 0) return "Your opponent's Bench is full";
      return s.opp.discard.some((c) => isBasicPokemon(def(s, c))) ? null : "No Basic Pokémon in your opponent's discard pile";
    },
    choices: (s) => [
      { kind: 'cards', field: 'discardUids', min: 1, max: 1, options: s.opp.discard.filter((c) => isBasicPokemon(def(s, c))), prompt: "Choose a Basic Pokémon from your opponent's discard pile" },
    ],
    play(ctx) {
      const card = ctx.opp.discard.find((c) => c.uid === ctx.choices.discardUids![0])!;
      ctx.opp.discard = ctx.opp.discard.filter((c) => c !== card);
      ctx.opp.bench[emptySlot(ctx.opp, { cards: ctx.state.cards, stadium: ctx.state.stadium?.card })] = newInPlay(card, ctx.turn);
      ctx.log(`${def(ctx.state, card).name} was put onto the Bench.`, ctx.opp.id);
    },
  },

  // Pokédex
  'base1-87': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'arrangeTop', source: 'Pokédex', count: Math.min(5, ctx.me.deck.length) }),
  },

  // Professor Oak
  'base1-88': {
    play(ctx) {
      ctx.me.discard.push(...ctx.me.hand.splice(0));
      ctx.log('Discarded their hand.');
      ctx.draw(ctx.me, 7);
    },
  },

  // Revive
  'base1-89': {
    blocked(s) {
      if (emptySlot(s.me, s) < 0) return 'Your Bench is full';
      return s.me.discard.some((c) => isBasicPokemon(def(s, c))) ? null : 'No Basic Pokémon in your discard pile';
    },
    choices: (s) => [
      { kind: 'cards', field: 'discardUids', min: 1, max: 1, options: s.me.discard.filter((c) => isBasicPokemon(def(s, c))), prompt: 'Choose a Basic Pokémon from your discard pile' },
    ],
    play(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids![0])!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      const p = newInPlay(card, ctx.turn);
      // Half its HP, rounded down to the nearest 10.
      p.damage = Math.floor(pokemonDef(ctx.state, p).hp / 20) * 10;
      ctx.me.bench[emptySlot(ctx.me, { cards: ctx.state.cards, stadium: ctx.state.stadium?.card })] = p;
      ctx.log(`Revived ${pokemonDef(ctx.state, p).name} onto the Bench.`);
    },
  },

  // Super Potion
  'base1-90': {
    blocked: (s) => (targetsOf(s.me).some((t) => own(s, t)!.damage > 0 && own(s, t)!.energy.length) ? null : 'None of your damaged Pokémon have Energy to discard'),
    choices(s, c) {
      const specs: TrainerChoiceSpec[] = [
        { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => own(s, t)!.damage > 0 && own(s, t)!.energy.length), prompt: 'Choose a Pokémon to heal' },
      ];
      if (c.target === undefined) return specs;
      return [...specs, { kind: 'cards', field: 'energyUids', min: 1, max: 1, options: own(s, c.target)!.energy, prompt: 'Choose an Energy to discard' }];
    },
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      discardEnergy(ctx.me, p, ctx.choices.energyUids!);
      const healed = Math.min(40, p.damage);
      p.damage -= healed;
      ctx.log(`Healed ${healed} damage from ${pokemonDef(ctx.state, p).name}.`);
    },
  },

  // Bill
  'base1-91': { play: (ctx) => ctx.draw(ctx.me, 2) },

  // Energy Removal
  'base1-92': {
    blocked: (s) => (targetsOf(s.opp).some((t) => removable(s, t)) ? null : "None of your opponent's Pokémon have Energy"),
    choices(s, c) {
      const specs: TrainerChoiceSpec[] = [
        { kind: 'pokemon', field: 'oppTarget', side: 'opp', options: targetsOf(s.opp).filter((t) => removable(s, t)), prompt: "Choose one of your opponent's Pokémon" },
      ];
      if (c.oppTarget === undefined) return specs;
      return [...specs, { kind: 'cards', field: 'oppEnergyUids', min: 1, max: 1, options: theirs(s, c.oppTarget)!.energy, prompt: 'Choose an Energy to discard' }];
    },
    play(ctx) {
      const p = at(ctx.opp, ctx.choices.oppTarget!);
      discardTheirs(ctx.state, ctx.opp, p, ctx.choices.oppEnergyUids!);
      ctx.log(`Discarded an Energy from ${pokemonDef(ctx.state, p).name}.`, ctx.opp.id);
    },
  },

  // Gust of Wind
  'base1-93': {
    blocked: (s) => trainerProof(s.opp, [s.me, s.opp], s.cards) ?? (s.opp.bench.some(Boolean) ? activeLock(s.opp, [s.me, s.opp], s.cards) : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [
      { kind: 'pokemon', field: 'oppTarget', side: 'opp', options: targetsOf(s.opp).filter((t) => t !== 'active'), prompt: "Choose one of your opponent's Benched Pokémon" },
    ],
    play(ctx) {
      switchActive(ctx.opp, ctx.choices.oppTarget as number);
      ctx.log(`${pokemonDef(ctx.state, ctx.opp.active!).name} was switched in.`, ctx.opp.id);
    },
  },

  // Potion
  'base1-94': {
    blocked: (s) => (targetsOf(s.me).some((t) => own(s, t)!.damage > 0) ? null : 'None of your Pokémon have damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => own(s, t)!.damage > 0), prompt: 'Choose a Pokémon to heal' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      const healed = Math.min(20, p.damage);
      p.damage -= healed;
      ctx.log(`Healed ${healed} damage from ${pokemonDef(ctx.state, p).name}.`);
    },
  },

  // Switch
  'base1-95': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.bench.some(Boolean) && s.me.active ? activeLock(s.me, [s.me, s.opp], s.cards) : 'You have no Benched Pokémon'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => t !== 'active'), prompt: 'Choose a Benched Pokémon to switch in' }],
    play(ctx) {
      switchActive(ctx.me, ctx.choices.target as number);
      ctx.log(`Switched in ${pokemonDef(ctx.state, ctx.me.active!).name}.`);
    },
  },
};

/**
 * Your Basic Pokémon in play that a Stage 2 card can go straight onto with Pokémon Breeder. Mysterious
 * Fossil counts, as the bottom of the Omastar and Kabutops lines (agreed ruling).
 */
function breederTargets(s: TrainerSituation, card: CardInstance): Target[] {
  const d = def(s, card);
  if (d.kind !== 'pokemon' || d.stage !== 'stage2' || !d.evolvesFromBasic) return [];
  return targetsOf(s.me).filter((t) => {
    const p = own(s, t)!;
    const current = def(s, p.card);
    return isBenchable(current) && current.name === d.evolvesFromBasic && p.playedTurn !== s.turn;
  });
}

function discardEnergy(owner: PlayerState, p: InPlayPokemon, uids: string[]) {
  const gone = p.energy.filter((e) => uids.includes(e.uid));
  p.energy = p.energy.filter((e) => !gone.includes(e));
  owner.discard.push(...gone.map(({ provides: _, ...card }) => card));
}

/** The opponent's Energy cards, discarded by the player's Trainer (Ecogym may send them back to the hand). */
function discardTheirs(state: GameState, owner: PlayerState, p: InPlayPokemon, uids: string[]) {
  const gone = p.energy.filter((e) => uids.includes(e.uid));
  p.energy = p.energy.filter((e) => !gone.includes(e));
  discardTheirEnergy(state, owner, gone);
}

