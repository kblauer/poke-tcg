import { describe, expect, it } from 'vitest';
import { foldText, matchesSearch } from './cardList';

const card = (name: string, attacks: (string | null)[] = [], stadium = false) => ({ name, attacks, stadium }) as Parameters<typeof matchesSearch>[0];

describe('the card search', () => {
  it('finds a name or an attack, lower-cased and with accents dropped', () => {
    const flareon = card('Flareon', ['Quick Attack', 'Flamethrower']);
    expect(matchesSearch(flareon, foldText('flare'))).toBe(true);
    expect(matchesSearch(flareon, foldText('FLAMETHROWER'))).toBe(true);
    expect(matchesSearch(card('Pokémon Center'), foldText('pokemon'))).toBe(true);
    expect(matchesSearch(card('Poke Ball'), foldText('poké'))).toBe(true);
    expect(matchesSearch(flareon, foldText('surf'))).toBe(false);
  });

  it('never matches across a name and an attack, and finds Stadiums', () => {
    expect(matchesSearch(card('Flareon', ['Quick Attack']), 'flareonquick')).toBe(false);
    expect(matchesSearch(card('Flareon', [null, 'Bite']), 'bite')).toBe(true);
    expect(matchesSearch(card('Ecogym', [], true), 'stad')).toBe(true);
    expect(matchesSearch(card('Ecogym', [], true), 'st')).toBe(false);
  });

  it('gives the same answers the second time (the folded text is kept)', () => {
    const c = card('Mr. Mime', ['Meditate']);
    expect(matchesSearch(c, 'mime')).toBe(true);
    expect(matchesSearch(c, 'mime')).toBe(true);
    expect(matchesSearch(c, 'meditate')).toBe(true);
  });
});
