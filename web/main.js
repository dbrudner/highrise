import * as audio from './audio.js';
import { buildPages } from './handbook.js';

// Highrise — browser frontend. The simulation lives in highrise.wasm (Rust);
// this file handles input, HUD and Canvas 2D rendering.

const CW = 8;            // px per cell (world units)
const FH = 32;           // px per floor
const W = 120;           // cells across (must match Rust)
const MIN_F = -6, MAX_F = 60;
const MARGIN = 640;      // world px left of the lot
const SKY_PAD = 420;
const GROUND = SKY_PAD + (MAX_F + 1) * FH;
const WORLD_W = MARGIN * 2 + W * CW;
const WORLD_H = GROUND + (-MIN_F) * FH + 160;
const TPM = 20;
const SAVE_KEY = 'highrise-save-v1';
const native = window.native || null; // set by the desktop (Electron) preload script
const MAC = native ? native.platform === 'darwin' : /Mac|iPhone|iPad/.test(navigator.platform);
const store = {
  get: () => (native ? native.readSave() : localStorage.getItem(SAVE_KEY)),
  set: s => (native ? native.writeSave(s) : localStorage.setItem(SAVE_KEY, s)),
  clear: () => (native ? native.writeSave('') : localStorage.removeItem(SAVE_KEY)),
};

const K = { LOBBY: 1, OFFICE: 2, CONDO: 3, HOTEL: 4, CAFE: 5, SHOP: 6, PARKING: 7, ELEVATOR: 10, STAIRS: 11 };
const KIND_NAME = { 1: 'Lobby', 2: 'Office', 3: 'Condo', 4: 'Hotel Room', 5: 'Café', 6: 'Shop', 7: 'Parking', 10: 'Elevator', 11: 'Stairs' };
const PERSON_KIND = ['Office worker', 'Resident', 'Hotel guest', 'Visitor'];

// Stroke icons (24×24, currentColor)
const ICON = {
  inspect: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  lobby: '<path d="M3 20h18M5 20V8l7-4 7 4v12"/><path d="M10 20v-6h4v6"/>',
  office: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M9 20h6M12 15v5"/>',
  condo: '<path d="M4 11l8-6 8 6"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  hotel: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>',
  cafe: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c0 1.5 1 1.5 1 3M12 3.5c0 1.5 1 1.5 1 3"/>',
  shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  stairs: '<path d="M4 20h4v-4h4v-4h4V8h4"/><path d="M4 20V4"/>',
  elevator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9.5 9l2.5-3 2.5 3M9.5 15l2.5 3 2.5-3"/>',
  car: '<rect x="4" y="5" width="11" height="15" rx="2"/><path d="M19 4v6M16 7h6"/><path d="M7.5 12.5h4"/>',
  bulldoze: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
};
const svg = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg>`;

const TOOLS = [
  { group: 'Tools' },
  { id: 'inspect', name: 'Inspect', key: '1', color: '#9aa4b5', sub: 'Pan & examine',
    desc: 'Hover anything to see its status, satisfaction and traffic. Drag to pan.' },
  { group: 'Rooms' },
  { id: 'lobby', kind: K.LOBBY, name: 'Lobby', key: '2', color: '#d9c99a', where: 'Ground floor',
    desc: 'The front door. Everyone arrives and leaves through a lobby — build this first.', stats: [['Upkeep', '$50 / day']],
    tip: 'Drag sideways to lay a long lobby. Elevators & stairs can sit on top of it.' },
  { id: 'office', kind: K.OFFICE, name: 'Office', key: '3', color: '#6f9fd8', where: 'Above ground',
    desc: 'Leased by a company whose 6 workers commute every weekday and go out for lunch.',
    stats: [['Rent', '$3,000 / day'], ['Workers', '6']] },
  { id: 'condo', kind: K.CONDO, name: 'Condo', key: '4', color: '#e0a462', where: 'Above ground',
    desc: 'Sold to a family of 3 who live here, commute and eat out in the evening.',
    stats: [['Sale', '$150,000 once'], ['HOA', '$150 / day'], ['Residents', '3']] },
  { id: 'hotel', kind: K.HOTEL, name: 'Hotel Room', key: '5', color: '#a58ad6', where: 'Above ground',
    desc: 'Guests check in 16:00–22:00 and leave next morning. Rooms are cleaned by 15:00.',
    stats: [['Per night', '$900 – $1,500'], ['Guests', '2']] },
  { group: 'Commercial' },
  { id: 'cafe', kind: K.CAFE, name: 'Café', key: '6', color: '#e8833a', where: 'Any floor',
    desc: 'Feeds the lunch rush, evening residents and walk-in visitors. Open 7:00–22:00.',
    stats: [['Per customer', '$25'], ['Upkeep', '$500 / day'], ['Seats', '16']] },
  { id: 'shop', kind: K.SHOP, name: 'Shop', key: '7', color: '#3fb67a', where: 'Any floor',
    desc: 'Retail that draws visitors in from the street — more of them as your population grows.',
    stats: [['Per customer', '$45'], ['Upkeep', '$500 / day'], ['Capacity', '10']] },
  { id: 'parking', kind: K.PARKING, name: 'Parking', key: '8', color: '#7d8494', where: 'Basement only',
    desc: 'From 3★ tenants expect 1 parking lot per 10 offices/condos, or satisfaction drops.',
    stats: [['Income', '$400 / day']] },
  { group: 'Transit' },
  { id: 'stairs', kind: K.STAIRS, name: 'Stairs', key: '9', color: '#9aa1ad', where: 'Links a floor to the next',
    desc: 'Cheap and needs no waiting, but slow. Fine for hopping one or two floors.' },
  { id: 'elevator', kind: K.ELEVATOR, name: 'Elevator', key: '0', color: '#4f86c6', where: '2–31 floors',
    desc: 'Drag up or down to set the floors it serves. Starts with one car.',
    stats: [['Per floor', '+$5,000'], ['Upkeep', '$300 / car / day']],
    tip: 'Drag from an existing shaft to extend it.' },
  { id: 'car', name: 'Elevator Car', key: '-', color: '#5aa9a0', sub: 'Click a shaft',
    desc: 'Adds another car to an elevator (up to 6). The fix for long queues and pink commuters.',
    stats: [['Capacity', '16 people'], ['Upkeep', '$300 / day']] },
  { group: '' },
  { id: 'bulldoze', name: 'Demolish', key: 'X', color: '#e05a5a', sub: 'No refund',
    desc: 'Removes a room or a whole shaft. Anything resting on top must go first.' },
];

const ERR = {
  1: 'Not enough money',
  2: 'That space is occupied',
  3: 'Needs support (build up from the ground / down from the lobby)',
  4: "Can't build that on this floor",
  5: 'Out of bounds',
  6: 'Requires a higher star rating',
  7: 'Elevators must span 2–31 floors',
  8: 'Nothing to demolish',
  9: 'Something is built on top of this — demolish that first',
  10: 'Invalid',
  11: 'Elevator already covers those floors',
  12: 'This elevator has the maximum number of cars (6)',
  13: 'Click on an elevator shaft',
  14: 'Too tall for your star rating — grow your population',
};

// ------------------------------------------------------------------ wasm

async function loadWasm() {
  try {
    return (await WebAssembly.instantiateStreaming(fetch('highrise.wasm'), {})).instance.exports;
  } catch {
    const buf = await (await fetch('highrise.wasm')).arrayBuffer();
    return (await WebAssembly.instantiate(buf, {})).instance.exports;
  }
}
const w = await loadWasm();
const i32 = id => new Int32Array(w.memory.buffer, w.buf_ptr(id), w.buf_len(id));
const f32 = id => new Float32Array(w.memory.buffer, w.buf_ptr(id), w.buf_len(id));
const dec = new TextDecoder();

// ------------------------------------------------------------------ state

const canvas = document.getElementById('c');
let ctx = canvas.getContext('2d'); // swapped temporarily when rendering toolbar thumbnails
let dpr = 1, vw = 0, vh = 0;
const cam = { x: 0, y: 0, z: 1.6 };
let tool = 'office';
let speed = 1;
const SPEEDS = [0, 1, 3, 10, 30];
let acc = 0;
let evalMode = false;
let hover = null;          // { cx, f, sx, sy }
let drag = null;           // { type, ... }
let spaceDown = false;
const keys = new Set();
let popups = [];
let lastDay = -1;
let lastStars = 0;
let rooms, people, trans, cars;
let streetT = 0;          // street-life clock (advances with game speed, freezes when paused)

function centerCamera() {
  cam.z = Math.min(2, Math.max(0.8, vw / 1400 * 1.2));
  cam.x = MARGIN + (W * CW) / 2 - (vw + 180) / 2 / cam.z;
  cam.y = GROUND - vh * 0.78 / cam.z;
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  vw = innerWidth; vh = innerHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
}
addEventListener('resize', resize);
resize();

function newGame() {
  backdrop = false;
  w.init((Math.random() * 2 ** 31) | 0);
  popups = [];
  centerCamera();
  log('Welcome to Highrise! Build a Lobby on the ground floor (drag to extend it).', 'star');
  log('Then add Offices above and connect floors with Stairs or an Elevator.', 'new');
  log('New here? Press F1 (R3 on a controller) for the Handbook.', 'new');
}

let backdrop = false; // true while the title screen's background tower is running — never saved

function save(quiet) {
  if (backdrop) return;
  const n = w.save_state();
  const data = Array.from(new Int32Array(w.memory.buffer, w.buf_ptr(5), n));
  try {
    store.set(JSON.stringify(data));
    if (!quiet) log('Game saved.', 'new');
  } catch (e) { log('Save failed: ' + e.message, 'err'); }
}

function load() {
  const raw = store.get();
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    w.init((Math.random() * 2 ** 31) | 0);
    const p = w.alloc_load(data.length);
    new Int32Array(w.memory.buffer, p, data.length).set(data);
    return w.load_state() === 1;
  } catch { return false; }
}

// ------------------------------------------------------------------ helpers

const fx = cx => MARGIN + cx * CW;
const fy = f => GROUND - (f + 1) * FH;           // top of floor f
const floorName = f => (f >= 0 ? `${f + 1}F` : `B${-f}`);
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const short = n => n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function screenToWorld(sx, sy) { return [cam.x + sx / cam.z, cam.y + sy / cam.z]; }
function worldToCell(wx, wy) { return [Math.floor((wx - MARGIN) / CW), Math.floor((GROUND - wy) / FH)]; }

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t;
  const g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t;
  const bl = (pa & 255) + ((pb & 255) - (pa & 255)) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

const SKY = [
  [0, '#060a18', '#121a36'], [300, '#060a18', '#121a36'], [360, '#2c3e70', '#f39c6b'],
  [430, '#4a90d9', '#bfe3f7'], [1020, '#4a90d9', '#bfe3f7'], [1110, '#36507f', '#f6a35b'],
  [1170, '#141c3a', '#3b2a4a'], [1250, '#060a18', '#121a36'], [1440, '#060a18', '#121a36'],
];
function skyAt(m) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a, at, ab] = SKY[i], [b, bt, bb] = SKY[i + 1];
    if (m >= a && m <= b) { const t = (m - a) / (b - a || 1); return [lerpColor(at, bt, t), lerpColor(ab, bb, t)]; }
  }
  return [SKY[0][1], SKY[0][2]];
}
function darknessAt(m) {
  if (m < 330 || m > 1230) return 1;
  if (m < 420) return 1 - (m - 330) / 90;
  if (m > 1080) return (m - 1080) / 150;
  return 0;
}

// deterministic hash for decoration
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const skyline = [];
for (let x = -400, i = 0; x < WORLD_W + 400; i++) {
  const bw = 40 + hash(i, 1) * 90, bh = 80 + hash(i, 2) * 360;
  skyline.push({ x, w: bw, h: bh, shade: hash(i, 3), seed: i });
  x += bw + hash(i, 4) * 20;
}

// ------------------------------------------------------------------ UI: HUD, tools, log

const $ = id => document.getElementById(id);
const toolsEl = $('tools');
const toolCard = $('toolcard');
const toolBtns = {};
const STAR_POP = [0, 300, 1000, 2500, 5000];
const toolCost = t => t.kind ? w.kind_cost(t.kind) : t.id === 'car' ? w.car_cost() : 0;
const toolReq = t => (t.kind ? w.kind_star(t.kind) : 1);
const toolDef = id => TOOLS.find(t => t.id === id);

const CATS = [
  { id: 'rooms', name: 'Rooms', icon: 'condo', tools: ['lobby', 'office', 'condo', 'hotel'] },
  { id: 'shops', name: 'Shops', icon: 'shop', tools: ['cafe', 'shop', 'parking'] },
  { id: 'transit', name: 'Transit', icon: 'elevator', tools: ['stairs', 'elevator', 'car'] },
];
let activeCat = 'rooms';
const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';

toolsEl.innerHTML = `
  <div class="head"><span class="title">Build</span><button class="collapse" title="Collapse / expand">${chevron}</button></div>
  <div class="tabs">${CATS.map(c => `<button class="tab" data-cat="${c.id}" title="${c.name}">${svg(c.icon)}<span>${c.name}</span></button>`).join('')}</div>
  <div class="cards"></div>
  <div class="quick"></div>
  <div class="foot"><div class="ftxt" id="starNext"></div><div class="bar"><i id="starBar"></i></div></div>`;
const cardsEl = toolsEl.querySelector('.cards');
const quickEl = toolsEl.querySelector('.quick');

function hookTool(b, t) {
  b.onclick = () => { audio.sfx('click'); setTool(t.id, true); };
  b.onmouseenter = () => showToolCard(t, b);
  b.onmouseleave = () => { toolCard.style.display = 'none'; };
  toolBtns[t.id] = { b, t };
}

for (const cat of CATS) {
  for (const id of cat.tools) {
    const t = toolDef(id);
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.cat = cat.id;
    b.style.setProperty('--c', t.color);
    const cost = toolCost(t);
    const sub = t.kind ? `<span class="price">${short(cost)}${t.kind === K.ELEVATOR ? '+' : ''}</span><span>${w.kind_width(t.kind)}w</span>`
                       : `<span class="price">${short(cost)}</span><span>per car</span>`;
    b.innerHTML = `<div class="thumb"></div><span class="lockbadge"></span>
      <div class="meta"><span class="name">${t.name}</span><kbd>${t.key}</kbd></div><div class="sub">${sub}</div>`;
    cardsEl.appendChild(b);
    hookTool(b, t);
  }
}
for (const id of ['inspect', 'bulldoze']) {
  const t = toolDef(id);
  const b = document.createElement('button');
  b.className = 'qa';
  b.style.setProperty('--c', t.color);
  b.innerHTML = `${svg(id)}<span>${t.name}</span><kbd>${t.key}</kbd><span class="lockbadge"></span>`;
  quickEl.appendChild(b);
  hookTool(b, t);
}
for (const tb of toolsEl.querySelectorAll('.tab')) {
  tb.onclick = () => { if (toolsEl.classList.contains('mini')) setMini(false); setCat(tb.dataset.cat); };
}

function setCat(id) {
  activeCat = id;
  for (const tb of toolsEl.querySelectorAll('.tab')) tb.classList.toggle('on', tb.dataset.cat === id);
  for (const c of cardsEl.children) c.style.display = c.dataset.cat === id ? '' : 'none';
}

// Thumbnails are drawn with the game's own renderer so the menu shows the real art.
const THUMBS = {
  lobby: { cells: 12, floors: 1, rooms: [[K.LOBBY, 0, 0], [K.LOBBY, 4, 0], [K.LOBBY, 8, 0]], people: [[3, 0, 3], [6.5, 0, 0], [9.5, 0, 1]], ground: true },
  office: { cells: 8, floors: 1, rooms: [[K.OFFICE, 0, 0]], people: [[2.2, 0, 0], [6.4, 0, 0]] },
  condo: { cells: 12, floors: 1, rooms: [[K.CONDO, 0, 0]], people: [[4.5, 0, 1], [9.5, 0, 1]] },
  hotel: { cells: 5, floors: 1, rooms: [[K.HOTEL, 0, 0]], people: [[1.2, 0, 2]] },
  cafe: { cells: 12, floors: 1, rooms: [[K.CAFE, 0, 0]], people: [[5.6, 0, 3], [8, 0, 0], [10.2, 0, 1]] },
  shop: { cells: 8, floors: 1, rooms: [[K.SHOP, 0, 0]], people: [[6.5, 0, 3], [3.2, 0, 2]] },
  parking: { cells: 10, floors: 1, rooms: [[K.PARKING, 0, 0]], basement: true },
  stairs: { cells: 7, floors: 2, rooms: [[K.LOBBY, 0, 0], [K.OFFICE, 0, 1]], trans: [[K.STAIRS, 0, 0, 1]], people: [[1.2, 0.35, 0], [5, 0, 3]], ground: true },
  elevator: { cells: 11, floors: 2, rooms: [[K.LOBBY, 3, 0], [K.LOBBY, 7, 0], [K.OFFICE, 3, 1]], trans: [[K.ELEVATOR, 0, 0, 1]], cars: [[1, 5, 1]], people: [[4.5, 0, 0], [5.1, 0, 3], [8, 1, 0]], ground: true },
  car: { cells: 3, floors: 2, trans: [[K.ELEVATOR, 0, 0, 1]], cars: [[0, 9, 1], [1, 4, 0]] },
};
function renderThumb(id) {
  const spec = THUMBS[id];
  const FW = 132, FHT = 62, S = 2;             // logical frame, device scale
  const c = document.createElement('canvas');
  c.width = FW * S; c.height = FHT * S;
  const wpx = spec.cells * CW, hpx = spec.floors * FH;
  const k = Math.min((FW - 10) / wpx, (FHT - 12) / hpx);
  const saved = { ctx, rooms, trans, cars, people, evalMode, z: cam.z };
  ctx = c.getContext('2d');
  evalMode = false;
  cam.z = 2.5;                                  // enables in-room labels
  // backdrop
  const g = ctx.createLinearGradient(0, 0, 0, FHT * S);
  if (spec.basement) { g.addColorStop(0, '#5a412c'); g.addColorStop(1, '#3a2a1c'); }
  else { g.addColorStop(0, '#5f9fe0'); g.addColorStop(1, '#c4e4f7'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  const ox = (FW - wpx * k) / 2, oy = (FHT - hpx * k) / 2 + 2;
  if (spec.ground) { ctx.fillStyle = '#8c8f96'; ctx.fillRect(0, (oy + hpx * k) * S, c.width, 3 * S); ctx.fillStyle = '#5a412c'; ctx.fillRect(0, (oy + hpx * k + 3) * S, c.width, c.height); }
  ctx.setTransform(k * S, 0, 0, k * S, (ox - MARGIN * k) * S, (oy - fy(spec.floors - 1) * k) * S);
  const st = { dark: 0, min: 720, skyBot: '#bfe3f7' };
  for (const [kind, x, f] of spec.rooms || []) {
    drawRoom({ kind, x, f, w: w.kind_width(kind), occ: 1, sat: 80, inside: 1, flag: 0, visits: 0 }, st);
  }
  trans = new Int32Array((spec.trans || []).flatMap(([kind, x, lo, hi], i) => [i, kind, x, lo, hi, 1, 0]));
  cars = new Float32Array((spec.cars || []).flatMap(([y, n, door]) => [0, y, n, 1, 0, door ? 6 : 0]));
  drawTransports(st);
  people = new Float32Array((spec.people || []).flatMap(([x, f, kind], i) => [x, f, kind, 0, f % 1 ? 1 : 0, 40 + i * 7 + spec.cells, i % 2 ? -1 : 1]));
  drawPeople();
  ({ ctx, rooms, trans, cars, people, evalMode } = saved);
  cam.z = saved.z;
  return c;
}
function buildThumbs() {
  for (const c of cardsEl.children) {
    const id = Object.keys(toolBtns).find(k => toolBtns[k].b === c);
    c.querySelector('.thumb').appendChild(renderThumb(id));
  }
}

function showToolCard(t, b) {
  const s = w.stars(), req = toolReq(t), cost = toolCost(t);
  const rows = [];
  if (cost) rows.push(['Cost', money(cost) + (t.kind === K.ELEVATOR ? ' + floors' : '')]);
  if (t.kind && t.kind !== K.ELEVATOR) rows.push(['Size', `${w.kind_width(t.kind)} cells`]);
  if (t.where) rows.push(['Where', t.where]);
  for (const r of t.stats || []) rows.push(r);
  let note = '';
  if (req > s) note = `<div class="note lock">🔒 Unlocks at ${'★'.repeat(req)} — reach ${STAR_POP[req - 1].toLocaleString()} population</div>`;
  else if (cost && w.money() < cost) note = `<div class="note poor">Not enough funds (${money(w.money())})</div>`;
  else if (t.tip) note = `<div class="note tip">${t.tip}</div>`;
  toolCard.innerHTML = `<h4>${t.name}<kbd>${t.key}</kbd></h4><p>${t.desc}</p>
    ${rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('')}${note}`;
  const r = b.getBoundingClientRect(), pr = toolsEl.getBoundingClientRect();
  toolCard.style.display = 'block';
  toolCard.style.left = pr.right + 10 + 'px';
  toolCard.style.top = clamp(r.top - 6, 10, innerHeight - toolCard.offsetHeight - 10) + 'px';
}

function setTool(id, fromClick) {
  const tb = toolBtns[id];
  if (!tb) return;
  const req = toolReq(tb.t);
  if (req > w.stars()) {
    if (fromClick) log(`${tb.t.name} unlocks at ${req}★ (${STAR_POP[req - 1].toLocaleString()} population).`, 'err');
    return;
  }
  tool = id;
  const cat = tb.b.dataset.cat;
  if (cat && cat !== activeCat) setCat(cat);
  for (const k in toolBtns) toolBtns[k].b.classList.toggle('on', k === id);
  for (const tab of toolsEl.querySelectorAll('.tab')) tab.classList.toggle('has', tab.dataset.cat === cat);
  canvas.style.cursor = id === 'inspect' ? 'grab' : 'crosshair';
}

function refreshLocks() {
  const s = w.stars();
  for (const k in toolBtns) {
    const { b, t } = toolBtns[k];
    const req = toolReq(t);
    b.classList.toggle('locked', req > s);
    b.querySelector('.lockbadge').textContent = `🔒 ${req}★`;
  }
}

// cheap per-HUD-tick refresh: affordability + star progress
function refreshToolbar() {
  const m = w.money();
  for (const k in toolBtns) {
    const { b, t } = toolBtns[k];
    b.classList.toggle('poor', toolCost(t) > m);
  }
  const s = w.stars(), pop = w.population();
  const next = $('starNext'), bar = $('starBar');
  if (s >= 5) { next.innerHTML = '<b>★★★★★</b> Landmark tower'; bar.style.width = '100%'; return; }
  const lo = STAR_POP[s - 1], hi = STAR_POP[s];
  next.innerHTML = `<span>Next rating <b>${'★'.repeat(s + 1)}</b></span><span>${pop.toLocaleString()} / ${hi.toLocaleString()}</span>`;
  bar.style.width = `${clamp((pop - lo) / (hi - lo), 0, 1) * 100}%`;
  toolsEl.querySelector('.foot').title = `${pop} / ${hi} population to ${s + 1}★`;
}

function setMini(on) {
  toolsEl.classList.toggle('mini', on);
  toolsEl.querySelector('.collapse svg').style.transform = on ? 'rotate(180deg)' : '';
  localStorage.setItem('highrise-tools-mini', on ? '1' : '0');
}
toolsEl.querySelector('.collapse').onclick = () => setMini(!toolsEl.classList.contains('mini'));
setCat('rooms');
setMini(localStorage.getItem('highrise-tools-mini') === '1');

const speedsEl = $('speeds');
['<svg viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1" width="2.4" height="8" rx=".6"/><rect x="6.1" y="1" width="2.4" height="8" rx=".6"/></svg>', '1×', '3×', '10×', '30×'].forEach((label, i) => {
  const b = document.createElement('button');
  b.innerHTML = label;
  b.title = i ? `${SPEEDS[i]}× speed` : 'Pause (P)';
  b.onclick = () => setSpeed(i);
  speedsEl.appendChild(b);
});
function setSpeed(i) { speed = i; [...speedsEl.children].forEach((b, j) => b.classList.toggle('on', j === i)); }

$('evalBtn').onclick = () => toggleEval();
function toggleEval() { evalMode = !evalMode; $('evalBtn').classList.toggle('on', evalMode); $('evalSwitch').checked = evalMode; }
$('menuBtn').onclick = () => openMenu('pause');
$('handbookBtn').onclick = () => openHandbook();

// ------------------------------------------------------------------ notifications (macOS-style banners + history)

const NB = {
  star: { title: 'Rating Up', color: '#ff9f0a', icon: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor"/>' },
  tenant: { title: 'New Tenant', color: '#0a84ff', icon: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10.5 20.5v-3.5h3v3.5"/>' },
  sale: { title: 'Condo Sold', color: '#30d158', icon: '<path d="M12 4v16M16 7.5c0-1.6-1.8-2.5-4-2.5s-4 1-4 2.8c0 4 8 2.2 8 6.4 0 1.9-1.8 2.8-4 2.8s-4-1-4-2.6"/>' },
  warn: { title: 'Tenants Unhappy', color: '#ff453a', icon: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>' },
  report: { title: 'Daily Report', color: '#5e5ce6', icon: '<path d="M5 20V10M10 20V5M15 20v-7M20 20V8"/>' },
  ach: { title: 'Achievement Unlocked', color: '#bf5af2', icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/>' },
  info: { title: 'Highrise', color: '#64d2ff', icon: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>' },
};
const nbSvg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NB[k].icon}</svg>`;
const bannersEl = $('banners');
const notifHistory = [];
let unread = 0;

