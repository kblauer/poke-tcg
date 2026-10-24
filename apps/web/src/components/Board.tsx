import { DndContext, DragOverlay } from '@dnd-kit/core';
import MenuIcon from '@mui/icons-material/Menu';
import { hasBenched, inPlayDef, lookupCard, shapeshiftCard, type CardLibrary, type GameAction, type InPlayPokemon, type MoveHighlight, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { useCosmetics } from '../hooks/useCosmetics';
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
import { LogSheet } from './LogDrawer';
import { OpponentArea, OpponentSlot, type Spotlight } from './OpponentArea';
import { BoardMusicControls } from './MusicPlayer';
import { PendingChoicePanel } from './PendingChoicePanel';
import { PhoneOppHand, PhonePiles, PhonePrizes } from './phone/PhonePiles';
import { PhoneTable } from './phone/PhoneTable';
import { PlayArea } from './PlayArea';
import { Playmat } from './Playmat';
import { PeekCard, PowerPanel } from './PowerPanel';
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
import { endTurnReminders } from '../utils/reminders';
import { PLAYED_CARD_BURST_MS, PlayedCard } from './PlayedCard';
import { TurnBanner, useNewTurn } from './TurnBanner';
import { StadiumCard } from './StadiumCard';
import { StatusBar, useTurnReminders } from './StatusBar';
import { TurnOrderFlip } from './TurnOrderFlip';
import { Toasts } from './Toasts';
import { TrainerPanel } from './TrainerPanel';

/** A move and the version of the view right after it. */
export interface LastMove {
  player: string;
  type: GameAction['type'];
  version: number;
  /** The CPU's move: the card it played or used and the Pokémon it changed (shown by PlayedCard and the slots' glow). */
  highlight?: MoveHighlight | null;
  /** Its card was shown before the move (ahead of its coin flips), so the Pokémon it changed glow at once. */
  cardFirst?: boolean;
}

/** A card the CPU played or used, to show large (PlayedCard): its definition from the view after the move, and that view's version. */
export interface PlayedMove {
  defId: string;
  cards: CardLibrary;
  stamp: number;
}

/**
 * The game table. Card play comes from useCardPlay; the board itself owns the hover preview. On a phone held upright
 * (useIsPhone) it's laid out for the phone instead (PhoneTable), filling the screen and locked in place
 * (useLockedScreen): the side panel's tabs and Concede are in a full-screen menu behind the round ☰ button (LogSheet).
 * Everything else works the same, the Pokémon's moves too (cardPanel).
 */
export function Board({
  view,
  lastMove = null,
  played = null,
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
  /** The CPU's card being shown (GamePage times it: with its move, or before the move's coin flips). */
  played?: PlayedMove | null;
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
  // The player's playmat, behind their side of the table (the Cosmetics tab).
  const { playmat } = useCosmetics();
  const phone = useIsPhone();
  useLockedScreen(phone);
  /** The phone layout's ☰ menu. */
  const [menu, setMenu] = useState(false);
  /** The phone layout's spread-out view of the CPU's hand, while it's face up (Clairvoyance). */
  const [cpuHand, setCpuHand] = useState(false);
  const busy = pending !== null || replaying;
  // The attacker lunges at the defender in the view right after its attack.
  const attacker = lastMove?.type === 'ATTACK' && lastMove.version === view.version ? lastMove.player : null;
  // Right after a CPU move with a card: the card is shown, and the Pokémon it changed glow.
  const highlight = lastMove?.version === view.version ? (lastMove.highlight ?? null) : null;
  const spotlight = (player: string): Spotlight | null => (highlight ? { targets: highlight.pokemon.filter((p) => p.player === player).map((p) => p.target), stamp: view.version, delay: highlight.defId && !lastMove?.cardFirst ? PLAYED_CARD_BURST_MS : 0 } : null);
  const ownSpot = spotlight(view.you);
  const oppSpot = spotlight(view.opponent.id);
  const newTurn = useNewTurn(view);
  // The CPU's card: in the middle of the play area on a phone; on a big screen over the CPU's side (OpponentArea).
  const playedCard = (scale?: number) => played && <PlayedCard key={played.stamp} defId={played.defId} cards={played.cards} stamp={played.stamp} scale={scale} />;
  const tableOverlay = (
    <>
      {overlay}
      {/* The turn-order coin flip as a battle starts: the game's coin flip, in the same place. */}
      <TurnOrderFlip key={gameId} view={view} gameId={gameId} />
      {phone && playedCard()}
      {/* On a phone it's in the bar between the sides instead, lined up with its buttons. */}
      {newTurn && !phone && <TurnBanner key={newTurn.turn} turn={newTurn} />}
    </>
  );
  const { self, phase } = view;
  const myTurn = isMyTurn(view);
  const promoting = mustPromote(view);

  const [preview, setPreview] = useState<Preview | null>(null);
  const hidePreview = useCallback(() => setPreview(null), []);
  const toasts = useToasts();
  const retreat = useRetreat({ view, send, busy });
  const power = usePower({ view, send, busy });
  // Ending the turn, by End turn or an attack, asks first while an Energy, the Stadium or a Pokémon Power could still be used.
  const turnReminders = useTurnReminders(endTurnReminders(view, power.powers), myTurn);
  const attack = useAttack({ view, send, busy, confirm: (go) => turnReminders.check('attack', go) });
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
      setCardMenu(null);
      retreat.cancel();
      attack.cancel();
      power.cancel();
      trainer.cancel();
    },
    onDropOnPlayArea: (c) => trainer.isTrainer(c) && trainer.drop(c),
    // A Trainer dropped onto the Pokémon it's for: the slot's drop id names the side ("cpu-" for the CPU's) and the place.
    onDropOnSlot: (c, slot) => {
      if (!trainer.isTrainer(c)) return false;
      const opp = slot.startsWith('cpu-');
      const place = opp ? slot.slice('cpu-'.length) : slot;
      const target: Target = place === 'active' ? 'active' : Number(place.slice('bench-'.length));
      const targets = trainer.dropTargets(c);
      if (targets?.side === (opp ? 'opp' : 'own') && targets.options.includes(target)) trainer.dropOn(c, target);
      else trainer.drop(c);
      return true;
    },
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
    };
    // Capture phase: checked before React handles the click, while its target is still in the page. A handler
    // that re-renders (the dialog's eye button swaps its icon) would otherwise detach the target, and a
    // detached element is inside nothing, so the click would wrongly cancel the move.
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [inProgress]);

  /**
   * A big screen's moves on a card: the Pokémon whose panel is open (the Active's attacks, power and Retreat, clicked
   * open; a benched Pokémon's power), or null. It closes with a click anywhere else, Esc, or once the game moves on.
   */
  const [cardMenu, setCardMenu] = useState<Target | null>(null);
  useEffect(() => setCardMenu(null), [view.version]);
  useEffect(() => {
    if (cardMenu === null) return;
    const onClick = (e: MouseEvent) => !(e.target instanceof Element && e.target.closest('[data-card-menu]')) && setCardMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCardMenu(null);
    // Capture phase, as above: before a click elsewhere re-renders its target away.
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [cardMenu]);

  /** A Trainer card is being dragged: the whole play area is its drop target. */
  const draggingTrainer = dragging !== null && heldCard !== undefined && trainer.isTrainer(heldCard);
  /** One whose first question is a Pokémon (a Pokémon Tool, a Potion…): those Pokémon are drop targets too, answering it. */
  const trainerDrop = draggingTrainer && !busy ? trainer.dropTargets(heldCard!) : null;
  const ownDrop = trainerDrop?.side === 'own' ? trainerDrop.options : null;
  const oppDrop = trainerDrop?.side === 'opp' ? trainerDrop.options : null;

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
      : attack.spec?.kind === 'opponentBench' || attack.spec?.kind === 'ownBench'
        ? // "You may switch" (Pull In, Spiral Aura, Teleport Blast): -1, not switching, is the Active Pokémon, highlighted with the Bench.
          { side: attack.spec.kind === 'ownBench' ? 'own' : 'opp', options: [...(attack.spec.optional && !attack.spec.options.includes(-1) ? [-1] : []), ...attack.spec.options].map((s): Target => (s === -1 ? 'active' : s)), pick: (t) => attack.answer(t === 'active' ? -1 : t) }
      : attack.spec?.kind === 'ownPokemon' || attack.spec?.kind === 'ownPokemonTo'
        ? { side: 'own', options: attack.spec.options, pick: attack.answer }
      : attack.spec?.kind === 'opponentPokemon' || attack.spec?.kind === 'opponentPokemonTo'
        ? { side: 'opp', options: attack.spec.options, pick: attack.answer }
      : attack.spec?.kind === 'opponentBenchMany'
        ? // -1 is the Active Pokémon (Triple Breach picks among all of them).
          {
            side: 'opp',
            options: attack.spec.options.map((s): Target => (s === -1 ? 'active' : s)),
            pick: (t) => attack.toggleBench(t === 'active' ? -1 : t),
            picked: attack.benchPicked.map((s): Target => (s === -1 ? 'active' : s)),
          }
      : power.spec?.kind === 'ownPokemon' || power.spec?.kind === 'oppPokemon'
        ? { side: power.spec.kind === 'ownPokemon' ? 'own' : 'opp', options: power.spec.options, pick: power.answer }
        : trainer.spec?.kind === 'pokemon' && trainer.card && !trainer.error(trainer.card)
          ? { side: trainer.spec.side, options: trainer.spec.options, pick: trainer.answer }
          : null;

  const playerSlot = (id: SlotId, pokemon: InPlayPokemon | null) => {
    const switchIn = retreat.targets.has(id);
    const choosable = pokemonPick?.side === 'own' && pokemonPick.options.includes(toTarget(id));
    const trainerTarget = pokemon !== null && (ownDrop?.includes(toTarget(id)) ?? false);
    const isTarget = highlighted.has(id) || switchIn || choosable || trainerTarget;
    const canPromote = promoting && id !== 'active' && pokemon !== null;
    const target = toTarget(id);
    // A benched Pokémon with a power is clicked for its panel (cardMenu).
    const benchPower = myTurn && typeof target === 'number' ? power.powers.find((p) => p.source === target) : undefined;
    const powerSelected = typeof target === 'number' && power.usingSource === target;
    // A Pokémon whose power can be used now pulses, as playable cards do, while nothing else is under way.
    const powerUsable = myTurn && !busy && !inProgress && !self.pendingChoice && !pokemonPick && power.powers.some((p) => p.source === target && p.error === null);
    // A Trainer played as a Pokémon (Clefairy Doll) is clicked to discard it, unless it's the only Pokémon in play.
    const dollDef = pokemon && lookupCard(view.cards, pokemon.card.defId);
    const isDoll = myTurn && dollDef?.kind === 'pokemon' && !!dollDef.trainerText;
    // Secret Plan's face-down card is clicked to turn it over; Brock's Ninetales with a Shapeshift card, to discard that card.
    const faceDown = myTurn && !!pokemon?.faceDown;
    const shapeshifted = myTurn && !!pokemon && !!shapeshiftCard(pokemon);
    // Clicking your Active Pokémon opens its moves (those above among them) in a panel on the card.
    const opensMoves = id === 'active' && pokemon !== null && phase !== 'setup' && !heldCard && !retreat.ready;
    const slot = (
      <Slot
        key={id}
        id={id}
        pokemon={pokemon}
        cards={view.cards}
        large={id === 'active'}
        droppable={(highlighted.has(id) || switchIn || trainerTarget) && !busy}
        highlight={isTarget ? 'target' : canPromote ? 'promote' : powerSelected ? 'power' : null}
        label={choosable ? 'Choose' : switchIn ? 'Switch' : trainerTarget ? 'Play' : isTarget ? heldLabel : canPromote ? 'Promote' : null}
        // While a card is held (a Trainer only when it's for one of these), retreating or a Pokémon is being chosen, fade the ones that can't be picked so the targets stand out.
        dimmed={((heldCard !== undefined && (!draggingTrainer || ownDrop !== null)) || retreat.ready || pokemonPick !== null) && pokemon !== null && !isTarget}
        loading={busySlot === id}
        lunge={id === 'active' && attacker === view.you ? { dir: 'up', stamp: view.version } : null}
        spotlight={ownSpot?.targets.includes(target) ? ownSpot : null}
        usable={powerUsable}
        onClick={
          busy
            ? undefined
            : choosable
              ? () => pokemonPick!.pick(target)
              : pokemonPick
                ? undefined
                : (slotClick(id) ??
              retreat.slotClick(id) ??
              (opensMoves ? () => setCardMenu((m) => (m === 'active' ? null : 'active')) : undefined) ??
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
                    setCardMenu((m) => (m === target ? null : target));
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
      <div key={id} className="relative" data-card-menu={cardMenu === target ? '' : undefined}>
        {slot}
        {menuShown === target && pokemon && cardPanel(target)}
      </div>
    );
  };

  const doll = self.active && lookupCard(view.cards, self.active.card.defId);
  // What a click does on a benched Pokémon (turn it face up, discard its Shapeshift card or Clefairy Doll) is, for the
  // Active, a button among its moves (its panel, or a phone's sheet), as clicking it opens them.
  const activeMoves: { label: string; run: () => void }[] =
    myTurn && self.active
      ? [
          ...(self.active.faceDown ? [{ label: 'Turn it face up', run: () => send({ type: 'FLIP_FACE_DOWN', target: 'active' }) }] : []),
          ...(shapeshiftCard(self.active) ? [{ label: 'Discard its Shapeshift card', run: () => send({ type: 'DISCARD_SHAPESHIFT', target: 'active' }) }] : []),
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

  /** The open card panel: as cardMenu, but while an attack or power asks something it's that one's, and hidden while one of your Pokémon is to be clicked. */
  const menuShown: Target | null = pokemonPick?.side === 'own' ? null : attack.spec ? 'active' : power.spec ? power.usingSource : cardMenu;
  /** An attack's or power's question answered by clicking one of your Pokémon: its card panel is hidden, so it's a prompt. */
  const moveSpec = pokemonPick?.side === 'own' ? (attack.spec ?? power.spec) : null;
  const movePrompt = prompt ?? (moveSpec ? `${moveSpec.prompt}: ${phone ? 'tap' : 'click'} one of your highlighted Pokémon` : null);
  /**
   * The panel over a card, centred on it like a slot's label: the Active's attacks, power, Retreat and other moves
   * (attackPanels, activeMoves), with an attack's or power's questions; a benched Pokémon's power: its name and a Use
   * button (or why it can't be used now; not its text, agreed 2026-10-23), or its questions.
   */
  const cardPanel = (target: Target) => {
    const benched = typeof target === 'number' ? power.powers.find((p) => p.source === target) : undefined;
    // On a phone the panel is wider than a benched card: at either end of the Bench it lines up with the card's outer edge, so it stays on the screen.
    const across = phone && target === 0 ? 'left-0' : phone && typeof target === 'number' && target === self.bench.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
    return (
      <div data-keep-action className={`absolute ${across} top-1/2 z-40 flex w-max min-w-36 max-w-60 -translate-y-1/2 flex-col gap-1 rounded-lg bg-slate-800/95 p-2 text-xs shadow-xl shadow-black/60 ring-1 ring-slate-600`}>
        {target === 'active' ? (
          <>
            {attackPanels}
            {activeMoves.map((m) => (
              <button key={m.label} className="rounded bg-slate-600 px-2 py-1 text-left transition hover:bg-slate-500 active:scale-95" disabled={busy} onClick={m.run}>
                {m.label}
              </button>
            ))}
          </>
        ) : power.spec ? (
          <PowerPanel view={view} busy={busy} power={power} />
        ) : (
          benched && (
            <>
              <p className="font-semibold text-violet-200">{benched.name}</p>
              {benched.error && <p className="text-[11px] text-amber-300">{benched.error}</p>}
              <button
                className="rounded bg-violet-700 px-2 py-1 text-left transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-700"
                disabled={benched.error !== null || busy}
                onClick={() => {
                  cancelAll();
                  power.start(target);
                }}
              >
                Use {benched.name}
              </button>
            </>
          )
        )}
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
        oppBench={view.opponent.bench}
        stadium={view.stadium?.card ?? null}
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
      {/* A benched Pokémon's power asks on its own card (cardPanel). */}
      {myTurn && !attack.spec && (!power.spec || power.usingSource === 'active') && (
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
  // The card Peek looked at, on a big screen: hangs off the active slot's right edge (.attack-column in index.css) so the slot stays centred.
  const peek = !phone && self.peek && (
    <div data-keep-action className="attack-column absolute top-1/2 w-36 -translate-y-1/2">
      <PeekCard view={view} />
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
      showPlayable={myTurn && !busy && !self.pendingChoice && !heldCard && !trainer.card && !attack.spec && !power.spec && !retreat.ready}
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
      endTurn={() => turnReminders.check('end', () => send({ type: 'END_TURN' }))}
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
                    {/* Choosing several of the CPU's Benched Pokémon (Tunneling): the sheet is closed so they can be tapped, so it's confirmed here. */}
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
        <Toasts toasts={toasts.toasts} prompt={movePrompt} />
        {turnReminders.dialog}
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
          Fills the window below the header (-mt/-mb undo the layout's spacing); the table, inside the margins, takes all
          the height the hand leaves. The logs and the debug tools are in the site menu (NavRail), the options on the Settings page.
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
              overlay={tableOverlay}
            >
              <OpponentArea
                opponent={view.opponent}
                cards={view.cards}
                pick={pokemonPick?.side === 'opp' && !busy ? pokemonPick : null}
                drop={oppDrop}
                lunge={attacker === view.opponent.id ? view.version : null}
                spotlight={oppSpot}
                dialog={oppDialog}
                played={playedCard(1.4)}
              />

              {/* Between the two sides: whose turn it is and End turn. */}
              {statusBar(false)}

              {/* The music player's play/pause and note, in the middle of the table's right edge (not over the hand). */}
              <div data-keep-action className="absolute right-0 top-1/2 z-20 -translate-y-1/2">
                <BoardMusicControls />
              </div>

              {/* Prize cards on the left of the play area; discard pile and deck on the right; under them the player's playmat. */}
              <section className="relative flex min-h-0 flex-1 items-center rounded-lg bg-slate-900 p-3">
                <Playmat id={playmat} group="table" />
                {/* Bottom-aligned, with the side columns lifted past the "You" label (text-sm + space-y-3 = 2rem) to line up with the bench. */}
                <div className="relative flex w-full items-end gap-3">
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
                    {/* Your Active Pokémon's row: the coin flips of yours go just to the right of it (past the Peek card when it's shown; CoinFlip). */}
                    <div data-coin-anchor="self" className="relative flex justify-center">
                      <StadiumCard view={view} send={send} busy={busy} notify={(message) => toasts.push('warning', message)} />
                      {playerSlot('active', self.active)}
                      {peek}
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
        </div>

        {dragOverlay}
      </DndContext>
      {preview && <CardPreview {...preview} onLost={hidePreview} />}
      <Toasts toasts={toasts.toasts} prompt={movePrompt} />
      {turnReminders.dialog}
    </PreviewContext.Provider>
  );
}
