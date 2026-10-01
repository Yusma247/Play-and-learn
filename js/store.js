// Saves everything on the device (localStorage). No server, no account.
// Each child has a profile with settings, stars, stickers and a session history.

const KEY = 'playlearn.v1';

export const DEFAULT_SETTINGS = {
  input: 'touch',        // touch | hand | head | switch
  holdTime: 1.5,         // seconds to hold on a target (also scan speed in switch mode)
  targetScale: 1.3,      // size of buttons and tiles
  sensitivity: 1,        // how far the hand or head must move
  voice: true,
  sound: true,
  lang: 'en',            // en | hi
  roundSize: 5,          // questions per round
  breakMins: 8,          // rest reminder, 0 = off
  camera: 'user',        // user | environment
  mouthSelect: false,    // head mode: open mouth to choose
  showCamera: true,
};

const STICKERS = ['🐠', '🦋', '🐢', '🌈', '🚀', '🐘', '🍎', '🎈', '🐬', '🌻', '🦁', '⭐'];

let state = null;
let persistent = true;

function fresh() {
  return { v: 1, activeId: null, pinHash: null, profiles: {} };
}

function freshStats() {
  return { stars: 0, stickers: [], sessions: [], days: {}, levels: {}, streak: 0, lastDay: null };
}

export function today(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    persistent = true;
  } catch (e) {
    persistent = false;
  }
}

export function init() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        state = JSON.parse(raw);
        if (!state || typeof state !== 'object' || !state.profiles) throw new Error('bad shape');
      } catch (e) {
        // keep a copy of unreadable data instead of throwing it away
        try { localStorage.setItem(KEY + '.bak', raw); } catch (e2) { /* ignore */ }
        state = fresh();
      }
    } else {
      state = fresh();
    }
  } catch (e) {
    state = fresh();
    persistent = false;
  }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }
  return state;
}

export const isPersistent = () => persistent;
export const profiles = () => Object.values(state.profiles);
export const activeProfile = () => (state.activeId && state.profiles[state.activeId]) || null;

export function createProfile({ name, avatar }) {
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  state.profiles[id] = {
    id,
    name: (name || 'Friend').trim().slice(0, 20) || 'Friend',
    avatar: avatar || '🐠',
    created: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    stats: freshStats(),
    resume: null,
  };
  state.activeId = id;
  save();
  return state.profiles[id];
}

export function setActive(id) {
  if (state.profiles[id]) { state.activeId = id; save(); }
}

export function renameProfile(id, name, avatar) {
  const p = state.profiles[id];
  if (!p) return;
  if (name) p.name = name.trim().slice(0, 20);
  if (avatar) p.avatar = avatar;
  save();
}

export function deleteProfile(id) {
  delete state.profiles[id];
  if (state.activeId === id) state.activeId = Object.keys(state.profiles)[0] || null;
  save();
}

export function updateSettings(patch) {
  const p = activeProfile();
  if (!p) return;
  Object.assign(p.settings, patch);
  save();
}

export function settings() {
  const p = activeProfile();
  return p ? { ...DEFAULT_SETTINGS, ...p.settings } : { ...DEFAULT_SETTINGS };
}

export function addStars(n = 1) {
  const p = activeProfile();
  if (!p) return;
  p.stats.stars += n;
  save();
}

export function level(game) {
  const p = activeProfile();
  return (p && p.stats.levels[game]) || 1;
}

export function setLevel(game, lv) {
  const p = activeProfile();
  if (!p) return;
  p.stats.levels[game] = Math.max(1, Math.min(3, lv));
  save();
}

// Called at the end of every round.
export function logSession({ game, asked, correct, unaided, helped, secs, avgMs }) {
  const p = activeProfile();
  if (!p) return null;
  const s = p.stats;
  const day = today();
  s.sessions.push({ ts: Date.now(), day, game, asked, correct, unaided, helped, secs: Math.round(secs), avgMs: Math.round(avgMs || 0) });
  if (s.sessions.length > 300) s.sessions.splice(0, s.sessions.length - 300);
  const d = (s.days[day] = s.days[day] || { secs: 0, rounds: 0 });
  d.secs += Math.round(secs);
  d.rounds += 1;
  // streak of days in a row
  if (s.lastDay !== day) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    s.streak = s.lastDay === today(y) ? s.streak + 1 : 1;
    s.lastDay = day;
  }
  // a sticker for every finished round
  const sticker = STICKERS[s.stickers.length % STICKERS.length];
  s.stickers.push(sticker);
  save();
  return sticker;
}

export function setResume(r) {
  const p = activeProfile();
  if (!p) return;
  p.resume = r;
  save();
}
export const getResume = () => { const p = activeProfile(); return p ? p.resume : null; };
export const clearResume = () => setResume(null);

// ---- parent PIN (stored as a hash, never in plain text)
async function hash(pin) {
  const data = new TextEncoder().encode('playlearn:' + pin);
  if (globalThis.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return 'plain:' + pin; // very old browsers
}
export const hasPin = () => !!state.pinHash;
export async function setPin(pin) { state.pinHash = await hash(pin); save(); }
export async function checkPin(pin) { return state.pinHash === await hash(pin); }

// ---- backup
export function exportData() {
  return JSON.stringify({ app: 'playlearn', exported: new Date().toISOString(), data: state }, null, 2);
}

export function importData(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === 'playlearn' ? obj.data : null;
  if (!data || !data.profiles) throw new Error('This file is not a Play and Learn backup.');
  // merge: imported profiles are added, existing ones with the same id are replaced
  Object.assign(state.profiles, data.profiles);
  if (!state.activeId) state.activeId = Object.keys(state.profiles)[0] || null;
  if (!state.pinHash && data.pinHash) state.pinHash = data.pinHash;
  save();
}

export function resetAll() {
  state = fresh();
  save();
}

// for tests
export function _raw() { return state; }
