// The music player's auto play: which song suits what the player is doing in a run (or a Training battle), by the run's
// region and the soundtrack chosen (the original games' or their remakes'). Songs are named by their album and title in
// apps/web/public/music/tracks.json (a test checks every one is there). Which song each map plays is the games' own
// choice, read from the pret decompilations' map data (pokered, pokefirered, pokecrystal, pokeheartgold, pokeemerald):
// Emerald's maps play Ruby & Sapphire's songs, and Omega Ruby & Alpha Sapphire keeps their places.

import { isBattleKind, type BattleKind, type EncounterKind } from './run.js';
import { routeAt, RUN_TYPE_IDS, runBosses, runType } from './run-types.js';

export type Soundtrack = 'original' | 'remastered';
export const SOUNDTRACKS: Soundtrack[] = ['original', 'remastered'];

/** A song of the music player's list, by its album (`game`) and title. */
export interface Song {
  game: string;
  title: string;
}

/**
 * What auto play plays: one of `songs` (a battle's themes, picked at random once a battle by `seed`), looped. `key` changes
 * whenever the music should, so the player only switches songs when it does.
 */
export interface MusicCue {
  key: string;
  songs: Song[];
  seed: string;
  /**
   * Starts the music if it isn't playing (the Berry Blender's: its music is part of the game), and stops it again when
   * the cue ends; other cues only switch the song of music already playing.
   */
  start?: boolean;
  /** Starts the song from its beginning (a battle's), never where it was last left. */
  fromStart?: boolean;
  /**
   * Plays the song once instead of looping it, then shuffles the album's (`game`) other music, its battle music left out
   * (a beaten run's victory theme). Once a session for the same key.
   */
  then?: { shuffle: string };
}

/** A region's music in one soundtrack (titles of its album, `game`). */
interface RegionMusic {
  game: string;
  /** Each route map's song, by the map's name (`Route.name`). */
  routes: Record<string, string>;
  /** Each gym run's town theme, by run type id: played over the last steps before the gym. */
  towns: Record<string, string>;
  bike: string;
  surf: string;
  gym: string;
  /** In the Elite Four's and the Champion's rooms. */
  league: string;
  center: string;
  /** The jingle as Nurse Joy heals the party. */
  healed: string;
  /** Trainers' battles (Gym Trainers' and Ace Trainers' too): the trainer, wild Pokémon and rival themes, one at random. */
  trainer: string[];
  gymLeader: string;
  eliteFour: string;
  champion: string;
  /** Once a run is beaten, before the album's music is shuffled. */
  victory: string;
}

// Kanto: Route 1's theme on Route 2, Route 3's on Routes 4–20 (the bike and surfing have their own), Pewter's in Saffron,
// Cerulean's in Fuchsia (FireRed's album calls it Fuchsia City); the League's rooms play the Indigo Plateau theme (both
// albums' Victory Road). Viridian's run (the Power Plant, then Giovanni's town) plays Rocket Hideout (the user's). Gen 1 has
// no rival battle theme but the Champion's, and its Elite Four fight to the Gym Leader theme. Red's victory jingles are all
// under a minute (not in the list), so its beaten runs play the Hall of Fame.
const KANTO_RED: RegionMusic = {
  game: 'Red, Green, Blue & Yellow',
  routes: { 'Route 2': 'Route 1', 'Route 4': 'Route 3', 'Route 5': 'Route 3', 'Route 6': 'Route 3', 'Route 8': 'Route 3', 'Route 17': 'Route 3', 'Route 20': 'Route 3', 'Power Plant': 'Rocket Hideout', ...floors('Pokémon Tower') },
  towns: { pewter: 'Viridian City', cerulean: 'Cerulean City', vermilion: 'Vermilion City', celadon: 'Celadon City', saffron: 'Viridian City', fuchsia: 'Cerulean City', cinnabar: 'Cinnabar Island', viridian: 'Rocket Hideout' },
  bike: 'Bicycle',
  surf: 'Surf',
  gym: 'Pokémon Gym',
  league: 'Victory Road',
  center: 'Pokémon Center',
  healed: 'Pokémon Healed',
  trainer: ['Battle! (Trainer Battle)', 'Battle! (Wild Pokémon)'],
  gymLeader: 'Battle! (Gym Leader)',
  eliteFour: 'Battle! (Gym Leader)',
  champion: 'Final Battle! (Rival)',
  victory: 'Hall of Fame',
};

