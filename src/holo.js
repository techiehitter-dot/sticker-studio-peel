// Pointer / motion driven holographic foil for DOM stickers.
// Technique (after simeydotme's pokemon-cards-css, re-implemented): pointer position becomes a set of CSS
// variables; stacked blend-mode layers (rainbow, sparkle, glare) and a small 3D tilt read them.
const els = new Set();
let ambient = { x: 0.5, y: 0.5, live: false };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeSparkleTile() {
  const n = 160, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const x = rnd() * n, y = rnd() * n, r = 0.7 + rnd() * 1.7, a = 0.5 + rnd() * 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.2); grd.addColorStop(0, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill();
    if (rnd() > 0.72) { g.strokeStyle = `rgba(255,255,255,${a * 0.8})`; g.lineWidth = 0.6; const l = r * 4.5; g.beginPath(); g.moveTo(x - l, y); g.lineTo(x + l, y); g.moveTo(x, y - l); g.lineTo(x, y + l); g.stroke(); }
  }
  document.documentElement.style.setProperty('--sparkle', `url(${c.toDataURL()})`);
}

export function track(el) { el._h = { px: 50, py: 50, cx: 50, cy: 50, o: 0.5, hover: false, seed: Math.random() * 6 }; els.add(el); }
export function untrack(el) { els.delete(el); }
export function holoPointer(el) { return el._h ? { x: el._h.cx / 100, y: el._h.cy / 100 } : { x: 0.5, y: 0.5 }; }

function setFromEvent(e) {
  const el = e.target.closest?.('.sticker'); if (!el || !el._h || el.classList.contains('gl-hidden')) return;
  const r = el.getBoundingClientRect();
  el._h.px = Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100));
  el._h.py = Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100));
  el._h.hover = true;
}
export function initHolo() {
  makeSparkleTile();
  document.addEventListener('pointermove', setFromEvent, { passive: true });
  document.addEventListener('pointerdown', setFromEvent, { passive: true });
  document.addEventListener('pointerout', e => { const el = e.target.closest?.('.sticker'); if (el?._h && !el.contains(e.relatedTarget)) el._h.hover = false; });
  document.addEventListener('pointerup', e => { if (e.pointerType === 'touch') { const el = e.target.closest?.('.sticker'); if (el?._h) el._h.hover = false; } });
  // phone tilt: Android works straight away; iOS needs a permission request inside a gesture.
  const onOri = e => { if (e.gamma == null) return; ambient = { x: 0.5 + Math.max(-30, Math.min(30, e.gamma)) / 70, y: 0.5 + Math.max(-30, Math.min(30, (e.beta ?? 45) - 45)) / 70, live: true }; };
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    const ask = () => { D.requestPermission().then(r => r === 'granted' && addEventListener('deviceorientation', onOri)).catch(() => {}); };
    addEventListener('touchend', ask, { once: true });
  } else if (D) addEventListener('deviceorientation', onOri);
  let last = 0;
  const loop = t => {
    requestAnimationFrame(loop);
    if (t - last < 30) return; const dt = Math.min(0.1, (t - last) / 1000); last = t;
    const k = 1 - Math.exp(-dt * 13);
    for (const el of els) {
      if (el.classList.contains('gl-hidden')) continue;
      const h = el._h; let tx, ty;
      if (h.hover) { tx = h.px; ty = h.py; }
      else if (ambient.live) { tx = ambient.x * 100; ty = ambient.y * 100; }
      else if (reduced) { tx = 38; ty = 34; }
      else { const s = t / 1000 * 0.55 + h.seed; tx = 50 + 34 * Math.sin(s * 1.1); ty = 50 + 30 * Math.cos(s * 0.83 + 1.3); }
      h.cx += (tx - h.cx) * k; h.cy += (ty - h.cy) * k;
      const ox = h.hover ? 1 : 0.62; h.o += (ox - h.o) * k;
      const dx = (h.cx - 50) / 50, dy = (h.cy - 50) / 50, tilt = h.hover ? 13 : 5;
      const s = el.style;
      s.setProperty('--px', h.cx.toFixed(1)); s.setProperty('--py', h.cy.toFixed(1));
      s.setProperty('--pfc', Math.min(1, Math.hypot(dx, dy)).toFixed(3));
      s.setProperty('--rx', (dy * -tilt).toFixed(2) + 'deg'); s.setProperty('--ry', (dx * tilt).toFixed(2) + 'deg');
      s.setProperty('--bx', (50 + dx * 34).toFixed(1)); s.setProperty('--by', (50 + dy * 34).toFixed(1));
      s.setProperty('--o', h.o.toFixed(3));
    }
  };
  requestAnimationFrame(loop);
}
