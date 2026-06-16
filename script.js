function inicializarHeader() {
  const header = document.getElementById('siteHeader');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 80) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };

  window.addEventListener('scroll', onScroll);
  onScroll();
}

function inicializarMenuMovil() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('siteNav');
  const overlay = document.getElementById('navOverlay');
  if (!toggle || !nav || !overlay) return;

  const cerrar = () => {
    nav.classList.remove('is-open');
    overlay.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const abrir = () => {
    nav.classList.add('is-open');
    overlay.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) {
      cerrar();
    } else {
      abrir();
    }
  });

  overlay.addEventListener('click', cerrar);

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', cerrar);
  });
}

function inicializarAnimaciones() {
  const elementos = document.querySelectorAll('.anim-up, .anim-row, .anim-row-reverse, .anim-right');
  if (!elementos.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -60px 0px'
  });

  elementos.forEach((el) => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarHeader();
  inicializarMenuMovil();
  inicializarAnimaciones();
  // El flujo de reserva de turnos se maneja en js/booking.js
});
