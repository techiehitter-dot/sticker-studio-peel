// Page turning. Nothing is dragged: a press turns the sheet, which swings whole over the spine
// (no curl). Ordinary pages turn quickly. The cover is a board, so it turns slowly and heavily.
import './book.css';
import { sound } from './sound.js';

const SPEC = {
  page: { s: 0.75, ease: 'cubic-bezier(.3, .7, .2, 1)' },
  cover: { s: 1.3, ease: 'cubic-bezier(.6, 0, .25, 1)' }
};

export class PageTurner {
  // book: the book element. sheetDom(k) -> a fresh DOM front for sheet k (sheet 0 is the cover).
  // mount(el): called once an element is in the book, so it can paint its ink.
  // setLiveHidden(bool): hides the live page and cover while a sheet is in the air.
  // getIndex() -> sheets turned so far (the sheet now on the right). onTurn(newIndex) when it lands.
  constructor({ book, sheetDom, mount, setLiveHidden, getIndex, onTurn, canTurn = () => true }) {
    Object.assign(this, { book, sheetDom, mount, setLiveHidden, getIndex, onTurn, canTurn });
    this.busy = false;
  }

  forward() { const i = this.getIndex(); if (!this.busy && this.canTurn()) this.run(i, i + 1); }
  back() { const i = this.getIndex(); if (!this.busy && this.canTurn() && i > 0) this.run(i, i - 1); }

  run(from, to) {
    const forward = to > from, heavy = from === 0 || to === 0;
    const spec = heavy ? SPEC.cover : SPEC.page;
    // forward: the sheet on the right (from) swings to the left. back: the sheet on the left (to) swings right.
    const moving = forward ? from : to;
    this.busy = true;
    sound.flipStart();
    this.setLiveHidden(true);

    // what is revealed underneath while the sheet is in the air
    const base = this.sheetDom(forward ? to : from);
    base.classList.add('turn-base');
    this.book.appendChild(base); this.mount(base);

    const leaf = document.createElement('div');
    leaf.className = `turn-leaf${heavy ? ' heavy' : ''}`;
    const front = this.sheetDom(moving); front.classList.add('face', 'front');
    const back = document.createElement('div');
    back.className = `face back scrapbook-page paper-bg${moving === 0 ? ' endpaper' : ''}`;
    leaf.append(front, back);
    this.book.appendChild(leaf); this.mount(leaf);

    // a forward turn starts face-up and ends showing its back; a back turn is the reverse
    leaf.style.transform = `rotateY(${forward ? 0 : -180}deg)`;
    const end = forward ? -180 : 0;

    let done = false;
    const finish = () => {
      if (done) return; done = true;
      leaf.remove(); base.remove();
      sound.flipEnd();
      this.busy = false;
      this.onTurn(to);
    };
    leaf.addEventListener('transitionend', e => { if (e.target === leaf) finish(); });
    setTimeout(finish, spec.s * 1000 + 250);   // safety net in case transitionend never fires

    requestAnimationFrame(() => requestAnimationFrame(() => {
      leaf.style.transition = `transform ${spec.s}s ${spec.ease}`;
      leaf.style.transform = `rotateY(${end}deg)`;
    }));
  }
}
