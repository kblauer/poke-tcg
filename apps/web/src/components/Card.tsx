import { energyProvided, lookupCard, type CardDef, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { useContext, type Ref } from 'react';
import { typeColor } from '../utils/cardColors';
import { LARGE_CARD, SMALL_CARD } from '../utils/layout';

/** Badges for Special Conditions and protective effects on a Pokémon in play. */
function statusBadges(p: InPlayPokemon, cards?: CardLibrary): { label: string; title: string; className: string }[] {
  const badges = [];
  if (p.condition === 'asleep') badges.push({ label: 'SLP', title: "Asleep: flips to wake up between turns; can't attack or retreat", className: 'bg-indigo-500' });
  if (p.condition === 'confused') badges.push({ label: 'CNF', title: 'Confused: flips to attack (tails: 20 damage to itself) and to retreat', className: 'bg-pink-500' });
  if (p.condition === 'paralyzed') badges.push({ label: 'PAR', title: "Paralyzed: can't attack or retreat until after its owner's next turn", className: 'bg-yellow-500 text-slate-900' });
  if (p.burned) badges.push({ label: 'BRN', title: 'Burned: 20 damage between turns, then a flip; heads cures it', className: 'bg-orange-600' });
  if (p.poison) badges.push({ label: `PSN${p.poison > 10 ? ` ${p.poison}` : ''}`, title: `Poisoned: ${p.poison} damage between turns`, className: 'bg-green-600' });
  const e = p.effects ?? {};
  if (e.preventAll !== undefined) badges.push({ label: '🛡', title: 'Protected from all effects of attacks, including damage, next turn', className: 'bg-sky-600' });
  else if (e.preventDamage !== undefined) badges.push({ label: '🛡', title: 'Protected from attack damage next turn', className: 'bg-sky-600' });
  else if (e.harden !== undefined) badges.push({ label: '🛡30', title: 'Attack damage of 30 or less is prevented next turn', className: 'bg-sky-600' });
  if (e.destinyBond !== undefined) badges.push({ label: '☠', title: 'Destiny Bond: knocks out the Pokémon that knocks it out next turn', className: 'bg-slate-700' });
  if (e.sandAttack !== undefined) badges.push({ label: 'SND', title: 'Sand-attack: needs heads to attack next turn', className: 'bg-amber-700' });
  // Lt. Surge's Secret Plan: the owner sees the card, marked; the opponent sees a card back.
  if (p.faceDown) badges.push({ label: '?', title: 'Face down (Secret Plan): treated as a Basic Pokémon until turned over. Click it on your turn to turn it over', className: 'bg-yellow-600 text-slate-900' });
  for (const a of p.attached ?? []) {
    const name = cards?.[a.card.defId]?.name;
    if (a.shapeshift) badges.push({ label: '⇄', title: `Shapeshift: treated as ${name ?? 'an Evolution card'}. Click it on your turn to discard that card`, className: 'bg-orange-700' });
    if (name === "Brock's Protection") badges.push({ label: 'PRT', title: "Brock's Protection: the opponent's attacks and Trainers can't remove its Energy cards", className: 'bg-amber-700' });
    if (name === "Koga's Ninja Trick") badges.push({ label: 'NIN', title: "Koga's Ninja Trick: it may switch out when the opponent attacks", className: 'bg-violet-700' });
    if (name === 'Charity') badges.push({ label: 'CHR', title: 'Charity: its attacks may do less damage; it goes back to the hand at the end of the turn', className: 'bg-rose-700' });
    if (name === "Sabrina's ESP") badges.push({ label: 'ESP', title: "Sabrina's ESP: its attack's coins may be re-flipped once this turn", className: 'bg-fuchsia-700' });
    if (name === 'PlusPower') badges.push({ label: '+10', title: 'PlusPower: its attacks do 10 more damage this turn', className: 'bg-red-600' });
    if (name === 'Defender') badges.push({ label: '−20', title: "Defender: 20 less damage from attacks until the end of the opponent's next turn", className: 'bg-sky-700' });
  }
  if (e.amnesia) badges.push({ label: 'AMN', title: `Amnesia: can't use ${e.amnesia.attack} next turn`, className: 'bg-slate-600' });
  return badges;
}
import { useTouchHold } from '../hooks/useTouchHold';
import { holoAttributes } from '../utils/holo';
import { EnergyIcon } from './EnergyIcon';
import { HoloCard, type HoloMotion } from './HoloCard';
import { CatalogContext, InspectContext, useInspectOnRightClick } from './InspectContext';
import { PreviewContext } from './PreviewContext';
import { CardImage } from './CardImage';

/**
 * Card art from TCGdex (aspect ratio 63:88), with damage and attached energy overlaid when in play. Right-clicking it
 * (or a long press, on a touch screen) opens it in the CardInspector. `shine`: a holo card gets its holo effect, still (the Active Pokémon);
 * `holoRef` moves its tilt and shine (the slot's animations).
 */
export function Card({
  def,
  inPlay,
  cards,
  small,
  highRes,
  shine,
  holoRef,
}: {
  def: CardDef;
  inPlay?: InPlayPokemon;
  cards?: CardLibrary;
  small?: boolean;
  /** Use the large image, for cards shown zoomed in (the hand). */
  highRes?: boolean;
  shine?: boolean;
  holoRef?: Ref<HoloMotion | null>;
}) {
  const setPreview = useContext(PreviewContext);
  const catalog = useContext(CatalogContext);
  const inspect = useInspectOnRightClick()(def.id);
  // On a touch screen, holding a finger on the card does what right-click does.
  const openInspector = useContext(InspectContext);
  const inspectable = catalog?.get(def.id);
  const hold = useTouchHold(
    openInspector && inspectable
      ? () => {
          setPreview(null);
          openInspector(inspectable);
        }
      : undefined,
  );
  // The catalog knows which cards are holo, and which have the galaxy foil.
  const entry = shine ? catalog?.get(def.id) : undefined;
  const holo = entry && (entry.holo || entry.galaxy) ? entry : null;
  const size = small ? SMALL_CARD : LARGE_CARD;
  return (
    <div
      {...hold}
      className={`${size} relative aspect-[63/88] shrink-0 overflow-hidden rounded-lg shadow`}
      onMouseEnter={(e) => setPreview({ def, x: e.clientX, y: e.clientY, from: e.currentTarget })}
      onMouseLeave={() => setPreview(null)}
      onContextMenu={
        inspect.onContextMenu &&
        ((e) => {
          setPreview(null);
          inspect.onContextMenu!(e);
        })
      }
    >
      {holo && def.imageUrl ? (
        <HoloCard still motionRef={holoRef} img={`${def.imageUrl}/high.webp`} name={def.name} attrs={holoAttributes(holo)} />
      ) : def.imageUrl ? (
        <CardImage src={`${def.imageUrl}/${highRes ? 'high' : 'low'}.webp`} alt={def.name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className={`${typeColor(def)} h-full w-full p-2 text-xs font-semibold`}>{def.name}</div>
      )}
      {inPlay && def.kind === 'pokemon' && inPlay.damage > 0 && (
        <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white shadow">
          {def.hp - inPlay.damage}/{def.hp}
        </span>
      )}
      {inPlay && (
        <div className="absolute left-1 top-1 flex flex-col items-start gap-0.5">
          {statusBadges(inPlay, cards).map((b, i) => (
            <span key={`${b.label}-${i}`} title={b.title} className={`${b.className} rounded px-1 text-[10px] font-bold leading-4 text-white shadow`}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      {inPlay && cards && inPlay.energy.length > 0 && (
        // Along the bottom edge; a slot's label ("Attach", "Evolve"…) sits in the middle of the card, clear of them.
        <div className="absolute inset-x-1 bottom-1 flex flex-wrap-reverse gap-0.5">
          {inPlay.energy.flatMap((e) => {
            const provided = energyProvided(e, cards);
            // Energy Burn makes all of the Pokémon's Energy Fire for the turn.
            const burned = inPlay.effects?.energyBurn !== undefined;
            const type = burned ? 'fire' : provided.type;
            const name = lookupCard(cards, e.defId).name + (burned ? ' (Fire this turn: Energy Burn)' : '');
            // One dot per energy provided: Double Colorless Energy (and a Buzzap'd Electrode) shows two.
            return Array.from({ length: provided.amount }, (_, i) => (
              <EnergyIcon key={`${e.uid}-${i}`} type={type} size={small ? 'sm' : 'lg'} title={name} />
            ));
          })}
        </div>
      )}
    </div>
  );
}
