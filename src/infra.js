// Инфраструктура: карта района в CSS 3D, метки на ней и выбор места в списке.
// Карта — плоская текстура, повёрнутая в пространстве (как в макете 130:4929):
//   perspective 829.58px → translateZ(97px) rotateX(63°) rotateZ(-63°).
// Пины, комплекс и фото не лежат в плоскости (иначе их бы перекосило) — это обычные элементы,
// которые стоят над точками карты: точка пересчитывается в экранную тем же преобразованием,
// поэтому при наклоне карты метки едут вместе с ней, оставаясь вертикальными, как таблички.
import gsap from 'gsap';

const D = 829.583; // perspective
const S = 1858.542; // сторона текстуры
const L = -216.18; // положение текстуры в окне карты
const T = -770;
const Z = 97.014;
const VIEW = { x: 523, y: 212, w: 1100, h: 687.5 }; // окно карты в макете 1440×900
const REST = { rx: 63, rz: -63 };
const TILT = 1.5; // наклон карты от курсора, градусы — едва заметное «дыхание» в пространстве
const rad = Math.PI / 180;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

// Точка текстуры (u, v) → координаты в макете 1440×900 при поворотах rx, rz
function project(u, v, rx, rz) {
  const x = u - S / 2;
  const y = v - S / 2;
  const c = Math.cos(rz * rad);
  const s = Math.sin(rz * rad);
  const x1 = x * c - y * s;
  const y1 = x * s + y * c;
  const y2 = y1 * Math.cos(rx * rad);
  const z2 = y1 * Math.sin(rx * rad) + Z;
  const X = L + S / 2 + x1;
  const Y = T + S / 2 + y2;
  const k = D / (D - z2);
  return [VIEW.x + VIEW.w / 2 + (X - VIEW.w / 2) * k, VIEW.y + VIEW.h / 2 + (Y - VIEW.h / 2) * k];
}

// Обратная задача: где на текстуре лежит точка макета (метки заданы в макете там, где их нарисовал
// дизайнер). Луч из глаза зрителя через точку экрана пересекается с плоскостью карты.
function unproject(fx, fy) {
  const c = Math.cos(REST.rz * rad), s = Math.sin(REST.rz * rad);
  const ca = Math.cos(REST.rx * rad), sa = Math.sin(REST.rx * rad);
  const eu = [c, s * ca, s * sa]; // ось u текстуры в пространстве
  const ev = [-s, c * ca, c * sa]; // ось v
  const ox = VIEW.w / 2, oy = VIEW.h / 2; // точка схода перспективы
  const C = [L + S / 2 - ox, T + S / 2 - oy, Z - D]; // центр текстуры относительно глаза
  const dir = [fx - VIEW.x - ox, fy - VIEW.y - oy, -D]; // луч взгляда
  // dir·t − eu·a − ev·b = C → решаем 3×3 по Крамеру
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [0, 1, 2].map((r) => [dir[r], -eu[r], -ev[r]]);
  const det = det3(M);
  const col = (k) => M.map((row, r) => row.map((v, j) => (j === k ? C[r] : v)));
  const a = det3(col(1)) / det;
  const b = det3(col(2)) / det;
  return [a + S / 2, b + S / 2];
}

