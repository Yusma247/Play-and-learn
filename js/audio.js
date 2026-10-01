// Soft sound effects (generated, no files) and spoken prompts (browser voice).
import { speechLang } from './i18n.js';

let ctx = null;
let enabledSound = true;
let enabledVoice = true;

export function configure({ sound, voice }) { enabledSound = sound; enabledVoice = voice; }

// Browsers only allow audio after a touch or click. Call this on the first one.
export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* no audio available */ }
}

function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  if (!ctx || !enabledSound) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export const sfx = {
  chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35)); },
  pop() { tone(700, 0, 0.08, 'triangle', 0.16); tone(1100, 0.03, 0.1, 'triangle', 0.1); },
  soft() { tone(392, 0, 0.18, 'sine', 0.08); tone(330, 0.15, 0.25, 'sine', 0.08); }, // gentle, never harsh
  tick() { tone(880, 0, 0.05, 'sine', 0.06); },
};

let voices = [];
function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) { voices = []; } }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

export function speak(text) {
  if (!enabledVoice || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,?!']/gu, ' '));
    const want = speechLang();
    u.lang = want;
    const v = voices.find(x => x.lang === want) || voices.find(x => x.lang.startsWith(want.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 0.85;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

export function stopSpeaking() { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
