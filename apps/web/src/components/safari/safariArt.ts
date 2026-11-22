// Safari Draft's pictures (README: Safari Draft; issue #239, section 8): the trainers' battle sprites for the opponents,
// FireRed's, which the Idle Adventure already ships (public/idle/gen1/). The Trainer cards' pictures are their Base Set
// prints (Gambler Fossil's).
import type { TrainerName } from '@poke-tcg/safari/effects';

const GEN1 = '/idle/gen1';

/** FireRed's battle sprite of each of the Badge Challenge's trainer classes (campaign's TRAINERS). */
const CLASS_SPRITES: Record<string, string> = {
  Youngster: 'youngster',
  Lass: 'lass',
  'Bug Catcher': 'bug_catcher',
  Hiker: 'hiker',
  Picnicker: 'picnicker',
  Camper: 'camper',
  'Super Nerd': 'super_nerd',
  Swimmer: 'swimmer_m',
  Fisherman: 'fisherman',
  Beauty: 'beauty',
  Gentleman: 'gentleman',
  Biker: 'biker',
  Juggler: 'juggler',
  Cooltrainer: 'cool_trainer_m',
  Rocker: 'rocker',
  Gambler: 'gamer',
  Sailor: 'sailor',
  Psychic: 'psychic_m',
  'Black Belt': 'black_belt',
  'Bird Keeper': 'bird_keeper',
};
const WOMEN = new Set(['Mary']);

/** An opponent's battle sprite: a gym leader's, Blue's, or their trainer class's (null for a legendary: its card shows). */
export function opponentSprite(o: { name: string; boss?: string; difficulty: string }): string | null {
  if (o.difficulty === 'legendary') return null;
  if (o.boss === 'blue') return `${GEN1}/trainers/champion_rival.png`;
  if (o.boss) return `${GEN1}/trainers/leader_${o.boss.replace(/-/g, '_')}.png`;
  const words = o.name.split(' ');
  const trainerClass = words.slice(0, -1).join(' ');
  const pic = trainerClass === 'Cooltrainer' && WOMEN.has(words.at(-1)!) ? 'cool_trainer_f' : CLASS_SPRITES[trainerClass];
  return pic ? `${GEN1}/trainers/${pic}.png` : `${GEN1}/trainers/youngster.png`;
}

/** Each Trainer card's picture: its print's card id. */
export const TRAINER_CARDS: Record<TrainerName, string> = {
  PlusPower: 'base1-84',
  Defender: 'base1-80',
  Potion: 'base1-94',
  'Super Potion': 'base1-90',
  'Full Heal': 'base1-82',
  Revive: 'base1-89',
  'Pokémon Center': 'base1-85',
  'Gust of Wind': 'base1-93',
  'Energy Removal': 'base1-92',
  'Super Energy Removal': 'base1-79',
  'Scoop Up': 'base1-78',
  'Clefairy Doll': 'base1-70',
  'Imposter Professor Oak': 'base1-73',
  Bill: 'base1-91',
  'Professor Oak': 'base1-88',
};

export const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', gymLeader: 'Gym Leader', champion: 'Champion', legendary: 'Legendary' };
/** A difficulty's colour: game meaning, kept off the themes (text-gray-900 on them). */
export const DIFFICULTY_COLOR: Record<string, string> = { easy: 'bg-emerald-400', medium: 'bg-sky-400', hard: 'bg-orange-400', gymLeader: 'bg-red-400', champion: 'bg-fuchsia-400', legendary: 'bg-amber-300' };
