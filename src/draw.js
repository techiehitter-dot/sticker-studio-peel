// Drawing on the page. Three tools:
//  - crayon: waxy and grainy. It leaves no mark on stickers (the stroke lifts off them).
//  - ballpoint: blue. It presses a faint groove into whatever it crosses.
//  - drip pen: paint that runs. Drips grow out of the line and drop downward.
// A stroke belongs to the thing it was drawn on: bare paper keeps it in page %, a sticker keeps
// it in that sticker's own frame, so it moves with the sticker. Strokes are kept in %, so they
// survive resizing and are painted the same way live, on reload and on the static pages.

export const CRAYON_COLOURS = ['#e2473c', '#f39a2b', '#f5d63b', '#4fb85a', '#3a9be0', '#7d4fd1', '#2b2420', '#fffaf0'];
const BALLPOINT = '#2350c8';

// small seeded random, so a crayon stroke looks the same every time it is painted
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toPx = (p, W, H) => [p[0] * W / 100, p[1] * H / 100];
const toPct = (x, y, W, H) => [x / W * 100, y / H * 100];

function line(ctx, pts, dx = 0, dy = 0) {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
  ctx.stroke();
}

function ballpoint(ctx, pts) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(60, 30, 10, .38)'; ctx.lineWidth = 2.8; line(ctx, pts, 1.3, 1.4);      // the groove's shadow
  ctx.strokeStyle = 'rgba(255, 255, 255, .50)'; ctx.lineWidth = 1.2; line(ctx, pts, -0.9, -1.0); // its lit edge
  ctx.strokeStyle = BALLPOINT; ctx.lineWidth = 1.7; line(ctx, pts);                             // the ink
}

function crayon(ctx, col, pts, rand) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.globalAlpha = .42; ctx.lineWidth = 3.4; line(ctx, pts);          // the body of the wax
  ctx.globalAlpha = .9;
  for (let i = 1; i < pts.length; i++) {                              // the grain: stippled wax
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      for (let j = 0; j < 3; j++) if (rand() < 0.62) ctx.fillRect(x + (rand() - .5) * 5, y + (rand() - .5) * 5, 1.3, 1.3);
    }
  }
  ctx.globalAlpha = 1;
}

function dripLine(ctx, col, pts) {
  ctx.strokeStyle = col; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = .95; line(ctx, pts); ctx.globalAlpha = 1;
}

// one drip, from `from` to `to` px below where it starts. The bulb appears when it has finished.
function paintDrip(ctx, col, d, W, H, from, to) {
  const x = d.x * W / 100, y = d.y * H / 100, max = d.m * H / 100;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = d.w;
  ctx.beginPath(); ctx.moveTo(x, y + from); ctx.lineTo(x, y + to); ctx.stroke();
  if (to >= max - 0.5) { ctx.beginPath(); ctx.arc(x, y + to, d.w * 0.85, 0, Math.PI * 2); ctx.fill(); }
}

// paints one stored stroke (used for reloads, the turning page and the static pages)
export function paintStroke(ctx, s, W, H) {
  const rand = rng(s.seed || 1);
  for (const run of s.runs) {
    const pts = run.map(p => toPx(p, W, H));
    if (s.t === 'b') ballpoint(ctx, pts);
    else if (s.t === 'c') crayon(ctx, s.col, pts, rand);
    else dripLine(ctx, s.col, pts);
  }
  if (s.t === 'd') for (const d of s.drips) paintDrip(ctx, s.col, d, W, H, 0, d.m * H / 100);
}

export function paintInk(ctx, strokes, W, H) {
  ctx.clearRect(0, 0, W, H);
  for (const s of strokes) paintStroke(ctx, s, W, H);
}

// Erasing, point by point: every stored point within `radius` px of q is removed, a run is split where it was,
// and drips in reach go too. Works the same on the page's ink and on a sticker's ink. Returns true if anything changed.
export function eraseFrom(list, q, W, H, radius) {
  let changed = false;
  const [qx, qy] = q;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    let touched = false;
    const runs = [];
    for (const run of s.runs) {
      let cur = [];
      for (const pt of run) {
        const [x, y] = toPx(pt, W, H);
        if (Math.hypot(x - qx, y - qy) <= radius) { touched = true; if (cur.length) runs.push(cur); cur = []; }
        else cur.push(pt);
      }
      if (cur.length) runs.push(cur);
    }
    const drips = s.drips.filter(d => {
      const x = d.x * W / 100, y = d.y * H / 100;
      const hit = Math.hypot(x - qx, y - qy) <= radius + d.m * H / 100 * 0.2;
      if (hit) touched = true;
      return !hit;
    });
    if (touched) {
      changed = true;
      s.runs = runs; s.drips = drips;
      if (!runs.length && !drips.length) list.splice(i, 1);
    }
  }
  return changed;
}

