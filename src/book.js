// Альбом «Локация»: развороты и листы, которые переворачиваются через корешок.
// Лист — правая половина экрана, повёрнутая вокруг корешка (rotateY 0 → -180°).
// На лицевой стороне — правая страница текущего разворота, на обороте — левая страница
// следующего. Обе стороны — копии разворотов; видео в копиях не дублируется, а кадр
// перерисовывается из оригинального <video> в <canvas>, пока лист в движении.
import gsap from 'gsap';

function cloneSpread(spread) {
  const el = spread.cloneNode(true);
  el.removeAttribute('aria-label');
  el.removeAttribute('data-spread');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  el.querySelectorAll('img').forEach((img) => (img.alt = ''));
  const video = el.querySelector('video');
  const canvas = document.createElement('canvas');
  canvas.className = 'spread__canvas' + (video.classList.contains('is-mirror') ? ' is-mirror' : '');
  video.replaceWith(canvas);
  return { el, canvas, source: spread.querySelector('video') };
}

// Кадр видео в canvas по правилам object-fit: cover
function drawCover(canvas, video) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
  const src = video.readyState >= 2 ? video : null;
  if (!src) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const s = Math.max(w / vw, h / vh);
  const dw = vw * s;
  const dh = vh * s;
  canvas.getContext('2d').drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function buildBook(root) {
  const spreads = [...root.querySelectorAll(':scope > .spread')];
  const videos = spreads.map((s) => s.querySelector('video'));
  const leaves = [...root.querySelectorAll(':scope > .leaf')].map((leaf, i) => {
    const front = cloneSpread(spreads[i]);
    const back = cloneSpread(spreads[i + 1]);
    leaf.querySelector('.leaf__front').prepend(front.el);
    leaf.querySelector('.leaf__back').prepend(back.el);
    return {
      el: leaf,
      faces: [front, back],
      shades: [...leaf.querySelectorAll('.leaf__shade')],
    };
  });

  let active = -1;
  gsap.ticker.add(() => {
    if (active < 0) return;
    for (const f of leaves[active].faces) drawCover(f.canvas, f.source);
  });

  return {
    spreads,
    videos,
    leaves,
    cast: root.querySelector('.book__cast'),
    // Какой лист сейчас в движении (-1 — никакой): только его копии получают кадры видео
    setActiveLeaf(i) {
      if (i === active) return;
      active = i;
      if (i >= 0) for (const f of leaves[i].faces) drawCover(f.canvas, f.source);
    },
  };
}
