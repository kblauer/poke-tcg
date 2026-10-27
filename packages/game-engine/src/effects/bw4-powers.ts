// Next Destinies (bw4) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY).
// From the text: Sporprise and Giant Fan are asked as their Pokémon is played from the hand to evolve ("you may"); Giant Fan's
// Pokémon, Active or Benched, is the player's pick, its cards shuffled into its owner's deck with it; Slippery Soles's opponent
// picks their new Active Pokémon, and switches only if the player's own switch happened; Psychic Mirage doesn't stack (as Wild
// Growth); Forewarn's other card stays on top; Heal Block needs no partner (Bronzong's, unlike Solrock's) and lets damage
// counters be moved; Smooth Coat is its owner's flip against the opponent's attacks (as Cotton Spore); Blazing Mane and
// Reflexive Retaliation work only while their Pokémon is the Active one, even as it's Knocked Out.
import type { InPlayPokemon, PlayerState } from '../engine.js';
import type { GameState } from '../engine.js';
import { swapActive } from '../trainers.js';
import { type PowerEffect } from '../powers.js';
import { ABILITY, targetOf } from './common.js';
import { roughSkin, strikesWith } from './bw3-powers.js';

/** "When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may …": a yes-or-no question as it evolves. */
const onEvolveMay = (power: 'sporprise' | 'giantFan', source: string): PowerEffect => ({
  ...ABILITY,
  onPlayFromHand(state: GameState, owner: PlayerState, pokemon: InPlayPokemon) {
    if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

export const BW4_POWERS: Record<string, PowerEffect> = {
  // Amoonguss – Sporprise: as it evolves from the hand, may make the opponent's Active Pokémon Confused and Poisoned.
  'bw4-9': onEvolveMay('sporprise', 'Sporprise'),
  // Arcanine – Blazing Mane: as the Active Pokémon damaged by the opponent's attack, the Attacking Pokémon is now Burned.
  'bw4-12': strikesWith('burned'),
  // Vanilluxe – Slippery Soles: once a turn, the player switches their Active Pokémon; then the opponent switches theirs.
  'bw4-33': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.me.bench.some(Boolean) ? null : 'You have no Benched Pokémon'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: s.me.bench.flatMap((p, i) => (p ? [i] : [])), prompt: 'Choose one of your Benched Pokémon to switch with your Active Pokémon' }],
    use(ctx) {
      const slot = ctx.choices.to;
      const was = ctx.me.active;
      if (typeof slot !== 'number' || !ctx.me.bench[slot]) return;
      swapActive(ctx.state, ctx.me, slot);
      if (ctx.me.active === was) return;
      const theirs = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (theirs.length === 1) swapActive(ctx.state, ctx.opp, theirs[0]!);
      else if (theirs.length > 1) ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Slippery Soles', kind: 'switchIn' };
    },
  },
  // Gardevoir – Psychic Mirage: basic Psychic Energy on the player's Psychic Pokémon provides 2 Psychic Energy (refreshWildGrowth).
  'bw4-57': { ...ABILITY, psychicMirage: true },
  // Musharna – Forewarn: once a turn, one of the top 2 cards of the deck into the hand; the other stays on top.
  'bw4-59': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Forewarn', looked: ctx.me.deck.slice(0, 2).map((c) => c.uid), take: 1, shuffleRest: true, restOnTop: true }),
  },
  // Lucario – Reflexive Retaliation: as Druddigon's Rough Skin.
  'bw4-64': roughSkin,
  // Shiftry – Giant Fan: as it evolves from the hand, may flip; heads, one of the opponent's Pokémon shuffled into their deck.
  'bw4-72': onEvolveMay('giantFan', 'Giant Fan'),
  // Bronzong – Heal Block: no damage can be healed from any Pokémon (engine.ts's healBlock, with no partner).
  'bw4-76': { ...ABILITY, healBlock: 'alone' },
  // Cinccino – Smooth Coat: heads, no damage from the opponent's attack (as Cotton Spore).
  'bw4-85': { ...ABILITY, cottonSpore: true },
};
