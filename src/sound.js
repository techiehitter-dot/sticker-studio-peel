// Procedural sticker sounds (Web Audio, no files): a peel that follows your pull speed,
// a tick as it comes free, and a soft thump when it sticks. Created on first touch (browser rule).
let ctx, master, noise, peel = null;
let flipBuf = null, flipCur = null;    // public/sounds/page-flip.mp3: a page lifting free
const FLIP_URL = `${import.meta.env.BASE_URL}sounds/page-flip.mp3`;
let peelBuf = null;     // public/sounds/peel.mp3: the rip while a sticker is pulled, decoded once
// the file: silence to 0.38s, then the rip (0.40-1.30s, loops while pulling), then the snap at 1.30s when it comes free
const RIP_START = 0.38, RIP_LOOP_START = 0.40, SNAP_AT = 1.30, SNAP_LEN = 0.22;
const PEEL_URL = `${import.meta.env.BASE_URL}sounds/peel.mp3`;
let enabled = localStorage.getItem('sticker-sound') !== 'off';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

let loadingFlip = false;
async function loadFlip() {
  loadingFlip = true;
  try {
    const res = await fetch(FLIP_URL);
    flipBuf = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (err) { console.warn('page flip sound failed to load', err); }
}
let loadingPeel = false;
async function loadPeel() {
  loadingPeel = true;
  try {
    const res = await fetch(PEEL_URL);
    peelBuf = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (err) { console.warn('peel sound failed to load', err); }
}

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); let burst = 0;
    for (let i = 0; i < d.length; i++) { if (Math.random() < 0.0025) burst = 1; burst *= 0.985; d[i] = (Math.random() * 2 - 1) * (0.35 + burst * 1.1); }
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (!peelBuf && !loadingPeel) loadPeel();
  if (!flipBuf && !loadingFlip) loadFlip();
  return ctx;
}

export const sound = {
  get enabled() { return enabled; },
  set(on) { enabled = on; localStorage.setItem('sticker-sound', on ? 'on' : 'off'); if (!on) this.peelStop(); },
  unlock() { ensure(); },

  // continuous adhesive "rrrip": loudness and brightness follow pull speed and progress
  peelStart(kind) {
    if (kind === 'page' || !ensure() || peel) return;   // pages are quiet while pulled: the flip is the sound
    if (peelBuf) {
      const src = ctx.createBufferSource(); src.buffer = peelBuf; src.loop = true;
      src.loopStart = RIP_LOOP_START; src.loopEnd = SNAP_AT;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(master); src.start(0, RIP_START);
      peel = { src, g, file: true };
      return;
    }
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1.1;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 650;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master); src.start(0, Math.random());
    peel = { src, bp, g };
    this.tick(0.16);
  },
  peelUpdate(speed, progress, kind) {
    if (!peel || kind === 'page') return; const t = ctx.currentTime, s = clamp(Math.abs(speed) / 420, 0, 1);
    if (peel.file) {   // the file rises with pull speed and sharpens a little with progress
      peel.g.gain.setTargetAtTime(Math.pow(s, 0.7) * 0.8 + 0.04, t, 0.035);
      peel.src.playbackRate.setTargetAtTime(0.9 + s * 0.25 + progress * 0.1, t, 0.06);
      return;
    }
    peel.g.gain.setTargetAtTime(Math.pow(s, 0.7) * 0.42, t, 0.035);
    peel.bp.frequency.setTargetAtTime(1500 + progress * 2600 + s * 1400, t, 0.05);
    peel.src.playbackRate.setTargetAtTime(0.85 + s * 0.5, t, 0.06);
  },
  peelStop() {
    if (!peel) return; const p = peel; peel = null;
    p.g.gain.cancelScheduledValues(ctx.currentTime); p.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => { try { p.src.stop(); } catch {} }, 250);
  },

  tick(vol = 0.25) { if (ensure()) shot({ type: 'bandpass', f: 3200, q: 1.5, dur: 0.035, vol }); },
  // comes free of the sheet: airy snap going upwards
  // the paper flip: starts the moment a page starts to lift, swells with how far it has come,
  // and stops when it lands or is put back. So its length follows the turn.
  flipStart() {
    if (!ensure() || !flipBuf || flipCur) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = flipBuf; g.gain.value = 0.0001;
    src.connect(g); g.connect(master); src.start(0, 0.5);
    flipCur = { src, g };
  },
  flipUpdate(frac) { if (flipCur) flipCur.g.gain.setTargetAtTime(0.3 + clamp(frac, 0, 1) * 2.1, ctx.currentTime, 0.05); },
  flipEnd() {
    if (!flipCur) return;
    const f = flipCur; flipCur = null;
    f.g.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => { try { f.src.stop(); } catch {} }, 300);
  },
  detach(kind) {
    if (!ensure()) return;
    if (kind === 'page') return;   // pages have their own paper flip, see flipStart
    if (peelBuf) {   // the snap in the file: plays once, as the sticker comes fully free
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = peelBuf; g.gain.value = 0.9;
      src.connect(g); g.connect(master); src.start(0, SNAP_AT, SNAP_LEN);
      return;
    }
    shot({ type: 'highpass', f: 2600, q: 0.7, dur: 0.14, vol: 0.28, sweep: 5200 }); this.tick(0.3); },
  // pressed onto the page: low pat + crisp tap
  stick(kind) {
    if (kind === 'page' || !ensure()) return; thump(190, 66, 0.5, 0.1);
    shot({ type: 'bandpass', f: 2700, q: 0.9, dur: 0.05, vol: 0.38 }); shot({ type: 'lowpass', f: 900, q: 0.5, dur: 0.07, vol: 0.28 });
    navigator.vibrate?.(12);
  },
  // pressed back onto the sheet: softer
  restick(kind) { if (kind === 'page' || !ensure()) return; thump(150, 85, 0.24, 0.08); shot({ type: 'bandpass', f: 2200, q: 0.8, dur: 0.05, vol: 0.22 }); navigator.vibrate?.(6); }
};

function shot({ type, f, q, dur, vol, sweep }) {
  const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noise;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(master); src.start(t, Math.random() * 1.5, dur + 0.05);
}
function thump(f0, f1, vol, dur) {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.04);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.06);
}
