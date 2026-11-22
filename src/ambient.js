// Живой коллаж: элементы мягко следуют за курсором (каждый со своей глубиной) и сверхмедленно
// покачиваются, когда мышь стоит на месте.
// Сдвиг пишется в CSS-свойства `translate` и `rotate`, а не в `transform`, поэтому не спорит
// со скролл-анимациями GSAP на тех же элементах: браузер просто складывает их.
import gsap from 'gsap';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// На тач-устройствах реакции на курсор нет — только фоновое «дыхание»
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

const items = [];

/**
 * @param {Element|Element[]|NodeList} targets элементы, которые двигаются одинаково
 *   (оригинал и его копии на переворачиваемом листе)
 * @param {object} o
 *   amp  — амплитуда сдвига от курсора, px макета (умножается на unit())
 *   rot  — амплитуда поворота от курсора, градусы
 *   dir  — -1: от курсора (глубина), 1: навстречу курсору
 *   duration, ease — сглаживание quickTo
 *   idle — { y, r, duration, phase } покачивание в покое; phase 0…1 разводит элементы в противофазу
 */
export function addAmbient(targets, o = {}) {
  const els = [...(targets?.length !== undefined ? targets : [targets])].filter(Boolean);
  if (!els.length || reduceMotion) return;
  const { amp = 0, rot = 0, dir = -1, duration = 1.1, ease = 'power3.out', idle, active = () => true } = o;
  // Sub-30px movement reads as jitter while scrolling, including idle oscillation.
  if (amp < 30) return;
  const m = { x: 0, y: 0, r: 0 };
  const rest = { y: 0, r: 0 };
  const q = { duration, ease };
  const item = {
    els, amp, rot, dir, m, rest, active,
    qx: gsap.quickTo(m, 'x', q),
    qy: gsap.quickTo(m, 'y', q),
    qr: gsap.quickTo(m, 'r', q),
  };
  if (idle) {
    const { y = 5, r = 0.6, duration: d = 5, phase = 0 } = idle;
    // Разные периоды по y и повороту — движение не выглядит механическим
    gsap.fromTo(rest, { y: -y }, { y, duration: d, ease: 'sine.inOut', repeat: -1, yoyo: true })
      .seek(d * 2 * phase);
    gsap.fromTo(rest, { r: -r }, { r, duration: d * 1.17, ease: 'sine.inOut', repeat: -1, yoyo: true })
      .seek(d * 2.34 * ((phase + 0.35) % 1));
  }
  items.push(item);
}

let unit = () => 1;
let last = { x: 0, y: 0 };

function aim(nx, ny) {
  last = { x: nx, y: ny };
  const u = unit();
  for (const it of items) {
    it.qx(nx * it.amp * it.dir * u);
    it.qy(ny * it.amp * it.dir * u);
    it.qr(nx * it.rot * it.dir);
  }
}

function render() {
  for (const it of items) {
    const enabled = it.active() && canHover;
    if (enabled !== it.enabled) {
      it.enabled = enabled;
      for (const el of it.els) {
        el.classList.toggle('is-parallax', enabled);
        if (!enabled) { el.style.translate = ''; el.style.rotate = ''; }
      }
    }
    if (!enabled) continue;
    const t = `${it.m.x}px ${it.m.y + it.rest.y * unit()}px 0px`;
    const r = `${it.m.r + it.rest.r}deg`;
    for (const el of it.els) {
      el.style.translate = t;
      el.style.rotate = r;
    }
  }
}

export function startAmbient(unitFn) {
  if (reduceMotion) return;
  if (unitFn) unit = unitFn;
  gsap.ticker.add(render);
  if (!canHover) return;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });
  // Курсор ушёл из окна — всё мягко возвращается на место
  document.documentElement.addEventListener('mouseleave', () => aim(0, 0));
  addEventListener('resize', () => aim(last.x, last.y));
}

export const hoverEnabled = canHover && !reduceMotion;
