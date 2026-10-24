import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import CatchingPokemonIcon from '@mui/icons-material/CatchingPokemon';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import CloseIcon from '@mui/icons-material/Close';
import DiamondIcon from '@mui/icons-material/Diamond';
import FaceIcon from '@mui/icons-material/Face';
import HikingIcon from '@mui/icons-material/Hiking';
import { EQUIP_SLOTS, fitsSlot, itemText, SLOT_LABELS, type EquipSlot, type EquipType, type ItemDef } from '@poke-tcg/campaign';
import { trainerSpriteUrl, type PlayerGender, type TrainerSprite } from '@poke-tcg/shared';
import { useState, type ComponentType } from 'react';
import { useEscape } from '../hooks/useEscape';
import { ItemIcon } from './ItemIcon';
import { spriteLabel, TrainerSpritePicker } from './TrainerSpritePicker';

type OwnedItem = ItemDef & { quantity: number };

/** Each slot's icon while it's empty. */
const SLOT_ICONS: Record<EquipSlot, ComponentType<{ sx?: object }>> = {
  head: FaceIcon,
  chest: CheckroomIcon,
  legs: HikingIcon,
  pokeball: CatchingPokemonIcon,
  accessory1: DiamondIcon,
  accessory2: DiamondIcon,
};

/** The slots in their 2×3 grid, row by row: head, chest and legs down the left; the accessories and the Poké Ball down the right. */
const SLOT_ORDER: EquipSlot[] = ['head', 'accessory1', 'chest', 'accessory2', 'legs', 'pokeball'];

/** The order of the pieces in the grid, by the slot they go in (a stable sort: the inventory's order within a slot). */
const GEAR_ORDER: EquipType[] = ['head', 'chest', 'legs', 'accessory', 'pokeball'];

/** The size of a slot and of a box in the item grid. */
const BOX = 'h-[var(--slot)] w-[var(--slot)]';
const ICON_SIZE = 60;

/**
 * The Equipped section of the Inventory tab, in two columns (stacked on a narrow screen), their tops level (the section's
 * title heads the left one, Equipment with its hint beside it the right one, whose grid's first row is level with the first
 * row of slots). Left: one box with the account's trainer (a Black/White sprite) on
 * its left and on its right a slot for each piece of equipment (head, chest, legs, Poké Ball, 2 accessories) in a 2×3
 * grid (SLOT_ORDER), never overlapping (the trainer's side narrows first), each slot showing its icon while empty and an ×
 * to take off what's in it. Right: in a grid of their own, the pieces of equipment the account has that aren't equipped
 * (a spare copy of one that is shows, with how many are left), as boxes the size of the slots, each describing itself on hover. Drag one onto a slot to equip it (dnd-kit; a finger holds it a moment first, so swipes
 * scroll), or click it and then the slot; while one is held (clicked or dragged) the slots it fits light up green and
 * the others red. With no hover (a phone), the piece held, or the one in a slot tapped, is described at the bottom of
 * the screen (ItemDetails), a slot's with Take off. A piece already in another slot moves
 * when the account has no spare (two accessories of a kind need two of them). Under the trainer, a button opens
 * TrainerSpritePicker to change the account's trainer sprite (any of Showdown's).
 */
