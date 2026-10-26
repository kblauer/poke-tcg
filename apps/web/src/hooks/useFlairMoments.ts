import { EFFECT_MOMENTS, type EffectMoment, type EffectSlot } from '@poke-tcg/campaign';
import type { PlayerView } from '@poke-tcg/game-engine';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Box } from '../components/FlairEffect';
import { findMoments, inPlay, type Sides } from '../utils/flairMoments';
import { FlairContext } from './useFlair';

/** An effect playing on the board: whose slot, which effect, at which moment. */
export interface MomentEffect {
  id: number;
  effect: string;
  moment: EffectMoment;
  box: Box;
}

/** Each moment's slot (EFFECT_MOMENTS turned round). */
const SLOT_OF = Object.fromEntries(Object.entries(EFFECT_MOMENTS).map(([slot, moment]) => [moment, slot])) as Record<EffectMoment, EffectSlot>;

/** A slot's box on screen (Slot's data-slot), or null while it isn't shown. */
function slotBox(slot: string): Box | null {
  const el = document.querySelector(`[data-slot="${slot}"]`);
  if (!el) return null;
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
}

/**
 * Card flair's effects on the board (FlairEffect), from what changed between one view and the next, on the player's
 * own Pokémon only: a Pokémon new to their side comes into play (`play`) or, when it's on top of one they had,
 * evolves (`evolve`, on the new card); their attack (`attacker`, the view right after it) plays the Active Pokémon's
 * `attack`, and each of the opponent's Pokémon gone in that view its `ko` (on the slot it left). Each plays the effect
 * the player chose for that card at that moment, if any (FlairContext). Nothing on the first view.
 */
export function useFlairMoments(view: PlayerView, attacker: string | null) {
  const flair = useContext(FlairContext);
  const [effects, setEffects] = useState<MomentEffect[]>([]);
  const next = useRef(0);
  const before = useRef<(Sides & { version: number }) | null>(null);
  useEffect(() => {
    const now = { mine: inPlay(view.self.active, view.self.bench), theirs: inPlay(view.opponent.active, view.opponent.bench, 'cpu-') };
    const prev = before.current;
    before.current = { version: view.version, ...now };
    if (!prev || prev.version === view.version) return;
    for (const f of findMoments(prev, now, attacker === view.you, view.self.active)) {
      const effect = flair.get(f.defId)?.[SLOT_OF[f.moment]];
      if (!effect) continue;
      const start = () => {
        const box = slotBox(f.slot);
        if (box) setEffects((all) => [...all, { id: next.current++, effect, moment: f.moment, box }]);
      };
      if (f.delay) setTimeout(start, f.delay);
      else start();
    }
  }, [view, attacker, flair]);
  const done = useCallback((id: number) => setEffects((all) => all.filter((e) => e.id !== id)), []);
  return { effects, done };
}
