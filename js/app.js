// App shell: screens, game launching, saved progress, rest breaks.
import * as store from './store.js';
import { t, setLang, word } from './i18n.js';
import * as audio from './audio.js';
import { Vision } from './vision.js';
import { Input } from './input.js';
import * as fq from './games/fingerquest.js';
import * as learn from './games/learn.js';
import * as bubbles from './games/bubbles.js';
import { openParent } from './parent.js';
import { esc, sleep, toast, keepAwake, confetti } from './ui.js';

const root = document.getElementById('app');
const vision = new Vision();
const input = new Input(vision);

const GAMES = {
  bubbles: { mod: bubbles, icon: '🫧', name: 'bubblePop', sub: 'bubblePopSub', needsCamera: false, tone: 'c3' },
  learn: { mod: learn, icon: '🧩', name: 'pickLearn', sub: 'pickLearnSub', needsCamera: false, tone: 'c2' },
  finger: { mod: fq, icon: '🖐️', name: 'fingerQuest', sub: 'fingerQuestSub', needsCamera: true, tone: 'c1' },
};
const AVATARS = ['🐠', '🦋', '🐢', '🐘', '🦁', '🐬', '🐞', '🦉'];

let current = null;          // { id, ctrl }
let forceTouch = false;      // set when the camera fails, for this visit only
let sinceBreak = performance.now();
let deferredInstall = null;

// ---------- settings ----------
function applySettings() {
  const s = store.settings();
  setLang(s.lang);
  audio.configure({ sound: s.sound, voice: s.voice });
  input.configure(forceTouch ? { ...s, input: 'touch' } : s);
  document.documentElement.style.setProperty('--scale', s.targetScale);
}

const app = {
  root, store, vision, input,
  applySettings,
  home: () => home(),
  startGame: (id, resume) => startGame(id, resume),
  canInstall: () => !!deferredInstall,
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; },
  resetTouch: () => { forceTouch = false; applySettings(); },
};

// ---------- small screens ----------
function loading(on, text = '') {
  let el = document.getElementById('loading');
  if (!on) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading';
    el.innerHTML = '<div class="spinner"></div><p id="loading-text"></p>';
    document.body.appendChild(el);
  }
  el.querySelector('#loading-text').textContent = text;
}

function targetsFor(list) {
  input.enabled = true;
  input.setTargets(list);
}

function welcome(firstTime = true) {
  stopGame();
  input.clear();
  let avatar = AVATARS[0];
  root.innerHTML = `
    <div class="screen welcome">
      <h1>${firstTime ? 'Welcome!' : 'Add a child'}</h1>
      <p class="lead">Let's make a profile. Progress is saved on this device.</p>
      <label class="field">Name
        <input id="w-name" type="text" maxlength="20" autocomplete="off" placeholder="Child's name">
      </label>
      <div class="field">Pick a friend
        <div class="avatars" id="w-av">${AVATARS.map((a, i) => `<button class="avatar${i === 0 ? ' sel' : ''}" data-a="${a}" aria-label="${a}">${a}</button>`).join('')}</div>
      </div>
      <button class="btn big primary" id="w-go">Start</button>
      ${firstTime ? '<label class="btn small ghost" for="w-file">I have a backup file</label><input id="w-file" type="file" accept="application/json,.json" hidden>' : '<button class="btn small ghost" id="w-cancel">Cancel</button>'}
    </div>`;
  root.querySelectorAll('#w-av .avatar').forEach(b => b.onclick = () => {
    avatar = b.dataset.a;
    root.querySelectorAll('#w-av .avatar').forEach(x => x.classList.toggle('sel', x === b));
  });
  root.querySelector('#w-go').onclick = () => {
    audio.unlock();
    const name = root.querySelector('#w-name').value.trim() || 'Friend';
    store.createProfile({ name, avatar });
    forceTouch = false;
    applySettings();
    home();
  };
  const cancel = root.querySelector('#w-cancel');
  if (cancel) cancel.onclick = () => home();
  const file = root.querySelector('#w-file');
  if (file) file.onchange = async () => {
    try {
      store.importData(await file.files[0].text());
      applySettings();
      home();
    } catch (e) { toast(e.message || 'Could not read that file.'); }
  };
}

function whoPlays() {
  stopGame();
  applySettings();
  const list = store.profiles();
  root.innerHTML = `
    <div class="screen who">
      <h1>${esc(t('whoPlays'))}</h1>
      <div class="who-grid" id="who-grid">
        ${list.map(p => `<button class="who-card" data-id="${p.id}"><span class="av">${p.avatar}</span><span>${esc(p.name)}</span></button>`).join('')}
        <button class="who-card add" id="who-add" data-nosw><span class="av">➕</span><span>Add a child</span></button>
      </div>
      <button class="btn small ghost" id="who-back" data-nosw>⬅ ${esc(t('home'))}</button>
    </div>`;
  root.querySelectorAll('.who-card[data-id]').forEach(b => b.onclick = () => {
    store.setActive(b.dataset.id);
    forceTouch = false;
    applySettings();
    home();
  });
  root.querySelector('#who-add').onclick = () => welcome(false);
  root.querySelector('#who-back').onclick = () => home();
}

