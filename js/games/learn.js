// Pick & Learn: the learning game. Pick the right picture. Works with any input.
// If a pick is wrong, that picture fades away so the choice gets easier (no failing).
import { rand, pick, shuffle, sleep, confetti, esc } from '../ui.js';
import { ITEMS, COLOURS, ANIMALS } from './content.js';

function numberOptions(answer, count) {
  const pool = shuffle([1, 2, 3, 4, 5].filter(n => n !== answer)).slice(0, count - 1);
  return shuffle([answer, ...pool]);
}

function makeQuestions(n, level) {
  const kinds = level === 1 ? ['count', 'colour'] : ['count', 'colour', 'animal'];
  const optN = level === 1 ? 2 : level === 2 ? 3 : 4;
  const qs = [];
  let last = '';
  for (let i = 0; i < n; i++) {
    let q, key, guard = 0;
    do {
      const kind = pick(kinds);
      if (kind === 'count') {
        const answer = rand(1, level === 1 ? 3 : 5);
        q = { kind, answer, item: pick(ITEMS), options: numberOptions(answer, optN).map(v => ({ v, ok: v === answer })) };
        key = 'c' + answer;
      } else if (kind === 'colour') {
        const keys = shuffle(Object.keys(COLOURS)).slice(0, optN);
        const answer = pick(keys);
        q = { kind, answer, options: keys.map(v => ({ v, ok: v === answer })) };
        key = 'k' + answer;
      } else {
        const keys = shuffle(Object.keys(ANIMALS)).slice(0, optN);
        const answer = pick(keys);
        q = { kind, answer, options: keys.map(v => ({ v, ok: v === answer })) };
        key = 'a' + answer;
      }
    } while (key === last && n > 1 && ++guard < 10);
    last = key;
    qs.push(q);
  }
  return qs;
}

export function start(ctx) {
  const { root, t, word, speak, sfx, store, input } = ctx;
  const level = ctx.level;
  const total = ctx.settings().roundSize;
  const saved = ctx.resume && ctx.resume.game === 'learn' ? ctx.resume : null;
  const qs = saved ? saved.qs : makeQuestions(total, level);
  let qi = saved ? saved.qi : 0;
  const results = saved ? saved.results : [];
  let stars = saved ? saved.stars : 0;
  const t0 = performance.now();
  let q = null, qStart = 0, wrongs = 0, locked = false, alive = true;

  root.innerHTML = `
    <div class="game pl">
      <div class="gbar">
        <button class="btn small" id="pl-menu" data-nosw>⬅ ${esc(t('menu'))}</button>
        <div class="chip" id="pl-stars">⭐ ${stars}</div>
      </div>
      <div class="qcard"><div class="qtext" id="pl-q"></div><div class="qvis" id="pl-vis"></div></div>
      <div class="tiles" id="pl-tiles"></div>
      <div class="gfoot">
        <button class="btn" id="pl-again" data-nosw>🔊 ${esc(t('again'))}</button>
        <button class="btn" id="pl-skip" data-nosw>➡ ${esc(t('skip'))}</button>
      </div>
    </div>`;
  const $ = (id) => root.querySelector('#' + id);
  const tilesEl = $('pl-tiles');
  tilesEl.style.setProperty('--ts', ctx.settings().targetScale);

  const prompt = () => {
    if (q.kind === 'count') return t('howManyThings', { item: word('items', q.item[0]) });
    if (q.kind === 'colour') return t('findColour', { colour: word('colours', q.answer) });
    return t('findAnimal', { animal: word('animals', q.answer) });
  };

  function tileHtml(o) {
    if (q.kind === 'count') return `<span class="tnum">${o.v}</span>`;
    if (q.kind === 'colour') return `<span class="swatch" style="background:${COLOURS[o.v]}"></span><span class="tlabel">${esc(word('colours', o.v))}</span>`;
    return `<span class="temoji">${ANIMALS[o.v]}</span>`;
  }

  function show() {
    q = qs[qi];
    locked = false; wrongs = 0;
    qStart = performance.now();
    $('pl-q').textContent = prompt();
    $('pl-vis').textContent = q.kind === 'count' ? q.item[1].repeat(q.answer) : '';
    tilesEl.innerHTML = q.options.map((o, i) => `<button class="tile" data-i="${i}" aria-label="${esc(String(o.v))}">${tileHtml(o)}</button>`).join('');
    const btns = Array.from(tilesEl.children);
    input.setTargets([...btns.map((el, i) => ({ el, onSelect: () => choose(i, el) })), ...navTargets()]);
    speak(prompt());
    ctx.save({ game: 'learn', qs, qi, results, stars });
  }

  async function choose(i, el) {
    if (locked || !alive) return;
    const o = q.options[i];
    if (o.ok) {
      locked = true;
      el.classList.add('right');
      results.push({ ok: true, helped: wrongs > 0, ms: performance.now() - qStart });
      stars++;
      store.addStars(1);
      $('pl-stars').textContent = `⭐ ${stars}`;
      sfx.chime();
      speak(t('greatJob'));
      confetti(root);
      await sleep(1700);
      next();
    } else {
      wrongs++;
      el.classList.add('off'); // fades away, the choice gets easier
      sfx.soft();
      speak(t('tryAgain'));
      const left = Array.from(tilesEl.children).filter(b => !b.classList.contains('off'));
      if (left.length === 1) left[0].classList.add('hint');
    }
  }

  async function next() {
    if (!alive) return;
    qi++;
    if (qi >= qs.length) return end();
    const go = await ctx.breakCheck();
    if (!alive) return;
    if (go === 'stop') return end();
    show();
  }

  function end() {
    if (!alive) return;
    alive = false;
    input.clear();
    const done = results.length || 1;
    ctx.finish({
      game: 'learn', asked: results.length,
      correct: results.filter(r => r.ok).length,
      unaided: results.filter(r => r.ok && !r.helped).length,
      helped: results.filter(r => r.helped).length,
      secs: (performance.now() - t0) / 1000,
      avgMs: results.reduce((a, r) => a + (r.ms || 0), 0) / done, stars,
    });
  }

  // Back, hear again and skip can be reached by the pointer too. Back needs a longer hold so it is not chosen by accident.
  // They are left out of single switch scanning so scanning stays short. A tap always works.
  function navTargets() {
    return [
      { el: $('pl-again'), onSelect: () => speak(prompt()), scanSkip: true },
      { el: $('pl-skip'), onSelect: skip, scanSkip: true, holdScale: 1.5 },
      { el: $('pl-menu'), onSelect: () => { alive = false; ctx.exit(); }, scanSkip: true, holdScale: 2 },
    ];
  }
  function skip() {
    if (locked) return;
    locked = true;
    results.push({ ok: false, helped: true, skipped: true, ms: performance.now() - qStart });
    next();
  }

  show();

  return {
    needsHand: false,
    tick() { /* input layer handles hover, hold and scanning */ },
    stop() { alive = false; input.clear(); },
  };
}
