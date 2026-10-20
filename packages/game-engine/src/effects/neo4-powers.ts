// Neo Destiny (neo4) Pokémon Powers, by card id. `text` and `name` have the printed wording where TCGdex's is missing or
// garbled (Light Piloswine's Fluffy Wool and Unown P's [Perform] have neither there; Light Machamp's Tag Team loses words).
// Rulings (from the text): Conductivity works on every Energy card the opponent attaches from their hand (Rain Dance too),
// and stops while its owner has more than 1 Dark Ampharos in play. Scare stops the opponent's Baby Pokémon's powers and
// attacks while Dark Feraligatr is the Active Pokémon. Deep Sleep: an Asleep Pokémon wakes up between turns only on 2 heads,
// while any Dark Gengar's works. Surprise Bite, Gift, Tag Team and [Vanish] work when the card is played from the hand
// (evolving, or onto the Bench); Surprise Bite and [Vanish] may be passed up. Gift asks the opponent first. Drive Off is used
// only by the Active Light Arcanine; the opponent picks the Pokémon that comes in. Miraculous Wind makes each Special Energy
// card in play provide Colorless Energy (as much as it usually provides) and stops its other effects (refreshWind). Hot Plate
// hits Baby and Basic Pokémon put onto either player's Bench from the hand. Fluffy Wool works when an opponent's attack
// damages the Active Light Piloswine, even if it's Knocked Out. Cunning shows the top card of the opponent's deck, then asks
// whether they shuffle. [Give], [Help] and [Want] need their 4 Unown on the Bench; [Quicken] is once a turn for its player
// however many Unown Q they have, and covers every one of their Unown through the opponent's next turn; [XXXXX] adds to every
// Hidden Power of its player's, flipping once per attack; [Zoom] makes an Unown's retreat cost 0. Unown G, H, L, P, Q, S, T and
// W's powers work while Asleep, Confused or Paralyzed, as printed; [Perform] only matters while Unown P can attack.
import { lookupCard } from '../cards.js';
import { activeLock, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { pokemonTower, swapActive, type PendingChoice } from '../trainers.js';
import { trainerEffect } from './index.js';

/** The Pokémon's target among its owner's Pokémon in play. */
const targetOf = (owner: { active: unknown; bench: unknown[] }, pokemon: unknown): Target | -1 => (owner.active === pokemon ? 'active' : owner.bench.indexOf(pokemon));

/** Whether every one of the Unown `letters` is on the player's Bench ([Give], [Help], [Want]). */
const unownOnBench = (s: Pick<PowerSituation, 'me' | 'cards'>, letters: string) => {
  const benched = s.me.bench.flatMap((p) => (p ? [inPlayDef(s.cards, p).name] : []));
  return [...letters].every((l) => benched.includes(`Unown [${l}]`));
};

/** "Once during your turn, if you have Unown … on your Bench": the power's blocked check. */
const needsUnown = (letters: string) => (s: PowerSituation) => (unownOnBench(s, letters) ? null : `You need Unown ${[...letters].join(', ')} on your Bench`);

/** Stadium cards in the player's discard pile (Spatial Distortion). */
const stadiumsInDiscard = (s: Pick<PowerSituation, 'me' | 'cards'>) => s.me.discard.filter((c) => lookupCard(s.cards, c.defId).kind === 'trainer' && !!trainerEffect(c.defId)?.stadium);

export const NEO4_POWERS: Record<string, PowerEffect> = {
  // Dark Ampharos – Conductivity: 10 damage to each Pokémon the opponent attaches an Energy card to from their hand (energyFromHand).
  'neo4-1': {
    text: "Whenever your opponent attaches an Energy card from his or her hand to a Pokémon, this power does 10 damage to that Pokémon. (Don't apply Weakness and Resistance.) This power stops working if you have more than 1 Dark Ampharos in play or while Dark Ampharos is Asleep, Confused, or Paralyzed.",
    conductivity: true,
  },

  // Dark Crobat – Surprise Bite: when played from the hand, you may choose 1 of the opponent's Pokémon: 20 damage (no Weakness or Resistance).
  'neo4-2': {
    onPlayFromHand(state, owner, crobat) {
      state.pendingChoice = { player: owner.id, source: 'Surprise Bite', kind: 'powerDamage', amount: 20, type: inPlayDef(state.cards, crobat).type, noWeakness: true };
    },
  },

  // Dark Feraligatr – Scare: as the Active Pokémon, the opponent's Baby Pokémon's powers stop working and they can't attack (scaredBy).
  'neo4-5': { scare: true },

  // Dark Gengar – Deep Sleep: an Asleep Pokémon wakes up between turns only on 2 heads (betweenTurns).
  'neo4-6': { deepSleep: true },

  // Dark Porygon2 – Spatial Distortion: once during your turn, flip; heads puts a Stadium card from your discard pile into play.
  'neo4-8': {
    oncePerTurn: true,
    blocked(s) {
      if (!stadiumsInDiscard(s).length) return 'No Stadium cards in your discard pile';
      return discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : null;
    },
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Spatial Distortion did nothing.');
      ctx.pend({ kind: 'stadiumFromDiscard', source: 'Spatial Distortion' });
    },
  },

  // Light Arcanine – Drive Off: as the Active Pokémon, once during your turn, the opponent switches their Active Pokémon with a benched one (their pick).
  'neo4-12': {
    oncePerTurn: true,
    blocked(s) {
      if (s.source !== 'active') return 'Light Arcanine must be your Active Pokémon';
      if (!s.opp.bench.some(Boolean)) return 'Your opponent has no Benched Pokémon';
      return activeLock(s.opp, [s.me, s.opp], s.cards);
    },
    use(ctx) {
      const slots = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (slots.length === 1) return swapActive(ctx.state, ctx.opp, slots[0]!);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Drive Off', kind: 'switchIn' };
    },
  },

  // Light Dragonite – Miraculous Wind: as the Active Pokémon, Special Energy cards provide Colorless Energy only, with no other effects (refreshWind).
  'neo4-14': { miraculousWind: true },

  // Light Togetic – Gift: when played from the hand, the opponent, then you, may take a Pokémon Tool card from the deck (shown).
  'neo4-15': {
    onPlayFromHand(state, owner) {
      const opponent = state.playerOrder.find((id) => id !== owner.id)!;
      state.pendingChoice = { player: opponent, source: 'Gift', kind: 'pickFromDeck', filter: 'tool', optional: true, reveal: true, thenSame: owner.id };
    },
  },

  // Dark Magcargo – Hot Plate: as the Active Pokémon, 10 damage to each Baby or Basic Pokémon put onto a Bench from the hand (PLAY_BENCH).
  'neo4-18': { hotPlate: true },

  // Dark Slowking – Cunning: once during your turn, flip; heads, look at the top card of the opponent's deck, then you may have them shuffle.
  'neo4-20': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppDeck ? null : "Your opponent's deck is empty"),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Cunning did nothing.');
      ctx.state.peek = { player: ctx.me.id, card: ctx.opp.deck[0]!, label: "The top card of your opponent's deck" };
      ctx.log("Looked at the top card of the opponent's deck.");
      ctx.pend({ kind: 'cunning', source: 'Cunning' });
    },
  },

  // Light Machamp – Tag Team: when played from the hand onto a benched Pokémon, remove 3 damage counters from your Active Pokémon, then switch them.
  'neo4-25': {
    text: 'When you play Light Machamp from your hand, if it is on your Bench, remove 3 damage counters from your Active Pokémon. If it has fewer damage counters than that, remove all of them. Then, switch Light Machamp with your Active Pokémon.',
    onPlayFromHand(state, owner, machamp) {
      const slot = owner.bench.indexOf(machamp);
      const active = owner.active;
      if (slot < 0 || !active) return;
      const healed = Math.min(30, active.damage);
      active.damage -= healed;
      if (healed) addLog(state, `Tag Team: ${pokemonName(state, active)} healed ${healed} damage.`, owner.id);
      swapActive(state, owner, slot);
    },
  },

  // Light Piloswine – Fluffy Wool: when an opponent's attack damages it as the Active Pokémon (even a Knock Out), heads puts the attacker to sleep.
  'neo4-26': {
    name: 'Fluffy Wool',
    text: "During your opponent's turn, if Light Piloswine is your Active Pokémon and is damaged by your opponent's attack (even if it's Knocked Out), flip a coin. If heads, the attacking Pokémon is now Asleep. This power stops working if Light Piloswine is already Asleep, Confused, or Paralyzed when your opponent attacks.",
    onAttackDamage(ctx, piloswine) {
      if (ctx.opp.active !== piloswine || !ctx.oppFlip()) return;
      if (ctx.attacker.effects?.flashTouch) return ctx.log(`${ctx.attackerDef.name} can't be affected by Special Conditions.`);
      ctx.attacker.condition = 'asleep';
      delete ctx.attacker.paralyzedTurn;
      ctx.log(`Fluffy Wool: ${ctx.attackerDef.name} is now Asleep.`);
    },
  },

  // Unown G – [Give]: with Unown G, I, V and E on your Bench, once during your turn, flip; heads attaches a basic Energy card from the deck to 1 of your Pokémon.
  'neo4-27': {
    oncePerTurn: true,
    ignoresConditions: true,
    blocked: needsUnown('GIVE'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('[Give] did nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: '[Give]', filter: 'basicEnergy', attach: true });
    },
  },

  // Unown H – [Help]: with Unown H, E, L and P on your Bench, once during your turn, shuffle your hand into your deck and draw as many cards.
  'neo4-28': {
    oncePerTurn: true,
    ignoresConditions: true,
    blocked: needsUnown('HELP'),
    use(ctx) {
      const n = ctx.me.hand.length;
      [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand], ctx.state.rngState);
      ctx.me.hand = ctx.me.deck.splice(0, n);
      ctx.log(`Shuffled the hand into the deck and drew ${ctx.me.hand.length} cards.`);
    },
  },

  // Unown W – [Want]: with Unown W, A, N and T on your Bench, once during your turn, flip; heads puts a Trainer card from your discard pile into your hand.
  'neo4-29': {
    oncePerTurn: true,
    ignoresConditions: true,
    blocked(s) {
      const need = needsUnown('WANT')(s);
      if (need) return need;
      if (!s.me.discard.some((c) => lookupCard(s.cards, c.defId).kind === 'trainer')) return 'No Trainer cards in your discard pile';
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return null;
    },
    use(ctx) {
      if (!ctx.flip()) return ctx.log('[Want] did nothing.');
      if (pokemonTower({ stadium: ctx.state.stadium?.card, cards: ctx.state.cards })) return ctx.log('Pokémon Tower: cards in discard piles stay there.');
      ctx.pend({ kind: 'discardToHand', source: '[Want]', count: 1, filter: 'trainer' });
    },
  },

  // Unown X – [XXXXX]: your Hidden Power attacks flip until tails, 10 more each heads (Hidden Power, neo2.ts).
  'neo4-30': { xxxxx: true },

  // Unown C – [Chase]: as the Active Pokémon, a heads puts a damage counter on the opponent's Active Pokémon when it tries to retreat (RETREAT).
  'neo4-57': { chase: true },

  // Unown P – [Perform]: Hidden Power does as much more as an attack did to it as the Active Pokémon on the opponent's last turn.
  'neo4-58': {
    name: '[Perform]',
    text: "If an attack damaged Unown [P] during your opponent's last turn and Unown [P] was your Active Pokémon, Unown [P]'s Hidden Power attack does that much more damage to the Defending Pokémon. This power can be used even if Unown [P] is Confused.",
    perform: true,
    ignoresConditions: true,
  },

  // Unown Q – [Quicken]: once during your turn (one for all your Unown Q), flip; heads, attacks do nothing to your Pokémon with Unown in their names next turn.
  'neo4-59': {
    ignoresConditions: true,
    blocked: (s) => (s.me.quickenTurn === s.turn ? 'You already used [Quicken] this turn' : null),
    use(ctx) {
      ctx.me.quickenTurn = ctx.state.turn;
      if (!ctx.flip()) return ctx.log('[Quicken] did nothing.');
      ctx.me.quickenUntil = ctx.state.turn + 1;
      ctx.log('Attacks do nothing to your Pokémon with Unown in their names next turn.');
    },
  },

  // Unown Z – [Zoom]: while it's benched, your Pokémon with Unown in their names retreat for free (retreatCost).
  'neo4-60': { zoom: true },

  // Unown L – [Laugh]: once during your turn, flip; heads, each player shuffles their deck.
  'neo4-86': {
    oncePerTurn: true,
    ignoresConditions: true,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('[Laugh] did nothing.');
      for (const p of [ctx.me, ctx.opp]) [p.deck, ctx.state.rngState] = shuffle(p.deck, ctx.state.rngState);
      ctx.log('Each player shuffled their deck.');
    },
  },

  // Unown S – [Search]: once during your turn, look at 1 of your Prize cards.
  'neo4-87': {
    oncePerTurn: true,
    ignoresConditions: true,
    blocked: (s) => (s.counts.prizes ? null : 'You have no Prize cards'),
    choices: (s) => [{ kind: 'prize', field: 'prize', options: Array.from({ length: s.counts.prizes }, (_, i) => i), prompt: 'Which Prize card' }],
    use(ctx) {
      const i = ctx.choices.prize!;
      ctx.state.peek = { player: ctx.me.id, card: ctx.me.prizes[i]!, label: `Prize ${i + 1}` };
      ctx.log(`Looked at Prize ${i + 1}.`);
    },
  },

  // Unown T – [Tell]: once during your turn, flip; heads, look at the opponent's hand and show yours to them.
  'neo4-88': {
    oncePerTurn: true,
    ignoresConditions: true,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('[Tell] did nothing.');
      ctx.pend({ kind: 'lookOppHand', source: '[Tell]' });
      (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: '[Tell]', kind: 'lookOppHand' } as PendingChoice);
    },
  },

  // Unown V – [Vanish]: when played from the hand, you may flip; heads returns 1 of your other Unown to your hand (its cards discarded).
  'neo4-89': {
    onPlayFromHand(state, owner, unown) {
      const target = targetOf(owner, unown);
      const others = ownTargets(owner).some((t) => {
        const p = pokemonAt(owner, t)!;
        return p !== unown && inPlayDef(state.cards, p).name.includes('Unown') && inPlayDef(state.cards, p).name !== 'Unown [V]';
      });
      if (target === -1 || !others) return;
      state.pendingChoice = { player: owner.id, source: '[Vanish]', kind: 'mayFlip', power: 'vanish', target };
    },
  },
};