export function EquipmentPanel({
  items,
  equipment,
  busy,
  onEquip,
  sprite,
  onSprite,
  gender,
  onGender,
}: {
  items: OwnedItem[];
  equipment: Record<EquipSlot, string | null>;
  busy: boolean;
  onEquip: (slot: EquipSlot, itemId: string | null) => Promise<unknown>;
  /** The account's trainer sprite, and setting it. */
  sprite: string;
  onSprite: (sprite: TrainerSprite) => void;
  /** The player's sprite on the run maps (the boy or the girl), and setting it. */
  gender: PlayerGender;
  onGender: (gender: PlayerGender) => void;
}) {
  const [picking, setPicking] = useState(false);
  const gear = items.filter((i) => i.category === 'equipment');
  const byId = new Map(gear.map((i) => [i.id, i]));
  /** The piece clicked or being dragged: the slots light up for it. */
  const [held, setHeld] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** The pieces not equipped, with how many copies aren't: the grid's, in slot order (GEAR_ORDER; the only order, agreed). */
  const spares = gear
    .map((item) => ({ item, spare: item.quantity - EQUIP_SLOTS.filter((s) => equipment[s] === item.id).length }))
    .filter((g) => g.spare > 0)
    .sort((a, b) => GEAR_ORDER.indexOf(a.item.equip!) - GEAR_ORDER.indexOf(b.item.equip!));
  const heldItem = held ? byId.get(held) : undefined;
  /** A slot tapped with nothing held: its piece describes itself (ItemDetails), with Take off. */
  const [chosenSlot, setChosenSlot] = useState<EquipSlot | null>(null);
  const chosenId = chosenSlot ? equipment[chosenSlot] : null;
  const chosenItem = chosenId ? byId.get(chosenId) : undefined;
  // A finger drags only after holding a piece a moment, so a swipe over the grid scrolls the page and a tap picks it up.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));

  useEscape(() => (setHeld(null), setChosenSlot(null)));

  /** Puts the piece in the slot; with no spare, it leaves the other slot it's in first. */
  const equipTo = async (slot: EquipSlot, item: OwnedItem) => {
    setHeld(null);
    if (!fitsSlot(item, slot) || equipment[slot] === item.id) return;
    const elsewhere = EQUIP_SLOTS.filter((s) => s !== slot && equipment[s] === item.id);
    if (item.quantity <= elsewhere.length) await onEquip(elsewhere[0]!, null);
    await onEquip(slot, item.id);
  };

  const onDragStart = (e: DragStartEvent) => {
    setDragging(String(e.active.id));
    setHeld(String(e.active.id));
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const item = byId.get(String(e.active.id));
    const slot = e.over?.id as EquipSlot | undefined;
    if (item && slot) void equipTo(slot, item);
    else setHeld(null);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => (setDragging(null), setHeld(null))}>
      {/* Clicking anywhere else in the panel puts a clicked piece down. */}
      {/* On a big screen two columns, the headings in the first row (Equipped, and the hint on the grid's side) sharing a
          baseline; stacked otherwise, each heading over its part. */}
      <div className="grid gap-x-4 gap-y-2 [--slot:4.5rem] lg:grid-cols-[auto_1fr]" onClick={() => (setHeld(null), setChosenSlot(null))}>
        <h2 className="self-baseline text-lg font-semibold lg:col-start-1 lg:row-start-1">Equipped</h2>
        <div className="space-y-2 lg:col-start-1 lg:row-start-2">
          {/* The trainer on the left of the box, the slots (2×3) on its right: the trainer's side narrows (cropping the sprite's empty sides) before they'd overlap. */}
          <div className="flex gap-3 rounded-lg bg-slate-900 p-3 ring-1 ring-slate-700">
            <div className="relative w-44 min-w-0 shrink overflow-hidden">
              <img
                src={trainerSpriteUrl(sprite)}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-0 h-full w-auto max-w-none -translate-x-1/2 select-none [image-rendering:pixelated]"
              />
            </div>
            <ul className="ml-auto grid shrink-0 grid-cols-[repeat(2,var(--slot))] gap-3">
              {SLOT_ORDER.map((slot) => {
                const id = equipment[slot];
                return (
                  <li key={slot}>
                    <EquipSlotBox
                      slot={slot}
                      item={id ? (byId.get(id) ?? null) : null}
                      itemId={id}
                      state={heldItem ? (fitsSlot(heldItem, slot) ? 'fits' : 'wrong') : chosenSlot === slot ? 'chosen' : 'idle'}
                      busy={busy}
                      onClick={() => {
                        if (heldItem) return fitsSlot(heldItem, slot) && void equipTo(slot, heldItem);
                        // Nothing held: a piece in the slot is chosen, to read about it (and take it off) without a hover.
                        setChosenSlot(id && chosenSlot !== slot ? slot : null);
                      }}
                      onRemove={() => void onEquip(slot, null)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          {/* Change trainer, and beside it the player's sprite on the run maps (each game's boy or girl). */}
          <div className="flex gap-2">
            <button
              className="min-w-0 flex-1 truncate rounded bg-slate-600 px-3 py-1.5 text-sm transition hover:bg-slate-500"
              onClick={(e) => {
                e.stopPropagation();
                setPicking(true);
              }}
            >
              Change trainer <span className="text-slate-300">({spriteLabel(sprite)})</span>
            </button>
            <select
              value={gender}
              title="Your sprite on the run maps"
              aria-label="Your sprite on the run maps"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onGender(e.target.value as PlayerGender)}
              className="shrink-0 rounded bg-slate-600 px-2 py-1.5 text-sm transition hover:bg-slate-500"
            >
              <option value="male">Boy (Red, Ethan, Brendan)</option>
              <option value="female">Girl (Leaf, Lyra, May)</option>
            </select>
          </div>
          {picking && (
            <TrainerSpritePicker
              current={sprite}
              onPick={(s) => {
                setPicking(false);
                onSprite(s);
              }}
              onClose={() => setPicking(false)}
            />
          )}
        </div>

        <p className="mt-2 self-baseline text-xs text-slate-500 lg:col-start-2 lg:row-start-1 lg:mt-0">Drag a piece onto its slot, or click it and then the slot.</p>
        <div className="space-y-2 lg:col-start-2 lg:row-start-2">
          {/* Only the pieces not equipped: one worn in a slot leaves the grid (a spare copy stays, with how many are left). Its
              first row level with the first row of slots (pt-3: the Equipped box's padding). */}
          {spares.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,var(--slot))] gap-3 pt-3">
              {spares.map(({ item, spare }) => (
                <GearBox
                  key={item.id}
                  item={item}
                  spare={spare}
                  held={held === item.id}
                  dragging={dragging === item.id}
                  onClick={() => {
                    setChosenSlot(null);
                    setHeld(held === item.id ? null : item.id);
                  }}
                />
              ))}
            </ul>
          )}
          {!gear.length ? (
            <p className="text-sm text-slate-500">No equipment yet: the shop after each run sells a piece.</p>
          ) : (
            !spares.length && <p className="text-sm text-slate-500">Every piece you have is equipped.</p>
          )}
        </div>
      </div>
      {/* Without a hover (a touch screen), the piece held or the slot chosen describes itself at the bottom of the screen. */}
      {!dragging && (heldItem ?? chosenItem) && (
        <ItemDetails
          item={(heldItem ?? chosenItem)!}
          worn={!heldItem}
          hint={heldItem ? 'Tap a green slot to equip it.' : undefined}
          onRemove={
            chosenSlot && !heldItem
              ? () => {
                  setChosenSlot(null);
                  void onEquip(chosenSlot, null);
                }
              : undefined
          }
          busy={busy}
        />
      )}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className={`${BOX} flex items-center justify-center rounded-lg bg-slate-700 shadow-xl ring-2 ring-yellow-300 [--slot:4.5rem]`}>
            <ItemIcon id={dragging} size={ICON_SIZE} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** One equipment slot: a drop target, with the piece in it (and an × to take it off) or the slot's icon. */
function EquipSlotBox({
  slot,
  item,
  itemId,
  state,
  busy,
  onClick,
  onRemove,
}: {
  slot: EquipSlot;
  item: OwnedItem | null;
  itemId: string | null;
  /** `chosen`: tapped with nothing held, to read about its piece. */
  state: 'idle' | 'fits' | 'wrong' | 'chosen';
  busy: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slot });
  const Icon = SLOT_ICONS[slot];
  const look =
    state === 'fits'
      ? `bg-emerald-500/20 ring-2 ${isOver ? 'ring-emerald-300' : 'ring-emerald-400'}`
      : state === 'wrong'
        ? 'bg-rose-950/60 ring-2 ring-rose-600/80'
        : state === 'chosen'
          ? 'bg-slate-700 ring-2 ring-yellow-300'
          : 'bg-slate-800/80 ring-1 ring-slate-600';
  return (
    // Raised while hovered, so its description shows over the other slots.
    <div ref={setNodeRef} className="group relative hover:z-30">
      <button
        className={`${BOX} flex flex-col items-center justify-center rounded-lg transition ${look} ${state === 'fits' || (state !== 'wrong' && itemId) ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={item ? undefined : SLOT_LABELS[slot]}
        aria-label={`${SLOT_LABELS[slot]} slot${item ? `: ${item.name}` : ', empty'}`}
      >
        {itemId ? (
          <ItemIcon id={itemId} size={ICON_SIZE} />
        ) : (
          <>
            <Icon sx={{ fontSize: 28, color: state === 'wrong' ? '#fb7185' : 'var(--color-slate-500)' }} />
            <span className="mt-0.5 text-[10px] text-slate-500">{SLOT_LABELS[slot]}</span>
          </>
        )}
      </button>
      {item && <ItemHover item={item} worn />}
      {itemId && (
        <button
          className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-slate-100 ring-1 ring-slate-500 transition hover:bg-slate-500 group-hover:flex disabled:opacity-40"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Take off ${item?.name ?? 'this piece'}`}
          title="Take off"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </button>
      )}
    </div>
  );
}

