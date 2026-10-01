// One Euro filter: removes tremor and jitter when the pointer is slow,
// but keeps up when the child moves quickly.

class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y; }
  reset() { this.y = null; }
}

const alpha = (rate, cutoff) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau * rate);
};

export class OneEuro {
  constructor(minCutoff = 0.8, beta = 4, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastX = null;
    this.lastT = null;
  }
  filter(value, tMs) {
    const dt = this.lastT === null ? 33 : Math.max(1, tMs - this.lastT);
    const rate = 1000 / dt;
    this.lastT = tMs;
    const raw = this.lastX === null ? 0 : (value - this.lastX) * rate;
    this.lastX = value;
    const edx = this.dx.filter(raw, alpha(rate, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(rate, cutoff));
  }
  reset() { this.x.reset(); this.dx.reset(); this.lastX = null; this.lastT = null; }
}
