import { lookupCard, type CardDef, type CardLibrary, type InPlayPokemon } from '@poke-tcg/game-engine';
import { useContext } from 'react';
import { typeColor } from '../utils/cardColors';

/** Badges for Special Conditions and protective effects on a Pokémon in play. */
function statusBadges(p: InPlayPokemon): { label: string; title: string; className: string }[] {
  const badges = [];
  if (p.condition === 'asleep') badges.push({ label: 'SLP', title: "Asleep: flips to wake up between turns; can't attack or retreat", className: 'bg-indigo-500' });
  if (p.condition === 'confused') badges.push({ label: 'CNF', title: 'Confused: flips to attack (tails: 20 damage to itself) and to retreat', className: 'bg-pink-500' });
  if (p.condition === 'paralyzed') badges.push({ label: 'PAR', title: "Paralyzed: can't attack or retreat until after its owner's next turn", className: 'bg-yellow-500 text-slate-900' });
  if (p.poison) badges.push({ label: `PSN${p.poison > 10 ? ` ${p.poison}` : ''}`, title: `Poisoned: ${p.poison} damage between turns`, className: 'bg-green-600' });
  const e = p.effects ?? {};
  if (e.preventAll !== undefined) badges.push({ label: '🛡', title: 'Protected from all effects of attacks, including damage, next turn', className: 'bg-sky-600' });
  else if (e.preventDamage !== undefined) badges.push({ label: '🛡', title: 'Protected from attack damage next turn', className: 'bg-sky-600' });
  else if (e.harden !== undefined) badges.push({ label: '🛡30', title: 'Attack damage of 30 or less is prevented next turn', className: 'bg-sky-600' });
  if (e.destinyBond !== undefined) badges.push({ label: '☠', title: 'Destiny Bond: knocks out the Pokémon that knocks it out next turn', className: 'bg-slate-700' });
  if (e.sandAttack !== undefined) badges.push({ label: 'SND', title: 'Sand-attack: needs heads to attack next turn', className: 'bg-amber-700' });
  if (e.amnesia) badges.push({ label: 'AMN', title: `Amnesia: can't use ${e.amnesia.attack} next turn`, className: 'bg-slate-600' });
  return badges;
}
import { PreviewContext } from './PreviewContext';

/** Card art from TCGdex (aspect ratio 63:88), with damage and attached energy overlaid when in play. */
export function Card({ def, inPlay, cards, small }: { def: CardDef; inPlay?: InPlayPokemon; cards?: CardLibrary; small?: boolean }) {
  const setPreview = useContext(PreviewContext);
  const size = small ? 'w-20' : 'w-28';
  return (
    <div
      className={`${size} relative aspect-[63/88] shrink-0 overflow-hidden rounded-lg shadow`}
      onMouseEnter={(e) => setPreview({ def, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPreview(null)}
    >
      {def.imageUrl ? (
        <img src={`${def.imageUrl}/low.webp`} alt={def.name} loading="lazy" draggable={false} className="h-full w-full object-cover" />
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
          {statusBadges(inPlay).map((b) => (
            <span key={b.label} title={b.title} className={`${b.className} rounded px-1 text-[10px] font-bold leading-4 text-white shadow`}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      {inPlay && cards && inPlay.energy.length > 0 && (
        <div className="absolute bottom-1 left-1 flex flex-wrap gap-0.5">
          {inPlay.energy.map((e) => {
            const energy = lookupCard(cards, e.defId);
            return <span key={e.uid} title={energy.name} className={`${typeColor(energy)} h-3 w-3 rounded-full border border-white shadow`} />;
          })}
        </div>
      )}
    </div>
  );
}