/** A piece of equipment in the grid: draggable and clickable, how many copies aren't equipped (`spare`), and its description on hover. */
function GearBox({ item, spare, held, dragging, onClick }: { item: OwnedItem; spare: number; held: boolean; dragging: boolean; onClick: () => void }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: item.id });
  return (
    // Raised while hovered, so its description shows over the boxes below.
    <li className="group relative hover:z-30">
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        // A finger's swipe over it scrolls the page (its drag waits for a hold: TouchSensor).
        className={`${BOX} relative flex touch-manipulation items-center justify-center rounded-lg transition ${
          held ? 'bg-slate-700 ring-2 ring-yellow-300' : 'bg-slate-800 ring-1 ring-slate-700 hover:ring-slate-500'
        } ${dragging ? 'opacity-40' : ''}`}
        aria-label={item.name}
        aria-pressed={held}
      >
        <ItemIcon id={item.id} size={ICON_SIZE} />
        {spare > 1 && <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold text-slate-300">×{spare}</span>}
      </button>
      {!dragging && <ItemHover item={item} worn={false} />}
    </li>
  );
}

/** A piece's description, shown below its box (in the grid or a slot) while it's hovered: the box's parent is the `group`. */
function ItemHover({ item, worn }: { item: OwnedItem; worn: boolean }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-60 -translate-x-1/2 rounded-lg bg-slate-800 p-3 text-left shadow-xl ring-1 ring-slate-600 group-hover:block">
      <p className="font-semibold">{item.name}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        {item.equip === 'accessory' ? 'Accessory' : SLOT_LABELS[item.equip as EquipSlot]}
        {worn && ' · Equipped'}
      </p>
      <p className="mt-1 text-xs text-slate-300">{itemText(item)}</p>
      <p className="mt-1 text-xs italic text-slate-500">{item.description}</p>
    </div>
  );
}

