import './style.css';
import { content } from './content.js';
import logoSvg from './assets/logo.svg?raw';
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Sin VITE_API_URL se usa la ruta relativa (API publicada en el mismo dominio que la landing)
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const WAITLIST_ENDPOINT = `${API_URL}/api/lista-espera`;
const HEALTH_ENDPOINT = `${API_URL}/api/salud`;
const CATALOG_ENDPOINT = `${API_URL}/api/productos?drop=1`;
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

// Botón a la tienda: aparece solo si VITE_TIENDA_URL es una dirección https válida
try {
  const tiendaUrl = new URL(import.meta.env.VITE_TIENDA_URL || '');
  if (tiendaUrl.protocol === 'https:') {
    const tiendaLink = document.getElementById('hero-tienda');
    tiendaLink.href = tiendaUrl.href;
    tiendaLink.hidden = false;
  }
} catch { /* sin tienda configurada: el botón queda oculto */ }

const manifestEl = document.getElementById('manifest-text');
content.manifest.split(' ').forEach((w, i) => {
  if (i) manifestEl.append(' ');
  const span = document.createElement('span');
  span.className = 'word';
  span.textContent = w;
  manifestEl.append(span);
});

// Crea un nodo con clase y texto (siempre textContent, nunca HTML)
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

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
  gsap.from('#hero-cta-link', { opacity: 0, y: 30, duration: 1, ease: 'power3.out', delay: 0.55 });

  gsap.to('.word', {
    opacity: 1,
    stagger: 0.1,
    scrollTrigger: { trigger: '#sec-02', start: 'top 80%', end: 'bottom 40%', scrub: true }
  });

  // Banda outline: las dos líneas se separan levemente mientras la banda cruza la pantalla
  [['.banda__linea--1', -1], ['.banda__linea--2', 1]].forEach(([selector, direction]) => {
    gsap.fromTo(selector, { x: 0 }, {
      x: () => direction * window.innerWidth * 0.06,
      ease: 'none',
      scrollTrigger: { trigger: '.banda', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true }
    });
  });
}

// Scroll suave a un elemento. Antes de animar, sincroniza Lenis con la posición real: si el foco con Tab
// movió la página de forma nativa y se aprieta Enter enseguida, Lenis todavía no se enteró y calcularía
// el destino desde una posición vieja.
function scrollToElement(target, { immediate = false, onComplete = () => {} } = {}) {
  if (!lenis) {
    target.scrollIntoView();
    onComplete();
    return;
  }
  lenis.scrollTo(window.scrollY, { immediate: true });
  lenis.scrollTo(target, { immediate, onComplete });
  if (immediate) onComplete();
}

// Enlaces al formulario (skip-link y CTAs): scroll y foco en el email (sirve también para teclado/lectores)
const emailInput = document.getElementById('email');
const waitlistSection = document.getElementById('sec-05');
document.querySelectorAll('a[href="#sec-05"]').forEach(link =>
  link.addEventListener('click', e => {
    e.preventDefault();
    scrollToElement(waitlistSection, { onComplete: () => emailInput.focus({ preventScroll: true }) });
  })
);

// Enlaces a la política de privacidad: scroll a la sección y foco en ella para teclado/lectores
const privacySection = document.getElementById('privacidad');
function goToPrivacy({ immediate = false } = {}) {
  scrollToElement(privacySection, { immediate, onComplete: () => privacySection.focus({ preventScroll: true }) });
}
document.querySelectorAll('a[href="#privacidad"]').forEach(link =>
  link.addEventListener('click', e => {
    e.preventDefault();
    history.replaceState(null, '', '#privacidad');
    goToPrivacy();
  })
);
// Entrada directa con /#privacidad: el layout se sigue acomodando después del load (fuentes, catálogo
// que llega de la API), así que se vuelve a posicionar cuando terminan de cargar las fuentes y un rato después
window.addEventListener('load', () => {
  if (location.hash !== '#privacidad') return;
  const reposition = () => {
    ScrollTrigger.refresh();
    goToPrivacy({ immediate: true });
  };
  reposition();
  document.fonts.ready.then(() => requestAnimationFrame(reposition));
  setTimeout(reposition, 800);
});

