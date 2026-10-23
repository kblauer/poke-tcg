import type { ReactNode } from 'react';

/**
 * One player's Active Pokémon row: the Active Pokémon in the middle, the piles (discard, Prize cards and deck) on its
 * right, centred on it vertically, and on its left the space where that player's coins are flipped (`data-coin-spot`,
 * CoinFlip's placeBeside; agreed).
 */
function ActiveRow({ active, piles, side }: { active: ReactNode; piles: ReactNode; side: 'self' | 'opponent' }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div data-coin-spot={side} className="self-stretch" />
      {active}
      <div className="justify-self-end">{piles}</div>
    </div>
  );
}

export interface PhoneSide {
  bench: ReactNode;
  active: ReactNode;
  /** The discard pile, Prize cards and deck (PhonePiles). */
  piles: ReactNode;
}

/**
 * The phone layout of the board (Board lays it out when useIsPhone), laid out like TCG Pocket in one upright column
 * that fits the screen: the CPU's Bench at the top above its Active Pokémon (the same size as yours, agreed), then the bar between
 * the sides (the menu button, the Stadium, whose turn it is and End turn), your Active Pokémon and your Bench, with the
 * hand below it all (Board). `oppHand` is the CPU's hand, in a strip at the top of the screen above its Bench (PhoneOppHand);
 * `dialog` floats over the top of the table (the Trainer being played). The cards are sized by `.phone-cards` (index.css).
 */
export function PhoneTable({ oppHand, opponent, bar, self, dialog }: { oppHand: ReactNode; opponent: PhoneSide; bar: ReactNode; self: PhoneSide; dialog?: ReactNode }) {
  return (
    // The top strip (--opp-hand-strip, index.css) is kept for the CPU's hand, so it never covers its Bench; at the bottom, a
    // gap between your Bench and your hand (pb-6), and another between your Active Pokémon's row and your Bench (mt-2).
    <div className="flex h-full flex-col justify-between gap-1 px-2 pb-6 pt-[var(--opp-hand-strip)]">
      {/* In the strip above the CPU's Bench, over the table so a tap reaches it (only its cards take taps: its box reaches down over the Bench). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1]">{oppHand}</div>
      <div className="flex justify-center gap-1.5">{opponent.bench}</div>
      <ActiveRow active={opponent.active} piles={opponent.piles} side="opponent" />
      {bar}
      <ActiveRow active={self.active} piles={self.piles} side="self" />
      <div className="mt-2 flex justify-center gap-1.5">{self.bench}</div>
      {dialog && <div className="absolute inset-x-2 top-3 z-20 mx-auto w-fit max-w-[calc(100%-1rem)]">{dialog}</div>}
    </div>
  );
}
