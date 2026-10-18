import { DndContext, DragOverlay } from '@dnd-kit/core';
import { hasBenched, lookupCard, type GameAction, type InPlayPokemon, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAttack } from '../hooks/useAttack';
import { useCardPlay } from '../hooks/useCardPlay';
import { usePower } from '../hooks/usePower';
import { useToasts } from '../hooks/useToasts';
import { useTrainer } from '../hooks/useTrainer';
import { useRetreat } from '../hooks/useRetreat';
import { useWindowFill } from '../hooks/useWindowFill';
import { benchSlotId, pendingSlot, toTarget, type SlotId } from '../utils/slots';
import { useDebugEnabled } from '../utils/debug';
import { PAGE_WIDTH } from '../utils/layout';
import { centerOnPointer } from '../utils/dragOverlay';
import { isMyTurn, mustPromote, statusText } from '../utils/turn';
import { AttackChoicePanel } from './AttackChoicePanel';
import { AttackList } from './AttackList';
import { Card } from './Card';
import { CardPreview } from './CardPreview';
import { DeckAndDiscard } from './DeckAndDiscard';
import { FloatingDialog } from './FloatingDialog';
import { Hand } from './Hand';
import { LogDrawer } from './LogDrawer';
import { OpponentArea } from './OpponentArea';
import { PendingChoicePanel } from './PendingChoicePanel';
import { PlayArea } from './PlayArea';
import { BenchPowerButton, PeekCard, PowerPanel } from './PowerPanel';
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
import { SlotMenu } from './SlotMenu';
import { endTurnReminders } from '../utils/reminders';
import { StadiumCard } from './StadiumCard';
import { StatusBar } from './StatusBar';
import { TurnOrderFlip } from './TurnOrderFlip';
import { Toasts } from './Toasts';
import { TrainerPanel } from './TrainerPanel';

/** A move and the version of the view right after it. */
export interface LastMove {
  player: string;
  type: GameAction['type'];
  version: number;
}

