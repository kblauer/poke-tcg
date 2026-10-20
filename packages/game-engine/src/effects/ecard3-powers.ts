// Skyridge (ecard3) Poké-Powers and Poké-Bodies, by card id. As in Expedition and Aquapolis, Poké-Powers stop with any
// Special Condition (Poisoned and Burned too), Poké-Bodies always work (`body`, `ignoresConditions`) unless Ancient Wind is
// ignoring them.
// Rulings (from the text): the powers that work "when you play X from your hand to evolve your Active Pokémon" (Energy
// Recharge, Venom Spray, Manipulate, Flame Vapor, Streaming Mantle) do nothing when it evolves a Benched Pokémon; Attract
// Energy works on any evolution from the hand. Their "may" is asked when the card is played (Manipulate's: by taking a Basic
// Pokémon from the discard pile or not). Streaming Mantle's basic Energy cards are the last 3 put in each discard pile (the
// player doesn't choose). Evolution Helper follows the usual evolving limits (not on the first turn, nor onto a Pokémon put
// into play this turn) but not Primal Aura's or Primal Stare's (it isn't played from the hand). Ancient Wind turns every
// Poké-Body off, both players', until the end of the turn. Good Neighbor is once a turn whichever Wigglytuff uses it.
// Investigate looks at the top 2 cards of a deck or the first 2 Prize cards of a player. Psychoflow and Slippery Skin make
// the printed Retreat Cost 0; other changes (Gluey Slime) still apply. Dark Gaze stops Benched Pokémon's Poké-Powers and
// the older Pokémon Powers, both players', as Dark Impact does.
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { evolvesOnto, isEnergyCardOf, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { ownTargets, pokemonAt, powerActive, type PowerChoiceSpec, type PowerContext, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, effectId, inPlayDef, pokemonName } from '../status.js';
import { conditionProof, isPokemonCard, type PokemonCardDef } from '../cards.js';
import type { GameState } from '../engine.js';
import { afflict, crystalType, pureBody } from './ecard2-powers.js';
import { powerEffect } from './index.js';

/** A Poké-Body: always on, whatever its Pokémon's Special Conditions. */
const POKE_BODY = { ignoresConditions: true, body: true } as const;

const onlyActive = (s: PowerSituation, name: string) => (s.source === 'active' ? null : `${name} must be your Active Pokémon`);
const onlyBenched = (s: PowerSituation, name: string) => (s.source !== 'active' ? null : `${name} must be on your Bench`);

/** Energy cards attached to a Pokémon (not a Pokémon attached as Energy). */
const energyCards = (p: InPlayPokemon) => p.energy.filter((e) => !e.provides);

/** The other player in a game. */
const opponentOf = (state: GameState, owner: PlayerState) => state.playerOrder.map((id) => state.players[id]!).find((p) => p !== owner)!;

/** "When you play X from your hand to evolve your Active Pokémon": only when it's the Active Pokémon. */
const evolvedActive = (owner: PlayerState, pokemon: InPlayPokemon) => owner.active === pokemon;

/**
 * The opponent's Pokémon `p` is now `condition`, unless it can't be affected by Special Conditions (Clefairy Doll, Buried
 * Fossil, Thick Skinned, Pollen Shield) or a battle rule guards it.
 */
function inflictOn(state: GameState, owner: PlayerState, p: InPlayPokemon, condition: 'paralyzed' | 'poisoned' | 'confused') {
  const name = pokemonName(state, p);
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const thickSkinned = powerActive(p, state.cards, sides) && powerEffect(effectId(p))?.noConditions;
  const shielded = (p.effects?.pollenShield ?? -1) >= state.turn || (p.effects?.conditionProof ?? -1) >= state.turn || (p.effects?.flashTouch && owner.active === p);
  if (conditionProof(inPlayDef(state.cards, p)) || thickSkinned || shielded) return addLog(state, `${name} can't be affected by Special Conditions.`, owner.id);
  if (condition === 'poisoned' && powerActive(p, state.cards, sides) && powerEffect(effectId(p))?.noPoison) return addLog(state, `${name} can't be Poisoned.`, owner.id);
  const guard = state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === owner.id && r.conditions.includes(condition));
  if (guard) return addLog(state, `${guard.label ?? 'A battle rule'} protected ${name} from that.`, owner.id);
  if (condition === 'poisoned') p.poison = Math.max(p.poison ?? 0, 10);
  else {
    p.condition = condition;
    if (condition === 'paralyzed') p.paralyzedTurn = state.turn;
  }
  addLog(state, `${name} is now ${{ paralyzed: 'Paralyzed', poisoned: 'Poisoned', confused: 'Confused' }[condition]}.`, owner.id);
}