function gameStamp() {
  const t = w.now() / TPM, d = Math.floor(t / 1440), m = Math.floor(t % 1440);
  return `${DAYS[d % 7]} ${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
}

function classify(text) {
  if (text.startsWith('★')) return ['star', text.replace(/^★\s*/, '')];
  if (text.startsWith('🏆')) return ['ach', text.replace(/^🏆\s*Achievement unlocked:\s*/, '')];
  if (/moved in/.test(text)) return ['tenant', text];
  if (/sold/.test(text)) return ['sale', text];
  if (/moved out|complaining/.test(text)) return ['warn', text];
  if (/report/.test(text)) return ['report', text.replace(/^Day \d+ report:\s*/, '')];
  return ['info', text];
}

function notify(kind, body) {
  if (backdrop) return;
  notifHistory.unshift({ kind, body, when: gameStamp() });
  if (notifHistory.length > 80) notifHistory.pop();
  if (!$('notif-pop').classList.contains('show')) { unread++; syncBadge(); } else renderNotifList();
  // merge bursts of the same kind into one banner ("3 new tenants")
  const existing = [...bannersEl.children].find(b => b.dataset.kind === kind && !b.classList.contains('out'));
  if (existing && (kind === 'tenant' || kind === 'sale')) {
    const n = +existing.dataset.count + 1;
    existing.dataset.count = n;
    existing.querySelector('.bbody').textContent = kind === 'tenant' ? `${n} new tenants moved in.` : `${n} condos sold.`;
    existing.querySelector('.bhead b').textContent = kind === 'tenant' ? 'New Tenants' : 'Condos Sold';
    armBanner(existing);
    return;
  }
  const b = document.createElement('div');
  b.className = 'banner';
  b.dataset.kind = kind;
  b.dataset.count = 1;
  b.innerHTML = `<div class="bicon" style="--c:${NB[kind].color}">${nbSvg(kind)}</div>
    <div class="btext"><div class="bhead"><b>${NB[kind].title}</b><span>now</span></div><div class="bbody"></div></div>`;
  b.querySelector('.bbody').textContent = body;
  b.onclick = () => dismissBanner(b);
  bannersEl.prepend(b);
  while (bannersEl.children.length > 4) bannersEl.lastChild.remove();
  armBanner(b);
}
function armBanner(b) {
  clearTimeout(b._t);
  b._t = setTimeout(() => dismissBanner(b), 5200);
}
function dismissBanner(b) {
  b.classList.add('out');
  setTimeout(() => b.remove(), 300);
}
function syncBadge() {
  const badge = $('notifBadge');
  badge.textContent = unread > 99 ? '99+' : unread;
  badge.classList.toggle('show', unread > 0);
}
function renderNotifList() {
  $('notifList').innerHTML = notifHistory.length
    ? notifHistory.map(n => `<div class="np-item"><div class="bicon" style="--c:${NB[n.kind].color}">${nbSvg(n.kind)}</div>
        <div class="btext"><div class="bhead"><b>${NB[n.kind].title}</b><span>${n.when}</span></div><div class="bbody"></div></div></div>`).join('')
    : '<div class="np-empty">No notifications</div>';
  [...$('notifList').querySelectorAll('.bbody')].forEach((el, i) => { el.textContent = notifHistory[i].body; });
}
$('notifBtn').onclick = e => {
  e.stopPropagation();
  const pop = $('notif-pop');
  pop.classList.toggle('show');
  $('notifBtn').classList.toggle('on', pop.classList.contains('show'));
  if (pop.classList.contains('show')) { unread = 0; syncBadge(); renderNotifList(); }
};
$('notifClear').onclick = () => { notifHistory.length = 0; renderNotifList(); };
function closeNotifs() { $('notif-pop').classList.remove('show'); $('notifBtn').classList.remove('on'); }
addEventListener('pointerdown', e => { if (!e.target.closest?.('#notif-pop, #notifBtn')) closeNotifs(); });

// Errors go to the status bar (like a native app), everything else becomes a notification.
let statusErr = '', statusErrUntil = 0;
function log(text, cls = 'new') {
  if (cls === 'err') { statusErr = text; statusErrUntil = performance.now() + 3500; return; }
  const [kind, body] = classify(text);
  notify(kind, body);
}

function pullMessages() {
  const n = w.take_msgs();
  if (!n) return;
  const text = dec.decode(new Uint8Array(w.memory.buffer, w.buf_ptr(6), n));
  for (const line of text.split('\n')) {
    if (!line) continue;
    log(line, line.startsWith('★') ? 'star' : 'new');
    if (backdrop) continue;
    if (line.startsWith('★')) audio.sfx('fanfare');
    else if (/sold/.test(line)) audio.sfx('cash');
    else if (/moved in/.test(line)) audio.sfx('chime');
    else if (/moved out|complaining/.test(line)) audio.sfx('sad');
  }
}

let hudTimer = 0;
// Analog wall clock in the HUD; the face tints with time of day.
const aclock = $('aclock'), actx = aclock.getContext('2d');
function drawAnalogClock() {
  const t = w.now() / TPM, m = t % 1440, dark = darknessAt(m);
  const S = aclock.width, c = S / 2, r = S / 2 - 3;
  actx.clearRect(0, 0, S, S);
  // rim + face
  const rim = actx.createLinearGradient(0, 0, 0, S);
  rim.addColorStop(0, '#dfe6f0'); rim.addColorStop(1, '#7d8798');
  actx.fillStyle = rim; actx.beginPath(); actx.arc(c, c, r, 0, 7); actx.fill();
  const face = actx.createRadialGradient(c, c - r * 0.3, r * 0.1, c, c, r);
  face.addColorStop(0, lerpColor('#ffffff', '#2b3352', dark));
  face.addColorStop(1, lerpColor('#e4ebf5', '#141a30', dark));
  actx.fillStyle = face; actx.beginPath(); actx.arc(c, c, r - 4, 0, 7); actx.fill();
  // day/night glyph
  actx.fillStyle = dark > 0.5 ? '#e8ecf7' : '#ffb347';
  actx.beginPath(); actx.arc(c, c + r * 0.38, r * 0.11, 0, 7); actx.fill();
  if (dark > 0.5) { actx.fillStyle = lerpColor('#e4ebf5', '#141a30', dark); actx.beginPath(); actx.arc(c + r * 0.06, c + r * 0.34, r * 0.1, 0, 7); actx.fill(); }
  // ticks
  const ink = dark > 0.5 ? '#cfd8ea' : '#2a3142';
  actx.strokeStyle = ink; actx.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
    actx.lineWidth = big ? 3 : 1.2;
    const r1 = r - 8, r2 = r - (big ? 16 : 11);
    actx.beginPath(); actx.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); actx.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2); actx.stroke();
  }
  const hand = (frac, len, width, color) => {
    const a = frac * Math.PI * 2;
    actx.strokeStyle = color; actx.lineWidth = width;
    actx.beginPath(); actx.moveTo(c - Math.sin(a) * len * 0.18, c + Math.cos(a) * len * 0.18);
    actx.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len); actx.stroke();
  };
  hand((m % 720) / 720, r * 0.5, 5, ink);                 // hour
  hand((m % 60) / 60, r * 0.74, 3.2, ink);                // minute
  hand((t % 1) , r * 0.78, 1.4, '#e74c3c');               // "second" sweep (one turn per game minute)
  actx.fillStyle = '#e74c3c'; actx.beginPath(); actx.arc(c, c, 3.2, 0, 7); actx.fill();
}

function updateHud() {
  const m = w.money();
  $('money').textContent = money(m);
  $('money').classList.toggle('neg', m < 0);
  $('pop').textContent = w.population().toLocaleString();
  const s = w.stars();
  $('stars').textContent = '★'.repeat(s) + '☆'.repeat(5 - s);
  const t = w.now() / TPM, day = Math.floor(t / 1440), min = Math.floor(t % 1440);
  $('dayl').textContent = `${DAYS[day % 7]} · Day ${day + 1}`;
  $('clock').textContent = `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')} ${min < 720 ? 'AM' : 'PM'}`;
  const li = w.last_income(), le = w.last_expense();
  $('flow').innerHTML = day === 0 ? '—' : `<span style="color:var(--good)">+${short(li)}</span> / <span style="color:var(--bad)">−${short(le)}</span>`;
  if (s !== lastStars) { lastStars = s; refreshLocks(); }
  refreshToolbar();
  checkAchievements();
}

