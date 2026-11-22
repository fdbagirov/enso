// Фоновые карточки. Координаты — в пикселях макетов 1440×900:
//   hero  — экран «v2 · 01 Хиро» (127:224)
//   story — экраны глав «v2 · 02 Глава 2–4» (127:278 / 127:662 / 127:911)
// null означает, что в этом состоянии карточки нет: она проявляется или растворяется.
// layers — слои картинки снизу вверх; crop — кадрирование в % от карточки.
// В каждой карточке один видимый слой (нижние слои Figma закрыты верхним и только зря грузились),
// и в Hero и главах (блоки 1–4) ни одно фото не повторяется. Люди — оригиналы генераций (img/people).

const img = (name) => `/img/${name}.webp`;

const CROP_BL = { w: 275.22, h: 225.85, l: -50.86, t: -25.61 };
const CROP_R = { w: 236.5, h: 220.55, l: -136.93, t: -10.19 };
const CROP_PORTRAIT = { w: 222.93, h: 550, l: -67.48, t: -214.61 };

const L = (name, crop) => ({ src: img(name), crop });

const P = (name, crop) => L(`people/${name}`, crop);

export const CARDS = [
  { id: 'top', layers: [L('2d4da')],
    hero: { x: 1040, y: -50, w: 98, h: 139, o: 0.4 },
    story: { x: 1152.79, y: 6.61, w: 85.109, h: 120.715, o: 0.4 } },
  { id: 'bl1', layers: [L('27475', CROP_BL)],
    hero: { x: 205.91, y: -32.32, w: 117.787, h: 165.638, o: 1 },
    story: { x: 161.82, y: 248.04, w: 83.372, h: 117.241, o: 1 } },
  { id: 'painting1', layers: [P('sofa')],
    hero: { x: -31, y: -20, w: 131, h: 66, o: 1 },
    story: null },
  { id: 'r', layers: [L('49623', CROP_R)],
    hero: { x: 1303.42, y: 130.07, w: 153.157, h: 207.372, o: 1 },
    story: { x: 1349.93, y: 119.5, w: 98.135, h: 132.874, o: 1 } },
  { id: 'l', layers: [L('9fec3')],
    hero: { x: 156.38, y: 551.78, w: 172.174, h: 210.435, o: 1 },
    story: { x: 226.09, y: 6.61, w: 93.793, h: 114.636, o: 1 } },
  { id: 'manuscript', layers: [P('mother-baby')],
    hero: { x: 39, y: 184, w: 119, h: 148, o: 0.4 },
    story: { x: -15.34, y: 209.82, w: 103.346, h: 128.531, o: 0.4 } },
  { id: 'portrait', layers: [P('kneel-dog', CROP_PORTRAIT)],
    hero: { x: -40, y: 468, w: 150, h: 76, o: 1 },
    story: { x: -41.39, y: 419.12, w: 132.005, h: 66.003, o: 1 } },
  { id: 'painting2', layers: [P('shoulders')],
    hero: { x: 970, y: 760, w: 131, h: 66, o: 0.2 },
    story: { x: 1127.61, y: 577.18, w: 115.504, h: 57.318, o: 0.2 } },
  { id: 'bl2', layers: [L('126d6')], flipped: true,
    hero: { x: 308.61, y: 821.61, w: 83.372, h: 117.241, o: 1 },
    story: { x: 140.11, y: 503.36, w: 83.372, h: 117.241, o: 0.2 } },
  { id: 'tiffany', layers: [L('58f26')],
    hero: { x: 1349, y: 843, w: 120, h: 74, o: 1 },
    story: { x: 1339.51, y: 530.28, w: 105.951, h: 64.266, o: 1 } },
  { id: 'bl3', layers: [P('mother-white')],
    hero: { x: 10, y: 752, w: 96, h: 135, o: 0.2 },
    story: null },
  { id: 'rembr1', layers: [L('da331')],
    hero: { x: 1191, y: 591, w: 69, h: 120, o: 0.4 },
    story: { x: 1155.4, y: 179.43, w: 59.923, h: 104.215, o: 0.4 } },
  { id: 'rembrandt1', layers: [P('flowers')],
    hero: { x: 1247, y: 540, w: 149, h: 184, o: 1 },
    story: { x: 1243.11, y: 315.78, w: 129.4, h: 159.796, o: 1 } },
  { id: 'rembr2', layers: [P('armchair')],
    hero: null,
    story: { x: -4.92, y: 595.42, w: 59.923, h: 104.215, o: 0.4 } },
  { id: 'rembr3', layers: [P('pink')],
    hero: null,
    story: { x: 146.19, y: 753.48, w: 59.923, h: 104.215, o: 0.4 } },
  { id: 'rembrandt2', layers: [P('baking')],
    hero: null,
    story: { x: 1316.06, y: 679.66, w: 129.4, h: 159.796, o: 1 } },
];

// Все растровые файлы, которые нужно дождаться прелоадеру
export const IMAGES = [
  ...new Set([
    ...CARDS.flatMap((c) => c.layers.map((l) => l.src)),
    img('3f63f'), img('people/sleeping-family'), '/img/loc/cyclist-frame0.webp',
  ]),
];

export function buildCard(card) {
  const par = document.createElement('div');
  par.className = 'card-par';
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = card.id;
  const inner = document.createElement('div');
  inner.className = 'card__img' + (card.flipped ? ' is-flipped' : '');
  for (const layer of card.layers) {
    const image = new Image();
    image.alt = '';
    image.decoding = 'async';
    image.src = layer.src;
    if (layer.crop) {
      const crop = document.createElement('div');
      crop.className = 'card__crop';
      Object.assign(image.style, {
        width: `${layer.crop.w}%`, height: `${layer.crop.h}%`,
        left: `${layer.crop.l}%`, top: `${layer.crop.t}%`,
      });
      crop.append(image);
      inner.append(crop);
    } else {
      image.className = 'card__layer';
      inner.append(image);
    }
  }
  el.append(inner);
  par.append(el);
  return { par, el, inner };
}
