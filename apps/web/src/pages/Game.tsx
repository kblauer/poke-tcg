import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  canPayCost,
  isBasicPokemon,
  lookupCard,
  type CardDef,
  type CardInstance,
  type CardLibrary,
  type GameAction,
  type InPlayPokemon,
  type PlayerView,
  type PokemonCardDef,
  type Target,
} from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTRPC } from '../lib/trpc';

export function GamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewQuery = trpc.game.view.queryOptions({ gameId });
  const { data, error } = useQuery(viewQuery);

  // The response already includes the CPU's reply, so no polling or realtime is needed.
  const act = useMutation(
    trpc.game.act.mutationOptions({
      onSuccess: (view) => queryClient.setQueryData(viewQuery.queryKey, (old) => old && { ...old, view }),
      onError: () => queryClient.invalidateQueries({ queryKey: viewQuery.queryKey }),
    }),
  );

  if (error) return <p className="text-red-400">{error.message}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const view = data.view;
  // One move at a time: a second click would be built on a stale version and rejected.
  const send = (action: GameAction) => {
    if (!act.isPending) act.mutate({ gameId, expectedVersion: view.version, action });
  };
  const pending = act.isPending ? act.variables.action : null;
  return <Board view={view} send={send} pending={pending} error={act.error?.message} />;
}

/** Large card shown while hovering a card, on the half of the screen away from the pointer. */
interface Preview {
  def: CardDef;
  side: 'left' | 'right';
}
const PreviewContext = createContext<(preview: Preview | null) => void>(() => {});

/** A place a card can be played to: the active spot or one of the bench slots. */
type SlotId = 'active' | `bench-${number}`;
const benchSlotId = (slot: number): SlotId => `bench-${slot}`;
const toTarget = (slot: SlotId): Target => (slot === 'active' ? 'active' : Number(slot.slice('bench-'.length)));

/** Slot the in-flight action is about, so only that slot shows a loading state. */
function pendingSlot(action: GameAction | null): SlotId | null {
  switch (action?.type) {
    case 'SET_ACTIVE':
      return 'active';
    case 'PLAY_BENCH':
      return benchSlotId(action.slot);
    case 'ATTACH_ENERGY':
      return action.target === 'active' ? 'active' : benchSlotId(action.target);
    case 'PROMOTE':
      return benchSlotId(action.slot);
    default:
      return null;
  }
}

