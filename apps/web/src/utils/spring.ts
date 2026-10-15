// Spring physics for the holo card effect, matching svelte/motion's `spring` so the
// ported card styles feel the same. Values are objects of numbers, e.g. { x, y }.

type Values = Record<string, number>;

export interface SpringOptions {
  stiffness: number;
  damping: number;
  precision?: number;
}

export class Spring<T extends Values> {
  value: T;
  stiffness: number;
  damping: number;
  private precision: number;
  private target: T;
  private last: T;
  private lastTime = 0;
  private invMass = 1;
  private invMassRecoveryRate = 0;
  private moving = false;

  constructor(value: T, { stiffness, damping, precision = 0.01 }: SpringOptions) {
    this.value = value;
    this.target = value;
    this.last = value;
    this.stiffness = stiffness;
    this.damping = damping;
    this.precision = precision;
  }

  /**
   * Moves toward `target`. `hard` jumps there immediately; `soft` starts with infinite mass and
   * recovers over `soft` seconds (0.5 for `true`), easing in instead of snapping.
   */
  set(target: T, opts: { hard?: boolean; soft?: boolean | number } = {}) {
    this.target = target;
    if (opts.hard) {
      this.value = this.last = target;
      this.moving = false;
      return;
    }
    if (opts.soft) {
      const rate = opts.soft === true ? 0.5 : opts.soft;
      this.invMassRecoveryRate = 1 / (rate * 60);
      this.invMass = 0;
    }
    if (!this.moving) {
      this.moving = true;
      this.lastTime = performance.now();
    }
  }

  /** Advances one animation frame. Returns whether the spring is still moving. */
  tick(now: number): boolean {
    if (!this.moving) return false;
    this.invMass = Math.min(this.invMass + this.invMassRecoveryRate, 1);
    const dt = ((now - this.lastTime) * 60) / 1000;
    let settled = true;
    const next = {} as Values;
    for (const key of Object.keys(this.target)) {
      const current = this.value[key]!;
      const target = this.target[key]!;
      const delta = target - current;
      const velocity = (current - this.last[key]!) / (dt || 1 / 60);
      const acceleration = (this.stiffness * delta - this.damping * velocity) * this.invMass;
      const d = (velocity + acceleration) * dt;
      if (Math.abs(d) < this.precision && Math.abs(delta) < this.precision) {
        next[key] = target;
      } else {
        settled = false;
        next[key] = current + d;
      }
    }
    this.lastTime = now;
    this.last = this.value;
    this.value = next as T;
    this.moving = !settled;
    return this.moving;
  }
}
