// Headless smoke test: node tools/smoke.mjs
import fs from 'fs';
const bytes = fs.readFileSync(new URL('../web/highrise.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const w = instance.exports;
console.log('imports needed:', WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length);
w.init(42);
const ok = (c, what) => { if (c !== 0) console.log('FAIL', what, 'code', c); };
for (let x = 40; x < 80; x += 4) ok(w.place(1, x, 0, 0), 'lobby ' + x);
for (let f = 1; f <= 8; f++) for (let x = 40; x < 80; x += 8) {
  if (x === 56) continue; // elevator column
  ok(w.place(2, x, f, 0), `office ${x},${f}`);
}
ok(w.place_elevator(56, 0, 8, 0), 'elevator'); // x 57..59 on floors 0..8 (56 free on floors>0, 56 lobby on 0? check)
ok(w.add_car(57, 3, 0), 'car');
ok(w.place(5, 44, 9 - 9, 0) === 2 ? 0 : 0, 'noop');
ok(w.place(11, 60, 1, 0) === 2 ? 0 : 0, 'noop');
const dec = new TextDecoder();
const msgs = () => { const n = w.take_msgs(); return dec.decode(new Uint8Array(w.memory.buffer, w.buf_ptr(6), n)); };
const fmt = () => { const t = w.now() / 20; const d = Math.floor(t / 1440), m = t % 1440; return `d${d} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };
let maxActive = 0, maxRiding = 0;
const t0 = Date.now();
for (let i = 0; i < 20 * 60 * 24 * 4 / 200; i++) {
  w.step(200);
  maxActive = Math.max(maxActive, w.active_people());
  w.prepare_render();
  const cars = new Float32Array(w.memory.buffer, w.buf_ptr(3), w.buf_len(3));
  for (let c = 0; c < cars.length; c += 6) maxRiding = Math.max(maxRiding, cars[c + 2]);
  if (i % 72 === 0) console.log(fmt(), '$' + w.money(), 'pop', w.population(), 'stars', w.stars(), 'active', w.active_people(), 'waiting', [...new Int32Array(w.memory.buffer, w.buf_ptr(2), w.buf_len(2))].filter((_, k) => k % 7 === 6).join(','));
  const m = msgs(); if (m && /report|moved out|★/.test(m)) console.log('  >', m.trim().split('\n').filter(l => /report|moved out|★/.test(l)).join(' | '));
}
console.log('maxActive', maxActive, 'maxRiding', maxRiding, 'elapsed ms', Date.now() - t0);
const n = w.save_state(); const save = Array.from(new Int32Array(w.memory.buffer, w.buf_ptr(5), n));
const p = w.alloc_load(save.length); new Int32Array(w.memory.buffer, p, save.length).set(save);
console.log('reload ok', w.load_state(), 'pop after', w.population(), '$', w.money());
