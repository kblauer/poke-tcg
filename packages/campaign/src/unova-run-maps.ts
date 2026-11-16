// The Unova run types' maps (RunMaps, run-type-info.ts), from Black (issue #231). None are drawn yet: every Unova run
// shows the icon map (no routes) until tools/routes/bw/ renders them, as Sinnoh's runs did before theirs. A file of its
// own so the site loads it only for a Unova run (loadRunMaps).
import type { RunMaps } from './run-type-info.js';

const ICON_MAP: RunMaps = { routes: [] };

export const UNOVA_RUN_MAPS = {
  striaton: ICON_MAP,
  nacrene: ICON_MAP,
  castelia: ICON_MAP,
  nimbasa: ICON_MAP,
  driftveil: ICON_MAP,
  mistralton: ICON_MAP,
  icirrus: ICON_MAP,
  opelucid: ICON_MAP,
  unovaGyms: ICON_MAP,
  unovaChampion: ICON_MAP,
} satisfies Record<string, RunMaps>;
