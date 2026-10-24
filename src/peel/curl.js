// Pure geometry for peeling a sticker sheet. No DOM, no GL — unit-testable in node.
//
// Model: the sticker is an inextensible sheet. Along the peel axis `a` every point has a
// sheet coordinate tp in [0, L] (0 = the edge being lifted, the "tip"). A crease sits at
// tp = c. Everything beyond it (tp > c) is still stuck flat. The peeled part wraps round a
// cylinder of radius R through angle `th`, then continues straight at that angle, like
// vinyl being pulled off a backing sheet. The tip follows the finger.

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

export const PEEL = {
  thetaEnd: Math.PI * 0.94, // how far the flap folds back once well peeled
  radius: 0.105,            // curl radius as a fraction of sheet length
  gain: 1.4,                // finger travel -> peel travel
  foldAt: 0.66              // fraction of the sheet by which the flap is fully folded
};

export function curlShape(c, L) {
  const tight = smoothstep(0.72 * L, L, c);          // crease tightens as the last of it lets go
  const R = Math.max(0.35, PEEL.radius * L * (1 - 0.98 * tight));
  const th = PEEL.thetaEnd * smoothstep(0, PEEL.foldAt * L, c);
  const thE = Math.min(th, c / R);                    // short flaps are all arc
  return { R, th, thE, c, L };
}

// In-plane position of the tip (tp = 0) once the crease is at c.
export function tipState(shape) {
  const { R, thE, c } = shape;
  const straight = c - R * thE;
  return {
    x: c - R * Math.sin(thE) - straight * Math.cos(thE),
    z: R * (1 - Math.cos(thE)) + straight * Math.sin(thE)
  };
}

// Invert: find crease position for a given tip travel D. Returns {c, detached}.
export function solveCrease(D, L) {
  if (D <= 0) return { c: 0, detached: false };
  const full = tipState(curlShape(L, L)).x;
  if (D >= full) return { c: L, detached: true, full };
  let lo = 0, hi = L;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (tipState(curlShape(mid, L)).x < D) lo = mid; else hi = mid;
  }
  return { c: (lo + hi) / 2, detached: false, full };
}

// Position of one sheet point. Returns x (along a, from tip origin), z (height) and the
// front-face normal in the (a, z) plane.
export function curlPoint(tp, shape, out = {}) {
  const { R, th, c } = shape;
  const u = c - tp;
  if (u <= 0) { out.x = tp; out.z = 0; out.nx = 0; out.nz = 1; return out; }
  const arc = R * th;
  if (u < arc) {
    const q = u / R;
    out.x = c - R * Math.sin(q); out.z = R * (1 - Math.cos(q)); out.nx = Math.sin(q); out.nz = Math.cos(q);
  } else {
    const s = u - arc;
    out.x = c - R * Math.sin(th) - s * Math.cos(th);
    out.z = R * (1 - Math.cos(th)) + s * Math.sin(th);
    out.nx = Math.sin(th); out.nz = Math.cos(th);
  }
  return out;
}

// Free sheet hinged on its tip, rotated by psi in the (a, z) plane. psi = 0 is flat, front up.
export function flipPoint(tp, psi, out = {}) {
  out.x = tp * Math.cos(psi); out.z = tp * Math.sin(psi);
  out.nx = -Math.sin(psi); out.nz = Math.cos(psi);
  return out;
}

// Angle the free sheet starts from, so the flip is continuous with the final curl.
export const flipStartPsi = () => Math.PI * 2 - PEEL.thetaEnd;

// ---- silhouette support (how far the opaque pixels reach along a direction) ----
export const SUPPORT_STEPS = 72;

// alpha: Uint8 array, w*h, centred on the quad. Returns reach[k] in texture pixels.
export function buildSupport(alpha, w, h, thresh = 40) {
  const reach = new Float32Array(SUPPORT_STEPS).fill(0);
  const dirs = [];
  for (let k = 0; k < SUPPORT_STEPS; k++) { const t = (k / SUPPORT_STEPS) * Math.PI * 2; dirs.push([Math.cos(t), Math.sin(t)]); }
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[y * w + x] < thresh) continue;
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    for (let k = 0; k < SUPPORT_STEPS; k++) { const d = px * dirs[k][0] + py * dirs[k][1]; if (d > reach[k]) reach[k] = d; }
  }
  return reach;
}

export function supportAt(reach, angle) {
  const f = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * SUPPORT_STEPS;
  const i = Math.floor(f), t = f - i;
  return lerp(reach[i % SUPPORT_STEPS], reach[(i + 1) % SUPPORT_STEPS], t);
}
