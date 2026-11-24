const mobile = matchMedia('(max-width: 767px)');
mobile.addEventListener('change', () => location.reload());
if (mobile.matches) {
  document.body.classList.remove('is-loading');
} else {
  // Desktop modules run concurrently, as with the original module script tags.
  await Promise.all([import('./main.js'), import('./showcase.js')]);
}
