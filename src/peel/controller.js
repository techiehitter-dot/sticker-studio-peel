// Gesture + physics for picking a sticker up: peel (direction aware) -> flip into the hand -> carry -> drop/return.
import { PEEL, clamp, lerp, solveCrease, curlShape, tipState, flipStartPsi } from './curl.js';
import { sound } from '../sound.js';
import { buildMesh, sheetExtents } from './mesh.js';

const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const wrapPI = a => Math.atan2(Math.sin(a), Math.cos(a));
const spring = (s, target, k, c, dt) => { const n = Math.ceil(dt / 0.008); const h = dt / n; for (let i = 0; i < n; i++) { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; } };

export class PeelController {
  // hooks: { hide(el), show(el), resolveDrop(p, S) -> {x,y}|null, commit(S, center), cancel(S), holoPointer(el), targetSize(S) -> scale }
  constructor(renderer, canvas, hooks) {
    this.r = renderer; this.canvas = canvas; this.hooks = hooks; this.S = null; this.raf = 0; this.last = 0;
    this.onMove = e => this.move(e); this.onUp = e => this.up(e); this.onCancel = e => this.up(e, true);
    const fit = () => { this.dpr = Math.min(window.devicePixelRatio || 1, 2.5); if (renderer.ok) renderer.resize(innerWidth, innerHeight, this.dpr); };
    fit(); addEventListener('resize', fit);
  }
  get busy() { return !!this.S; }