// ------------------------------------------------------------------ input

function updateHover(sx, sy) {
  const [wx, wy] = screenToWorld(sx, sy);
  const [cx, f] = worldToCell(wx, wy);
  hover = { cx, f, sx, sy, wx, wy };
}

function toolKind() { return toolBtns[tool]?.t.kind; }
function placeX(kind, cx) { return cx - Math.floor(w.kind_width(kind) / 2); }

function act(silent) {
  if (!hover) return;
  const { cx, f } = hover;
  const kind = toolKind();
  let code = 0;
  if (tool === 'bulldoze') code = w.bulldoze(cx, f, 0);
  else if (tool === 'car') code = w.add_car(cx, f, 0);
  else if (kind && kind !== K.ELEVATOR) code = w.place(kind, placeX(kind, cx), f, 0);
  else return;
  if (code === 0) audio.sfx(tool === 'bulldoze' ? 'demolish' : 'build');
  else if (!silent) { log(ERR[code] || 'Error', 'err'); audio.sfx('error'); }
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
// Pointer logic is shared by the mouse/touch handlers below and the gamepad cursor.
function pointerDown(sx, sy, button) {
  updateHover(sx, sy);
  const pan = button === 1 || button === 2 || (button === 0 && (spaceDown || tool === 'inspect'));
  if (pan) { drag = { type: 'pan', sx, sy, cx: cam.x, cy: cam.y }; canvas.style.cursor = 'grabbing'; return; }
  if (button !== 0) return;
  if (tool === 'elevator') {
    drag = { type: 'elevator', x: placeX(K.ELEVATOR, hover.cx), f0: hover.f };
    // snap to an existing shaft column so drags extend it
    const c = w.cell_at(hover.cx, hover.f);
    if (c < 0 && trans) {
      for (let i = 0; i < trans.length; i += 7) if (-c - 1 === trans[i] && trans[i + 1] === K.ELEVATOR) drag.x = trans[i + 2];
    }
    return;
  }
  drag = { type: 'paint', last: `${hover.cx},${hover.f}` };
  act(false);
}
function pointerMove(sx, sy) {
  updateHover(sx, sy);
  if (!drag) return;
  if (drag.type === 'pan') {
    cam.x = drag.cx - (sx - drag.sx) / cam.z;
    cam.y = drag.cy - (sy - drag.sy) / cam.z;
  } else if (drag.type === 'paint') {
    const key = `${hover.cx},${hover.f}`;
    if (key !== drag.last) { drag.last = key; act(true); }
  }
}
function pointerUp() {
  if (drag?.type === 'elevator' && hover) {
    const code = w.place_elevator(drag.x, drag.f0, hover.f, 0);
    if (code !== 0) { log(ERR[code] || 'Error', 'err'); audio.sfx('error'); }
    else { audio.sfx('build'); audio.sfx('ding'); }
  }
  drag = null;
  canvas.style.cursor = tool === 'inspect' ? 'grab' : 'crosshair';
}
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointerDown(e.offsetX, e.offsetY, e.button); });
canvas.addEventListener('pointermove', e => pointerMove(e.offsetX, e.offsetY));
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointerleave', () => { if (!drag) hover = null; });
function zoomAt(sx, sy, f) {
  const [wx, wy] = screenToWorld(sx, sy);
  cam.z = clamp(cam.z * f, 0.35, 5);
  cam.x = wx - sx / cam.z;
  cam.y = wy - sy / cam.z;
}
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  updateHover(e.offsetX, e.offsetY);
}, { passive: false });

addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select')) return;
  if (!splashGone) { dismissSplash(); return; }
  if (e.key === 'F1') e.preventDefault();
  if (openSheetEl) {
    const hb = openSheetEl.id === 'handbook';
    if (e.key === 'Escape' || (hb && e.key === 'F1')) closeSheet();
    else if (hb && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) hbStep(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (e.key === 'F1') { openHandbook(); return; }
  if (menuMode && e.key !== 'Escape') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { spaceDown = true; e.preventDefault(); return; }
  keys.add(k);
  if (k === 'p') setSpeed(speed === 0 ? 1 : 0);
  else if (k === 'm') { audio.startAudio(); audio.toggleMute(); syncMute(); }
  else if (k === 'e') toggleEval();
  else if (e.key === '?') openHandbook('controls');
  else if (k === 'h') openHandbook();
  else if (k === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(false); }
  else if (k === 'escape') goBack();
  else if (k === 'x' || k === 'delete' || k === 'backspace') setTool('bulldoze');
  else if (k === 'c' && !e.metaKey && !e.ctrlKey) centerCamera();
  else {
    const t = TOOLS.find(t => t.key === e.key);
    if (t) setTool(t.id);
  }
});
// don't let clicked HUD buttons keep focus (Space/Enter would re-trigger them)
addEventListener('click', e => e.target.closest?.('button')?.blur());
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') spaceDown = false; });

// ------------------------------------------------------------------ rendering

function drawBackground(min, dark) {
  const [top, bot] = skyAt(min);
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  // stars
  if (dark > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${(dark - 0.3) * 0.9})`;
    for (let i = 0; i < 120; i++) {
      const x = hash(i, 9) * vw, y = hash(i, 10) * vh * 0.7;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }
  // sun / moon arc
  const dayT = (min - 360) / (1140 - 360);
  if (dayT > -0.05 && dayT < 1.05) {
    const x = vw * (0.1 + 0.8 * dayT), y = vh * (0.75 - Math.sin(Math.PI * clamp(dayT, 0, 1)) * 0.6);
    ctx.fillStyle = 'rgba(255,236,170,0.25)';
    ctx.beginPath(); ctx.arc(x, y, 34, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff2c4';
    ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill();
  } else {
    const nt = ((min + 1440 - 1140) % 1440) / 660;
    const x = vw * (0.1 + 0.8 * nt), y = vh * (0.7 - Math.sin(Math.PI * clamp(nt, 0, 1)) * 0.55);
    ctx.fillStyle = '#e8ecf7';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.arc(x + 6, y - 4, 12, 0, 7); ctx.fill();
  }
}

function setWorldTransform() {
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
}

function drawSkylineAndGround(min, dark, view) {
  // parallax city (moves at 60% of the camera speed)
  const px = cam.x * 0.4;
  const base = lerpColor('#8fa6c4', '#1a2140', Math.min(1, dark * 1.1));
  for (const b of skyline) {
    const x = b.x + px;
    if (x + b.w < view.x0 || x > view.x1) continue;
    ctx.fillStyle = base;
    ctx.globalAlpha = 0.55 + b.shade * 0.3;
    ctx.fillRect(x, GROUND - b.h, b.w, b.h);
    if (dark > 0.25) {
      ctx.fillStyle = 'rgba(255,214,120,0.7)';
      for (let wy = GROUND - b.h + 8; wy < GROUND - 8; wy += 12) {
        for (let wx = x + 5; wx < x + b.w - 6; wx += 9) {
          if (hash(b.seed * 97 + (wx | 0), wy | 0) < 0.25 * dark) ctx.fillRect(wx, wy, 4, 5);
        }
      }
    }
  }
  ctx.globalAlpha = 1;

  // clouds
  if (dark < 0.8) {
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - dark)})`;
    const t = performance.now() / 1000;
    for (let i = 0; i < 14; i++) {
      const cx = ((hash(i, 21) * WORLD_W * 1.5 + t * (4 + hash(i, 22) * 6)) % (WORLD_W * 1.5)) - WORLD_W * 0.25;
      const cy = 120 + hash(i, 23) * (GROUND - 600);
      const s = 0.7 + hash(i, 24) * 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 40 * s, 11 * s, 0, 0, 7);
      ctx.ellipse(cx + 22 * s, cy - 7 * s, 26 * s, 12 * s, 0, 0, 7);
      ctx.ellipse(cx - 20 * s, cy - 4 * s, 22 * s, 9 * s, 0, 0, 7);
      ctx.fill();
    }
  }

  // ground: street + earth
  const eg = ctx.createLinearGradient(0, GROUND, 0, WORLD_H);
  eg.addColorStop(0, '#5a412c');
  eg.addColorStop(1, '#2a1d14');
  ctx.fillStyle = eg;
  ctx.fillRect(view.x0 - 10, GROUND, view.x1 - view.x0 + 20, WORLD_H - GROUND + 2000);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let f = -1; f >= MIN_F; f--) ctx.fillRect(view.x0 - 10, GROUND - f * FH - 1, view.x1 - view.x0 + 20, 1);
  ctx.fillStyle = '#8c8f96';
  ctx.fillRect(view.x0 - 10, GROUND, view.x1 - view.x0 + 20, 5);
  ctx.fillStyle = '#3a3d44';
  ctx.fillRect(view.x0 - 10, GROUND + 5, view.x1 - view.x0 + 20, 3);
  // trees & lamps along the street outside the lot
  for (let i = 0; i < 40; i++) {
    const side = i < 20 ? -1 : 1;
    const x = side < 0 ? MARGIN - 30 - (i % 20) * 34 : MARGIN + W * CW + 30 + (i % 20) * 34;
    if (x < view.x0 - 30 || x > view.x1 + 30) continue;
    if (i % 3 === 0) {
      ctx.fillStyle = '#4b3a2a'; ctx.fillRect(x - 1.5, GROUND - 14, 3, 14);
      ctx.fillStyle = dark > 0.5 ? '#1e3b2a' : '#3f8f4e';
      ctx.beginPath(); ctx.arc(x, GROUND - 18, 8, 0, 7); ctx.fill();
    } else if (i % 3 === 1) {
      ctx.fillStyle = '#555'; ctx.fillRect(x - 0.75, GROUND - 22, 1.5, 22);
      ctx.fillStyle = dark > 0.3 ? '#ffe9a8' : '#999';
      ctx.fillRect(x - 3, GROUND - 24, 6, 2);
      if (dark > 0.3) {
        ctx.fillStyle = `rgba(255,230,160,${0.15 * dark})`;
        ctx.beginPath(); ctx.moveTo(x - 3, GROUND - 22); ctx.lineTo(x - 14, GROUND); ctx.lineTo(x + 14, GROUND); ctx.lineTo(x + 3, GROUND - 22); ctx.fill();
      }
    }
  }
}

function drawBuildArea() {
  const maxF = w.max_floor(), minF = w.min_floor();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1 / cam.z;
  ctx.strokeRect(fx(0), fy(maxF), W * CW, (maxF - minF + 1) * FH);
  ctx.setLineDash([]);
}

function drawFloorLabels(view, occupiedFloors, grid) {
  if (cam.z < 0.6) return;
  ctx.font = '9px ui-sans-serif, system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const maxF = w.max_floor(), minF = w.min_floor();
  for (let f = minF; f <= maxF; f++) {
    const y = fy(f) + FH / 2;
    if (y < view.y0 - FH || y > view.y1 + FH) continue;
    ctx.fillStyle = occupiedFloors.has(f) ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)';
    let left = 0;
    while (left < W && !grid[(f - MIN_F) * W + left]) left++;
    ctx.fillText(floorName(f), fx(left < W ? left : 0) - 5, y);
  }
  ctx.textAlign = 'left';
}

function label(text, x, y, color, size = 7) {
  if (cam.z < 1.1) return;
  ctx.font = `600 ${size}px ui-sans-serif, system-ui`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// ------------------------------------------------------------------ art kit

const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const circle = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
const pick = (arr, t) => arr[Math.min(arr.length - 1, Math.floor(t * arr.length))];

const OFFICE_WALLS = ['#d7dfe8', '#e7e1d5', '#d5e6df', '#e3e0ee'];
const CONDO_WALLS = ['#f3e3c8', '#e6ecf1', '#f1dcdc', '#e5eedd'];
const HOTEL_WALLS = ['#e6def2', '#dcebf0', '#f2e6d8'];
const CAFE_BRANDS = [
  { name: 'CAFÉ', awn: '#b8462f', stripe: '#f2efe6', wall: '#f7dcb0' },
  { name: 'BREW CO.', awn: '#2f6b4f', stripe: '#e9f0e6', wall: '#efe3cf' },
  { name: 'NOODLE BAR', awn: '#c0392b', stripe: '#f6d55c', wall: '#fbe7d0', lanterns: true },
  { name: 'BISTRO', awn: '#24345a', stripe: '#dfe6f3', wall: '#ece4d6' },
];
const SHOP_BRANDS = [
  { name: 'BOUTIQUE', sign: '#c2185b', wall: '#fbeaf0', type: 'clothes' },
  { name: 'TECH', sign: '#263238', wall: '#e9eff2', type: 'tech' },
  { name: 'BOOKS', sign: '#6d4c41', wall: '#f3eadf', type: 'books' },
  { name: 'FLORIST', sign: '#558b2f', wall: '#eef6e6', type: 'flowers' },
];
const BRIGHT = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#2c3e50'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a8754f'];
const HAIR = ['#2b1d14', '#4a2f1b', '#8a5a2b', '#d4b06a', '#1c1c1c', '#b5562b', '#8c8c8c'];
const SUIT = ['#2d3e50', '#34495e', '#1f3a60', '#3d3d3d', '#4b3b5c'];
const SHIRT = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#6c5ce7'];
const PANTS = ['#2c3e50', '#3b5b8a', '#6b5b45', '#4a4a4a', '#2d2d2d', '#5d6d7e'];

function windowBand(x, y, w, h, sky, dark) {
  R(x - 1, y - 1, w + 2, h + 2, '#9aa3ae');
  R(x, y, w, h, sky);
  ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - dark)})`;
  ctx.beginPath(); ctx.moveTo(x + w * 0.15, y + h); ctx.lineTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.38, y); ctx.lineTo(x + w * 0.23, y + h); ctx.fill();
  for (let i = 12; i < w; i += 12) R(x + i, y, 1, h, '#9aa3ae');
}

function plant(x, base, s = 1) {
  R(x - 2 * s, base - 4 * s, 4 * s, 4 * s, '#8a6a4a');
  circle(x, base - 6.5 * s, 3.2 * s, '#2f7d4a');
  circle(x - 1.8 * s, base - 8 * s, 2 * s, '#3c9a5c');
  circle(x + 1.6 * s, base - 8.6 * s, 1.8 * s, '#47a866');
}

function lampGlow(x, y, r, dark) {
  if (dark <= 0.2) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,220,140,${0.45 * dark})`);
  g.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// A seated person seen from the side (torso + head), used inside rooms.
