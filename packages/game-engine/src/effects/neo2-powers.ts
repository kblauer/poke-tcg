// Neo Discovery (neo2) Pokémon Powers, by card id. `text` and `name` have the printed wording where TCGdex's is missing
// or differs (Unown M, N and I have neither there; Unown D's drops its Darkness symbol; the Unowns' names lose their
// brackets; Energy Evolution leaves out the attaching).
// Rulings (agreed): Energy Evolution works whenever its owner attaches an Energy card to Eevee, from the hand or by any
// effect (a move from another Pokémon too), even on the first turn or the turn Eevee was played; Rainbow Energy lets it
// evolve into any card that evolves from Eevee. It flips once for each Energy card attached, until it evolves (engine.ts).
// Rulings (from the text): Spikes hits each of the opponent's benched Pokémon that becomes their Active Pokémon during
// their own turn (retreating, Switch, a promotion after a Knock Out on their turn), not a promotion between turns
// (engine.ts, newActives). Frog Song adds its 40 once, after Weakness and Resistance. Unown D, M and N reduce attack
// damage to any of their owner's Pokémon, while they're the only one of their name in play; they work while Asleep,
// Confused or Paralyzed. Anger, with more than one Unown A in play, counts the one with the most damage counters.
// Revive Friends and Fossil put a Stage 1 card onto the Bench as a Basic Pokémon (it can then evolve as usual).
// Engage asks the opponent first, then the Unown's owner (the CPU takes a new hand only when it holds fewer than 4 cards).
// Gaze switches the power off until the end of the turn, or until that Pokémon leaves the Bench.
import { activeLock, type CardInstance } from '../engine.js';
import type { PowerEffect, PowerSituation } from '../powers.js';
import { inPlayDef, openBenchSlot } from '../status.js';
import { withNonHolo } from './neo2-prints.js';

/** Whether every one of `names` is on the player's Bench (Find, Undo). */
const onBench = (s: Pick<PowerSituation, 'me' | 'cards'>, names: string[]) => {
  const benched = s.me.bench.flatMap((p) => (p ? [inPlayDef(s.cards, p).name] : []));
  return names.every((name) => benched.includes(name));
};

const benchFull = (s: PowerSituation) => (openBenchSlot(s.me.bench, s.cards) < 0 ? 'Your Bench is full' : null);

/** Pokémon Gaze can choose: the opponent's benched Pokémon with a Pokémon Power. */
const gazeTargets = (s: PowerSituation) => s.opp.bench.flatMap((p, i) => (p && inPlayDef(s.cards, p).power ? [i] : []));

const NEO2_HOLO_POWERS: Record<string, PowerEffect> = {
  // Forretress – Spikes: 10 damage to each of the opponent's benched Pokémon that becomes their Active Pokémon during their turn.
  'neo2-2': { spikes: true },
  // Politoed – Frog Song: 40 more damage while more than 3 Poliwag line Pokémon are in play (attacks.ts).
  'neo2-8': { frogSong: true },
  // Unown A – Anger: Hidden Power does 10 more for each damage counter on it (Hidden Power, in neo2.ts).
  'neo2-14': { anger: true },
};

