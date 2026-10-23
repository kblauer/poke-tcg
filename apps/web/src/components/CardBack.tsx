import { useCosmetics } from '../hooks/useCosmetics';
import { CARD_BACK } from '../utils/cardBack';

/** A face-down card, filling its container's width. `mine`: one of the player's own, in their card back (useCosmetics). */
export function CardBack({ className = '', mine = false }: { className?: string; mine?: boolean }) {
  const { cardBack } = useCosmetics();
  return (
    <img
      src={mine ? cardBack : CARD_BACK}
      alt=""
      draggable={false}
      className={`aspect-[63/88] w-full rounded-md object-cover shadow-md shadow-black/60 ${className}`}
    />
  );
}