/** Self-healing: a `type` Energy card attached from the hand removes every Special Condition from it. */
const selfHealing = (type: EnergyType): PowerEffect => ({
  ...POKE_BODY,
  onEnergyFromHand(state, owner, pokemon, _target, energy) {
    if (!isEnergyCardOf(energy, state.cards, type) || (!pokemon.condition && !pokemon.poison && !pokemon.burned)) return;
    pokemon.condition = null;
    pokemon.poison = 0;
    pokemon.burned = false;
    delete pokemon.paralyzedTurn;
    addLog(state, `Self-healing: ${pokemonName(state, pokemon)} is no longer affected by Special Conditions.`, owner.id);
  },
});

/** Psychoflow, Slippery Skin: its printed Retreat Cost is 0 while `zero` says so. */
const freeRetreat = (zero: (p: InPlayPokemon, cards: Parameters<NonNullable<PowerEffect['retreatChange']>>[1], opp?: Pick<PlayerState, 'active' | 'bench'>) => boolean): PowerEffect => ({
  ...POKE_BODY,
  retreatChange: (p, cards, _owner, opp) => (zero(p, cards, opp) ? -(inPlayDef(cards, p).retreatCost ?? 0) : 0),
});

/** Cards in the deck that can evolve the player's Active Pokémon (Evolution Helper). */
const evolutionsFor = (cards: Parameters<typeof lookupCard>[0], deck: PlayerState['deck'], active: InPlayPokemon) =>
  deck.filter((c) => {
    const d = lookupCard(cards, c.defId);
    return isPokemonCard(d) && d.kind === 'pokemon' && evolvesOnto(d as PokemonCardDef, lookupCard(cards, active.card.defId));
  });

/** Which pile Investigate looks at, by Peek's names. */
const INVESTIGATE: Record<'deck' | 'oppDeck' | 'prize' | 'oppPrize', { own: boolean; prizes: boolean }> = {
  deck: { own: true, prizes: false },
  oppDeck: { own: false, prizes: false },
  prize: { own: true, prizes: true },
  oppPrize: { own: false, prizes: true },
};

