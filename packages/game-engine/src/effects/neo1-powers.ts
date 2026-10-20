// Neo Genesis (neo1) Pokémon Powers, by card id. `text` has the printed wording where TCGdex's differs (Downpour drops
// its Water symbol and misspells Feraligatr).
// Rulings (agreed): Mind Games asks Slowking's owner each time the opponent plays a Trainer card (Stadiums and Pokémon
// Tools too), like Bench Guard, and the CPU always flips; several Slowkings give a flip each, until one is heads
// (playTrainer, mindGamesFlips). Wild Growth doesn't stack (refreshWildGrowth). Final Blow and Hydroelectric Power are
// asked before the attack each time they'd apply (the attack's `boost` question, in neo1.ts).
// Rulings (from the text): Berserk, Herbal Scent and Fire Boost work when the card is played from the hand (evolving,
// or with Pokémon Breeder); Herbal Scent and Fire Boost ask whether to flip ("you may"), Berserk always flips. Herbal Scent
// heals every Grass Pokémon in play, both players'. Playful Punch ends the turn whatever the flip; its 20 damage gets
// Weakness and Resistance (it's not an attack, so nothing else changes it).
import { applyWeaknessResistance } from '../attacks.js';
import { isBasicEnergy, lookupCard, type CardLibrary } from '../cards.js';
import type { CardInstance, GameState, PlayerState } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, flipCoin, inPlayDef, pokemonName } from '../status.js';
import type { PendingChoice, PendingChoiceInput } from '../trainers.js';

const isBasicOf = (cards: CardLibrary, c: CardInstance, type: 'fire' | 'water') => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'energy' && d.energyType === type && isBasicEnergy(d);
};

const pend = (state: GameState, owner: PlayerState, choice: PendingChoiceInput) => {
  state.pendingChoice = { ...choice, player: owner.id } as PendingChoice;
};

/** Discards the top `n` cards of `player`'s deck. */
function discardTop(state: GameState, player: PlayerState, n: number) {
  const gone = player.deck.splice(0, n);
  player.discard.push(...gone);
  addLog(state, `Berserk: discarded the top ${gone.length} card${gone.length === 1 ? '' : 's'} of the deck.`, player.id);
}

/** The player's Fire Pokémon in play. */
const firePokemon = (s: PowerSituation) => ownTargets(s.me).filter((t) => inPlayDef(s.cards, pokemonAt(s.me, t)!).type === 'fire');

export const NEO1_POWERS: Record<string, PowerEffect> = {
  // Feraligatr – Berserk: when played from the hand, flip; heads discards the top 5 cards of the opponent's deck, tails the top 5 of its owner's.
  'neo1-4': {
    onPlayFromHand(state, owner) {
      const opp = Object.values(state.players).find((p) => p !== owner)!;
      discardTop(state, flipCoin(state, 'Berserk', owner.id) ? opp : owner, 5);
    },
  },

  // Feraligatr – Downpour: as often as you like during your turn, discard a Water Energy card from your hand.
  'neo1-5': {
    text: "As often as you like during your turn (before your attack), you may discard a Water Energy card from your hand. This power can't be used if Feraligatr is Asleep, Confused, or Paralyzed.",
    blocked: (s) => (s.me.hand.some((c) => isBasicOf(s.cards, c, 'water')) ? null : 'No Water Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => isBasicOf(s.cards, c, 'water')), prompt: 'Choose a Water Energy card to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid)!;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name}.`);
    },
  },

  // Heracross – Final Blow: with 20 HP or less left, Megahorn's base damage may be 120 (asked by Megahorn, neo1.ts).
  'neo1-6': {},

  // Meganium – Herbal Scent: when played from the hand, you may flip; heads removes all damage counters from every Grass Pokémon in play.
  'neo1-10': {
    onPlayFromHand(state, owner, meganium) {
      const target = owner.active === meganium ? 'active' : owner.bench.indexOf(meganium);
      if (target === -1) return;
      pend(state, owner, { source: 'Herbal Scent', kind: 'mayFlip', power: 'herbalScent', target });
    },
  },

  // Meganium – Wild Growth: each Grass Energy card attached to your Grass Pokémon provides 2 Grass Energy (refreshWildGrowth, energyPool).
  'neo1-11': { wildGrowth: true },

  // Slowking – Mind Games: whenever the opponent plays a Trainer card, you may flip; heads, it does nothing and goes on top of their deck (playTrainer).
  'neo1-14': { mindGames: true },

  // Typhlosion – Fire Recharge: once during your turn, flip; heads attaches a Fire Energy card from your discard pile to 1 of your Fire Pokémon.
  'neo1-17': {
    oncePerTurn: true,
    blocked(s) {
      if (!s.me.discard.some((c) => isBasicOf(s.cards, c, 'fire'))) return 'No Fire Energy cards in your discard pile';
      return firePokemon(s).length ? null : 'No Fire Pokémon to attach to';
    },
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: firePokemon(s), prompt: 'Choose a Fire Pokémon to attach a Fire Energy card to (if heads)' }],
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Fire Recharge did nothing.');
      const energy = ctx.me.discard.find((c) => isBasicOf(ctx.state.cards, c, 'fire'));
      const to = pokemonAt(ctx.me, ctx.choices.to!);
      if (!energy || !to) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== energy);
      to.energy.push(energy);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, energy.defId).name} from the discard pile to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Typhlosion – Fire Boost: when played from the hand, you may flip; heads attaches up to 4 Fire Energy cards from your deck to it.
  'neo1-18': {
    onPlayFromHand(state, owner, typhlosion) {
      const target = owner.active === typhlosion ? 'active' : owner.bench.indexOf(typhlosion);
      if (target === -1) return;
      pend(state, owner, { source: 'Fire Boost', kind: 'mayFlip', power: 'fireBoost', target });
    },
  },

  // Elekid – Playful Punch: once during your turn, flip; heads does 20 damage to the opponent's Active Pokémon (Weakness and Resistance apply). Either way, the turn ends.
  'neo1-22': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      const defender = ctx.opp.active!;
      if (ctx.flip()) {
        const damage = applyWeaknessResistance(20, inPlayDef(ctx.state.cards, ctx.source).type, inPlayDef(ctx.state.cards, defender), defender.effects);
        defender.damage += damage;
        ctx.log(`Playful Punch did ${damage} damage to ${pokemonName(ctx.state, defender)}.`);
      } else ctx.log('Playful Punch did nothing.');
      ctx.state.endTurnNow = true;
    },
  },

  // Lanturn – Hydroelectric Power: Floodlight may do 10 more for each Water Energy attached but not used for its cost (asked by Floodlight, neo1.ts).
  'neo1-38': {},

  // Noctowl – Glaring Gaze: once during your turn, flip; heads looks at the opponent's hand, and they shuffle a Trainer card from it (your pick) into their deck.
  'neo1-42': {
    oncePerTurn: true,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Glaring Gaze did nothing.');
      ctx.pend({ kind: 'oppHandTrainer', source: 'Glaring Gaze' });
    },
  },
};
