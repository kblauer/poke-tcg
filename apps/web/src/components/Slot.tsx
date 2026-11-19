import { useDroppable } from '@dnd-kit/core';
import { inPlayDef, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { useEffect, useRef, type RefObject } from 'react';
import { ENERGY_RGB, HEAL_RGB, MOTION_MS, dropIn, glow, hitShake, lunge as lungeAt } from '../utils/cardMotion';
import { LARGE_CARD, SMALL_CARD } from '../utils/layout';
import { Card } from './Card';
import type { HoloMotion } from './HoloCard';
import { ToolPopOverlay } from './ToolPops';

/** Length of the glow on a Pokémon the CPU's card changed (`spotlight`). */
const SPOTLIGHT_MS = 1100;

/**
 * Animates what changed in the slot since the last view: a new Pokémon (played, evolved, switched in) drops
 * in, damage shakes it with a red glow, healing glows green, new Energy glows yellow, and an attack lunges. A Pokémon
 * the CPU's card changed (`spotlight`) then glows white.
 * A holo (the Active Pokémon) tilts and shines along with each move (`holo`, the HoloCard's springs).
 * Nothing moves on the first render or for people who prefer reduced motion.
 */
function useSlotMotion(
  ref: RefObject<HTMLDivElement | null>,
  holo: RefObject<HoloMotion | null>,
  pokemon: InPlayPokemon | null,
  lunge: { dir: 'up' | 'down'; stamp: number } | null,
  spotlight: { stamp: number; delay: number } | null,
) {
  const before = useRef(pokemon);
  const lunged = useRef(lunge?.stamp ?? null);
  const lit = useRef(spotlight?.stamp ?? null);
  // The CPU's card just changed it: it glows white once (SPOTLIGHT_MS), after the move's own animation (or once the card shown has burst away: `delay`).
  useEffect(() => {
    if ((spotlight?.stamp ?? null) === lit.current) return;
    lit.current = spotlight?.stamp ?? null;
    const el = ref.current;
    if (!el || spotlight === null || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const on = { filter: 'drop-shadow(0 0 16px rgb(224 242 254)) brightness(1.2)' };
    el.animate([{ filter: 'none' }, on, { filter: 'none' }], { duration: SPOTLIGHT_MS, delay: Math.max(MOTION_MS + 180, spotlight.delay) });
  }, [spotlight?.stamp]);
  useEffect(() => {
    const prev = before.current;
    before.current = pokemon;
    const el = ref.current;
    if (!el || !pokemon || prev === pokemon || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!prev || prev.card.uid !== pokemon.card.uid) dropIn(el, holo.current);
    else if (pokemon.damage > prev.damage) hitShake(el, holo.current);
    else if (pokemon.damage < prev.damage) glow(el, HEAL_RGB, holo.current);
    else if (pokemon.energy.length > prev.energy.length) glow(el, ENERGY_RGB, holo.current);
  }, [pokemon]);
  useEffect(() => {
    const stamp = lunge?.stamp ?? null;
    if (stamp === lunged.current) return;
    lunged.current = stamp;
    const el = ref.current;
    if (!el || !lunge || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    lungeAt(el, lunge.dir, holo.current);
  }, [lunge?.stamp]);
}

/**
 * The active spot or a bench slot. Player slots become drop targets while a card that
 * can go there is selected or being dragged.
 */
export function Slot({
  id,
  pokemon,
  cards,
  large,
  droppable = false,
  highlight = null,
  label = null,
  dimmed = false,
  loading = false,
  lunge = null,
  spotlight = null,
  usable = false,
  mine = false,
  onClick,
}: {
  id: string;
  pokemon: InPlayPokemon | null;
  cards: CardLibrary;
  large?: boolean;
  droppable?: boolean;
  /** target: a held card can go here; promote: can be promoted; power: its Pokémon Power is selected. */
  highlight?: 'target' | 'promote' | 'power' | null;
  /** Short call-to-action shown on the slot, e.g. "Evolve". */
  label?: string | null;
  dimmed?: boolean;
  loading?: boolean;
  /** It just attacked: it lunges towards the other side (`stamp` is the view's version, so each attack lunges once). */
  lunge?: { dir: 'up' | 'down'; stamp: number } | null;
  /** A card the CPU played or used just changed it: it glows (`stamp` is the view's version, so each move glows once), from `delay` ms on. */
  spotlight?: { stamp: number; delay: number } | null;
  /** Its Pokémon Power can be used now, or (the Active) it can attack: it pulses with the playable cards' blue outline (`.playable-pulse`). */
  usable?: boolean;
  /** The player's own slot: its card shows the holo pattern they chose (card flair); the CPU's never do. */
  mine?: boolean;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const art = useRef<HTMLDivElement>(null);
  const holo = useRef<HoloMotion>(null);
  useSlotMotion(art, holo, pokemon, lunge, spotlight);
  // Rings sit outside the card art, so they need to be thick and glowing to read against the card's own border.
  const ring = loading
    ? 'animate-pulse ring-4 ring-yellow-300'
    : isOver
      ? '-translate-y-1 scale-105 ring-4 ring-emerald-300 shadow-[0_0_28px_6px_rgba(52,211,153,0.8)]'
      : highlight === 'target'
        ? '-translate-y-1 ring-4 ring-emerald-400 shadow-[0_0_18px_3px_rgba(52,211,153,0.6)]'
        : highlight === 'promote'
          ? '-translate-y-1 ring-4 ring-yellow-400 shadow-[0_0_18px_3px_rgba(250,204,21,0.6)]'
          : highlight === 'power'
            ? '-translate-y-1 ring-4 ring-violet-400 shadow-[0_0_18px_3px_rgba(167,139,250,0.6)]'
          : dimmed
            ? 'opacity-40'
            : usable
              ? 'playable-pulse'
              : '';
  const size = large ? LARGE_CARD : SMALL_CARD;
  return (
    <div
      ref={setNodeRef}
      data-keep-action
      data-active-slot={large || undefined}
      // Where card flair's effects find it (useFlairMoments).
      data-slot={id}
      onClick={onClick}
      className={`${size} relative aspect-[63/88] shrink-0 rounded-lg transition ${ring} ${onClick ? 'cursor-pointer' : ''} ${
        pokemon ? '' : `border-2 border-dashed ${highlight === 'target' ? 'border-emerald-400 bg-emerald-400/10' : 'border-slate-700'}`
      }`}
    >
      {/* The active spot is the biggest card on the board, so it gets the high-resolution image, and a holo shines (still). */}
      {pokemon && (
        <div ref={art}>
          {/* A Transformed Ditto shows the card it's a copy of. */}
          <Card def={inPlayDef(cards, pokemon)} inPlay={pokemon} cards={cards} small={!large} highRes={large} shine={large} holoRef={holo} mine={mine} />
        </div>
      )}
      {/* Its Pokémon Tool just worked (a Berry's heal): what it did, over the card (ToolPops). */}
      {pokemon && <ToolPopOverlay uid={pokemon.card.uid} />}
      {pokemon?.transformed && (
        <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white shadow">Ditto</span>
      )}
      {/* Tint only a band across the middle (behind the label), so the art and the Energy along the bottom stay visible. */}
      {pokemon && highlight && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-1/3 h-1/3 bg-gradient-to-b from-transparent to-transparent ${
            highlight === 'target' ? 'via-emerald-500/70' : highlight === 'power' ? 'via-violet-500/60' : 'via-yellow-400/60'
          }`}
        />
      )}
      {label && (
        <span
          className={`pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-bold shadow ${
            highlight === 'promote' ? 'bg-yellow-400 text-slate-900' : 'bg-emerald-500 text-white'
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
