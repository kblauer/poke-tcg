import { CARD_BACK } from '../utils/cardBack';

/** A face-down card, filling its container's width. */
export function CardBack({ className = '' }: { className?: string }) {
  return (
    <img
      src={CARD_BACK}
      alt=""
      draggable={false}
      className={`aspect-[63/88] w-full rounded-md object-cover shadow-md shadow-black/60 ${className}`}
    />
  );
}
