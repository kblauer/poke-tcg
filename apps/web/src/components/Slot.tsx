import { useDroppable } from '@dnd-kit/core';
import { lookupCard, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { useEffect, useRef, type RefObject } from 'react';
import { LARGE_CARD, SMALL_CARD } from '../utils/layout';
import { Card } from './Card';

/** Length of the slot animations (a Pokémon arriving, taking damage, healing, getting Energy, attacking). */
const MOTION_MS = 450;

/**
 * Animates what changed in the slot since the last view: a new Pokémon (played, evolved, switched in) drops
 * in, damage shakes it with a red glow, healing glows green, new Energy glows yellow, and an attack lunges.
 * Nothing moves on the first render or for people who prefer reduced motion.
 */
function useSlotMotion(ref: RefObject<HTMLDivElement | null>, pokemon: InPlayPokemon | null, lunge: { dir: 'up' | 'down'; stamp: number } | null) {
  const before = useRef(pokemon);
  const lunged = useRef(lunge?.stamp ?? null);
  useEffect(() => {
    const prev = before.current;
    before.current = pokemon;
    const el = ref.current;
    if (!el || !pokemon || prev === pokemon || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glow = (rgb: string) => [{ filter: 'none' }, { filter: `drop-shadow(0 0 14px rgb(${rgb})) brightness(1.15)`, offset: 0.35 }, { filter: 'none' }];
    if (!prev || prev.card.uid !== pokemon.card.uid) {
      el.animate([{ opacity: 0, transform: 'translateY(-14%) scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: MOTION_MS, easing: 'ease-out' });
    } else if (pokemon.damage > prev.damage) {
      // Starts a moment late, so the attacker's lunge lands first.
      const shake = ['none', 'translateX(-6%) rotate(-3deg)', 'translateX(5%) rotate(2deg)', 'translateX(-3%)', 'translateX(2%)', 'none'].map((transform) => ({ transform }));
      el.animate(shake, { duration: MOTION_MS, delay: 180, easing: 'ease-out' });
      el.animate(glow('239 68 68'), { duration: MOTION_MS, delay: 180 });
    } else if (pokemon.damage < prev.damage) {
      el.animate(glow('52 211 153'), { duration: MOTION_MS });
    } else if (pokemon.energy.length > prev.energy.length) {
      el.animate(glow('250 204 21'), { duration: MOTION_MS });
    }
  }, [pokemon]);
  useEffect(() => {
    const stamp = lunge?.stamp ?? null;
    if (stamp === lunged.current) return;
    lunged.current = stamp;
    const el = ref.current;
    if (!el || !lunge || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const reach = lunge.dir === 'up' ? '-18%' : '18%';
    el.animate([{ transform: 'none' }, { transform: `translateY(${reach}) scale(1.06)`, offset: 0.4 }, { transform: 'none' }], { duration: MOTION_MS, easing: 'ease-in-out' });
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
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const art = useRef<HTMLDivElement>(null);
  useSlotMotion(art, pokemon, lunge);
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
            : '';
  const size = large ? LARGE_CARD : SMALL_CARD;
  return (
    <div
      ref={setNodeRef}
      data-keep-action
      onClick={onClick}
      className={`${size} relative aspect-[63/88] shrink-0 rounded-lg transition ${ring} ${onClick ? 'cursor-pointer' : ''} ${
        pokemon ? '' : `border-2 border-dashed ${highlight === 'target' ? 'border-emerald-400 bg-emerald-400/10' : 'border-slate-700'}`
      }`}
    >
      {/* The active spot is the biggest card on the board, so it gets the high-resolution image. */}
      {pokemon && (
        <div ref={art}>
          <Card def={lookupCard(cards, pokemon.card.defId)} inPlay={pokemon} cards={cards} small={!large} highRes={large} />
        </div>
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
