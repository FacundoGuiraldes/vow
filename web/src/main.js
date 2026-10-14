import './style.css';
import { content, colors } from './content.js';
import logoSvg from './assets/logo.svg?raw';
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Sin VITE_API_URL se usa la ruta relativa (API publicada en el mismo dominio que la landing)
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const WAITLIST_ENDPOINT = `${API_URL}/api/lista-espera`;
const REQUEST_TIMEOUT_MS = 10000;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if (reducedMotion) document.documentElement.classList.add('no-motion');

// ---------- Contenido ----------
// Par de repeticiones: el loop con xPercent -50 solo es continuo si ambas mitades son idénticas
document.getElementById('marquee-text').textContent = content.marquee.repeat(16);
document.getElementById('marquee-sr').textContent = content.marquee.replace(/[\s·]+$/, '');
document.getElementById('hero-title').innerText = content.hero.title;
document.getElementById('hero-cta').textContent = content.hero.cta;

const manifestEl = document.getElementById('manifest-text');
content.manifest.split(' ').forEach((w, i) => {
  if (i) manifestEl.append(' ');
  const span = document.createElement('span');
  span.className = 'word';
  span.textContent = w;
  manifestEl.append(span);
});

document.getElementById('product-name').textContent = content.product.name;
const tagsContainer = document.getElementById('product-tags');
content.product.tags.forEach(tag => {
  const el = document.createElement('li');
  el.className = 'tag';
  el.textContent = tag;
  tagsContainer.appendChild(el);
});

document.getElementById('product-placeholder').textContent = content.product.placeholder;

// Drop 01: galería de renders + line-up completo
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const total = String(content.products.length).padStart(2, '0');

document.getElementById('drop-kicker').textContent = content.drop.kicker;
document.getElementById('drop-title').textContent = content.drop.title;
document.getElementById('drop-disclaimer').textContent = content.drop.disclaimer;
document.getElementById('lineup-title').textContent = content.drop.lineupTitle;

const galleryTrack = document.getElementById('gallery-track');
content.products.filter(p => p.images).forEach(p => {
  const { src, w, h } = p.images;
  const img = el('img');
  img.src = `${src}-1600.webp`;
  img.srcset = `${src}-900.webp 900w, ${src}-1600.webp 1600w`;
  img.sizes = '(min-width: 1024px) 70vw, 88vw';
  img.width = w;
  img.height = h;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = p.alt;

  const swatches = el('ul', 'swatches');
  swatches.setAttribute('aria-label', 'Colorway');
  p.colors.forEach(key => {
    const li = el('li', 'swatch', colors[key].label);
    li.style.setProperty('--swatch', colors[key].hex);
    swatches.append(li);
  });

  const caption = el('figcaption', 'sheet-caption');
  const head = el('p', 'sheet-head');
  head.append(el('span', 'sheet-id', `${p.id} / ${total}`), el('span', 'sheet-status', content.drop.status.preview));
  caption.append(head, el('h3', 'sheet-name', p.name), el('p', 'sheet-spec', p.spec), swatches);

  const figure = el('figure', 'sheet-figure');
  figure.append(img, caption);
  const li = el('li', 'sheet');
  li.append(figure);
  galleryTrack.append(li);
});

const lineup = document.getElementById('lineup');
content.products.forEach(p => {
  const status = p.images ? 'preview' : p.featured ? 'featured' : 'dev';
  const li = el('li', `lineup-item is-${status}`);
  li.append(
    el('span', 'lineup-id', p.id),
    el('span', 'lineup-name', p.name),
    el('span', 'lineup-spec', p.spec),
    el('span', 'lineup-status', content.drop.status[status])
  );
  lineup.append(li);
});

document.getElementById('hero-logo').innerHTML = logoSvg;
document.querySelector('.footer-logo').innerHTML = logoSvg;

