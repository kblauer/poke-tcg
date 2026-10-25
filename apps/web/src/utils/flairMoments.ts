// Card flair's moments on the board (useFlairMoments): which of the player's Pokémon came into play, evolved,
// attacked or Knocked Out the opponent's between two views. Pure, so it's tested on its own.
import type { EffectMoment } from '@poke-tcg/campaign';
import type { InPlayPokemon } from '@poke-tcg/game-engine';
import { benchSlotId } from './slots';

/** A Knock Out's effect waits for the attacker's lunge to land (Slot's MOTION_MS 450, its peak at 40%). */
const KO_DELAY_MS = 200;

/** A side's Pokémon in play by their top card's uid, with their slot (Slot's ids: active, bench-0…; the CPU's cpu-active, cpu-bench-0…). */
export function inPlay(active: InPlayPokemon | null, bench: (InPlayPokemon | null)[], prefix = ''): Map<string, { slot: string; pokemon: InPlayPokemon }> {
  const all = new Map<string, { slot: string; pokemon: InPlayPokemon }>();
  if (active) all.set(active.card.uid, { slot: `${prefix}active`, pokemon: active });
  bench.forEach((p, i) => p && all.set(p.card.uid, { slot: prefix ? `${prefix}bench-${i}` : benchSlotId(i), pokemon: p }));
  return all;
}

/** Both sides' Pokémon in play (inPlay): the player's and the opponent's. */
export type Sides = { mine: ReturnType<typeof inPlay>; theirs: ReturnType<typeof inPlay> };

/**
 * The moments between two views: each new Pokémon on the player's side comes into play, or evolves when it's on top of
 * one they had; after their attack (`attacked`), their Active Pokémon (`hitter`) attacks and Knocks Out each of the
 * opponent's Pokémon gone (on its old slot, after the lunge: `delay`).
 */
export function findMoments(prev: Sides, now: Sides, attacked: boolean, hitter: InPlayPokemon | null): { defId: string; moment: EffectMoment; slot: string; delay: number }[] {
  const found: { defId: string; moment: EffectMoment; slot: string; delay: number }[] = [];
  for (const [uid, { slot, pokemon }] of now.mine) {
    if (prev.mine.has(uid)) continue;
    found.push({ defId: pokemon.card.defId, moment: pokemon.evolvedFrom.some((c) => prev.mine.has(c.uid)) ? 'evolve' : 'play', slot, delay: 0 });
  }
  if (attacked && hitter) {
    found.push({ defId: hitter.card.defId, moment: 'attack', slot: 'active', delay: 0 });
    for (const [uid, { slot }] of prev.theirs) if (!now.theirs.has(uid)) found.push({ defId: hitter.card.defId, moment: 'ko', slot, delay: KO_DELAY_MS });
  }
  return found;
}