const KANTO_FIRERED: RegionMusic = {
  game: 'FireRed & LeafGreen',
  routes: mapValues(KANTO_RED.routes, (t) => (t === 'Route 1' ? 'Road to Viridian City: Leaving Pallet Town' : t === 'Route 3' ? 'Road to Cerulean City: Leaving Mt. Moon' : t)),
  towns: { pewter: 'Pewter City', cerulean: 'Fuchsia City', vermilion: 'Vermilion City', celadon: 'Celadon City', saffron: 'Pewter City', fuchsia: 'Fuchsia City', cinnabar: 'Cinnabar Island', viridian: 'Rocket Hideout' },
  bike: 'Cycling',
  surf: 'Surfing',
  gym: 'Pokémon Gym',
  league: 'Victory Road',
  center: 'Pokémon Center',
  healed: 'Pokémon Healed',
  trainer: ['Battle! (Trainer)', 'Battle! (Wild Pokémon)'],
  gymLeader: 'Battle! (Gym Leader)',
  eliteFour: 'Battle! (Gym Leader)',
  champion: 'Final Battle! (Rival)',
  victory: 'Victory! (Gym Leader)',
};

// Johto: Route 30's theme on Routes 30 and 32, Route 34's (the albums' name for Route 36's) on 34, 35, 40 and 45, Route 42's
// (Lake of Rage's) on 42 and 44; Olivine plays Violet's theme, Mahogany Cherrygrove's, Blackthorn Azalea's, and Cianwood
// Ecruteak's (HeartGold & SoulSilver gave it its own). Its Elite Four fight to the Gym Leader theme too.
const JOHTO_ROUTES = { 'Route 30': 'Route 30', 'Route 32': 'Route 30', 'Route 34': 'Route 34', 'Route 35': 'Route 34', 'Route 40': 'Route 34', 'Route 45': 'Route 34', 'Route 42': 'Route 42', 'Route 42 (upper)': 'Route 42', 'Route 44': 'Route 42', 'Route 44 (upper)': 'Route 42' };
const JOHTO_TOWNS = { violet: 'Violet City', azalea: 'Azalea Town', goldenrod: 'Goldenrod City', ecruteak: 'Ecruteak City', cianwood: 'Ecruteak City', olivine: 'Violet City', mahogany: 'Cherrygrove City', blackthorn: 'Azalea Town' };

const JOHTO_GOLD: RegionMusic = {
  game: 'Gold, Silver & Crystal',
  routes: JOHTO_ROUTES,
  towns: JOHTO_TOWNS,
  bike: 'Bicycle',
  surf: 'Surf',
  gym: 'Pokémon Gym',
  league: 'Pokémon League',
  center: 'Pokémon Center',
  healed: 'Pokémon Healed',
  trainer: ['Battle! (Trainer Battle - Johto)', 'Battle! (Wild Pokémon - Johto - Day)', 'Battle! (Wild Pokémon - Johto - Night)', 'Battle! (Rival)'],
  gymLeader: 'Battle! (Gym Leader - Johto)',
  eliteFour: 'Battle! (Gym Leader - Johto)',
  champion: 'Battle! (Champion)',
  victory: 'Victory! (Gym Leader)',
};

const JOHTO_HEARTGOLD: RegionMusic = {
  game: 'HeartGold & SoulSilver',
  routes: JOHTO_ROUTES,
  towns: { ...JOHTO_TOWNS, cianwood: 'Cianwood City' },
  bike: 'Bicycle',
  surf: 'Surf',
  gym: 'Pokémon Gym',
  league: 'The Pokémon League',
  center: 'Pokémon Center',
  healed: 'Pokémon Healed',
  trainer: ['Battle! (Trainer—Johto Version)', 'Battle! (Wild Pokémon—Johto Version)', 'Battle! (Rival)'],
  gymLeader: 'Battle! (Gym Leader—Johto Version)',
  eliteFour: 'Battle! (Gym Leader—Johto Version)',
  champion: 'Battle! (Champion)',
  victory: 'Victory! (Gym Leader)',
};

