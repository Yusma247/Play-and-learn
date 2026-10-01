// Run with: node tests/unit.mjs
import assert from 'node:assert/strict';

// fake browser storage for the store module
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { countFingers, syntheticHand, ModeSmoother } = await import('../js/fingers.js');
const store = await import('../js/store.js');
const { OneEuro } = await import('../js/oneeuro.js');

let passed = 0;
const test = (name, fn) => { return Promise.resolve(fn()).then(() => { passed++; console.log('ok  ', name); }); };

await test('finger counting 0 to 5 on synthetic hands', () => {
  for (const n of [0, 1, 2, 3, 4, 5]) assert.equal(countFingers(syntheticHand(n)), n, `n=${n}`);
});

await test('finger counting works when the image is wide (aspect 16:9)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const h = syntheticHand(n).map(p => ({ x: p.x / (16 / 9) * (4 / 3), y: p.y, z: 0 }));
    assert.equal(countFingers(h, 16 / 9), n);
  }
});

await test('finger counting ignores hand rotation (upside down)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const h = syntheticHand(n).map(p => ({ x: 1 - p.x, y: 1 - p.y, z: 0 }));
    assert.equal(countFingers(h), n);
  }
});

await test('smoother ignores one noisy frame', () => {
  const s = new ModeSmoother(450);
  [3, 3, 2, 3, 3, 3].forEach((v, i) => s.push(i * 30, v));
  assert.equal(s.mode(), 3);
});

await test('smoother reports no hand when empty or too few samples', () => {
  const s = new ModeSmoother();
  s.push(0, 3);
  assert.equal(s.mode(), -2);
});

await test('one euro filter smooths jitter but follows a real move', () => {
  const f = new OneEuro();
  let out = 0;
  for (let i = 0; i < 30; i++) out = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i * 33);
  assert.ok(Math.abs(out - 0.5) < 0.006, 'jitter should be damped');
  for (let i = 30; i < 60; i++) out = f.filter(0.9, i * 33);
  assert.ok(out > 0.85, 'should reach the new position');
});

await test('profiles, stars and progress are saved and reloaded', async () => {
  store.init();
  const p = store.createProfile({ name: 'Aarav', avatar: '🐢' });
  store.addStars(3);
  store.updateSettings({ input: 'head', holdTime: 2.5 });
  const sticker = store.logSession({ game: 'learn', asked: 5, correct: 5, unaided: 4, helped: 1, secs: 120, avgMs: 3000 });
  assert.ok(sticker);
  store.setResume({ game: 'learn', qi: 2 });
  // pretend the page was reloaded
  store.init();
  const q = store.activeProfile();
  assert.equal(q.name, 'Aarav');
  assert.equal(q.stats.stars, 3);
  assert.equal(store.settings().input, 'head');
  assert.equal(store.settings().holdTime, 2.5);
  assert.equal(q.stats.sessions.length, 1);
  assert.equal(q.stats.stickers.length, 1);
  assert.equal(store.getResume().qi, 2);
  assert.equal(q.id, p.id);
});

await test('level is remembered and limited to 1..3', () => {
  store.setLevel('finger', 9); assert.equal(store.level('finger'), 3);
  store.setLevel('finger', -4); assert.equal(store.level('finger'), 1);
});

await test('PIN is stored as a hash and checked', async () => {
  await store.setPin('1234');
  assert.equal(await store.checkPin('1234'), true);
  assert.equal(await store.checkPin('4321'), false);
  assert.ok(!JSON.stringify(store._raw()).includes('"1234"'));
});

await test('export and import round trip', () => {
  const text = store.exportData();
  store.resetAll();
  assert.equal(store.profiles().length, 0);
  store.importData(text);
  assert.equal(store.profiles().length, 1);
  assert.equal(store.activeProfile().name, 'Aarav');
});

await test('import refuses a wrong file', () => {
  assert.throws(() => store.importData('{"hello":1}'));
});

await test('corrupt saved data does not crash and is kept as a backup', () => {
  mem.set('playlearn.v1', '{not json');
  store.init();
  assert.equal(store.profiles().length, 0);
  assert.equal(mem.get('playlearn.v1.bak'), '{not json');
});

console.log(`\n${passed} tests passed`);
