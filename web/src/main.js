// Tipografías alojadas en el propio sitio (sin pedirle nada a Google: no se manda la IP de quien visita a un tercero)
import '@fontsource-variable/unbounded';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import './style.css';
import { content } from './content.js';
import logoSvg from './assets/logo.svg?raw';
import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { iniciarTienda } from './tienda.js';
import { negocio } from './negocio.js';
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
// Cierre del manifiesto ("Esta es tu promesa.") resaltado
[...manifestEl.querySelectorAll('.word')].slice(-4).forEach(w => w.classList.add('word--clave'));

// Crea un nodo con clase y texto (siempre textContent, nunca HTML)
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

document.querySelector('.footer-logo').innerHTML = logoSvg;

// Datos del vendedor (solo los que están cargados en negocio.js)
const vendedorEl = document.getElementById('vendedor');
[
  ['Marca', negocio.marca],
  ['Responsable', negocio.responsable],
  ['Razón social', negocio.razonSocial],
  ['CUIT', negocio.cuit],
  ['Condición frente al IVA', negocio.condicionIva],
  ['Domicilio', negocio.domicilio],
  ['Email', negocio.email],
  ['Instagram', negocio.instagram ? `@${negocio.instagram}` : null],
  ['País', negocio.pais]
].filter(([, valor]) => valor).forEach(([nombre, valor]) => {
  const fila = el('div', 'vendedor__fila');
  fila.append(el('dt', null, nombre), el('dd', null, valor));
  vendedorEl.append(fila);
});

