// Magic Touch: the first step. One big picture. Any touch, hold or press makes something fun happen.
// No question, no wrong answer. Good for learning that "I do something and the screen answers".
import { sleep, confetti, esc } from '../ui.js';
import { ANIMALS } from './content.js';

const BACKS = ['#FFF3C4', '#D9F1FF', '#E3F7D6', '#FFE0E8', '#EADFFF', '#FFE9CF'];
const SPARKS = ['⭐', '✨', '💛', '🌈', '🎈'];

export function start(ctx) {
  const { root, t, word, speak, sfx, store, input } = ctx;
  const names = Object.keys(ANIMALS);
  const total = Math.max(6, ctx.settings().roundSize * 2);
  let presses = 0, alive = true, busy = false;
  const t0 = performance.now();

  root.innerHTML = `
    <div class="game mg">
      <div class="gbar">
        <button class="btn small" id="mg-menu" data-nosw>⬅ ${esc(t('menu'))}</button>
        <div class="chip" id="mg-stars">⭐ 0</div>
      </div>
      <div class="qcard"><div class="qtext">${esc(t('touchMagic'))}</div></div>
      <div class="magicarena" id="mg-arena">
        <button class="magic" id="mg-btn" aria-label="${esc(t('touchMagic'))}">⭐</button>
      </div>
    </div>`;
  const $ = (id) => root.querySelector('#' + id);
  const arena = $('mg-arena'), btn = $('mg-btn');

  input.setTargets([
    { el: btn, onSelect: press, holdScale: 0.35 },   // quick reaction, so the child sees the link straight away
    { el: $('mg-menu'), onSelect: () => { alive = false; ctx.exit(); }, scanSkip: true, holdScale: 2 },
  ]);

  function burst() {
    const r = btn.getBoundingClientRect(), a = arena.getBoundingClientRect();
    const cx = r.left - a.left + r.width / 2, cy = r.top - a.top + r.height / 2;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      s.textContent = SPARKS[i % SPARKS.length];
      const ang = (i / 14) * Math.PI * 2, dist = r.width * (0.7 + Math.random() * 0.5);
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      arena.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  async function press() {
    if (!alive || busy) return;
    busy = true;
    presses++;
    store.addStars(1);
    $('mg-stars').textContent = `⭐ ${presses}`;
    sfx.note(presses);
    burst();
    btn.classList.remove('bounce'); void btn.offsetWidth; btn.classList.add('bounce');
    arena.style.background = BACKS[presses % BACKS.length];
    if (presses >= total) return end();
    // the picture changes to an animal and its name is said
    const name = names[(presses - 1) % names.length];
    btn.textContent = ANIMALS[name];
    speak(word('animals', name));
    await sleep(350);
    busy = false;
  }

  async function end() {
    alive = false;
    input.clear();
    sfx.chime();
    speak(t('greatJob'));
    confetti(root);
    await sleep(1200);
    ctx.finish({
      game: 'magic', asked: total, correct: total, unaided: total, helped: 0,
      secs: (performance.now() - t0) / 1000, avgMs: 0, stars: presses,
    });
  }

  requestAnimationFrame(() => requestAnimationFrame(() => { if (alive) speak(t('touchMagic')); }));

  return {
    needsHand: false,
    tick() { /* input layer handles hover, hold and scanning */ },
    stop() { alive = false; input.clear(); },
  };
}
