import { DndContext } from '@dnd-kit/core';
import MenuIcon from '@mui/icons-material/Menu';
import type { GameAction, InPlayPokemon, PlayerView, Target } from '@poke-tcg/game-engine';
import { useState, type ReactNode, type RefObject } from 'react';
import type { useAttack } from '../../hooks/useAttack';
import type { useCardPlay } from '../../hooks/useCardPlay';
import type { useCosmetics } from '../../hooks/useCosmetics';
import type { useToasts } from '../../hooks/useToasts';
import { benchSlotId, type SlotId } from '../../utils/slots';
import type { PokemonPick } from '../Board';
import { DiscardPane } from '../DiscardPane';
import { FloatingDialog } from '../FloatingDialog';
import { LogSheet } from '../LogDrawer';
import { OpponentSlot, type Spotlight } from '../OpponentArea';
import { PendingChoicePanel } from '../PendingChoicePanel';
import { PlayArea } from '../PlayArea';
import { Playmat } from '../Playmat';
import { PeekCard } from '../PowerPanel';
import { PreviewContext } from '../PreviewContext';
import { StadiumCard } from '../StadiumCard';
import { Toasts } from '../Toasts';
import { TurnBanner, type useNewTurn } from '../TurnBanner';
import { PhoneOppHand, PhonePiles, PhonePrizes } from './PhonePiles';
import { PhoneTable } from './PhoneTable';

type CardPlay = ReturnType<typeof useCardPlay>;

/**
 * The phone layout of the board (Board, which keeps all the logic and passes its pieces here): the same pieces, laid out
 * by PhoneTable, filling the screen over the site's header; the side panel's tabs and Concede in a full-screen menu
 * behind the round ☰ button (LogSheet), and the CPU's hand spread out on a tap while it's face up (Clairvoyance).
 */