function Board({
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
  const { self, opponent, phase } = view;
  const myTurn = phase === 'playing' && view.currentPlayer === view.you;
  const mustPromote = phase === 'promote' && view.pendingPromotion === view.you;
  const def = (c: CardInstance) => lookupCard(view.cards, c.defId);

  /** Hand card picked by clicking; its valid slots are highlighted until a slot is clicked. */
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  // A hovered card can disappear without a mouseleave (played, knocked out), so reset on every update.
  useEffect(() => setPreview(null), [view.version]);

  // Warm the cache with the large images so the preview appears without a loading delay.
  useEffect(() => {
    for (const d of Object.values(view.cards)) if (d.imageUrl) new Image().src = `${d.imageUrl}/high.webp`;
  }, [view.cards]);
  const sensors = useSensors(
    // A small movement threshold keeps plain clicks working as "select".
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Drop the selection once the card has left the hand (played) or the game moved on.
  useEffect(() => {
    if (selected && !self.hand.some((c) => c.uid === selected)) setSelected(null);
  }, [self.hand, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const emptyBench = self.bench.flatMap((p, i) => (p ? [] : [benchSlotId(i)]));
  const occupied: SlotId[] = [...(self.active ? (['active'] as const) : []), ...self.bench.flatMap((p, i) => (p ? [benchSlotId(i)] : []))];

  /** Where a hand card can go right now (UI hint only – the server validates every move). */
  function targetsFor(card: CardInstance): SlotId[] {
    const d = def(card);
    if (phase === 'setup') return isBasicPokemon(d) && !self.active ? ['active'] : [];
    if (!myTurn) return [];
    if (isBasicPokemon(d)) return emptyBench;
    if (d.kind === 'energy' && !view.energyAttachedThisTurn) return occupied;
    return [];
  }

  function whyNoTargets(card: CardInstance): string {
    const d = def(card);
    if (phase === 'setup') return self.active ? 'Waiting for the CPU…' : 'Choose a Basic Pokémon as your active first.';
    if (!myTurn) return "It's not your turn.";
    if (d.kind === 'pokemon' && !isBasicPokemon(d)) return "Evolving isn't implemented yet.";
    if (isBasicPokemon(d)) return 'Your bench is full.';
    if (d.kind === 'energy') return "You've already attached an Energy this turn.";
    return "This card can't be played right now.";
  }

  function play(cardUid: string, slot: SlotId) {
    const card = self.hand.find((c) => c.uid === cardUid);
    if (!card || !targetsFor(card).includes(slot)) return;
    const d = def(card);
    const target = toTarget(slot);
    send(
      d.kind === 'energy'
        ? { type: 'ATTACH_ENERGY', cardUid, target }
        : target === 'active'
          ? { type: 'SET_ACTIVE', cardUid }
          : { type: 'PLAY_BENCH', cardUid, slot: target },
    );
    setSelected(null);
    setHint(null);
  }

  function onHandClick(card: CardInstance) {
    if (busy) return;
    if (selected === card.uid) return setSelected(null);
    if (targetsFor(card).length === 0) {
      setSelected(null);
      return setHint(whyNoTargets(card));
    }
    setHint(null);
    setSelected(card.uid);
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    setPreview(null);
    setSelected(null);
    setHint(null);
    setDragging(String(active.id));
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (over) play(String(active.id), over.id as SlotId);
  };

  const heldCard = self.hand.find((c) => c.uid === (dragging ?? selected));
  const highlighted = new Set(heldCard ? targetsFor(heldCard) : []);
  const busySlot = pendingSlot(pending);

  const status =
    phase === 'finished'
      ? view.winner === view.you
        ? 'You win!'
        : 'You lose.'
      : phase === 'setup'
        ? self.active
          ? 'Waiting for the CPU to choose an active Pokémon…'
          : 'Drag or click a Basic Pokémon into your active spot.'
        : mustPromote
          ? 'Choose a benched Pokémon to promote.'
          : myTurn
            ? `Your turn (turn ${view.turn})`
            : "CPU's turn";

  const mySlot = (id: SlotId, pokemon: InPlayPokemon | null, extra?: ReactNode) => {
    const canPromote = mustPromote && id !== 'active' && pokemon !== null;
    return (
      <Slot
        id={id}
        pokemon={pokemon}
        cards={view.cards}
        large={id === 'active'}
        droppable={highlighted.has(id) && !busy}
        highlight={highlighted.has(id) ? 'target' : canPromote ? 'promote' : null}
        loading={busySlot === id}
        onClick={
          busy
            ? undefined
            : selected && highlighted.has(id)
              ? () => play(selected, id)
              : canPromote
                ? () => send({ type: 'PROMOTE', slot: toTarget(id) as number })
                : undefined
        }
      >
        {extra}
      </Slot>
    );
  };

  const activeDef = self.active && (lookupCard(view.cards, self.active.card.defId) as PokemonCardDef);
  const canAttack = myTurn && view.turn > 1 && !busy;

  return (
    <PreviewContext.Provider value={(p) => !dragging && setPreview(p)}>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className={`space-y-4 ${busy ? 'cursor-progress' : ''}`}>
          <div className="flex items-center justify-between rounded bg-slate-900 p-3">
            <div>
              <span className="font-semibold">{status}</span>
              {hint && <span className="ml-3 text-sm text-amber-300">{hint}</span>}
            </div>
            <div className="flex gap-2">
              {myTurn && (
                <button
                  className="rounded bg-blue-600 px-3 py-1 transition hover:bg-blue-500 active:scale-95 disabled:cursor-progress"
                  disabled={busy}
                  onClick={() => send({ type: 'END_TURN' })}
                >
                  {pending?.type === 'END_TURN' ? 'Ending turn…' : 'End turn'}
                </button>
              )}
              {phase !== 'finished' && (
                <button
                  className="rounded bg-slate-700 px-3 py-1 transition hover:bg-slate-600 active:scale-95 disabled:cursor-progress"
                  disabled={busy}
                  onClick={() => send({ type: 'CONCEDE' })}
                >
                  Concede
                </button>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* CPU side mirrors the player's: bench on top, active nearest the middle. */}
          <section className="space-y-3 rounded-lg bg-slate-900 p-3">
            <h3 className="text-sm text-slate-400">
              CPU · hand {opponent.handCount} · deck {opponent.deckCount} · prizes {opponent.prizeCount}
            </h3>
            <div className="flex justify-center gap-2">
              {opponent.bench.map((p, i) => (
                <Slot key={i} id={`cpu-bench-${i}`} pokemon={p} cards={view.cards} />
              ))}
            </div>
            <div className="flex justify-center">
              <Slot id="cpu-active" pokemon={opponent.active} cards={view.cards} large />
            </div>
          </section>

          <section className="space-y-3 rounded-lg bg-slate-900 p-3">
            <div className="flex justify-center">
              {mySlot(
                'active',
                self.active,
                self.active && activeDef && phase !== 'setup' && (
                  <div className="flex w-36 flex-col gap-1 self-center">
                    {activeDef.attacks.map((a, i) => {
                      const affordable = canPayCost(self.active!, a, view.cards);
                      return (
                        <button
                          key={a.name}
                          disabled={!canAttack || !affordable}
                          onClick={() => send({ type: 'ATTACK', attackIndex: i })}
                          className={`rounded bg-red-600 px-2 py-1 text-left text-xs transition hover:bg-red-500 active:scale-95 disabled:hover:bg-red-600 ${
                            pending?.type === 'ATTACK' && pending.attackIndex === i
                              ? 'animate-pulse ring-2 ring-yellow-300'
                              : affordable && canAttack
                                ? ''
                                : 'disabled:opacity-40'
                          }`}
                        >
                          {a.name} ({a.damage})
                          {a.text && <span title={`Not implemented yet: ${a.text}`}> *</span>}
                        </button>
                      );
                    })}
                  </div>
                ),
              )}
            </div>
            <div className="flex justify-center gap-2">{self.bench.map((p, i) => mySlot(benchSlotId(i), p))}</div>
            <h3 className="text-center text-sm text-slate-400">
              You · deck {self.deckCount} · prizes {self.prizeCount}
            </h3>
          </section>

          <div>
            <h3 className="mb-2 text-sm text-slate-400">
              Your hand {selected && <span className="text-emerald-300">· click a highlighted slot (Esc to cancel)</span>}
            </h3>
            <div className="flex flex-wrap gap-2">
              {self.hand.map((c) => (
                <HandCard
                  key={c.uid}
                  card={c}
                  def={def(c)}
                  draggable={!busy && targetsFor(c).length > 0}
                  selected={selected === c.uid}
                  loading={pending !== null && 'cardUid' in pending && pending.cardUid === c.uid}
                  busy={busy}
                  onClick={() => onHandClick(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && heldCard ? (
            <div className="rotate-3 cursor-grabbing opacity-90">
              <Card def={def(heldCard)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {preview && <CardPreview {...preview} />}
    </PreviewContext.Provider>
  );
}

function CardPreview({ def, side }: Preview) {
  return (
    <div
      className={`pointer-events-none fixed top-1/2 z-50 w-72 -translate-y-1/2 ${side === 'left' ? 'left-4' : 'right-4'}`}
      aria-hidden
    >
      {def.imageUrl ? (
        <img src={`${def.imageUrl}/high.webp`} alt="" className="aspect-[63/88] w-full rounded-xl shadow-2xl ring-1 ring-black/40" />
      ) : (
        <div className="aspect-[63/88] w-full rounded-xl bg-slate-800 p-4 text-lg font-semibold shadow-2xl">{def.name}</div>
      )}
    </div>
  );
}

function HandCard({
  card,
  def,
  draggable,
  selected,
  loading,
  busy,
  onClick,
}: {
  card: CardInstance;
  def: CardDef;
  draggable: boolean;
  selected: boolean;
  loading: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: card.uid, disabled: !draggable });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      disabled={busy}
      className={`touch-none rounded-lg transition active:scale-95 disabled:cursor-progress ${
        isDragging
          ? 'opacity-30'
          : loading
            ? '-translate-y-2 animate-pulse ring-2 ring-yellow-300'
            : selected
              ? '-translate-y-3 ring-2 ring-emerald-400'
              : busy
                ? ''
                : 'hover:-translate-y-1'
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      <Card def={def} />
    </button>
  );
}

/**
 * The active spot or a bench slot. Player slots become drop targets while a card that
 * can go there is selected or being dragged.
 */
function Slot({
  id,
  pokemon,
  cards,
  large,
  droppable = false,
  highlight = null,
  loading = false,
  onClick,
  children,
}: {
  id: string;
  pokemon: InPlayPokemon | null;
  cards: CardLibrary;
  large?: boolean;
  droppable?: boolean;
  highlight?: 'target' | 'promote' | null;
  loading?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const ring = loading
    ? 'animate-pulse ring-2 ring-yellow-300'
    : isOver
      ? 'ring-4 ring-emerald-300'
      : highlight === 'target'
        ? 'ring-2 ring-emerald-400'
        : highlight === 'promote'
          ? 'ring-2 ring-yellow-400'
          : '';
  const size = large ? 'w-28' : 'w-20';
  return (
    <div className="flex gap-3">
      <div
        ref={setNodeRef}
        onClick={onClick}
        className={`${size} aspect-[63/88] shrink-0 rounded-lg transition ${ring} ${onClick ? 'cursor-pointer' : ''} ${
          pokemon ? '' : `border-2 border-dashed ${highlight === 'target' ? 'border-emerald-400 bg-emerald-400/10' : 'border-slate-700'}`
        }`}
      >
        {pokemon && <Card def={lookupCard(cards, pokemon.card.defId)} inPlay={pokemon} cards={cards} small={!large} />}
      </div>
      {children}
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  grass: 'bg-green-600',
  fire: 'bg-orange-600',
  water: 'bg-sky-600',
  lightning: 'bg-yellow-500',
  psychic: 'bg-purple-600',
  fighting: 'bg-amber-800',
  darkness: 'bg-slate-800',
  metal: 'bg-zinc-400',
  colorless: 'bg-slate-300',
};

const typeOf = (def: CardDef) => (def.kind === 'pokemon' ? def.type : def.energyType);

/** Card art from TCGdex (aspect ratio 63:88), with damage and attached energy overlaid when in play. */
function Card({ def, inPlay, cards, small }: { def: CardDef; inPlay?: InPlayPokemon; cards?: CardLibrary; small?: boolean }) {
  const setPreview = useContext(PreviewContext);
  const size = small ? 'w-20' : 'w-28';
  return (
    <div
      className={`${size} relative aspect-[63/88] shrink-0 overflow-hidden rounded-lg shadow`}
      onMouseEnter={(e) => setPreview({ def, side: e.clientX > window.innerWidth / 2 ? 'left' : 'right' })}
      onMouseLeave={() => setPreview(null)}
    >
      {def.imageUrl ? (
        <img src={`${def.imageUrl}/low.webp`} alt={def.name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className={`${TYPE_COLORS[typeOf(def)] ?? 'bg-slate-700'} h-full w-full p-2 text-xs font-semibold`}>{def.name}</div>
      )}
      {inPlay && def.kind === 'pokemon' && inPlay.damage > 0 && (
        <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white shadow">
          {def.hp - inPlay.damage}/{def.hp}
        </span>
      )}
      {inPlay && cards && inPlay.energy.length > 0 && (
        <div className="absolute bottom-1 left-1 flex flex-wrap gap-0.5">
          {inPlay.energy.map((e) => {
            const energy = lookupCard(cards, e.defId);
            return <span key={e.uid} title={energy.name} className={`${TYPE_COLORS[typeOf(energy)]} h-3 w-3 rounded-full border border-white shadow`} />;
          })}
        </div>
      )}
    </div>
  );
}
