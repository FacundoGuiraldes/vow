// Páginas legales (privacidad, términos, reembolsos, cookies y arrepentimiento). Sin animaciones pesadas ni
// librerías: solo estilos, el logo del pie, los datos del vendedor y el formulario de arrepentimiento.
import '@fontsource-variable/unbounded';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import './style.css';
import logoSvg from './assets/logo.svg?raw';
import { negocio } from './negocio.js';

// Sin VITE_API_URL se usa la ruta relativa (API publicada en el mismo dominio)
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

document.querySelector('.footer-logo').innerHTML = logoSvg;

// Datos del vendedor (solo los que están cargados en negocio.js)
const vendedorEl = document.getElementById('vendedor');
if (vendedorEl) {
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
}

// Botón de arrepentimiento: sin registro ni trámites. Se manda nombre y mail y se muestra el código en el momento
const arrForm = document.getElementById('arrepentimiento-form');
if (arrForm) {
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
        arrMsg.textContent = cuerpo.error || `No pudimos registrarlo. Escribinos a ${negocio.email} y te damos el código.`;
      }
    } catch {
      arrMsg.textContent = `No pudimos conectar. Escribinos a ${negocio.email} y te damos el código.`;
    } finally {
      clearTimeout(timer);
      arrBtn.disabled = false;
    }
  });
}