function seated(x, seatY, id, kind = 0) {
  const hs = i => hash(id * 13 + i, 977);
  const top = kind === 0 ? pick(SUIT, hs(4)) : pick(SHIRT, hs(4));
  R(x - 1.6, seatY - 5.2, 3.2, 5.2, top);
  R(x - 1.25, seatY - 8.2, 2.5, 2.8, pick(SKIN, hs(1)));
  R(x - 1.35, seatY - 8.6, 2.7, 1.1, pick(HAIR, hs(2)));
}

// ------------------------------------------------------------------ rooms

function drawRoom(r, st) {
  const { kind, x, f, w: rw, occ, inside } = r;
  const x0 = fx(x), y0 = fy(f), pw = rw * CW, h = FH - 3, by = y0 + h; // by = floor line
  const { dark, min, skyBot } = st;
  const open = min >= 420 && min < 1320;
  const v = hash(x * 31 + 7, f * 17 + kind);
  const id0 = x * 97 + f * 13;
  let lit = false;

  switch (kind) {
    case K.LOBBY: {
      lit = true;
      R(x0, y0, pw, h, '#efe7d4');
      R(x0, y0, pw, 2, '#ddd2b9');
      R(x0, by - 4, pw, 4, '#d8cfb8');
      R(x0, by - 4, pw, 0.6, '#efe9da');
      for (let i = 4; i < pw; i += 8) R(x0 + i, by - 3.4, 0.5, 3.4, '#c9bfa6');
      R(x0, y0, 2, h, '#e2d8c0');
      R(x0 + 8, y0 + 2, 1, 2, '#999'); circle(x0 + 8.5, y0 + 5, 1.6, open || dark ? '#fff1c1' : '#e6e0cf');
      R(x0 + 24, y0 + 2, 1, 2, '#999'); circle(x0 + 24.5, y0 + 5, 1.6, open || dark ? '#fff1c1' : '#e6e0cf');
      const tile = ((x / 4) | 0) % 4;
      if (tile === 0) {
        // revolving door
        R(x0 + 6, y0 + 7, 20, h - 11, '#55636f');
        R(x0 + 7, y0 + 8, 8.5, h - 12, '#b8deef'); R(x0 + 16.5, y0 + 8, 8.5, h - 12, '#a9d3e8');
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.moveTo(x0 + 8, by - 4); ctx.lineTo(x0 + 12, y0 + 8); ctx.lineTo(x0 + 13.5, y0 + 8); ctx.lineTo(x0 + 9.5, by - 4); ctx.fill();
        R(x0 + 15.5, y0 + 8, 1, h - 12, '#55636f');
        R(x0 + 4, y0 + 4, 24, 3, '#3a4a5c');
        R(x0 + 10, by - 4.6, 12, 0.8, '#7a2a2a');
      } else if (tile === 1) {
        // reception
        R(x0 + 10, y0 + 6, 12, 7, '#c9a227'); R(x0 + 11, y0 + 7, 10, 5, '#e3c55a');
        R(x0 + 15.3, y0 + 7.5, 1.4, 4, '#8a6d12');
        seated(x0 + 16, by - 9, id0 + 1, 0);
        R(x0 + 6, by - 11, 20, 7, '#7b5a40'); R(x0 + 5, by - 12, 22, 1.5, '#d9cfb8');
        R(x0 + 8, by - 9, 16, 0.5, '#93704f');
      } else if (tile === 2) {
        // lounge with art
        R(x0 + 7, y0 + 6, 16, 9, '#3a3a3a');
        R(x0 + 8, y0 + 7, 14, 7, '#f5f0e6');
        R(x0 + 9, y0 + 8, 5, 5, pick(BRIGHT, v)); circle(x0 + 18, y0 + 10.5, 2.4, pick(BRIGHT, hash(v * 9, 3)));
        R(x0 + 5, by - 9, 22, 5, '#4a6fa5'); R(x0 + 5, by - 12, 3, 8, '#3f5f8e'); R(x0 + 24, by - 12, 3, 8, '#3f5f8e');
      } else {
        // plant, bench, mailboxes
        plant(x0 + 7, by - 4, 1.1);
        R(x0 + 14, y0 + 7, 13, 9, '#b7a98b');
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) R(x0 + 15 + i * 3, y0 + 8 + j * 2.7, 2.4, 2.2, '#d9cdb1');
        R(x0 + 14, by - 8, 13, 1.6, '#5c4433'); R(x0 + 15, by - 6.4, 1, 2.4, '#5c4433'); R(x0 + 25, by - 6.4, 1, 2.4, '#5c4433');
      }
      break;
    }

    case K.OFFICE: {
      if (!occ) {
        R(x0, y0, pw, h, '#4a515d');
        windowBand(x0 + 3, y0 + 3, pw - 6, 9, 'rgba(160,185,210,0.25)', 1);
        R(x0, by - 2, pw, 2, '#3c424c');
        R(x0 + pw / 2 - 16, y0 + 14, 32, 9, '#f5f5f5');
        R(x0 + pw / 2 - 16, y0 + 14, 32, 2.5, '#e74c3c');
        label('FOR LEASE', x0 + pw / 2 - 14, y0 + 19.5, '#c0392b', 5);
        break;
      }
      lit = inside > 0;
      R(x0, y0, pw, h, pick(OFFICE_WALLS, v));
      windowBand(x0 + 3, y0 + 3, pw - 6, 9, skyBot, dark);
      R(x0, by - 2, pw, 2, '#8a94a3');
      if (lit) for (let i = 10; i < pw; i += 22) R(x0 + i, y0, 6, 1.2, '#fff6d0');
      const layout = Math.floor(hash(v * 77, 5) * 3);
      if (layout === 0) {
        // open plan
        for (let i = 0; i < 3; i++) {
          const dx = x0 + 5 + i * 20;
          if (i < inside) seated(dx + 4, by - 6, id0 + i, 0);
          R(dx + 2, by - 6, 4, 1.4, '#39424f'); R(dx + 3.5, by - 4.6, 1, 4.6, '#39424f');
          R(dx, y0 + 19, 15, 2, '#7a5a40'); R(dx + 1, y0 + 21, 1, by - y0 - 21, '#5e4530'); R(dx + 13, y0 + 21, 1, by - y0 - 21, '#5e4530');
          R(dx + 6, y0 + 13, 7, 5, '#1d2733'); R(dx + 7, y0 + 14, 5, 3, lit ? '#6fd0ff' : '#2a3a4a'); R(dx + 9, y0 + 18, 1, 1, '#1d2733');
          R(dx + 1.5, y0 + 17.5, 3, 1.5, '#ecf0f1');
        }
      } else if (layout === 1) {
        // meeting room
        R(x0 + 3, y0 + 14, 13, 9, '#fafafa'); R(x0 + 3, y0 + 14, 13, 0.6, '#999');
        ctx.strokeStyle = '#3498db'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x0 + 5, y0 + 20); ctx.lineTo(x0 + 8, y0 + 17); ctx.lineTo(x0 + 10, y0 + 19); ctx.lineTo(x0 + 14, y0 + 16); ctx.stroke();
        R(x0 + 51, y0 + 14, 10, 7, '#1d2733'); R(x0 + 52, y0 + 15, 8, 5, lit ? '#2ecc71' : '#2a3a4a');
        for (let i = 0; i < Math.min(inside, 6); i++) seated(x0 + 23 + i * 5, by - 7, id0 + i, 0);
        R(x0 + 19, y0 + 20, 31, 2, '#6b4f3a'); R(x0 + 22, y0 + 22, 1.2, by - y0 - 22, '#4e3a2a'); R(x0 + 46, y0 + 22, 1.2, by - y0 - 22, '#4e3a2a');
        R(x0 + 30, y0 + 18.5, 4, 1.5, '#ecf0f1'); R(x0 + 38, y0 + 18.8, 2, 1.2, '#c0392b');
      } else {
        // executive suite
        R(x0 + 3, y0 + 13, 11, by - y0 - 13, '#6b4a33');
        for (let row = 0; row < 3; row++) {
          R(x0 + 3, y0 + 13 + row * 4.6 + 4, 11, 0.8, '#4e3624');
          for (let b = 0; b < 5; b++) R(x0 + 4 + b * 2, y0 + 14 + row * 4.6, 1.5, 3.6, pick(BRIGHT, hash(b + row * 5, v * 50)));
        }
        if (inside > 0) seated(x0 + 40, by - 7, id0, 0);
        R(x0 + 37, by - 10, 6, 10, '#2c2c2c');
        R(x0 + 28, y0 + 19, 20, 2.4, '#4e3624'); R(x0 + 29, y0 + 21.4, 18, by - y0 - 21.4, '#6b4a33');
        R(x0 + 30, y0 + 14, 7, 5, '#1d2733'); R(x0 + 31, y0 + 15, 5, 3, lit ? '#6fd0ff' : '#2a3a4a');
        plant(x0 + 56, by - 1, 1);
        R(x0 + 18, by - 7, 6, 5, '#8e3b3b'); R(x0 + 18, by - 10, 2, 8, '#7a3131');
      }
      break;
    }

    case K.CONDO: {
      if (!occ) {
        R(x0, y0, pw, h, '#5b4c3f');
        windowBand(x0 + 36, y0 + 4, 24, 11, 'rgba(160,185,210,0.25)', 1);
        R(x0, by - 2, pw, 2, '#4a3d33');
        R(x0 + 8, y0 + 13, 22, 9, '#f5f5f5'); R(x0 + 8, y0 + 13, 22, 2.5, '#16a085');
        label('FOR SALE', x0 + 9.5, y0 + 18.5, '#117a65', 4.5);
        break;
      }
      lit = inside > 0;
      R(x0, y0, pw, h, pick(CONDO_WALLS, v));
      R(x0, by - 2, pw, 2, '#b78a5e');
      const layout = Math.floor(hash(v * 77, 6) * 3);
      if (layout === 0) {
        // classic living room + bedroom
        windowBand(x0 + 34, y0 + 4, 20, 10, skyBot, dark);
        R(x0 + 4, by - 1.5, 30, 1.5, '#c0504d');
        if (inside > 0) seated(x0 + 14, by - 7, id0, 1);
        if (inside > 1) seated(x0 + 21, by - 7, id0 + 1, 1);
        R(x0 + 6, by - 9, 22, 6, '#a8574a'); R(x0 + 6, by - 13, 3, 10, '#934b40'); R(x0 + 25, by - 13, 3, 10, '#934b40');
        R(x0 + 10, y0 + 6, 12, 7, '#8c6b4f'); R(x0 + 11, y0 + 7, 10, 5, pick(BRIGHT, v));
        R(x0 + 62, by - 9, 26, 5, '#ffffff'); R(x0 + 70, by - 9, 18, 5, pick(['#6a8fbf', '#7d4fb0', '#e67e22'], v));
        R(x0 + 60, by - 15, 3, 15, '#7b5a40'); R(x0 + 61, by - 10.5, 4, 2, '#f5f5f5');
        R(x0 + 91, by - 6, 4, 6, '#7b5a40');
        R(x0 + 92, y0 + 10, 3, 3, lit ? '#ffe39a' : '#bbb'); lampGlow(x0 + 93.5, y0 + 12, 9, lit ? dark : 0);
        plant(x0 + 44, by - 1, 1);
      } else if (layout === 1) {
        // modern loft with kitchen
        R(x0 + 3, y0 + 4, 30, 6, '#ffffff'); for (let i = 0; i < 30; i += 7.5) R(x0 + 3 + i, y0 + 4, 0.5, 6, '#ccc');
        R(x0 + 3, by - 10, 26, 10, '#f0f0f0'); R(x0 + 3, by - 10.8, 26, 1, '#444');
        for (let i = 0; i < 26; i += 6.5) R(x0 + 3 + i, by - 9, 0.5, 9, '#ccc');
        R(x0 + 8, by - 13, 6, 2.5, '#888');
        R(x0 + 30, y0 + 6, 8, by - y0 - 6, '#dfe6ea'); R(x0 + 30, y0 + 14, 8, 0.5, '#aab'); R(x0 + 36.5, y0 + 9, 0.6, 3, '#889');
        R(x0 + 40, by - 8, 2, 8, '#555'); R(x0 + 39, by - 8.5, 4, 1, '#333');
        windowBand(x0 + 46, y0 + 4, 22, 13, skyBot, dark);
        R(x0 + 74, y0 + 8, 18, 10, '#111'); R(x0 + 75, y0 + 9, 16, 8, lit ? '#3d7dd8' : '#222');
        if (inside > 0) seated(x0 + 80, by - 6, id0, 1);
        if (inside > 1) seated(x0 + 85, by - 6, id0 + 1, 1);
        R(x0 + 72, by - 7, 22, 5, '#5a7d9a'); R(x0 + 72, by - 9, 22, 2, '#4d6d88');
        plant(x0 + 67, by - 1, 0.9);
      } else {
        // family home: dining + bunk beds
        windowBand(x0 + 4, y0 + 4, 18, 10, skyBot, dark);
        R(x0 + 40, y0, 0.6, 6, '#555'); R(x0 + 37, y0 + 6, 7, 2.5, '#2c3e50'); lampGlow(x0 + 40.5, y0 + 9, 10, lit ? dark : 0);
        for (let i = 0; i < Math.min(inside, 3); i++) seated(x0 + 32 + i * 8, by - 7, id0 + i, 1);
        R(x0 + 28, y0 + 19, 26, 2, '#8b5a2b'); R(x0 + 30, y0 + 21, 1.2, by - y0 - 21, '#6b4423'); R(x0 + 51, y0 + 21, 1.2, by - y0 - 21, '#6b4423');
        R(x0 + 39, y0 + 17.5, 3, 1.5, '#e74c3c');
        R(x0 + 68, y0 + 6, 1.5, by - y0 - 6, '#8b5a2b'); R(x0 + 89, y0 + 6, 1.5, by - y0 - 6, '#8b5a2b');
        R(x0 + 69, y0 + 11, 20, 3, '#3498db'); R(x0 + 69, y0 + 14, 20, 1, '#8b5a2b');
        R(x0 + 69, by - 6, 20, 3, '#e67e22'); R(x0 + 69, by - 3, 20, 1, '#8b5a2b');
        R(x0 + 58, by - 3, 3, 3, '#f1c40f'); R(x0 + 61, by - 3, 3, 3, '#e74c3c'); R(x0 + 59.5, by - 6, 3, 3, '#2ecc71');
      }
      break;
    }

    case K.HOTEL: {
      lit = occ === 1 && inside > 0;
      const wall = occ === 0 ? '#4c4560' : pick(HOTEL_WALLS, v);
      R(x0, y0, pw, h, wall);
      R(x0, by - 2, pw, 2, occ === 0 ? '#3f3950' : '#7d6b8f');
      const twin = hash(v * 5, 9) < 0.4;
      const blanket = occ === 2 ? '#a0a0a0' : occ === 0 ? '#625a7a' : twin ? '#2a9d8f' : '#7d4fb0';
      R(x0 + 8, y0 + 6, 12, 7, occ === 0 ? '#5d5672' : '#3a3550'); R(x0 + 9, y0 + 7, 10, 5, occ === 0 ? '#6c6582' : '#b39ddb');
      if (twin) {
        for (const bx of [x0 + 5, x0 + 21]) {
          R(bx, by - 8, 13, 4, occ === 0 ? '#8d86a0' : '#fff'); R(bx + 4, by - 8.5, 9, 4.5, blanket);
          R(bx - 1, by - 11, 1.5, 11, '#5b4636'); R(bx + 1, by - 9, 3, 1.5, '#fff');
        }
      } else {
        R(x0 + 6, by - 9, 26, 5, occ === 0 ? '#8d86a0' : '#fff');
        R(x0 + 13, by - 9.5, 19, 5.5, blanket);
        R(x0 + 4, by - 15, 3, 15, '#5b4636');
        R(x0 + 7.5, by - 10.5, 4, 2, '#fff');
        if (occ === 2) { R(x0 + 15, by - 11, 6, 2, '#bdbdbd'); R(x0 + 27, by - 3, 5, 3, '#ffffff'); }
      }
      R(x0 + 34, by - 6, 4, 6, '#5b4636');
      R(x0 + 35, by - 9, 2, 3, lit ? '#ffe39a' : '#999'); lampGlow(x0 + 36, by - 8, 8, lit ? dark : 0);
      if (occ === 1) { R(x0 + 33, by - 13, 4, 5.5, '#c0392b'); R(x0 + 34.2, by - 14.2, 1.6, 1.2, '#333'); }
      break;
    }

    case K.CAFE: {
      lit = open;
      const b = pick(CAFE_BRANDS, v);
      R(x0, y0, pw, h, b.wall);
      R(x0, by - 2, pw, 2, '#8d6e63');
      R(x0, y0, pw, 6, b.awn);
      for (let i = 0; i < pw; i += 8) { R(x0 + i, y0 + 6, 4, 3, b.stripe); R(x0 + i + 4, y0 + 6, 4, 3, b.awn); }
      label(b.name, x0 + 4, y0 + 3.3, '#fff', 4.6);
      // menu board + counter + case + espresso
      R(x0 + 4, y0 + 10.5, 22, 5.5, '#263238');
      for (let i = 0; i < 3; i++) R(x0 + 6, y0 + 11.6 + i * 1.6, 10 + (i % 2) * 6, 0.6, '#cfd8dc');
      R(x0 + 4, by - 11, 24, 11, '#7a4a2a'); R(x0 + 3, by - 12, 26, 1.5, '#4e342e');
      R(x0 + 6, by - 10, 10, 5, 'rgba(190,225,240,0.8)');
      for (let i = 0; i < 4; i++) circle(x0 + 7.5 + i * 2.3, by - 6.2, 0.9, pick(['#f8bbd0', '#ffe082', '#bcaaa4', '#c5e1a5'], hash(i, v)));
      R(x0 + 19, by - 16.5, 6, 4.5, '#b0bec5'); R(x0 + 20, by - 13, 1, 1, '#333');
      if (inside > 0) seated(x0 + 32, by - 7, id0 + 50, 0);
      // tables with diners
      for (let i = 0; i < 4; i++) {
        const tx = x0 + 38 + i * 14.5;
        if (b.lanterns) { R(tx + 4.2, y0 + 9, 0.5, 3, '#555'); circle(tx + 4.5, y0 + 13.5, 2, '#e53935'); R(tx + 3.5, y0 + 15.2, 2, 0.6, '#f6d55c'); }
        else { R(tx + 4.2, y0 + 9, 0.5, 5, '#555'); R(tx + 2.5, y0 + 14, 4, 2, '#37474f'); }
        lampGlow(tx + 4.5, y0 + 15, 9, lit ? dark : 0);
        if (i * 2 < inside - 1) seated(tx - 1.5, by - 6, id0 + i * 2, (i % 3) ? 3 : 0);
        if (i * 2 + 1 < inside - 1) seated(tx + 10.5, by - 6, id0 + i * 2 + 1, 1);
        R(tx, by - 9, 9, 1.6, '#5c4433'); R(tx + 4, by - 7.4, 1, 7.4, '#5c4433');
        R(tx - 3, by - 5, 2, 5, '#a1887f'); R(tx + 10, by - 5, 2, 5, '#a1887f');
        R(tx + 1.5, by - 10.4, 1.6, 1.4, '#fff');
      }
      if (!open) { R(x0, y0 + 9, pw, h - 9, 'rgba(0,0,0,0.3)'); label('CLOSED', x0 + pw - 30, y0 + 13, '#fff', 5); }
      break;
    }

    case K.SHOP: {
      lit = open;
      const b = pick(SHOP_BRANDS, v);
      R(x0, y0, pw, h, b.wall);
      R(x0, by - 2, pw, 2, '#b0a89a');
      R(x0, y0, pw, 6, b.sign);
      label(b.name, x0 + 4, y0 + 3.3, '#fff', 4.6);
      if (b.type === 'clothes') {
        for (const rx of [x0 + 4, x0 + 30]) {
          R(rx, y0 + 10, 22, 0.8, '#666'); R(rx + 1, y0 + 10, 0.8, by - y0 - 10, '#666'); R(rx + 20, y0 + 10, 0.8, by - y0 - 10, '#666');
          for (let g = 0; g < 5; g++) {
            const c = pick(BRIGHT, hash(g, rx + v * 9));
            ctx.fillStyle = c;
            ctx.beginPath(); ctx.moveTo(rx + 3 + g * 3.6, y0 + 11); ctx.lineTo(rx + 1.6 + g * 3.6, y0 + 19); ctx.lineTo(rx + 4.6 + g * 3.6, y0 + 19); ctx.fill();
          }
        }
        R(x0 + 56, y0 + 11, 3, 8, '#f8bbd0'); circle(x0 + 57.5, y0 + 9.5, 1.6, '#eee'); R(x0 + 57, y0 + 19, 1, by - y0 - 19, '#999');
      } else if (b.type === 'tech') {
        for (const sx of [x0 + 6, x0 + 36]) { R(sx, y0 + 9, 20, 9, '#111'); R(sx + 1, y0 + 10, 18, 7, lit ? '#00bcd4' : '#263238'); R(sx + 3, y0 + 12, 8, 1, '#e0f7fa'); }
        for (const tx of [x0 + 4, x0 + 34]) {
          R(tx, by - 9, 24, 2, '#cfd8dc'); R(tx + 2, by - 7, 20, 7, '#eceff1');
          for (let p = 0; p < 5; p++) R(tx + 2 + p * 4.5, by - 10.5, 2, 1.5, '#263238');
        }
      } else if (b.type === 'books') {
        for (let s = 0; s < 3; s++) {
          const sx = x0 + 3 + s * 20;
          R(sx, y0 + 8, 17, by - y0 - 8, '#8d6e63');
          for (let row = 0; row < 4; row++) {
            R(sx, y0 + 8 + row * 5 + 4.2, 17, 0.8, '#5d4037');
            for (let bk = 0; bk < 7; bk++) R(sx + 1 + bk * 2.3, y0 + 9 + row * 5, 1.8, 3.2 + hash(bk, row + s * 4) * 0.8, pick(BRIGHT, hash(bk + row * 7, s + v)));
          }
        }
      } else {
        R(x0 + 4, by - 9, 16, 9, '#6d4c41'); R(x0 + 3, by - 10, 18, 1.5, '#4e342e');
        for (let p = 0; p < 6; p++) {
          const px0 = x0 + 25 + p * 6;
          R(px0, by - 6, 4.5, 6, '#90a4ae');
          for (let fl = 0; fl < 4; fl++) circle(px0 + 1 + (fl % 2) * 2.5, by - 8 - (fl >> 1) * 2.2, 1.3, pick(['#e91e63', '#ffeb3b', '#ff5722', '#ba68c8', '#ffffff'], hash(fl, p + v * 5)));
          R(px0 + 2, by - 8, 0.5, 2, '#558b2f');
        }
        R(x0 + 6, y0 + 10, 10, 6, '#c5e1a5');
      }
      for (let i = 0; i < Math.min(inside, 4); i++) drawPerson(x0 + 12 + i * 13, by, i % 2 ? 3 : 1, id0 + i, i % 2 ? 1 : -1, false, 0);
      if (!open) { R(x0, y0 + 6, pw, h - 6, 'rgba(0,0,0,0.3)'); label('CLOSED', x0 + pw - 30, y0 + 13, '#fff', 5); }
      break;
    }

    case K.PARKING: {
      lit = true;
      R(x0, y0, pw, h, '#3d3f44');
      R(x0, y0 + 2, pw, 1.4, '#6d7178');
      R(x0, by - 2, pw, 2, '#2e3034');
      for (let i = 0; i <= pw; i += 20) R(x0 + i, by - 3, 1, 3, '#d8c33a');
      R(x0 + pw / 2 - 1.5, y0 + 3.4, 3, by - y0 - 3.4, '#55585e');
      R(x0 + 3, y0 + 6, 6, 6, '#1e66c2'); label('P', x0 + 4.3, y0 + 9.2, '#fff', 5);
      for (let i = 0; i < pw; i += 25) R(x0 + i + 6, y0 + 4, 4, 1, lit ? '#e8f4ff' : '#777');
      const busy = min > 450 && min < 1110 ? 0.85 : 0.35;
      const colors = ['#c0392b', '#2980b9', '#ecf0f1', '#27ae60', '#7f8c8d', '#f39c12', '#2c3e50'];
      for (let i = 0; i < pw / 20; i++) {
        if (hash(x * 13 + i, f) > busy) continue;
        const c = colors[(hash(x + i, f + 7) * colors.length) | 0];
        ctx.save(); ctx.translate(x0 + 10 + i * 20, by - 1.5); ctx.scale(0.75, 0.75);
        carSprite(c, 'sedan', 0);
        ctx.restore();
      }
      break;
    }
  }

  // slab + party wall
  R(x0, by, pw, 3, '#4a4f5a');
  R(x0, by, pw, 0.7, '#5d6370');
  R(x0, y0, 0.8, h, 'rgba(0,0,0,0.22)');

  if (dark > 0 && !lit) R(x0, y0, pw, h, `rgba(4,8,22,${0.62 * dark})`);
  else if (dark > 0.3 && lit) R(x0, y0, pw, h, `rgba(255,220,140,${0.08 * dark})`);

  if (evalMode && kind !== K.LOBBY && kind !== K.PARKING) {
    const s = r.sat;
    const col = r.flag ? '255,40,40' : s >= 60 ? '60,140,255' : s >= 35 ? '255,210,60' : '255,60,60';
    R(x0, y0, pw, h, `rgba(${col},0.45)`);
    if (r.flag) label('⚠ NO ACCESS', x0 + 3, y0 + h / 2, '#fff', 7);
  }
}

