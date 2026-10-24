import './style.css';
import './room.css';
import { ITEMS, SHEETS, ROOM } from './room-items.js';
import { sound } from './sound.js';
import { PeelRenderer } from './peel/renderer.js';
import { PeelController } from './peel/controller.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]));
let placed = 0, top = 10;

const app = document.querySelector('#app');
app.innerHTML = `
  <section class="phone-shell room-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-star">⌂</span><span>Cosy Cottage</span></div>
      <div class="top-actions"><a class="help" href="${BASE}index.html" aria-label="Back to the sticker book">✦</a><button class="sound" id="sound" aria-label="Toggle sound"></button><button class="help" id="help-btn" aria-label="How to play">?</button></div>
    </header>
    <section class="intro room-intro">
      <div><p class="eyebrow">BADGER'S LITTLE HOME</p><h1>Furnish the room</h1><p class="hint">Peel a piece off the sheet (Cottage or Kitchen tab) and stick it in the room. Drag a placed piece back onto the sheet to take it away.</p></div>
      <div class="counter"><span id="count">0</span><small>pieces</small></div>
    </section>
    <section class="room-wrap"><div id="room" class="room" style="background-image:url(${ROOM.url})" aria-label="Your cottage room"><div id="empty" class="empty-note room-empty">An empty little room<br/>waiting for you ♡</div></div></section>
    <section class="tray-section">
      <div class="sheet-tabs" role="tablist">${SHEETS.map((s, i) => `<button class="sheet-tab${i ? '' : ' active'}" role="tab" data-sheet="${s.key}">${s.label}</button>`).join('')}</div>
      <div class="tray-title"><span id="sheet-title">${SHEETS[0].title}</span><span>peel &amp; place ✦</span></div>
      <div id="tray" class="sticker-tray room-tray"></div>
    </section>
    <div id="toast" class="toast" role="status"></div>
    <div id="help-sheet" class="help-sheet" aria-hidden="true"><div><button id="close-help">×</button><p class="eyebrow">HOW IT WORKS</p><h2>Peel, place, decorate.</h2><p>Press a piece and pull. It peels away from the sheet the way you drag, then drop it in the room. The newest piece always goes on top. Peel a placed piece to move it, or drop it back on the sheet to remove it. You can use each piece as many times as you like.</p></div></div>
  </section>
  <canvas id="peel-canvas" class="peel-canvas" aria-hidden="true"></canvas>`;

const room = document.querySelector('#room'), tray = document.querySelector('#tray');

function itemEl(def, cls) {
  const el = document.createElement('div');
  el.className = `sticker gloss-sticker ${cls}`; el.dataset.id = def.id;
  el.style.setProperty('--art', `url(${def.url})`); el.style.setProperty('--ar', def.ar);
  el.innerHTML = `<div class="sticker-card"><img class="sticker-art" src="${def.url}" alt="" draggable="false"/><i class="gloss"></i></div><span class="ghost"><i></i></span>`;
  return el;
}

const renderer = new PeelRenderer(document.querySelector('#peel-canvas'));
const records = {};

const roomPx = () => room.getBoundingClientRect();
const placedWidth = (def, rr) => def.w / ROOM.size * rr.width * ROOM.scale;


