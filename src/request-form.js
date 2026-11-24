import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function buildRequestForm(lenis) {
  const section = document.createElement('section');
  section.id = 'request';
  section.dataset.navTheme = 'cream';
  section.className = 'request-section';
  section.setAttribute('aria-labelledby', 'request-title');
  const pictures = [
    [1045,-44,98,139,'2d4da.png',.4], [1256,656,98,139,'2d4da.png',1],
    [211,-26,118,166,'49623.png',1,'27475.png'], [-26,-14,131,66,'20a55.png',1],
    [1308,136,153,207,'49623.png',1], [161,558,172,210,'9fec3.png',1],
    [44,190,119,148,'08f4b.png',.4], [-35,474,150,76,'fbe96.png',1],
    [314,828,83,117,'126d6.png',1], [1354,849,120,74,'58f26.png',1],
    [15,758,96,135,'126d6.png',.2], [1169,463,69,120,'da331.png',.4],
    [1225,412,149,184,'db00f.png',1],
  ];
  section.innerHTML = `<div class="request-section__art" aria-hidden="true">${pictures.map(([x,y,w,h,src,opacity,overlay],i) =>
    `<figure class="request-section__picture request-section__picture--${i}" style="left:${x/14.4}%;top:${y/9}%;width:${w/14.4}%;height:${h/9}%;opacity:${opacity}"><img src="/img/request/${src}" alt="" loading="lazy">${overlay ? `<img class="request-section__crop" src="/img/request/${overlay}" alt="" loading="lazy">` : ''}</figure>`).join('')}</div>
    <div class="request-section__body">
      <h2 id="request-title">Начало вашей<br>истории</h2>
      <p>Заполните форму, и наши специалисты перезвонят в течение 10 минут</p>
      <form>
        <label><span>Ваше имя</span><input name="name" autocomplete="given-name" required placeholder="Ваше имя"></label>
        <label><span>Контактный телефон</span><input name="phone" type="tel" autocomplete="tel" required minlength="10" placeholder="Контактный телефон"></label>
        <button class="request-section__submit" type="submit">Отправить</button>
        <p role="status" class="request-section__status"></p>
      </form>
    </div><div class="request-section__script" aria-hidden="true"><span class="request-section__script-line request-section__script-line--first"><i>Ваш осознанный</i></span><span class="request-section__script-line request-section__script-line--last"><i>выбор</i></span></div><small>© ЖК «ЭНСО», 2026</small>`;
  document.querySelector('#apartments').after(section);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href="#request"]');
    if (!link) return;
    event.preventDefault();
    lenis.resize();
    lenis.scrollTo(section, { offset: 0, duration: 1.2, force: true,
      onComplete: () => history.replaceState(null, '', '#request'),
    });
  });
  section.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    section.querySelector('[role="status"]').textContent = 'Отправка заявок пока не подключена.';
  });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const pictures = [...section.querySelectorAll('.request-section__picture')];
    const unit = () => Math.min(innerWidth / 1440, innerHeight / 900);
    const followers = pictures.map((picture, index) => {
      const amplitude = 6 + 16 * Number(picture.style.opacity || 1);
      gsap.set(picture, { '--drift-x': 0, '--drift-y': 0, '--float-y': -3 });
      gsap.to(picture, { '--float-y': 3, duration: 4.5 + index % 4 * .5,
        repeat: -1, yoyo: true, ease: 'sine.inOut', delay: -index * .37 });
      return {
        amplitude,
        x: gsap.quickTo(picture, '--drift-x', { duration: 1.1, ease: 'power3.out' }),
        y: gsap.quickTo(picture, '--drift-y', { duration: 1.1, ease: 'power3.out' }),
      };
    });
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      section.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse') return;
        const box = section.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width * 2 - 1;
        const y = (event.clientY - box.top) / box.height * 2 - 1;
        followers.forEach(follower => {
          follower.x(-x * follower.amplitude * unit());
          follower.y(-y * follower.amplitude * unit());
        });
      }, { passive: true });
      section.addEventListener('pointerleave', () => followers.forEach(follower => {
        follower.x(0); follower.y(0);
      }));
    }
    gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 72%', once: true } })
      .from(pictures, { opacity: 0, y: 24, duration: 1, stagger: .035, ease: 'power2.out' }, 0)
      .from(section.querySelectorAll('h2, .request-section__body > p, label, .request-section__submit'), {
        opacity: 0, y: 20, duration: .8, stagger: .08, ease: 'power2.out',
      }, .15)
      .from(section.querySelectorAll('.request-section__script-line'), {
        opacity: 0, y: 16, duration: 1, stagger: .15, ease: 'power2.out',
      }, .65);
  }
}
