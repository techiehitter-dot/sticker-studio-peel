// Builds the deformed sticker mesh on the CPU (a thin strip along the peel axis).
// Output vertex layout (9 floats): x, y, z, u, v, nx, ny, nz, shade.
import { curlShape, solveCrease, curlPoint, flipPoint, tipState, supportAt, smoothstep, clamp } from './curl.js';

export const STRIDE = 9;
export const COLS = 2;                 // quads across the strip
export const MAX_ROWS = 300;
export const FOCAL = 640;              // perspective focal length in px

const scratch = {};

export function sheetExtents(st, w, h, rot, angle) {
  const k = w / st.dsW;                // downsampled texture px -> css px
  const sup = (ang) => supportAt(st.reach, ang - rot) * k;
  const tmax = sup(angle), tmin = -sup(angle + Math.PI);
  const hb = Math.max(sup(angle + Math.PI / 2), sup(angle - Math.PI / 2));
  return { tmin, tmax, L: tmax - tmin, hb };
}

// spec: { sticker, w, h, rot, angle, mode: 'curl'|'flip'|'flat', center, vp, margin,
//         curl:{D}, flip:{psi, pivot:{x,y,z}}, flat:{scale, lift, rx, ry, rz} }
export function buildMesh(spec, out) {
  const { sticker: st, w, h, rot, angle, mode, center: C, margin: m = 16 } = spec;
  const ax = Math.cos(angle), ay = Math.sin(angle), bx = -ay, by = ax;
  const { tmin, L, hb } = sheetExtents(st, w, h, rot, angle);
  const rows = clamp(Math.ceil((L + 2 * m) / 1.1), 24, MAX_ROWS);
  const cr = Math.cos(-rot), sr = Math.sin(-rot);
  const vp = spec.vp || C;

  let shape = null, tip = null;
  if (mode === 'curl') { shape = curlShape(solveCrease(spec.curl.D, L).c, L); tip = tipState(shape); }

  const sCols = [-(hb + m), 0, hb + m];
  const buf = out || new Float32Array((MAX_ROWS + 1) * (COLS + 1) * STRIDE);
  let o = 0;
  const pt = scratch;
  const flat = spec.flat;
  let R3 = null;
  if (mode === 'flat') R3 = rotMatrix(flat.rx, flat.ry, flat.rz);

  for (let i = 0; i <= rows; i++) {
    const tp = -m + (L + 2 * m) * (i / rows);
    const t = tmin + tp;                      // coordinate on the flat sticker, along a
    let shade = 0;
    if (mode === 'curl') {
      curlPoint(tp, shape, pt);
      if (tp > shape.c && shape.c > 0.5) {
        const reach = Math.max(shape.R * 2.2, Math.abs(tip.x - shape.c) * 0.8) + 4;
        shade = 0.34 * (1 - smoothstep(0, reach, tp - shape.c)) * smoothstep(0, 10, shape.c);
      }
    } else if (mode === 'flip') flipPoint(tp, spec.flip.psi, pt);

    for (let j = 0; j <= COLS; j++) {
      const s = sCols[j];
      let px, py, z, nx, ny, nz;
      if (mode === 'curl') {
        px = C.x + (tmin + pt.x) * ax + s * bx; py = C.y + (tmin + pt.x) * ay + s * by; z = pt.z;
        nx = pt.nx * ax; ny = pt.nx * ay; nz = pt.nz;
      } else if (mode === 'flip') {
        const pv = spec.flip.pivot;
        px = pv.x + pt.x * ax + s * bx; py = pv.y + pt.x * ay + s * by; z = pv.z + pt.z;
        nx = pt.nx * ax; ny = pt.nx * ay; nz = pt.nz;
      } else {
        const rx = (t * ax + s * bx) * flat.scale, ry = (t * ay + s * by) * flat.scale;
        const v = apply(R3, rx, ry, 0);
        px = C.x + v[0]; py = C.y + v[1]; z = flat.lift + v[2];
        const n = apply(R3, 0, 0, 1); nx = n[0]; ny = n[1]; nz = n[2];
      }
      const f = FOCAL / Math.max(60, FOCAL - z);
      const lx = t * ax + s * bx, ly = t * ay + s * by;
      buf[o++] = vp.x + (px - vp.x) * f; buf[o++] = vp.y + (py - vp.y) * f; buf[o++] = z;
      buf[o++] = (lx * cr - ly * sr) / w + 0.5; buf[o++] = (lx * sr + ly * cr) / h + 0.5;
      buf[o++] = nx; buf[o++] = ny; buf[o++] = nz; buf[o++] = shade;
    }
  }
  return { data: buf, rows, count: rows * COLS * 6, L, tmin, crease: shape?.c ?? 0 };
}

// R = Ry * Rx * Rz  (y down on screen, z towards the viewer)
function rotMatrix(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // Rz
  const a = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  // Rx
  const b = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  // Ry
  const c = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  return mul(c, mul(b, a));
}
function mul(p, q) { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = p[i * 3] * q[j] + p[i * 3 + 1] * q[3 + j] + p[i * 3 + 2] * q[6 + j]; return r; }
function apply(M, x, y, z) { return [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z]; }

export function buildIndices() {
  const idx = new Uint16Array(MAX_ROWS * COLS * 6);
  let k = 0;
  for (let i = 0; i < MAX_ROWS; i++) for (let j = 0; j < COLS; j++) {
    const a = i * (COLS + 1) + j, b = a + 1, c = a + (COLS + 1), d = c + 1;
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
  }
  return idx;
}
