import CloseIcon from '@mui/icons-material/Close';
import { lookupCard, type CardInstance, type CardLibrary } from '@poke-tcg/game-engine';
import { useContext, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useEscape } from '../hooks/useEscape';
import { DIALOG, DIALOG_BACKDROP } from '../utils/styles';
import { Card } from './Card';
import { PreviewContext } from './PreviewContext';

/** Abilities used from where the cards are, not in play (Rebirth, Propagation, Prehistoric Call; Busybody from the hand): a card's, or null. */
export interface ZoneAbilities {
  of: (card: CardInstance) => { name: string; error: string | null } | null;
  use: (card: CardInstance) => void;
}

/**
 * A discard pile spread out to view, newest card first, in a window in the middle of the screen styled like the
 * card choices (PendingChoicePanel): the same large high-res cards in a scrolling grid. Opened by clicking the pile.
 * Hovering a card shows the large preview, which sits above the window. Closed with the × button, Esc, or a click
 * beside it. In the page body: the play area's container-type would trap a fixed window.
 */
export function DiscardPane({
  title,
  discard,
  cards,
  onClose,
  note = `${discard.length}, newest first`,
  abilities,
}: {
  title: string;
  discard: CardInstance[];
  cards: CardLibrary;
  onClose: () => void;
  /** Beside the title. Other cards shown the same way (the phone layout's face-up prizes and CPU hand) just give their count. */
  note?: string;
  /** The player's own discard pile: the Abilities its cards use from there (Rebirth, Propagation…), each with a Use button under its card. */
  abilities?: ZoneAbilities;
}) {
  const setPreview = useContext(PreviewContext);
  useEscape(onClose);

  return createPortal(
    // Below the card preview (z-[1100]), above the board's dialogs.
    <div data-keep-action className={`${DIALOG_BACKDROP} z-[1050]`} onClick={onClose}>
      {/* Hovered cards still show the preview, but the wheel scrolls the cards rather than resizing it. */}
      <PreviewContext.Provider value={(p) => setPreview(p && { ...p, scrollZoom: false })}>
        <section
          role="dialog"
          aria-label={title}
          className={`${DIALOG} flex max-h-full w-fit max-w-[min(56rem,100%)] flex-col gap-2 p-3`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {title} <span className="font-normal text-slate-400">({note})</span>
            </p>
            <button className="rounded-full p-1 text-slate-300 hover:bg-slate-700 hover:text-slate-50" onClick={onClose} aria-label="Close">
              <CloseIcon fontSize="small" />
            </button>
          </div>
          {/* Cards outside the play area take their width from --card-lg. */}
          <div className="flex max-h-[70vh] flex-wrap justify-center gap-2 overflow-y-auto p-1" style={{ '--card-lg': '8.5rem' } as CSSProperties}>
            {[...discard].reverse().map((c) => {
              const ability = abilities?.of(c);
              return ability ? (
                // Its Ability under it: Use, or why it can't be used now (as a benched Pokémon's power panel).
                <div key={c.uid} className="flex flex-col items-center gap-1">
                  <Card def={lookupCard(cards, c.defId)} highRes />
                  <button
                    className="w-full rounded bg-violet-700 px-2 py-1 text-xs transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-700"
                    disabled={ability.error !== null}
                    onClick={() => {
                      onClose();
                      abilities!.use(c);
                    }}
                  >
                    Use {ability.name}
                  </button>
                  {ability.error && <p className="max-w-[8.5rem] text-center text-[11px] text-amber-300">{ability.error}</p>}
                </div>
              ) : (
                <Card key={c.uid} def={lookupCard(cards, c.defId)} highRes />
              );
            })}
          </div>
        </section>
      </PreviewContext.Provider>
    </div>,
    document.body,
  );
}