// ------------------------------------------------------------------ elevators & stairs

function drawTransports(st) {
  const carAt = new Map();
  for (let i = 0; i < cars.length; i += 6) {
    const y = cars[i + 1];
    if (Math.abs(y - Math.round(y)) < 0.05) carAt.set(`${cars[i]}:${Math.round(y)}`, cars[i + 5] > 0);
  }
  for (let i = 0; i < trans.length; i += 7) {
    const ti = trans[i], kind = trans[i + 1], x = trans[i + 2], lo = trans[i + 3], hi = trans[i + 4];
    const x0 = fx(x), sw = 3 * CW;
    if (kind === K.ELEVATOR) {
      const top = fy(hi), bottom = fy(lo) + FH;
      R(x0, top, sw, bottom - top, '#1c1f26');
      R(x0 + 2, top, 1, bottom - top, '#383e4b'); R(x0 + sw - 3, top, 1, bottom - top, '#383e4b');
      for (let f = lo; f <= hi; f++) {
        const y = fy(f);
        R(x0, y + FH - 3, sw, 3, '#4a4f5a');
        // door frame + indicator
        R(x0 + 3.5, y + 6, 1, FH - 9, '#6b7280'); R(x0 + sw - 4.5, y + 6, 1, FH - 9, '#6b7280'); R(x0 + 3.5, y + 5, sw - 7, 1, '#6b7280');
        const here = carAt.get(`${ti}:${f}`);
        circle(x0 + sw / 2, y + 2.8, 1.1, here === undefined ? '#3a3f4a' : here ? '#59d98e' : '#ffb347');
      }
      R(x0 - 1, top - 4, sw + 2, 4, '#5a606c'); R(x0 + sw / 2 - 3, top - 7, 6, 3, '#4a4f5a');
    } else {
      const y0 = fy(lo), h = FH - 3;
      R(x0, y0 - 3, sw, h + 3, 'rgba(40,44,54,0.3)');
      const steps = 9;
      for (let s = 0; s < steps; s++) {
        const sx = x0 + 1 + s * (sw - 2) / steps, sh = (s + 1) * (h + 3) / steps;
        R(sx, y0 + h - sh, (sw - 2) / steps + 0.5, sh, '#8e939d');
        R(sx, y0 + h - sh, (sw - 2) / steps + 0.5, 0.8, '#c3c7cf');
      }
      ctx.strokeStyle = '#d7dbe2'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x0 + 1, y0 + h - 9); ctx.lineTo(x0 + sw - 1, y0 - 12); ctx.stroke();
      for (let p = 0; p < 4; p++) { const px = x0 + 2 + p * (sw - 4) / 3; R(px, y0 + h - 9 - p * (h - 3) / 3 + 0.5, 0.5, 6, '#d7dbe2'); }
      R(x0, y0 + h, sw, 3, '#4a4f5a');
    }
  }
  for (let i = 0; i < cars.length; i += 6) {
    const y = cars[i + 1], n = cars[i + 2], dir = cars[i + 3], x = cars[i + 4], door = cars[i + 5];
    const x0 = fx(x) + 3, y0 = GROUND - (y + 1) * FH + 4, cw = 3 * CW - 6, ch = FH - 8;
    // cable
    let topY = y0;
    for (let t = 0; t < trans.length; t += 7) if (trans[t] === cars[i]) topY = fy(trans[t + 4]) - 4;
    R(x0 + cw / 2 - 0.3, topY, 0.6, y0 - topY, '#555b66');
    R(x0, y0, cw, ch, '#c8ccd6');
    R(x0, y0, cw, 1.2, '#e3e6ec'); R(x0, y0 + ch - 1.2, cw, 1.2, '#9aa0ab');
    R(x0 + 2, y0 + 3, cw - 4, ch - 4, door > 0 ? '#fff4c6' : '#8f95a3');
    if (door <= 0) R(x0 + cw / 2 - 0.3, y0 + 3, 0.6, ch - 4, '#7a808c');
    for (let p = 0; p < Math.min(n, 12); p++) {
      const px = x0 + 3.5 + (p % 6) * 2.4, py = y0 + ch - 1.5 - Math.floor(p / 6) * 4.5;
      R(px - 0.8, py - 3.5, 1.7, 2.6, pick(SHIRT, hash(p, i)));
      R(px - 0.6, py - 5.2, 1.3, 1.6, pick(SKIN, hash(p, i + 3)));
    }
    R(x0 + cw / 2 - 1.5, y0 + 1.2, 3, 1.4, '#22252c');
    R(x0 + cw / 2 - 1, y0 + 1.5, 2, 0.8, dir > 0 ? '#59d98e' : dir < 0 ? '#ff9f43' : '#555');
  }
}

// ------------------------------------------------------------------ people

function drawPerson(px, base, kind, id, dir, moving, trip) {
  const hs = i => hash(id * 13 + i, 977);
  const skin = pick(SKIN, hs(1)), hair = pick(HAIR, hs(2));
  const top = kind === 0 ? pick(SUIT, hs(4)) : pick(SHIRT, hs(4));
  const pants = kind === 0 ? top : pick(PANTS, hs(5));
  const step = moving ? (Math.floor(px / 1.4) & 1) : 0;
  const s = step ? 0.55 : 0;
  // legs + shoes
  R(px - 1.3 - s, base - 4, 1.1, 4, pants); R(px + 0.2 + s, base - 4, 1.1, 4, pants);
  R(px - 1.5 - s, base - 0.8, 1.5, 0.8, '#1a1a1a'); R(px + 0.1 + s, base - 0.8, 1.5, 0.8, '#1a1a1a');
  // arms behind / front
  R(px - 2.2 + (moving ? s : 0), base - 9.1, 0.8, 4.4, top);
  // torso
  R(px - 1.7, base - 9.6, 3.4, 5.8, top);
  if (kind === 0) { R(px - 0.6, base - 9.6, 1.2, 2.2, '#f4f4f4'); R(px - 0.25, base - 9.2, 0.5, 2.8, hs(6) < 0.5 ? '#c0392b' : '#2471a3'); }
  R(px + 1.4 - (moving ? s : 0), base - 9.1, 0.8, 4.4, top);
  R(px + 1.4 - (moving ? s : 0), base - 4.9, 0.8, 0.8, skin);
  // head + hair
  R(px - 1.3, base - 12.8, 2.6, 2.9, skin);
  R(px - 1.45, base - 13.3, 2.9, 1.2, hair);
  const back = dir >= 0 ? px - 1.6 : px + 0.9;
  if (hs(3) < 0.35) R(back, base - 12.6, 0.75, 3.4, hair); else R(back, base - 12.4, 0.6, 1.2, hair);
  if (dir !== 0) R(px + dir * 0.65 - 0.22, base - 11.7, 0.45, 0.55, '#222');
  // accessories
  if (kind === 2) {
    const sx = dir >= 0 ? px - 4 : px + 2.3;
    R(sx, base - 4.2, 1.8, 3.8, '#7d4fb0'); R(sx + 0.5, base - 5, 0.8, 0.8, '#444');
    R(sx + 0.2, base - 0.4, 0.5, 0.4, '#222'); R(sx + 1.1, base - 0.4, 0.5, 0.4, '#222');
  } else if (kind === 3 && hs(7) < 0.6) {
    R(dir >= 0 ? px + 1.7 : px - 3.4, base - 6.2, 1.7, 2.4, pick(['#e91e63', '#ffffff', '#ff9800', '#00897b'], hs(8)));
  }
  // stress bubble (SimTower-style pink → red)
  if (trip > 600) {
    const c = trip > 1000 ? '#ff2a2a' : '#ff7ab6';
    circle(px, base - 16.3, 1.9, c);
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 0.6, base - 14.8); ctx.lineTo(px + 0.4, base - 14.8); ctx.lineTo(px - 0.6, base - 13.8); ctx.fill();
    R(px - 0.25, base - 17.4, 0.5, 1.4, '#fff'); R(px - 0.25, base - 15.6, 0.5, 0.5, '#fff');
  }
}

