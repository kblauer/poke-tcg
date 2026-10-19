import type { ReactNode } from 'react';

/** One player's Active Pokémon row: Prize cards on the left, the Active Pokémon in the middle, deck and discard on the right. */
function ActiveRow({ prizes, active, piles }: { prizes: ReactNode; active: ReactNode; piles: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="justify-self-start">{prizes}</div>
      {active}
      <div className="justify-self-end">{piles}</div>
    </div>
  );
}

export interface PhoneSide {
  bench: ReactNode;
  active: ReactNode;
  prizes: ReactNode;
  piles: ReactNode;
}

/**
 * The phone layout of the board (Board lays it out when useIsPhone), laid out like TCG Pocket in one upright column
 * that fits the screen: the CPU's Bench at the top above its Active Pokémon, then the bar between the sides (the menu
 * button, the Stadium, whose turn it is and End turn), your Active Pokémon and your Bench, with the hand below it all
 * (Board). `top` is the line above the CPU's Bench (who you're up against, the CPU's hand); `dialog` floats over the
 * top of the table (the Trainer being played). The cards are sized by `.phone-cards` (index.css).
 */
export function PhoneTable({ top, opponent, bar, self, dialog }: { top: ReactNode; opponent: PhoneSide; bar: ReactNode; self: PhoneSide; dialog?: ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-between gap-1 px-2 py-1">
      {top}
      <div className="flex justify-center gap-1.5">{opponent.bench}</div>
      <ActiveRow prizes={opponent.prizes} active={opponent.active} piles={opponent.piles} />
      {bar}
      <ActiveRow prizes={self.prizes} active={self.active} piles={self.piles} />
      <div className="flex justify-center gap-1.5">{self.bench}</div>
      {dialog && <div className="absolute inset-x-2 top-3 z-20 mx-auto w-fit max-w-[calc(100%-1rem)]">{dialog}</div>}
    </div>
  );
}
