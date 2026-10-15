import type { CardDef, EnergyType } from '@poke-tcg/game-engine';

const TYPE_COLORS: Record<EnergyType, string> = {
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

/** Background class for an energy type. */
export const energyColor = (type: EnergyType) => TYPE_COLORS[type] ?? 'bg-slate-700';

/** Background class for a card's type (a Pokémon's type, or an Energy's). */
export const typeColor = (def: CardDef) => TYPE_COLORS[def.kind === 'pokemon' ? def.type : def.energyType] ?? 'bg-slate-700';
