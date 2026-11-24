import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function buildSectionNav(story, lenis, zoomEnd, storyLength) {
  const names = ['О проекте', 'Расположение', 'Инфраструктура', 'Генплан', 'Преимущества', 'Квартиры'];
  const root = document.createElement('nav');
  root.className = 'section-nav';
  root.setAttribute('aria-label', 'Содержание страницы');
  root.innerHTML = `<button class="section-nav__toggle" aria-label="Показать содержание" aria-expanded="false" aria-controls="section-contents">
    ${names.map(name => `<span class="section-nav__dot" aria-label="${name}"><i></i></span>`).join('')}
    </button><div class="section-nav__contents" id="section-contents" inert>
    <button class="section-nav__close" aria-label="Закрыть содержание"><span></span><span></span></button><img src="/img/nav-logo.svg" width="114" height="21" alt="ЭНСО">
    ${names.map((name, i) => `<button class="section-nav__link" data-section="${i}"><span>${i + 1}</span>${name}</button>`).join('')}
    </div>`;
  document.body.append(root);
  const toggle = root.querySelector('.section-nav__toggle');
  const contents = root.querySelector('.section-nav__contents');
  const dots = [...root.querySelectorAll('.section-nav__dot')];
  const links = [...root.querySelectorAll('.section-nav__link')];
  let boundaries = [];
  const top = id => {
    const element = document.querySelector(id);
    const spacer = element.parentElement;
    const target = spacer.classList.contains('pin-spacer') ? spacer : element;
    return target.getBoundingClientRect().top + scrollY;
  };
  function measure() {
    const trigger = story.scrollTrigger;
    boundaries = [trigger.start,
      trigger.start + (trigger.end - trigger.start) * zoomEnd / storyLength,
      trigger.start + (trigger.end - trigger.start) * 13.4 / storyLength,
      top('#genplan'), top('#happy'), top('#apartments'),
      Math.max(document.documentElement.scrollHeight - innerHeight, top('#apartments') + 1)];
    update();
  }
  function update() {
    if (!boundaries.length) return;
    const y = scrollY;
    let index = 0;
    boundaries.slice(0, 6).forEach((start, i) => { if (y >= start - 1) index = i; });
    const progress = gsap.utils.clamp(0, 1, (y - boundaries[index]) / Math.max(1, boundaries[index + 1] - boundaries[index]));
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
      dot.style.setProperty('--progress', i < index ? 1 : i === index ? progress : 0);
    });
    links.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let expanded = false;
  let hovering = false;
  const motion = { width: 40, height: 105, velocityW: 0, velocityH: 0 };
  let targetW = 40;
  let targetH = 105;
  function setState() {
    targetW = expanded ? Math.min(440, innerWidth - 48) : hovering ? 64 : 40;
    targetH = expanded ? 453 : 105;
    root.classList.toggle('is-open', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.inert = expanded;
    contents.inert = !expanded;
    if (reduced) {
      motion.width = targetW;
      motion.height = targetH;
      motion.velocityW = motion.velocityH = 0;
      paint();
    }
  }
  function paint() {
    root.style.width = motion.width + 'px';
    root.style.height = motion.height + 'px';
  }
  // Damped spring integration keeps position and velocity continuous on reversal.
  gsap.ticker.add((_, deltaMs) => {
    if (reduced) return;
    const dt = Math.min(deltaMs / 1000, 0.04);
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const step = dt / steps;
      motion.velocityW += ((targetW - motion.width) * 220 - motion.velocityW * 27) * step;
      motion.velocityH += ((targetH - motion.height) * 220 - motion.velocityH * 27) * step;
      motion.width += motion.velocityW * step;
      motion.height += motion.velocityH * step;
    }
    paint();
  });
  function close() {
    expanded = false;
    hovering = false;
    setState();
    toggle.focus({ preventScroll: true });
  }
  root.addEventListener('mouseenter', () => { hovering = true; setState(); });
  root.addEventListener('mouseleave', () => { hovering = false; setState(); });
  toggle.addEventListener('click', () => { expanded = true; setState(); });
  root.querySelector('.section-nav__close').addEventListener('click', close);
  root.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  links.forEach((link, index) => link.addEventListener('click', () => {
    lenis.scrollTo(boundaries[index]);
    close();
  }));
  addEventListener('resize', setState);
  paint();
  ScrollTrigger.addEventListener('refresh', measure);
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update });
  measure();
}