// Live drawing. The owner of a point decides whose frame it is kept in:
//  pageFrame()        -> the page's own ink: { ctx, W, H, list, local(p) }
//  stickerFrame(el)   -> the sticker's own ink, in its box, same shape
//  hitAt(x, y)        -> the placed sticker under that point, or null
//  commit()           -> called once strokes are kept
export class Drawer {
  constructor({ canvas, page, pageFrame, stickerFrame, hitAt, commit, eraseAt }) {
    Object.assign(this, { canvas, page, pageFrame, stickerFrame, hitAt, commit, eraseAt });
    this.dirty = false;
    this.active = false; this.drawing = false; this.tool = 'c'; this.col = CRAYON_COLOURS[0];
    this.seg = null; this.lastP = null; this.created = []; this.live = []; this.raf = 0; this.tLast = null;
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e));
  }

  local(e) {
    const r = this.page.getBoundingClientRect();
    return { p: [e.clientX - r.left, e.clientY - r.top] };
  }

  down(e) {
    if (!this.active || e.button > 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drawing = true; this.seg = null; this.lastP = null; this.created = []; this.dirty = false;
    if (this.tool === 'e') { this.erase(this.local(e).p); return; }
    this.addPoint(this.local(e).p);
  }

  move(e) {
    if (!this.drawing) return;
    for (const ev of (e.getCoalescedEvents?.() ?? [e])) {
      const p = this.local(ev).p;
      if (this.tool === 'e') this.erase(p); else this.addPoint(p);
    }
  }

  // the eraser: removes ink under it, on the page and on any sticker it passes over
  erase(p) {
    if (this.eraseAt(p)) this.dirty = true;
  }

  addPoint(p) {
    const el = this.hitAt(p[0], p[1]);
    if (this.tool === 'c' && el) { this.seg = null; this.lastP = null; return; }   // crayon lifts off stickers
    const key = el || null;
    if (!this.seg || this.seg.key !== key) {
      const frame = el ? this.stickerFrame(el) : this.pageFrame();
      if (!frame) return;
      const stroke = { t: this.tool, col: this.col, seed: (Math.random() * 2 ** 31) | 0, runs: [[]], drips: [] };
      frame.list.push(stroke); this.created.push({ list: frame.list, stroke });
      this.seg = { key, frame, stroke, rand: rng(stroke.seed), last: null };
      if (this.lastP) {                       // carry the line across from the previous frame, so it doesn't break
        const q = frame.local(this.lastP);
        this.seg.last = q; stroke.runs[0].push(toPct(q[0], q[1], frame.W, frame.H));
      }
    }
    const { frame, stroke } = this.seg;
    const q = frame.local(p);
    if (this.seg.last) {
      this.paintSeg(this.seg, this.seg.last, q);
      if (this.tool === 'd') this.maybeDrip(q, this.seg.last, frame, stroke);
    }
    stroke.runs[stroke.runs.length - 1].push(toPct(q[0], q[1], frame.W, frame.H));
    this.seg.last = q; this.lastP = p;
  }

  paintSeg(seg, a, b) {
    const { frame, stroke } = seg, ctx = frame.ctx;
    if (stroke.t === 'b') ballpoint(ctx, [a, b]);
    else if (stroke.t === 'c') crayon(ctx, stroke.col, [a, b], seg.rand);
    else dripLine(ctx, stroke.col, [a, b]);
  }

  // paint runs down from the line; more of them when the pen is moving slowly
  maybeDrip(q, a, frame, stroke) {
    const speed = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (Math.random() > (speed < 3 ? 0.22 : 0.12)) return;
    const max = 14 + Math.random() * 40, w = 1.6 + Math.random() * 1.1;
    const d = { x: q[0] / frame.W * 100, y: q[1] / frame.H * 100, m: max / frame.H * 100, w };
    stroke.drips.push(d);
    this.live.push({ d, len: 0, max, speed: 16 + Math.random() * 12, col: stroke.col, W: frame.W, H: frame.H, ctx: frame.ctx });
    if (!this.raf) this.raf = requestAnimationFrame(t => this.tick(t));
  }

  tick(now) {
    this.raf = 0;
    if (!this.live.length) return;
    const dt = Math.min(0.05, (now - (this.tLast ?? now)) / 1000); this.tLast = now;
    this.live = this.live.filter(L => {
      const to = Math.min(L.max, L.len + L.speed * dt);
      paintDrip(L.ctx, L.col, L.d, L.W, L.H, L.len, to);
      L.len = to;
      return to < L.max;
    });
    if (this.live.length) this.raf = requestAnimationFrame(t => this.tick(t));
    else this.tLast = null;
  }

  up() {
    if (!this.drawing) return;
    this.drawing = false;
    for (const L of this.live) paintDrip(L.ctx, L.col, L.d, L.W, L.H, L.len, L.max);   // finish the drips
    this.live = []; cancelAnimationFrame(this.raf); this.raf = 0; this.tLast = null;
    let kept = false;
    for (const { list, stroke } of this.created) {
      const pts = stroke.runs.reduce((n, r) => n + r.length, 0);
      if (pts < 2 && !stroke.drips.length) { const i = list.indexOf(stroke); if (i >= 0) list.splice(i, 1); }
      else kept = true;
    }
    this.created = []; this.seg = null; this.lastP = null;
    if (kept || this.dirty) this.commit();
    this.dirty = false;
  }
}