async function home() {
  stopGame();
  const p = store.activeProfile();
  if (!p) return welcome(true);
  applySettings();
  const s = store.settings();
  const resume = store.getResume();
  const tiles = Object.entries(GAMES).map(([id, g]) => `
    <button class="gcard ${g.tone}" data-g="${id}">
      <span class="gicon">${g.icon}</span>
      <span class="gname">${esc(t(g.name))}</span>
      <span class="gsub">${esc(t(g.sub))}</span>
    </button>`).join('');
  const stickers = p.stats.stickers.slice(-12);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches;
  root.innerHTML = `
    <div class="screen home">
      <div class="home-top">
        <button class="who-btn" id="h-who" data-nosw aria-label="Change child">${p.avatar} <span>${esc(p.name)}</span></button>
        <div class="chip" aria-label="${esc(t('stars'))}">⭐ ${p.stats.stars}</div>
        <button class="btn small ghost" id="h-grown" data-nosw>🔒 ${esc(t('grownUps'))}</button>
      </div>
      <h1>${esc(t('hello', { name: p.name }))}</h1>
      ${resume ? `<button class="btn big resume" id="h-resume">▶ ${esc(t('continue'))}</button>` : ''}
      <div class="game-grid" id="h-games">${tiles}</div>
      ${stickers.length ? `<div class="stickers"><h2>${esc(t('myStickers'))}</h2><div class="srow">${stickers.map(x => `<span>${x}</span>`).join('')}</div></div>` : ''}
      ${store.hasPin() ? '' : '<p class="hint-small">Grown ups: open "For grown ups" to set a PIN and choose how your child plays.</p>'}
      ${deferredInstall ? '<button class="btn small ghost" id="h-install" data-nosw>📲 Install this app</button>' : ''}
      ${ios && !deferredInstall ? '<p class="hint-small">To install: tap Share, then "Add to Home Screen".</p>' : ''}
    </div>`;

  const list = Array.from(root.querySelectorAll('.gcard')).map(el => ({ el, onSelect: () => startGame(el.dataset.g) }));
  const r = root.querySelector('#h-resume');
  if (r) list.unshift({ el: r, onSelect: () => startGame(resume.game, resume) });
  targetsFor(list);

  root.querySelector('#h-who').onclick = whoPlays;
  root.querySelector('#h-grown').onclick = () => { input.clear(); openParent(app); };
  const inst = root.querySelector('#h-install');
  if (inst) inst.onclick = async () => { await app.install(); home(); };

  // pointer inputs need the camera on the home screen too
  if (input.usesCamera) {
    try {
      await prepareCamera(s.input === 'hand' ? 'hand' : 'face', false);
    } catch (e) {
      forceTouch = true;
      applySettings();
      toast('The camera did not start, so touch is on for now.', 4000);
    }
  } else if (!current) {
    vision.stopCamera();
  }
}

// ---------- camera ----------
async function prepareCamera(kind, needHandAlso) {
  const s = store.settings();
  loading(true, 'Getting ready…');
  try {
    await vision.startCamera(s.camera);
    await vision.load(kind);
    if (needHandAlso && kind !== 'hand') await vision.load('hand');
  } finally {
    loading(false);
  }
}

function cameraProblem(id, err) {
  console.warn(err);
  const name = (err && err.name) || '';
  const camera = name === 'NotAllowedError' || name === 'NotFoundError' || name === 'NotReadableError' || (err && err.message === 'no-camera-api');
  const title = camera ? t('noCameraTitle') : 'The hand tracker could not start';
  const body = camera ? t('noCameraBody')
    : 'Grown ups: connect to the internet once, then try again. After that it works without internet.';
  root.innerHTML = `
    <div class="screen problem">
      <div class="big-emoji">📷</div>
      <h1>${esc(title)}</h1>
      <p class="lead">${esc(body)}</p>
      <div class="row">
        <button class="btn big primary" id="p-retry" data-nosw>${esc(t('retry'))}</button>
        <button class="btn big" id="p-touch" data-nosw>${esc(t('useTouch'))}</button>
        <button class="btn small ghost" id="p-home" data-nosw>⬅ ${esc(t('home'))}</button>
      </div>
      <p class="hint-small">Details: ${esc(name || String((err && err.message) || err || ''))}</p>
    </div>`;
  input.clear();
  root.querySelector('#p-retry').onclick = () => startGame(id);
  root.querySelector('#p-touch').onclick = () => { forceTouch = true; applySettings(); startGame(id === 'finger' ? 'learn' : id); };
  root.querySelector('#p-home').onclick = () => home();
}

