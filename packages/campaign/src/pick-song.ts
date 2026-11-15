// In a file of its own, importing nothing but types: the music player is in the site's layout and needs only this of the
// auto play's rules, while music.ts imports every run type's maps and boss decks (a file is bundled whole with whatever
// it imports; apps/web/scripts/check-dist.mjs checks the site's first load holds none of them).

import type { MusicCue, Song } from './music.js';

/** One of a cue's songs, the same one every time for the same seed. */
export function pickSong(cue: MusicCue): Song {
  let hash = 0;
  for (const c of cue.seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return cue.songs[hash % cue.songs.length]!;
}
