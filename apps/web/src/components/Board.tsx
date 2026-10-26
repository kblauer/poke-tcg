import { DndContext, DragOverlay } from '@dnd-kit/core';
import { hasBenched, inPlayDef, lookupCard, shapeshiftCard, usableAttacks, usableEnergy, usableTool, type CardLibrary, type GameAction, type InPlayPokemon, type MoveHighlight, type PlayerView, type Target } from '@poke-tcg/game-engine';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAttack } from '../hooks/useAttack';
import { useCardPlay } from '../hooks/useCardPlay';
import { useFlairMoments } from '../hooks/useFlairMoments';
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
import { useEscape } from '../hooks/useEscape';
import { PAGE_WIDTH } from '../utils/layout';
import { CHOICE_BUTTON } from '../utils/styles';
import { centerOnPointer } from '../utils/dragOverlay';
import { isMyTurn, mustPromote, statusText } from '../utils/turn';
import { AttackChoicePanel } from './AttackChoicePanel';
import { AttackList } from './AttackList';
import { Card } from './Card';
import { CardPreview } from './CardPreview';
import { DeckAndDiscard } from './DeckAndDiscard';
import { FlairEffect } from './FlairEffect';
import { FloatingDialog } from './FloatingDialog';
import { Hand } from './Hand';
import { OpponentArea, type Spotlight } from './OpponentArea';
import { DiscardPane } from './DiscardPane';
import { PendingChoicePanel } from './PendingChoicePanel';
import { PhoneBoard } from './phone/PhoneBoard';
import { PlayArea } from './PlayArea';
import { Playmat } from './Playmat';
import { PeekCard, PowerPanel } from './PowerPanel';
import { PreviewContext, type Preview } from './PreviewContext';
import { PrizeCards } from './PrizeCards';
import { RetreatPanel } from './RetreatPanel';
import { Slot } from './Slot';
import { endTurnReminders } from '../utils/reminders';
import { PLAYED_CARD_BURST_MS, PlayedCard } from './PlayedCard';
import { SetupBanner, TurnBanner, useNewTurn } from './TurnBanner';
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

/** An attack, power or Trainer asking for a Pokémon in play: which side's, the ones that can be chosen, and how (and, choosing several, those picked so far). */
export interface PokemonPick {
  side: 'own' | 'opp';
  options: Target[];
  pick: (t: Target) => void;
  picked?: Target[];
}

