import gsap from 'gsap';
import { Flip } from 'gsap/Flip';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function buildBenefits(root, unit) {
  const items = [...root.querySelectorAll('[data-benefit]')];
  const headings = [...root.querySelectorAll('.benefits__heading')];
  const panels = items.map(item => item.querySelector('.benefits__panel'));
  const buttons = items.map(item => item.querySelector('button'));
  const rings = items.map(item => item.querySelector('.benefits__ring'));
  const views = [...root.querySelectorAll('[data-benefit-view]')];
  const captions = views.map(view => view.querySelector('.benefits__caption'));
  const tag = root.querySelector('.benefits__tag');
  let current = 0, active = false, entrance, change;

  function applySelection() {
    root.dataset.variant = items[current].dataset.benefit;
    items.forEach((item, i) => {
      const on = i === current;
      item.classList.toggle('is-selected', on);
      buttons[i].setAttribute('aria-expanded', String(on));
      panels[i].hidden = !on;
      views[i].classList.toggle('is-selected', on);
      views[i].setAttribute('aria-hidden', String(!on));
    });
    // The alternate Figma states name this same category more specifically.
    root.querySelector('.benefits__amenities-short').hidden = current !== 0;
    root.querySelector('.benefits__amenities-long').hidden = current === 0;
  }

  function select(i) {
    if (!active || current === i) return;
    entrance?.progress(1).pause();
    change?.kill();
    gsap.killTweensOf(headings);
    // Read all label geometry once, then change layout. FLIP animates label transforms only.
    const state = Flip.getState(headings);
    const previous = current;
    current = i;
    applySelection();
    gsap.set(headings, { opacity: index => index === current ? 1 : 0.8 });
    gsap.set(views.filter((_, index) => index !== previous && index !== current), { autoAlpha: 0 });
    change = gsap.timeline();
    if (reduceMotion) change.timeScale(4);
    change
      .add(Flip.from(state, { duration: 0.6, ease: 'power2.inOut', nested: true }), 0)
      .to(views[previous], { autoAlpha: 0, duration: 0.45, ease: 'power1.inOut' }, 0)
      .fromTo(views[current], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.65, ease: 'power1.inOut' }, 0)
      .fromTo(panels[current], { opacity: 0, y: 8 * unit() }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 0.15)
      .fromTo(rings[current], { clipPath: 'inset(-30% 110% -30% -10%)' }, { clipPath: 'inset(-30% -10% -30% -10%)', duration: 0.9, ease: 'sine.inOut' }, 0.2)
      .fromTo(captions[current], { clipPath: 'inset(-40% 120% -40% -20%)' }, { clipPath: 'inset(-40% -20% -40% -20%)', duration: 2, ease: 'sine.inOut' }, 0.35);
  }

  buttons.forEach((button, i) => button.addEventListener('click', () => select(i)));
  // Standard keyboard navigation among the three real controls; static headings are skipped.
  buttons.forEach((button, i) => button.addEventListener('keydown', event => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (i + step + buttons.length) % buttons.length;
    buttons[next].focus();
    select(next);
  }));

  applySelection();
  gsap.set(views, { autoAlpha: i => i === current ? 1 : 0 });

  return {
    root,
    setActive(on) {
      if (on === active) return;
      active = on;
      root.classList.toggle('is-active', on);
      entrance?.kill();
      change?.kill();
      if (!on) return;
      applySelection();
      gsap.set(views, { autoAlpha: i => i === current ? 1 : 0 });
      gsap.set(headings, { clearProps: 'transform' });
      entrance = gsap.timeline();
      if (reduceMotion) entrance.timeScale(4);
      entrance
        .fromTo(tag, { opacity: 0, y: 10 * unit() }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 0)
        .fromTo(headings, { opacity: 0, y: 16 * unit() }, { opacity: i => i === current ? 1 : 0.8, y: 0, stagger: 0.07, duration: 0.8, ease: 'power2.out' }, 0.05)
        .fromTo(panels[current], { opacity: 0, y: 10 * unit() }, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 0.25)
        .fromTo(rings[current], { clipPath: 'inset(-30% 110% -30% -10%)' }, { clipPath: 'inset(-30% -10% -30% -10%)', duration: 1.1, ease: 'sine.inOut' }, 0.35)
        .fromTo(captions[current], { clipPath: 'inset(-40% 120% -40% -20%)' }, { clipPath: 'inset(-40% -20% -40% -20%)', duration: 2.1, ease: 'sine.inOut' }, 0.5);
    },
  };
}