export function buildInfra(root) {
  const frame = root.querySelector('.infra__frame');
  const map = root.querySelector('.infra__map');
  const plane = root.querySelector('.infra__plane');
  const marks = [...root.querySelectorAll('.mk')].map((el) => {
    const [fx, fy] = el.dataset.anchor.split(',').map(Number);
    return { el, uv: unproject(fx, fy) };
  });
  const places = [...root.querySelectorAll('.place')];
  const pins = [...root.querySelectorAll('.mk--pin')];
  const photos = [...root.querySelectorAll('.mk--photo')];

  // Состояние карты: rx/rz — повороты (скролл-переход), sc — масштаб окна карты; tilt — от мыши
  const state = { rx: REST.rx, rz: REST.rz, sc: 1, op: 1 };
  const tilt = { x: 0, z: 0 };
  let dirty = true;

  let visible = false;
  let bounds = { left: 0, top: 0, width: 1, height: 1 };
  const resize = (w, h) => {
    const s = Math.min(w / 1440, h / 900);
    frame.style.setProperty('--s', s);
    // The unscaled map view is fixed in the design frame. No pointer-time layout read.
    bounds = { left: (w - 1440 * s) / 2 + VIEW.x * s, top: (h - 900 * s) / 2 + VIEW.y * s, width: VIEW.w * s, height: VIEW.h * s };
    dirty = true;
  };

  function render() {
    if (!dirty || !visible) return;
    dirty = false;
    const rx = state.rx + tilt.x;
    const rz = state.rz + tilt.z;
    plane.style.transform = `translateZ(${Z}px) rotateX(${rx}deg) rotateZ(${rz}deg)`;
    map.style.transform = `scale(${state.sc})`;
    map.style.opacity = state.op;
    for (const m of marks) {
      const [x, y] = project(m.uv[0], m.uv[1], rx, rz);
      // Independent translate composes with the GSAP transform used for intro/selection.
      m.el.style.translate = `${x}px ${y}px 0px`;
    }
  }
  gsap.ticker.add(render);
  const touch = () => (dirty = true);

  /* Наклон «в пространстве» от курсора над картой, с инерцией */
  let active = false;
  if (canHover && !reduceMotion) {
    const q = { duration: 1.6, ease: 'power3.out', onUpdate: touch };
    const qx = gsap.quickTo(tilt, 'x', q);
    const qz = gsap.quickTo(tilt, 'z', q);
    addEventListener('pointermove', (e) => {
      if (!active || e.pointerType !== 'mouse') return;
      const r = bounds;
      const inside = e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
      if (!inside) { qx(0); qz(0); return; }
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      qx(ny * -TILT); // курсор ближе к зрителю — карта приподнимается к нему
      qz(nx * TILT);
    }, { passive: true });
  }

  /* Выбор места: список и пины работают одинаково */
  let current = -1;
  const ovals = places.map((p) => [...p.querySelectorAll('.place__oval path')]);
  function select(i) {
    if (i === current) return;
    const prev = current;
    current = i;
    root.querySelector('.places').classList.toggle('has-active', i >= 0);
    places.forEach((p, k) => {
      const on = k === i;
      p.classList.toggle('is-active', on);
      p.querySelector('.place__name').setAttribute('aria-expanded', on);
      gsap.to(p.querySelector('.place__more'), { height: on ? 'auto' : 0, duration: 0.6, ease: 'power3.inOut', overwrite: true });
    });
    pins.forEach((pin, k) => pin.classList.toggle('is-on', k === i));
    if (prev >= 0) {
      gsap.to(ovals[prev], { opacity: 0, duration: 0.3, overwrite: true });
      gsap.to(photos[prev], { opacity: 0, scale: 0.96, y: 8, duration: 0.35, ease: 'power2.in', overwrite: true });
    }
    if (i >= 0) {
      gsap.fromTo(ovals[i], { opacity: 1, strokeDashoffset: (k, p) => p.dataset.len }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', overwrite: true });
      gsap.fromTo(photos[i], { opacity: 0, scale: 0.94, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.7, delay: 0.1, ease: 'power3.out', overwrite: true });
    }
  }
  const bind = (el, i) => {
    el.addEventListener('click', () => select(i));
    el.addEventListener('focus', () => select(i));
    if (canHover) el.addEventListener('mouseenter', () => select(i));
  };
  places.forEach((p, i) => bind(p.querySelector('.place__name'), i));
  pins.forEach((pin) => bind(pin, Number(pin.dataset.place)));

  /* Появление содержимого: само, по времени, когда карта легла в перспективу */
  const intro = gsap.timeline({ paused: true });
  const mk = (sel) => root.querySelectorAll(sel);
  intro
    .fromTo(mk('.mk--complex'), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' }, 0)
    .fromTo(mk('.mk__building'), { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.9, ease: 'power2.out' }, 0)
    .fromTo(mk('.mk--label'), { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.45)
    // Пины падают на свои места; анимируется картинка внутри, у .mk__icon свой масштаб выбора
    .fromTo(mk('.mk--pin'), { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.12 }, 0.6)
    .fromTo(mk('.mk--pin .mk__pin'), { y: -26 }, { y: 0, duration: 0.6, stagger: 0.06, ease: 'back.out(2)' }, 0.6)
    .fromTo(mk('.mk__name'), { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.12 }, 0.85)
    .fromTo(mk('.infra__tag, .place__name'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, ease: 'power2.out' }, 0.2);
  if (reduceMotion) intro.timeScale(4);

  return {
    root,
    state,
    touch,
    resize,
    setVisible(on) {
      if (on === visible) return;
      visible = on;
      root.classList.toggle('is-rendering', on);
      if (on) dirty = true;
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) intro.play();
      else intro.reverse();
    },
  };
}
