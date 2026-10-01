// Finger Quest: the practice game. The child shows a number of fingers and holds it steady.
// Practice for hand control, so it needs the camera. No timer, no points taken away.
import { countFingers, ModeSmoother } from '../fingers.js';
import { rand, pick, clamp, sleep, confetti, esc } from '../ui.js';
import { ITEMS } from './content.js';

const LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

function makeQuestions(n, level) {
  const qs = [];
  let last = '';
  for (let i = 0; i < n; i++) {
    let q, key;
    let guard = 0;
    do {
      const kind = level === 1 ? 'show' : level === 2 ? pick(['show', 'count']) : pick(['count', 'add', 'show']);
      const max = level === 1 ? 3 : 5;
      if (kind === 'show') q = { kind, answer: rand(1, max) };
      else if (kind === 'count') q = { kind, answer: rand(1, max), item: pick(ITEMS) };
      else { const a = rand(1, 4), b = rand(1, 5 - a); q = { kind: 'add', a, b, answer: a + b }; }
      key = q.kind + q.answer;
    } while (key === last && n > 1 && ++guard < 10);
    last = key;
    qs.push(q);
  }
  return qs;
}

export function start(ctx) {
  const { root, t, word, speak, sfx, store, vision } = ctx;
  const holdMs = () => ctx.settings().holdTime * 1000;

  const level = ctx.level;
  const total = ctx.settings().roundSize;
  const saved = ctx.resume && ctx.resume.game === 'finger' ? ctx.resume : null;
  const qs = saved ? saved.qs : makeQuestions(total, level);
  let qi = saved ? saved.qi : 0;
  const results = saved ? saved.results : [];
  let stars = saved ? saved.stars : 0;

  const t0 = performance.now();
  const smoother = new ModeSmoother(450);
  let q = null, qStart = 0, holdStart = null, locked = false, hinted = false, lastHand = 0, msgNow = '';
  let alive = true;

  root.innerHTML = `
    <div class="game fq">
      <div class="gbar">
        <button class="btn small" id="fq-menu" data-nosw>⬅ ${esc(t('menu'))}</button>
        <div class="chip" id="fq-stars">⭐ ${stars}</div>
      </div>
      <div class="qcard"><div class="qtext" id="fq-q"></div><div class="qvis" id="fq-vis"></div></div>
      <div class="camwrap" id="fq-cam">
        <canvas id="fq-canvas"></canvas>
        <div class="holdring" id="fq-ring"><span id="fq-count">–</span></div>
        <div class="camhint" id="fq-hint" hidden></div>
        <div class="camnote" id="fq-note"></div>
      </div>
      <div class="msg" id="fq-msg" aria-live="polite"></div>
      <div class="gfoot">
        <button class="btn" id="fq-again" data-nosw>🔊 ${esc(t('again'))}</button>
        <button class="btn" id="fq-help" data-nosw>💡 ${esc(t('help'))}</button>
        <button class="btn" id="fq-skip" data-nosw>➡ ${esc(t('skip'))}</button>
      </div>
    </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const cam = $('fq-cam'), canvas = $('fq-canvas'), ring = $('fq-ring'), countEl = $('fq-count');
  const hintEl = $('fq-hint'), msgEl = $('fq-msg'), noteEl = $('fq-note');
  const g = canvas.getContext('2d');

  if (vision.video) {
    cam.prepend(vision.video);
    vision.video.classList.add('camvideo');
  }
  if (vision.mocked) noteEl.textContent = 'Demo camera';
  canvas.classList.toggle('mirror', ctx.settings().camera === 'user');

  function qText() {
    if (q.kind === 'show') return q.answer === 1 ? t('showFinger') : t('showFingers', { n: q.answer });
    if (q.kind === 'count') return t('howManyThings', { item: word('items', q.item[0]) });
    return t('addQ', { a: q.a, b: q.b });
  }
  function qVisual() {
    if (q.kind === 'show') return '●'.repeat(q.answer);
    if (q.kind === 'count') return q.item[1].repeat(q.answer);
    return `${'●'.repeat(q.a)}  ➕  ${'●'.repeat(q.b)}`;
  }

  function setMsg(m) { if (m !== msgNow) { msgNow = m; msgEl.textContent = m; } }

  function showQuestion() {
    q = qs[qi];
    locked = false; hinted = false; holdStart = null;
    smoother.clear();
    qStart = performance.now();
    ring.classList.remove('done');
    ring.style.setProperty('--p', 0);
    hintEl.hidden = true;
    $('fq-q').textContent = qText();
    $('fq-vis').textContent = qVisual();
    setMsg('');
    const said = qText();
    requestAnimationFrame(() => requestAnimationFrame(() => { if (alive && q === qs[qi]) speak(said); }));
    ctx.save({ game: 'finger', qs, qi, results, stars });
  }

  function showHint() {
    hinted = true;
    hintEl.hidden = false;
    hintEl.innerHTML = `<span class="big">${q.answer}</span><span class="dots">${'●'.repeat(q.answer)}</span>`;
  }

  async function next() {
    if (!alive) return;
    qi++;
    if (qi >= qs.length) return end();
    const go = await ctx.breakCheck();
    if (!alive) return;
    if (go === 'stop') return end();
    showQuestion();
  }

  function end() {
    if (!alive) return;
    alive = false;
    const done = results.length || 1;
    const solved = results.filter(r => r.ok).length;
    const unaided = results.filter(r => r.ok && !r.helped).length;
    ctx.finish({
      game: 'finger', asked: results.length, correct: solved, unaided,
      helped: results.filter(r => r.helped).length,
      secs: (performance.now() - t0) / 1000,
      avgMs: results.reduce((a, r) => a + (r.ms || 0), 0) / done, stars,
    });
  }

  async function success(now) {
    locked = true;
    results.push({ ok: true, helped: hinted, ms: now - qStart });
    stars++;
    store.addStars(1);
    $('fq-stars').textContent = `⭐ ${stars}`;
    ring.classList.add('done');
    setMsg(t('greatJob'));
    sfx.chime();
    speak(t('greatJob'));
    confetti(root);
    await sleep(1900);
    next();
  }

  $('fq-menu').onclick = () => { alive = false; ctx.exit(); };
  $('fq-again').onclick = () => speak(qText());
  $('fq-help').onclick = () => { showHint(); speak(qText()); };
  $('fq-skip').onclick = () => {
    if (locked) return;
    locked = true;
    results.push({ ok: false, helped: true, skipped: true, ms: performance.now() - qStart });
    next();
  };

  showQuestion();

  function draw(hand) {
    const w = cam.clientWidth, h = cam.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    g.clearRect(0, 0, w, h);
    if (!hand) return;
    g.lineCap = 'round';
    g.lineWidth = Math.max(5, w / 70);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    for (const [a, b] of LINKS) {
      g.moveTo(hand[a].x * w, hand[a].y * h);
      g.lineTo(hand[b].x * w, hand[b].y * h);
    }
    g.stroke();
    g.fillStyle = '#FFB300';
    for (const i of [4, 8, 12, 16, 20]) {
      g.beginPath();
      g.arc(hand[i].x * w, hand[i].y * h, Math.max(7, w / 45), 0, Math.PI * 2);
      g.fill();
    }
  }

  return {
    needsHand: true,
    tick(now, det) {
      if (!alive) return;
      const hand = det.hand;
      draw(hand);
      if (hand) lastHand = now;
      smoother.push(now, hand ? countFingers(hand, vision.aspect) : -2);
      const stable = smoother.mode();
      countEl.textContent = stable >= 0 ? stable : '–';
      if (locked || !q) return;

      if (stable === q.answer) {
        if (holdStart === null) holdStart = now;
        const p = clamp((now - holdStart) / holdMs(), 0, 1);
        ring.style.setProperty('--p', p);
        setMsg(t('keepHolding'));
        if (p >= 1) success(now);
      } else {
        holdStart = null;
        ring.style.setProperty('--p', 0);
        if (stable >= 0) setMsg(t('tryAgain'));
        else if (now - lastHand > 1800 && now - qStart > 1800) setMsg(t('holdUpHand'));
        else setMsg('');
      }
      if (!hinted && now - qStart > 20000) showHint(); // quiet help after 20 seconds
    },
    stop() { alive = false; if (vision.video && vision.video.parentNode === cam) { vision.video.remove(); } },
  };
}
