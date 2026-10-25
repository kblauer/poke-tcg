// The Extras minigames' sounds (the Berry Blender's, Poffin cooking's): sound effects rendered from the games'
// decompilations (tools/extras/m4a_render.py, nds_render.py), played with the Web Audio API as the games' sound engines
// play them: each on its player (song_table.inc's, or pl_sound_data.json's), a new one replacing the one playing there
// unless that one's priority is higher; one of them can loop, its pitch changed as it plays. Their volume (the slider
// under each minigame's screen, MinigameVolume) is the same for every minigame.

/** The minigames' volume, 0 to 100: remembered in this browser (a convenience; DEFAULT_VOLUME if it can't be read). */
const VOLUME_KEY = 'poke-tcg.minigame-volume';
/** The Berry Blender's own key, from before the volume was shared: read if there's no shared one yet. */
const OLD_VOLUME_KEY = 'poke-tcg.blender-volume';
const DEFAULT_VOLUME = 70;
export function loadVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY) ?? localStorage.getItem(OLD_VOLUME_KEY);
    const v = saved === null ? NaN : Number(saved);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}
export function saveVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Not remembered.
  }
}
/** A volume (0-100) as a gain: squared, so the slider's middle sounds like half as loud. */
const gainOf = (volume: number) => (volume / 100) ** 2;

/** Stops a sound (already stopped or ended is fine). */
function stop(source: AudioBufferSourceNode) {
  try {
    source.stop();
  } catch {
    // Already stopped.
  }
}

/**
 * A minigame's sounds (`folder`/<name>.wav, each on its player with its priority), loaded once a screen; `close` when it
 * goes. Silent until loaded, and at volume 0.
 */
export class MinigameSound<Name extends string> {
  private ctx: AudioContext | null;
  private out: GainNode | null;
  private buffers = new Map<Name, AudioBuffer>();
  private playing = new Map<string, { source: AudioBufferSourceNode; priority: number; ends: number; name?: Name }>();
  private loop: { source: AudioBufferSourceNode; player: string } | null = null;
  private pitch = 0;

  constructor(
    folder: string,
    private players: Record<Name, [player: string, priority: number]>,
    volume: number,
  ) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = Context ? new Context() : null;
    this.out = this.ctx ? this.ctx.createGain() : null;
    if (this.ctx && this.out) {
      this.out.connect(this.ctx.destination);
      this.out.gain.value = gainOf(volume);
      for (const name of Object.keys(players) as Name[]) {
        fetch(`${folder}/${name}.wav`)
          .then((r) => r.arrayBuffer())
          .then((data) => this.ctx!.decodeAudioData(data))
          .then((buffer) => this.buffers.set(name, buffer))
          .catch(() => undefined);
      }
    }
  }

  /** Browsers start audio only after a click or key: called on each press. */
  resume() {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** The volume, 0 to 100. */
  setVolume(volume: number) {
    if (this.out && this.ctx) this.out.gain.setValueAtTime(gainOf(volume), this.ctx.currentTime);
  }

  /** PlaySE: on its player, unless a sound of higher priority is still playing there. */
  play(name: Name) {
    const buffer = this.buffers.get(name);
    if (!this.ctx || !this.out || !buffer) return;
    const [player, priority] = this.players[name];
    const current = this.playing.get(player);
    if (current && current.ends > this.ctx.currentTime && current.priority > priority) return;
    if (current && this.loop && current.source === this.loop.source) this.stopLoop();
    else if (current) stop(current.source);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.out);
    source.start();
    this.playing.set(player, { source, priority, ends: this.ctx.currentTime + buffer.duration, name });
  }

  /** Whether any of `names` (or any sound, with none given) is still playing (IsSEPlaying): never while the audio is suspended, so a minigame waiting on one can't stall. */
  isPlaying(...names: Name[]) {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    for (const p of this.playing.values()) if (p.ends > this.ctx.currentTime && (!names.length || (p.name !== undefined && names.includes(p.name)))) return true;
    return false;
  }

  /** A sound looped on its player until `stopLoop` (the Berry Blender's whirring). */
  startLoop(name: Name) {
    const buffer = this.buffers.get(name);
    if (!this.ctx || !this.out || !buffer) return;
    this.stopLoop();
    const [player, priority] = this.players[name];
    const current = this.playing.get(player);
    if (current) stop(current.source);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 2 ** (this.pitch / 256 / 12);
    source.connect(this.out);
    source.start();
    this.loop = { source, player };
    this.playing.set(player, { source, priority, ends: Infinity });
  }

  /** The loop's pitch in 256ths of a semitone (m4aMPlayPitchControl). */
  setPitch(pitch: number) {
    this.pitch = pitch;
    if (this.loop && this.ctx) this.loop.source.playbackRate.setValueAtTime(2 ** (pitch / 256 / 12), this.ctx.currentTime);
  }

  /** The loop stops (m4aMPlayStop). */
  stopLoop() {
    if (!this.loop) return;
    stop(this.loop.source);
    if (this.playing.get(this.loop.player)?.source === this.loop.source) this.playing.delete(this.loop.player);
    this.loop = null;
  }

  /** Stops the sounds playing (a minigame's end: StopEffect). */
  stopAll() {
    this.stopLoop();
    for (const { source } of this.playing.values()) stop(source);
    this.playing.clear();
  }

  close() {
    this.stopAll();
    void this.ctx?.close();
  }
}
