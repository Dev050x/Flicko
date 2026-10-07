/*
 * One Euro filter (Casiez et al.): smooths hard when the signal is slow (no jitter) and
 * barely at all when it moves fast (no lag). One per channel, fed at detection time.
 */
const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1,
  ) {}

  reset() {
    this.x = null;
  }

  /** `t` in seconds */
  filter(value: number, t: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = t;
      this.dx = 0;
      return value;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const rate = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (rate - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
