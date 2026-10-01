// Bubble Pop: reach and hold. Move to a bubble and hold to pop it.
// Trains steady pointing and is the easiest game to start with. No timer, no misses.
import { rand, pick, sleep, confetti, esc } from '../ui.js';
import { BUBBLE_FACES } from './content.js';

export function start(ctx) {
  const { root, t, speak, sfx, store, input } = ctx;
  const level = ctx.level;
  const total = Math.max(6, ctx.settings().roundSize * 2);
  const together = level === 1 ? 1 : level === 2 ? 2 : 3;   // bubbles on screen at once
  const drift = level >= 2;                                   // bubbles float gently
  let popped = 0, stars = 0, alive = true;
  const times = [];
  const t0 = performance.now();
  let spawned = 0;

  root.innerHTML = `
    <div class="game bp">
      <div class="gbar">
        <button class="btn small" id="bp-menu" data-nosw>⬅ ${esc(t('menu'))}</button>
        <div class="chip" id="bp-stars">⭐ 0</div>
      </div>
      <div class="qcard"><div class="qtext" id="bp-q">${esc(t('popBubble'))}</div></div>
      <div class="arena" id="bp-arena"></div>
    </div>`;
  const $ = (id) => root.querySelector('#' + id);
  const arena = $('bp-arena');
  const bubbles = new Set();

  function size() {
    const base = 120 * ctx.settings().targetScale;
    return Math.min(base, arena.clientWidth / 2.4, arena.clientHeight / 1.8);
  }

  function spawn() {
    if (!alive || spawned >= total) return;
    spawned++;
    const s = size();
    const W = arena.clientWidth, H = arena.clientHeight;
    const b = document.createElement('button');
    b.className = 'bubble';
    b.style.width = b.style.height = s + 'px';
    b.style.left = rand(8, Math.max(9, Math.round(W - s - 8))) + 'px';
    b.style.top = rand(8, Math.max(9, Math.round(H - s - 8))) + 'px';
    b.style.fontSize = s * 0.45 + 'px';
    if (drift) {
      b.style.setProperty('--dur', (5 + Math.random() * 3).toFixed(1) + 's');
      b.style.setProperty('--amp', Math.round(s * 0.25) + 'px');
      b.classList.add('drift');
    }
    b.textContent = pick(BUBBLE_FACES);
    b.dataset.t = String(performance.now());
    arena.appendChild(b);
    bubbles.add(b);
    retarget();
  }

  function retarget() {
    input.setTargets([
      ...Array.from(bubbles).map(el => ({ el, onSelect: () => pop(el) })),
      { el: $('bp-menu'), onSelect: () => { alive = false; input.clear(); ctx.exit(); }, scanSkip: true, holdScale: 2 },
    ]);
  }

  async function pop(el) {
    if (!alive || !bubbles.has(el)) return;
    bubbles.delete(el);
    el.classList.add('pop');
    sfx.pop();
    times.push(performance.now() - Number(el.dataset.t));
    popped++; stars++;
    store.addStars(1);
    $('bp-stars').textContent = `⭐ ${stars}`;
    retarget();
    setTimeout(() => el.remove(), 260);
    if (popped >= total) return end();
    if (popped % 4 === 0) { speak(t('greatJob')); }
    await sleep(450);
    while (alive && bubbles.size < together && spawned < total) spawn();
  }

  async function end() {
    alive = false;
    input.clear();
    sfx.chime();
    speak(t('greatJob'));
    confetti(root);
    await sleep(1200);
    ctx.finish({
      game: 'bubbles', asked: total, correct: total, unaided: total, helped: 0,
      secs: (performance.now() - t0) / 1000,
      avgMs: times.reduce((a, b) => a + b, 0) / (times.length || 1), stars,
    });
  }

  speak(t('popBubble'));
  // wait one frame so the arena has a size
  requestAnimationFrame(() => { for (let i = 0; i < together; i++) spawn(); });

  return {
    needsHand: false,
    tick() { /* input layer handles hover, hold and scanning */ },
    stop() { alive = false; input.clear(); },
  };
}
