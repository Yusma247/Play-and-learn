// Service worker: makes the app open fast and work with no internet after the first visit.
// BUILD is replaced with a timestamp when the zip is made, so every new upload updates the app.
const BUILD = '__BUILD__';
const CACHE = 'playlearn-' + BUILD;          // app files, replaced on every new version (small)
const VENDOR = 'playlearn-vendor-v1';         // big library and model files, kept across versions so updates stay small

const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/store.js', 'js/i18n.js', 'js/audio.js', 'js/ui.js', 'js/vision.js', 'js/input.js',
  'js/oneeuro.js', 'js/fingers.js', 'js/parent.js',
  'js/games/fingerquest.js', 'js/games/learn.js', 'js/games/bubbles.js', 'js/games/magic.js', 'js/games/content.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];
// Big files that almost never change. Saved once. If one of them ever changes, change the 'v1' in VENDOR above.
// The slower "nosimd" files are only for very old browsers, so they are saved only if a device asks for them.
const BIG = [
  'vendor/mediapipe/vision_bundle.mjs',
  'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
];
// Present when the model files were put in the vendor folder. Skipped if missing.
const OPTIONAL = ['vendor/hand_landmarker.task', 'vendor/face_landmarker.task'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    const big = await caches.open(VENDOR);
    for (const url of BIG) {
      if (!(await big.match(url))) await big.add(url);   // downloaded only the first time
    }
    for (const url of OPTIONAL) {
      try {
        if (await big.match(url)) continue;
        const r = await fetch(url);
        if (r.ok) await big.put(url, r);
      } catch (e) { /* not shipped */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('playlearn-') && k !== CACHE && k !== VENDOR) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const modelCdn = url.hostname === 'storage.googleapis.com' && url.pathname.includes('/mediapipe-models/');
  if (!sameOrigin && !modelCdn) return;

  event.respondWith((async () => {
    const isBig = modelCdn || (sameOrigin && url.pathname.includes('/vendor/'));
    const cache = await caches.open(isBig ? VENDOR : CACHE);
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && (sameOrigin || modelCdn)) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await (await caches.open(CACHE)).match('index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
