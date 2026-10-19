// The music player's track list: Pokémon game music (generations 1–5) streamed from KHInsider, listed in
// public/music/tracks.json (only tracks of a minute or more), and how the player's song list groups it.

export interface Track {
  title: string;
  /** The game (or games sharing a soundtrack), e.g. "Gold, Silver & Crystal". */
  game: string;
  gen: number;
  /** Battle music ("Battle!", "Final Battle!" …), listed apart from the rest. */
  battle: boolean;
  seconds: number;
  /** The MP3, hotlinked from KHInsider's file host. */
  url: string;
}

/** The generations to filter by; null is all of them. */
export const MUSIC_GENERATIONS = [1, 2, 3, 4, 5];
export type GenFilter = number | null;

/** The tracks of a generation (or all), in list order: game by game, each game's other music before its battle music. */
export function playlist(tracks: readonly Track[], gen: GenFilter): Track[] {
  const shown = tracks.filter((t) => gen === null || t.gen === gen);
  const games = [...new Set(shown.map((t) => t.game))];
  return games.flatMap((game) => [...shown.filter((t) => t.game === game && !t.battle), ...shown.filter((t) => t.game === game && t.battle)]);
}

/** The playlist grouped for the song list: each game with its other music and its battle music. */
export function groupByGame(list: readonly Track[]): { game: string; gen: number; music: Track[]; battle: Track[] }[] {
  const games = [...new Set(list.map((t) => t.game))];
  return games.map((game) => {
    const tracks = list.filter((t) => t.game === game);
    return { game, gen: tracks[0]!.gen, music: tracks.filter((t) => !t.battle), battle: tracks.filter((t) => t.battle) };
  });
}

export const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
