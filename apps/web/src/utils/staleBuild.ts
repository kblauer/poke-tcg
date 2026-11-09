/**
 * A tab left open across a deploy runs the old build, whose lazily loaded files (hashed names: pages, CardInspector…)
 * are gone from the new deployment, so loading one fails ("Failed to fetch dynamically imported module"). The page is
 * then reloaded onto the new build (main.tsx: Vite's `vite:preloadError`, and the router's error screen), at most once
 * in RELOAD_GAP_MS, so a file that's really missing can't loop it.
 */

const KEY = 'poke-tcg.stale-build-reload';
const RELOAD_GAP_MS = 10_000;

/** Whether an error is a lazily loaded file that's gone (each browser words it its own way). */
export const isStaleBuildError = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(String((error as Error | undefined)?.message ?? error));

/** Reloads the page onto the new build, unless it already did a moment ago; whether it did. */
export function reloadForNewBuild(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No session storage: reload anyway (a loop needs the file to be really missing).
  }
  window.location.reload();
  return true;
}
