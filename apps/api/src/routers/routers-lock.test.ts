import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md: "any check-then-write on an account must run with the user row locked or as one atomic update". This reads
 * the routers' source: every mutation must call `lockUser(` (or a helper of its file that does: LOCKING), or be listed
 * in UNLOCKED with the reason it needs none. A new mutation that writes without the lock fails here.
 */

/** Helpers that lock the user row themselves, by file. */
const LOCKING: Record<string, string[]> = {
  'contest.ts': ['loadContest('],
  // Safari Draft's start and act lock the user row in apps/api/src/safari.ts (a won run banks its ₱ in the same transaction).
  'safari.ts': ['startSafari(', 'actSafari('],
};

/**
 * The Extras, contest and Who's That routers' mutations with no `lockUser(` in them, each with why it needs none. A
 * mutation listed here that locks after all, or is gone, fails the last test: the list stays true.
 */
const UNLOCKED: Record<string, string> = {
  // A debug cheat (debugProcedure: never in production), one atomic update.
  'extras.fillCoins': 'debug only, one update',
  // A run's event: the run's own version check (advanceRun's expectedVersion) is its guard, as every run action's.
  'whosThat.runStart': "the run's version",
  'whosThat.runGuess': "the run's version",
};

/**
 * The other routers' mutations with no `lockUser(` in their own text, as they stood at issue #204: listed, not judged.
 * Many lock or guard in a helper of another file (advanceRun's and saveGameState's versions, startRun, openPacks…) and
 * some are plain single-row writes; which of them need the lock is issue #204's area 9 (the API clean-up), which owns
 * this list: a mutation it gives `lockUser(` can come off, and a new mutation must not be added here without a reason.
 */
const AREA_9 = [
  'community.setAccountName', 'community.publish', 'community.unpublish', 'community.import',
  'cosmetics.buy', 'cosmetics.assign',
  'debug.run', 'debug.addCurrency',
  'decks.setFavorite', 'decks.save', 'decks.importCode', 'decks.rename', 'decks.favoriteDeck', 'decks.duplicate', 'decks.reorder', 'decks.delete',
  'flair.equip',
  'game.create', 'game.act',
  'idle.start', 'idle.debugStart', 'idle.next', 'idle.catchUp', 'idle.act', 'idle.throwBall', 'idle.resume', 'idle.settings', 'idle.debugNext', 'idle.here', 'idle.debugMoney', 'idle.debugCatch', 'idle.debugWarp',
  'packs.open', 'packs.debugOpen',
  'run.act', 'run.choose', 'run.debugSkipBattle', 'run.useItem', 'run.useConsumable', 'run.retry', 'run.start', 'run.debugStart', 'run.saveDeck', 'run.setTrainerSprite', 'run.setPlayerGender', 'run.equip',
  'settings.save',
  'tower.start', 'tower.act', 'tower.debugSkipBattle',
];

/** The mutations of a router file: each one's name and source, from its key to the end of its `.mutation(...)`. */
function mutations(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const keys = [...source.matchAll(/^ {2}(\w+): \w+Procedure\b/gm)];
  keys.forEach((key, i) => {
    const body = source.slice(key.index, keys[i + 1]?.index ?? source.length);
    if (body.includes('.mutation(')) found.push({ name: key[1]!, body });
  });
  return found;
}

describe("the routers' mutations", () => {
  const dir = new URL('.', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const all = files.flatMap((file) => mutations(readFileSync(new URL(file, dir), 'utf8')).map((m) => ({ ...m, file, id: `${file.replace(/\.ts$/, '')}.${m.name}` })));

  it('are found in every router', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(all.length).toBeGreaterThan(50);
    for (const file of ['extras.ts', 'contest.ts', 'whosThat.ts']) expect(all.some((m) => m.file === file)).toBe(true);
  });

  it('lock the user row, or are listed with why not', () => {
    const unlocked = all.filter((m) => !['lockUser(', ...(LOCKING[m.file] ?? [])].some((call) => m.body.includes(call))).map((m) => m.id);
    expect(unlocked.filter((id) => !(id in UNLOCKED) && !AREA_9.includes(id))).toEqual([]);
  });

  it("lists no Extras, contest or Who's That mutation that locks or is gone, and none of theirs among the other routers'", () => {
    expect(AREA_9.filter((id) => /^(extras|contest|whosThat)\./.test(id))).toEqual([]);
    const ids = new Map(all.map((m) => [m.id, m]));
    for (const id of Object.keys(UNLOCKED)) {
      const m = ids.get(id);
      expect(m, `${id} is no mutation any more`).toBeDefined();
      expect(['lockUser(', ...(LOCKING[m!.file] ?? [])].some((call) => m!.body.includes(call)), `${id} locks now: take it off the list`).toBe(false);
    }
  });
});