/** The game table. Card play comes from useCardPlay; the board itself owns the hover preview. */
export function Board({
  view,
  lastMove = null,
  replaying = false,
  send,
  pending,
  error,
  errorAt,
  gameId,
  runTab,
  overlay,
}: {
  view: PlayerView;
  /** The move that led to `view`, if it just happened (for its animation). */
  lastMove?: LastMove | null;
  /** The CPU's reply is being shown move by move: nothing can be done until it ends. */
  replaying?: boolean;
  send: (a: GameAction) => void;
  /** The action waiting on the server, if any. */
  pending: GameAction | null;
  error?: string;
  /** When the move that failed was sent, so the same error twice still shows twice. */
  errorAt?: number;
  /** For the debug tools (game log's Debug tab). */
  gameId: string;
  /** A run's battle: the side panel's Run tab (HP, ₱, EXP, the Bag). */
  runTab?: ReactNode;
  /** Shown over the play area, centred on it: the coin flips (CoinFlip). */
  overlay?: ReactNode;
}) {
  const debugEnabled = useDebugEnabled();
  const busy = pending !== null || replaying;
  // The attacker lunges at the defender in the view right after its attack.
  const attacker = lastMove?.type === 'ATTACK' && lastMove.version === view.version ? lastMove.player : null;
  const { self, phase } = view;
  const myTurn = isMyTurn(view);
  const promoting = mustPromote(view);

  const [preview, setPreview] = useState<Preview | null>(null);
  const toasts = useToasts();
  const retreat = useRetreat({ view, send, busy });
  const attack = useAttack({ view, send, busy });
  const power = usePower({ view, send, busy });
  const trainer = useTrainer({ view, send, busy });
  /** Clefairy Doll in play that was clicked to show its Discard button. */
  const [dollMenu, setDollMenu] = useState<Target | null>(null);
  useEffect(() => setDollMenu(null), [view.version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDollMenu(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  /** Starting one move cancels the others (attack, retreat, power, Trainer, held card). */
  const cancelAll = () => {
    setDollMenu(null);
    deselect();
    attack.cancel();
    retreat.cancel();
    power.cancel();
    trainer.cancel();
  };
  const { selected, dragging, dropTarget, heldCard, highlighted, heldLabel, canPlay, clickHandCard, slotClick, deselect, dnd } = useCardPlay({
    view,
    send,
    busy,
    onDragStart: () => {
      setPreview(null);
      setDollMenu(null);
      retreat.cancel();
      attack.cancel();
      power.cancel();
      trainer.cancel();
    },
    onDropOnPlayArea: (c) => trainer.isTrainer(c) && trainer.drop(c),
    notify: (message) => toasts.push('warning', message),
  });

  // Alerts and errors show as messages in the bottom right that fade away (Toasts). A held card's
  // instruction is a prompt there instead: it stays up while the card is held and goes the moment it's played or put down.
  // Heal's "click one of your Pokémon" is answered on the board, so it's a prompt rather than a dialog. So is Sneak
  // Attack's "click one of the opponent's Pokémon", with a small dialog for skipping it.
  const pendingPick = self.pendingChoice?.kind === 'ownPokemon' || self.pendingChoice?.kind === 'oppPokemon' ? self.pendingChoice : null;
  const prompt = pendingPick ? pendingPick.prompt : selected ? 'Click a highlighted slot (Esc to cancel)' : trainer.prompt;
  useEffect(() => {
    if (error) toasts.push('error', error);
  }, [error, errorAt]);
  // While a move is being set up (a Trainer or attack asking questions, a power, a held card, retreating,
  // a Pokémon's menu), clicking anywhere except a Pokémon slot, a hand card or the move's own panel cancels it.
  const inProgress =
    trainer.card !== null || attack.spec !== null || power.spec !== null || power.selected !== null || dollMenu !== null || selected !== null || retreat.retreating;
  const cancelAllRef = useRef(cancelAll);
  cancelAllRef.current = cancelAll;
  /** When the last drag ended: dropping a card fires a click where it lands, which mustn't cancel what the drop started. */
  const dragEndedAt = useRef(0);
  useEffect(() => {
    if (!inProgress) return;
    const onClick = (e: MouseEvent) => {
      if (Date.now() - dragEndedAt.current < 300) return;
      if (!(e.target instanceof Element && e.target.closest('[data-keep-action]'))) cancelAllRef.current();
    };
    // Capture phase: checked before React handles the click, while its target is still in the page. A handler
    // that re-renders (the dialog's eye button swaps its icon) would otherwise detach the target, and a
    // detached element is inside nothing, so the click would wrongly cancel the move.
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [inProgress]);

  /** A Trainer card is being dragged: the whole play area is its drop target. */
  const draggingTrainer = dragging !== null && heldCard !== undefined && trainer.isTrainer(heldCard);

  // The table runs from just under the header to the bottom of the window. The header's height isn't
  // fixed, so measure where the table starts rather than guessing.
  const table = useWindowFill<HTMLDivElement>();

  // A hovered card can disappear without a mouseleave (played, knocked out), so reset on every update.
  useEffect(() => setPreview(null), [view.version]);

  // Warm the cache with the large images so the preview appears without a loading delay.
  useEffect(() => {
    for (const d of Object.values(view.cards)) if (d.imageUrl) new Image().src = `${d.imageUrl}/high.webp`;
  }, [view.cards]);

  const busySlot = pendingSlot(pending);

  /** An attack, power or Trainer asking for a Pokémon in play: it's chosen by clicking the Pokémon. */
  const pokemonPick: { side: 'own' | 'opp'; options: Target[]; pick: (t: Target) => void; picked?: Target[] } | null =
    pendingPick
      ? { side: pendingPick.kind === 'ownPokemon' ? 'own' : 'opp', options: pendingPick.options, pick: (target) => send({ type: 'RESOLVE_CHOICE', target }) }
      : attack.spec?.kind === 'opponentBench'
      ? { side: 'opp', options: attack.spec.options, pick: attack.answer }
      : attack.spec?.kind === 'ownBench' || attack.spec?.kind === 'ownPokemon'
        ? { side: 'own', options: attack.spec.options, pick: attack.answer }
      : attack.spec?.kind === 'opponentPokemon' || attack.spec?.kind === 'opponentPokemonTo'
        ? { side: 'opp', options: attack.spec.options, pick: attack.answer }
      : attack.spec?.kind === 'opponentBenchMany'
        ? { side: 'opp', options: attack.spec.options, pick: (t) => attack.toggleBench(t as number), picked: attack.benchPicked }
      : power.spec?.kind === 'ownPokemon' || power.spec?.kind === 'oppPokemon'
        ? { side: power.spec.kind === 'ownPokemon' ? 'own' : 'opp', options: power.spec.options, pick: power.answer }
        : trainer.spec?.kind === 'pokemon' && trainer.card && !trainer.error(trainer.card)
          ? { side: trainer.spec.side, options: trainer.spec.options, pick: trainer.answer }
          : null;

  const playerSlot = (id: SlotId, pokemon: InPlayPokemon | null) => {
    const switchIn = retreat.targets.has(id);
    const choosable = pokemonPick?.side === 'own' && pokemonPick.options.includes(toTarget(id));
    const isTarget = highlighted.has(id) || switchIn || choosable;
    const canPromote = promoting && id !== 'active' && pokemon !== null;
    const target = toTarget(id);
    // A benched Pokémon with a power is clicked to show its Activate button.
    const hasPower = myTurn && typeof target === 'number' && power.powers.some((p) => p.source === target);
    const powerSelected = typeof target === 'number' && (power.selected === target || power.usingSource === target);
    // A Trainer played as a Pokémon (Clefairy Doll) is clicked to show its Discard button.
    const dollDef = pokemon && lookupCard(view.cards, pokemon.card.defId);
    const isDoll = myTurn && dollDef?.kind === 'pokemon' && !!dollDef.trainerText;
    const slot = (
      <Slot
        key={id}
        id={id}
        pokemon={pokemon}
        cards={view.cards}
        large={id === 'active'}
        droppable={(highlighted.has(id) || switchIn) && !busy}
        highlight={isTarget ? 'target' : canPromote ? 'promote' : powerSelected || dollMenu === target ? 'power' : null}
        label={choosable ? 'Choose' : switchIn ? 'Switch' : isTarget ? heldLabel : canPromote ? 'Promote' : null}
        // While a card is held, retreating or a Pokémon is being chosen, fade the ones that can't be picked so the targets stand out.
        dimmed={((heldCard !== undefined && !draggingTrainer) || retreat.ready || pokemonPick !== null) && pokemon !== null && !isTarget}
        loading={busySlot === id}
        lunge={id === 'active' && attacker === view.you ? { dir: 'up', stamp: view.version } : null}
        onClick={
          busy
            ? undefined
            : choosable
              ? () => pokemonPick!.pick(target)
              : pokemonPick
                ? undefined
                : (slotClick(id) ??
              retreat.slotClick(id) ??
              (canPromote ? () => send({ type: 'PROMOTE', slot: target as number }) : undefined) ??
              (hasPower && !heldCard && !retreat.ready
                ? () => {
                    const wasSelected = power.selected === target;
                    cancelAll();
                    if (!wasSelected) power.select(target as number);
                  }
                : undefined) ??
              (isDoll && !heldCard && !retreat.ready
                ? () => {
                    const wasSelected = dollMenu === target;
                    cancelAll();
                    if (!wasSelected) setDollMenu(target);
                  }
                : undefined))
        }
      />
    );
    return (
      <div key={id} className="relative">
        {slot}
        {typeof target === 'number' && power.selected === target && <BenchPowerButton power={power} slot={target} busy={busy} />}
        {isDoll && dollMenu === target && (
          <SlotMenu>
            <button
              disabled={busy || !hasBenched(self)}
              onClick={() => send({ type: 'DISCARD_DOLL', target })}
              className="w-full rounded bg-slate-600 px-2 py-1 text-left text-xs transition hover:bg-slate-500 active:scale-95 disabled:opacity-40"
            >
              Discard {dollDef.name}
            </button>
            {!hasBenched(self) && <p className="text-slate-400">You can't discard your only Pokémon in play.</p>}
          </SlotMenu>
        )}
      </div>
    );
  };

  const attacks = self.active && phase !== 'setup' && (
    // Hangs off the active slot's right edge (.attack-column in index.css) so the slot stays centred whatever is shown here.
    <div data-keep-action className="attack-column absolute top-1/2 flex w-36 -translate-y-1/2 flex-col gap-1">
      <AttackList
        pokemon={self.active}
        defender={view.opponent.active}
        cards={view.cards}
        canAttack={myTurn && view.turn > 1 && !busy}
        damage={view.attackDamage}
        pending={pending}
        attack={{
          ...attack,
          // Attacking, retreating and holding a hand card are exclusive.
          start: (i) => {
            cancelAll();
            attack.start(i);
          },
        }}
      />
      {attack.spec && <AttackChoicePanel spec={attack.spec} view={view} attack={attack} />}
      {myTurn && !attack.spec && !power.spec && (
        <RetreatPanel
          pokemon={self.active}
          cards={view.cards}
          retreat={{
            ...retreat,
            // Retreating, attacking and holding a hand card are exclusive.
            start: () => {
              cancelAll();
              retreat.start();
            },
          }}
          pending={pending}
        />
      )}
      <PeekCard view={view} />
      {myTurn && !attack.spec && (
        <PowerPanel
          view={view}
          busy={busy}
          power={{
            ...power,
            start: (source) => {
              cancelAll();
              power.start(source);
            },
          }}
        />
      )}
    </div>
  );

  return (
    <PreviewContext.Provider value={(p) => !dragging && setPreview(p)}>
      <DndContext
        {...dnd}
        onDragEnd={(e) => {
          dragEndedAt.current = Date.now();
          dnd.onDragEnd(e);
        }}
      >
        {/*
          Fills the window below the header. The game log runs from the header to the bottom of the window at its
          edge, outside the page margins (-mt/-mb undo the layout's spacing); the table, inside the margins, takes all
          the height the hand leaves.
        */}
        <div ref={table.ref} className={`-mb-4 -mt-6 flex ${busy ? 'cursor-progress' : ''}`} style={table.style}>
          {/* Clips the hand cards where they run past the bottom of the window. */}
          <div className={`relative flex min-w-0 flex-1 flex-col gap-3 overflow-hidden pt-6 ${PAGE_WIDTH}`}>
            {/*
              Searching the deck: a big dialog in the middle of the table, as wide as its cards need. It sits here, beside
              the PlayArea rather than in it (its container-type would trap the dialog), and not in the window, which
              also holds the game log.
            */}
            {self.pendingChoice && !pendingPick && (
              <FloatingDialog clickThrough={false} className="absolute left-1/2 top-1/2 z-[1000] w-fit max-w-[min(56rem,90%)] -translate-x-1/2 -translate-y-1/2">
                <PendingChoicePanel view={view} send={send} busy={busy} />
              </FloatingDialog>
            )}

            <PlayArea
              droppable={draggingTrainer && !busy}
              drop={dragging && heldCard ? { over: dropTarget !== null } : null}
              overlay={overlay}
            >
              <OpponentArea
                opponent={view.opponent}
                cards={view.cards}
                pick={pokemonPick?.side === 'opp' && !busy ? pokemonPick : null}
                lunge={attacker === view.opponent.id ? view.version : null}
                dialog={
                  pendingPick?.kind === 'oppPokemon' ? (
                    <div className="rounded-lg bg-slate-800 p-2 ring-1 ring-slate-600">
                      <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
                        Skip
                      </button>
                    </div>
                  ) : (
                    trainer.card && !trainer.prompt && <TrainerPanel view={view} trainer={trainer} />
                  )
                }
              />

              {/* Between the two sides: whose turn it is and End turn. */}
              <StatusBar
                status={statusText(view)}
                canEndTurn={myTurn}
                setup={phase === 'setup' && !self.ready ? { canReset: !!self.active || self.bench.some(Boolean), canStart: !!self.active } : null}
                // Ask before ending the turn while an Energy, the Stadium or a Pokémon Power could still be used.
                reminders={endTurnReminders(view, power.powers)}
                pending={pending}
                send={send}
              />

              {/* Prize cards on the left of the play area; discard pile and deck on the right. */}
              <section className="flex min-h-0 flex-1 items-center rounded-lg bg-slate-900 p-3">
                {/* Bottom-aligned, with the side columns lifted past the "You" label (text-sm + space-y-3 = 2rem) to line up with the bench. */}
                <div className="flex w-full items-end gap-3">
                  <div className="mb-8 flex flex-col gap-2">
                    {phase !== 'finished' && (
                      <button
                        className="w-full rounded bg-slate-700 px-2 py-1 text-xs transition hover:bg-slate-600 active:scale-95 disabled:cursor-progress"
                        disabled={busy}
                        onClick={() => send({ type: 'CONCEDE' })}
                      >
                        Concede
                      </button>
                    )}
                    <PrizeCards count={self.prizeCount} faceUp={self.prizes && { prizes: self.prizes, cards: view.cards }} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="relative flex justify-center">
                      <StadiumCard view={view} send={send} busy={busy} />
                      {playerSlot('active', self.active)}
                      {attacks}
                    </div>
                    <div className="flex justify-center gap-2">{self.bench.map((p, i) => playerSlot(benchSlotId(i), p))}</div>
                    <h3 className="text-center text-sm text-slate-400">You</h3>
                  </div>
                  <div className="mb-8">
                    <DeckAndDiscard deckCount={self.deckCount} discard={self.discard} cards={view.cards} owner="Your" />
                  </div>
                </div>
              </section>
            </PlayArea>

            <Hand
              hand={self.hand}
              cards={view.cards}
              selected={selected ?? trainer.card?.uid ?? null}
              pick={trainer.handPick && !busy ? trainer.handPick : null}
              pending={pending}
              // Trainers are dragged onto the play area when they can be played.
              canPlay={(c) => (trainer.isTrainer(c) ? trainer.error(c) === null : canPlay(c))}
              onCardClick={(c) => {
                // A Trainer asking for cards from the hand: clicks pick them (other cards do nothing).
                if (trainer.handPick && trainer.card?.uid !== c.uid) {
                  if (trainer.handPick.options.has(c.uid)) trainer.handPick.toggle(c.uid);
                  return;
                }
                const wasTrainer = trainer.card?.uid === c.uid;
                attack.cancel();
                retreat.cancel();
                power.cancel();
                if (trainer.isTrainer(c)) {
                  deselect();
                  // Clicking the open Trainer again closes it. One that can't be played just says why, like other cards.
                  const why = trainer.error(c);
                  if (wasTrainer) trainer.cancel();
                  else if (why) {
                    trainer.cancel();
                    toasts.push('warning', why);
                  } else trainer.start(c);
                } else {
                  trainer.cancel();
                  clickHandCard(c);
                }
              }}
            />
          </div>
          <LogDrawer log={view.log} you={view.you} coinFlips run={runTab} debug={debugEnabled ? { gameId, view } : undefined} />
          <TurnOrderFlip key={gameId} view={view} gameId={gameId} />
        </div>

        <DragOverlay dropAnimation={null} modifiers={[centerOnPointer]}>
          {dragging && heldCard ? (
            // dnd-kit sizes the overlay like the card that was grabbed, which is bigger when it's a hovered hand card;
            // centring the image in it keeps it centred on the pointer (centerOnPointer centres the overlay).
            <div className="flex h-full w-full items-center justify-center">
              <div className="rotate-3 cursor-grabbing opacity-90">
                <Card def={lookupCard(view.cards, heldCard.defId)} highRes />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {preview && <CardPreview {...preview} />}
      <Toasts toasts={toasts.toasts} prompt={prompt} />
    </PreviewContext.Provider>
  );
}
