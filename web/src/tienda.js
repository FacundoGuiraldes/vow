// Tienda del Drop 00: aparece solo si la API dice que la venta está abierta (VENTA_ABIERTA=1 en el servidor).
// El navegador solo manda qué quiere y a dónde: el precio lo calcula el servidor, y el pago se hace en Mercado Pago.
const pesos = n => `$${n.toLocaleString('es-AR')}`;
const COLORES = { gorra: ['negra', 'beige'], shaker: ['negro', 'claro'] };
const REQUEST_TIMEOUT_MS = 15000;

function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') nodo.className = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else if (v === true) nodo.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) nodo.setAttribute(k, v);
  }
  nodo.append(...hijos.flat().filter(h => h !== null && h !== undefined && h !== false));
  return nodo;
}

async function pedirJson(url, opciones = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opciones, signal: controller.signal });
    const datos = await res.json().catch(() => ({}));
    return { ok: res.ok, estado: res.status, datos };
  } finally {
    clearTimeout(timer);
  }
}

export async function iniciarTienda(apiUrl) {
  const seccion = document.getElementById('tienda');
  if (!seccion) return;
  mostrarResultadoDePago();

  let estado;
  try {
    const r = await pedirJson(`${apiUrl}/api/programacion/ventas/estado`);
    if (!r.ok || !r.datos.abierta) return; // venta cerrada o API caída: la sección sigue oculta
    estado = r.datos;
  } catch {
    return;
  }

  const lista = document.getElementById('tienda-lista');
  const carritoEl = document.getElementById('tienda-carrito');
  const form = document.getElementById('tienda-form');
  const mensaje = document.getElementById('tienda-msg');
  const botonPagar = document.getElementById('tienda-pagar');
  const bloqueEnvio = document.getElementById('tienda-envio-datos');
  const opcionEnvio = document.getElementById('tienda-opcion-envio');
  const carrito = []; // { producto, nombre, precio, cantidad, gorra?, shaker? }

  if (!estado.envio) opcionEnvio.hidden = true;

  function dibujarCarrito() {
    carritoEl.replaceChildren();
    if (!carrito.length) {
      carritoEl.append(el('p', { class: 'tienda__vacio' }, 'Todavía no sumaste nada.'));
    } else {
      const total = carrito.reduce((a, l) => a + l.precio * l.cantidad, 0);
      carritoEl.append(
        el('ul', { class: 'tienda__lineas' }, carrito.map((l, i) => el('li', {},
          el('span', {}, `${l.cantidad} × ${l.nombre}${[l.gorra, l.shaker].filter(Boolean).length ? ` (${[l.gorra, l.shaker].filter(Boolean).join(', ')})` : ''}`),
          el('span', {}, pesos(l.precio * l.cantidad)),
          el('button', { type: 'button', class: 'tienda__quitar', 'aria-label': `Quitar ${l.nombre}`, onclick: () => { carrito.splice(i, 1); dibujarCarrito(); } }, 'Quitar')))),
        el('p', { class: 'tienda__total' }, el('span', {}, 'Productos'), el('strong', {}, pesos(total))),
        el('p', { class: 'tienda__nota' }, 'El envío, si lo elegís, se suma al pagar.')
      );
    }
    botonPagar.disabled = carrito.length === 0;
  }

  for (const p of estado.productos) {
    const selects = p.pide.map(grupo => {
      const select = el('select', { 'aria-label': `Color de ${grupo === 'gorra' ? 'la gorra' : 'el shaker'}`, name: grupo },
        COLORES[grupo].map(color => el('option', { value: color, disabled: !estado.colores[grupo][color] }, estado.colores[grupo][color] ? color : `${color} (agotado)`)));
      const primero = COLORES[grupo].find(c => estado.colores[grupo][c]);
      if (primero) select.value = primero;
      return select;
    });
    const cantidad = el('input', { type: 'number', min: '1', max: '5', value: '1', 'aria-label': `Cantidad de ${p.nombre}` });
    const agregar = el('button', {
      type: 'button', class: 'tienda__agregar', disabled: !p.disponible,
      onclick: () => {
        const n = Number(cantidad.value);
        if (!Number.isInteger(n) || n < 1 || n > 5) { cantidad.value = '1'; return; }
        const linea = { producto: p.id, nombre: p.nombre, precio: p.precio, cantidad: n };
        for (const s of selects) linea[s.name] = s.value;
        const igual = carrito.find(l => l.producto === linea.producto && l.gorra === linea.gorra && l.shaker === linea.shaker);
        if (igual) igual.cantidad = Math.min(5, igual.cantidad + n);
        else carrito.push(linea);
        dibujarCarrito();
      }
    }, p.disponible ? 'Sumar' : 'Agotado');
    lista.append(el('li', { class: 'tienda__producto' },
      el('div', {}, el('h3', {}, p.nombre), el('p', { class: 'tienda__precio' }, pesos(p.precio))),
      el('div', { class: 'tienda__opciones' }, selects, cantidad, agregar)));
  }

  form.addEventListener('change', () => { bloqueEnvio.hidden = form.elements.entrega.value !== 'envio'; });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (botonPagar.disabled || !carrito.length) return;
    const datos = new FormData(form);
    const envio = datos.get('entrega') === 'envio';
    const cuerpo = {
      items: carrito.map(({ producto, cantidad, gorra, shaker }) => ({ producto, cantidad, ...(gorra ? { gorra } : {}), ...(shaker ? { shaker } : {}) })),
      comprador: { nombre: datos.get('nombre'), email: datos.get('email'), telefono: datos.get('telefono') },
      entrega: envio ? { tipo: 'envio', cp: datos.get('cp'), calle: datos.get('calle'), numero: datos.get('numero'), piso: datos.get('piso'), localidad: datos.get('localidad'), provincia: datos.get('provincia') } : { tipo: 'retiro' }
    };
    botonPagar.disabled = true;
    form.setAttribute('aria-busy', 'true');
    mensaje.textContent = 'Preparando el pago…';
    try {
      const r = await pedirJson(`${apiUrl}/api/programacion/ventas/pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      if (r.ok && /^https:\/\/[^\s]+$/.test(r.datos.link ?? '')) {
        window.location.assign(r.datos.link); // el pago se hace en Mercado Pago
        return;
      }
      mensaje.textContent = r.datos.error || 'No pudimos armar el pedido. Probá de nuevo en un rato.';
    } catch {
      mensaje.textContent = 'No pudimos conectar. Revisá tu conexión y probá de nuevo.';
    }
    form.removeAttribute('aria-busy');
    botonPagar.disabled = carrito.length === 0;
  });

  dibujarCarrito();
  seccion.hidden = false;
}

// Mercado Pago devuelve al comprador a /?pago=ok|pendiente|error
function mostrarResultadoDePago() {
  const pago = new URLSearchParams(location.search).get('pago');
  const textos = {
    ok: 'Pago recibido. Te escribimos por mail para coordinar la entrega.',
    pendiente: 'Tu pago está pendiente de confirmación. Cuando se acredite, te escribimos.',
    error: 'No se pudo completar el pago. No se te cobró nada: podés intentar de nuevo.'
  };
  const aviso = document.getElementById('tienda-aviso');
  if (aviso && textos[pago]) {
    aviso.textContent = textos[pago];
    aviso.hidden = false;
  }
}