/**
 * The piece held, or in the slot chosen, described at the bottom of the screen, for screens without a hover (a phone): its
 * name, slot, what it does and its description, and Take off for a slot's piece. Hidden where ItemHover shows.
 */
function ItemDetails({ item, worn, hint, onRemove, busy }: { item: OwnedItem; worn: boolean; hint?: string; onRemove?: () => void; busy: boolean }) {
  return (
    <div
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-sm rounded-lg bg-slate-800 p-3 text-left shadow-xl shadow-black/60 ring-1 ring-slate-600 [@media(hover:hover)]:hidden"
      // Taps inside it don't put the piece down.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <ItemIcon id={item.id} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{item.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            {item.equip === 'accessory' ? 'Accessory' : SLOT_LABELS[item.equip as EquipSlot]}
            {worn && ' · Equipped'}
          </p>
        </div>
        {onRemove && (
          <button className="shrink-0 rounded bg-slate-600 px-3 py-1 text-sm transition hover:bg-slate-500 disabled:opacity-40" disabled={busy} onClick={onRemove}>
            Take off
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-300">{itemText(item)}</p>
      <p className="mt-1 text-xs italic text-slate-500">{item.description}</p>
      {hint && <p className="mt-2 text-xs text-emerald-300">{hint}</p>}
    </div>
  );
}
