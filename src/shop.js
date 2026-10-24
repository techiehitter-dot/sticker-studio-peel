// The pack shop. It takes the place of "Open a pack" once every pack you had has been opened.
// For now the only thing on sale is the Kawaii Unicorns pack.
import './shop.css';

export function openShop({ packs, onBuy }) {
  const root = document.createElement('div');
  root.className = 'shop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Pack shop');
  root.innerHTML = `
    <div class="shop-sheet">
      <button class="shop-close" type="button" aria-label="Close">×</button>
      <p class="shop-eyebrow">PACK SHOP</p>
      <h2 class="shop-title">Fresh packs</h2>
      <p class="shop-lede">You've opened every pack you had. Here's the next one.</p>
      <div class="shop-items">${packs.map(p => `
        <article class="shop-item">
          <div class="shop-art"><img src="${p.body}" alt="" draggable="false"/></div>
          <div class="shop-meta">
            <h3>${p.name}</h3>
            <p>${p.stickers.length} stickers</p>
            <button class="shop-buy" type="button" data-id="${p.id}">Get pack<small>free for now</small></button>
          </div>
        </article>`).join('')}
      </div>
    </div>`;

  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    root.classList.add('closing');
    setTimeout(() => root.remove(), 320);
  }
  root.querySelector('.shop-close').onclick = close;
  root.addEventListener('click', e => { if (e.target === root) close(); });
  root.querySelectorAll('.shop-buy').forEach(b => b.onclick = () => {
    const pack = packs.find(p => p.id === b.dataset.id);
    if (pack) onBuy(pack);
    close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
}
