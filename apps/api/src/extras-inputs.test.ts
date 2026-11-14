import { BERRIES, COIN_OFFERS, MAX_BLENDER_RPM, MAX_COOK_FRAMES, MIN_COOK_FRAMES } from '@poke-tcg/campaign';
import { blendBerryInput, buyCoinsInput, cookPoffinInput, harvestBerryInput, voltorbSettleInput, whosThatGuessInput, whosThatPassInput } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';

/**
 * The Extras minigames are played in the browser, so what the API takes of their results is bounded to what play can
 * reach (issue #204): the limits here are the campaign's, each reached by a perfect game in the campaign's tests
 * (berries.test.ts, poffin-cooking.test.ts).
 */
describe("the Extras modes' inputs", () => {
  const berry = BERRIES[0]!.id;
  const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

  it("takes a blend's top speed up to the perfect game's, no higher", () => {
    expect(ok(blendBerryInput, { berry, maxRpm: MAX_BLENDER_RPM })).toBe(true);
    expect(ok(blendBerryInput, { berry, maxRpm: MAX_BLENDER_RPM + 1 })).toBe(false);
    expect(ok(blendBerryInput, { berry, maxRpm: 99999 })).toBe(false);
    expect(ok(blendBerryInput, { berry, maxRpm: -1 })).toBe(false);
  });

  it("takes a cooking's time from the perfect game's to three whole phases, no other", () => {
    const cooked = { berry, spills: 0, burns: 0 };
    expect(ok(cookPoffinInput, { ...cooked, frames: MIN_COOK_FRAMES })).toBe(true);
    expect(ok(cookPoffinInput, { ...cooked, frames: MAX_COOK_FRAMES })).toBe(true);
    expect(ok(cookPoffinInput, { ...cooked, frames: MIN_COOK_FRAMES - 1 })).toBe(false);
    expect(ok(cookPoffinInput, { ...cooked, frames: 1 })).toBe(false);
    expect(ok(cookPoffinInput, { ...cooked, frames: MAX_COOK_FRAMES + 1 })).toBe(false);
  });

  it("sells exactly the counter's coin offers", () => {
    for (const offer of COIN_OFFERS) expect(ok(buyCoinsInput, { coins: offer.coins })).toBe(true);
    for (const coins of [0, 1, 49, 51, 100, 5000]) expect(ok(buyCoinsInput, { coins })).toBe(COIN_OFFERS.some((o) => o.coins === coins));
  });

  it('knows every berry and no other', () => {
    for (const b of BERRIES) expect(ok(harvestBerryInput, { berry: b.id })).toBe(true);
    expect(ok(harvestBerryInput, { berry: 'not-a-berry' })).toBe(false);
  });

  it("takes no flips with a Voltorb Flip round's settling: the API kept them", () => {
    expect(voltorbSettleInput.parse({ outcome: 'quit', flips: [0, 1, 2] })).toEqual({ outcome: 'quit' });
  });

  it("needs the round with a Who's That Pokémon? guess or pass", () => {
    const gameId = '00000000-0000-4000-8000-000000000000';
    expect(ok(whosThatGuessInput, { gameId, index: 0, guess: 'pikachu' })).toBe(true);
    expect(ok(whosThatGuessInput, { gameId, guess: 'pikachu' })).toBe(false);
    expect(ok(whosThatPassInput, { gameId, index: 3 })).toBe(true);
    expect(ok(whosThatPassInput, { gameId })).toBe(false);
  });
});
