import { energyProvided, lookupCard, type CardDef, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { useContext, type Ref } from 'react';
import { typeColor } from '../utils/cardColors';
import { LARGE_CARD, SMALL_CARD } from '../utils/layout';

/**
 * The Special Conditions on a Pokémon in play, as the user's tags (public/status/, cut from their pictures by
 * tools/status-tags/make_tags.py; agreed 2026-10-26): `amount` is Poison's damage when it's more than 10.
 */
function conditionTags(p: InPlayPokemon): { image: string; title: string; amount?: number }[] {
  const tags = [];
  if (p.condition === 'asleep') tags.push({ image: '/status/asleep.png', title: "Asleep: flips to wake up between turns; can't attack or retreat" });
  if (p.condition === 'confused') tags.push({ image: '/status/confused.png', title: 'Confused: flips to attack (tails: 30 damage to itself); retreats with no flip' });
  if (p.condition === 'paralyzed') tags.push({ image: '/status/paralyzed.png', title: "Paralyzed: can't attack or retreat until after its owner's next turn" });
  if (p.burned) tags.push({ image: '/status/burned.png', title: 'Burned: 20 damage between turns, then a flip; heads cures it' });
  if (p.poison) tags.push({ image: '/status/poisoned.png', title: `Poisoned: ${p.poison} damage between turns`, ...(p.poison > 10 && { amount: p.poison }) });
  return tags;
}

/** Badges for protective and other effects on a Pokémon in play (its Special Conditions are conditionTags). */
function statusBadges(p: InPlayPokemon, cards?: CardLibrary): { label: string; title: string; className: string }[] {
  const badges = [];
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
import { useFlair, usePattern } from '../hooks/useFlair';
import { useTouchHold } from '../hooks/useTouchHold';
import { holoAttributes } from '../utils/holo';
import { EnergyIcon } from './EnergyIcon';
import { FlairBorder } from './FlairBorder';
import { HoloCard, type HoloMotion } from './HoloCard';
import { CatalogContext, InspectContext, useInspectOnRightClick } from './InspectContext';
import { PreviewContext } from './PreviewContext';
import { CardImage } from './CardImage';

/**
 * A card attached to a Pokémon in play: a disc the size of its Energy's (`size` px) showing the card's art, its name
 * on hover and the card itself in the hover preview (the Pokémon's again once the pointer leaves it). A click (or tap) opens
 * the card, its text and all, in the CardInspector, closed by a click anywhere else (the user's, 2026-10-26); the click
 * goes no further, so the Pokémon's own (its moves, a slot's drop) doesn't happen.
 */
function AttachedIcon({ def, holder, size }: { def: CardDef; holder: CardDef; size: number }) {
  const setPreview = useContext(PreviewContext);
  const catalog = useContext(CatalogContext);
  const openInspector = useContext(InspectContext);
  const entry = catalog?.get(def.id);
  return (
    <span
      title={def.name}
      role={openInspector && entry ? 'button' : undefined}
      onClick={
        openInspector && entry
          ? (e) => {
              e.stopPropagation();
              setPreview(null);
              openInspector(entry);
            }
          : undefined
      }
      className={`inline-block shrink-0 rounded-full border border-white bg-slate-700 bg-no-repeat shadow shadow-black/60 ${openInspector && entry ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size, backgroundImage: def.imageUrl ? `url(${def.imageUrl}/low.webp)` : undefined, backgroundSize: '260%', backgroundPosition: '50% 24%' }}
      onMouseEnter={(e) => setPreview({ def, x: e.clientX, y: e.clientY, from: e.currentTarget, mine: !!e.currentTarget.closest('[data-mine]') })}
      onMouseLeave={(e) => {
        const card = e.currentTarget.closest<HTMLElement>('[data-in-play]');
        setPreview(card ? { def: holder, x: e.clientX, y: e.clientY, from: card, mine: card.hasAttribute('data-mine') } : null);
      }}
    />
  );
}

/**
 * Card art from TCGdex (aspect ratio 63:88), with damage, attached energy and attached cards overlaid when in play. Right-clicking it
 * (or a long press, on a touch screen) opens it in the CardInspector. `shine`: a holo card gets its holo effect, still (the Active Pokémon);
 * `holoRef` moves its tilt and shine (the slot's animations). `mine`: the player's own card, shown with the flair they chose for it (its holo pattern or border).
 */
export function Card({
  def,
  inPlay,
  cards,
  small,
  highRes,
  shine,
  holoRef,
  mine = false,
}: {
  def: CardDef;
  inPlay?: InPlayPokemon;
  cards?: CardLibrary;
  small?: boolean;
  /** Use the large image, for cards shown zoomed in (the hand). */
  highRes?: boolean;
  shine?: boolean;
  holoRef?: Ref<HoloMotion | null>;
  mine?: boolean;
}) {
  const setPreview = useContext(PreviewContext);
  const catalog = useContext(CatalogContext);
  const inspect = useInspectOnRightClick({ clearsPreview: true })(def.id);
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
  const pattern = usePattern(def.id, mine);
  const border = useFlair(def.id, 'border', mine);
  const size = small ? SMALL_CARD : LARGE_CARD;
  return (
    <div
      {...hold}
      data-in-play={inPlay ? '' : undefined}
      data-mine={mine ? '' : undefined}
      className={`${size} relative aspect-[63/88] shrink-0 overflow-hidden rounded-lg shadow`}
      onMouseEnter={(e) => setPreview({ def, x: e.clientX, y: e.clientY, from: e.currentTarget, mine })}
      onMouseLeave={() => setPreview(null)}
      {...inspect}
    >
      {holo && def.imageUrl ? (
        <HoloCard still motionRef={holoRef} img={`${def.imageUrl}/high.webp`} name={def.name} attrs={holoAttributes(holo, pattern)} />
      ) : def.imageUrl ? (
        <CardImage src={`${def.imageUrl}/${highRes ? 'high' : 'low'}.webp`} alt={def.name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className={`${typeColor(def)} h-full w-full p-2 text-xs font-semibold`}>{def.name}</div>
      )}
      {border && def.imageUrl && <FlairBorder border={border} cardId={def.id} />}
      {inPlay && def.kind === 'pokemon' && inPlay.damage > 0 && (
        <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white shadow">
          {def.hp - inPlay.damage}/{def.hp}
        </span>
      )}
      {inPlay && (
        // The user's (2026-10-26): the cards attached to it (Pokémon Tools, Trainers that stay on it, Shapeshift), round icons like
        // its Energy's, two to a row in the top left corner, left to right then top to bottom; its Special Conditions to their right
        // as the user's tags, filling the card's width left to right then top to bottom (too wide for two to a row), then its other
        // badges, half as big again, two to a row.
        <div className="absolute left-1 right-1 top-1 flex items-start gap-0.5">
          {cards && (inPlay.attached ?? []).length > 0 && (
            <div className="grid grid-cols-[repeat(2,max-content)] gap-0.5">
              {inPlay.attached!.map((a) => (
                <AttachedIcon key={a.card.uid} def={lookupCard(cards, a.card.defId)} holder={def} size={small ? 18 : 22} />
              ))}
            </div>
          )}
          {conditionTags(inPlay).length > 0 && (
            <div className="flex min-w-0 flex-wrap gap-0.5">
              {conditionTags(inPlay).map((t) => (
                <span key={t.image} title={t.title} className="relative inline-block shrink-0">
                  <img src={t.image} alt={t.title.split(':')[0]} draggable={false} className={`${small ? 'h-4' : 'h-[22px]'} w-auto drop-shadow`} />
                  {t.amount && <span className="absolute -right-1 -top-1 rounded-full bg-green-700 px-1 text-[10px] font-bold leading-4 text-white shadow">{t.amount}</span>}
                </span>
              ))}
            </div>
          )}
          {statusBadges(inPlay, cards).length > 0 && (
            <div className="grid grid-cols-[repeat(2,max-content)] gap-0.5">
              {statusBadges(inPlay, cards).map((b, i) => (
                <span key={`${b.label}-${i}`} title={b.title} className={`${b.className} rounded px-[3.6px] text-[15px] font-bold leading-[20.4px] text-white shadow`}>
                  {b.label}
                </span>
              ))}
            </div>
          )}
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
