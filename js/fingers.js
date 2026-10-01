// Finger counting from the 21 MediaPipe hand landmarks.
// Uses distances only, so it works at any hand angle and with either hand.
// A finger counts as open when its tip is farther from the wrist than its middle joint,
// so a partly opened finger still counts.

export const EXTEND = 1.0; // above 1 is stricter, below 1 is more lenient

export function countFingers(lm, aspect = 1, extend = EXTEND) {
  const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y);
  let n = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
    if (d(0, tip) > d(0, pip) * extend) n++;
  }
  // thumb: tip farther from the base of the little finger than the thumb joint is
  if (d(4, 17) > d(3, 17) * extend && d(4, 5) > d(3, 5) * 0.9) n++;
  return n;
}

// Keeps a short history so one noisy frame cannot decide the answer.
export class ModeSmoother {
  constructor(windowMs = 450) { this.w = windowMs; this.s = []; }
  push(t, v) {
    this.s.push([t, v]);
    while (this.s.length && t - this.s[0][0] > this.w) this.s.shift();
  }
  mode() {
    if (this.s.length < 3) return -2; // not enough data yet
    const c = new Map();
    for (const [, v] of this.s) c.set(v, (c.get(v) || 0) + 1);
    let best = -2, bc = 0;
    for (const [v, n] of c) if (n > bc) { best = v; bc = n; }
    return best;
  }
  clear() { this.s = []; }
}

// A made-up hand with n fingers up (used by tests and by ?mock=N demo mode).
const OPEN = [
  [.5, .9], [.4, .8], [.33, .7], [.28, .6], [.24, .52],
  [.42, .6], [.40, .48], [.39, .40], [.38, .32],
  [.5, .58], [.5, .45], [.5, .37], [.5, .28],
  [.58, .6], [.6, .48], [.61, .4], [.62, .32],
  [.65, .64], [.69, .54], [.71, .47], [.73, .4],
];
const FINGERS = { 8: [5, 6, 7], 12: [9, 10, 11], 16: [13, 14, 15], 20: [17, 18, 19] };

export function syntheticHand(n) {
  const h = OPEN.map(([x, y]) => ({ x, y, z: 0 }));
  const up = [8, 12, 16, 20].slice(0, Math.min(4, n));
  for (const tip of [8, 12, 16, 20]) {
    if (up.includes(tip)) continue;
    const [m, p, dd] = FINGERS[tip];
    const mx = h[m].x, my = h[m].y;
    h[p] = { x: mx, y: my - 0.06, z: 0 };
    h[dd] = { x: mx + 0.01, y: my, z: 0 };
    h[tip] = { x: mx + 0.01, y: my + 0.08, z: 0 };
  }
  if (n < 5) { // thumb tucked across the palm
    h[4] = { x: .47, y: .66, z: 0 };
    h[3] = { x: .40, y: .74, z: 0 };
  }
  return h;
}
