import { DndContext, DragOverlay } from '@dnd-kit/core';
import { hasBenched, lookupCard, type GameAction, type InPlayPokemon, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState } from 'react';
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
import { PlayArea } from './PlayArea';
import { BenchPowerButton, PowerPanel } from './PowerPanel';
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
import { SlotMenu } from './SlotMenu';
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
  const { selected, dragging, hint, heldCard, highlighted, heldLabel, canPlay, clickHandCard, slotClick, deselect, dnd } = useCardPlay({
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
  });
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
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [inProgress]);

  /** A Trainer card is being dragged: the whole play area is its drop target. */
  const draggingTrainer = dragging !== null && heldCard !== undefined && trainer.isTrainer(heldCard);

  // A hovered card can disappear without a mouseleave (played, knocked out), so reset on every update.
  useEffect(() => setPreview(null), [view.version]);

  // Warm the cache with the large images so the preview appears without a loading delay.
  useEffect(() => {
    for (const d of Object.values(view.cards)) if (d.imageUrl) new Image().src = `${d.imageUrl}/high.webp`;
  }, [view.cards]);

  const busySlot = pendingSlot(pending);

  /** An attack, power or Trainer asking for a Pokémon in play: it's chosen by clicking the Pokémon. */
  const pokemonPick: { side: 'own' | 'opp'; options: Target[]; pick: (t: Target) => void } | null =
    attack.spec?.kind === 'opponentBench'
      ? { side: 'opp', options: attack.spec.options, pick: attack.answer }
      : power.spec?.kind === 'ownPokemon'
        ? { side: 'own', options: power.spec.options, pick: power.answer }
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
              className="w-full rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95 disabled:opacity-40"
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
    // Hangs off the active slot's right edge (w-28 slot, 0.75rem gap) so the slot stays centred whatever is shown here.
    <div data-keep-action className="absolute left-[calc(50%+4.25rem)] top-1/2 flex w-36 -translate-y-1/2 flex-col gap-1">
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
        {/* The table, with the game log beside it on large screens. */}
        <div className={`grid gap-4 lg:grid-cols-[1fr_16rem] ${busy ? 'cursor-progress' : ''}`}>
          <div className="min-w-0 space-y-4">
            <StatusBar status={statusText(view)} hint={hint} canEndTurn={myTurn} canConcede={phase !== 'finished'} pending={pending} send={send} />
            {error && <p className="text-sm text-red-400">{error}</p>}

            <PlayArea droppable={draggingTrainer && !busy}>
              <OpponentArea opponent={view.opponent} cards={view.cards} pick={pokemonPick?.side === 'opp' && !busy ? pokemonPick : null} />

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
            </PlayArea>

            <PendingChoicePanel view={view} send={send} busy={busy} />
            <TrainerPanel view={view} trainer={trainer} />
            <Hand
              hand={self.hand}
              cards={view.cards}
              selected={selected ?? trainer.card?.uid ?? null}
              pending={pending}
              // Trainers are dragged onto the play area when they can be played.
              canPlay={(c) => (trainer.isTrainer(c) ? trainer.error(c) === null : canPlay(c))}
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
