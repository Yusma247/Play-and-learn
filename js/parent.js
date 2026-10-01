// The grown-up area: PIN, settings, progress and backup. English only.
import { esc, toast } from './ui.js';
import { today } from './store.js';

const INPUTS = [
  ['touch', '👆 Touch', 'Tap the screen or click. The simplest option.'],
  ['hand', '🖐️ Hand pointer', 'The index fingertip moves a pointer. Hold it on a picture to choose.'],
  ['head', '🙂 Head pointer', 'The nose moves a pointer. Hold on a picture to choose. Can also choose by opening the mouth.'],
  ['switch', '🔘 Single switch', 'Pictures light up one by one. Press Space, Enter or tap anywhere to choose. Works with USB and Bluetooth switches.'],
];

const GAME_NAMES = { finger: 'Finger Quest', learn: 'Pick & Learn', bubbles: 'Bubble Pop' };

export function openParent(app) {
  const { store, root } = app;
  if (!store.hasPin()) return pinScreen(app, 'create');
  pinScreen(app, 'enter');
}

function pinScreen(app, mode) {
  const { store, root } = app;
  let entry = '';
  let first = null;
  const title = mode === 'create' ? (first ? 'Repeat the PIN' : 'Create a 4 digit PIN') : 'Enter PIN';
  root.innerHTML = `
    <div class="screen pin">
      <h1 id="pin-title">${title}</h1>
      <p class="lead">${mode === 'create' ? 'The PIN keeps settings and progress away from little fingers.' : 'This area is for grown ups.'}</p>
      <div class="dots" id="pin-dots" aria-live="polite">○ ○ ○ ○</div>
      <div class="pad" id="pin-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="btn key" data-k="${n}" data-nosw>${n}</button>`).join('')}
        <button class="btn key ghost" data-k="back" data-nosw>⌫</button>
        <button class="btn key" data-k="0" data-nosw>0</button>
        <button class="btn key ghost" data-k="cancel" data-nosw>✕</button>
      </div>
    </div>`;
  const dots = root.querySelector('#pin-dots');
  const head = root.querySelector('#pin-title');
  const paint = () => { dots.textContent = [0, 1, 2, 3].map(i => (i < entry.length ? '●' : '○')).join(' '); };

  async function done() {
    if (mode === 'enter') {
      if (await store.checkPin(entry)) return panel(app);
      toast('That PIN is not right.');
    } else if (!first) {
      first = entry; entry = ''; head.textContent = 'Repeat the PIN'; paint(); return;
    } else if (first === entry) {
      await store.setPin(entry); toast('PIN saved.'); return panel(app);
    } else {
      toast('The two PINs did not match. Try again.'); first = null; head.textContent = 'Create a 4 digit PIN';
    }
    entry = ''; paint();
  }

  root.querySelectorAll('#pin-pad .key').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === 'cancel') return app.home();
    if (k === 'back') entry = entry.slice(0, -1);
    else if (entry.length < 4) entry += k;
    paint();
    if (entry.length === 4) done();
  });
}

function minutes(secs) { return Math.round(secs / 60); }

function summarize(p) {
  const s = p.stats;
  const week = new Date(); week.setDate(week.getDate() - 6);
  const weekStr = today(week);
  const rounds = s.sessions.filter(x => x.day >= weekStr);
  const perGame = {};
  for (const x of s.sessions) {
    const g = (perGame[x.game] = perGame[x.game] || { rounds: 0, asked: 0, unaided: 0, ms: 0, n: 0 });
    g.rounds++; g.asked += x.asked || 0; g.unaided += x.unaided || 0; g.ms += x.avgMs || 0; g.n++;
  }
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = today(d);
    const v = s.days[key];
    days.push({ key, mins: v ? v.secs / 60 : 0, rounds: v ? v.rounds : 0, label: d.getDate() });
  }
  return { rounds, perGame, days };
}

function panel(app) {
  const { store, root } = app;
  const p = store.activeProfile();
  if (!p) return app.home();
  const s = store.settings();
  const sum = summarize(p);
  const maxMin = Math.max(5, ...sum.days.map(d => d.mins));
  const recent = p.stats.sessions.slice(-8).reverse();

  root.innerHTML = `
    <div class="screen parent">
      <div class="ptop"><h1>For grown ups</h1><button class="btn big primary" id="pa-done">Done</button></div>

      <section class="card">
        <h2>${p.avatar} ${esc(p.name)}</h2>
        <div class="row wrap">
          <button class="btn small" id="pa-rename">Change name</button>
          <button class="btn small" id="pa-switch">Switch child</button>
          <button class="btn small danger" id="pa-del">Delete this child</button>
        </div>
      </section>

      <section class="card">
        <h2>How does the child choose?</h2>
        <div class="opts" id="pa-input">
          ${INPUTS.map(([v, name, desc]) => `
            <label class="opt ${s.input === v ? 'sel' : ''}"><input type="radio" name="inp" value="${v}" ${s.input === v ? 'checked' : ''}>
              <b>${name}</b><span>${desc}</span></label>`).join('')}
        </div>
        <label class="slider">Hold time (also scan speed): <b id="v-hold">${s.holdTime}s</b>
          <input id="pa-hold" type="range" min="0.5" max="4" step="0.25" value="${s.holdTime}"></label>
        <label class="slider">Size of buttons and pictures: <b id="v-size">${s.targetScale}x</b>
          <input id="pa-size" type="range" min="1" max="2" step="0.1" value="${s.targetScale}"></label>
        <label class="slider">Pointer reach (higher means smaller movements): <b id="v-sens">${s.sensitivity}x</b>
          <input id="pa-sens" type="range" min="0.5" max="2.5" step="0.1" value="${s.sensitivity}"></label>
        <label class="check"><input id="pa-mouth" type="checkbox" ${s.mouthSelect ? 'checked' : ''}> Head pointer: open the mouth to choose</label>
        <label class="check"><input id="pa-cam" type="checkbox" ${s.showCamera ? 'checked' : ''}> Show a small camera picture while playing</label>
        <label class="select">Camera
          <select id="pa-facing"><option value="user" ${s.camera === 'user' ? 'selected' : ''}>Front camera</option><option value="environment" ${s.camera === 'environment' ? 'selected' : ''}>Back camera</option></select></label>
        <div class="row wrap"><button class="btn small" id="pa-try">Try this now (Bubble Pop)</button></div>
      </section>

      <section class="card">
        <h2>Learning</h2>
        <label class="select">Language
          <select id="pa-lang"><option value="en" ${s.lang === 'en' ? 'selected' : ''}>English</option><option value="hi" ${s.lang === 'hi' ? 'selected' : ''}>हिन्दी (Hindi)</option></select></label>
        <label class="check"><input id="pa-voice" type="checkbox" ${s.voice ? 'checked' : ''}> Speak the questions aloud</label>
        <label class="check"><input id="pa-sound" type="checkbox" ${s.sound ? 'checked' : ''}> Play sounds</label>
        <label class="select">Questions per round
          <select id="pa-round">${[3, 4, 5, 6, 8, 10].map(n => `<option ${s.roundSize === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="select">Offer a rest every
          <select id="pa-break">${[0, 3, 5, 8, 10, 15, 20].map(n => `<option value="${n}" ${s.breakMins === n ? 'selected' : ''}>${n ? n + ' minutes' : 'never'}</option>`).join('')}</select></label>
        <p class="hint-small">Spoken Hindi needs a Hindi voice on the device. If none is installed, the text still shows.</p>
      </section>

      <section class="card">
        <h2>Progress</h2>
        <div class="stats">
          <div><b>${p.stats.stars}</b><span>stars</span></div>
          <div><b>${p.stats.streak}</b><span>day streak</span></div>
          <div><b>${sum.rounds.length}</b><span>rounds this week</span></div>
          <div><b>${p.stats.stickers.length}</b><span>stickers</span></div>
        </div>
        <h3>Minutes played, last 14 days</h3>
        <div class="bars" role="img" aria-label="Minutes played per day">
          ${sum.days.map(d => `<div class="bar" title="${d.key}: ${d.mins.toFixed(1)} min"><i style="height:${Math.max(d.rounds ? 6 : 2, (d.mins / maxMin) * 100)}%"></i><em>${d.label}</em></div>`).join('')}
        </div>
        <h3>By game</h3>
        <table class="tbl"><thead><tr><th>Game</th><th>Rounds</th><th>Without help</th><th>Avg. time</th><th>Level</th></tr></thead><tbody>
          ${Object.keys(GAME_NAMES).map(g => {
            const x = sum.perGame[g];
            return `<tr><td>${GAME_NAMES[g]}</td><td>${x ? x.rounds : 0}</td><td>${x && x.asked ? Math.round(100 * x.unaided / x.asked) + '%' : '-'}</td><td>${x && x.n ? (x.ms / x.n / 1000).toFixed(1) + 's' : '-'}</td><td>${p.stats.levels[g] || 1}</td></tr>`;
          }).join('')}
        </tbody></table>
        <h3>Recent rounds</h3>
        ${recent.length ? `<table class="tbl"><thead><tr><th>Day</th><th>Game</th><th>Done</th><th>Help</th><th>Time</th></tr></thead><tbody>
          ${recent.map(x => `<tr><td>${x.day}</td><td>${GAME_NAMES[x.game] || x.game}</td><td>${x.correct}/${x.asked}</td><td>${x.helped}</td><td>${minutes(x.secs) || '<1'} min</td></tr>`).join('')}
        </tbody></table>` : '<p class="hint-small">No rounds yet.</p>'}
        <p class="hint-small">Level goes up when a child does most questions without help, and down if many needed help. Wrong picks never lose points.</p>
      </section>

      <section class="card">
        <h2>Saved data</h2>
        <p>${store.isPersistent() ? '✅ Progress is saved on this device.' : '⚠️ This browser cannot save progress.'} Nothing is sent to a server. Camera pictures are never stored.</p>
        <div class="row wrap">
          <button class="btn small" id="pa-export">Download backup</button>
          <label class="btn small" for="pa-import">Restore backup</label><input id="pa-import" type="file" accept="application/json,.json" hidden>
          ${app.canInstall() ? '<button class="btn small" id="pa-install">📲 Install app</button>' : ''}
          <button class="btn small" id="pa-pin">Change PIN</button>
          <button class="btn small danger" id="pa-reset">Erase everything</button>
        </div>
      </section>
    </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const set = (patch) => { store.updateSettings(patch); app.resetTouch(); };

  $('pa-done').onclick = () => app.home();
  $('pa-switch').onclick = () => { app.home(); setTimeout(() => document.getElementById('h-who') && document.getElementById('h-who').click(), 0); };
  $('pa-rename').onclick = () => {
    const name = prompt('Name', p.name);
    if (name && name.trim()) { store.renameProfile(p.id, name); panel(app); }
  };
  $('pa-del').onclick = () => {
    if (confirm(`Delete ${p.name} and all their progress?`)) { store.deleteProfile(p.id); app.home(); }
  };
  root.querySelectorAll('input[name=inp]').forEach(r => r.onchange = () => {
    set({ input: r.value });
    root.querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o.querySelector('input').checked));
  });
  const slider = (id, label, key, fmt) => {
    $(id).oninput = (e) => { const v = Number(e.target.value); set({ [key]: v }); $(label).textContent = fmt(v); };
  };
  slider('pa-hold', 'v-hold', 'holdTime', v => v + 's');
  slider('pa-size', 'v-size', 'targetScale', v => v + 'x');
  slider('pa-sens', 'v-sens', 'sensitivity', v => v + 'x');
  $('pa-mouth').onchange = (e) => set({ mouthSelect: e.target.checked });
  $('pa-cam').onchange = (e) => set({ showCamera: e.target.checked });
  $('pa-facing').onchange = (e) => set({ camera: e.target.value });
  $('pa-lang').onchange = (e) => set({ lang: e.target.value });
  $('pa-voice').onchange = (e) => set({ voice: e.target.checked });
  $('pa-sound').onchange = (e) => set({ sound: e.target.checked });
  $('pa-round').onchange = (e) => set({ roundSize: Number(e.target.value) });
  $('pa-break').onchange = (e) => set({ breakMins: Number(e.target.value) });
  $('pa-try').onclick = () => app.startGame('bubbles');

  $('pa-export').onclick = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `play-and-learn-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('pa-import').onchange = async (e) => {
    try { store.importData(await e.target.files[0].text()); toast('Backup restored.'); panel(app); }
    catch (err) { toast(err.message || 'Could not read that file.'); }
  };
  const inst = $('pa-install');
  if (inst) inst.onclick = () => app.install();
  $('pa-pin').onclick = () => pinScreen(app, 'create');
  $('pa-reset').onclick = () => {
    if (confirm('Erase all children, progress and the PIN from this device?')) {
      store.resetAll(); app.home();
    }
  };
}
