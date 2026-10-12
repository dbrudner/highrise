// Stress test: node tools/stress.mjs — large tower, measures sim throughput & stability
import fs from 'fs';
const bytes = fs.readFileSync(new URL('../web/highrise.wasm', import.meta.url));
const w = (await WebAssembly.instantiate(bytes, {})).instance.exports;
const dec = new TextDecoder();
w.init(7);
let fails = {};
const tryp = (c, k) => { if (c) fails[k] = (fails[k] || 0) + 1; };
for (let x = 0; x < 120; x += 4) tryp(w.place(1, x, 0, 0), 'lobby');
tryp(w.place(5, 0, -1, 0) && 0, 'x');
const build = (maxF) => {
  for (let f = 1; f <= maxF; f++) for (let x = 0; x < 120;) {
    if ([20, 56, 96].some(e => x >= e && x < e + 3)) { x++; continue; }
    const k = f % 5 === 0 ? 5 : f > 12 ? 3 : 2;
    if (w.place(k, x, f, 0) === 0) x += w.kind_width(k); else x++;
  }
  for (const ex of [20, 56, 96]) { tryp(w.place_elevator(ex, 0, maxF, 0), 'elev'); for (let i = 0; i < 5; i++) w.add_car(ex, 0, 0); }
};
w.add_money(5e7);
build(10);
const runDays = (d) => {
  const t0 = performance.now(); w.step(20 * 1440 * d); const ms = performance.now() - t0;
  const n = w.take_msgs(); const m = dec.decode(new Uint8Array(w.memory.buffer, w.buf_ptr(6), n));
  const left = m.split('\n').filter(l => /moved out/.test(l));
  console.log(`days=${d} ms=${ms.toFixed(0)} (${(20*1440*d/ms*1000|0)} ticks/s) $${w.money()} pop=${w.population()} stars=${w.stars()} maxF=${w.max_floor()} moveouts=${left.join(' ')}`);
};
runDays(3);
// keep growing as star limits rise
for (let round = 0; round < 3; round++) { build(w.max_floor()); runDays(3); }
w.prepare_render();
const r = new Int32Array(w.memory.buffer, w.buf_ptr(0), w.buf_len(0));
let sats = []; for (let i = 0; i < r.length; i += 10) if (r[i+1] === 2 || r[i+1] === 3) sats.push(r[i+6]);
sats.sort((a,b)=>a-b);
console.log('rooms', sats.length, 'sat min/median/max', sats[0], sats[sats.length>>1], sats[sats.length-1], 'fails', fails);
