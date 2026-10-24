import { describe, expect, it } from 'vitest';
import { holoAttributes } from './holo';

const card = { id: 'base1-4', name: 'Charizard', kind: 'POKEMON', stage: 'Stage2', type: 'Fire', rarity: 'Rare', holo: true };

describe('holoAttributes', () => {
  it('a holo rare Pokémon: rare holo, its stage as the subtype, the set and number from its id, the WOTC era, the galaxy foil in its art window', () => {
    const attrs = holoAttributes(card);
    expect(attrs).toMatchObject({ types: 'fire', rarity: 'rare holo', supertype: 'pokémon', subtypes: 'stage 2', set: 'base1', number: '4', era: 'wotc', pokemonEx: false, trainerGallery: false, holoEnergy: false });
    // Galaxy foil in the art window (`galaxy` on a holo, Gen 1's and Gen 2's holo Pokémon), with the card's mask; not for a plain holo or a holo Energy.
    expect([attrs.galaxyArt, attrs.mask]).toEqual([false, null]);
    const galaxy = holoAttributes({ ...card, galaxy: true });
    expect([galaxy.galaxyArt, galaxy.mask]).toEqual([true, '/holo-masks/base1-4.png']);
    expect(holoAttributes({ ...card, galaxy: true, holo: false }).galaxyArt).toBe(false);
  });

  it('a plain card takes its printed rarity, a galaxy foil is "rare holo cosmos", a reverse holo keeps its card’s number', () => {
    expect(holoAttributes({ ...card, holo: false, rarity: 'Uncommon' }).rarity).toBe('uncommon');
    expect(holoAttributes({ ...card, rarity: null, holo: false }).rarity).toBe('common');
    expect(holoAttributes({ ...card, galaxy: true }).rarity).toBe('rare holo cosmos');
    const reverse = holoAttributes({ ...card, id: 'ex1-10-reverse', reverseHolo: true });
    expect([reverse.rarity, reverse.set, reverse.number, reverse.era]).toEqual(['reverse holo', 'ex1', '10', 'ex']);
  });

  it("a holo Energy's style covers the card: its own rarity, supertype and subtypes, the Energy card's id", () => {
    const attrs = holoAttributes({ id: 'base1-98-holo-cosmos', name: 'Fire Energy', kind: 'ENERGY', stage: null, type: 'Fire', holoEnergy: { rarity: 'rare holo cosmos', supertype: 'energy', subtypes: 'basic' } });
    expect(attrs).toMatchObject({ rarity: 'rare holo cosmos', supertype: 'energy', subtypes: 'basic', set: 'base1', number: '98', holoEnergy: true });
  });

  it('Trainers have the item shape, Babies the basic one, and Pokémon-ex and the e-Card era are flagged', () => {
    expect(holoAttributes({ id: 'base1-91', name: 'Bill', kind: 'TRAINER', stage: null, type: null })).toMatchObject({ supertype: 'trainer', subtypes: 'item', types: '' });
    expect(holoAttributes({ ...card, id: 'neo1-12', stage: 'Baby' }).subtypes).toBe('basic');
    expect(holoAttributes({ ...card, id: 'ex1-100', name: 'Charizard ex' })).toMatchObject({ pokemonEx: true, era: 'ex' });
    expect(holoAttributes({ ...card, id: 'ecard2-1' }).era).toBe('ecard');
  });
});