export const NEO2_POWERS: Record<string, PowerEffect> = {
  ...withNonHolo(NEO2_HOLO_POWERS),
  // Eevee – Energy Evolution: attaching an Energy card to it, heads evolves it from the deck into that type (engine.ts).
  'neo2-38': {
    text: 'Whenever you attach an Energy card to Eevee, flip a coin. If heads, search your deck for a card that evolves from Eevee that is the same type as the Energy card you attached to Eevee. Attach that card to Eevee. This counts as evolving Eevee. Shuffle your deck afterward. This power can\'t be used if Eevee is Asleep, Confused, or Paralyzed.',
    energyEvolution: true,
  },
  // Igglybuff – Gaze: once during your turn, one of the opponent's benched Pokémon with a power: it stops working this turn.
  'neo2-40': {
    oncePerTurn: true,
    blocked: (s) => (gazeTargets(s).length ? null : "Your opponent has no benched Pokémon with a Pokémon Power"),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppFrom', options: gazeTargets(s), prompt: "Choose one of your opponent's benched Pokémon: its power stops working this turn" }],
    use(ctx) {
      const target = typeof ctx.choices.oppFrom === 'number' ? ctx.opp.bench[ctx.choices.oppFrom] : null;
      if (!target) return;
      target.powerOffUntil = ctx.state.turn;
      target.gazed = true;
      ctx.log(`${inPlayDef(ctx.state.cards, target).power!.name} stops working until the end of the turn.`);
    },
  },
  // Unown D – [Darkness]: 30 less damage from Darkness Pokémon (attacks.ts).
  'neo2-47': {
    name: '[Darkness]',
    text: 'Whenever a Darkness Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 1 Unown [D] in play. (This power works even if Unown [D] is Asleep, Confused, or Paralyzed.)',
    unownGuard: 'darkness',
    ignoresConditions: true,
  },
  // Unown F – [Find]: with Unown F, I, N and D on the Bench, a Trainer card from the deck (shown to the opponent).
  'neo2-48': {
    oncePerTurn: true,
    blocked: (s) => (onBench(s, ['Unown [F]', 'Unown [I]', 'Unown [N]', 'Unown [D]']) ? null : 'You need Unown F, I, N and D on your Bench'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Find', filter: 'trainer', reveal: true }),
  },
  // Unown M – [Metal]: 30 less damage from Metal Pokémon (attacks.ts).
  'neo2-49': {
    name: '[Metal]',
    text: 'Whenever a Metal Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 1 Unown [M] in play. (This power works even if Unown [M] is Asleep, Confused, or Paralyzed.)',
    unownGuard: 'metal',
    ignoresConditions: true,
  },
  // Unown N – [Normal]: 30 less damage from Colorless Pokémon (attacks.ts).
  'neo2-50': {
    name: '[Normal]',
    text: 'Whenever a Colorless Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 1 Unown [N] in play. (This power works even if Unown [N] is Asleep, Confused, or Paralyzed.)',
    unownGuard: 'colorless',
    ignoresConditions: true,
  },
  // Unown U – [Undo]: with Unown U, N, D and O on the Bench, the Active Pokémon and its cards go back to the hand.
  'neo2-51': {
    name: '[Undo]',
    oncePerTurn: true,
    blocked: (s) =>
      !onBench(s, ['Unown [U]', 'Unown [N]', 'Unown [D]', 'Unown [O]']) ? 'You need Unown U, N, D and O on your Bench' : activeLock(s.me, [s.me, s.opp], s.cards),
    use(ctx) {
      const active = ctx.me.active;
      if (!active) return;
      // A Buzzap'd Electrode attached as Energy is a Pokémon card again.
      const energy: CardInstance[] = active.energy.map(({ provides: _, ...card }) => card);
      ctx.me.hand.push(...active.evolvedFrom, active.card, ...energy, ...(active.attached ?? []).map((a) => a.card));
      ctx.me.active = null;
      ctx.log(`${inPlayDef(ctx.state.cards, active).name} and all cards attached to it returned to the hand.`);
    },
  },
  // Kabuto – Revive Friends: once during your turn, heads puts a Kabuto from the deck onto the Bench as a Basic Pokémon.
  'neo2-56': {
    oncePerTurn: true,
    blocked: benchFull,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Revive Friends found nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Revive Friends', filter: 'named', name: 'Kabuto', toBench: true });
    },
  },
  // Omanyte – Fossil: once during your turn, heads puts a card that evolves from Mysterious Fossil from the deck onto the Bench as a Basic Pokémon.
  'neo2-60': {
    oncePerTurn: true,
    blocked: benchFull,
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Fossil found nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Fossil', filter: 'evolvesFrom', name: 'Mysterious Fossil', toBench: true });
    },
  },
  // Unown E – [Engage]: when played from the hand, the opponent may take a new hand of 4, then its owner may.
  'neo2-67': {
    onPlayFromHand(state, owner) {
      const opponent = state.playerOrder.find((id) => id !== owner.id)!;
      state.pendingChoice = { player: opponent, source: 'Engage', kind: 'engage', then: owner.id };
    },
  },
  // Unown I – [Increase]: when played from the hand, an Unown from the deck may go onto the Bench.
  'neo2-68': {
    name: '[Increase]',
    text: 'When you play Unown [I] from your hand, you may search your deck for a card with Unown in its name and put it onto your Bench. Shuffle your deck afterward. You can\'t use this power if your Bench is full.',
    onPlayFromHand(state, owner) {
      if (openBenchSlot(owner.bench, state.cards, state.stadium?.card) < 0) return;
      state.pendingChoice = { player: owner.id, source: 'Increase', kind: 'pickFromDeck', filter: 'ownerBasic', name: 'Unown', toBench: true, optional: true };
    },
  },
  // Unown O – [Observe]: once during your turn, look at the top 5 cards of the opponent's deck.
  'neo2-69': {
    name: '[Observe]',
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppDeck ? null : "Your opponent's deck is empty"),
    use: (ctx) => ctx.pend({ kind: 'lookOppDeck', source: 'Observe', count: 5 }),
  },
};
