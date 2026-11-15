// Text deck lists (deck-text.ts): every pack set's id is a set code, so a later generation's cards import by set and number.
import { PACK_SETS } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { parseDeckText } from './deck-text.js';

describe('parseDeckText set codes', () => {
  it.each([...PACK_SETS])('"%s" resolves to its own set', (id) => {
    for (const code of [id, id.toUpperCase()]) {
      const parsed = parseDeckText(`4 Pikachu ${code} 74`);
      expect(parsed && 'lines' in parsed ? parsed.lines[0] : parsed, code).toMatchObject({ name: 'Pikachu', setId: id, number: '74' });
    }
  });

  it('keeps the decklist sites\' codes, and takes an unknown code for part of the name', () => {
    expect(parseDeckText('4 Lickitung JU 38')).toEqual({ lines: [{ line: '4 Lickitung JU 38', quantity: 4, name: 'Lickitung', setId: 'base2', number: '38' }] });
    expect(parseDeckText('4 Lickitung ZZ 38')).toEqual({ lines: [{ line: '4 Lickitung ZZ 38', quantity: 4, name: 'Lickitung ZZ 38' }] });
  });
});
