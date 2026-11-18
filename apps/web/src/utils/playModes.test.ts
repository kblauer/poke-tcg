import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPlayPath, PLAY_MODES } from './playModes';

describe("the Play tab's modes", () => {
  it('are the Badge Challenge, the Battle Tower, the Idle Adventure, Safari Draft and Training, in that order', () => {
    expect(PLAY_MODES.map((m) => m.to)).toEqual(['/badge', '/tower', '/idle', '/safari', '/battle']);
    expect(PLAY_MODES.map((m) => m.label)).toEqual(['Badge Challenge', 'Battle Tower', 'Idle Adventure', 'Safari Draft', 'Training']);
  });

  it("light Play on its menu and on each mode's page, and on no other page", () => {
    expect(isPlayPath('/')).toBe(true);
    for (const mode of PLAY_MODES) expect(isPlayPath(mode.to), mode.to).toBe(true);
    for (const path of ['/decks', '/packs', '/extras', '/settings', '/badge/x', '']) expect(isPlayPath(path), path).toBe(false);
  });

  it("each have their tile's picture in public/", () => {
    for (const mode of PLAY_MODES) expect(existsSync(fileURLToPath(new URL(`../../public${mode.picture}`, import.meta.url))), mode.picture).toBe(true);
  });
});
