import { useDroppable } from '@dnd-kit/core';
import { lookupCard, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { LARGE_CARD, SMALL_CARD } from '../utils/layout';
import { Card } from './Card';

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
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
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
      {pokemon && <Card def={lookupCard(cards, pokemon.card.defId)} inPlay={pokemon} cards={cards} small={!large} highRes={large} />}
      {/* Tint only the bottom band (behind the label) so the Pokémon art stays visible. */}
      {pokemon && highlight && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-1/3 rounded-b-lg bg-gradient-to-t to-transparent ${
            highlight === 'target' ? 'from-emerald-500/80' : highlight === 'power' ? 'from-violet-500/70' : 'from-yellow-400/70'
          }`}
        />
      )}
      {label && (
        <span
          className={`pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full px-2 py-0.5 text-xs font-bold shadow ${
            highlight === 'promote' ? 'bg-yellow-400 text-slate-900' : 'bg-emerald-500 text-white'
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
