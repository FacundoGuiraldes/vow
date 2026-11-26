// Sección "Los productos" de la landing: tres productos con fotos reales y selector de color.
// Es contenido estático: no depende de la API ni de que la venta esté abierta.
import { FOTOS, ALT } from './fotos.js';

const PRODUCTOS = [
  { grupo: 'gorra', nombre: 'Gorra', detalle: 'Isotipo al frente y VOW atrás. En negra o beige.', colores: [['negra', 'Negra', '--c-negro'], ['beige', 'Beige', '--c-beige']] },
  { grupo: 'medias', nombre: 'Medias', detalle: 'Isotipo y VOW en la caña, talón y puntera en contraste. Talle grande (37 al 40) o súper (41 al 44).', colores: [['negro', 'Negro', '--c-negro'], ['hueso', 'Hueso', '--c-hueso'], ['beige', 'Beige', '--c-beige']] },
  { grupo: 'shaker', nombre: 'Shaker', detalle: 'Con el isotipo y VOW estampados. En negro o claro.', colores: [['negro', 'Negro', '--c-negro'], ['claro', 'Claro', '--c-hueso']] }
];

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

function tarjeta(p, animar) {
  const art = el('article', 'prod');
  const marco = el('div', 'prod__marco');
  const img = el('img', 'prod__img');
  img.width = 750; img.height = 1000; img.decoding = 'async'; img.loading = 'lazy';
  marco.append(img);

  let color = p.colores[0][0];
  let foto = 0;
  const miniaturas = el('div', 'prod__thumbs');
  const dibujar = (suave) => {
    const fotos = FOTOS[p.grupo][color];
    img.alt = `${ALT[p.grupo](color)}${foto ? ', otra vista' : ''}`;
    const poner = () => { img.src = fotos[foto]; img.classList.remove('is-cambiando'); };
    if (suave && animar) {
      img.classList.add('is-cambiando');
      setTimeout(poner, 140);
    } else poner();
    miniaturas.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === foto)));
    swatches.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
  };

  const swatches = el('div', 'prod__colores');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', `Color de ${p.nombre.toLowerCase()}`);
  for (const [clave, etiqueta, variable] of p.colores) {
    const b = el('button', 'prod__swatch');
    b.type = 'button'; b.dataset.color = clave;
    b.setAttribute('aria-label', `${p.nombre} ${etiqueta.toLowerCase()}`);
    b.style.setProperty('--sw', `var(${variable})`);
    b.append(el('span', 'prod__swatch-nombre', etiqueta));
    b.addEventListener('click', () => { color = clave; foto = 0; dibujar(true); });
    swatches.append(b);
  }
  FOTOS[p.grupo][color].forEach((_, i) => {
    const b = el('button', 'prod__thumb', String(i + 1).padStart(2, '0'));
    b.type = 'button';
    b.setAttribute('aria-label', `Vista ${String(i + 1).padStart(2, '0')} de ${p.nombre.toLowerCase()}`);
    b.addEventListener('click', () => { foto = i; dibujar(true); });
    miniaturas.append(b);
  });

  const texto = el('div', 'prod__texto');
  texto.append(el('h3', 'prod__nombre', p.nombre), el('p', 'prod__detalle', p.detalle), swatches);
  art.append(marco, miniaturas, texto);
  dibujar(false);
  return art;
}

export function iniciarProductos(lista, reducido) {
  if (!lista) return;
  for (const p of PRODUCTOS) {
    const li = el('li', 'prods__item');
    li.append(tarjeta(p, !reducido));
    lista.append(li);
  }
}
