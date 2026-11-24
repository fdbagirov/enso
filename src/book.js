// Альбом «Локация»: развороты и мягкие листы, которые переворачиваются через корешок.
// Лист — правая половина экрана, нарезанная на вертикальные полосы, сцепленные друг с другом
// как шарниры: каждая полоса поворачивается относительно предыдущей. Внешний край листа
// поднимается первым и тянет за собой остальную страницу — получается изгиб бумаги, а не
// поворот жёсткой пластины.
// На лицевой стороне полос — правая страница текущего разворота, на обороте — левая страница
// следующего. Это копии разворотов; вместо видео в них кадр, снятый в момент начала перелистывания.

const STRIPS = 14;
// Насколько край листа опережает корешок (0 — жёсткий лист, больше — сильнее изгиб)
const LEAD = 0.55;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (q) => (q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);

function cloneSpread(spread) {
  const el = spread.cloneNode(true);
  el.removeAttribute('aria-label');
  el.removeAttribute('data-spread');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  el.querySelectorAll('img').forEach((img) => (img.alt = ''));
  const video = el.querySelector('video');
  const frame = new Image();
  frame.className = 'spread__canvas' + (video.classList.contains('is-mirror') ? ' is-mirror' : '');
  frame.alt = '';
  frame.src = video.getAttribute('poster');
  video.replaceWith(frame);
  return { el, frame };
}

// offset — сдвиг копии разворота в ширинах полосы, чтобы в окне полосы оказался нужный кусок
function makeFace(side, spread, offset) {
  const face = document.createElement('div');
  face.className = `leaf__face leaf__${side}`;
  const { el, frame } = cloneSpread(spread);
  el.style.left = `${offset * 100}%`;
  el.style.width = `${STRIPS * 2 * 100}%`;
  const shade = document.createElement('i');
  shade.className = 'leaf__shade';
  face.append(el, shade);
  return { face, frame, shade };
}

function makeCoverFace() {
  const face = document.createElement('div');
  face.className = 'leaf__face leaf__back leaf__cover';
  const shade = document.createElement('i');
  shade.className = 'leaf__shade';
  face.append(shade);
  return { face, shade };
}

// Текущий кадр видео снимается один раз в начале перелистывания.
const grab = document.createElement('canvas');
function snapshot(video) {
  if (video.readyState < 2) return null;
  const w = Math.min(1280, video.videoWidth);
  grab.width = w;
  grab.height = Math.round((w * video.videoHeight) / video.videoWidth);
  grab.getContext('2d').drawImage(video, 0, 0, grab.width, grab.height);
  return grab.toDataURL('image/jpeg', 0.85);
}

export function buildBook(root) {
  const spreads = [...root.querySelectorAll(':scope > .spread')];
  const videos = spreads.map((s) => s.querySelector('video'));

  const closer = document.createElement('div');
  closer.className = 'leaf leaf--closing';
  closer.setAttribute('aria-hidden', 'true');
  closer.inert = true;
  root.append(closer);

  const leaves = [...root.querySelectorAll(':scope > .leaf')].map((leaf, i) => {
    const closing = leaf === closer;
    leaf.replaceChildren();
    const strips = [];
    const frames = [[], []];
    let parent = leaf;
    for (let k = 0; k < STRIPS; k++) {
      const strip = document.createElement('div');
      strip.className = 'strip' + (k === 0 ? ' strip--root' : '');
      // Лицо полосы k — кусок правой страницы; оборот после переворота ляжет на кусок левой
      const front = makeFace('front', spreads[i], -(STRIPS + k));
      const back = closing
        ? makeCoverFace()
        : makeFace('back', spreads[i + 1], -(STRIPS - k - 1));
      strip.append(front.face, back.face);
      parent.append(strip);
      parent = strip;
      strips.push({ el: strip, front: front.shade, back: back.shade, pos: (k + 0.5) / STRIPS });
      frames[0].push(front.frame);
      if (!closing) frames[1].push(back.frame);
    }
    return { el: leaf, strips, frames, sources: videos.slice(i, i + (closing ? 1 : 2)), p: -1 };
  });

  let active = -1;

  return {
    spreads,
    videos,
    leaves,
    cast: root.querySelector('.book__cast'),
    closer,
    // Лист i начинает движение: на его копии кладём текущие кадры обоих видео
    setActiveLeaf(i) {
      if (i === active) return;
      active = i;
      if (i < 0) return;
      leaves[i].sources.forEach((video, side) => {
        const src = snapshot(video);
        if (src) leaves[i].frames[side].forEach((img) => (img.src = src));
      });
    },
    // p — прогресс перелистывания 0…1
    renderLeaf(i, p) {
      const leaf = leaves[i];
      if (leaf.p === p) return;
      leaf.p = p;
      let prev = 0;
      const lift = Math.sin(Math.PI * p) * 40;
      leaf.strips.forEach((s, k) => {
        // Абсолютный угол полосы: край (pos → 1) опережает корешок (pos → 0)
        const q = easeInOut(clamp01(p * (1 + LEAD) - LEAD * (1 - s.pos)));
        const angle = -180 * q;
        const rel = angle - prev;
        prev = angle;
        s.el.style.transform = (k === 0 ? `translateZ(${lift.toFixed(1)}px) ` : '') + `rotateY(${rel.toFixed(3)}deg)`;
        // Свет: лицо темнеет, разворачиваясь от зрителя; оборот светлеет, ложась на страницу
        const c = Math.cos((angle * Math.PI) / 180);
        s.front.style.opacity = (((1 - c) / 2) * 0.8).toFixed(3);
        s.back.style.opacity = (((1 + c) / 2) * 0.8).toFixed(3);
      });
    },
  };
}