function drawPeople() {
  for (let i = 0; i < people.length; i += 7) {
    const x = people[i], fl = people[i + 1], kind = people[i + 2], trip = people[i + 3], mode = people[i + 4];
    const id = people[i + 5], dir = people[i + 6];
    drawPerson(fx(0) + x * CW, GROUND - fl * FH - 3, kind, id, dir, mode !== 2 && dir !== 0, trip);
  }
}

// ------------------------------------------------------------------ street life

const CAR_COLORS = ['#c0392b', '#2980b9', '#ecf0f1', '#27ae60', '#7f8c8d', '#2c3e50', '#8e44ad', '#d35400', '#f5f5f5', '#16a085'];
const CAR_TYPES = ['sedan', 'sedan', 'hatch', 'taxi', 'sedan', 'van', 'bus', 'sedan', 'hatch', 'taxi'];

// Draws a vehicle facing +x with its wheels on y = 0 (caller translates / flips).
function carSprite(color, type, dark) {
  const win = '#9cc9e8';
  if (type === 'bus') {
    R(-24, -13, 48, 11.5, color); R(-24, -13, 48, 1.2, '#ffffff55');
    for (let i = 0; i < 7; i++) R(-21 + i * 6.3, -11.2, 5, 4.2, win);
    R(20, -11.2, 3.4, 7.5, win); R(-24, -4.5, 48, 1, '#00000033');
    circle(-15, -1.6, 2, '#1b1b1b'); circle(15, -1.6, 2, '#1b1b1b'); circle(-15, -1.6, 0.8, '#999'); circle(15, -1.6, 0.8, '#999');
  } else if (type === 'van') {
    R(-12, -10.5, 24, 9, color); R(5, -9.5, 6, 3.6, win); R(-10, -9.5, 13, 3.6, win);
    circle(-7, -1.6, 1.9, '#1b1b1b'); circle(7, -1.6, 1.9, '#1b1b1b'); circle(-7, -1.6, 0.7, '#999'); circle(7, -1.6, 0.7, '#999');
  } else {
    const len = type === 'hatch' ? 9 : 11;
    const c = type === 'taxi' ? '#f4c430' : color;
    R(-len, -6, len * 2, 4.5, c);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-len + 4, -6); ctx.lineTo(-len + 6, -9.6); ctx.lineTo(len - 6, -9.6); ctx.lineTo(len - 3, -6); ctx.fill();
    ctx.fillStyle = win;
    ctx.beginPath(); ctx.moveTo(-len + 5.2, -6.3); ctx.lineTo(-len + 6.6, -9); ctx.lineTo(-0.4, -9); ctx.lineTo(-0.4, -6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.4, -6.3); ctx.lineTo(0.4, -9); ctx.lineTo(len - 6.2, -9); ctx.lineTo(len - 4, -6.3); ctx.fill();
    if (type === 'taxi') { R(-2, -11, 4, 1.4, '#222'); R(-1.5, -10.8, 3, 1, '#ffeb3b'); R(-len, -4.4, len * 2, 0.6, '#222'); }
    circle(-len + 4, -1.6, 1.8, '#1b1b1b'); circle(len - 4, -1.6, 1.8, '#1b1b1b');
    circle(-len + 4, -1.6, 0.7, '#9a9a9a'); circle(len - 4, -1.6, 0.7, '#9a9a9a');
  }
  const front = type === 'bus' ? 24 : type === 'van' ? 12 : type === 'hatch' ? 9 : 11;
  R(front - 1, -5, 1.2, 1.5, dark > 0.3 ? '#fff7d1' : '#f5e6a8');
  R(-front, -5, 1, 1.5, '#c0392b');
  if (dark > 0.3) {
    ctx.fillStyle = `rgba(255,236,170,${0.22 * dark})`;
    ctx.beginPath(); ctx.moveTo(front, -4.8); ctx.lineTo(front + 26, 0); ctx.lineTo(front + 26, -9); ctx.fill();
    circle(-front, -4.3, 2.2, `rgba(255,40,40,${0.35 * dark})`);
  }
}