  // pointerdown on a sticker: wait for a real drag before taking over (so taps stay taps)
  press(el, kind, rec, e) {
    if (this.S || !this.r.ok || (e.button !== undefined && e.button > 0)) return;
    const w = el.offsetWidth, h = el.offsetHeight, rc = el.getBoundingClientRect();
    const rot = (parseFloat(el.style.getPropertyValue('--tilt')) || 0) * Math.PI / 180;
    this.S = {
      el, kind, rec, pid: e.pointerId, state: 'pending', g: { x: e.clientX, y: e.clientY }, p: { x: e.clientX, y: e.clientY },
      C0: { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }, w, h, rot,
      ang: -Math.PI / 2, angSet: false, D: 0, Dt: 0, Dv: 0, tau: 0, scale: { x: 1, v: 0 }, lift: { x: 0, v: 0 },
      rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, rz: { x: 0, v: 0 }, Cc: null, vel: { x: 0, y: 0 }, up: false
    };
    try { el.setPointerCapture(e.pointerId); } catch {}   // keep getting the pointer if it leaves the page
    addEventListener('pointermove', this.onMove, { passive: false });
    addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onCancel);
  }

  move(e) {
    if (e.buttons === 0 && e.pointerType === 'mouse' && this.S && e.pointerId === this.S.pid) { this.up(e); return; }   // the button was let go somewhere we did not hear: treat as a release
    const S = this.S; if (!S || e.pointerId !== S.pid) return;
    S.p.x = e.clientX; S.p.y = e.clientY;
    const dx = S.p.x - S.g.x, dy = S.p.y - S.g.y, dist = Math.hypot(dx, dy);
    if (S.state === 'pending') {
      if (dist < 4) return;
      this.start();
    }
    if (S.state === 'peel' || S.state === 'release') {
      if (dist > 6) { const t = Math.atan2(dy, dx); if (!S.angSet) { S.ang = t; S.angSet = true; } S.angT = t; }
      if (S.state === 'peel' && !S.up) S.Dt = dist * (this.hooks.gain ?? PEEL.gain);   // once it is set to turn (or released), the finger no longer pulls it back   // packs use a higher gain: a strip is short
    }
    if (S.state !== 'pending') e.preventDefault();
  }

  start() {
    const S = this.S; S.state = 'peel'; S.stateT = 0; S.angT = S.ang;
    const hp = this.hooks.holoPointer(S.el); S.glow = { x: hp.x, y: hp.y };
    this.hooks.hide(S.el); this.canvas.style.display = 'block'; S.lastD = 0; sound.peelStart(S.kind);
    S.ext = sheetExtents(S.rec, S.w, S.h, S.rot, S.ang);
    S.t0 = performance.now(); this.last = S.t0; cancelAnimationFrame(this.raf); this.frame(S.t0);
  }

  up(e, cancelled) {
    const S = this.S; if (!S || e.pointerId !== S.pid) return;
    S.p.x = e.clientX; S.p.y = e.clientY;
    if (S.state === 'pending') return this.end(false);
    S.up = true; S.cancelled = !!cancelled;
    if (S.state === 'peel' && !cancelled && this.hooks.accept?.(S)) S.Dt = 4000;   // accepted: pull it fully off and carry it over
    else if (S.state === 'peel') { S.state = 'release'; S.Dt = 0; }
    else if (S.state === 'carry') this.drop();
  }

  drop() {
    const S = this.S; const target = S.cancelled ? null : this.hooks.resolveDrop(S.p, S);
    S.tau = 0; S.from = { x: S.Cc.x, y: S.Cc.y, lift: S.lift.x, scale: S.scale.x, rx: S.rx.x, ry: S.ry.x, rz: S.rz.x };
    if (target) { S.state = 'drop'; S.to = target; } else { S.state = 'return'; S.to = S.C0; }
  }

  // used when a falling sheet leaves the screen: nothing is placed or returned
  finish() {
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onCancel);
    cancelAnimationFrame(this.raf); this.raf = 0; this.canvas.style.display = 'none';
    sound.peelStop(); this.S = null;
  }

  end(placed) {
    const S = this.S; removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onCancel);
    cancelAnimationFrame(this.raf); this.raf = 0; this.canvas.style.display = 'none';
    sound.peelStop(); if (S.state !== 'pending') placed ? sound.stick(S.kind) : sound.restick(S.kind);
    if (S.state !== 'pending') { if (placed) this.hooks.commit(S, S.to); else { this.hooks.show(S.el); this.hooks.cancel?.(S); } }
    this.S = null;
  }

  frame = (now) => {
    const S = this.S; if (!S) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(1 / 20, Math.max(0.001, (now - this.last) / 1000)); this.last = now;
    const time = (now - S.t0) / 1000;
    S.stateT += dt;
    let mode = 'curl', spec;
    const base = { sticker: S.rec, w: S.w, h: S.h, rot: S.rot, margin: 16 };

    if (S.state === 'peel' || S.state === 'release') {
      S.ang += wrapPI(S.angT - S.ang) * (1 - Math.exp(-dt * 14));
      if (S.state === 'peel' && !S.up && this.hooks.accept?.(S)) { S.up = true; S.Dt = 4000; }   // past the turn threshold: it turns by itself
      const slow = S.state === 'release';
      spring({ get x() { return S.D; }, set x(v) { S.D = v; }, get v() { return S.Dv; }, set v(q) { S.Dv = q; } }, S.Dt, slow ? 420 : 1100, slow ? 30 : 60, dt);
      S.D = Math.max(0, S.D);
      const ext = sheetExtents(S.rec, S.w, S.h, S.rot, S.ang);
      const sol = solveCrease(S.D, ext.L);
      S.peelFrac = S.D / (ext.L * 2);                            // how far the sheet has come off: 0 flat, 1 fully free
      sound.peelUpdate((S.D - S.lastD) / dt, S.D / (ext.L * 2), S.kind); S.lastD = S.D;
      if (sol.detached && S.state === 'peel') {
        const shape = curlShape(ext.L, ext.L), tip = tipState(shape), a = { x: Math.cos(S.ang), y: Math.sin(S.ang) };
        S.flip = { ang: S.ang, ext, pivot0: { x: S.C0.x + (ext.tmin + tip.x) * a.x, y: S.C0.y + (ext.tmin + tip.x) * a.y, z: tip.z } };
        sound.peelStop(); sound.detach(S.kind);
        S.state = 'flip'; S.stateT = 0; S.Cc = { x: S.p.x, y: S.p.y }; S.lastC = { x: S.p.x, y: S.p.y };
      } else if (S.state === 'release' && S.D < 0.25) {
        return this.end(false);
      } else {
        spec = { ...base, angle: S.ang, mode: 'curl', center: S.C0, curl: { D: S.D } };
        const tl = [clamp((S.p.x - S.C0.x) / (S.w * 0.5), -1, 1), clamp((S.p.y - S.C0.y) / (S.h * 0.5), -1, 1)];
        S.fx = { tilt: tl, glare: [0.5 + tl[0] * 0.38, 0.5 + tl[1] * 0.38], glareAmt: 0.5, foil: 0.7 + 0.3 * Math.min(1, S.D / 40) };
      }
    }

    if (S.state === 'flip') {
      const T = 0.46, t = clamp(S.stateT / T, 0, 1), e = easeOut(t), F = S.flip;
      const a = { x: Math.cos(F.ang), y: Math.sin(F.ang) };
      const fin = { x: S.p.x + F.ext.tmin * a.x, y: S.p.y + F.ext.tmin * a.y };
      const psi = flipStartPsi() * (1 - e);
      const pivot = { x: lerp(F.pivot0.x, fin.x, e), y: lerp(F.pivot0.y, fin.y, e), z: lerp(F.pivot0.z, 16, e) };
      spec = { ...base, angle: F.ang, mode: 'flip', center: S.C0, vp: { x: lerp(S.C0.x, S.p.x, e), y: lerp(S.C0.y, S.p.y, e) }, flip: { psi, pivot } };
      const sw = Math.sin(t * Math.PI);                      // foil flares as the sticker turns over
      S.fx = { tilt: [lerp(0.8, 0, e), lerp(-0.4, 0, e)], glare: [lerp(0.15, 0.5, e), lerp(0.2, 0.5, e)], glareAmt: 0.5 + sw * 0.6, foil: 0.8 + sw * 0.5 };
      S.Cc.x = S.p.x; S.Cc.y = S.p.y; S.lift.x = pivot.z; S.lastC = { x: S.p.x, y: S.p.y };
      if (t >= 1) {
        if (this.hooks.falls) {                      // detached sheets drop away instead of being carried
          S.state = 'fall'; S.stateT = 0; S.tumble = 0;
          S.vel = { x: clamp((S.p.x - S.C0.x) * 1.2, -420, 420), y: 60 };
          S.Cc = { x: S.p.x, y: S.p.y };
        } else { S.state = 'carry'; S.lift.x = 16; S.lift.v = 0; if (S.up) this.drop(); }
      }
    }

    if (S.state === 'carry' || S.state === 'drop' || S.state === 'return') {
      let target = S.p;
      const sTarget = this.hooks.targetSize(S);
      if (S.state === 'carry') {
        const k = 1 - Math.exp(-dt * 16 / (this.hooks.weight ?? 1));   // weight: heavier things lag the finger more
        const nx = S.Cc.x + (target.x - S.Cc.x) * k, ny = S.Cc.y + (target.y - S.Cc.y) * k;
        S.vel.x = lerp(S.vel.x, (nx - S.Cc.x) / dt, 0.35); S.vel.y = lerp(S.vel.y, (ny - S.Cc.y) / dt, 0.35);
        S.Cc.x = nx; S.Cc.y = ny;
        spring(S.scale, sTarget, 160, 18, dt);
        spring(S.lift, 15 + clamp(Math.hypot(S.vel.x, S.vel.y) * 0.012, 0, 9), 120, 14, dt);
        spring(S.rx, clamp(-S.vel.y * 0.00085, -0.42, 0.42) + Math.sin(time * 1.7) * 0.025, 150, 8.5, dt);
        spring(S.ry, clamp(S.vel.x * 0.00085, -0.42, 0.42) + Math.cos(time * 1.3) * 0.025, 150, 8.5, dt);
        spring(S.rz, clamp(S.vel.x * 0.00022, -0.14, 0.14), 110, 8, dt);
      } else {
        S.tau += dt; const T = S.state === 'drop' ? (this.hooks.dropTime ?? 0.17) : 0.4, t = clamp(S.tau / T, 0, 1), e = easeInOut(t), F = S.from;
        S.Cc.x = lerp(F.x, S.to.x, e); S.Cc.y = lerp(F.y, S.to.y, e);
        S.lift.x = lerp(F.lift, 0, easeOut(t));
        const endScale = S.state === 'drop' ? sTarget : 1;
        S.scale.x = lerp(F.scale, endScale, e) * (S.state === 'drop' ? 1 + 0.06 * Math.sin(t * Math.PI) : 1);
        S.rx.x = lerp(F.rx, 0, e); S.ry.x = lerp(F.ry, this.hooks.endRy?.(S) ?? 0, e); S.rz.x = lerp(F.rz, 0, e);   // endRy: a page can land turned over
        if (t >= 1) return this.end(S.state === 'drop');
      }
      spec = { ...base, angle: S.flip.ang, mode: 'flat', center: S.Cc, vp: S.Cc, flat: { scale: S.scale.x, lift: S.lift.x, rx: S.rx.x, ry: S.ry.x, rz: S.rz.x } };
      const tl = [S.ry.x * 2.6, -S.rx.x * 2.6];
      S.fx = { tilt: tl, glare: [0.5 + S.ry.x * 1.1, 0.5 - S.rx.x * 1.1], glareAmt: 0.55 + Math.min(0.5, Math.hypot(S.rx.x, S.ry.x) * 1.4), foil: 0.72 + Math.min(0.4, Math.hypot(S.rx.x, S.ry.x) * 1.2) };
    }

    if (S.state === 'fall') {
      S.vel.y += 1600 * dt; S.Cc.x += S.vel.x * dt; S.Cc.y += S.vel.y * dt;
      S.tumble = Math.min(1.25, S.tumble + dt * 1.6);
      if (S.Cc.y > innerHeight + S.h * 2) { this.hooks.fallen?.(S); return this.finish(); }
      spec = { ...base, angle: S.flip.ang, mode: 'flat', center: S.Cc, vp: S.Cc,
               flat: { scale: 1, lift: 0, rx: S.tumble, ry: 0.12 * Math.sin(time * 2.4), rz: 0.16 * Math.sin(time * 1.7) } };
      S.fx = { tilt: [0, 0], glare: [0.5 + 0.25 * Math.sin(time * 2), 0.4], glareAmt: 0.6, foil: 0.9 };
    }

    if (!spec) return;
    const mesh = buildMesh(spec, this.buf); this.buf = mesh.data;
    const lift = S.state === 'peel' || S.state === 'release' ? 0 : 0;
    this.r.draw(S.rec, mesh, { time, ...S.fx, shadow: 0.3, shadowDrop: lift });
  };
}
