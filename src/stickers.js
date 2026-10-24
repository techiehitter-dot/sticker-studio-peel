// Sticker catalogue. Art is cut from kawaii-sticker-sheet.png (see public/stickers).
// `foil` picks the holographic finish used by both the CSS foil and the WebGL shader.
export const BASE = import.meta.env?.BASE_URL ?? '/';

export const FOILS = ['holo', 'glitter', 'prism', 'aurora'];

const AR = {  cat: 0.935, frog: 1.038, corgi: 0.893, boba: 0.693, bunny: 0.742, berry: 0.872, star: 1.019, panda: 0.87, cake: 0.979, penguin: 1, rainbow: 1.518, bear: 0.862, lilac: 1.215, avocado: 0.909, cupcake: 0.862, chick: 0.846, paw: 1.038 };

export const STICKERS = [
  { id: 'cat',     name: 'Miso',      foil: 'holo',    tilt: -6 },
  { id: 'frog',    name: 'Mochi',     foil: 'glitter', tilt: 5 },
  { id: 'corgi',   name: 'Waffle',    foil: 'aurora',  tilt: -4 },
  { id: 'boba',    name: 'Bubbles',   foil: 'prism',   tilt: 4 },
  { id: 'bunny',   name: 'Blossom',   foil: 'holo',    tilt: 3 },
  { id: 'berry',   name: 'Berry',     foil: 'glitter', tilt: -5 },
  { id: 'star',    name: 'Twinkle',   foil: 'prism',   tilt: 6 },
  { id: 'panda',   name: 'Bamboo',    foil: 'aurora',  tilt: 4 },
  { id: 'cake',    name: 'Shortcake', foil: 'holo',    tilt: -3 },
  { id: 'penguin', name: 'Pip',       foil: 'glitter', tilt: -4 },
  { id: 'rainbow', name: 'Skye',      foil: 'prism',   tilt: 3 },
  { id: 'bear',    name: 'Honey',     foil: 'aurora',  tilt: -5 },
  { id: 'lilac',   name: 'Lilac',     foil: 'holo',    tilt: 4 },
  { id: 'avocado', name: 'Avo',       foil: 'glitter', tilt: -4 },
  { id: 'cupcake', name: 'Sprinkle',  foil: 'prism',   tilt: 5 },
  { id: 'chick',   name: 'Sunny',     foil: 'aurora',  tilt: -3 },
  { id: 'paw',     name: 'Toebean',   foil: 'holo',    tilt: 4 }
].map(s => ({ ...s, ar: AR[s.id], url: `${BASE}stickers/${s.id}.png` }));

// Kawaii Unicorns pack: 12 die-cut stickers cut from the pastel unicorn sheet.
// `ar` is width / height, same convention as the originals above.
export const UNICORNS = [
  { id: 'nimbus',   name: 'Nimbus',   foil: 'holo',    tilt: -4, ar: 0.753 },
  { id: 'wink',     name: 'Wink',     foil: 'glitter', tilt: 5,  ar: 0.833 },
  { id: 'dozy',     name: 'Dozy',     foil: 'aurora',  tilt: -3, ar: 1.052 },
  { id: 'leap',     name: 'Leap',     foil: 'prism',   tilt: 4,  ar: 0.826 },
  { id: 'lovebug',  name: 'Lovebug',  foil: 'holo',    tilt: -5, ar: 1.037 },
  { id: 'starlet',  name: 'Starlet',  foil: 'glitter', tilt: 3,  ar: 0.855 },
  { id: 'shades',   name: 'Shades',   foil: 'aurora',  tilt: -4, ar: 0.879 },
  { id: 'blinkie',  name: 'Blinkie',  foil: 'prism',   tilt: 4,  ar: 0.888 },
  { id: 'arc',      name: 'Arc',      foil: 'holo',    tilt: -2, ar: 1.393 },
  { id: 'cuddles',  name: 'Cuddles',  foil: 'glitter', tilt: 5,  ar: 0.905 },
  { id: 'sparkle',  name: 'Sparkle',  foil: 'aurora',  tilt: -5, ar: 0.935 },
  { id: 'frosting', name: 'Frosting', foil: 'prism',   tilt: 3,  ar: 0.688 }
].map(s => ({ ...s, url: `${BASE}unicorns/${s.id}.png` }));

// Packs the shop can hand out. `strip` is the tear-off band, `body` is everything under it.
export const PACKS = [
  {
    id: 'kawaii-unicorns',
    name: 'Kawaii Unicorns',
    strip: `${BASE}pack/unicorn-strip.png`,
    body: `${BASE}pack/unicorn-body.png`,
    stripBack: `${BASE}pack/unicorn-strip-back.jpg`,
    stickers: UNICORNS
  }
];

export const byId = Object.fromEntries([...STICKERS, ...UNICORNS].map(s => [s.id, s]));
