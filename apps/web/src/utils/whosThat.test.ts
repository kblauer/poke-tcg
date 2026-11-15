import { WHOS_THAT_PASS_MS } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { autoPassDue } from './whosThat';

describe('autoPassDue', () => {
  const up = { shown: true, revealing: false, busy: false, elapsedMs: WHOS_THAT_PASS_MS };

  it("asks once the Pokémon's time has run out", () => {
    expect(autoPassDue(up)).toBe(true);
    expect(autoPassDue({ ...up, elapsedMs: WHOS_THAT_PASS_MS - 1 })).toBe(false);
  });

  it('never while a guess or a pass is on its way, the one before is revealed, or the Pokémon is not up yet', () => {
    expect(autoPassDue({ ...up, busy: true })).toBe(false);
    expect(autoPassDue({ ...up, revealing: true })).toBe(false);
    expect(autoPassDue({ ...up, shown: false })).toBe(false);
  });
});
