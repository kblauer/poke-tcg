// Jungle (base2) Pokémon Powers, by card id. Powers that are used stop working while their Pokémon is
// Asleep, Confused, Paralyzed, Poisoned or Burned (agreed; checked in powerError); the rest are flags the engine checks with
// powerActive. Cards 17–32 are the non-holo prints of 1–16.
// Rulings (agreed): Shift's type lasts until Venomoth leaves play or Shifts again; Heal flips first and
// the Pokémon is chosen after heads; several Retreat Aids each take 1 off; Invisible Wall checks the
// damage after weakness, resistance, PlusPower, Defender and other reductions.
import type { EnergyType } from '../cards.js';
import type { CardInstance, InPlayPokemon } from '../engine.js';
import { pokemonAt, type PeekTarget, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { nextRandom } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { damagedTargets } from '../trainers.js';

const inPlay = (side: PowerSituation['me'] | PowerSituation['opp']) => [side.active, ...side.bench].filter((p): p is InPlayPokemon => !!p);

/** Types Shift can change Venomoth to: those of the other Pokémon in play, except Colorless and its own. */
function shiftTypes(s: PowerSituation): EnergyType[] {
  const venomoth = pokemonAt(s.me, s.source)!;
  const own = inPlayDef(s.cards, venomoth).type;
  const types = [...inPlay(s.me), ...inPlay(s.opp)].filter((p) => p !== venomoth).map((p) => inPlayDef(s.cards, p).type);
  return [...new Set(types)].filter((t) => t !== 'colorless' && t !== own);
}

/** What Peek can look at now (empty piles left out). */
function peekTargets(s: PowerSituation): PeekTarget[] {
  const sizes: Record<PeekTarget, number> = { deck: s.counts.deck, oppDeck: s.counts.oppDeck, oppHand: s.counts.oppHand, prize: s.counts.prizes, oppPrize: s.counts.oppPrizes };
  return (Object.keys(sizes) as PeekTarget[]).filter((t) => sizes[t] > 0);
}

const PEEK_LABELS: Record<PeekTarget, string> = {
  deck: 'the top card of your deck',
  oppDeck: "the top card of your opponent's deck",
  oppHand: "a random card from your opponent's hand",
  prize: 'one of your Prize cards',
  oppPrize: "one of your opponent's Prize cards",
};

const HOLO: Record<string, PowerEffect> = {
  // Mr. Mime – Invisible Wall: attack damage of 30 or more to Mr. Mime is prevented, even from its owner's attacks.
  'base2-6': { invisibleWall: true },

  // Snorlax – Thick Skinned: Snorlax can't become Asleep, Confused, Paralyzed or Poisoned.
  'base2-11': { noConditions: true },

  // Venomoth – Shift: once during your turn, change Venomoth's type to that of another Pokémon in play (not Colorless).
  'base2-13': {
    oncePerTurn: true,
    blocked: (s) => (shiftTypes(s).length ? null : 'No other Pokémon in play has a type to change to'),
    choices: (s) => [{ kind: 'type', field: 'type', options: shiftTypes(s), prompt: "Choose Venomoth's new type" }],
    use(ctx) {
      ctx.source.shiftedType = ctx.choices.type!;
      ctx.log(`${pokemonName(ctx.state, ctx.source)} is now ${ctx.choices.type![0]!.toUpperCase()}${ctx.choices.type!.slice(1)} type.`);
    },
  },

  // Vileplume – Heal: once during your turn, flip a coin; on heads, remove 1 damage counter from one of your Pokémon.
  'base2-15': {
    oncePerTurn: true,
    blocked: (s) => (damagedTargets(s.me).length ? null : 'None of your Pokémon have damage counters'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Heal did nothing.');
      const options = damagedTargets(ctx.me);
      // With only one Pokémon to heal there's nothing to choose.
      if (options.length > 1) return ctx.pend({ kind: 'removeDamage', source: 'Heal' });
      const p = pokemonAt(ctx.me, options[0]!)!;
      p.damage -= 10;
      ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, p)}.`);
    },
  },
};

export const JUNGLE_POWERS: Record<string, PowerEffect> = {
  ...HOLO,
  ...Object.fromEntries(Object.entries(HOLO).map(([id, effect]) => [`base2-${Number(id.slice(6)) + 16}`, effect])),

  // Dodrio – Retreat Aid: while Dodrio is on your Bench, your Active Pokémon's retreat cost is 1 less.
  'base2-34': { retreatAid: true },

  // Mankey – Peek: once during your turn, look at the top card of either deck, a random card from the opponent's hand, or a Prize card.
  'base2-55': {
    oncePerTurn: true,
    blocked: (s) => (peekTargets(s).length ? null : 'There is nothing to look at'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'peek', field: 'peek', options: peekTargets(s), prompt: 'Look at' }];
      if (c.peek !== 'prize' && c.peek !== 'oppPrize') return specs;
      const count = c.peek === 'prize' ? s.counts.prizes : s.counts.oppPrizes;
      return [...specs, { kind: 'prize', field: 'prize', options: Array.from({ length: count }, (_, i) => i), prompt: 'Which Prize card' }];
    },
    use(ctx) {
      const what = ctx.choices.peek!;
      let card: CardInstance;
      if (what === 'deck') card = ctx.me.deck[0]!;
      else if (what === 'oppDeck') card = ctx.opp.deck[0]!;
      else if (what === 'oppHand') {
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        card = ctx.opp.hand[Math.floor(r * ctx.opp.hand.length)]!;
      } else card = (what === 'prize' ? ctx.me : ctx.opp).prizes[ctx.choices.prize!]!;
      ctx.state.peek = { player: ctx.me.id, card, label: PEEK_LABELS[what] };
      // Only the peeking player sees the card; the log just says what they looked at.
      ctx.log(`Looked at ${PEEK_LABELS[what].replace(/your opponent's/g, "the opponent's").replace(/your/g, 'their')}.`);
    },
  },
};
