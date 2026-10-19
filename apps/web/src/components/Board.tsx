import { DndContext, DragOverlay } from '@dnd-kit/core';
import MenuIcon from '@mui/icons-material/Menu';
import { hasBenched, inPlayDef, lookupCard, shapeshiftCard, type GameAction, type InPlayPokemon, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAttack } from '../hooks/useAttack';
import { useCardPlay } from '../hooks/useCardPlay';
import { useIsPhone } from '../hooks/useIsPhone';
import { useLockedScreen } from '../hooks/useLockedScreen';
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
import { DiscardPane } from './DiscardPane';
import { FloatingDialog } from './FloatingDialog';
import { Hand } from './Hand';
import { LogDrawer, LogSheet } from './LogDrawer';
import { OpponentArea, OpponentSlot } from './OpponentArea';
import { PendingChoicePanel } from './PendingChoicePanel';
import { ActiveSheet } from './phone/ActiveSheet';
import { PhonePiles, PhonePrizes } from './phone/PhonePiles';
import { PhoneTable } from './phone/PhoneTable';
import { PlayArea } from './PlayArea';
import { PeekCard, PowerPanel } from './PowerPanel';
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
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

/**
 * The game table. Card play comes from useCardPlay; the board itself owns the hover preview. On a phone held upright
 * (useIsPhone) it's laid out for the phone instead (PhoneTable), filling the screen and locked in place
 * (useLockedScreen): your Active Pokémon's moves are in a sheet its tap opens (ActiveSheet), and the side panel's
 * tabs and Concede in a full-screen menu behind the round ☰ button (LogSheet). Everything else works the same.
 */
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
  info,
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
  /** Who you're up against and the battle's rules: the phone layout's top line (GamePage shows them itself otherwise). */
  info?: ReactNode;
}) {
  const debugEnabled = useDebugEnabled();
  const phone = useIsPhone();
  useLockedScreen(phone);
  /** The phone layout's sheet of the Active Pokémon's moves, and its ☰ menu. */
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  /** The phone layout's spread-out view of the CPU's hand, while it's face up (Clairvoyance). */
  const [cpuHand, setCpuHand] = useState(false);
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
  /** Starting one move cancels the others (attack, retreat, power, Trainer, held card). */
  const cancelAll = () => {
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
  // clicking anywhere except a Pokémon slot, a hand card or the move's own panel cancels it.
  const inProgress = trainer.card !== null || attack.spec !== null || power.spec !== null || selected !== null || retreat.retreating;
  const cancelAllRef = useRef(cancelAll);
  cancelAllRef.current = cancelAll;
  /** When the last drag ended: dropping a card fires a click where it lands, which mustn't cancel what the drop started. */
  const dragEndedAt = useRef(0);
  useEffect(() => {
    if (!inProgress) return;
    const onClick = (e: MouseEvent) => {
      if (Date.now() - dragEndedAt.current < 300) return;
      if (e.target instanceof Element && e.target.closest('[data-keep-action]')) return;
      cancelAllRef.current();
      setSheet(false);
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

  // The sheet closes once its move is made, and when the turn or the Active Pokémon changes.
  useEffect(() => {
    if (pending?.type === 'ATTACK' || pending?.type === 'RETREAT') setSheet(false);
  }, [pending]);
  useEffect(() => setSheet(false), [view.turn, phase, self.active?.card.uid]);

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
    // A benched Pokémon with a power is clicked to use it (its only option, so there's no menu); a warning says why it can't.
    const benchPower = myTurn && typeof target === 'number' ? power.powers.find((p) => p.source === target) : undefined;
    const powerSelected = typeof target === 'number' && power.usingSource === target;
    // A Trainer played as a Pokémon (Clefairy Doll) is clicked to discard it, unless it's the only Pokémon in play.
    const dollDef = pokemon && lookupCard(view.cards, pokemon.card.defId);
    const isDoll = myTurn && dollDef?.kind === 'pokemon' && !!dollDef.trainerText;
    // Secret Plan's face-down card is clicked to turn it over; Brock's Ninetales with a Shapeshift card, to discard that card.
    const faceDown = myTurn && !!pokemon?.faceDown;
    const shapeshifted = myTurn && !!pokemon && !!shapeshiftCard(pokemon);
    // On a phone, tapping your Active Pokémon opens the sheet of its moves (those above among them).
    const opensSheet = phone && id === 'active' && pokemon !== null && phase !== 'setup' && !heldCard && !retreat.ready;
    const slot = (
      <Slot
        key={id}
        id={id}
        pokemon={pokemon}
        cards={view.cards}
        large={id === 'active'}
        droppable={(highlighted.has(id) || switchIn) && !busy}
        highlight={isTarget ? 'target' : canPromote ? 'promote' : powerSelected ? 'power' : null}
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
              (opensSheet ? () => setSheet(true) : undefined) ??
              (canPromote ? () => send({ type: 'PROMOTE', slot: target as number }) : undefined) ??
              ((faceDown || shapeshifted) && !heldCard && !retreat.ready
                ? () => {
                    cancelAll();
                    send(faceDown ? { type: 'FLIP_FACE_DOWN', target } : { type: 'DISCARD_SHAPESHIFT', target });
                  }
                : undefined) ??
              (benchPower && !heldCard && !retreat.ready
                ? () => {
                    cancelAll();
                    if (benchPower.error) toasts.push('warning', `${benchPower.name}: ${benchPower.error}`);
                    else power.start(target as number);
                  }
                : undefined) ??
              (isDoll && !heldCard && !retreat.ready
                ? () => {
                    cancelAll();
                    if (!hasBenched(self)) toasts.push('warning', `You can't discard ${dollDef.name}: it's your only Pokémon in play`);
                    else send({ type: 'DISCARD_DOLL', target });
                  }
                : undefined))
        }
      />
    );
    return (
      <div key={id} className="relative">
        {slot}
      </div>
    );
  };

  const attackPanels = self.active && phase !== 'setup' && (
    <>
      <AttackList
        pokemon={self.active}
        defender={view.opponent.active}
        cards={view.cards}
        canAttack={myTurn && view.turn > 1 && !busy}
        damage={view.attackDamage}
        recall={!!self.recall}
        bench={self.bench}
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
      {!phone && <PeekCard view={view} />}
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
    </>
  );
  const attacks = attackPanels && (
    // Hangs off the active slot's right edge (.attack-column in index.css) so the slot stays centred whatever is shown here.
    <div data-keep-action className="attack-column absolute top-1/2 flex w-36 -translate-y-1/2 flex-col gap-1">
      {attackPanels}
    </div>
  );

  const handView = (compact: boolean) => (
    <Hand
      compact={compact}
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
  );
  const dragOverlay = (
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
  );
  /** Whose turn it is and End turn (with the setup buttons before the battle), between the two sides. */
  const statusBar = (compact: boolean) => (
    <StatusBar
      compact={compact}
      status={statusText(view)}
      canEndTurn={myTurn}
      setup={phase === 'setup' && !self.ready ? { canReset: !!self.active || self.bench.some(Boolean), canStart: !!self.active } : null}
      // Ask before ending the turn while an Energy, the Stadium or a Pokémon Power could still be used.
      reminders={endTurnReminders(view, power.powers)}
      pending={pending}
      send={send}
    />
  );
  /** Floats over the CPU's side: the Trainer being played, or Skip/Done for a choice of Pokémon that can be left (Sneak Attack can be skipped; Fairy Power is done whenever the player says so). */
  const oppDialog = pendingPick?.optional ? (
    <div className="rounded-lg bg-slate-800 p-2 ring-1 ring-slate-600">
      <button className="rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500" disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
        {pendingPick.kind === 'oppPokemon' ? 'Skip' : 'Done'}
      </button>
    </div>
  ) : (
    trainer.card && !trainer.prompt && <TrainerPanel view={view} trainer={trainer} />
  );

  /** The phone layout (see above): the same pieces, laid out by PhoneTable. */
  const phoneBoard = () => {
    const active = self.active;
    const activeDef = active && inPlayDef(view.cards, active);
    const doll = active && lookupCard(view.cards, active.card.defId);
    // What a click on the Active Pokémon does elsewhere (the bench's clicks) is a button in its sheet here.
    const activeMoves: { label: string; run: () => void }[] =
      myTurn && active
        ? [
            ...(active.faceDown ? [{ label: 'Turn it face up', run: () => send({ type: 'FLIP_FACE_DOWN', target: 'active' }) }] : []),
            ...(shapeshiftCard(active) ? [{ label: 'Discard its Shapeshift card', run: () => send({ type: 'DISCARD_SHAPESHIFT', target: 'active' }) }] : []),
            ...(doll?.kind === 'pokemon' && doll.trainerText
              ? [
                  {
                    label: `Discard ${doll.name}`,
                    run: () => (hasBenched(self) ? send({ type: 'DISCARD_DOLL', target: 'active' }) : toasts.push('warning', `You can't discard ${doll.name}: it's your only Pokémon in play`)),
                  },
                ]
              : []),
          ]
        : [];
    // Hidden while the board is needed: a Pokémon to choose for its move, a Pokémon to retreat to, or a card being dragged.
    const sheetShown = sheet && !!attackPanels && !pokemonPick && !retreat.ready && !dragging;
    const closeSheet = () => {
      cancelAll();
      setSheet(false);
    };
    const oppPick = pokemonPick?.side === 'opp' && !busy ? pokemonPick : null;
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
            {self.pendingChoice && !pendingPick && (
              <FloatingDialog clickThrough={false} className="absolute left-1/2 top-1/2 z-[1000] w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 touch-pan-y">
                <PendingChoicePanel view={view} send={send} busy={busy} />
              </FloatingDialog>
            )}
            <PlayArea droppable={draggingTrainer && !busy} drop={dragging && heldCard ? { over: dropTarget !== null } : null} overlay={overlay} cards="phone-cards h-full">
              <PhoneTable
                top={
                  <div className="flex h-4 shrink-0 items-center justify-between gap-2 text-[11px] leading-4 text-slate-400">
                    <span className="min-w-0 truncate">{info}</span>
                    {opponent.hand ? (
                      <button data-keep-action className="shrink-0 underline" onClick={() => setCpuHand(true)}>
                        CPU · hand {opponent.handCount} (face up)
                      </button>
                    ) : (
                      <span className="shrink-0">CPU · hand {opponent.handCount}</span>
                    )}
                  </div>
                }
                opponent={{
                  bench: opponent.bench.map((p, i) => <OpponentSlot key={i} id={`cpu-bench-${i}`} target={i} pokemon={p} cards={view.cards} pick={oppPick} lunge={oppLunge} />),
                  active: <OpponentSlot id="cpu-active" target="active" pokemon={opponent.active} cards={view.cards} large pick={oppPick} lunge={oppLunge} />,
                  prizes: <PhonePrizes count={opponent.prizeCount} owner="The CPU's" faceUp={opponent.prizes && { prizes: opponent.prizes, cards: view.cards }} />,
                  piles: <PhonePiles deckCount={opponent.deckCount} discard={opponent.discard} cards={view.cards} owner="The CPU's" />,
                }}
                bar={
                  <div className="relative flex min-h-14 shrink-0 items-center gap-2">
                    <button
                      data-keep-action
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200 ring-1 ring-slate-600 transition active:scale-95"
                      aria-label="Menu: game log, run and Concede"
                      onClick={() => setMenu(true)}
                    >
                      <MenuIcon />
                    </button>
                    <StadiumCard view={view} send={send} busy={busy} notify={(message) => toasts.push('warning', message)} compact />
                    {statusBar(true)}
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
                  prizes: <PhonePrizes count={self.prizeCount} owner="Your" faceUp={self.prizes && { prizes: self.prizes, cards: view.cards }} />,
                  piles: <PhonePiles deckCount={self.deckCount} discard={self.discard} cards={view.cards} owner="Your" />,
                }}
                dialog={oppDialog && <FloatingDialog className="relative">{oppDialog}</FloatingDialog>}
              />
            </PlayArea>
            {handView(true)}
            <TurnOrderFlip key={gameId} view={view} gameId={gameId} />
          </div>
          {sheetShown && activeDef && (
            <ActiveSheet title={activeDef.kind === 'pokemon' ? `${activeDef.name} · ${activeDef.hp - active!.damage}/${activeDef.hp} HP` : activeDef.name} onClose={closeSheet}>
              {attackPanels}
              {activeMoves.map((m) => (
                <button
                  key={m.label}
                  className="rounded bg-slate-600 px-2 text-left transition hover:bg-slate-500 active:scale-95"
                  disabled={busy}
                  onClick={() => {
                    closeSheet();
                    m.run();
                  }}
                >
                  {m.label}
                </button>
              ))}
            </ActiveSheet>
          )}
          {menu && (
            <LogSheet
              log={view.log}
              you={view.you}
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
      </PreviewContext.Provider>
    );
  };
  if (phone) return phoneBoard();

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
                dialog={oppDialog}
              />

              {/* Between the two sides: whose turn it is and End turn. */}
              {statusBar(false)}

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
                      <StadiumCard view={view} send={send} busy={busy} notify={(message) => toasts.push('warning', message)} />
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

            {handView(false)}
          </div>
          <LogDrawer log={view.log} you={view.you} coinFlips run={runTab} debug={debugEnabled ? { gameId, view } : undefined} />
          <TurnOrderFlip key={gameId} view={view} gameId={gameId} />
        </div>

        {dragOverlay}
      </DndContext>
      {preview && <CardPreview {...preview} />}
      <Toasts toasts={toasts.toasts} prompt={prompt} />
    </PreviewContext.Provider>
  );
}
