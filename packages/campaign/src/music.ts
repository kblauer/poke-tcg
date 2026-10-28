// The music player's auto play: which song suits what the player is doing in a run (or a Training battle), by the run's
// region and the soundtrack chosen (the original games' or their remakes'). Songs are named by their album and title in
// apps/web/public/music/tracks.json (a test checks every one is there). Which song each map plays is the games' own
// choice, read from the pret decompilations' map data (pokered, pokefirered, pokecrystal, pokeheartgold, pokeemerald):
// Emerald's maps play Ruby & Sapphire's songs, and Omega Ruby & Alpha Sapphire keeps their places.

import { battlesFought, isBattleKind, type BattleKind, type EncounterKind } from './run.js';
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
  /** Switches to the song at once, without fading the one playing out or this one in (a battle's). */
  cut?: boolean;
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
  battlesFought?: number;
  log: string[];
}

/** The battle just chosen on the map (its option), or the Ace Trainer just accepted (null), before its game is set up. */
export interface SpottedBattle {
  option: number | null;
}

/**
 * The song for the run as it stands: a battle's theme from the moment it's chosen (`spotted`) and through its game (a
 * trainer's at random, a gym leader's, the Elite Four's, the Champion's; the same one throughout, by the run's id and its
 * count of battles fought), the Pokémon Center's in a center (its encounter, or the Gym Challenge's center), the
 * gym's inside a gym, the League's in the Elite Four's and Champion's rooms, the town's over the last TOWN_STEPS steps
 * before a gym, and otherwise the route's (the bike's or Surf's on a route ridden or surfed).
 */
