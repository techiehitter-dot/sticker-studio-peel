// Pack opening: pull the tear strip off the top, slide the wrapper down and away,
// then the stickers on their plastic backing fly onto the shelf and into the library.
import { sound } from './sound.js';
import { track, untrack } from './holo.js';
import './pack.css';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TEAR_AT = 0.5;     // strip must be pulled this far (fraction of pack width) to tear
const SLIDE_AT = 0.45;   // wrapper must travel this far (fraction of pack height) to slide off

const HINTS = {
  sealed: 'Grab the RIP HERE strip and pull it to tear.',
  torn: 'Slide the wrapper down to reveal what’s inside.',
  revealed: 'Your stickers are on a plastic backing. Add them to your library.'
};

function sheetSticker(def) {
  const el = document.createElement('div');
  el.className = 'sticker pk-sticker';
  el.dataset.id = def.id; el.dataset.foil = def.foil;
  el.style.setProperty('--art', `url(${def.url})`); el.style.setProperty('--ar', def.ar);
  el.style.setProperty('--tilt', `${def.tilt}deg`);
  el.innerHTML = `<div class="sticker-card"><img class="sticker-art" src="${def.url}" alt="${def.name} sticker" draggable="false"/><i class="f f1"></i><i class="f f2"></i><i class="f f3"></i></div>`;
  track(el);
  return el;
}

// press-and-drag helper using pointer capture. start() may return false to ignore the press.
function bindDrag(node, { start, move, end }) {
  node.addEventListener('pointerdown', e => {
    if (e.button > 0 || start(e) === false) return;
    node.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const onMove = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; move(dx, dy);
    };
    const onUp = ev => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      end(ev.clientX - sx, ev.clientY - sy, moved);
    };
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  });
}