function drawStreet(min, dark, view) {
  const SPAN = WORLD_W + 800;
  const traffic = (min >= 420 && min < 570) || (min >= 1020 && min < 1170) ? 1 : min >= 360 && min < 1320 ? 0.55 : 0.18;
  const walkers = min >= 420 && min < 1260 ? 0.9 : min >= 330 && min < 1350 ? 0.4 : 0.12;

  // street furniture outside the lot
  const left = MARGIN - 70, right = MARGIN + W * CW + 60;
  const shelter = (x) => {
    R(x, GROUND - 16, 1, 16, '#606770'); R(x + 22, GROUND - 16, 1, 16, '#606770');
    R(x - 2, GROUND - 17.5, 27, 2, '#3d5a80'); R(x + 1, GROUND - 15.5, 21, 10, 'rgba(180,215,235,0.35)');
    R(x + 3, GROUND - 6, 17, 1.4, '#5c4433');
    R(x + 26, GROUND - 22, 1, 22, '#606770'); R(x + 23.5, GROUND - 25, 6, 4, '#1e66c2'); label('BUS', x + 23.8, GROUND - 23, '#fff', 2.6);
  };
  shelter(left - 60);
  const hydrant = (x) => { R(x - 1.5, GROUND - 5, 3, 5, '#d32f2f'); R(x - 2.2, GROUND - 3.6, 4.4, 1, '#b71c1c'); circle(x, GROUND - 5, 1.5, '#d32f2f'); };
  hydrant(left + 20); hydrant(right + 40);
  R(right + 90, GROUND - 7, 5, 7, '#2e7d32'); R(right + 89.5, GROUND - 7.5, 6, 1, '#1b5e20');

  for (const lane of [0, 1]) {
    for (let i = lane; i < 32; i += 2) {
      if (hash(i, 31) > traffic) continue;
      const dir = lane ? 1 : -1;
      const spd = 34 + hash(i, 32) * 26;
      let x = (hash(i, 33) * SPAN + streetT * spd * dir) % SPAN;
      if (x < 0) x += SPAN;
      x -= 400;
      if (x < view.x0 - 60 || x > view.x1 + 60) continue;
      const type = pick(CAR_TYPES, hash(i, 34));
      const color = type === 'bus' ? pick(['#e67e22', '#2e86de', '#c0392b'], hash(i, 36)) : pick(CAR_COLORS, hash(i, 35));
      ctx.save();
      ctx.translate(x, GROUND - (lane ? 0 : 1.2));
      const sc = lane ? 1 : 0.88;
      ctx.scale(dir * sc, sc);
      if (!lane) ctx.globalAlpha = 0.9;
      carSprite(color, type, dark);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    if (hash(i, 41) > walkers) continue;
    const dir = hash(i, 42) < 0.5 ? -1 : 1;
    const spd = 7 + hash(i, 43) * 6;
    let x = (hash(i, 44) * SPAN + streetT * spd * dir) % SPAN;
    if (x < 0) x += SPAN;
    x -= 400;
    if (x < view.x0 - 10 || x > view.x1 + 10) continue;
    drawPerson(x, GROUND + 0.5, hash(i, 45) < 0.3 ? 0 : hash(i, 45) < 0.7 ? 1 : 3, 9000 + i, dir, true, 0);
  }
}

// ------------------------------------------------------------------ building shell

function drawShell(grid, min, dark) {
  const at = (cx, f) => (cx >= 0 && cx < W && f >= MIN_F && f <= MAX_F ? grid[(f - MIN_F) * W + cx] : 0);
  // outer walls
  for (let f = MIN_F; f <= MAX_F; f++) {
    for (let cx = 0; cx < W; cx++) {
      if (!at(cx, f)) continue;
      const y = fy(f) - (f >= 0 && !at(cx, f + 1) ? 4 : 0), hh = FH + (f >= 0 && !at(cx, f + 1) ? 4 : 0);
      const wall = f < 0 ? '#5a5248' : '#5b6372', edge = f < 0 ? '#6e655a' : '#8a93a3';
      if (!at(cx - 1, f)) { R(fx(cx) - 3, y, 3, hh, wall); R(fx(cx) - 3, y, 0.8, hh, edge); }
      if (!at(cx + 1, f)) { R(fx(cx + 1), y, 3, hh, wall); R(fx(cx + 1) + 2.2, y, 0.8, hh, edge); }
    }
  }
  // roofs: parapets + rooftop equipment
  let best = null;
  for (let f = 0; f <= MAX_F; f++) {
    let cx = 0;
    while (cx < W) {
      if (!(at(cx, f) && !at(cx, f + 1))) { cx++; continue; }
      const start = cx;
      while (cx < W && at(cx, f) && !at(cx, f + 1)) cx++;
      const len = cx - start, x0 = fx(start), y = fy(f), pw = len * CW;
      R(x0 - 3, y - 4, pw + 6, 4, '#7b8494'); R(x0 - 3, y - 4, pw + 6, 1, '#a3abb8');
      if (!best || f > best.f || (f === best.f && len > best.len)) best = { f, start, len };
      if (f === 0) {
        for (let k = start + 1; k + 2 <= cx; k += 6) plant(fx(k) + 4, y - 4, 0.8);
        continue;
      }
      const style = Math.floor(hash(start, f * 7) * 3);
      if (style === 0) {
        for (let k = start + 1; k + 3 <= cx; k += 7) {
          const ax = fx(k);
          R(ax, y - 11, 15, 7, '#a7b0bb'); R(ax, y - 11, 15, 1, '#c5ccd5');
          ctx.strokeStyle = '#6d7680'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(ax + 4.5, y - 7.5, 2.4, 0, 7); ctx.stroke();
          for (let l = 0; l < 3; l++) R(ax + 9 + l * 1.8, y - 9.5, 0.6, 4, '#7d8690');
        }
      } else if (style === 1) {
        for (let k = start; k + 4 <= cx; k += 5) {
          const ax = fx(k) + 2;
          R(ax + 3, y - 7, 0.8, 3, '#666'); R(ax + 26, y - 7, 0.8, 3, '#666');
          ctx.fillStyle = '#1f3b73';
          ctx.beginPath(); ctx.moveTo(ax, y - 6); ctx.lineTo(ax + 4, y - 12); ctx.lineTo(ax + 34, y - 12); ctx.lineTo(ax + 30, y - 6); ctx.fill();
          ctx.strokeStyle = '#5b7fbf'; ctx.lineWidth = 0.35;
          for (let g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(ax + g * 7.5, y - 6); ctx.lineTo(ax + 4 + g * 7.5, y - 12); ctx.stroke(); }
        }
      } else {
        for (let k = start; k + 1 <= cx; k += 2) {
          circle(fx(k) + 4, y - 6, 3 + hash(k, f) * 1.5, hash(k, f + 1) < 0.5 ? '#3c9a5c' : '#2f7d4a');
        }
        R(fx(start) + 6, y - 6, 1.2, 6, '#5d4037');
      }
      if (len >= 12 && hash(start, f * 3 + 1) < 0.6) {
        const tx = x0 + pw - 30;
        R(tx + 1, y - 18, 1, 14, '#5d4037'); R(tx + 11, y - 18, 1, 14, '#5d4037'); R(tx + 1, y - 11, 11, 0.7, '#5d4037');
        R(tx, y - 28, 13, 10, '#8b5a2b');
        for (let s = 0; s < 3; s++) R(tx, y - 26 + s * 3.4, 13, 0.6, '#6d4520');
        ctx.fillStyle = '#6d4520'; ctx.beginPath(); ctx.moveTo(tx - 1, y - 28); ctx.lineTo(tx + 6.5, y - 33); ctx.lineTo(tx + 14, y - 28); ctx.fill();
      }
    }
  }
  // antenna on the tallest roof
  if (best && best.f >= 3) {
    const mx = fx(best.start) + best.len * CW / 2, y = fy(best.f) - 4;
    const hgt = 22 + best.f * 0.8;
    R(mx - 0.6, y - hgt, 1.2, hgt, '#9aa0a8');
    for (let k = 1; k < 4; k++) R(mx - 3 + k * 0.6, y - hgt * k / 4, 6 - k * 1.2, 0.6, '#9aa0a8');
    const on = Math.floor(performance.now() / 650) % 2 === 0;
    circle(mx, y - hgt - 1, 1.3, on ? '#ff3b3b' : '#7a1d1d');
    if (on && dark > 0.2) circle(mx, y - hgt - 1, 5, `rgba(255,60,60,${0.25 * dark})`);
  }
}

function findRoom(idx) {
  for (let i = 0; i < rooms.length; i += 10) if (rooms[i] === idx) return roomAt(i);
  return null;
}
function roomAt(i) {
  return { idx: rooms[i], kind: rooms[i + 1], x: rooms[i + 2], f: rooms[i + 3], w: rooms[i + 4], occ: rooms[i + 5], sat: rooms[i + 6], inside: rooms[i + 7], flag: rooms[i + 8], visits: rooms[i + 9] };
}
function findTrans(idx) {
  for (let i = 0; i < trans.length; i += 7) if (trans[i] === idx) return { idx, kind: trans[i + 1], x: trans[i + 2], lo: trans[i + 3], hi: trans[i + 4], cars: trans[i + 5], waiting: trans[i + 6] };
  return null;
}

const tip = $('tip');
let ghostMsg = '', ghostBad = false;
function showTip(text, bad) {
  ghostMsg = text || ''; ghostBad = !!bad;
  if (!hover || !text) { tip.style.display = 'none'; return; }
  tip.style.display = 'block';
  tip.textContent = text;
  tip.classList.toggle('bad', !!bad);
  tip.style.left = hover.sx + 16 + 'px';
  tip.style.top = hover.sy + 14 + 'px';
}

function ghostRect(x, f0, f1, wcells, ok) {
  const lo = Math.min(f0, f1), hi = Math.max(f0, f1);
  ctx.fillStyle = ok ? 'rgba(89,217,142,0.35)' : 'rgba(255,90,90,0.35)';
  ctx.strokeStyle = ok ? '#59d98e' : '#ff5a5a';
  ctx.lineWidth = 1.5 / cam.z;
  ctx.fillRect(fx(x), fy(hi), wcells * CW, (hi - lo + 1) * FH);
  ctx.strokeRect(fx(x), fy(hi), wcells * CW, (hi - lo + 1) * FH);
}

function drawGhost() {
  if (!hover || drag?.type === 'pan') { showTip(null); return; }
  const { cx, f } = hover;
  const kind = toolKind();
  if (tool === 'elevator') {
    const x = drag?.type === 'elevator' ? drag.x : placeX(K.ELEVATOR, cx);
    const f0 = drag?.type === 'elevator' ? drag.f0 : f;
    const code = w.place_elevator(x, f0, f, 1);
    const ok = code === 0;
    ghostRect(x, f0, f, 3, ok || (!drag && code === 7));
    if (!drag) showTip(code === 7 || code === 0 ? 'Drag up/down to set floors' : ERR[code], !(code === 7 || code === 0));
    else showTip(ok ? `${floorName(Math.min(f0, f))}–${floorName(Math.max(f0, f))} · ${money(w.last_quote())}` : ERR[code], !ok);
  } else if (kind) {
    const x = placeX(kind, cx);
    const code = w.place(kind, x, f, 1);
    ghostRect(x, f, f, w.kind_width(kind), code === 0);
    showTip(code === 0 ? `${KIND_NAME[kind]} · ${money(w.kind_cost(kind))}` : ERR[code], code !== 0);
  } else if (tool === 'bulldoze' || tool === 'car' || tool === 'inspect') {
    const c = w.cell_at(cx, f);
    if (tool === 'inspect') { showTip(null); return; }
    if (!c) { showTip(tool === 'car' ? ERR[13] : null, true); return; }
    const code = tool === 'bulldoze' ? w.bulldoze(cx, f, 1) : w.add_car(cx, f, 1);
    if (c > 0) { const r = findRoom(c - 1); if (r) ghostRect(r.x, r.f, r.f, r.w, code === 0); }
    else { const t = findTrans(-c - 1); if (t) ghostRect(t.x, t.lo, t.kind === K.STAIRS ? t.lo : t.hi, 3, code === 0); }
    const ok = code === 0;
    showTip(ok ? (tool === 'bulldoze' ? 'Demolish' : `Add car · ${money(w.car_cost())}`) : ERR[code], !ok);
  }
}

const info = $('info');
let infoKey = '';
function updateInfo() {
  if (!hover || (tool !== 'inspect' && !evalMode)) { info.style.display = 'none'; infoKey = ''; return; }
  const c = w.cell_at(hover.cx, hover.f);
  if (!c) { info.style.display = 'none'; infoKey = ''; return; }
  let html = '';
  if (c > 0) {
    const r = findRoom(c - 1);
    if (!r) return;
    const sat = r.sat;
    const satColor = sat >= 60 ? '#5ec2ff' : sat >= 35 ? '#ffd166' : '#ff6b6b';
    const rows = [];
    const row = (a, b) => rows.push(`<div class="row"><span>${a}</span><b>${b}</b></div>`);
    row('Floor', floorName(r.f));
    switch (r.kind) {
      case K.LOBBY: row('Role', 'Entrance & exit'); break;
      case K.OFFICE: row('Status', r.occ ? 'Leased' : 'For lease'); row('Rent', '$3,000 / day'); row('Workers in', `${r.inside} / 6`); break;
      case K.CONDO: row('Status', r.occ ? 'Sold' : 'For sale ($150k)'); row('Residents home', `${r.inside} / 3`); break;
      case K.HOTEL: row('Status', ['Vacant', 'Occupied', 'Needs cleaning'][r.occ]); row('Guests in', `${r.inside} / 2`); break;
      case K.CAFE: case K.SHOP: row('Customers now', r.inside); row('Visits yesterday', r.visits); row('Price', r.kind === K.CAFE ? '$25' : '$45'); break;
      case K.PARKING: row('Income', '$400 / day'); break;
    }
    if (r.kind !== K.LOBBY && r.kind !== K.PARKING) {
      rows.push(`<div class="bar"><i style="width:${sat}%;background:${satColor}"></i></div><div class="row"><span>Satisfaction</span><b>${sat}%</b></div>`);
    }
    if (r.flag) rows.push(`<div class="row" style="color:#ff6b6b">⚠ Can't be reached from the lobby</div>`);
    html = `<h3>${KIND_NAME[r.kind]}</h3>${rows.join('')}`;
  } else {
    const t = findTrans(-c - 1);
    if (!t) return;
    if (t.kind === K.ELEVATOR) {
      html = `<h3>Elevator</h3><div class="row"><span>Serves</span><b>${floorName(t.lo)} – ${floorName(t.hi)}</b></div>
        <div class="row"><span>Cars</span><b>${t.cars} / 6</b></div><div class="row"><span>People waiting</span><b>${t.waiting}</b></div>
        <div class="row" style="margin-top:4px"><span>Long queues? Use “Add Elevator Car”.</span></div>`;
    } else {
      html = `<h3>Stairs</h3><div class="row"><span>Connects</span><b>${floorName(t.lo)} ↔ ${floorName(t.hi)}</b></div>`;
    }
  }
  if (html !== infoKey) { info.innerHTML = html; infoKey = html; }
  info.style.display = 'block';
}

function draw() {
  const t = w.now() / TPM, min = t % 1440;
  const dark = darknessAt(min);
  const [, skyBot] = skyAt(min);
  audio.setNight(dark);
  drawBackground(min, dark);
  setWorldTransform();
  const view = { x0: cam.x, y0: cam.y, x1: cam.x + vw / cam.z, y1: cam.y + vh / cam.z };
  drawSkylineAndGround(min, dark, view);
  drawStreet(min, dark, view);
  if (tool !== 'inspect') drawBuildArea();

  const grid = new Uint8Array(W * (MAX_F - MIN_F + 1));
  const occupiedFloors = new Set();
  const ctxState = { dark, min, skyBot: lerpColor('#bfe3f7', '#1b2440', dark) };
  for (let i = 0; i < rooms.length; i += 10) {
    const r = roomAt(i);
    for (let c = r.x; c < r.x + r.w; c++) grid[(r.f - MIN_F) * W + c] = 1;
    occupiedFloors.add(r.f);
    const x0 = fx(r.x), y0 = fy(r.f);
    if (x0 > view.x1 || x0 + r.w * CW < view.x0 || y0 > view.y1 || y0 + FH < view.y0) continue;
    drawRoom(r, ctxState);
  }
  for (let i = 0; i < trans.length; i += 7) {
    const kind = trans[i + 1], x = trans[i + 2], lo = trans[i + 3], hi = kind === K.STAIRS ? trans[i + 3] : trans[i + 4];
    for (let f = lo; f <= hi; f++) { occupiedFloors.add(f); for (let c = x; c < x + 3; c++) grid[(f - MIN_F) * W + c] = 1; }
  }
  drawShell(grid, min, dark);
  drawTransports(ctxState);
  drawPeople();
  drawFloorLabels(view, occupiedFloors, grid);

  // money popups
  const nowMs = performance.now();
  ctx.font = '600 8px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  popups = popups.filter(p => nowMs - p.t < 1600);
  for (const p of popups) {
    const k = (nowMs - p.t) / 1600;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = p.amt >= 0 ? '#3fe08a' : '#ff6b6b';
    ctx.fillText((p.amt >= 0 ? '+' : '') + short(p.amt), fx(0) + p.x * CW, fy(p.f) + 6 - k * 22);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  drawGhost();
  updateInfo();
}

// ------------------------------------------------------------------ main loop

let last = performance.now();
let saveTimer = 0;
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  pollPad(dt);

  // keyboard panning
  const pan = 600 * dt / cam.z;
  if (keys.has('arrowleft') || keys.has('a')) cam.x -= pan;
  if (keys.has('arrowright') || keys.has('d')) cam.x += pan;
  if (keys.has('arrowup') || keys.has('w')) cam.y -= pan;
  if (keys.has('arrowdown') || keys.has('s')) cam.y += pan;
  cam.x = clamp(cam.x, -200, WORLD_W - 100);
  cam.y = clamp(cam.y, -200, WORLD_H - 100);

  streetT += dt * Math.min(SPEEDS[speed], 4);
  if (speed > 0) {
    acc += dt * TPM * SPEEDS[speed];
    let n = Math.floor(acc);
    acc -= n;
    if (n > 4000) n = 4000;
    if (n > 0) w.step(n);
  }

  w.prepare_render();
  rooms = i32(0); people = f32(1); trans = i32(2); cars = f32(3);
  const pops = f32(4);
  if (popups.length < 120) for (let i = 0; i < pops.length; i += 3) popups.push({ x: pops[i], f: pops[i + 1], amt: pops[i + 2], t: nowMs });
  if (!backdrop) for (let i = 0; i < pops.length; i += 3) audio.sfx(pops[i + 2] >= 500 ? 'cash' : 'coin');

  draw();
  drawAnalogClock();
  updateStatusBar(nowMs);
  pullMessages();

  hudTimer -= dt;
  if (hudTimer <= 0) { updateHud(); hudTimer = 0.15; }

  const day = Math.floor(w.now() / TPM / 1440);
  saveTimer += dt;
  if ((day !== lastDay && lastDay !== -1) || saveTimer > 60) { save(true); saveTimer = 0; }
  lastDay = day;

  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ splash, menus, achievements

let menuMode = null;   // null | 'title' | 'pause'
let menuSpeed = 1;
let confirmNew = false;
let splashGone = false;

function dismissSplash() {
  if (splashGone) return;
  splashGone = true;
  audio.startAudio();
  audio.sfx('start');
  $('splash').classList.add('gone');
}
$('splash').addEventListener('pointerdown', dismissSplash);

function saveSummary() {
  try {
    const d = JSON.parse(store.get() || 'null');
    if (!d || d[0] !== 7771) return null;
    const cash = (d[2] >>> 0) + d[3] * 2 ** 32, ticks = (d[4] >>> 0) + (d[5] >>> 0) * 2 ** 32;
    return `Day ${Math.floor(ticks / TPM / 1440) + 1} · ${'★'.repeat(d[6])} · ${short(cash)}`;
  } catch { return null; }
}

function openMenu(mode) {
  if (mode === 'pause' && menuMode !== 'pause') { menuSpeed = speed || 1; setSpeed(0); }
  menuMode = mode;
  confirmNew = false;
  $('menu-screen').className = 'show ' + mode;
  document.body.classList.toggle('on-title', mode === 'title');
  toolCard.style.display = 'none';
  renderMenu();
}
function closeMenu() {
  if (menuMode !== 'pause') return;
  menuMode = null;
  $('menu-screen').className = '';
  setSpeed(menuSpeed);
}
function leaveTitle() {
  menuMode = null;
  $('menu-screen').className = '';
  document.body.classList.remove('on-title');
  popups = [];
  setSpeed(1);
  refreshLocks();
  updateHud();
}

const MI = {
  resume: '<path d="M8 5.5v13l10-6.5z"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  title: '<path d="M4 11l8-6 8 6M6 9.5V20h12V9.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  quit: '<path d="M14 4H5v16h9M10 12h10M17 8.5l3.5 3.5-3.5 3.5"/>',
  handbook: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
};
const miSvg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${MI[k]}</svg>`;

function renderMenu() {
  const summary = saveSummary();
  const el = $('menu-buttons');
  if (menuMode === 'title') {
    const items = [];
    if (summary) items.push(['continue', 'Continue', summary, 'primary']);
    items.push(['new', 'New Tower', summary ? '' : '$2,000,000 and an empty lot', summary ? '' : 'primary']);
    items.push(['handbook', 'Handbook', 'How to play']);
    items.push(['settings', 'Settings', '']);
    if (native) items.push(['quit', 'Quit', '']);
    el.innerHTML = items.map(([id, text, sub, cls]) =>
      `<button class="titem ${cls || ''}" data-act="${id}"><span>${text}</span>${sub ? `<small>${sub}</small>` : ''}</button>`).join('');
  } else {
    const fsKey = native ? (MAC ? '⌃⌘F' : 'F11') : '';
    const rows = [
      ['resume', 'Resume', 'Esc'], ['save', 'Save Tower', MAC ? '⌘S' : 'Ctrl+S'], '-',
      ['handbook', 'Handbook', 'F1'], ['settings', 'Settings…', ''], ['fullscreen', 'Toggle Full Screen', fsKey], '-',
      ['new', 'New Tower…', ''], ['title', 'Main Menu', ''], ...(native ? [['quit', 'Quit Highrise', MAC ? '⌘Q' : 'Alt+F4']] : []),
    ];
    el.innerHTML = rows.map(r => r === '-' ? '<div class="msep"></div>'
      : `<button class="mrow" data-act="${r[0]}">${miSvg(r[0] === 'continue' ? 'resume' : r[0])}<span>${r[1]}</span><kbd>${r[2]}</kbd></button>`).join('');
  }
  for (const b of el.querySelectorAll('button')) b.onmouseenter = () => audio.sfx('hover');
  const os = native?.deck ? 'Steam Deck' : { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[native?.platform] || 'Web';
  const where = native?.steam?.enabled ? `${os} · Steam · ${native.steam.player}` : os;
  $('menu-foot').textContent = menuMode === 'title' ? `Version 0.1 · ${where}` : (summary ? `Last saved ${summary}` : '');
}

// ------------------------------------------------------------------ sheets

let openSheetEl = null;
function openSheet(id) {
  closeSheet();
  openSheetEl = $(id);
  openSheetEl.classList.add('show');
  $('sheet-backdrop').classList.add('show');
  audio.sfx('click');
}
function closeSheet() {
  if (!openSheetEl) return;
  openSheetEl.classList.remove('show');
  $('sheet-backdrop').classList.remove('show');
  openSheetEl = null;
}
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => { audio.sfx('click'); closeSheet(); };
$('sheet-backdrop').onclick = closeSheet;
$('fsBtn').onclick = () => toggleFullscreen();
$('evalSwitch').onchange = () => { if ($('evalSwitch').checked !== evalMode) toggleEval(); };
$('muteSwitch').onchange = () => { audio.startAudio(); if ($('muteSwitch').checked !== audio.volumes().muted) audio.toggleMute(); syncMute(); };

$('menu-buttons').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  audio.startAudio();
  audio.sfx('click');
  switch (b.dataset.act) {
    case 'continue':
      if (load()) { backdrop = false; centerCamera(); leaveTitle(); log('Welcome back — loaded your saved tower.', 'star'); }
      else log('That save could not be loaded.', 'err');
      break;
    case 'new':
      if ((saveSummary() || menuMode === 'pause') && !confirmNew) {
        confirmNew = true;
        b.classList.add('warn');
        b.querySelector('span').textContent = menuMode === 'title' ? 'Replace your saved tower?' : 'Replace this tower?';
        if (b.querySelector('small')) b.querySelector('small').textContent = 'Click again';
        else b.insertAdjacentHTML('beforeend', menuMode === 'title' ? '<small>Click again</small>' : '');
        return;
      }
      store.clear();
      newGame();
      leaveTitle();
      break;
    case 'resume': closeMenu(); break;
    case 'save': save(false); renderMenu(); break;
    case 'title':
      save(true);
      menuMode = null;
      backdrop = true;
      buildDemo(true, '20:40');
      openMenu('title');
      setSpeed(1);
      break;
    case 'settings': openSheet('settings-sheet'); break;
    case 'handbook': openHandbook(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'quit': save(true); native.quit(); break;
  }
});

function toggleFullscreen() {
  if (native) native.toggleFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

for (const [kind, id] of [['music', 'volMusic'], ['sfx', 'volSfx']]) {
  const input = $(id), out = $(id + 'Out');
  input.value = audio.volumes()[kind];
  out.textContent = Math.round(input.value * 100);
  input.oninput = () => { audio.setVolume(kind, +input.value); out.textContent = Math.round(input.value * 100); };
  input.onchange = () => audio.sfx('click');
}
const SPK = '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/>';
function syncMute() {
  const muted = audio.volumes().muted;
  $('muteBtn').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SPK}${muted ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>' : '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'}</svg>`;
  $('muteBtn').classList.toggle('on', muted);
  $('muteSwitch').checked = muted;
}
$('muteBtn').onclick = () => { audio.startAudio(); audio.toggleMute(); syncMute(); };
syncMute();

const countKind = k => { let n = 0; for (let i = 0; i < rooms.length; i += 10) if (rooms[i + 1] === k) n++; return n; };
const countTrans = k => { let n = 0; for (let i = 0; i < trans.length; i += 7) if (trans[i + 1] === k) n++; return n; };
// IDs must match the achievements defined in Steamworks (see desktop/STEAM.md)
const ACHIEVEMENTS = [
  { id: 'ACH_GRAND_OPENING', name: 'Grand Opening', desc: 'Build your first lobby.', test: () => countKind(K.LOBBY) > 0 },
  { id: 'ACH_GOING_UP', name: 'Going Up', desc: 'Build an elevator.', test: () => countTrans(K.ELEVATOR) > 0 },
  { id: 'ACH_FIRST_TENANT', name: 'Open for Business', desc: 'Welcome your first tenant.', test: () => w.population() > 0 },
  { id: 'ACH_STAR_2', name: 'Rising Star', desc: 'Reach a 2★ rating.', test: () => w.stars() >= 2 },
  { id: 'ACH_STAR_3', name: 'Three-Star Address', desc: 'Reach a 3★ rating.', test: () => w.stars() >= 3 },
  { id: 'ACH_STAR_4', name: 'Skyline Fixture', desc: 'Reach a 4★ rating.', test: () => w.stars() >= 4 },
  { id: 'ACH_STAR_5', name: 'Landmark', desc: 'Reach a 5★ rating.', test: () => w.stars() >= 5 },
  { id: 'ACH_FOOD_COURT', name: 'Food Court', desc: 'Run 5 cafés at once.', test: () => countKind(K.CAFE) >= 5 },
  { id: 'ACH_TYCOON', name: 'Tycoon', desc: 'Have $10,000,000 in the bank.', test: () => w.money() >= 10_000_000 },
];
const achDone = new Set(JSON.parse(localStorage.getItem('highrise-ach') || '[]'));
function checkAchievements() {
  if (backdrop || menuMode || !rooms || location.hash.startsWith('#demo')) return; // demo towers don't earn achievements
  for (const a of ACHIEVEMENTS) {
    if (achDone.has(a.id) || !a.test()) continue;
    achDone.add(a.id);
    localStorage.setItem('highrise-ach', JSON.stringify([...achDone]));
    native?.unlockAchievement(a.id);
    log(`🏆 Achievement unlocked: ${a.name}`, 'star');
    audio.sfx('ding');
  }
}

if (native?.platform === 'darwin') document.body.classList.add('native-mac');
native?.onMenu(act => {
  if (act === 'save') save(false);
  else if (act === 'menu') { if (!menuMode) openMenu('pause'); }
  else if (act === 'mute') { audio.toggleMute(); syncMute(); }
});

// Esc / gamepad B: close the topmost thing, else drop the tool, else open the pause menu.
function goBack() {
  if (openSheetEl) closeSheet();
  else if ($('notif-pop').classList.contains('show')) closeNotifs();
  else if (menuMode) closeMenu();
  else if (tool !== 'inspect') setTool('inspect');
  else openMenu('pause');
}

// ------------------------------------------------------------------ handbook

const hbPages = buildPages({
  w, K, money, platform: { mac: MAC, native: !!native },
  achievements: () => ACHIEVEMENTS.map(a => ({ name: a.name, desc: a.desc, done: achDone.has(a.id) })),
});
let hbPage = 'welcome';
let hbList = hbPages;   // pages matching the search box

function openHandbook(id) {
  if (id) hbPage = id;
  $('hbSearch').value = '';
  hbFilter();
  showHbPage(hbPage);
  openSheet('handbook');
}
function hbFilter() {
  const q = $('hbSearch').value.trim().toLowerCase();
  hbList = q ? hbPages.filter(p => (p.title + ' ' + p.html().replace(/<[^>]+>/g, ' ')).toLowerCase().includes(q)) : hbPages;
  let html = '', group = '';
  for (const p of hbList) {
    if (p.group !== group) { group = p.group; html += `<div class="group-label">${group}</div>`; }
    html += `<button data-page="${p.id}">${p.title}</button>`;
  }
  $('hbNav').innerHTML = html || '<div class="hb-empty">No matches</div>';
  if (q && hbList.length && !hbList.some(p => p.id === hbPage)) showHbPage(hbList[0].id);
  else markHbNav();
}
function showHbPage(id) {
  const p = hbPages.find(p => p.id === id) || hbPages[0];
  hbPage = p.id;
  const main = $('hbMain');
  main.innerHTML = `<h2>${p.title}</h2>${p.html()}`;
  for (const el of main.querySelectorAll('[data-thumb]')) el.appendChild(renderThumb(el.dataset.thumb));
  main.scrollTop = 0;
  markHbNav();
}
function markHbNav() {
  for (const b of $('hbNav').querySelectorAll('button')) b.classList.toggle('on', b.dataset.page === hbPage);
  $('hbNav').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  const i = hbList.findIndex(p => p.id === hbPage);
  $('hbPrev').disabled = i <= 0;
  $('hbNext').disabled = i < 0 || i >= hbList.length - 1;
  $('hbHint').textContent = pad.on ? 'LB / RB turn pages · B closes' : '← → turn pages · Esc closes';
}
function hbStep(d) {
  const i = hbList.findIndex(p => p.id === hbPage);
  const next = hbList[i + d];
  if (next) { audio.sfx('click'); showHbPage(next.id); }
}
$('hbPrev').onclick = () => hbStep(-1);
$('hbNext').onclick = () => hbStep(1);
$('hbSearch').oninput = hbFilter;
$('hbSearch').onkeydown = e => {
  if (e.key === 'Escape') { e.stopPropagation(); e.target.value ? (e.target.value = '', hbFilter()) : closeSheet(); }
  else if (e.key === 'Enter' && hbList.length) showHbPage(hbList[0].id);
};
for (const id of ['hbNav', 'hbMain']) {
  $(id).addEventListener('click', e => { const a = e.target.closest('[data-page]'); if (a) { audio.sfx('click'); showHbPage(a.dataset.page); } });
}

// ------------------------------------------------------------------ gamepad (Steam Deck, Xbox, PlayStation, …)
// A virtual cursor that drives the same code paths as the mouse. Standard mapping:
// 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 View · 9 Menu · 10 L3 · 11 R3 · 12–15 D-pad ↑↓←→

const pad = { on: false, x: 0, y: 0, prev: [], drag: false, focus: null, dpad: -1, dpadT: 0 };
const padCursor = $('padcursor');
let mouseX = innerWidth / 2, mouseY = innerHeight / 2;
const TOOL_CYCLE = ['inspect', ...CATS.flatMap(c => c.tools), 'bulldoze'];

addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (pad.on && (e.movementX || e.movementY)) setPadOn(false);
});

