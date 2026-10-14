// Deterministic, serializable PRNG (mulberry32). The state lives in GameState
// so replaying the same actions from the same seed reproduces the same game.
export function nextRandom(state: number): [value: number, nextState: number] {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, nextState];
}

export function shuffle<T>(items: T[], rngState: number): [T[], number] {
  const out = [...items];
  let state = rngState;
  for (let i = out.length - 1; i > 0; i--) {
    let r: number;
    [r, state] = nextRandom(state);
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return [out, state];
}