// peel: { controller, renderer } from the main page. When WebGL is available the strip
// is driven by the sticker peel engine; otherwise it falls back to a plain DOM drag.
export function openPack(pack, { onCollect, peel = null }) {
  const root = document.createElement('div');
  root.className = 'pk-overlay';
  root.dataset.stage = 'sealed';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Open ${pack.name} pack`);
  root.innerHTML = `
    <button class="pk-close" type="button" aria-label="Close">×</button>
    <p class="pk-eyebrow">NEW PACK</p>
    <h2 class="pk-title">${pack.name}</h2>
    <div class="pk-stage">
      <div class="pk-pack">
        <div class="pk-sheet"></div>
        <img class="pk-body" src="${pack.body}" alt="" draggable="false" />
        <div class="pk-strip"><img src="${pack.strip}" alt="" draggable="false" /><span class="pk-sheen"></span></div>
      </div>
    </div>
    <p class="pk-hint" aria-live="polite"></p>
    <button class="pk-next" type="button"></button>
    <div class="pk-shelf">
      <span class="pk-shelf-label">YOUR LIBRARY</span>
      <div class="pk-slots">${pack.stickers.map(() => '<span class="pk-slot"></span>').join('')}</div>
    </div>`;

  const $ = s => root.querySelector(s);
  const packEl = $('.pk-pack'), strip = $('.pk-strip'), body = $('.pk-body');
  const hint = $('.pk-hint'), next = $('.pk-next'), slots = [...root.querySelectorAll('.pk-slot')];
  const sheet = $('.pk-sheet');
  const sheetEls = pack.stickers.map(def => { const el = sheetSticker(def); sheet.appendChild(el); return el; });

  let stage = 'sealed', pull = 0, bodyY = 0, collecting = false, closed = false, peeling = false;
  const packH = () => packEl.clientHeight, packW = () => packEl.clientWidth;

  function setStage(s) {
    stage = s; root.dataset.stage = s; hint.textContent = HINTS[s];
    next.textContent = s === 'sealed' ? 'Tear it open' : s === 'torn' ? 'Slide wrapper off' : 'Add to library';
  }

  // ---- 1. tear the strip ----
  function tear() {
    if (stage !== 'sealed') return;
    setStage('torn');
    sound.peelStop(); sound.detach();
    const w = packW(), h = packH();
    strip.classList.remove('dragging');
    strip.style.transition = 'transform .6s cubic-bezier(.55,0,.8,.45), opacity .6s ease .15s';
    strip.style.transform = `translate(${w * 1.15}px, ${-h * 0.1}px) rotate(22deg)`;
    strip.style.opacity = '0';
    setTimeout(() => { strip.style.display = 'none'; }, 700);
    packEl.classList.add('torn');
  }

  // the pack leans toward the pointer while it sits sealed, and springs back to its spot when let go
  const settle = (instant = false) => {
    if (instant) { packEl.style.transition = 'none'; }
    packEl.classList.remove('tilting'); packEl.style.transform = '';
    if (instant) { void packEl.offsetWidth; packEl.style.transition = ''; }
  };
  const lean = e => {
    if (stage !== 'sealed' || peel?.controller?.busy || strip.classList.contains('dragging') || bodyY > 0) return;
    const r = packEl.getBoundingClientRect();
    const rawX = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), rawY = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    if (Math.abs(rawX) > 1.8 || Math.abs(rawY) > 1.8) return settle();   // well away from the pack: back to its spot
    const dx = clamp(rawX, -1, 1), dy = clamp(rawY, -1, 1);
    packEl.classList.add('tilting');
    packEl.style.transform = `perspective(900px) rotateY(${dx * 9}deg) rotateX(${-dy * 7}deg) translate(${dx * 6}px, ${dy * 4}px)`;
  };
  root.addEventListener('pointermove', lean);
  root.addEventListener('pointerleave', () => settle());
  root.addEventListener('pointerup', () => settle());
  // grabbing the strip must start from the true, untilted pack (the peel engine measures it)
  strip.addEventListener('pointerdown', () => settle(true));

  // the strip uses the sticker peel engine when it is available
  let peelRec = null;
  const stripDef = { id: `${pack.id}-strip`, url: pack.strip, ar: 978 / 183, foil: 'holo' };
  if (peel?.renderer?.ok) {
    // the strip's front is the pack's top; its back is the back of the pack's top
    const backImg = new Image(); backImg.src = pack.stripBack;
    Promise.all([peel.renderer.loadSticker(stripDef), backImg.decode()])
      .then(([r]) => { peel.renderer.attachBack(r, backImg); peelRec = r; })
      .catch(() => {});
  }
  strip.style.setProperty('--tilt', '0deg');
  // a sheet that has fully peeled away drops off screen: the strip is gone, move on to the wrapper
  const onFallen = () => {
    if (stage !== 'sealed') return;
    setStage('torn');
    strip.style.display = 'none';
    packEl.classList.add('torn');
  };
  if (peel?.controller) peel.controller.hooks.fallen = onFallen;

  bindDrag(strip, {
    start(e) {
      if (stage !== 'sealed') return false;
      if (peel?.controller && peelRec) { peel.controller.press(strip, 'pack', peelRec, e); return false; }
      strip.classList.add('dragging');
      peeling = false;
    },
    move(dx, dy) {
      const w = packW();
      const tx = clamp(dx, -w * 0.03, w * 0.95);
      const ty = clamp(dy * 0.3, -w * 0.08, w * 0.08);
      pull = clamp(tx / (w * TEAR_AT), 0, 1.2);
      strip.style.transform = `translate(${tx}px, ${ty}px) rotate(${(tx / w) * 7}deg)`;
      strip.style.setProperty('--pull', Math.min(1, pull).toFixed(3));
      if (!peeling) { peeling = true; sound.peelStart(); }
      sound.peelUpdate(Math.abs(dx) / 30, Math.min(1, pull));
    },
    end() {
      strip.classList.remove('dragging');
      if (!peeling) return;
      sound.peelStop();
      if (pull >= 1) tear();
      else { strip.style.transform = ''; strip.style.removeProperty('--pull'); pull = 0; }
    }
  });

  // ---- 2. slide the wrapper down, off screen ----
  function slideOff() {
    if (stage !== 'torn') return;
    setStage('revealed');
    const top = body.getBoundingClientRect().top;
    const travel = bodyY + (innerHeight - top) + 80;
    body.style.transition = 'transform .55s cubic-bezier(.45,0,.9,.5)';
    body.style.transform = `translateY(${travel}px) rotate(4deg)`;
    sound.stick();
    setTimeout(() => { body.style.visibility = 'hidden'; packEl.classList.add('revealed'); }, 560);
  }

  bindDrag(body, {
    start() {
      if (stage !== 'torn') return false;
      body.classList.add('dragging');
    },
    move(_dx, dy) {
      bodyY = Math.max(0, dy);
      body.style.transform = `translateY(${bodyY}px) rotate(${(bodyY / packH()) * 3}deg)`;
    },
    end() {
      body.classList.remove('dragging');
      if (bodyY >= packH() * SLIDE_AT) slideOff();
      else { body.style.transform = ''; bodyY = 0; }
    }
  });

  // ---- 3. stickers fly from the sheet onto the shelf, then into the library ----
  function collect() {
    if (collecting) return;
    collecting = true; next.hidden = true;
    const flights = sheetEls.map((el, i) => {
      const r = el.getBoundingClientRect(), slot = slots[i].getBoundingClientRect();
      const clone = sheetSticker(pack.stickers[i]);
      clone.classList.add('pk-fly');
      Object.assign(clone.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: '0', zIndex: '2' });
      root.appendChild(clone);
      el.style.visibility = 'hidden';
      const dx = (slot.left + slot.width / 2) - (r.left + r.width / 2);
      const dy = (slot.top + slot.height / 2) - (r.top + r.height / 2);
      const s = slot.width / r.width;
      const anim = clone.animate([
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 46}px) scale(${(1 + s) / 2 + 0.15})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` }
      ], { duration: 760, delay: i * 90, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' });
      return anim.finished.then(() => {
        untrack(clone); clone.remove();
        slots[i].innerHTML = `<img src="${pack.stickers[i].url}" alt="">`;
        slots[i].classList.add('full');
        sound.tick(0.22);
      });
    });
    Promise.all(flights).then(() => finish());
  }

  function finish() {
    setTimeout(() => root.classList.add('closing'), 250);
    setTimeout(() => { if (!closed) { onCollect?.(pack.stickers); cleanup(); } }, 760);
  }

  function cleanup() {
    if (closed) return;
    closed = true;
    if (peel?.controller) peel.controller.hooks.fallen = null;
    sheetEls.forEach(untrack);
    root.remove();
    document.body.style.overflow = '';
    removeEventListener('keydown', onKey);
  }

  next.addEventListener('click', () => {
    if (stage === 'sealed') tear();
    else if (stage === 'torn') slideOff();
    else if (stage === 'revealed') collect();
  });

  // closing after the reveal still keeps the stickers: they were already in your hands
  function close() {
    if (stage === 'revealed' && !collecting) { collecting = true; onCollect?.(pack.stickers); }
    cleanup();
  }
  $('.pk-close').addEventListener('click', close);
  const onKey = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);

  document.body.style.overflow = 'hidden';
  document.body.appendChild(root);
  setStage('sealed');
  next.focus({ preventScroll: true });
  return { close };
}