function setPadOn(on) {
  if (on === pad.on) return;
  pad.on = on;
  document.body.classList.toggle('pad', on);
  if (on) { pad.x = mouseX; pad.y = mouseY; padMoved(); }
  else padFocus(null);
  if (openSheetEl?.id === 'handbook') markHbNav();
}

// the open overlay that should own gamepad navigation, if any
function padOverlay() {
  if (openSheetEl) return openSheetEl;
  if ($('notif-pop').classList.contains('show')) return $('notif-pop');
  if (menuMode) return $('menu-screen');
  return null;
}

function padFocus(el) {
  if (el === pad.focus) return;
  if (pad.focus) { pad.focus.classList.remove('pad-focus'); pad.focus.dispatchEvent(new MouseEvent('mouseleave')); }
  pad.focus = el;
  if (el) { el.classList.add('pad-focus'); el.dispatchEvent(new MouseEvent('mouseenter')); }
}

function padMoved() {
  pad.x = clamp(pad.x, 0, vw - 1); pad.y = clamp(pad.y, 0, vh - 1);
  padCursor.style.transform = `translate(${pad.x - 3}px, ${pad.y - 2}px)`;
  const el = document.elementFromPoint(pad.x, pad.y);
  if (el === canvas || pad.drag) { padFocus(null); pointerMove(pad.x, pad.y); }
  else { padFocus(el?.closest('button, a, input, label') || null); if (!drag) hover = null; }
}

// D-pad in menus: jump the cursor to the nearest control in that direction
function padNav(dx, dy) {
  const root = padOverlay();
  if (!root) return;
  if (pad.focus?.matches('input[type=range]') && dx) {
    const r = pad.focus;
    r.value = +r.value + dx * (+r.step || 1);
    r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change'));
    return;
  }
  let best = null, bestScore = Infinity;
  for (const el of root.querySelectorAll('button:not(:disabled), a[data-page], input')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const ex = r.left + r.width / 2 - pad.x, ey = r.top + r.height / 2 - pad.y;
    const along = ex * dx + ey * dy, across = Math.abs(ex * dy) + Math.abs(ey * dx);
    if (along <= 4) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return;
  best.scrollIntoView({ block: 'nearest' });
  const r = best.getBoundingClientRect();
  pad.x = r.left + Math.min(r.width / 2, 24); pad.y = r.top + r.height / 2;
  padMoved();
}

function padPress() {
  const el = document.elementFromPoint(pad.x, pad.y);
  if (!el?.closest('#notif-pop, #notifBtn')) closeNotifs();
  if (el === canvas) { pad.drag = true; pointerDown(pad.x, pad.y, 0); return; }
  const target = el?.closest('button, a, label, input, [data-act]');
  if (!target) return;
  if (target.matches('input[type=search], input[type=text]')) target.focus();
  else target.click();
}

function pollPad(dt) {
  const gp = [...(navigator.getGamepads?.() || [])].find(g => g?.connected);
  if (!gp) return;
  const prev = pad.prev;
  pad.prev = gp.buttons.map(b => b.pressed);
  const held = i => !!gp.buttons[i]?.pressed;
  const pressed = i => held(i) && !prev[i];
  const dz = v => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  const zoom = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
  const active = lx || ly || rx || ry || Math.abs(zoom) > 0.1 || gp.buttons.some(b => b.pressed);
  if (!active) { pad.dpad = -1; return; }
  if (!splashGone) { if (gp.buttons.some((b, i) => b.pressed && !prev[i])) dismissSplash(); return; }
  const wasOn = pad.on;
  setPadOn(true);
  if (!wasOn) return; // first touch just wakes the cursor up
  const overlay = padOverlay();

  // left stick: cursor (quadratic response for precision near the centre)
  if (lx || ly) {
    const mag = Math.hypot(lx, ly), sp = 1100 * dt * mag;
    pad.x += lx * sp; pad.y += ly * sp;
    padMoved();
  }
  // right stick: pan the tower, or scroll the open sheet
  if (rx || ry) {
    if (openSheetEl) { const sc = openSheetEl.querySelector('.hb-main, .sheet-body'); if (sc) sc.scrollTop += ry * 1100 * dt; }
    else if (!overlay) { cam.x += rx * 900 * dt / cam.z; cam.y += ry * 900 * dt / cam.z; if (pad.drag) pointerMove(pad.x, pad.y); }
  }
  if (Math.abs(zoom) > 0.1 && !overlay) zoomAt(pad.x, pad.y, Math.exp(zoom * 2.2 * dt));

  if (pressed(0)) padPress();
  if (!held(0) && pad.drag) { pad.drag = false; pointerUp(); }
  if (pressed(1)) { if (pad.drag) { pad.drag = false; drag = null; } else goBack(); }
  if (pressed(9)) { if (menuMode === 'pause') closeMenu(); else if (!overlay) openMenu('pause'); }
  if (pressed(11)) { if (openSheetEl?.id === 'handbook') closeSheet(); else if (!openSheetEl) openHandbook(); }
  if (openSheetEl?.id === 'handbook') { if (pressed(4)) hbStep(-1); if (pressed(5)) hbStep(1); }

  if (!overlay) {
    if (pressed(2)) setTool('bulldoze');
    if (pressed(3)) setSpeed(speed === 0 ? 1 : 0);
    if (pressed(8)) toggleEval();
    if (pressed(10)) centerCamera();
    if (pressed(4) || pressed(5)) {
      const d = pressed(4) ? -1 : 1, n = TOOL_CYCLE.length;
      for (let i = 1, at = TOOL_CYCLE.indexOf(tool); i < n; i++) {
        const id = TOOL_CYCLE[(at + d * i + n) % n];
        if (toolReq(toolBtns[id].t) <= w.stars()) { audio.sfx('click'); setTool(id); break; }
      }
    }
  }

  // D-pad with key-repeat: menus navigate, in-game ↑↓ = speed, ←→ = build category
  const dir = [12, 13, 14, 15].find(held) ?? -1;
  if (dir !== pad.dpad) { pad.dpad = dir; pad.dpadT = 0.38; }
  else if (dir >= 0 && (pad.dpadT -= dt) <= 0) pad.dpadT = 0.11;
  else return;
  if (dir < 0) return;
  const [dx, dy] = [[0, -1], [0, 1], [-1, 0], [1, 0]][dir - 12];
  if (overlay) padNav(dx, dy);
  else if (dy) setSpeed(clamp(speed - dy, 0, SPEEDS.length - 1));
  else {
    const ci = (CATS.findIndex(c => c.id === activeCat) + dx + CATS.length) % CATS.length;
    const id = CATS[ci].tools.find(t => toolReq(toolBtns[t].t) <= w.stars());
    audio.sfx('click');
    if (id) setTool(id); else setCat(CATS[ci].id);
  }
}

// ------------------------------------------------------------------ status bar

const TOOL_HINT = {
  inspect: 'Hover anything to inspect it · drag to pan',
  lobby: 'Click to place · drag sideways to lay a long lobby',
  office: 'Click to place · drag to paint a row',
  condo: 'Click to place · drag to paint a row',
  hotel: 'Click to place · drag to paint a row',
  cafe: 'Click to place on any floor',
  shop: 'Click to place on any floor',
  parking: 'Click to place in the basement',
  stairs: 'Click to link a floor to the one above',
  elevator: 'Drag up or down to set the floors it serves · drag from a shaft to extend it',
  car: 'Click an elevator shaft to add a car',
  bulldoze: 'Click to demolish · there is no refund',
};
let sbKey = '';
const zoomBy = f => zoomAt(vw / 2, vh / 2, f);
$('zoomIn').onclick = () => zoomBy(1.25);
$('zoomOut').onclick = () => zoomBy(0.8);
$('fitBtn').onclick = () => centerCamera();
$('helpBtn').onclick = () => openHandbook('controls');
function updateStatusBar(now) {
  const name = toolBtns[tool]?.t.name || '';
  let hint;
  if (statusErr && now < statusErrUntil) hint = `<span class="err">${statusErr}</span>`;
  else if (hover && ghostBad && ghostMsg) hint = `<b>${name}</b> — <span class="err">${ghostMsg}</span>`;
  else hint = `<b>${name}</b> — ${TOOL_HINT[tool] || ''}`;
  const loc = hover && hover.f >= MIN_F && hover.f <= MAX_F && hover.cx >= 0 && hover.cx < W ? `${floorName(hover.f)} · column ${hover.cx + 1}` : '';
  const zoom = `${Math.round(cam.z * 100)}%`;
  const key = hint + '|' + loc + '|' + zoom;
  if (key === sbKey) return;
  sbKey = key;
  $('sb-hint').innerHTML = hint;
  $('sb-loc').textContent = loc;
  $('zoomVal').textContent = zoom;
}

// ------------------------------------------------------------------ boot

// index.html#demo builds a sample tower (handy for a quick look); #demo=17:30 picks a time of day
function buildDemo(quiet, time) {
  w.init(1234);
  w.add_money(4e6);
  for (let x = 32; x < 88; x += 4) w.place(K.LOBBY, x, 0, 0);
  for (let f = 1; f <= 10; f++) {
    const kind = f === 3 ? K.CAFE : f >= 8 ? K.CONDO : K.OFFICE;
    for (let x = 32; x < 88;) {
      if (x >= 56 && x < 59) { x = 59; continue; }
      x += w.place(kind, x, f, 0) === 0 ? w.kind_width(kind) : 1;
    }
  }
  w.place_elevator(56, -1, 10, 0);
  w.add_car(56, 0, 0); w.add_car(56, 0, 0);
  w.place(K.STAIRS, 32, 0, 0);
  w.place(K.CAFE, 44, -1, 0);
  const opts = new URLSearchParams(location.hash.slice(1));
  const hhmm = time || opts.get('demo') || '08:20';
  const [hh, mm] = hhmm.split(':').map(Number);
  w.step(20 * 1440 * 2 + ((hh * 60 + mm) - 360) * 20); // run two days, then to the requested time
  w.take_msgs();
  centerCamera();
  const zoom = +opts.get('zoom');
  if (zoom) { // zoom toward the lower-middle of the tower
    const fxC = MARGIN + 60 * CW, fyC = GROUND - 2 * FH;
    cam.z = zoom; cam.x = fxC - vw / 2 / zoom; cam.y = fyC - vh * 0.6 / zoom;
  }
  if (!quiet) log('Demo tower loaded. Open the menu (Esc) to start your own.', 'star');
}

if (location.hash.startsWith('#demo')) {
  buildDemo();
  splashGone = true;
  $('splash').classList.add('gone');
  addEventListener('pointerdown', () => audio.startAudio(), { once: true });
} else {
  backdrop = true;
  buildDemo(true, '20:40');
  openMenu('title');
}
addEventListener('beforeunload', () => save(true));
buildThumbs();
setTool('lobby');
setSpeed(1);
refreshLocks();
updateHud();
requestAnimationFrame(frame);