// ---------- Índice de secciones ----------
// #sec-05 y #privacidad ya tienen sus handlers (foco en el email / en la política). Acá van las otras secciones:
// scroll con el mismo helper y foco en la sección (tienen tabindex="-1").
document.querySelectorAll('.indice a').forEach(link => {
  const id = link.getAttribute('href').slice(1);
  if (id === 'sec-05' || id === 'privacidad') return;
  const target = document.getElementById(id);
  link.addEventListener('click', e => {
    e.preventDefault();
    scrollToElement(target, { onComplete: () => target.focus({ preventScroll: true }) });
  });
});

// La sección activa es la que cruza el centro de la pantalla. No es una animación: funciona también con reduced-motion
const indexLinks = [...document.querySelectorAll('.indice a')];
function setActiveSection(id) {
  indexLinks.forEach(link => {
    if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}
indexLinks.forEach(link => {
  const id = link.getAttribute('href').slice(1);
  ScrollTrigger.create({
    trigger: `#${id}`,
    start: 'top center',
    end: 'bottom center',
    onToggle: self => { if (self.isActive) setActiveSection(id); }
  });
});

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

// ---------- API ----------
// Aviso silencioso al cargar: despierta la API si está dormida para que el envío del formulario sea rápido
fetch(HEALTH_ENDPOINT, { cache: 'no-store' }).catch(() => {});

// ---------- Catálogo Drop 01 (desde la API) ----------
// El servidor gratuito puede tardar cerca de un minuto en despertar: aviso a los 8 s y corte a los 60 s
const CATALOG_SLOW_MS = 8000;
const CATALOG_TIMEOUT_MS = 60000;
// Texto visible cuando la API responde bien pero el drop todavía no tiene productos cargados
const CATALOG_EMPTY_TEXT = 'El Drop 01 se abre pronto. Anotate en la lista y sos el primero en enterarte.';
const CATALOG_STATUS_LABELS = { concepto: 'CONCEPTO', proximamente: 'PRÓXIMAMENTE', disponible: 'DISPONIBLE' };

const catalogStatus = document.getElementById('catalogo-estado');
const catalogList = document.getElementById('catalogo-lista');
// Número decorativo de la tarjeta (aria-hidden): refleja la cantidad real; la lista ya la informa a lectores
const dropCount = document.getElementById('drop-count');

function setCatalogStatus(text, { error = false, visuallyHidden = false } = {}) {
  catalogStatus.textContent = text;
  catalogStatus.classList.toggle('is-error', error);
  catalogStatus.classList.toggle('sr-only', visuallyHidden);
}

// Nombre de color de la API -> variable CSS. Se compara en minúsculas y sin tildes ("bordó" = "bordo")
const COLOR_VARS = {
  beige: '--c-beige',
  negro: '--c-negro',
  bordo: '--c-bordo',
  'gris topo': '--c-gris-topo',
  hueso: '--c-hueso'
};
const normalizeColor = name => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function renderColorDots(colores) {
  const names = Array.isArray(colores) ? colores : [];
  const dots = el('span', 'catalog-dots');
  dots.setAttribute('role', 'img');
  dots.setAttribute('aria-label', `Colores: ${names.join(', ')}`);
  names.forEach(name => {
    const dot = el('i');
    const cssVar = COLOR_VARS[normalizeColor(name)];
    // Color desconocido: círculo neutro (solo borde); el nombre igual queda en el aria-label
    if (cssVar) dot.style.setProperty('--dot', `var(${cssVar})`);
    dots.append(dot);
  });
  return dots;
}

// Solo textContent: los datos vienen de la API y nunca se interpretan como HTML
function renderCatalogItem(product) {
  const estado = CATALOG_STATUS_LABELS[product.estado] ? product.estado : 'concepto';
  const li = el('li', `lineup-item catalog-item is-${estado}`);
  const detail = el('span', 'lineup-spec catalog-detail');
  detail.append(el('span', 'catalog-desc', product.descripcion));
  if (Array.isArray(product.colores) && product.colores.length > 0) {
    detail.append(el('span', 'catalog-colors', `Colores: ${product.colores.join(' / ')}`));
  }
  li.append(
    el('span', 'lineup-id', String(product.numero).padStart(2, '0')),
    el('span', 'lineup-name', product.nombre),
    detail,
    renderColorDots(product.colores),
    el('span', 'catalog-cat', product.categoria ?? ''),
    el('span', 'lineup-status', CATALOG_STATUS_LABELS[estado])
  );
  return li;
}

async function loadCatalog() {
  const controller = new AbortController();
  const slowTimer = setTimeout(
    () => setCatalogStatus('El servidor se está despertando, puede tardar hasta un minuto…'),
    CATALOG_SLOW_MS
  );
  const timeoutTimer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const res = await fetch(CATALOG_ENDPOINT, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { productos } = await res.json();
    if (!Array.isArray(productos)) throw new Error('Respuesta inválida');

    catalogList.replaceChildren(...productos.map(renderCatalogItem));
    dropCount.textContent = String(productos.length).padStart(2, '0');
    if (productos.length === 0) {
      // Sin productos: lista oculta y mensaje visible (antes solo lo leían los lectores de pantalla)
      catalogList.hidden = true;
      setCatalogStatus(CATALOG_EMPTY_TEXT);
    } else {
      catalogList.hidden = false;
      setCatalogStatus(`Drop 01: ${productos.length} productos en desarrollo.`, { visuallyHidden: true });
    }
    ScrollTrigger.refresh();
  } catch (err) {
    console.error('[VOW] No se pudo cargar el Drop 01:', err.message);
    catalogList.hidden = true;
    dropCount.textContent = '—';
    setCatalogStatus('No pudimos cargar el Drop 01. Probá de nuevo más tarde.', { error: true });
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(timeoutTimer);
  }
}

loadCatalog();

// ---------- Formulario de lista de espera ----------
const form = document.getElementById('waitlist-form');
const igInput = document.getElementById('ig');
const submitBtn = form.querySelector('button[type="submit"]');
const submitLabel = submitBtn.querySelector('.cta-label');
const msg = document.getElementById('form-msg');
const fieldsByName = { email: emailInput, instagram: igInput };

function setMessage(text, type = '') {
  msg.className = type ? `msg ${type}` : 'msg';
  msg.textContent = text;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  form.setAttribute('aria-busy', String(loading));
  submitLabel.textContent = loading ? content.form.sending : content.form.submit;
}

function markInvalid(input, invalid) {
  if (invalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

[emailInput, igInput].forEach(input => input.addEventListener('input', () => markInvalid(input, false)));

function showFieldError(input, text) {
  setMessage(text, 'error');
  markInvalid(input, true);
  input.focus();
}

// Origen de la visita para medir canales (p. ej. el QR de cada gimnasio: https://sitio/?origen=gym-olivos).
// Se lee una sola vez al cargar. Solo minúsculas, números, guion y guion bajo, hasta 50 caracteres;
// si falta o no cumple, se usa 'landing' (el valor de siempre).
const DEFAULT_ORIGIN = 'landing';
const ORIGIN_FORMAT = /^[a-z0-9_-]{1,50}$/;
function readOrigin() {
  const raw = new URLSearchParams(location.search).get('origen')?.trim().toLowerCase() ?? '';
  return ORIGIN_FORMAT.test(raw) ? raw : DEFAULT_ORIGIN;
}
const visitOrigin = readOrigin();

async function postWaitlist(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (submitBtn.disabled) return;

  // Chequeo rápido en el navegador; la API valida de nuevo (también el Instagram) y es la que manda
  const email = emailInput.value.trim();
  if (email === '' || !emailInput.checkValidity()) {
    showFieldError(emailInput, content.form.invalidEmail);
    return;
  }

  markInvalid(emailInput, false);
  markInvalid(igInput, false);
  setMessage('');
  setLoading(true);

  try {
    const res = await postWaitlist({ email, instagram: igInput.value, origen: visitOrigin });

    // 200 = anotado. La API responde igual si el mail ya estaba, así que el mensaje es el mismo
    if (res.ok) {
      setMessage(content.form.success, 'success');
      form.reset();
    } else if (res.status === 400) {
      const data = await res.json().catch(() => ({}));
      showFieldError(fieldsByName[data.campo] || emailInput, data.error || content.form.invalidEmail);
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