// ---------- Scroll + animaciones ----------
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  gsap.to('.marquee', { xPercent: -50, repeat: -1, duration: 20, ease: 'none' });

  gsap.from('#hero-logo', { opacity: 0, y: 30, duration: 1, ease: 'power3.out', delay: 0.2 });
  gsap.from('#hero-title', { opacity: 0, y: 30, duration: 1, ease: 'power3.out', delay: 0.4 });

  gsap.to('.word', {
    opacity: 1,
    stagger: 0.1,
    scrollTrigger: { trigger: '#sec-02', start: 'top 80%', end: 'bottom 40%', scrub: true }
  });

  // Fondo del hero: parallax leve
  gsap.to('.hero-bg img', {
    yPercent: 12,
    ease: 'none',
    scrollTrigger: { trigger: '#sec-01', start: 'top top', end: 'bottom top', scrub: true }
  });

  gsap.from('.lineup-item', {
    opacity: 0, y: 20, duration: 0.6, ease: 'power3.out', stagger: 0.05,
    scrollTrigger: { trigger: '#lineup', start: 'top 85%' }
  });

  // Desktop: la galería se fija y scrollea en horizontal. En mobile queda el scroll-snap nativo.
  gsap.matchMedia().add('(min-width: 1024px)', () => {
    const gallery = document.getElementById('gallery');
    const track = document.getElementById('gallery-track');
    gallery.classList.add('is-pinned');
    // Recorrido = ancho del track menos el área visible (sin los gutters laterales)
    const distance = () => {
      const { paddingLeft, paddingRight } = getComputedStyle(gallery);
      const visible = gallery.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
      return Math.max(0, track.scrollWidth - visible);
    };
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.drop-pin',
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true
      }
    });
    return () => gallery.classList.remove('is-pinned');
  });

  // Las imágenes lazy cambian el alto/ancho: recalcular posiciones al cargarlas
  document.querySelectorAll('.sheet img').forEach(img =>
    img.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
  );
}

// CTAs al formulario: scroll y foco en el email (sirve también para teclado/lectores)
const emailInput = document.getElementById('email');
document.querySelectorAll('a[href="#sec-05"]:not(.skip-link)').forEach(link =>
  link.addEventListener('click', e => {
    e.preventDefault();
    const focusEmail = () => emailInput.focus({ preventScroll: true });
    if (lenis) {
      lenis.scrollTo('#sec-05', { onComplete: focusEmail });
    } else {
      document.getElementById('sec-05').scrollIntoView();
      focusEmail();
    }
  })
);

// ---------- Cursor custom (solo mouse) ----------
const cursor = document.querySelector('.cursor');
if (finePointer) {
  document.body.classList.add('has-cursor');
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.1, ease: 'power2.out' });
  const yTo = gsap.quickTo(cursor, 'y', { duration: 0.1, ease: 'power2.out' });
  document.addEventListener('mousemove', e => {
    cursor.classList.add('visible');
    xTo(e.clientX);
    yTo(e.clientY);
  });
  document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('visible'));

  const HOVER_TARGETS = 'button, a, input';
  document.addEventListener('mouseover', e => {
    cursor.classList.toggle('hover', !!e.target.closest(HOVER_TARGETS));
  });
}

// ---------- Formulario de lista de espera ----------
const form = document.getElementById('waitlist-form');
const submitBtn = form.querySelector('button[type="submit"]');
const submitLabel = submitBtn.querySelector('.cta-label');
const msg = document.getElementById('form-msg');

function setMessage(text, type = '') {
  msg.className = type ? `msg ${type}` : 'msg';
  msg.textContent = text;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  form.setAttribute('aria-busy', String(loading));
  submitLabel.textContent = loading ? content.form.sending : content.form.submit;
}

function markInvalid(invalid) {
  if (invalid) emailInput.setAttribute('aria-invalid', 'true');
  else emailInput.removeAttribute('aria-invalid');
}

emailInput.addEventListener('input', () => markInvalid(false));

function showEmailError(text) {
  setMessage(text, 'error');
  markInvalid(true);
  emailInput.focus();
}

async function postWaitlist(email) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, origen: 'landing' }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (submitBtn.disabled) return;

  // Chequeo rápido en el navegador; la API valida de nuevo y es la que manda
  const email = emailInput.value.trim();
  if (email === '' || !emailInput.checkValidity()) {
    showEmailError(content.form.invalidEmail);
    return;
  }

  markInvalid(false);
  setMessage('');
  setLoading(true);

  try {
    const res = await postWaitlist(email);

    // 200 = anotado. La API responde igual si el mail ya estaba, así que el mensaje es el mismo
    if (res.ok) {
      setMessage(content.form.success, 'success');
      form.reset();
    } else if (res.status === 400) {
      const data = await res.json().catch(() => ({}));
      showEmailError(data.error || content.form.invalidEmail);
    } else if (res.status === 429) {
      setMessage(content.form.rateLimited, 'error');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[VOW] Error al enviar a la lista de espera:', err.message);
    setMessage(content.form.error, 'error');
  } finally {
    setLoading(false);
  }
});