export function runMusic(view: RunMusicView, soundtrack: Soundtrack, runId = '', spotted: SpottedBattle | null = null): MusicCue {
  const type = runType(view.type);
  const music = regionMusic(type.generation, soundtrack);
  const encounter = view.encounter;
  const position = Math.min(view.position, view.steps.length - 1);
  const chosen = spotted && (spotted.option === null ? encounter?.kind : view.steps[position]?.options[spotted.option]?.kind);
  const battle = encounter?.gameId && isBattleKind(encounter.kind) ? encounter.kind : chosen && isBattleKind(chosen) ? chosen : null;
  if (battle) return battleMusic(type.generation, soundtrack, battle, `${runId}:${battlesFought(view)}`);
  const cue = (key: string, title: string): MusicCue => ({ key: `${music.game}:${key}`, songs: [song(music, title)], seed: key });
  if (encounter?.kind === 'center') return cue('center', music.center);
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
 * A battle's themes: a trainer's (one of them, picked by the battle's `id`), a gym leader's, the Elite Four's or the
 * Champion's; each battle cut straight to, from the song's beginning (the user's).
 */
export function battleMusic(gen: number, soundtrack: Soundtrack, kind: BattleKind, id: string): MusicCue {
  const music = regionMusic(gen, soundtrack);
  const titles = kind === 'gymLeader' || kind === 'eliteFour' || kind === 'champion' ? [music[kind]] : music.trainer;
  return { key: `${music.game}:battle:${id}`, songs: titles.map((t) => song(music, t)), seed: id, fromStart: true, cut: true };
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

/**
 * Poffin cooking's music (the Extras page): Platinum plays SEQ_KINOMI1 (the Poffin House's cooking theme, "Poffins") from
 * the berry going in to the end; starting the music, as the blender's does. The same in either soundtrack (there's no
 * remake's in the music player's list).
 */
export function poffinMusic(): MusicCue {
  return { key: 'Diamond, Pearl & Platinum:poffins', songs: [{ game: 'Diamond, Pearl & Platinum', title: 'Poffins' }], seed: 'poffins', start: true };
}

/**
 * The Game Corner's music (the Extras page): Mauville's Game Corner plays MUS_GAME_CORNER (Ruby & Sapphire's "Game
 * Corner") at its counter, tables and machines; the same in either soundtrack (Omega Ruby & Alpha Sapphire has no Game
 * Corner). Only switching music already playing, as a map's does.
 */
export function gameCornerMusic(): MusicCue {
  return { key: 'Ruby & Sapphire:game-corner', songs: [{ game: 'Ruby & Sapphire', title: 'Game Corner' }], seed: 'game-corner' };
}

/**
 * Voltorb Flip's music (the Extras page): HeartGold and SoulSilver's game keeps the Goldenrod Game Corner's song
 * (SEQ_GS_GAME) playing under it; the same in either soundtrack. Started if nothing was playing, as Poffin cooking's.
 */
export function voltorbFlipMusic(): MusicCue {
  return { key: 'HeartGold & SoulSilver:game-corner', songs: [{ game: 'HeartGold & SoulSilver', title: 'Goldenrod Game Corner' }], seed: 'voltorb-flip', start: true };
}

/** One of a cue's songs, the same one every time for the same seed. */
export function pickSong(cue: MusicCue): Song {
  let hash = 0;
  for (const c of cue.seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return cue.songs[hash % cue.songs.length]!;
}

/**
 * Each generation's Battle Tower music (`towerMusic`), by soundtrack: its lobby's and its rooms' (the elevator, corridor and
 * battle room). Gen 2 is Gold, Silver & Crystal's Battle Tower, or HeartGold & SoulSilver's reception desk and Battle Tower
 * (Johto); Gen 3 Emerald's Battle Tower in both (Omega Ruby & Alpha Sapphire has none). Gen 1's would be FireRed's Trainer
 * Tower (MUS_TRAINER_TOWER, its three rooms' music), but it isn't in the music player's list: until it is, Gen 1's floors play
 * Gen 2's, so autoplay always moves off a battle's music when the player is back in the tower (the user's).
 */
const JOHTO_TOWER: Record<Soundtrack, { lobby: Song; rooms: Song }> = {
  original: { lobby: { game: 'Gold, Silver & Crystal', title: 'Battle Tower' }, rooms: { game: 'Gold, Silver & Crystal', title: 'Battle Tower' } },
  remastered: { lobby: { game: 'HeartGold & SoulSilver', title: 'Battle Tower Reception Desk' }, rooms: { game: 'HeartGold & SoulSilver', title: 'Battle Tower (Johto)' } },
};
const TOWER_MUSIC: Record<number, Record<Soundtrack, { lobby: Song; rooms: Song }>> = {
  1: JOHTO_TOWER,
  2: JOHTO_TOWER,
  3: {
    original: { lobby: { game: 'Emerald', title: 'Battle Tower' }, rooms: { game: 'Emerald', title: 'Battle Tower' } },
    remastered: { lobby: { game: 'Emerald', title: 'Battle Tower' }, rooms: { game: 'Emerald', title: 'Battle Tower' } },
  },
};

/**
 * The Idle Adventure's songs for FireRed's maps (README: Idle Adventure): each map's own song (its map.json's `music`, the
 * game's MUS_ constant) by soundtrack, the Red album's for the original one. Pewter's and Fuchsia's themes are Viridian's
 * and Cerulean's in Red, as the run maps have them. Routes 24 and 25 (MUS_ROUTE24) play the Welcome to the World of
 * Pokémon! theme, as both games do; it and Oak's lab's songs are under a minute, `hidden` in tracks.json (the user's:
 * a song a map needs is added however short). The Safari Zone's (MUS_EVOLUTION, the Evolution theme) isn't in it yet: it
 * plays Route 4's until it's added (areas.test.ts lists it).
 */
export const IDLE_MAP_MUSIC: Record<Soundtrack, Record<string, Song>> = {
  original: Object.fromEntries(
    Object.entries({
      MUS_ROUTE1: 'Route 1', MUS_ROUTE3: 'Route 3', MUS_ROUTE11: 'Route 11', MUS_ROUTE24: 'Route 24 - Welcome to the World of Pokémon!', MUS_OAK_LAB: 'Pokémon Lab', MUS_PALLET: 'Pallet Town', MUS_PEWTER: 'Viridian City', MUS_VIRIDIAN_FOREST: 'Viridian Forest',
      MUS_MT_MOON: 'Mt. Moon', MUS_GYM: 'Pokémon Gym', MUS_LAVENDER: 'Lavender Town', MUS_CELADON: 'Celadon City', MUS_FUCHSIA: 'Cerulean City', MUS_CINNABAR: 'Cinnabar Island',
      MUS_VERMILLION: 'Vermilion City', MUS_VICTORY_ROAD: 'Victory Road', MUS_ROCKET_HIDEOUT: 'Rocket Hideout', MUS_POKE_TOWER: 'Pokémon Tower', MUS_CERULEAN: 'Cerulean City', MUS_POKE_MANSION: 'Pokémon Mansion',
    }).map(([k, title]) => [k, { game: 'Red, Green, Blue & Yellow', title }]),
  ),
  remastered: Object.fromEntries(
    Object.entries({
      MUS_ROUTE1: 'Road to Viridian City: Leaving Pallet Town', MUS_ROUTE3: 'Road to Cerulean City: Leaving Mt. Moon', MUS_ROUTE11: 'Road to Fuchsia City: Leaving Lavender Town',
      MUS_ROUTE24: 'Welcome to the World of Pokémon!', MUS_OAK_LAB: "Professor Oak's Laboratory", MUS_PALLET: 'Pallet Town', MUS_PEWTER: 'Pewter City', MUS_VIRIDIAN_FOREST: 'Viridian Forest', MUS_MT_MOON: 'Mt. Moon', MUS_GYM: 'Pokémon Gym',
      MUS_LAVENDER: 'Lavender Town', MUS_CELADON: 'Celadon City', MUS_FUCHSIA: 'Fuchsia City', MUS_CINNABAR: 'Cinnabar Island', MUS_VERMILLION: 'Vermilion City',
      MUS_VICTORY_ROAD: 'Victory Road', MUS_ROCKET_HIDEOUT: 'Rocket Hideout', MUS_POKE_TOWER: 'Pokémon Tower', MUS_CERULEAN: 'Fuchsia City', MUS_POKE_MANSION: 'Pokémon Mansion',
    }).map(([k, title]) => [k, { game: 'FireRed & LeafGreen', title }]),
  ),
};

/**
 * The Idle Adventure's music: a map's song (IDLE_MAP_MUSIC; Surfing on the water, the bike's on the Cycling Road, where the
 * page says FireRed plays them), or a battle's: the wild, trainer,
 * gym leader (and Elite Four) or Champion theme, from the start, or the Hall of Fame once the Champion is beaten.
 */
export function idleMusic(soundtrack: Soundtrack, place: { map: string; surfing?: boolean; cycling?: boolean } | { battle: 'wild' | 'trainer' | 'leader' | 'champion'; id: string } | { won: true }): MusicCue {
  const m = regionMusic(1, soundtrack);
  if ('won' in place) return { key: `idle:won:${m.victory}`, songs: [song(m, m.victory)], seed: 'idle' };
  if ('battle' in place) {
    const title = place.battle === 'wild' ? m.trainer[1]! : place.battle === 'trainer' ? m.trainer[0]! : place.battle === 'leader' ? m.gymLeader : m.champion;
    return { key: `idle:battle:${place.id}`, songs: [song(m, title)], seed: place.id, fromStart: true, cut: true };
  }
  const s = place.surfing ? song(m, m.surf) : place.cycling ? song(m, m.bike) : (IDLE_MAP_MUSIC[soundtrack][place.map] ?? song(m, m.routes['Route 4']!));
  return { key: `idle:${s.game}:${s.title}`, songs: [s], seed: 'idle' };
}

/** The Battle Tower's music for a generation's lobby or rooms (TOWER_MUSIC; past the last generation with its own, that one's). */
export function towerMusic(gen: number, soundtrack: Soundtrack, place: 'lobby' | 'rooms'): MusicCue {
  const last = Math.max(...Object.keys(TOWER_MUSIC).map(Number));
  const s = TOWER_MUSIC[Math.min(Math.max(gen, 1), last)]![soundtrack][place];
  return { key: `${s.game}:tower:${s.title}`, songs: [s], seed: 'tower' };
}
