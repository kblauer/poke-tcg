import { DndContext, DragOverlay } from '@dnd-kit/core';
import { lookupCard, type GameAction, type InPlayPokemon, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { useAttack } from '../hooks/useAttack';
import { useCardPlay } from '../hooks/useCardPlay';
import { usePower } from '../hooks/usePower';
import { useTrainer } from '../hooks/useTrainer';
import { useRetreat } from '../hooks/useRetreat';
import { benchSlotId, pendingSlot, toTarget, type SlotId } from '../utils/slots';
import { isMyTurn, mustPromote, statusText } from '../utils/turn';
import { AttackChoicePanel } from './AttackChoicePanel';
import { AttackList } from './AttackList';
import { Card } from './Card';
import { CardPreview } from './CardPreview';
import { CoinFlip } from './CoinFlip';
import { DeckAndDiscard } from './DeckAndDiscard';
import { GameLog } from './GameLog';
import { Hand } from './Hand';
import { OpponentArea } from './OpponentArea';
import { PendingChoicePanel } from './PendingChoicePanel';
import { PowerPanel } from './PowerPanel';
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
import { StatusBar } from './StatusBar';
import { TrainerPanel } from './TrainerPanel';

/** The game table. Card play comes from useCardPlay; the board itself owns the hover preview. */
export function Board({
  view,
  send,
  pending,
  error,
}: {
  view: PlayerView;
  send: (a: GameAction) => void;
  /** The action waiting on the server, if any. */
  pending: GameAction | null;
  error?: string;
}) {
  const busy = pending !== null;
  const { self, phase } = view;
  const myTurn = isMyTurn(view);
  const promoting = mustPromote(view);

  const [preview, setPreview] = useState<Preview | null>(null);
  const retreat = useRetreat({ view, send, busy });
  const attack = useAttack({ view, send, busy });
  const power = usePower({ view, send, busy });
  const trainer = useTrainer({ view, send, busy });
  /** Starting one move cancels the others (attack, retreat, power, Trainer, held card). */
  const cancelAll = () => {
    deselect();
    attack.cancel();
    retreat.cancel();
    power.cancel();
    trainer.cancel();
  };
  const { selected, dragging, hint, heldCard, highlighted, heldLabel, canPlay, clickHandCard, slotClick, deselect, dnd } = useCardPlay({
    view,
    send,
    busy,
    onDragStart: () => {
      setPreview(null);
      retreat.cancel();
      attack.cancel();
      power.cancel();
      trainer.cancel();
    },
  });

  // A hovered card can disappear without a mouseleave (played, knocked out), so reset on every update.
  useEffect(() => setPreview(null), [view.version]);

  // Warm the cache with the large images so the preview appears without a loading delay.
  useEffect(() => {
    for (const d of Object.values(view.cards)) if (d.imageUrl) new Image().src = `${d.imageUrl}/high.webp`;
  }, [view.cards]);

  const busySlot = pendingSlot(pending);

  const playerSlot = (id: SlotId, pokemon: InPlayPokemon | null) => {
    const switchIn = retreat.targets.has(id);
    const isTarget = highlighted.has(id) || switchIn;
    const canPromote = promoting && id !== 'active' && pokemon !== null;
    return (
      <Slot
        key={id}
        id={id}
        pokemon={pokemon}
        cards={view.cards}
        large={id === 'active'}
        droppable={isTarget && !busy}
        highlight={isTarget ? 'target' : canPromote ? 'promote' : null}
        label={switchIn ? 'Switch' : isTarget ? heldLabel : canPromote ? 'Promote' : null}
        // While a card is held or retreating, fade the Pokémon it can't go to so the targets stand out.
        dimmed={(heldCard !== undefined || retreat.ready) && pokemon !== null && !isTarget}
        loading={busySlot === id}
        onClick={busy ? undefined : (slotClick(id) ?? retreat.slotClick(id) ?? (canPromote ? () => send({ type: 'PROMOTE', slot: toTarget(id) as number }) : undefined))}
      />
    );
  };

  /** Trainers played as Pokémon (Clefairy Doll), which can be discarded during your turn. */
  const dolls = [self.active, ...self.bench].flatMap((p, i) => {
    const def = p && lookupCard(view.cards, p.card.defId);
    return def?.kind === 'pokemon' && def.trainerText ? [{ target: (i === 0 ? 'active' : i - 1) as Target, name: def.name }] : [];
  });

  const attacks = self.active && phase !== 'setup' && (
    // Hangs off the active slot's right edge (w-28 slot, 0.75rem gap) so the slot stays centred whatever is shown here.
    <div className="absolute left-[calc(50%+4.25rem)] top-1/2 flex w-36 -translate-y-1/2 flex-col gap-1">
      <AttackList
        pokemon={self.active}
        defender={view.opponent.active}
        cards={view.cards}
        canAttack={myTurn && view.turn > 1 && !busy}
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
      {myTurn &&
        !attack.spec &&
        dolls.map(({ target, name }) => (
          <button
            key={String(target)}
            disabled={busy}
            onClick={() => send({ type: 'DISCARD_DOLL', target })}
            className="rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95 disabled:opacity-40"
          >
            Discard {name}
          </button>
        ))}
    </div>
  );

  return (
    <PreviewContext.Provider value={(p) => !dragging && setPreview(p)}>
      <DndContext {...dnd}>
        {/* The table, with the game log beside it on large screens. */}
        <div className={`grid gap-4 lg:grid-cols-[1fr_16rem] ${busy ? 'cursor-progress' : ''}`}>
          <div className="min-w-0 space-y-4">
            <StatusBar status={statusText(view)} hint={hint} canEndTurn={myTurn} canConcede={phase !== 'finished'} pending={pending} send={send} />
            {error && <p className="text-sm text-red-400">{error}</p>}

            <OpponentArea opponent={view.opponent} cards={view.cards} />

            {/* Prize cards on the left of the play area; discard pile and deck on the right. */}
            <section className="flex gap-3 rounded-lg bg-slate-900 p-3">
              <PrizeCards count={self.prizeCount} />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="relative flex justify-center">
                  {playerSlot('active', self.active)}
                  {attacks}
                </div>
                <div className="flex justify-center gap-2">{self.bench.map((p, i) => playerSlot(benchSlotId(i), p))}</div>
                <h3 className="text-center text-sm text-slate-400">You</h3>
              </div>
              <DeckAndDiscard deckCount={self.deckCount} discard={self.discard} cards={view.cards} />
            </section>

            <PendingChoicePanel view={view} send={send} busy={busy} />
            <TrainerPanel view={view} trainer={trainer} />
            <Hand
              hand={self.hand}
              cards={view.cards}
              selected={selected ?? trainer.card?.uid ?? null}
              pending={pending}
              canPlay={canPlay}
              onCardClick={(c) => {
                const wasTrainer = trainer.card?.uid === c.uid;
                attack.cancel();
                retreat.cancel();
                power.cancel();
                if (trainer.isTrainer(c)) {
                  deselect();
                  // Clicking the open Trainer again closes it.
                  if (wasTrainer) trainer.cancel();
                  else trainer.start(c);
                } else {
                  trainer.cancel();
                  clickHandCard(c);
                }
              }}
            />
          </div>
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <GameLog log={view.log} you={view.you} />
            <CoinFlip log={view.log} you={view.you} />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && heldCard ? (
            <div className="rotate-3 cursor-grabbing opacity-90">
              <Card def={lookupCard(view.cards, heldCard.defId)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {preview && <CardPreview {...preview} />}
    </PreviewContext.Provider>
  );
}
