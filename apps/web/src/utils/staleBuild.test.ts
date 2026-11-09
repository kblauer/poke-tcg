import { describe, expect, it } from 'vitest';
import { isStaleBuildError } from './staleBuild';

describe('isStaleBuildError', () => {
  it("knows each browser's words for a lazily loaded file that's gone, and nothing else", () => {
    expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://poke-tcg-two.vercel.app/assets/CardInspector-C6X3K5Rm.js'))).toBe(true);
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isStaleBuildError(new Error('Unable to preload CSS for /assets/index.css'))).toBe(true);
    expect(isStaleBuildError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });
});