// Hoenn (Emerald's maps): Petalburg Woods' theme in Jagged Pass too, Route 101's on Route 102, Route 104's and Route 120's
// on Routes 106 and 124 (surfed: the Surf theme), Rustboro's in Mauville and Mossdeep, Oldale's in Lavaridge; Sootopolis
// City plays its own theme, surfed or not. The Elite Four's and the Champion's rooms play Victory Road.
const HOENN_ROUTES = { 'Route 106': 'Route 104', 'Route 110': 'Route 110', 'Route 102': 'Route 101', 'Route 119': 'Route 119', 'Route 124': 'Route 120', 'Sootopolis City': 'Sootopolis City' };
const HOENN_TOWNS = { rustboro: 'Rustboro City', dewford: 'Dewford Town', mauville: 'Rustboro City', lavaridge: 'Oldale Town', petalburg: 'Petalburg City', fortree: 'Fortree City', mossdeep: 'Rustboro City', sootopolis: 'Sootopolis City' };

const HOENN_RUBY: RegionMusic = {
  game: 'Ruby & Sapphire',
  routes: { ...HOENN_ROUTES, 'Petalburg Woods': 'Petalburg Forest', 'Jagged Pass': 'Petalburg Forest' },
  towns: HOENN_TOWNS,
  bike: 'Cycling',
  surf: 'Surf',
  gym: 'Pokémon Gym',
  league: 'Victory Road',
  center: 'Pokémon Center',
  healed: 'Pokémon Healed',
  trainer: ['Battle! (Trainer Battle)', 'Battle! (Wild Pokémon)', 'Battle! (Brendan-May)'],
  gymLeader: 'Battle! (Gym Leader)',
  eliteFour: 'Battle! (Elite Four)',
  champion: 'Battle! (Steven)',
  victory: 'Victory! (Gym Leader)',
};

const HOENN_OMEGA_RUBY: RegionMusic = {
  ...HOENN_RUBY,
  game: 'Omega Ruby & Alpha Sapphire',
  routes: { ...HOENN_ROUTES, 'Petalburg Woods': 'Petalburg Woods', 'Jagged Pass': 'Petalburg Woods' },
  trainer: ['Battle! (Trainer Battle)', 'Battle! (Wild Pokémon)', 'Battle! (Brendan - May)'],
  victory: 'Victory! (Gym Leader - Elite Four)',
};

/** Each generation's region's music, by soundtrack. */
export const REGION_MUSIC: Record<number, Record<Soundtrack, RegionMusic>> = {
  1: { original: KANTO_RED, remastered: KANTO_FIRERED },
  2: { original: JOHTO_GOLD, remastered: JOHTO_HEARTGOLD },
  3: { original: HOENN_RUBY, remastered: HOENN_OMEGA_RUBY },
};

function floors(name: string): Record<string, string> {
  return Object.fromEntries([1, 2, 3, 4, 5].map((f) => [`${name} ${f}F`, name]));
}

function mapValues(record: Record<string, string>, f: (value: string) => string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, f(v)]));
}

const regionMusic = (gen: number, soundtrack: Soundtrack): RegionMusic => (REGION_MUSIC[gen] ?? REGION_MUSIC[1]!)[soundtrack];
const song = (music: RegionMusic, title: string): Song => ({ game: music.game, title });

/** How many steps before the gym the town theme takes over from the route's. */
export const TOWN_STEPS = 3;

/** What the music needs of a run: its view (or state) is enough. */
export interface RunMusicView {
  type: string;
  position: number;
  phase: string;
  steps: { options: { kind: EncounterKind }[] }[];
  encounter: { kind: string; gameId?: string } | null;
}

/**
 * The song for the run as it stands: a battle's theme once its game is under way (a trainer's at random, a gym leader's,
 * the Elite Four's, the Champion's), the Pokémon Center's in a center (its encounter, or the Gym Challenge's center), the
 * gym's inside a gym, the League's in the Elite Four's and Champion's rooms, the town's over the last TOWN_STEPS steps
 * before a gym, and otherwise the route's (the bike's or Surf's on a route ridden or surfed).
 */
