// Post-auth "walk into the forest" transition. ~1.4s total — long enough to
// feel intentional, short enough not to annoy anyone.
function playEnterTransition() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('transition-overlay');
    if (!overlay) return resolve();
    const msg = overlay.querySelector('.msg');
    overlay.classList.add('active');
    overlay.style.transition = 'opacity 500ms ease';
    overlay.style.opacity = '1';
    requestAnimationFrame(() => {
      msg.style.transition = 'opacity 600ms ease';
      msg.style.opacity = '1';
    });
    setTimeout(() => { resolve(); }, 1400);
  });
}
