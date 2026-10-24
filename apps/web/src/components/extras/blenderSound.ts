// The Berry Blender's sounds (BlenderScreen's): Emerald's sound effects and the Pokéblock's fanfare, rendered from the
// pokeemerald decompilation by tools/extras/m4a_render.py (public/extras/blender/sounds/), played with the Web Audio API
// as the game's sound engine plays them: each on its music player (SE1 or SE2, song_table.inc), a new one replacing the
// one playing unless that one's priority is higher (midi.cfg's -P), and the blender's whirring looped, its pitch raised
// with the blender's speed (UpdateHitPitch).

export type BlenderSoundName =
  | 'se_ball_tray_exit'
  | 'se_fall'
  | 'se_truck_door'
  | 'se_ball_bounce_1'
  | 'se_pin'
  | 'se_berry_blender'
  | 'se_ice_stairs'
  | 'se_success'
  | 'se_failure'
  | 'se_select'
  | 'mus_level_up';

/** Each sound's music player and priority (song_table.inc, midi.cfg). The fanfare plays on its own (PlayFanfare). */
const PLAYERS: Record<BlenderSoundName, [player: 'se1' | 'se2' | 'fanfare', priority: number]> = {
  se_ball_tray_exit: ['se2', 5],
  se_fall: ['se1', 4],
  se_truck_door: ['se1', 4],
  se_ball_bounce_1: ['se1', 4],
  se_pin: ['se1', 4],
  se_berry_blender: ['se2', 4],
  se_ice_stairs: ['se1', 4],
  se_success: ['se1', 4],
  se_failure: ['se1', 4],
  se_select: ['se2', 5],
  mus_level_up: ['fanfare', 5],
};

/** The blender's volume (the slider under its screen), 0 to 100: remembered in this browser (a convenience; DEFAULT_VOLUME if it can't be read). */
const VOLUME_KEY = 'poke-tcg.blender-volume';
const DEFAULT_VOLUME = 70;
export function loadVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
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

/** The blender's sounds, loaded once a screen; `close` when it goes. Silent until loaded, and at volume 0. */
export class BlenderSound {
  private ctx: AudioContext | null;
  private out: GainNode | null;
  private buffers = new Map<BlenderSoundName, AudioBuffer>();
  private playing = new Map<string, { source: AudioBufferSourceNode; priority: number; ends: number }>();
  private loop: AudioBufferSourceNode | null = null;
  private pitch = 0;

  constructor(volume: number) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = Context ? new Context() : null;
    this.out = this.ctx ? this.ctx.createGain() : null;
    if (this.ctx && this.out) {
      this.out.connect(this.ctx.destination);
      this.out.gain.value = gainOf(volume);
      for (const name of Object.keys(PLAYERS) as BlenderSoundName[]) {
        fetch(`/extras/blender/sounds/${name}.wav`)
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

  /** PlaySE / PlayFanfare: on its player, unless a sound of higher priority is still playing there. */
  play(name: BlenderSoundName) {
    const buffer = this.buffers.get(name);
    if (!this.ctx || !this.out || !buffer) return;
    const [player, priority] = PLAYERS[name];
    const current = this.playing.get(player);
    if (current && current.ends > this.ctx.currentTime && current.priority > priority) return;
    if (current?.source === this.loop) this.stopLoop();
    else if (current) stop(current.source);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.out);
    source.start();
    this.playing.set(player, { source, priority, ends: this.ctx.currentTime + buffer.duration });
  }

  /** SE_BERRY_BLENDER, looped on SE2 until `stopLoop`. */
  startLoop() {
    const buffer = this.buffers.get('se_berry_blender');
    if (!this.ctx || !this.out || !buffer) return;
    this.stopLoop();
    const current = this.playing.get('se2');
    if (current) stop(current.source);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 2 ** (this.pitch / 256 / 12);
    source.connect(this.out);
    source.start();
    this.loop = source;
    this.playing.set('se2', { source, priority: PLAYERS.se_berry_blender[1], ends: Infinity });
  }

  /** m4aMPlayPitchControl: the loop's pitch in 256ths of a semitone (UpdateHitPitch: 2 × (speed − 128)). */
  setPitch(pitch: number) {
    this.pitch = pitch;
    if (this.loop && this.ctx) this.loop.playbackRate.setValueAtTime(2 ** (pitch / 256 / 12), this.ctx.currentTime);
  }

  /** m4aMPlayStop on SE2: the whirring stops. */
  stopLoop() {
    if (!this.loop) return;
    stop(this.loop);
    if (this.playing.get('se2')?.source === this.loop) this.playing.delete('se2');
    this.loop = null;
  }

  close() {
    this.stopLoop();
    void this.ctx?.close();
  }
}