const controller = new PeelController(renderer, document.querySelector('#peel-canvas'), {
  hide: el => el.classList.add('gl-hidden'),
  show: el => el.classList.remove('gl-hidden'),
  holoPointer: () => ({ x: 0.5, y: 0.5 }),
  targetSize(S) { return S.kind === 'placed' ? 1 : placedWidth(S.rec.def, roomPx()) / S.w; },
  resolveDrop(p, S) {
    const tr = tray.getBoundingClientRect();
    if (S.kind === 'placed' && p.y > tr.top - 10 && p.y < tr.bottom && p.x > tr.left && p.x < tr.right) return { x: p.x, y: p.y, remove: true };
    const rr = roomPx();
    if (p.x < rr.left || p.x > rr.right || p.y < rr.top || p.y > rr.bottom) return null;
    const k = this.targetSize(S), w = S.w * k, h = S.h * k;
    return { x: Math.min(rr.right - w * 0.25, Math.max(rr.left + w * 0.25, p.x)), y: Math.min(rr.bottom - h * 0.2, Math.max(rr.top + h * 0.2, p.y)) };
  },
  commit(S, c) {
    const rr = roomPx(), def = S.rec.def;
    if (c.remove) { S.el.remove(); placed--; document.querySelector('#count').textContent = placed; toast(`${def.name} tucked away`); if (!placed) document.querySelector('#empty').classList.remove('hidden'); return; }
    const k = this.targetSize(S), w = S.w * k, h = S.h * k;
    let el = S.el;
    if (S.kind === 'tray') {
      S.el.classList.remove('gl-hidden');
      el = itemEl(def, 'placed'); el.addEventListener('pointerdown', e => grab(el, 'placed', e));
      room.appendChild(el); placed++; document.querySelector('#count').textContent = placed;
      document.querySelector('#empty').classList.add('hidden'); toast(`${def.name} placed`);
    } else el.classList.remove('gl-hidden');
    el.style.width = `${(w / rr.width) * 100}%`;
    el.style.left = `${((c.x - w / 2 - rr.left) / rr.width) * 100}%`; el.style.top = `${((c.y - h / 2 - rr.top) / rr.height) * 100}%`;
    el.style.zIndex = ++top;                                  // newest placement is always on top
  }
});

function grab(el, kind, e) {
  const rec = records[el.dataset.id]; if (!rec) return;
  if (kind === 'placed') e.preventDefault();
  controller.press(el, kind, rec, e);
}

function buildSlot(def) {
  const slot = document.createElement('div'); slot.className = 'slot';
  const el = itemEl(def, 'source'); el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', `${def.name}`);
  el.addEventListener('pointerdown', e => grab(el, 'tray', e));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quickPlace(el, def); } });
  const name = document.createElement('span'); name.className = 'sticker-name'; name.textContent = def.name;
  slot.append(el, name); return slot;
}

// keyboard / no-WebGL fallback
function quickPlace(el, def) {
  const rr = roomPx(), S = { kind: 'tray', rec: { id: def.id, def }, el, w: el.offsetWidth, h: el.offsetHeight };
  controller.hooks.commit(S, { x: rr.left + rr.width * (0.3 + Math.random() * 0.4), y: rr.top + rr.height * (0.35 + Math.random() * 0.35) });
}

// textures load per tab (and stay loaded), so ~80 pieces don't all sit in GPU memory at once
const loaded = new Set();
function loadSheet(sheet) {
  if (!renderer.ok) return;
  sheet.items.forEach(def => { if (loaded.has(def.id)) return; loaded.add(def.id); renderer.loadSticker(def).then(r => { records[def.id] = r; }).catch(err => { loaded.delete(def.id); console.warn('sprite failed', def.id, err); }); });
}

function showSheet(key) {
  const sheet = SHEETS.find(s => s.key === key);
  tray.replaceChildren(...sheet.items.map(buildSlot)); tray.scrollLeft = 0;
  document.querySelector('#sheet-title').textContent = sheet.title;
  document.querySelectorAll('.sheet-tab').forEach(b => { const on = b.dataset.sheet === key; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  loadSheet(sheet);
}
document.querySelectorAll('.sheet-tab').forEach(b => b.addEventListener('click', () => { if (!controller.busy) showSheet(b.dataset.sheet); }));
if (!renderer.ok) tray.addEventListener('click', e => { const el = e.target.closest('.sticker.source'); if (el) quickPlace(el, byId[el.dataset.id]); });
showSheet(SHEETS[0].key);
// warm the other tabs in the background so switching is instant
setTimeout(() => SHEETS.slice(1).forEach(loadSheet), 2500);

const soundBtn = document.querySelector('#sound');
const paintSound = () => { soundBtn.textContent = sound.enabled ? '♪' : '×'; soundBtn.classList.toggle('off', !sound.enabled); };
paintSound(); soundBtn.onclick = () => { sound.set(!sound.enabled); paintSound(); sound.unlock(); if (sound.enabled) sound.restick(); };
addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true });

let tt; function toast(m) { const t = document.querySelector('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1500); }
document.querySelector('#help-btn').onclick = () => document.querySelector('#help-sheet').classList.add('open');
document.querySelector('#close-help').onclick = () => document.querySelector('#help-sheet').classList.remove('open');
