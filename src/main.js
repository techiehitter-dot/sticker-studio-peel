import './style.css';
import { STICKERS, UNICORNS, PACKS, BASE, byId } from './stickers.js';
import { initHolo, track, untrack, holoPointer } from './holo.js';
import { PeelRenderer } from './peel/renderer.js';
import { sound } from './sound.js';
import { PeelController } from './peel/controller.js';
import { openPack } from './pack.js';
import { openShop } from './shop.js';
import { PageTurner } from './book.js';
import { Drawer, paintInk, eraseFrom, CRAYON_COLOURS } from './draw.js';
import './library.css';
import './draw.css';

const app = document.querySelector('#app');
// one shell for both views: the menus stay above; the shelf (front page) and the book take turns below them
app.innerHTML = `
  <section class="phone-shell view-shelf" id="root">
    <div class="top">
      <header class="topbar">
        <div class="topbar-banner" aria-hidden="true"></div>
        <button id="open-pack" class="btn-img btn-pill" type="button" aria-label="Open a pack or visit the pack shop"></button>
        <div class="page-nav">
          <button id="prev-page" class="btn-img btn-circle btn-left" type="button" aria-label="Previous page"></button>
          <button id="next-page" class="btn-img btn-circle btn-right" type="button" aria-label="Next page"></button>
        </div>
        <div class="top-actions">
          <button class="btn-img btn-circle btn-draw draw-btn" id="draw-btn" aria-label="Drawing tools" aria-expanded="false"></button>
          <button class="btn-img btn-circle btn-shelf shelf-btn" id="shelf-btn" aria-label="Back to the bookshelf"></button>
          <button class="btn-img btn-circle btn-sound sound" id="sound" aria-label="Toggle sound"></button>
          <button class="btn-img btn-circle btn-help" id="show-help" aria-label="How to play"></button>
        </div>
      </header>
      <aside id="draw-panel" class="draw-panel" aria-label="Drawing tools">
        <div class="panel-grip grip" aria-label="Move the drawing tools" role="button"></div>
        <button class="tool" data-tool="c" aria-label="Crayon" aria-pressed="true"><svg viewBox="0 0 70 22"><path class="s-crayon" d="M4 15 C 16 6, 28 19, 40 10 S 56 13, 66 7"/></svg></button>
        <button class="tool" data-tool="b" aria-label="Blue ballpoint" aria-pressed="false"><svg viewBox="0 0 70 22"><path class="s-ball" d="M4 15 C 16 6, 28 19, 40 10 S 56 13, 66 7"/></svg></button>
        <button class="tool" data-tool="d" aria-label="Drip pen" aria-pressed="false"><svg viewBox="0 0 70 22"><path class="s-drip" d="M4 15 C 16 6, 28 19, 40 10 S 56 13, 66 7"/><path class="s-drip-d" d="M22 13 v5"/></svg></button>
        <button class="tool" data-tool="e" aria-label="Eraser" aria-pressed="false"><svg viewBox="0 0 70 22"><path class="s-erase" d="M24 16 L40 5 L53 11 L37 20 Z"/><path class="s-erase-band" d="M33 17.5 L46 9"/></svg></button>
        <div class="chips">${CRAYON_COLOURS.map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-col="${c}" style="--c:${c}" aria-label="Colour"></button>`).join('')}</div>
      </aside>
      <section id="shelf" class="shelf" aria-label="Bookshelf">
        <div class="shelf-frame">
          <img class="shelf-img" src="${BASE}shelf/bookcase.jpg" alt="" draggable="false"/>
          <button id="open-book" class="shelf-book" type="button" aria-label="Open my kawaii scrapbook"><img src="${BASE}cover/cover.jpg" alt="" draggable="false"/></button>
        </div>
      </section>
      <div class="book-wrap" id="book-wrap">
        <div id="book" class="book">
          <div id="cover" class="cover" aria-label="Front cover"><div id="cover-page" class="cover-stickers"></div></div>
          <div id="page" class="scrapbook-page paper-bg" aria-label="Your sticker page"></div>
          <div id="back-hint" class="back-hint"><span>tap to go back</span></div>
          <button id="turn-hint" class="turn-hint" type="button" aria-label="Turn the page"><i class="corner-dots"></i><span class="finger" aria-hidden="true"><img src="${BASE}ui/hand.png" alt="" draggable="false"/></span></button>
        </div>
      </div>
    </div>
    <div class="dock-slot">
      <section id="dock" class="dock">
        <div id="dock-handle" class="dock-handle" role="button" aria-label="Show all stickers"><i class="grip"></i></div>
        <div id="tray" class="sticker-tray"></div>
        <button id="dock-next" class="dock-next" type="button" aria-label="Next row of stickers"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </section>
    </div>
    <div id="help-sheet" class="help-sheet" aria-hidden="true"><div><button id="close-help" aria-label="Close">×</button><p class="eyebrow">HOW IT WORKS</p><h2>Peel, place, turn.</h2><p>Pull the dock up to see your stickers, a row at a time. Drag one onto the page, and drag it again to move it. Press the pointing finger in the corner to turn the page, or use the arrows at the top. Marks you draw on a sticker travel with it. Open a pack to add stickers to the dock.</p></div></div>
  </section>
  <canvas id="peel-canvas" class="peel-canvas" aria-hidden="true"></canvas>`;

const page = document.querySelector('#page');
// the blue hand shows the first few times the book is turned, then it retires for good
const HAND_TURNS = 3;
let turnCount = +(localStorage.getItem('peel-turns-v1') || 0);
function paintHand() { document.querySelector('.turn-hint .finger')?.classList.toggle('retired', turnCount >= HAND_TURNS); }
const cover = document.querySelector('#cover');
const coverPage = document.querySelector('#cover-page');
// the surface stickers go onto right now: the cover while it is showing, otherwise the sticker page
const live = () => (album.index === 0 ? coverPage : page);
const bookEl = document.querySelector('#book');
const tray = document.querySelector('#tray');
const dock = document.querySelector('#dock');
const dockNext = document.querySelector('#dock-next');
const prevBtn = document.querySelector('#prev-page');
// the ink layer: pen and crayon marks on bare paper. It sits under every sticker.
const ink = document.createElement('canvas'); ink.className = 'ink'; page.appendChild(ink);

// ---------- saved state ----------
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const OWNED_KEY = 'peel-library-v1', BOOK_KEY = 'peel-book-v1', PACK_KEY = 'peel-packs-v1';
const owned = new Set(readJSON(OWNED_KEY, []));
const saved = readJSON(BOOK_KEY, null);
// the book always opens on its front cover (index 0). pages[] are the sticker pages, in order; sheet k is pages[k - 1]
const album = { pages: saved?.pages?.length ? saved.pages : [[]], inks: saved?.inks || [], cover: saved?.cover || [], index: 0 };
const saveOwned = () => { try { localStorage.setItem(OWNED_KEY, JSON.stringify([...owned])); } catch {} };
const saveAlbum = () => { try { localStorage.setItem(BOOK_KEY, JSON.stringify({ pages: album.pages, inks: album.inks, cover: album.cover })); } catch {} };
const curPageIdx = () => album.index - 1;

// packs in stock. A pack you already opened before this version is not in stock.
const packStock = readJSON(PACK_KEY, null) || Object.fromEntries(PACKS.map(p => [p.id, p.stickers.some(s => owned.has(s.id)) ? 0 : 1]));
const savePacks = () => { try { localStorage.setItem(PACK_KEY, JSON.stringify(packStock)); } catch {} };

// ---------- stickers ----------
let zIndex = 20;
function buildSticker(def, cls) {
  const el = document.createElement('div');
  el.className = `sticker ${cls}`; el.dataset.id = def.id; el.dataset.foil = def.foil;
  el.style.setProperty('--art', `url(${def.url})`); el.style.setProperty('--ar', def.ar);
  el.innerHTML = `<div class="sticker-card"><img class="sticker-art" src="${def.url}" alt="" draggable="false"/><i class="f f1"></i><i class="f f2"></i><i class="f f3"></i></div><span class="ghost"><i></i></span>`;
  return el;
}
function stickerEl(def, cls) { const el = buildSticker(def, cls); track(el); return el; }

initHolo();
const renderer = new PeelRenderer(document.querySelector('#peel-canvas'));
const records = {};

const hide = el => el.classList.add('gl-hidden');
const show = el => el.classList.remove('gl-hidden');

const controller = new PeelController(renderer, document.querySelector('#peel-canvas'), {
  hide, show, holoPointer,
  gain: 2.4,   // finger travel -> peel travel: a sticker lets go after a shorter pull, so the screen edge is not reached first
  targetSize(S) {
    if (S.kind === 'placed') return 1;
    const pw = live().getBoundingClientRect().width, max = Math.min(150, Math.max(96, pw * 0.27));
    return max / Math.max(S.w, S.h);
  },
  resolveDrop(p, S) {
    const pr = live().getBoundingClientRect();
    if (p.x < pr.left || p.x > pr.right || p.y < pr.top || p.y > pr.bottom) return null;
    const sz = S.w * this.targetSize(S), szh = S.h * this.targetSize(S);
    return { x: Math.min(pr.right - sz * 0.3, Math.max(pr.left + sz * 0.3, p.x)), y: Math.min(pr.bottom - szh * 0.3, Math.max(pr.top + szh * 0.3, p.y)) };
  },
  commit(S, c) {
    const pr = live().getBoundingClientRect(), s = this.targetSize(S), w = S.w * s, h = S.h * s;
    let el = S.el;
    if (S.kind === 'tray') {
      el = stickerEl(S.rec.def, 'placed'); el._ink = []; el.style.setProperty('--tilt', `${byId[S.rec.id].tilt / 2}deg`);
      el.addEventListener('pointerdown', e => grab(el, 'placed', e));
      live().appendChild(el);
      S.el.classList.add('used'); S.el.classList.remove('gl-hidden'); S.el.setAttribute('aria-disabled', 'true');
    } else el.classList.remove('gl-hidden');
    el.style.width = `${(w / pr.width) * 100}%`;
    el.style.left = `${((c.x - w / 2 - pr.left) / pr.width) * 100}%`; el.style.top = `${((c.y - h / 2 - pr.top) / pr.height) * 100}%`;
    el.style.zIndex = ++zIndex;
    el.classList.remove('glint'); void el.offsetWidth; el.classList.add('glint');
    burst(c.x, c.y);
    paintStickerInk(el);
    saveCurrentPage();
  }
});

// a second controller for pack strips: same peel engine, but a detached strip falls away
const packPeel = new PeelController(renderer, document.querySelector('#peel-canvas'), {
  hide, show,
  holoPointer: () => ({ x: 0.5, y: 0.5 }),
  targetSize: () => 1,
  resolveDrop: () => null,
  commit() {},
  falls: true,
  gain: 2.4
});

const soundBtn = document.querySelector('#sound');
const paintSound = () => { soundBtn.textContent = sound.enabled ? '♪' : '×'; soundBtn.classList.toggle('off', !sound.enabled); };
paintSound();
soundBtn.onclick = () => { sound.set(!sound.enabled); paintSound(); sound.unlock(); if (sound.enabled) sound.restick(); };
addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true });

function grab(el, kind, e) {
  if (kind === 'placed') el.style.zIndex = ++zIndex;
  const rec = records[el.dataset.id]; if (!rec) return;
  if (kind === 'placed') e.preventDefault();
  controller.press(el, kind, rec, e);
}

// ---------- the dock: stickers are laid out in rows of four. Closed, the rows run on as one strip; open, one row shows ----------
let lastRow = null;
function slotRow() {
  if (!lastRow || lastRow.children.length >= 4) { lastRow = document.createElement('div'); lastRow.className = 'row'; tray.appendChild(lastRow); }
  return lastRow;
}
function addSource(def) {
  const wrap = document.createElement('div'); wrap.className = 'slot';
  const el = stickerEl(def, 'source'); el.style.setProperty('--tilt', `${def.tilt}deg`);
  el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', `${def.name} sticker`);
  el.addEventListener('pointerdown', e => { if (!el.classList.contains('used')) grab(el, 'tray', e); });
  el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !el.classList.contains('used')) { e.preventDefault(); quickPlace(el, def); } });
  wrap.append(el); slotRow().appendChild(wrap);
  if (renderer.ok) renderer.loadSticker(def).then(r => { records[def.id] = r; }).catch(err => console.warn('sticker failed', def.id, err));
  return wrap;
}
// a sticker is "used" once it is on any page; it then sits in the dock as a ghost
function refreshUsed() {
  const used = new Set([...album.pages.flat(), ...(album.cover || [])].map(s => s.id));
  document.querySelectorAll('.sticker.source').forEach(el => {
    const u = used.has(el.dataset.id);
    el.classList.toggle('used', u); el.setAttribute('aria-disabled', String(u));
  });
}

STICKERS.forEach(addSource);
UNICORNS.filter(d => owned.has(d.id)).forEach(addSource);
refreshUsed();
if (!renderer.ok) tray.addEventListener('click', e => { const el = e.target.closest('.sticker.source'); if (el && !el.classList.contains('used')) quickPlace(el, byId[el.dataset.id]); });

// keyboard / no-WebGL fallback: drop the sticker somewhere on the page
function quickPlace(el, def) {
  const pr = live().getBoundingClientRect(), rec = { id: def.id, def }, S = { kind: 'tray', rec, el, w: el.offsetWidth, h: el.offsetHeight };
  controller.hooks.commit(S, { x: pr.left + pr.width * (0.25 + Math.random() * 0.5), y: pr.top + pr.height * (0.25 + Math.random() * 0.5) });
}

// ---------- placed stickers and their own ink ----------
// A sticker's geometry, from its percentages within the page it sits on
function geomOf(s) {
  const P = s.parentElement, PW = P.clientWidth, PH = P.clientHeight;
  const def = byId[s.dataset.id];
  const w = parseFloat(s.style.width) / 100 * PW, h = w / def.ar;
  const left = parseFloat(s.style.left) / 100 * PW, top = parseFloat(s.style.top) / 100 * PH;
  const th = (parseFloat(s.style.getPropertyValue('--tilt')) || 0) * Math.PI / 180;
  return { def, w, h, cx: left + w / 2, cy: top + h / 2, c: Math.cos(th), sn: Math.sin(th) };
}
// a point on the page, as a point in the sticker's own box (in px of that box, of size W x H)
function localIn(s, x, y, W, H) {
  const g = geomOf(s), dx = x - g.cx, dy = y - g.cy;
  const u = (g.c * dx + g.sn * dy) / g.w + 0.5, v = (-g.sn * dx + g.c * dy) / g.h + 0.5;
  return [u * W, v * H];
}
// the sticker's ink canvas, sized to its box and repainted when the box changes size
function stickerInkCtx(el) {
  const W = el.offsetWidth, H = el.offsetHeight;
  if (!W || !H) return null;
  let cv = el._inkCv;
  if (!cv) { cv = el._inkCv = document.createElement('canvas'); cv.className = 'sticker-ink'; el.querySelector('.sticker-card').appendChild(cv); }
  const d = Math.min(2, window.devicePixelRatio || 1), pw = Math.round(W * d), ph = Math.round(H * d);
  const ctx = cv.getContext('2d');
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw; cv.height = ph; ctx.setTransform(d, 0, 0, d, 0, 0);
    paintInk(ctx, el._ink || [], W, H);
  }
  return { ctx, W, H };
}
function paintStickerInk(el) { if (el._ink?.length || el._inkCv) stickerInkCtx(el); }
// repaint a sticker's ink from its strokes (after erasing)
function repaintStickerInk(el) { const c = stickerInkCtx(el); if (c) paintInk(c.ctx, el._ink || [], c.W, c.H); }
function paintAllInk(root) { root.querySelectorAll('.sticker.placed').forEach(paintStickerInk); }
// the frame the drawer paints into when a stroke is on a sticker
function stickerFrame(el) {
  const c = stickerInkCtx(el); if (!c) return null;
  el._ink ||= [];
  return { ctx: c.ctx, W: c.W, H: c.H, list: el._ink, local: p => localIn(el, p[0], p[1], c.W, c.H) };
}
// the frame the drawer paints into for bare paper
function pageFrame() {
  const pr = page.getBoundingClientRect();
  return { ctx: ink.getContext('2d'), W: pr.width, H: pr.height, list: (album.inks[curPageIdx()] ||= []), local: p => p };
}
// the alpha of a placed sticker at a page point (its own solid silhouette, rotated)
const alphaCache = new Map();
function alphaOf(def) {
  if (alphaCache.has(def.id)) return alphaCache.get(def.id);
  const rec = records[def.id]; if (!rec) return null;
  const w = 96, h = Math.round(96 / def.ar);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d'); cx.drawImage(rec.img, 0, 0, w, h);
  const m = { w, h, data: cx.getImageData(0, 0, w, h).data };
  alphaCache.set(def.id, m); return m;
}
// the topmost placed sticker whose solid part is under (x, y), or null
function stickerHit(x, y) {
  let best = null, bz = -Infinity;
  for (const s of live().querySelectorAll(':scope > .sticker.placed')) {
    const g = geomOf(s), m = alphaOf(g.def); if (!m) continue;
    const dx = x - g.cx, dy = y - g.cy;
    const u = (g.c * dx + g.sn * dy) / g.w + 0.5, v = (-g.sn * dx + g.c * dy) / g.h + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    if (m.data[(Math.floor(v * (m.h - 1)) * m.w + Math.floor(u * (m.w - 1))) * 4 + 3] > 100) {
      const z = +s.style.zIndex || 0;
      if (z > bz) { bz = z; best = s; }
    }
  }
  return best;
}

// ---------- pages ----------
// the state of the live page's stickers, with each sticker's own ink carried along
function readPage(el) {
  return [...el.querySelectorAll(':scope > .sticker.placed')].map(s => ({
    id: s.dataset.id, x: parseFloat(s.style.left), y: parseFloat(s.style.top),
    w: parseFloat(s.style.width), tilt: parseFloat(s.style.getPropertyValue('--tilt')) || 0,
    ink: s._ink || []
  }));
}
function placedEl(item, interactive) {
  const def = byId[item.id]; if (!def) return null;
  const el = buildSticker(def, 'placed' + (interactive ? '' : ' static'));
  el._ink = item.ink || [];
  if (interactive) track(el);
  el.style.left = `${item.x}%`; el.style.top = `${item.y}%`; el.style.width = `${item.w}%`;
  el.style.setProperty('--tilt', `${item.tilt}deg`); el.style.zIndex = ++zIndex;
  if (interactive) el.addEventListener('pointerdown', e => grab(el, 'placed', e));
  return el;
}
// the live page: stickers are interactive
function renderLivePage(items) {
  page.querySelectorAll(':scope > .sticker').forEach(s => { untrack(s); s.remove(); });
  items.forEach(item => { const s = placedEl(item, true); if (s) page.appendChild(s); });
  setFolio(page, album.index);
  repaintInk(ink, album.inks[curPageIdx()] || []);
  paintAllInk(page);
}
// the page ink canvas is the size of the page; painted from the page's strokes (stored in % so it survives resizes)
function repaintInk(canvas, strokes) {
  const r = page.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
  const ctx = canvas.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
  paintInk(ctx, strokes, r.width, r.height);
}
// the turned pages, face-down to the left of the spine, stacked
function renderRest() {
  bookEl.querySelectorAll('.rest-leaf').forEach(n => n.remove());
  for (let k = 0; k < album.index; k++) {
    const leaf = document.createElement('div');
    leaf.className = 'rest-leaf';
    leaf.style.marginRight = `${0.6 * (album.index - k)}px`;   // a little thickness per turned page
    bookEl.insertBefore(leaf, bookEl.firstChild);
  }
}
function setFolio(el, n) {
  let f = el.querySelector(':scope > .folio');
  if (!f) { f = document.createElement('span'); f.className = 'folio'; el.appendChild(f); }
  f.textContent = n;
}
// a sheet that is not on the live page: a static copy of sticker page i
function staticPage(i) {
  const el = document.createElement('div'); el.className = 'scrapbook-page paper-bg static';
  (album.pages[i] || []).forEach(item => { const s = placedEl(item, false); if (s) el.appendChild(s); });
  const c = document.createElement('canvas'); c.className = 'ink'; el.appendChild(c);
  repaintInk(c, album.inks[i] || []);
  setFolio(el, i + 1);
  return el;
}
// the cover's stickers: interactive while the cover is showing
function renderCoverStickers(items) {
  coverPage.querySelectorAll(':scope > .sticker').forEach(s => { untrack(s); s.remove(); });
  items.forEach(item => { const s = placedEl(item, true); if (s) coverPage.appendChild(s); });
  paintAllInk(coverPage);
}
// the cover as a sheet in the book: a static copy with its stickers, for when it is turned
function makeCover() {
  const c = document.createElement('div'); c.className = 'cover';
  const layer = document.createElement('div'); layer.className = 'cover-stickers static';
  (album.cover || []).forEach(item => { const s = placedEl(item, false); if (s) layer.appendChild(s); });
  c.appendChild(layer);
  return c;
}
function saveCurrentPage() {
  if (album.index === 0) { album.cover = readPage(coverPage); saveAlbum(); refreshUsed(); return; }
  album.pages[curPageIdx()] = readPage(page);
  saveAlbum(); refreshUsed();
}

// one sheet's front: sheet 0 is the cover; sheet k is sticker page k - 1
const turner = new PageTurner({
  book: bookEl,
  sheetDom: k => (k === 0 ? makeCover() : staticPage(k - 1)),
  mount: paintAllInk,
  setLiveHidden: hide => { cover.style.visibility = hide ? 'hidden' : ''; page.style.visibility = hide ? 'hidden' : ''; },
  getIndex: () => album.index,
  canTurn: () => !drawer.active,
  onTurn(i) {
    turnCount++; try { localStorage.setItem('peel-turns-v1', String(turnCount)); } catch {}
    paintHand();
    album.index = i;
    while (album.pages.length < i) album.pages.push([]);   // turning past the last page adds a blank one
    renderSpread();
  }
});

function renderSpread() {
  const onCover = album.index === 0;
  cover.style.visibility = onCover ? '' : 'hidden';
  page.style.visibility = onCover ? 'hidden' : '';
  if (onCover) renderCoverStickers(album.cover || []);
  else renderLivePage(album.pages[curPageIdx()] || []);
  renderRest();
  bookEl.classList.toggle('has-back', album.index > 0);
  prevBtn.disabled = album.index === 0;
}

document.querySelector('#turn-hint').onclick = () => turner.forward();
document.querySelector('#back-hint').onclick = () => turner.back();
document.querySelector('#next-page').onclick = () => turner.forward();
prevBtn.onclick = () => turner.back();
// a tap on the turned pages brings the most recent one back
bookEl.addEventListener('click', e => { if (e.target.closest('.rest-leaf')) turner.back(); });
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') turner.forward();
  if (e.key === 'ArrowLeft') turner.back();
});

// ---------- drawing: crayons can't mark stickers, the others can ----------
const ERASE_R = 14;   // the eraser reaches 14px around the point
// erase the ink under p: the page's own strokes, and the ink of any sticker the eraser is over
function eraseAt(p) {
  let changed = false;
  const pf = pageFrame();
  if (eraseFrom(pf.list, p, pf.W, pf.H, ERASE_R)) { changed = true; repaintInk(ink, pf.list); }
  for (const el of live().querySelectorAll(':scope > .sticker.placed')) {
    const g = geomOf(el);
    if (Math.hypot(p[0] - g.cx, p[1] - g.cy) > Math.max(g.w, g.h) / 2 + ERASE_R) continue;   // quick reject
    const f = stickerFrame(el); if (!f) continue;
    if (eraseFrom(f.list, localIn(el, p[0], p[1], f.W, f.H), f.W, f.H, ERASE_R)) { changed = true; repaintStickerInk(el); }
  }
  return changed;
}
const drawer = new Drawer({ canvas: ink, page, pageFrame, stickerFrame, hitAt: stickerHit, commit: saveCurrentPage, eraseAt });
const drawBtn = document.querySelector('#draw-btn'), panel = document.querySelector('#draw-panel');
function setDrawing(on) {
  drawer.active = on;
  document.body.classList.toggle('drawing', on);
  panel.classList.toggle('open', on);
  drawBtn.setAttribute('aria-expanded', String(on));
}
drawBtn.onclick = () => setDrawing(!drawer.active);
panel.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
  drawer.tool = b.dataset.tool;
  panel.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  panel.classList.toggle('ballpoint', drawer.tool === 'b');   // the ballpoint is blue: no colours
  panel.classList.toggle('eraser', drawer.tool === 'e');     // the eraser has no colour
});
panel.querySelectorAll('[data-col]').forEach(b => b.onclick = () => {
  drawer.col = b.dataset.col;
  panel.querySelectorAll('[data-col]').forEach(x => x.classList.toggle('on', x === b));
});

// the drawing tools can be picked up by their grip and moved about the page; they stay inside the top area
const panelGrip = panel.querySelector('.panel-grip');
panelGrip.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  e.preventDefault(); panelGrip.setPointerCapture(e.pointerId);
  const area = panel.offsetParent, x0 = e.clientX, y0 = e.clientY;
  const startL = panel.offsetLeft, startT = panel.offsetTop;
  const move = ev => {
    const l = Math.min(area.clientWidth - panel.offsetWidth, Math.max(0, startL + ev.clientX - x0));
    const t = Math.min(area.clientHeight - panel.offsetHeight, Math.max(0, startT + ev.clientY - y0));
    panel.classList.add('moved'); panel.style.left = `${l}px`; panel.style.top = `${t}px`;
  };
  const up = () => { panelGrip.removeEventListener('pointermove', move); panelGrip.removeEventListener('pointerup', up); panelGrip.removeEventListener('pointercancel', up); };
  panelGrip.addEventListener('pointermove', move);
  panelGrip.addEventListener('pointerup', up);
  panelGrip.addEventListener('pointercancel', up);
});

// ---------- packs and the shop ----------
const openBtn = document.querySelector('#open-pack');
const packsLeft = () => PACKS.filter(p => (packStock[p.id] || 0) > 0);
function paintPackButton() {
  const shop = packsLeft().length === 0;
  openBtn.dataset.mode = shop ? 'shop' : 'open';
}
openBtn.onclick = () => {
  const avail = packsLeft();
  if (!avail.length) {
    openShop({
      packs: PACKS,
      onBuy(pack) { packStock[pack.id] = (packStock[pack.id] || 0) + 1; savePacks(); paintPackButton(); }
    });
    return;
  }
  const pack = avail[0];
  packStock[pack.id]--; savePacks(); paintPackButton();
  openPack(pack, { onCollect: collectPack, peel: { controller: packPeel, renderer } });
};

function collectPack(defs) {
  const fresh = defs.filter(d => !owned.has(d.id));
  if (!fresh.length) return;
  fresh.forEach(d => owned.add(d.id)); saveOwned();
  const wraps = fresh.map(addSource);
  refreshUsed();
  wraps.forEach(w => w.classList.add('fresh'));
  // bring the first new sticker into view: its row when the dock is open, its place in the strip when closed
  tray.scrollTo({ left: wraps[0].parentElement.offsetLeft, behavior: 'smooth' });
  updateDockNext();
}

// ---------- the shelf: the front page. Opening the cover turns the view to the book, which opens on its cover ----------
const root = document.querySelector('#root');
const openBookBtn = document.querySelector('#open-book');
let opening = false;
function showBook() {
  album.index = 0; renderSpread();            // the book always opens on its front cover
  root.classList.remove('view-shelf'); root.classList.add('view-book');
  openBookBtn.classList.remove('lifting'); opening = false;
  setDockVar(); updateDockNext();
}
function showShelf() {
  root.classList.remove('view-book'); root.classList.add('view-shelf');
  dock.classList.remove('open');
  if (drawer.active) setDrawing(false);
}
openBookBtn.onclick = () => {
  if (opening) return;
  opening = true; openBookBtn.classList.add('lifting');
  setTimeout(showBook, 420);
};
document.querySelector('#shelf-btn').onclick = showShelf;

// ---------- help ----------
document.querySelector('#show-help').onclick = () => document.querySelector('#help-sheet').classList.add('open');
document.querySelector('#close-help').onclick = () => document.querySelector('#help-sheet').classList.remove('open');

// little dots that burst out when a sticker lands
function burst(x, y) {
  for (let i = 0; i < 8; i++) {
    const dot = document.createElement('b');
    dot.className = 'burst';
    dot.style.left = `${x}px`; dot.style.top = `${y}px`;
    dot.style.setProperty('--dx', `${(Math.random() - .5) * 110}px`); dot.style.setProperty('--dy', `${(Math.random() - .5) * 110}px`);
    document.body.appendChild(dot); setTimeout(() => dot.remove(), 700);
  }
}

// ---------- the dock: pull its handle up and the whole panel slides with the finger. The stickers never change size
// or re-flow: the dock is always its open height, and only its transform moves. ----------
const DOCK_OPEN_H = 118, DOCK_CLOSED_H = 62;          // the open panel; the strip that shows when closed
const dockHide = () => DOCK_OPEN_H - DOCK_CLOSED_H;   // how far the panel sits below its open place when closed
const clamp01 = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function updateDockNext() {
  const more = tray.scrollLeft + tray.clientWidth < tray.scrollWidth - 6;
  dockNext.classList.toggle('show', dock.classList.contains('open') && more);
}
tray.addEventListener('scroll', updateDockNext, { passive: true });
dockNext.onclick = () => tray.scrollBy({ left: tray.clientWidth, behavior: 'smooth' });

function bindDockHandle(handle) {
  handle.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    handle.setPointerCapture(e.pointerId);
    const y0 = e.clientY, startOff = dock.classList.contains('open') ? 0 : dockHide();
    let moved = false, off = startOff;
    const move = ev => {
      const dy = ev.clientY - y0;
      if (!moved && Math.abs(dy) < 6) return;
      moved = true;
      off = clamp01(startOff + dy, 0, dockHide());          // 0 = fully open, dockHide() = closed
      dock.classList.add('dragging'); dock.style.transform = `translate3d(0, ${off}px, 0)`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      const open = moved ? off < dockHide() / 2 : !dock.classList.contains('open');   // a tap toggles
      // hand the panel from the finger to its resting place with the transition on, so it never jumps
      dock.classList.remove('dragging');
      void dock.offsetHeight;
      dock.style.transform = `translate3d(0, ${open ? 0 : dockHide()}px, 0)`;
      dock.classList.toggle('open', open);
      updateDockNext(); setTimeout(updateDockNext, 520);
      setTimeout(() => { if (!dock.classList.contains('dragging')) dock.style.transform = ''; }, 520);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}
bindDockHandle(document.querySelector('#dock-handle'));

// ---------- start: the book opens on its cover ----------
const setDockVar = () => { document.documentElement.style.setProperty('--dock-open', `${DOCK_OPEN_H}px`); document.documentElement.style.setProperty('--dock-hide', `${dockHide()}px`); };
setDockVar();
addEventListener('resize', () => {
  setDockVar(); updateDockNext();
  repaintInk(ink, album.inks[curPageIdx()] || []);
  paintAllInk(page); paintAllInk(coverPage);
});
renderSpread();
paintPackButton();
paintHand();
