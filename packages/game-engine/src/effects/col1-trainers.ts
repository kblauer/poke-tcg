// Call of Legends (col1) Trainer cards and Special Energy, by card id. Most reprint earlier cards and play as those.
// From the text: Lost Remover reaches any of the opponent's Pokémon with a Special Energy card (not one Legendary Body or its
// Energy's protection keeps it off); Lost World can be used once a turn by either player while their opponent has 6 or more
// Pokémon cards in the Lost Zone, winning the game; Research Record puts the cards kept back on top in the order picked, the
// rest on the bottom in the order picked.
import { isPokemonCard, lookupCard } from '../cards.js';
import type { Target } from '../engine.js';
import { energyKept, pokemonAt, trainerProof } from '../powers.js';
import { energyProtected, pokemonName } from '../status.js';
import { isSpecialEnergy } from '../engine.js';
import { targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { DP2_ENERGY } from './dp2-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { HGSS1_TRAINERS } from './hgss1-trainers.js';
import { HGSS2_TRAINERS } from './hgss2-trainers.js';
import { HGSS3_TRAINERS } from './hgss3-trainers.js';

/** The opponent's Pokémon a Trainer can take a Special Energy card from (Lost Remover). */
const lostTargets = (s: TrainerSituation): Target[] =>
  targetsOf(s.opp).filter((t) => {
    const p = pokemonAt(s.opp, t)!;
    if (t === 'active' && trainerProof(s.opp, [s.me, s.opp], s.cards)) return false;
    return p.energy.some((e) => !e.provides && isSpecialEnergy(s.cards, e)) && !energyProtected(s.cards, p) && !energyKept(s.opp, [s.opp, s.me], s.cards, p);
  });

export const COL1_TRAINERS: Record<string, TrainerEffect> = {
  // Cheerleader's Cheer, Dual Ball, Interviewer's Questions: as Unleashed's. Copycat, Professor Oak's New Theory: as HeartGold &
  // SoulSilver's. Professor Elm's Training Method: as Expedition's. Sage's Training: as Undaunted's.
  'col1-76': HGSS2_TRAINERS['hgss2-71']!,
  'col1-77': HGSS1_TRAINERS['hgss1-90']!,
  'col1-78': HGSS2_TRAINERS['hgss2-72']!,
  'col1-79': HGSS2_TRAINERS['hgss2-77']!,
  'col1-82': ECARD1_TRAINERS['ecard1-148']!,
  'col1-83': HGSS1_TRAINERS['hgss1-101']!,
  'col1-85': HGSS3_TRAINERS['hgss3-77']!,
  // Lost Remover: a Special Energy card on one of the opponent's Pokémon to the Lost Zone.
  'col1-80': {
    blocked: (s) => (lostTargets(s).length ? null : "None of your opponent's Pokémon has a Special Energy card you can take"),
    choices(s, c) {
      const options = lostTargets(s);
      const p = c.oppTarget === undefined ? null : pokemonAt(s.opp, c.oppTarget);
      return [
        { kind: 'pokemon', field: 'oppTarget', side: 'opp', options, prompt: "Lost Remover: choose one of your opponent's Pokémon" },
        ...(p ? [{ kind: 'cards' as const, field: 'oppEnergyUids' as const, min: 1, max: 1, options: p.energy.filter((e) => !e.provides && isSpecialEnergy(s.cards, e)), prompt: 'Lost Remover: choose a Special Energy card to put in the Lost Zone' }] : []),
      ];
    },
    play(ctx) {
      const p = ctx.choices.oppTarget === undefined ? null : pokemonAt(ctx.opp, ctx.choices.oppTarget);
      const card = p?.energy.find((e) => ctx.choices.oppEnergyUids?.includes(e.uid) && isSpecialEnergy(ctx.state.cards, e));
      if (!p || !card) return;
      p.energy = p.energy.filter((e) => e !== card);
      (ctx.opp.lostZone ??= []).push(card);
      ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, p)} in the Lost Zone.`, ctx.opp.id);
    },
  },
  // Lost World: once during each player's turn, with 6 or more of the opponent's Pokémon in the Lost Zone, that player may win.
  'col1-81': {
    stadium: true,
    stadiumBlocked: (_me, cards, _turn, oppLost) => ((oppLost ?? []).filter((c) => isPokemonCard(lookupCard(cards, c.defId))).length >= 6 ? null : "Lost World: your opponent has fewer than 6 Pokémon in the Lost Zone"),
    useStadium({ state, me }) {
      state.winner = me.id;
    },
  },
  // Research Record: the top 4 cards looked at; any put back on top, the rest on the bottom, in the order picked.
  'col1-84': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'researchRecord', source: 'Research Record', looked: ctx.me.deck.slice(0, 4).map((c) => c.uid), top: [], bottom: [] }),
  },
};

export const COL1_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as Mysterious Treasures'.
  'col1-86': DP2_ENERGY['dp2-119']!,
  'col1-87': DP2_ENERGY['dp2-120']!,
};