export const ECARD3_POWERS: Record<string, PowerEffect> = {
  // Aerodactyl – Ancient Wind: as the Active Pokémon, every Poké-Body is ignored until the end of the turn.
  'ecard3-1': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Aerodactyl'),
    use(ctx) {
      ctx.me.bodiesOffTurn = ctx.state.turn;
      ctx.opp.bodiesOffTurn = ctx.state.turn;
      ctx.log('Ancient Wind: every Poké-Body is ignored until the end of the turn.');
    },
  },

  // Alakazam – Energy Jump: an Energy card from one of the player's Pokémon to another.
  'ecard3-2': {
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).length < 2 ? 'You have no other Pokémon to move Energy to' : ownTargets(s.me).some((t) => energyCards(pokemonAt(s.me, t)!).length) ? null : 'None of your Pokémon has an Energy card attached'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => energyCards(pokemonAt(s.me, t)!).length), prompt: 'Choose one of your Pokémon to move an Energy card from' }];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: energyCards(pokemonAt(s.me, c.from)!), prompt: 'Choose the Energy card to move' },
        { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Arcanine – Energy Recharge: evolving the Active Pokémon from the hand, may flip 3 coins; a basic Energy card from the discard pile for each heads.
  'ecard3-3': {
    onPlayFromHand(state, owner, arcanine) {
      if (!evolvedActive(owner, arcanine) || !owner.discard.some((c) => isBasicEnergy(lookupCard(state.cards, c.defId)))) return;
      state.pendingChoice = { player: owner.id, source: 'Energy Recharge', kind: 'mayUse', power: 'energyRecharge', target: 'active' };
    },
  },

  // Articuno – Water Immunity: no Water Energy cards from the hand.
  'ecard3-4': { ...POKE_BODY, antiAttach: 'water' },

  // Beedrill – Venom Spray: evolving the Active Pokémon from the hand, the Defending Pokémon is now Paralyzed and Poisoned.
  'ecard3-5': {
    onPlayFromHand(state, owner, beedrill) {
      const opp = opponentOf(state, owner);
      if (!evolvedActive(owner, beedrill) || !opp.active) return;
      inflictOn(state, opp, opp.active, 'paralyzed');
      inflictOn(state, opp, opp.active, 'poisoned');
    },
  },

  // Crobat – Carry Off: once a turn, flip; heads, a Baby, Basic or Evolution card from the opponent's hand into their deck.
  'ecard3-6': {
    oncePerTurn: true,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Carry Off did nothing.');
      ctx.pend({ kind: 'oppHandTrainer', source: 'Carry Off', filter: 'pokemon' });
    },
  },

  // Flareon – Self-healing (Fire).
  'ecard3-8': selfHealing('fire'),

  // Gengar – Manipulate: evolving the Active Pokémon from the hand, a Basic Pokémon (not a Baby) from the discard pile onto the Bench; 3 coins, a basic Energy card from the discard pile to it for each heads.
  'ecard3-10': {
    onPlayFromHand(state, owner, gengar) {
      if (!evolvedActive(owner, gengar)) return;
      const fits = owner.discard.some((c) => {
        const d = lookupCard(state.cards, c.defId);
        return d.kind === 'pokemon' && d.stage === 'basic' && !d.baby && !d.trainerText;
      });
      if (fits && owner.bench.some((p) => !p)) state.pendingChoice = { player: owner.id, source: 'Manipulate', kind: 'discardToBench', filter: 'basicNotBaby', manipulate: true };
    },
  },

  // Gyarados – Flame Vapor: evolving the Active Pokémon from the hand, may flip 2 coins; an Energy card discarded from the Defending Pokémon for each heads.
  'ecard3-11': {
    onPlayFromHand(state, owner, gyarados) {
      const opp = opponentOf(state, owner);
      if (!evolvedActive(owner, gyarados) || !opp.active || !energyCards(opp.active).length) return;
      state.pendingChoice = { player: owner.id, source: 'Flame Vapor', kind: 'mayUse', power: 'flameVapor', target: 'active' };
    },
  },

  // Jolteon – Self-healing (Lightning).
  'ecard3-13': selfHealing('lightning'),

  // Kabutops – Primal Aura: as the Active Pokémon, no Evolution cards from the hand onto Benched Pokémon (primalBlock).
  'ecard3-14': { ...POKE_BODY, primalAura: true },

  // Machamp – Immunity: the opponent's attacks do nothing to it but damage (as Crystal Body).
  'ecard3-16': { ...POKE_BODY, crystalBody: true },

  // Magcargo – Streaming Mantle: evolving the Active Pokémon from the hand, may discard the top 3 cards and shuffle 3 basic Energy cards from the discard pile into the deck; the opponent does the same.
  'ecard3-18': {
    onPlayFromHand(state, owner, magcargo) {
      if (!evolvedActive(owner, magcargo)) return;
      state.pendingChoice = { player: owner.id, source: 'Streaming Mantle', kind: 'mayUse', power: 'streamingMantle', target: 'active' };
    },
  },

  // Magneton – Attract Energy: evolving any of the player's Pokémon from the hand, any number of basic Energy cards from their other Pokémon to it.
  'ecard3-19': {
    onPlayFromHand(state, owner, magneton) {
      const target: Target = owner.active === magneton ? 'active' : owner.bench.indexOf(magneton);
      if (target === -1) return;
      const others = [owner.active, ...owner.bench].some((p) => p && p !== magneton && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId))));
      if (others) state.pendingChoice = { player: owner.id, source: 'Attract Energy', kind: 'moveAttached', target };
    },
  },

  // Moltres – Fire Immunity: no Fire Energy cards from the hand.
  'ecard3-21': { ...POKE_BODY, antiAttach: 'fire' },

  // Nidoqueen – Evolution Helper: once a turn, from the Bench, the Active Pokémon evolves with a card from the deck.
  'ecard3-22': {
    oncePerTurn: true,
    blocked(s) {
      const bench = onlyBenched(s, 'Nidoqueen');
      if (bench) return bench;
      const active = s.me.active;
      if (!active) return 'You have no Active Pokémon';
      if (s.turn <= 2) return "You can't evolve on your first turn";
      if (active.playedTurn === s.turn) return `${inPlayDef(s.cards, active).name} was played or evolved this turn`;
      return s.counts.deck ? null : 'Your deck is empty';
    },
    use(ctx) {
      const active = ctx.me.active!;
      const names = [...new Set(evolutionsFor(ctx.state.cards, ctx.me.deck, active).map((c) => lookupCard(ctx.state.cards, c.defId).name))];
      if (!names.length) {
        ctx.log('Evolution Helper: no card in the deck evolves from the Active Pokémon.');
        return;
      }
      ctx.pend({ kind: 'evolveFromDeck', source: 'Evolution Helper', target: 'active', names });
    },
  },

  // Omastar – Primal Stare: as the Active Pokémon, the opponent can't play Evolution cards from the hand onto their Active Pokémon (primalBlock).
  'ecard3-23': { ...POKE_BODY, primalStare: true },

  // Poliwrath – Strange Spiral: once a turn, as the Active Pokémon, discard a basic Energy card from it; the Defending Pokémon is now Confused.
  'ecard3-26': {
    oncePerTurn: true,
    blocked(s) {
      const active = onlyActive(s, 'Poliwrath');
      if (active) return active;
      if (!s.opp.active) return 'Your opponent has no Active Pokémon';
      return pokemonAt(s.me, 'active')!.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId))) ? null : 'Poliwrath has no basic Energy cards attached';
    },
    choices: (s) => [{ kind: 'attachedEnergy', field: 'energyUid', options: pokemonAt(s.me, 'active')!.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId))), prompt: 'Choose a basic Energy card to discard from Poliwrath' }],
    use(ctx) {
      const energy = ctx.source.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      ctx.source.energy = ctx.source.energy.filter((e) => e !== energy);
      ctx.me.discard.push(energy);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, energy.defId).name} from Poliwrath.`);
      inflictOn(ctx.state, ctx.opp, ctx.opp.active!, 'confused');
    },
  },

  // Raikou – Pure Body (Lightning).
  'ecard3-28': pureBody('lightning'),

  // Steelix – Rare Metal: each basic Energy card attached provides Metal Energy.
  'ecard3-31': { ...POKE_BODY, basicEnergyAs: 'metal' },

  // Umbreon – Dark Gaze: as the Active Pokémon, Benched Pokémon (both players') can't use Poké-Powers (darkGazed).
  'ecard3-32': { ...POKE_BODY, darkGaze: true },

  // Vaporeon – Self-healing (Water).
  'ecard3-33': selfHealing('water'),

  // Wigglytuff – Good Neighbor: once a turn (whichever Wigglytuff), from the Bench, flip; heads, 2 damage counters off each Active Pokémon.
  'ecard3-34': {
    blocked: (s) => onlyBenched(s, 'Wigglytuff') ?? (s.me.goodNeighborTurn === s.turn ? 'Good Neighbor has already been used this turn' : null),
    use(ctx) {
      ctx.me.goodNeighborTurn = ctx.state.turn;
      if (!ctx.flip()) return ctx.log('Good Neighbor did nothing.');
      for (const side of [ctx.me, ctx.opp]) {
        const p = side.active;
        const healed = p ? Math.min(20, p.damage) : 0;
        if (!p || !healed) continue;
        p.damage -= healed;
        addLog(ctx.state, `Good Neighbor: ${pokemonName(ctx.state, p)} healed ${healed} damage.`, side.id);
      }
    },
  },

  // Xatu – Synchronicity: any Technical Machine can be attached to it.
  'ecard3-35': { ...POKE_BODY, synchronicity: true },

  // Kabuto – Thick Shell: 10 less attack damage from Evolved Pokémon.
  'ecard3-37': { ...POKE_BODY, evolvedGuard: 10 },

  // Noctowl – Investigate: once a turn, the top 2 cards of either deck, or 2 of either player's Prize cards.
  'ecard3-40': {
    oncePerTurn: true,
    choices(s) {
      const sizes = { deck: s.counts.deck, oppDeck: s.counts.oppDeck, prize: s.counts.prizes, oppPrize: s.counts.oppPrizes };
      return [{ kind: 'peek', field: 'peek', options: (Object.keys(sizes) as (keyof typeof sizes)[]).filter((k) => sizes[k] > 0), prompt: 'Look at the top 2 cards of a deck, or 2 Prize cards' }];
    },
    use(ctx) {
      const what = INVESTIGATE[ctx.choices.peek as keyof typeof INVESTIGATE];
      ctx.pend({ kind: 'lookOppDeck', source: 'Investigate', count: 2, ...(what.own && { own: true }), ...(what.prizes && { prizes: true }) });
    },
  },

  // Wobbuffet – Mirror Coat: Poisoned or Burned by the opponent's attack, the attacker is affected the same way (attacks.ts).
  'ecard3-45': { ...POKE_BODY, mirrorCoat: true },

  // Abra – Psychoflow: Retreat Cost 0 with a Psychic Energy card attached.
  'ecard3-46': freeRetreat((p, cards) => p.energy.some((e) => isEnergyCardOf(e, cards, 'psychic'))),

  // Buried Fossil – Reconstruction: with a basic Energy card in the hand, an Omanyte or Kabuto from the deck into the hand; then a basic Energy card from the hand into the deck.
  'ecard3-47': {
    oncePerTurn: true,
    blocked: (s) => (!s.me.hand.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? 'No basic Energy cards in your hand' : s.counts.deck ? null : 'Your deck is empty'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId))), prompt: 'Choose the basic Energy card to put into your deck afterwards' }],
    use(ctx) {
      ctx.pend({ kind: 'pickFromDeck', source: 'Reconstruction', filter: 'named', name: ['Omanyte', 'Kabuto'], reveal: true, optional: true, tradeAway: [ctx.choices.cardUid!] });
    },
  },

  // Ditto – Prismatic Body: each basic Energy card attached provides every type, 1 at a time.
  'ecard3-51': { ...POKE_BODY, basicEnergyAs: 'any' },

  // Dunsparce – Slippery Skin: Retreat Cost 0 while the Defending Pokémon is an Evolved Pokémon.
  'ecard3-53': freeRetreat((_p, _cards, opp) => !!opp?.active?.evolvedFrom.length),

  // Forretress – Exoskeleton: 10 less attack damage.
  'ecard3-56': { ...POKE_BODY, damageReduction: 10 },

  // Kakuna – Exoskeleton: 10 less attack damage.
  'ecard3-70': { ...POKE_BODY, damageReduction: 10 },

  // Shuckle – Vase Body: 20 less attack damage.
  'ecard3-96': { ...POKE_BODY, damageReduction: 20 },

  // Snorlax – Lolling About: once a turn, as the Active Pokémon, a damage counter off Snorlax; it's now Asleep.
  'ecard3-100': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Snorlax'),
    use(ctx: PowerContext) {
      if (ctx.source.damage) {
        ctx.source.damage -= 10;
        ctx.log('Lolling About: removed a damage counter from Snorlax.');
      }
      afflict(ctx, ctx.me, ctx.source, 'asleep');
    },
  },

  // Celebi, Charizard, Crobat, Golem, Ho-oh, Kabutops – Crystal Type.
  'ecard3-145': crystalType(['grass', 'water', 'psychic']),
  'ecard3-146': crystalType(['fire', 'lightning', 'fighting']),
  'ecard3-147': crystalType(['grass', 'fire', 'psychic']),
  'ecard3-148': crystalType(['grass', 'fire', 'fighting']),
  'ecard3-149': crystalType(['fire', 'water', 'lightning']),
  'ecard3-150': crystalType(['water', 'lightning', 'fighting']),
};