// ---------- Scroll + animaciones ----------
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  gsap.to('.marquee', { xPercent: -50, repeat: -1, duration: 20, ease: 'none' });

  // Entrada del hero: escalonada, con salida fuerte (expo.out) y corta
  gsap.from(['#hero-logo', '#hero-title', '.hero-sub', '#hero-cta-link', '.hero-nota'], {
    opacity: 0, y: 24, duration: 0.7, ease: 'expo.out', stagger: 0.08, delay: 0.1
  });

  // Wordmark gigante: sube desde el borde al cargar
  gsap.from('.hero-wordmark', { yPercent: 28, opacity: 0, duration: 1.1, ease: 'expo.out', delay: 0.15 });

  // Barra de avance de lectura
  gsap.to('.progreso', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.2 } });

  // Títulos de sección: entran una sola vez
  gsap.utils.toArray('.title-large').forEach(titulo => {
    gsap.from(titulo, { opacity: 0, y: 32, duration: 0.7, ease: 'expo.out', scrollTrigger: { trigger: titulo, start: 'top 90%', once: true } });
  });

  // Imagen del Drop 01: se acerca despacio mientras se la recorre; el sello se estampa al llegar
  gsap.fromTo('.drop-feature__img', { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.drop-feature__frame', start: 'top bottom', end: 'bottom 40%', scrub: true } });
  gsap.from('.sello', { opacity: 0, scale: 1.5, duration: 0.45, ease: 'expo.out', scrollTrigger: { trigger: '.drop-feature__frame', start: 'top 55%', once: true } });

  // Bloques que entran una sola vez al llegar a la pantalla
  gsap.utils.toArray('.drop-feature__card, .faq__lista, .beneficios, .waitlist .form, .drop-head').forEach(bloque => {
    gsap.from(bloque, { opacity: 0, y: 24, duration: 0.6, ease: 'expo.out', scrollTrigger: { trigger: bloque, start: 'top 88%', once: true } });
  });

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
// Entrada directa con /#privacidad (o #terminos, etc.): el layout se sigue acomodando después de cargar (fuentes,
// catálogo que llega de la API), así que mientras la persona no se mueva sola se vuelve a posicionar cada vez que
// cambia el alto de la página. Vale también si solo cambia el hash con la página ya abierta.
const ANCLAS_LEGALES = ['privacidad', 'terminos', 'reembolsos', 'cookies', 'arrepentimiento'];
let seguirAncla = null;
function empezarASeguirAncla() {
  seguirAncla = null;
  const id = location.hash.slice(1);
  if (!ANCLAS_LEGALES.includes(id)) return;
  const destino = document.getElementById(id);
  const reposition = () => {
    lenis?.resize(); // Lenis mide el alto de la página por su cuenta y llega tarde: sin esto recorta el destino al alto viejo
    ScrollTrigger.refresh();
    scrollToElement(destino, { immediate: true, onComplete: () => destino.focus({ preventScroll: true }) });
  };
  seguirAncla = reposition;
  reposition();
  setTimeout(() => { if (seguirAncla === reposition) seguirAncla = null; }, 12000);
}
const anclaObserver = new ResizeObserver(() => seguirAncla?.());
anclaObserver.observe(document.body);
['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(ev => window.addEventListener(ev, () => { seguirAncla = null; }, { passive: true }));
document.fonts?.addEventListener?.('loadingdone', () => seguirAncla?.());
window.addEventListener('hashchange', empezarASeguirAncla);
window.addEventListener('load', empezarASeguirAncla);

// Enlaces a las páginas legales y a las preguntas: scroll a la sección y foco en ella
['terminos', 'reembolsos', 'cookies', 'arrepentimiento', 'preguntas'].forEach(id => {
  const target = document.getElementById(id);
  document.querySelectorAll(`a[href="#${id}"]`).forEach(link =>
    link.addEventListener('click', e => {
      e.preventDefault();
      history.replaceState(null, '', `#${id}`);
      scrollToElement(target, { onComplete: () => target.focus({ preventScroll: true }) });
    })
  );
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
    // Las filas entran de a una (solo con movimiento permitido)
    if (!reducedMotion) gsap.from(catalogList.children, { opacity: 0, y: 16, duration: 0.5, ease: 'expo.out', stagger: 0.05, scrollTrigger: { trigger: catalogList, start: 'top 88%', once: true } });
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
const consentInput = document.getElementById('consent');
const fieldsByName = { email: emailInput, instagram: igInput, consentimiento: consentInput };

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
consentInput.addEventListener('change', () => markInvalid(consentInput, false));

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

  // Consentimiento expreso: la casilla viene destildada y la tilda la persona
  if (!consentInput.checked) {
    showFieldError(consentInput, content.form.consentRequired);
    return;
  }

  markInvalid(emailInput, false);
  markInvalid(igInput, false);
  setMessage('');
  setLoading(true);

  try {
    const res = await postWaitlist({ email, instagram: igInput.value, origen: visitOrigin, consentimiento: true });

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

// Tienda del Drop 00: solo se muestra si el servidor tiene la venta abierta
iniciarTienda(API_URL);

// ---------- Botón de arrepentimiento ----------
// Sin registro ni trámites: se manda nombre y mail y se muestra el código en el momento
const arrForm = document.getElementById('arrepentimiento-form');
const arrMsg = document.getElementById('arrepentimiento-msg');
const arrBtn = document.getElementById('arrepentimiento-enviar');
arrForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (arrBtn.disabled) return;
  const datos = Object.fromEntries(new FormData(arrForm));
  const nombre = String(datos.nombre ?? '').trim();
  if (nombre.length < 2) { arrMsg.textContent = 'Escribí tu nombre y apellido.'; arrForm.elements.nombre.focus(); return; }
  if (!arrForm.elements.email.checkValidity() || !String(datos.email ?? '').trim()) { arrMsg.textContent = 'Escribí el mail con el que compraste.'; arrForm.elements.email.focus(); return; }
  arrBtn.disabled = true;
  arrMsg.textContent = 'Enviando…';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_URL}/api/programacion/ventas/arrepentimiento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ nombre, email: String(datos.email).trim(), pedido: String(datos.pedido ?? '').trim() }),
      signal: controller.signal
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (res.ok && cuerpo.codigo) {
      arrMsg.textContent = `Listo. Tu código de arrepentimiento es ${cuerpo.codigo}. Guardalo: te escribimos al mail para coordinar la devolución y el reembolso.`;
      arrForm.reset();
    } else {
      arrMsg.textContent = cuerpo.error || 'No pudimos registrarlo. Escribinos a vow2026ar@gmail.com y te damos el código.';
    }
  } catch {
    arrMsg.textContent = 'No pudimos conectar. Escribinos a vow2026ar@gmail.com y te damos el código.';
  } finally {
    clearTimeout(timer);
    arrBtn.disabled = false;
  }
});

// ---------- CTA fijo en celular ----------
// Aparece al salir del hero y se oculta cuando ya se ve el formulario de acceso
const ctaFijo = document.getElementById('cta-fijo');
ctaFijo.hidden = false;
const heroSection = document.getElementById('sec-01');
let heroVisible = true;
let accesoVisible = false;
const actualizarCtaFijo = () => ctaFijo.classList.toggle('is-visible', !heroVisible && !accesoVisible);
new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; actualizarCtaFijo(); }, { threshold: 0.15 }).observe(heroSection);
new IntersectionObserver(([entry]) => { accesoVisible = entry.isIntersecting; actualizarCtaFijo(); }, { threshold: 0.2 }).observe(waitlistSection);