export function runMusic(view: RunMusicView, soundtrack: Soundtrack): MusicCue {
  const type = runType(view.type);
  const music = regionMusic(type.generation, soundtrack);
  const encounter = view.encounter;
  if (encounter?.gameId && isBattleKind(encounter.kind)) return battleMusic(type.generation, soundtrack, encounter.kind, encounter.gameId);
  const cue = (key: string, title: string): MusicCue => ({ key: `${music.game}:${key}`, songs: [song(music, title)], seed: key });
  if (encounter?.kind === 'center') return cue('center', music.center);
  const position = Math.min(view.position, view.steps.length - 1);
  const kinds = view.steps[position]?.options.map((o) => o.kind) ?? [];
  if (kinds.includes('gymTrainer') || kinds.includes('gymLeader')) return cue('gym', music.gym);
  if (kinds.includes('eliteFour') || kinds.includes('champion')) return cue('league', music.league);
  if (kinds.length === 1 && kinds[0] === 'center') return cue('center', music.center);
  const gymAt = view.steps.findIndex((s) => s.options.some((o) => o.kind === 'gymTrainer' || o.kind === 'gymLeader'));
  const town = music.towns[type.id];
  if (town && gymAt >= 0 && gymAt - position <= TOWN_STEPS) return cue(`town:${type.id}`, town);
  // The step's route map (as RouteView shows it: each map's spots in turn), or the last one past them all (the gym's steps).
  const route = routeAt(type, position)?.route ?? type.routes?.at(-1) ?? null;
  if (route?.travel === 'bike') return cue('bike', music.bike);
  // Sootopolis City is surfed, but keeps its own theme.
  if (route?.travel === 'surf' && route.name !== 'Sootopolis City') return cue('surf', music.surf);
  const title = route && music.routes[route.name];
  return title ? cue(`route:${title}`, title) : cue('town', town ?? music.center);
}

/**
 * A battle's themes: a trainer's (one of them, picked by the game's id), a gym leader's, the Elite Four's or the Champion's;
 * each battle from the song's beginning.
 */
export function battleMusic(gen: number, soundtrack: Soundtrack, kind: BattleKind, gameId: string): MusicCue {
  const music = regionMusic(gen, soundtrack);
  const titles = kind === 'gymLeader' || kind === 'eliteFour' || kind === 'champion' ? [music[kind]] : music.trainer;
  return { key: `${music.game}:battle:${gameId}`, songs: titles.map((t) => song(music, t)), seed: gameId, fromStart: true };
}

/** A beaten run's music: its region's victory theme once, from the start, then the album's other music shuffled. */
export function victoryMusic(typeId: string, soundtrack: Soundtrack, runId: string): MusicCue {
  const music = regionMusic(runType(typeId).generation, soundtrack);
  return { key: `${music.game}:victory:${runId}`, songs: [song(music, music.victory)], seed: runId, fromStart: true, then: { shuffle: music.game } };
}

/** The Pokémon Center's healing jingle for a run's region. */
export const healedJingle = (typeId: string, soundtrack: Soundtrack): Song => {
  const music = regionMusic(runType(typeId).generation, soundtrack);
  return song(music, music.healed);
};

/** Each boss's generation and role, from the run types that have them. */
const BOSS_GENERATIONS = new Map(RUN_TYPE_IDS.flatMap((id) => runBosses(runType(id)).map((b) => [b, runType(id).generation] as const)));

/**
 * A Training battle's music, from its opponent's label ("Gym Leader Brock", "Elite Four Lorelei", "Champion Blue"): the
 * boss's region and role; a trainer's battle is Kanto's.
 */
export function practiceMusic(opponent: string | null, soundtrack: Soundtrack, gameId: string): MusicCue {
  const label = opponent ?? '';
  const found = [...BOSS_GENERATIONS].find(([b]) => `${b.kind === 'gymLeader' ? 'Gym Leader' : b.title} ${b.name}` === label);
  return found ? battleMusic(found[1], soundtrack, found[0].kind, gameId) : battleMusic(1, soundtrack, 'battle', gameId);
}

/** The Berry Blender's music (the Extras page): Emerald plays the Cycling theme while it spins (MUS_CYCLING), in either soundtrack. */
export function blenderMusic(soundtrack: Soundtrack): MusicCue {
  const music = regionMusic(3, soundtrack);
  return { key: `${music.game}:blender`, songs: [song(music, music.bike)], seed: 'blender', start: true };
}

/** One of a cue's songs, the same one every time for the same seed. */
export function pickSong(cue: MusicCue): Song {
  let hash = 0;
  for (const c of cue.seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return cue.songs[hash % cue.songs.length]!;
}
