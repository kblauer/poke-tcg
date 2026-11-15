// Saved runs hold places along the areas' tracks (IdleState's area, leg and step, its progress, loop, grind and replay),
// so an area's place in the list and its tracks must never change once runs exist: a regenerated data file that moves
// one leaves those runs somewhere else, or nowhere (#204). This pins every area of every region to tracks.fixture.json.
// A track may be added (a new area at the end, a new region); to change one on purpose, write a migration for the saved
// runs first, then run `UPDATE_TRACKS=1 npx vitest run src/tracks.test.ts` and commit the fixture.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { areas, isTown, type WalkArea } from './areas.js';
import { allGenerations, inGeneration } from './generation.js';

const FIXTURE = new URL('./tracks.fixture.json', import.meta.url);

/** Each region's areas in order: a town's id alone, a walked area's id with each leg's length and a hash of its steps. */
const pins = () =>
  Object.fromEntries(
    allGenerations().map((g) => [
      g.region,
      inGeneration(g.gen, () =>
        areas().map((a) => (isTown(a) ? a.id : `${a.id} ${(a as WalkArea).legs.map((l) => `${l.track.length}:${createHash('sha1').update(JSON.stringify(l.track)).digest('hex').slice(0, 12)}`).join(' ')}`)),
      ),
    ]),
  );

describe("the areas' tracks", () => {
  it('are the ones saved runs were made on (see this file\'s header before changing the fixture)', () => {
    const now = pins();
    if (process.env.UPDATE_TRACKS || !existsSync(FIXTURE)) writeFileSync(FIXTURE, `${JSON.stringify(now, null, 1)}\n`);
    const pinned = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string[]>;
    for (const [region, list] of Object.entries(pinned)) {
      // Every pinned area is still at its place with its tracks; more may follow it.
      list.forEach((pin, i) => expect(now[region]?.[i], `${region}, area ${i} (${pin.split(' ')[0]}): saved runs hold steps along its track`).toBe(pin));
    }
  });
});