// ---------- games ----------
async function startGame(id, resume = null) {
  stopGame();
  const g = GAMES[id];
  audio.unlock();
  applySettings();
  const s = store.settings();
  const mode = forceTouch ? 'touch' : s.input;

  try {
    if (g.needsCamera || mode === 'hand' || mode === 'head') {
      const kind = mode === 'head' ? 'face' : 'hand';
      await prepareCamera(g.needsCamera ? 'hand' : kind, mode === 'head' && g.needsCamera);
      if (mode === 'head' && !g.needsCamera) {
        root.innerHTML = `<div class="screen calib"><div class="big-emoji">🙂</div><h1>${esc(t('lookStraight'))}</h1></div>`;
        audio.speak(t('lookStraight'));
        await input.calibrate(1800);
      }
    }
  } catch (e) {
    loading(false);
    return cameraProblem(id, e);
  }

  root.innerHTML = '<div id="game-root"></div>';
  const gameRoot = root.querySelector('#game-root');
  sinceBreak = performance.now();
  keepAwake(true);
  input.enabled = id !== 'finger'; // Finger Quest uses gestures only
  input.clear();

  const ctx = {
    root: gameRoot, settings: () => store.settings(), t, word,
    speak: audio.speak, sfx: audio.sfx, store, input, vision,
    level: store.level(id), resume,
    save: (r) => store.setResume(r),
    breakCheck,
    finish: (res) => finishRound(id, res),
    exit: () => { stopGame(); home(); },
  };
  const ctrl = g.mod.start(ctx);
  current = { id, ctrl };

  // small camera picture so the child (and a helper) can see the tracking
  if (id !== 'finger' && input.usesCamera && s.showCamera && vision.video) {
    const pip = document.createElement('div');
    pip.className = 'pip';
    pip.appendChild(vision.video);
    gameRoot.appendChild(pip);
  }
}

function stopGame() {
  if (current) {
    try { current.ctrl.stop(); } catch (e) { /* ignore */ }
    current = null;
  }
  input.clear();
  input.enabled = true;
  audio.stopSpeaking();
  keepAwake(false);
  if (input.usesCamera) vision.park();
  else vision.stopCamera();
}

// Offer a rest every few minutes. Resolves 'go' or 'stop'.
function breakCheck() {
  const s = store.settings();
  if (!s.breakMins || (performance.now() - sinceBreak) / 60000 < s.breakMins) return Promise.resolve('go');
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'rest';
    box.innerHTML = `
      <div class="big-emoji">🌈</div>
      <h1>${esc(t('restTime'))}</h1>
      <p class="lead">${esc(t('restSub'))}</p>
      <div class="row">
        <button class="btn big primary" id="r-go">${esc(t('keepPlaying'))}</button>
        <button class="btn big" id="r-stop">${esc(t('imDone'))}</button>
      </div>`;
    document.body.appendChild(box);
    audio.speak(t('restSub'));
    const wasEnabled = input.enabled;
    input.enabled = true;
    const done = (v) => {
      input.clear();
      input.enabled = wasEnabled;
      box.remove();
      sinceBreak = performance.now();
      resolve(v);
    };
    input.setTargets([
      { el: box.querySelector('#r-go'), onSelect: () => done('go') },
      { el: box.querySelector('#r-stop'), onSelect: () => done('stop') },
    ]);
  });
}

function finishRound(id, res) {
  stopGame();
  const sticker = store.logSession(res);
  let ratio = res.asked ? res.unaided / res.asked : 0;
  if (id === 'bubbles') ratio = res.avgMs && res.avgMs < 7000 ? 1 : 0.6;
  let lv = store.level(id);
  if (ratio >= 0.8) lv++; else if (ratio < 0.4) lv--;
  store.setLevel(id, lv);
  store.clearResume();
  celebrate(id, res, sticker);
}

function celebrate(id, res, sticker) {
  const p = store.activeProfile();
  root.innerHTML = `
    <div class="screen done">
      <div class="big-emoji">🏆</div>
      <h1>${esc(t('roundDone'))}</h1>
      <div class="chip big">⭐ ${res.stars}</div>
      ${sticker ? `<div class="sticker-new">${sticker}</div>` : ''}
      <div class="row">
        <button class="btn big primary" id="d-again">${esc(t('playAgain'))}</button>
        <button class="btn big" id="d-home">${esc(t('home'))}</button>
      </div>
    </div>`;
  audio.sfx.chime();
  audio.speak(t('roundDone'));
  confetti(root, 36);
  targetsFor([
    { el: root.querySelector('#d-again'), onSelect: () => startGame(id) },
    { el: root.querySelector('#d-home'), onSelect: () => home() },
  ]);
  // keep the camera running if a camera input is in use
  if (input.usesCamera && !vision.hasCamera) prepareCamera('hand', false).catch(() => {});
  void p;
}

// ---------- main loop ----------
function loop(now) {
  requestAnimationFrame(loop);
  const wantHand = input.mode === 'hand' || !!(current && current.ctrl.needsHand);
  const wantFace = input.mode === 'head';
  const det = vision.hasCamera && (wantHand || wantFace)
    ? vision.detect(wantHand, wantFace)
    : { hand: null, face: null, fresh: false };
  input.frame(now, det);
  if (current) current.ctrl.tick(now, det);
}

// ---------- start ----------
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { deferredInstall = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopSpeaking(); });

store.init();
applySettings();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* works without it, just not offline */ });
}
if (!store.isPersistent()) toast('This browser cannot save progress. Progress will be lost when you close it.', 6000);
requestAnimationFrame(loop);
home();
window.__app = app; // handy for testing
