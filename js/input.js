// One input layer for every game.
// Games only say "these are my targets". This file decides how a child picks one:
//   touch   tap or click a target
//   hand    index fingertip moves a pointer, hold it on a target
//   head    nose moves a pointer, hold it on a target (optional: open mouth to choose)
//   switch  targets light up one by one, any key press or tap chooses (single switch scanning)
// Taps and clicks always work too, so a parent can help at any time.
import { OneEuro } from './oneeuro.js';
import { clamp } from './ui.js';
import { sfx } from './audio.js';

export class Input {
  constructor(vision) {
    this.vision = vision;
    this.settings = { input: 'touch', holdTime: 1.5, sensitivity: 1, camera: 'user', mouthSelect: false };
    this.mode = 'touch';
    this.targets = [];
    this.cursor = document.getElementById('cursor');
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.px = 0.5;
    this.py = 0.5;
    this.visible = false;
    this.lastSeen = 0;
    this.hover = null;
    this.hoverStart = 0;
    this.scanIdx = 0;
    this.scanT = 0;
    this.scanList = [];
    this.neutral = null;
    this.calib = null;
    this.mouthWas = false;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (this.mode !== 'switch' || !this.enabled) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.switchPress(); }
    });
    addEventListener('pointerdown', (e) => {
      if (this.mode !== 'switch' || !this.enabled) return;
      if (e.target.closest && e.target.closest('[data-nosw]')) return; // adult buttons
      this.switchPress();
    });
  }

  configure(settings) {
    this.settings = { ...this.settings, ...settings };
    this.mode = this.settings.input;
    this.fx.reset();
    this.fy.reset();
  }

  get usesCamera() { return this.mode === 'hand' || this.mode === 'head'; }

  // list: [{ el, onSelect(target), enabled?() }]
  setTargets(list) {
    this.clearTargets();
    this.targets = list.map((t) => {
      t.el.classList.add('target');
      if (!t.el.querySelector('.dw')) {
        const d = document.createElement('span');
        d.className = 'dw';
        d.setAttribute('aria-hidden', 'true');
        t.el.appendChild(d);
      }
      t._click = () => { if (this.mode !== 'switch' && this.enabled) this.fire(t); };
      t.el.addEventListener('click', t._click);
      return t;
    });
    this.scanIdx = 0;
    this.scanT = performance.now();
    this.setHover(null);
  }

  clearTargets() {
    for (const t of this.targets) {
      t.el.removeEventListener('click', t._click);
      t.el.classList.remove('hover', 'scan');
      t.el.style.removeProperty('--p');
    }
    this.targets = [];
    this.scanList = [];
    this.hover = null;
  }

  clear() {
    this.clearTargets();
    this.hideCursor();
  }

  active(t) {
    return t.el.isConnected && !t.el.disabled && !t.el.classList.contains('off') && (!t.enabled || t.enabled());
  }

  fire(t) {
    if (!this.active(t)) return;
    const now = performance.now();
    if (now < (t._lockUntil || 0)) return; // stops one hold from choosing the same target twice
    t._lockUntil = now + 500;
    this.setHover(null);
    this.scanT = now;
    t.onSelect(t);
  }

  switchPress() {
    const list = this.scanList;
    if (!list.length) return;
    this.fire(list[this.scanIdx % list.length]);
  }

  setHover(t) {
    if (this.hover && this.hover !== t) {
      this.hover.el.classList.remove('hover');
      this.hover.el.style.setProperty('--p', 0);
    }
    if (t) t.el.classList.add('hover');
    this.hover = t;
  }

  hideCursor() {
    this.visible = false;
    if (this.cursor) this.cursor.hidden = true;
  }

  // Look straight ahead for a moment. The head pointer uses this spot as its centre.
  calibrate(ms = 1800) {
    return new Promise((resolve) => {
      this.calib = { samples: [], until: performance.now() + ms, resolve };
    });
  }

  frame(now, det) {
    this.mode = this.settings.input;

    if (this.calib) {
      if (det.face && det.fresh) this.calib.samples.push({ x: det.face.nose.x, y: det.face.nose.y });
      if (now >= this.calib.until) {
        const s = this.calib.samples;
        if (s.length >= 5) {
          const med = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
          this.neutral = { x: med(s.map(p => p.x)), y: med(s.map(p => p.y)) };
        }
        const done = this.calib.resolve;
        this.calib = null;
        done(!!this.neutral);
      }
    }

    if (!this.enabled) { this.hideCursor(); this.setHover(null); return; }

    if (this.mode === 'hand' || this.mode === 'head') this.updatePointer(now, det);
    else this.hideCursor();

    if (this.mode === 'switch') this.scan(now);
    else if (this.visible) this.dwell(now, det);
    else this.setHover(null);
  }

  updatePointer(now, det) {
    const s = this.settings;
    const sens = clamp(s.sensitivity || 1, 0.4, 3);
    const mirror = s.camera === 'user';
    let nx = null, ny = null;

    if (this.mode === 'hand' && det.hand) {
      const tip = det.hand[8]; // index fingertip
      const x = mirror ? 1 - tip.x : tip.x;
      nx = 0.5 + (x - 0.5) * 1.6 * sens;
      ny = 0.5 + (tip.y - 0.5) * 1.6 * sens;
    } else if (this.mode === 'head' && det.face) {
      const n = det.face.nose;
      const nb = this.neutral || { x: 0.5, y: 0.5 };
      const dx = mirror ? (nb.x - n.x) : (n.x - nb.x);
      nx = 0.5 + dx * 5 * sens;
      ny = 0.5 + (n.y - nb.y) * 6 * sens;
    }

    if (nx !== null) {
      this.lastSeen = now;
      this.px = this.fx.filter(clamp(nx, 0, 1), now);
      this.py = this.fy.filter(clamp(ny, 0, 1), now);
    }
    this.visible = now - this.lastSeen < 600;
    if (this.cursor) {
      this.cursor.hidden = !this.visible;
      if (this.visible) {
        this.cursor.style.transform = `translate3d(${this.px * innerWidth}px, ${this.py * innerHeight}px, 0)`;
      }
    }
  }

  dwell(now, det) {
    const X = this.px * innerWidth, Y = this.py * innerHeight;
    let hit = null;
    for (const t of this.targets) {
      if (!this.active(t)) continue;
      const r = t.el.getBoundingClientRect();
      if (X >= r.left - 12 && X <= r.right + 12 && Y >= r.top - 12 && Y <= r.bottom + 12) { hit = t; break; }
    }
    if (hit !== this.hover) { this.setHover(hit); this.hoverStart = now; }
    if (!hit) return;

    // optional: open the mouth to choose right away
    const mouth = this.mode === 'head' && this.settings.mouthSelect && det.face && det.face.jawOpen > 0.55;
    if (mouth && !this.mouthWas) { this.mouthWas = true; this.fire(hit); return; }
    this.mouthWas = !!mouth;

    const p = clamp((now - this.hoverStart) / (this.settings.holdTime * 1000), 0, 1);
    hit.el.style.setProperty('--p', p);
    if (p >= 1) this.fire(hit);
  }

  scan(now) {
    const list = this.targets.filter(t => this.active(t));
    this.scanList = list;
    for (const t of this.targets) t.el.classList.remove('scan');
    if (!list.length) return;
    const step = clamp(this.settings.holdTime, 0.8, 4) * 1000;
    if (now - this.scanT >= step) {
      this.scanT = now;
      this.scanIdx = (this.scanIdx + 1) % list.length;
      sfx.tick();
    }
    list[this.scanIdx % list.length].el.classList.add('scan');
  }
}