/**
 * The game table. Card play comes from useCardPlay; the board itself owns the hover preview. On a phone held upright
 * (useIsPhone) it's laid out for the phone instead (PhoneBoard, PhoneTable), filling the screen and locked in place
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
  /** A run's battle: the side panel's Run tab on a phone (HP, ₱, EXP, the Bag; a big screen has the run in the site menu). */
  runTab?: ReactNode;
  /** Shown over the play area, centred on it: the coin flips (CoinFlip). */
  overlay?: ReactNode;
}) {
  const debugEnabled = useDebugEnabled();
  // The player's playmat, behind their side of the table (the Cosmetics tab).
  const { playmat } = useCosmetics();
  const phone = useIsPhone();
  useLockedScreen(phone);
  /** The spread-out view of the CPU's hand, while it's face up (Clairvoyance): a click on its hand opens it (the phone's is PhoneBoard's own). */
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
  // Card flair: the effects the player's Pokémon play as they come into play, evolve, attack and Knock Out.
  const flairMoments = useFlairMoments(view, attacker);
  // The setup banner: out while Pokémon are being placed, sliding off once Start battle is pressed.
  const placing = view.phase === 'setup' && !view.self.ready && pending?.type !== 'START_BATTLE';
  const [setupBanner, setSetupBanner] = useState(placing);
  useEffect(() => {
    if (placing) setSetupBanner(true);
  }, [placing]);
  const setupBannerGone = useCallback(() => setSetupBanner(false), []);
  // Who goes first as setup left it, so it doesn't change as it slides off.
  const setupFirst = useRef(false);
  if (view.phase === 'setup') setupFirst.current = view.currentPlayer === view.you;
  // The CPU's card: in the middle of the play area on a phone; on a big screen over the CPU's side (OpponentArea).
  const playedCard = (scale?: number) => played && <PlayedCard key={played.stamp} defId={played.defId} cards={played.cards} stamp={played.stamp} scale={scale} />;
  const tableOverlay = (
    <>
      {overlay}
      {/* The turn-order coin flip as a battle starts: the game's coin flip, in the same place. */}
      <TurnOrderFlip key={gameId} view={view} gameId={gameId} />
      {phone && playedCard()}
      {/* The turn's and the setup line's banners, centred on the buttons between the sides and behind them (TurnBanner.tsx). */}
      {newTurn && <TurnBanner key={newTurn.turn} turn={newTurn} compact={phone} />}
      {setupBanner && <SetupBanner first={setupFirst.current} leaving={!placing} onGone={setupBannerGone} compact={phone} />}
    </>
  );
  const { self, phase } = view;
  const myTurn = isMyTurn(view);
  // End turn goes the moment it's pressed and comes back on the next turn of yours once its banner has gone (the user's):
  // the turn it was pressed on, cleared if the server turned it down (the error below).
  const [endedOn, setEndedOn] = useState<number | null>(null);
  useEffect(() => setEndedOn(null), [errorAt]);
  const endTurnShown = myTurn && !newTurn && endedOn !== view.turn;
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
    // Capture phase, as above: before a click elsewhere re-renders its target away.
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [cardMenu]);
  useEscape(() => setCardMenu(null), cardMenu !== null);

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

  // Warm the cache with the large images so the preview appears without a loading delay: each card once, not again on
  // every move (the view's cards change with every action).
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    for (const d of Object.values(view.cards)) {
      if (!d.imageUrl || warmed.current.has(d.id)) continue;
      warmed.current.add(d.id);
      new Image().src = `${d.imageUrl}/high.webp`;
    }
  }, [view.cards]);

  const busySlot = pendingSlot(pending);

  /** An attack, power or Trainer asking for a Pokémon in play: it's chosen by clicking the Pokémon. */
  const pokemonPick: PokemonPick | null =
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

  /** Nothing else is under way on your turn: a Pokémon that can attack or use its power now pulses, as playable cards do. */
  const canMove = myTurn && !busy && !inProgress && !self.pendingChoice && !pokemonPick;
  // Your Active Pokémon has an attack it can use now (as its attack buttons, AttackList, list and enable them).
  const canAttack =
    canMove &&
    phase !== 'setup' &&
    view.turn > 1 &&
    !!self.active &&
    usableAttacks(self.active, view.cards, { recall: !!self.recall, bench: self.bench, defender: view.opponent.active, oppBench: view.opponent.bench, stadium: view.stadium?.card ?? null }).some((_, i) => attack.error(i) === null);

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
    // A Pokémon whose power can be used now pulses, as playable cards do, while nothing else is under way; so does the Active when it can attack.
    const powerUsable = canMove && power.powers.some((p) => p.source === target && p.error === null);
    // A Trainer played as a Pokémon (Clefairy Doll) is clicked to discard it, unless it's the only Pokémon in play.
    const dollDef = pokemon && lookupCard(view.cards, pokemon.card.defId);
    const isDoll = myTurn && dollDef?.kind === 'pokemon' && !!dollDef.trainerText;
    // Secret Plan's face-down card is clicked to turn it over; Brock's Ninetales with a Shapeshift card, to discard that card.
    const faceDown = myTurn && !!pokemon?.faceDown;
    const shapeshifted = myTurn && !!pokemon && !!shapeshiftCard(pokemon);
    // A Benched Pokémon with a Pokémon Tool that can be used (Energy Link) is clicked to use it.
    const toolUsable = myTurn && typeof target === 'number' && !!pokemon && usableTool(view.cards, pokemon);
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
        usable={powerUsable || (id === 'active' && canAttack)}
        mine
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
              (toolUsable && !heldCard && !retreat.ready
                ? () => {
                    cancelAll();
                    send({ type: 'USE_TOOL', target });
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
  // Active, a button among its moves (its panel, on every screen), as clicking it opens them.
  const activeMoves: { label: string; run: () => void }[] =
    myTurn && self.active
      ? [
          ...(self.active.faceDown ? [{ label: 'Turn it face up', run: () => send({ type: 'FLIP_FACE_DOWN', target: 'active' }) }] : []),
          ...(shapeshiftCard(self.active) ? [{ label: 'Discard its Shapeshift card', run: () => send({ type: 'DISCARD_SHAPESHIFT', target: 'active' }) }] : []),
          // Call Energy: a Special Energy card's ability, used from the Active Pokémon.
          ...usableEnergy(self.active).map((e) => ({ label: `Use ${lookupCard(view.cards, e.defId).name}`, run: () => send({ type: 'USE_ENERGY', cardUid: e.uid }) })),
          // Energy Link: a Pokémon Tool's ability.
          ...(usableTool(view.cards, self.active) ? [{ label: `Use ${lookupCard(view.cards, self.active.attached!.find((a) => a.tool)!.card.defId).name}`, run: () => send({ type: 'USE_TOOL', target: 'active' }) }] : []),
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
              <Card def={lookupCard(view.cards, heldCard.defId)} highRes mine />
            </div>
          </div>
        ) : null}
      </DragOverlay>
  );
  /** Whose turn it is and End turn (with the setup buttons before the battle), between the two sides. */
  const statusBar = (compact: boolean) => (
    <StatusBar
      compact={compact}
      // The setup line is on its banner instead (SetupBanner).
      status={phase === 'setup' ? '' : statusText(view)}
      canEndTurn={endTurnShown}
      setup={phase === 'setup' && !self.ready ? { canReset: !!self.active || self.bench.some(Boolean), canStart: !!self.active } : null}
      endTurn={() =>
        turnReminders.check('end', () => {
          setEndedOn(view.turn);
          send({ type: 'END_TURN' });
        })
      }
      pending={pending}
      send={send}
    />
  );
  /** Floats over the CPU's side: the Trainer being played, or Skip/Done for a choice of Pokémon that can be left (Sneak Attack can be skipped; Fairy Power is done whenever the player says so). */
  const oppDialog = pendingPick?.optional ? (
    <div className="rounded-lg bg-slate-800 p-2 ring-1 ring-slate-600">
      <button className={CHOICE_BUTTON} disabled={busy} onClick={() => send({ type: 'RESOLVE_CHOICE' })}>
        {pendingPick.kind === 'oppPokemon' ? 'Skip' : 'Done'}
      </button>
    </div>
  ) : (
    trainer.card && !trainer.prompt && <TrainerPanel view={view} trainer={trainer} />
  );

  // Card flair's effects, over the board (fixed, so either layout).
  const flairEffects = flairMoments.effects.map((e) => <FlairEffect key={e.id} effect={e.effect} moment={e.moment} box={e.box} onDone={() => flairMoments.done(e.id)} />);

  /** The phone layout (see above): the same pieces, laid out by PhoneBoard. */
  if (phone) {
    return (
      <>
      {flairEffects}
      <PhoneBoard
        view={view}
        send={send}
        busy={busy}
        gameId={gameId}
        playmat={playmat}
        dnd={dnd}
        dragEndedAt={dragEndedAt}
        dragging={dragging}
        heldCard={heldCard}
        dropTarget={dropTarget}
        draggingTrainer={draggingTrainer}
        pokemonPick={pokemonPick}
        pendingPick={pendingPick}
        attack={attack}
        attacker={attacker}
        oppDrop={oppDrop}
        oppSpot={oppSpot}
        toasts={toasts}
        prompt={movePrompt}
        runTab={runTab}
        debugEnabled={debugEnabled}
        tableOverlay={tableOverlay}
        playerSlot={playerSlot}
        statusBar={statusBar}
        oppDialog={oppDialog}
        handView={handView}
        dragOverlay={dragOverlay}
        remindersDialog={turnReminders.dialog}
      />
      </>
    );
  }

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
        {/*
          No text selection on the board: select-none, and a double click's selecting stopped outright, since the browser
          otherwise stretches it from the playmat over the Active Pokémon's image (it turned blue). Clicks still go through.
        */}
        <div
          ref={table.ref}
          className={`-mb-4 -mt-6 flex select-none ${busy ? 'cursor-progress' : ''}`}
          style={table.style}
          onMouseDown={(e) => e.detail > 1 && e.preventDefault()}
        >
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
                openHand={() => setCpuHand(true)}
              />

              {/* Between the two sides: whose turn it is and End turn (the banners pass behind its buttons). */}
              {statusBar(false)}

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

        {cpuHand && view.opponent.hand && (
          <DiscardPane title="The CPU's hand" note={`${view.opponent.hand.length}, face up: Clairvoyance`} discard={view.opponent.hand} cards={view.cards} onClose={() => setCpuHand(false)} />
        )}
        {dragOverlay}
      </DndContext>
      {preview && <CardPreview {...preview} onLost={hidePreview} />}
      {flairEffects}
      <Toasts toasts={toasts.toasts} prompt={movePrompt} />
      {turnReminders.dialog}
    </PreviewContext.Provider>
  );
}
