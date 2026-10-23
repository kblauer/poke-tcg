import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { battleMusic, healedJingle, pickSong, practiceMusic, REGION_MUSIC, runMusic, SOUNDTRACKS, type MusicCue, type RunMusicView } from './music.js';
import { createRun } from './run.js';
import { RUN_TYPE_IDS, runType, type RunTypeId } from './run-types.js';

const tracks = JSON.parse(readFileSync(new URL('../../../apps/web/public/music/tracks.json', import.meta.url), 'utf8')) as { game: string; title: string }[];
const inList = (s: { game: string; title: string }) => tracks.some((t) => t.game === s.game && t.title === s.title);

/** A run of the type, at a step (on the map, or with the given encounter under way). */
function viewAt(type: string, position: number, encounter: RunMusicView['encounter'] = null): RunMusicView {
  const run = createRun(type as RunTypeId, [], 1);
  return { type, position, phase: encounter ? 'encounter' : 'map', steps: run.steps, encounter };
}
const titles = (cue: MusicCue) => cue.songs.map((s) => s.title);

describe('auto play music', () => {
  it("every song it can play is in the music player's list (public/music/tracks.json)", () => {
    const missing = Object.values(REGION_MUSIC).flatMap((bySoundtrack) =>
      Object.values(bySoundtrack).flatMap((m) => {
        const named = [...Object.values(m.routes), ...Object.values(m.towns), m.bike, m.surf, m.gym, m.league, m.center, m.healed, ...m.trainer, m.gymLeader, m.eliteFour, m.champion];
        return named.filter((title) => !inList({ game: m.game, title })).map((title) => `${m.game}: ${title}`);
      }),
    );
    expect(missing).toEqual([]);
  });

  it("every run type's maps and towns have their songs, at every step, in both soundtracks", () => {
    for (const id of RUN_TYPE_IDS) {
      const type = runType(id);
      for (const map of type.routes ?? []) {
        if (type.gym) expect(REGION_MUSIC[type.generation]!.original.routes[map.name], `${id}: ${map.name}`).toBeDefined();
      }
      if (type.gym) expect(REGION_MUSIC[type.generation]!.original.towns[id], `${id}'s town`).toBeDefined();
      const steps = createRun(id, [], 1).steps.length;
      for (const soundtrack of SOUNDTRACKS) {
        for (let p = 0; p <= steps; p++) for (const s of runMusic(viewAt(id, p), soundtrack).songs) expect(inList(s), `${id} step ${p}: ${s.title}`).toBe(true);
        expect(inList(healedJingle(id, soundtrack))).toBe(true);
      }
    }
  });

  it("plays a gym run's route, its town over the last 3 steps before the gym, then the gym", () => {
    const steps = createRun('pewter', [], 1).steps.length;
    const at = (p: number) => titles(runMusic(viewAt('pewter', p), 'original'));
    expect(at(0)).toEqual(['Route 1']);
    expect(at(steps - 6)).toEqual(['Route 1']);
    expect(at(steps - 5)).toEqual(['Viridian City']);
    expect(at(steps - 3)).toEqual(['Viridian City']);
    expect(at(steps - 2)).toEqual(['Pokémon Gym']);
    expect(at(steps - 1)).toEqual(['Pokémon Gym']);
    expect(titles(runMusic(viewAt('pewter', 0), 'remastered'))).toEqual(['Road to Viridian City: Leaving Pallet Town']);
  });

  it('rides and surfs to the bike and Surf themes', () => {
    expect(titles(runMusic(viewAt('fuchsia', 0), 'remastered'))).toEqual(['Cycling']);
    expect(titles(runMusic(viewAt('cinnabar', 0), 'original'))).toEqual(['Surf']);
    expect(titles(runMusic(viewAt('sootopolis', 0), 'original'))).toEqual(['Sootopolis City']);
  });

  it("plays battles' themes once their game is on, and the Pokémon Center's in a center", () => {
    expect(titles(runMusic(viewAt('pewter', 0, { kind: 'battle', gameId: 'g1' }), 'original'))).toEqual(['Battle! (Trainer Battle)', 'Battle! (Wild Pokémon)']);
    // Before its game starts (an Ace Trainer not yet accepted), the map's song plays on.
    expect(titles(runMusic(viewAt('pewter', 0, { kind: 'elite' }), 'original'))).toEqual(['Route 1']);
    expect(titles(runMusic(viewAt('violet', 0, { kind: 'gymLeader', gameId: 'g2' }), 'remastered'))).toEqual(['Battle! (Gym Leader—Johto Version)']);
    expect(titles(runMusic(viewAt('pewter', 3, { kind: 'center', gameId: undefined }), 'original'))).toEqual(['Pokémon Center']);
    expect(titles(battleMusic(3, 'original', 'eliteFour', 'g3'))).toEqual(['Battle! (Elite Four)']);
    expect(titles(battleMusic(2, 'original', 'champion', 'g4'))).toEqual(['Battle! (Champion)']);
  });

  it("plays the Gym Challenge's leaders in their gyms, its center, and the Champion run's League rooms", () => {
    expect(titles(runMusic(viewAt('kantoGyms', 0), 'original'))).toEqual(['Pokémon Gym']);
    expect(titles(runMusic(viewAt('kantoGyms', 4), 'original'))).toEqual(['Pokémon Center']);
    expect(titles(runMusic(viewAt('johtoChampion', 8), 'original'))).toEqual(['Pokémon League']);
    expect(titles(runMusic(viewAt('hoennChampion', 12), 'remastered'))).toEqual(['Victory Road']);
  });

  it("gives Practice battles their boss's region and role, and picks a battle's song the same way every time", () => {
    expect(titles(practiceMusic('Gym Leader Clair', 'original', 'g'))).toEqual(['Battle! (Gym Leader - Johto)']);
    expect(titles(practiceMusic('Champion Wallace', 'remastered', 'g'))).toEqual(['Battle! (Steven)']);
    expect(titles(practiceMusic('Youngster Joey', 'original', 'g'))).toEqual(['Battle! (Trainer Battle)', 'Battle! (Wild Pokémon)']);
    const cue = battleMusic(2, 'original', 'battle', 'some-game');
    expect(pickSong(cue)).toEqual(pickSong(cue));
  });
});
