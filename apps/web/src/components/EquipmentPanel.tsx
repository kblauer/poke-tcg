import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import CatchingPokemonIcon from '@mui/icons-material/CatchingPokemon';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import CloseIcon from '@mui/icons-material/Close';
import DiamondIcon from '@mui/icons-material/Diamond';
import FaceIcon from '@mui/icons-material/Face';
import HikingIcon from '@mui/icons-material/Hiking';
import { EQUIP_SLOTS, fitsSlot, itemText, SLOT_LABELS, type EquipSlot, type ItemDef } from '@poke-tcg/campaign';
import { trainerSpriteUrl, type TrainerSprite } from '@poke-tcg/shared';
import { useEffect, useState, type ComponentType } from 'react';
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

/** The size of a slot and of a box in the item grid. */
const BOX = 'h-[var(--slot)] w-[var(--slot)]';
const ICON_SIZE = 60;

/**
 * The Equipped section of the Inventory tab, in two columns: a quarter and three quarters of the row, their tops level (the
 * section's title heads the left one, the hint the right one). Left: the account's trainer (a Black/White sprite). Right:
 * a slot for each piece of equipment (head, chest, legs, Poké Ball, 2 accessories) in a 2×3 grid in the top left corner
 * (SLOT_ORDER), each showing its icon while empty and an × to take off what's in it; and wrapping around them, every piece
 * of equipment the account has, as boxes the size of the slots, each
 * describing itself on hover. Drag one onto a slot to equip it (dnd-kit), or click it and then the slot; while one is
 * held (clicked or dragged) the slots it fits light up green and the others red. A piece already in another slot moves
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
}: {
  items: OwnedItem[];
  equipment: Record<EquipSlot, string | null>;
  busy: boolean;
  onEquip: (slot: EquipSlot, itemId: string | null) => Promise<unknown>;
  /** The account's trainer sprite, and setting it. */
  sprite: string;
  onSprite: (sprite: TrainerSprite) => void;
}) {
  const [picking, setPicking] = useState(false);
  const gear = items.filter((i) => i.category === 'equipment');
  const byId = new Map(gear.map((i) => [i.id, i]));
  /** The piece clicked or being dragged: the slots light up for it. */
  const [held, setHeld] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const heldItem = held ? byId.get(held) : undefined;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHeld(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      <div className="grid gap-4 [--slot:4.5rem] lg:grid-cols-4" onClick={() => setHeld(null)}>
        <div className="space-y-2">
          <h2 className="flex h-7 items-center text-lg font-semibold">Equipped</h2>
          <div className="relative h-[30rem] overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-700">
            <img
              src={trainerSpriteUrl(sprite)}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-0 h-full w-auto max-w-none -translate-x-1/2 select-none [image-rendering:pixelated]"
            />
          </div>
          <button
            className="w-full rounded bg-slate-600 px-3 py-1.5 text-sm transition hover:bg-slate-500"
            onClick={(e) => {
              e.stopPropagation();
              setPicking(true);
            }}
          >
            Change trainer <span className="text-slate-300">({spriteLabel(sprite)})</span>
          </button>
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

        <div className="flow-root space-y-2 lg:col-span-3">
          <p className="flex h-7 items-center text-xs text-slate-500">Drag a piece onto its slot, or click it and then the slot. It works in your runs from the next encounter.</p>
          {/* The slots in the top left corner, a 2×3 grid spaced as the pieces are (so their rows line up), the pieces wrapping around them (both float). */}
          <div className="float-left mb-2 mr-2 grid grid-cols-[repeat(2,var(--slot))] gap-2 rounded-lg bg-slate-900 ring-1 ring-slate-700">
            {SLOT_ORDER.map((slot) => {
              const id = equipment[slot];
              return (
                <EquipSlotBox
                  key={slot}
                  slot={slot}
                  item={id ? (byId.get(id) ?? null) : null}
                  itemId={id}
                  state={heldItem ? (fitsSlot(heldItem, slot) ? 'fits' : 'wrong') : 'idle'}
                  busy={busy}
                  onClick={() => heldItem && fitsSlot(heldItem, slot) && void equipTo(slot, heldItem)}
                  onRemove={() => void onEquip(slot, null)}
                />
              );
            })}
          </div>
          {gear.length ? (
            <ul>
              {gear.map((item) => {
                const worn = EQUIP_SLOTS.filter((s) => equipment[s] === item.id).length;
                return (
                  <GearBox
                    key={item.id}
                    item={item}
                    worn={worn}
                    held={held === item.id}
                    dragging={dragging === item.id}
                    onClick={() => setHeld(held === item.id ? null : item.id)}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No equipment yet: the shop after each run sells a piece.</p>
          )}
        </div>
      </div>
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
  state: 'idle' | 'fits' | 'wrong';
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
        : 'bg-slate-800/80 ring-1 ring-slate-600';
  return (
    // Raised while hovered, so its description shows over the other slots.
    <div ref={setNodeRef} className="group relative hover:z-30">
      <button
        className={`${BOX} flex flex-col items-center justify-center rounded-lg transition ${look} ${state === 'fits' ? 'cursor-pointer' : 'cursor-default'}`}
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
            <Icon sx={{ fontSize: 28, color: state === 'wrong' ? '#fb7185' : '#64748b' }} />
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

/** A piece of equipment in the grid: draggable and clickable, its count and whether it's worn, and its description on hover. */
function GearBox({ item, worn, held, dragging, onClick }: { item: OwnedItem; worn: number; held: boolean; dragging: boolean; onClick: () => void }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: item.id });
  return (
    // Floated, so the pieces wrap around the slots floating in the top left corner.
    <li className="group relative float-left mb-2 mr-2">
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`${BOX} relative flex touch-none items-center justify-center rounded-lg transition ${
          held ? 'bg-slate-700 ring-2 ring-yellow-300' : 'bg-slate-800 ring-1 ring-slate-700 hover:ring-slate-500'
        } ${dragging ? 'opacity-40' : ''}`}
        aria-label={item.name}
        aria-pressed={held}
      >
        <ItemIcon id={item.id} size={ICON_SIZE} />
        {item.quantity > 1 && <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold text-slate-300">×{item.quantity}</span>}
        {worn > 0 && <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-emerald-400" title="Equipped" />}
      </button>
      {!dragging && <ItemHover item={item} worn={worn > 0} />}
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
