import { DndContext, DragOverlay } from '@dnd-kit/core';
import { lookupCard, type GameAction, type InPlayPokemon, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useState, type ReactNode } from 'react';
import { useAttack } from '../hooks/useAttack';
import { useCardPlay } from '../hooks/useCardPlay';
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
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
import { StatusBar } from './StatusBar';

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
  const { selected, dragging, hint, heldCard, highlighted, heldLabel, canPlay, clickHandCard, slotClick, deselect, dnd } = useCardPlay({
    view,
    send,
    busy,
    onDragStart: () => {
      setPreview(null);
      retreat.cancel();
      attack.cancel();
    },
  });

  // A hovered card can disappear without a mouseleave (played, knocked out), so reset on every update.
  useEffect(() => setPreview(null), [view.version]);

  // Warm the cache with the large images so the preview appears without a loading delay.
  useEffect(() => {
    for (const d of Object.values(view.cards)) if (d.imageUrl) new Image().src = `${d.imageUrl}/high.webp`;
  }, [view.cards]);

  const busySlot = pendingSlot(pending);

  const playerSlot = (id: SlotId, pokemon: InPlayPokemon | null, beside?: ReactNode) => {
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
      >
        {beside}
      </Slot>
    );
  };

  const attacks = self.active && phase !== 'setup' && (
    <div className="flex w-36 flex-col gap-1 self-center">
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
            deselect();
            retreat.cancel();
            attack.start(i);
          },
        }}
      />
      {attack.spec && <AttackChoicePanel spec={attack.spec} view={view} attack={attack} />}
      {myTurn && !attack.spec && (
        <RetreatPanel
          pokemon={self.active}
          cards={view.cards}
          retreat={{
            ...retreat,
            // Retreating, attacking and holding a hand card are exclusive.
            start: () => {
              deselect();
              attack.cancel();
              retreat.start();
            },
          }}
          pending={pending}
        />
      )}
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
                <div className="flex justify-center">{playerSlot('active', self.active, attacks)}</div>
                <div className="flex justify-center gap-2">{self.bench.map((p, i) => playerSlot(benchSlotId(i), p))}</div>
                <h3 className="text-center text-sm text-slate-400">You</h3>
              </div>
              <DeckAndDiscard deckCount={self.deckCount} discard={self.discard} cards={view.cards} />
            </section>

            <Hand
              hand={self.hand}
              cards={view.cards}
              selected={selected}
              pending={pending}
              canPlay={canPlay}
              onCardClick={(c) => {
                retreat.cancel();
                attack.cancel();
                clickHandCard(c);
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
