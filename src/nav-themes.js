import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function buildNavThemes(story, zoomEnd) {
  const sections = [...document.querySelectorAll('section[data-nav-theme]')];
  const header = document.querySelector('.header');
  const chapterNav = document.querySelector('.section-nav');
  function apply(theme) {
    if (document.documentElement.dataset.navTheme === theme) return;
    document.documentElement.dataset.navTheme = theme;
    header.dataset.navTheme = theme;
    if (chapterNav) chapterNav.dataset.navTheme = theme;
  }
  function resolve() {
    const y = window.scrollY + 40;
    let current = sections[0];
    sections.forEach(section => {
      const spacer = section.parentElement.classList.contains('pin-spacer') ? section.parentElement : section;
      if (spacer.getBoundingClientRect().top + window.scrollY <= y) current = section;
    });
    apply(current.id === 'story' && story.time() >= zoomEnd ? 'photo-dark' : current.dataset.navTheme);
  }
  sections.forEach(section => ScrollTrigger.create({
    trigger: section, start: 'top 40px', end: 'bottom 40px',
    onEnter: resolve, onEnterBack: resolve, onLeaveBack: resolve,
  }));
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: resolve, onRefresh: resolve });
  resolve();
}