export function PhoneBoard({
  view,
  send,
  busy,
  gameId,
  playmat,
  dnd,
  dragEndedAt,
  dragging,
  heldCard,
  dropTarget,
  draggingTrainer,
  pokemonPick,
  pendingPick,
  attack,
  attacker,
  oppDrop,
  oppSpot,
  newTurn,
  toasts,
  prompt,
  runTab,
  debugEnabled,
  tableOverlay,
  playerSlot,
  statusBar,
  oppDialog,
  handView,
  dragOverlay,
  remindersDialog,
  setupBanner,
}: {
  view: PlayerView;
  send: (a: GameAction) => void;
  busy: boolean;
  gameId: string;
  /** The player's playmat (the Cosmetics tab). */
  playmat: ReturnType<typeof useCosmetics>['playmat'];
  dnd: CardPlay['dnd'];
  /** When the last drag ended (Board's). */
  dragEndedAt: RefObject<number>;
  dragging: CardPlay['dragging'];
  heldCard: CardPlay['heldCard'];
  dropTarget: CardPlay['dropTarget'];
  /** A Trainer card is being dragged: the whole play area is its drop target. */
  draggingTrainer: boolean;
  /** An attack, power or Trainer asking for a Pokémon in play, chosen by tapping it. */
  pokemonPick: PokemonPick | null;
  /** A pending choice of a Pokémon in play (answered on the board, not in a dialog). */
  pendingPick: PlayerView['self']['pendingChoice'] | null;
  attack: ReturnType<typeof useAttack>;
  /** Who attacked in the view right after its attack (lunges). */
  attacker: string | null;
  /** The CPU's Pokémon a dragged Trainer can be dropped on. */
  oppDrop: Target[] | null;
  oppSpot: Spotlight | null;
  newTurn: ReturnType<typeof useNewTurn>;
  toasts: ReturnType<typeof useToasts>;
  /** The move in progress's instruction (Toasts' prompt). */
  prompt: string | null;
  /** The side panel's Run tab during a run's battle. */
  runTab?: ReactNode;
  debugEnabled: boolean;
  /** Board's pieces: over the play area (the coin flips, the turn-order flip, the CPU's card), a slot of yours, the status bar, the dialog over the CPU's side, the hand, the drag overlay and End turn's reminder dialog. */
  tableOverlay: ReactNode;
  playerSlot: (id: SlotId, pokemon: InPlayPokemon | null) => ReactNode;
  statusBar: (compact: boolean) => ReactNode;
  oppDialog: ReactNode;
  handView: (compact: boolean) => ReactNode;
  dragOverlay: ReactNode;
  remindersDialog: ReactNode;
  /** The setup line's banner (SetupBanner), over the bar while Pokémon are placed. */
  setupBanner: ReactNode;
}) {
  /** The phone layout's ☰ menu. */
  const [menu, setMenu] = useState(false);
  /** The phone layout's spread-out view of the CPU's hand, while it's face up (Clairvoyance). */
  const [cpuHand, setCpuHand] = useState(false);
  const { self, phase } = view;
  const oppPick = pokemonPick?.side === 'opp' && !busy ? pokemonPick : null;
  // How many of the CPU's Benched Pokémon an attack wants (Tunneling), while they're being tapped.
  const benchMany = attack.benchCount;
  const oppLunge = attacker === view.opponent.id ? view.version : null;
  const opponent = view.opponent;
  return (
    // No hover preview on a phone: a long press inspects a card instead (Card).
    <PreviewContext.Provider value={() => {}}>
      <DndContext
        {...dnd}
        onDragEnd={(e) => {
          dragEndedAt.current = Date.now();
          dnd.onDragEnd(e);
        }}
      >
        {/* The whole screen, over the site's header, held still: nothing in it pans, zooms or selects text. */}
        <div className={`fixed inset-0 z-30 flex touch-none select-none flex-col overflow-hidden bg-slate-950 [-webkit-touch-callout:none] ${busy ? 'cursor-progress' : ''}`}>
          {/* The player's playmat (the Cosmetics tab) as the whole screen's background, both sides of the table, answering taps anywhere on it; drawn at 0.6 the size, to suit the phone's smaller cards. */}
          <Playmat id={playmat} className="-z-10" scale={0.6} />
          {self.pendingChoice && !pendingPick && (
            <FloatingDialog clickThrough={false} className="absolute left-1/2 top-1/2 z-[1000] w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 touch-pan-y">
              <PendingChoicePanel view={view} send={send} busy={busy} />
            </FloatingDialog>
          )}
          <PlayArea droppable={draggingTrainer && !busy} drop={dragging && heldCard ? { over: dropTarget !== null } : null} overlay={tableOverlay} cards="phone-cards h-full">
            <PhoneTable
              // The CPU's hand behind its side (no line of who it is and its hand count; agreed), face up while Clairvoyance works.
              oppHand={<PhoneOppHand count={opponent.handCount} faceUp={opponent.hand && { hand: opponent.hand, cards: view.cards }} onOpen={() => setCpuHand(true)} />}
              opponent={{
                bench: opponent.bench.map((p, i) => <OpponentSlot key={i} id={`cpu-bench-${i}`} target={i} pokemon={p} cards={view.cards} pick={oppPick} drop={oppDrop} lunge={oppLunge} spotlight={oppSpot} />),
                active: <OpponentSlot id="cpu-active" target="active" pokemon={opponent.active} cards={view.cards} large pick={oppPick} drop={oppDrop} lunge={oppLunge} spotlight={oppSpot} />,
                piles: (
                  <PhonePiles
                    deckCount={opponent.deckCount}
                    discard={opponent.discard}
                    cards={view.cards}
                    owner="The CPU's"
                    prizes={<PhonePrizes count={opponent.prizeCount} owner="The CPU's" faceUp={opponent.prizes && { prizes: opponent.prizes, cards: view.cards }} />}
                  />
                ),
              }}
              bar={
                <div className="relative flex min-h-14 shrink-0 items-center gap-2">
                  {/* Over the turn banner, which passes behind it. */}
                  <button
                    data-keep-action
                    className="relative z-[960] flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200 ring-1 ring-slate-600 transition active:scale-95"
                    aria-label="Menu: game log, run and Concede"
                    onClick={() => setMenu(true)}
                  >
                    <MenuIcon />
                  </button>
                  <StadiumCard view={view} send={send} busy={busy} notify={(message) => toasts.push('warning', message)} compact />
                  {/* Choosing several of the CPU's Benched Pokémon (Tunneling): the Active's panel steps aside so they can be tapped, so it's confirmed here. */}
                  {benchMany ? (
                    <button
                      data-keep-action
                      className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-40"
                      disabled={busy || attack.benchPicked.length !== benchMany}
                      onClick={() => attack.answer(attack.benchPicked)}
                    >
                      Attack ({attack.benchPicked.length}/{benchMany})
                    </button>
                  ) : (
                    statusBar(true)
                  )}
                  {newTurn && <TurnBanner key={newTurn.turn} turn={newTurn} inBar />}
                  {setupBanner}
                  {self.peek && (
                    <div className="absolute bottom-full left-0 z-10 mb-1 [--card-sm:var(--card-pile)]">
                      <PeekCard view={view} />
                    </div>
                  )}
                </div>
              }
              self={{
                bench: self.bench.map((p, i) => playerSlot(benchSlotId(i), p)),
                active: playerSlot('active', self.active),
                piles: (
                  <PhonePiles
                    deckCount={self.deckCount}
                    discard={self.discard}
                    cards={view.cards}
                    owner="Your"
                    prizes={<PhonePrizes count={self.prizeCount} owner="Your" faceUp={self.prizes && { prizes: self.prizes, cards: view.cards }} />}
                  />
                ),
              }}
              dialog={oppDialog && <FloatingDialog className="relative">{oppDialog}</FloatingDialog>}
            />
          </PlayArea>
          {handView(true)}
        </div>
        {menu && (
          <LogSheet
            log={view.log}
            you={view.you}
            pages
            coinFlips
            run={runTab}
            debug={debugEnabled ? { gameId, view } : undefined}
            onClose={() => setMenu(false)}
            actions={
              phase !== 'finished' && (
                <button
                  className="rounded bg-slate-700 px-4 py-2 text-sm transition hover:bg-slate-600 active:scale-95 disabled:cursor-progress"
                  disabled={busy}
                  onClick={() => {
                    setMenu(false);
                    send({ type: 'CONCEDE' });
                  }}
                >
                  Concede
                </button>
              )
            }
          />
        )}
        {cpuHand && opponent.hand && (
          <DiscardPane title="The CPU's hand" note={`${opponent.hand.length}, face up: Clairvoyance`} discard={opponent.hand} cards={view.cards} onClose={() => setCpuHand(false)} />
        )}
        {dragOverlay}
      </DndContext>
      <Toasts toasts={toasts.toasts} prompt={prompt} />
      {remindersDialog}
    </PreviewContext.Provider>
  );
}
