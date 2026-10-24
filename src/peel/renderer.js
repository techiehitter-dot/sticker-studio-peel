// WebGL renderer for the sticker being peeled / carried. One full-screen canvas, one mesh.
import { buildSupport } from './curl.js';
import { STRIDE, buildIndices, MAX_ROWS, COLS } from './mesh.js';

const VERT = `
attribute vec2 aPos; attribute float aZ; attribute vec2 aUv; attribute vec3 aN; attribute float aShade;
uniform vec2 uRes; uniform vec2 uOff; uniform vec2 uLight;
varying vec2 vUv; varying vec3 vN; varying float vZ; varying float vShade;
void main(){
  vec2 p = aPos + uOff + uLight * aZ;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, clamp(-aZ / 600.0, -0.95, 0.95), 1.0);
  vUv = aUv; vN = aN; vZ = aZ; vShade = aShade;
}`;

const FRAG_SHADOW = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uSh; uniform vec2 uShScale; uniform float uAlpha;
varying vec2 vUv; varying vec3 vN; varying float vZ; varying float vShade;
void main(){
  vec2 q = (vUv - 0.5) * uShScale + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
  vec4 s = texture2D(uSh, q);
  float lift = smoothstep(1.5, 40.0, vZ);
  float air = smoothstep(0.6, 9.0, vZ);           // flat on the page = no shadow
  float a = mix(s.r, s.g, lift) * uAlpha * air * (1.0 - 0.45 * smoothstep(20.0, 220.0, vZ));
  // shadow of a face-down (back-showing) sheet is the same silhouette, so no extra handling
  gl_FragColor = vec4(vec3(0.42, 0.22, 0.3) * a, a);
}`;

const FRAG_STICKER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform sampler2D uBack; uniform float uHasBack;
uniform float uTime; uniform vec2 uTilt; uniform vec2 uGlare; uniform float uGlareAmt;
uniform float uFoil; uniform float uStyle; uniform float uPaper;
varying vec2 vUv; varying vec3 vN; varying float vZ; varying float vShade;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 palette(float x){
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67)));
  return mix(vec3(0.9), c, 0.82);            // pastel-leaning iridescence
}

// Holographic finishes. Each one reacts to tilt (pointer / motion) and to the surface normal,
// so the colour travels along the curl as the sticker bends.
vec3 foilColour(vec2 uv, vec2 shift, float style, out float spark){
  spark = 0.0;
  vec3 col;
  if (style < 0.5) {                        // holo: diagonal rainbow bands
    float d = dot(uv - 0.5, vec2(0.86, 0.5));
    float ph = d * 2.4 + shift.x * 0.95 + shift.y * 0.6;
    float st = 0.5 + 0.5 * sin((d * 9.0 + ph * 1.6) * 6.28318);
    col = palette(ph) * (0.62 + 0.38 * st);
    spark = 0.35;
  } else if (style < 1.5) {                 // glitter: soft wash + strong sparkle
    float d = dot(uv - 0.5, vec2(0.7, 0.7));
    col = palette(d * 1.1 + shift.x * 0.8 - shift.y * 0.4) * 0.55;
    spark = 1.0;
  } else if (style < 2.5) {                 // prism: tilting triangular facets
    vec2 g = uv * 7.0; vec2 id = floor(g); vec2 f = fract(g);
    float tri = step(f.x, f.y);
    float hs = hash21(id + tri * 17.0);
    float ph = hs + shift.x * 1.15 + shift.y * 0.75;
    float refl = 0.5 + 0.5 * sin(hs * 40.0 + shift.x * 7.0 + shift.y * 5.0);
    col = palette(ph) * (0.28 + 0.9 * refl * refl);
    spark = 0.25;
  } else {                                  // aurora: slow ribbons
    float w1 = sin(uv.x * 5.5 + shift.x * 3.2 + uTime * 0.25) + sin(uv.y * 4.2 - shift.y * 3.0 + uTime * 0.2);
    col = palette(0.17 * w1 + uv.x * 0.45 + shift.x * 0.6) * (0.55 + 0.25 * w1);
    spark = 0.3;
  }
  return col;
}

float sparkle(vec2 uv, vec2 shift, vec3 N, float scale){
  vec2 g = uv * scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash21(id);
  float tw = pow(max(0.0, sin(h * 80.0 + shift.x * 9.0 + shift.y * 7.0 + N.x * 11.0 + N.y * 9.0)), 10.0);
  return step(0.84, h) * tw * smoothstep(0.5, 0.0, length(f));
}

void main(){
  if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.02) discard;
  vec3 alb = t.rgb / t.a;
  vec3 N = normalize(vN);
  vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  vec3 col;

  if (N.z >= 0.0) {
    // ---- front: printed vinyl with holographic laminate ----
    float diff = max(dot(N, L), 0.0);
    float shade = (0.62 + 0.5 * diff) / (0.62 + 0.5 * 0.66);
    vec2 shift = uTilt * 0.55 + N.xy * 0.9;
    float spk;
    vec3 fc = foilColour(vUv, shift, uStyle, spk);
    vec3 lift = fc * uFoil;
    float lum = dot(alb, vec3(0.3, 0.59, 0.11));
    float lightMask = smoothstep(0.12, 0.7, lum);                   // keep ink lines clean
    vec3 dodge = alb / max(vec3(1.0) - lift * 0.42, vec3(0.3));     // colour-dodge-ish lift of the print
    col = mix(alb, dodge, 0.55 * lightMask + 0.15) + lift * 0.14 * lightMask;
    float sp = max(sparkle(vUv + 0.31, shift, N, 90.0), sparkle(vUv, shift * 1.3, N, 52.0) * 0.8);
    col += vec3(1.0, 0.97, 0.9) * sp * spk * uFoil * 1.25 * (0.4 + 0.6 * lightMask);
    float g = exp(-pow(distance(vUv, uGlare) * 2.3, 2.0));
    col += vec3(1.0, 0.99, 0.95) * g * uGlareAmt * 0.3;
    float spec = pow(max(dot(N, H), 0.0), 26.0);
    col += vec3(1.0, 0.98, 0.94) * spec * 0.42;
    if (uStyle > 3.5) {                                   // gloss: a soft diagonal sheen, nothing more
      float d = dot(vUv - 0.5, vec2(0.7, 0.7)) + (uTilt.x + uTilt.y) * 0.1 + N.x * 0.4;
      col += vec3(1.0, 0.99, 0.95) * exp(-pow((d - 0.02) * 4.6, 2.0)) * 0.1;
    }
    if (uPaper > 0.5) col = alb;                                   // paper is matte: no foil, no sheen
    col *= shade * (1.0 - vShade);
  } else {
    // ---- back: mirror-silver foil liner (faint print still visible through it) ----
    vec3 Nb = -N;
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 R = 2.0 * dot(Nb, V) * Nb - V;                          // what the foil mirrors
    float e = R.x * 1.3 + R.y * 1.5 + dot(vUv - 0.5, vec2(1.25, 0.8)) + uTilt.x * 0.35 + uTilt.y * 0.25;
    float band = 0.5 + 0.5 * sin(e * 7.5 + sin(e * 3.1 + 1.2) * 1.6);
    vec3 dark = vec3(0.62, 0.65, 0.72), light = vec3(0.96, 0.975, 1.0);
    vec3 silver = mix(dark, light, smoothstep(0.08, 0.92, band));
    float brushed = hash21(vec2(floor(vUv.x * 260.0), floor(vUv.y * 7.0)));
    silver *= 0.98 + 0.04 * brushed;                              // fine brushed grain
    vec4 tb = texture2D(uTex, vUv, 1.8);
    vec3 gb = tb.rgb / max(tb.a, 0.05);
    silver *= mix(vec3(1.0), gb, 0.13);                             // print ghosting through the foil
    float spec = pow(max(dot(Nb, H), 0.0), 22.0);
    float glint = pow(max(0.0, sin(e * 11.0 + uTime * 0.0)), 24.0) * 0.35;
    float diff = max(dot(Nb, L), 0.0);
    col = silver * (0.82 + 0.28 * diff) + vec3(1.0) * (spec * 0.7 + glint);
    col *= (1.0 - vShade * 0.5);
    if (uPaper > 0.5) col = vec3(0.985, 0.955, 0.89) * (0.86 + 0.14 * diff) * (1.0 - vShade * 0.35);   // a page's back is plain paper, not foil
    if (uHasBack > 0.5) col = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y)).rgb * (0.9 + 0.1 * diff) * (1.0 - vShade * 0.35);   // a real back face (the pack's back, seen from behind)
  }
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col * t.a, t.a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aZ'); gl.bindAttribLocation(p, 2, 'aUv');
  gl.bindAttribLocation(p, 3, 'aN'); gl.bindAttribLocation(p, 4, 'aShade');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

const FOIL_INDEX = { holo: 0, glitter: 1, prism: 2, aurora: 3, gloss: 4 };

export class PeelRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ok = false; this.stickers = new Map();
    try {
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, powerPreference: 'high-performance' });
      if (!gl) return;
      this.gl = gl;
      this.sticker = program(gl, VERT, FRAG_STICKER);
      this.shadow = program(gl, VERT, FRAG_SHADOW);
      this.vbo = gl.createBuffer();
      this.ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buildIndices(), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, (MAX_ROWS + 1) * (COLS + 1) * STRIDE * 4, gl.DYNAMIC_DRAW);
      this.ok = true;
    } catch (err) { console.warn('Peel renderer unavailable:', err); }
  }

  resize(cssW, cssH, dpr) {
    this.cssW = cssW; this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr); this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
  }

  async loadSticker(def) {
    if (this.stickers.has(def.id)) return this.stickers.get(def.id);
    const img = new Image(); img.decoding = 'async'; img.src = def.url; await img.decode();
    return this.buildRec(def, img);
  }

  // textures from an image or a canvas. Sync, so a page can be rasterised and peeled straight away.
  buildRec(def, img) {
    if (this.stickers.has(def.id)) return this.stickers.get(def.id);
    const gl = this.gl;
    const sw = img.naturalWidth || img.width, sh0 = img.naturalHeight || img.height;
    const aspect = sw / sh0;

    // colour texture (power-of-two so we can mip-map on WebGL1)
    const nat = Math.max(sw, sh0), P = nat > 512 ? 1024 : nat > 256 ? 512 : nat > 128 ? 256 : 128, c = document.createElement('canvas'); c.width = c.height = P;
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, P, P);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    // silhouette (for peel reach + shadows)
    const dsW = 96, dsH = Math.max(8, Math.round(96 / aspect));
    const sc = document.createElement('canvas'); sc.width = dsW; sc.height = dsH;
    const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0, dsW, dsH);
    const px = sx.getImageData(0, 0, dsW, dsH).data;
    const alpha = new Uint8Array(dsW * dsH); for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
    const reach = buildSupport(alpha, dsW, dsH);

    // shadow texture: R = tight contact shadow, G = wide soft shadow
    const shW = 128, shH = Math.round(128 / aspect), k = 28;
    const W = shW + 2 * k, H = shH + 2 * k;
    const shc = document.createElement('canvas'); shc.width = shW; shc.height = shH;
    const shx = shc.getContext('2d', { willReadFrequently: true }); shx.drawImage(img, 0, 0, shW, shH);
    const sd = shx.getImageData(0, 0, shW, shH).data;
    const a0 = new Float32Array(W * H);
    for (let y = 0; y < shH; y++) for (let x = 0; x < shW; x++) a0[(y + k) * W + x + k] = sd[(y * shW + x) * 4 + 3] / 255;
    const tight = boxBlur(a0, W, H, 2, 3), soft = boxBlur(a0, W, H, 7, 3);
    const sh = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { sh[i * 4] = Math.min(255, tight[i] * 255); sh[i * 4 + 1] = Math.min(255, soft[i] * 255); sh[i * 4 + 3] = 255; }
    const shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, sh);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    const rec = { id: def.id, def, img, aspect, paper: !!def.paper, tex, shTex, reach, dsW, dsH, shScale: [shW / W, shH / H], foil: FOIL_INDEX[def.foil] ?? 0 };
    this.stickers.set(def.id, rec);
    return rec;
  }

  disposeRec(id) {
    const rec = this.stickers.get(id); if (!rec) return;
    this.gl.deleteTexture(rec.tex); this.gl.deleteTexture(rec.shTex); if (rec.backTex) this.gl.deleteTexture(rec.backTex);
    this.stickers.delete(id);
  }

  // a real back face for a sheet (e.g. the pack's back on the torn strip); drawn mirrored, as seen from behind
  attachBack(rec, source) {
    if (rec.backTex) return;
    const gl = this.gl, c = document.createElement('canvas'); c.width = c.height = 512;
    c.getContext('2d').drawImage(source, 0, 0, 512, 512);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    rec.backTex = t;
  }

  clear() { const gl = this.gl; gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }

  // mesh: {data, count}; fx: { time, tilt:[x,y], glare:[u,v], glareAmt, foil, shadow }
  draw(st, mesh, fx) {
    const gl = this.gl; this.clear();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.data.subarray(0, (mesh.rows + 1) * (COLS + 1) * STRIDE));
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const stride = STRIDE * 4;
    const bind = () => {
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 20);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 32);
    };
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // pass 1: shadow, drawn flat on the page (no depth test)
    gl.disable(gl.DEPTH_TEST);
    let P = this.shadow; gl.useProgram(P.p); bind();
    gl.uniform2f(P.u.uRes, this.cssW, this.cssH);
    gl.uniform2f(P.u.uOff, 0, 4 + (fx.shadowDrop ?? 0)); gl.uniform2f(P.u.uLight, 0.3, 0.55);
    gl.uniform2f(P.u.uShScale, st.shScale[0], st.shScale[1]); gl.uniform1f(P.u.uAlpha, fx.shadow ?? 0.34);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.shTex); gl.uniform1i(P.u.uSh, 0);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);

    // pass 2: the sticker itself
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    P = this.sticker; gl.useProgram(P.p); bind();
    gl.uniform2f(P.u.uRes, this.cssW, this.cssH); gl.uniform2f(P.u.uOff, 0, 0); gl.uniform2f(P.u.uLight, 0, 0);
    gl.uniform1f(P.u.uTime, fx.time); gl.uniform2f(P.u.uTilt, fx.tilt[0], fx.tilt[1]);
    const gloss = st.foil === 4;
    gl.uniform2f(P.u.uGlare, fx.glare[0], fx.glare[1]); gl.uniform1f(P.u.uGlareAmt, gloss ? fx.glareAmt * 0.2 : fx.glareAmt);
    gl.uniform1f(P.u.uFoil, gloss ? 0 : fx.foil); gl.uniform1f(P.u.uStyle, st.foil); gl.uniform1f(P.u.uPaper, st.paper ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, st.backTex || st.tex); gl.uniform1i(P.u.uBack, 1);
    gl.uniform1f(P.u.uHasBack, st.backTex ? 1 : 0); gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.uniform1i(P.u.uTex, 0);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
}

// separable box blur, `passes` times (approximates a gaussian)
function boxBlur(src, w, h, r, passes) {
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { let acc = 0; const o = y * w; for (let x = -r; x <= r; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { b[o + x] = acc / (2 * r + 1); acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = acc / (2 * r + 1); acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
  }
  return a;
}
