// Pedidos de la venta propia. Todo se calcula acá, en el servidor: el navegador solo dice qué quiere y a dónde, nunca cuánto cuesta.
//   crearPedido   valida lo pedido, calcula el total con los precios del sistema, guarda el pedido y arma el link de pago
//   confirmarPago cuando Mercado Pago avisa que se aprobó, descuenta el stock del Almacén (una sola vez por pedido)
import { randomBytes } from "node:crypto";
import { ErrorInventario, PRODUCTOS, aplicarInventario, leerInventario, lineaDeVenta } from "../programacion/inventario.js";

const CLAVE = "pedidos";
const MAX_PEDIDOS = 300;
const MAX_LINEAS = 10;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_CP = /^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/;

export class ErrorPedido extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const texto = (v, largo) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, largo);

let cola = Promise.resolve();
const enCola = (trabajo) => {
  const turno = cola.then(trabajo);
  cola = turno.catch(() => {});
  return turno;
};

async function leerPedidos(repo) {
  const g = await repo.leerEstado(CLAVE);
  return g && typeof g.pedidos === "object" && g.pedidos ? g.pedidos : {};
}
async function guardarPedidos(repo, pedidos) {
  const ids = Object.keys(pedidos).sort((a, b) => pedidos[a].creado.localeCompare(pedidos[b].creado));
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_PEDIDOS))) delete pedidos[id];
  await repo.guardarEstado(CLAVE, { pedidos });
}

export function validarComprador(c) {
  const nombre = texto(c?.nombre, 80);
  const email = texto(c?.email, 120).toLowerCase();
  const telefono = texto(c?.telefono, 30);
  if (nombre.length < 2) throw new ErrorPedido("Falta tu nombre.");
  if (!FORMATO_EMAIL.test(email)) throw new ErrorPedido("El email no tiene un formato válido.");
  if (!/^[\d\s+()-]{6,30}$/.test(telefono)) throw new ErrorPedido("Falta un teléfono de contacto válido.");
  return { nombre, email, telefono };
}

export function validarEntrega(e) {
  if (e?.tipo === "retiro") return { tipo: "retiro" };
  if (e?.tipo !== "envio") throw new ErrorPedido("Elegí si querés retirar o que te lo enviemos.");
  const entrega = { tipo: "envio", cp: texto(e.cp, 10).toUpperCase(), calle: texto(e.calle, 80), numero: texto(e.numero, 10), piso: texto(e.piso, 20), localidad: texto(e.localidad, 60), provincia: texto(e.provincia, 40) };
  if (!FORMATO_CP.test(entrega.cp)) throw new ErrorPedido("El código postal no es válido.");
  for (const [campo, nombre] of [["calle", "la calle"], ["numero", "el número"], ["localidad", "la localidad"], ["provincia", "la provincia"]]) if (!entrega[campo]) throw new ErrorPedido(`Falta ${nombre}.`);
  return entrega;
}

// cotizarEnvio({ cp, lineas }) → { costo, servicio }. Sin cotizador no se vende con envío: solo retiro.
export async function crearPedido({ repo, mp, cuerpo, cotizarEnvio = null, urlPublica, urlLanding, ahora = Date.now() }) {
  const comprador = validarComprador(cuerpo?.comprador);
  const entrega = validarEntrega(cuerpo?.entrega);
  const crudos = Array.isArray(cuerpo?.items) ? cuerpo.items : [];
  if (!crudos.length) throw new ErrorPedido("El carrito está vacío.");
  if (crudos.length > MAX_LINEAS) throw new ErrorPedido("Son demasiados productos en un solo pedido.");
  let lineas;
  try {
    lineas = crudos.map(lineaDeVenta);
  } catch (error) {
    if (error instanceof ErrorInventario) throw new ErrorPedido(error.message);
    throw error;
  }
  const inv = await leerInventario(repo);
  const total = {};
  for (const l of lineas) for (const [sku, n] of Object.entries(l.descuenta)) total[sku] = (total[sku] ?? 0) + n;
  const faltan = Object.entries(total).filter(([sku, n]) => inv.stock[sku] < n).map(([sku]) => PRODUCTOS[sku].nombre.toLowerCase());
  if (faltan.length) throw new ErrorPedido(`No hay stock suficiente de: ${faltan.join(", ")}.`, 409);

  let envio = { costo: 0, servicio: "Retiro en persona" };
  if (entrega.tipo === "envio") {
    if (!cotizarEnvio) throw new ErrorPedido("Por ahora solo hay retiro en persona: el envío todavía no está disponible.", 503);
    const cotizado = await cotizarEnvio({ cp: entrega.cp, lineas });
    if (!Number.isInteger(cotizado?.costo) || cotizado.costo < 0) throw new ErrorPedido("No pudimos calcular el envío. Probá de nuevo en un rato.", 502);
    envio = { costo: cotizado.costo, servicio: texto(cotizado.servicio, 60) };
  }

  const subtotal = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
  const id = randomBytes(12).toString("hex");
  const items = lineas.map((l) => ({ title: l.nombre, quantity: l.cantidad, unit_price: l.precio }));
  if (envio.costo > 0) items.push({ title: `Envío (${envio.servicio})`, quantity: 1, unit_price: envio.costo });
  const preferencia = await mp.crearPreferencia({
    items,
    external_reference: id,
    payer: { name: comprador.nombre, email: comprador.email },
    back_urls: { success: `${urlLanding}/?pago=ok`, pending: `${urlLanding}/?pago=pendiente`, failure: `${urlLanding}/?pago=error` },
    auto_return: "approved",
    notification_url: `${urlPublica}/api/programacion/ventas/mercadopago`,
    statement_descriptor: "VOW",
  });
  const importe = subtotal + envio.costo;
  await enCola(async () => {
    const pedidos = await leerPedidos(repo);
    pedidos[id] = { creado: new Date(ahora).toISOString(), estado: "pendiente", comprador, entrega, envio, importe, lineas: crudos.map((c) => ({ producto: c.producto, cantidad: c.cantidad ?? 1, ...(c.gorra ? { gorra: c.gorra } : {}), ...(c.shaker ? { shaker: c.shaker } : {}), ...(c.color ? { color: c.color } : {}) })) };
    await guardarPedidos(repo, pedidos);
  });
  return { id, importe, envio, link: preferencia.init_point };
}

// pago: lo que devuelve GET /v1/payments/{id}. Devuelve un texto de lo que hizo.
export function confirmarPago({ repo, pago, ahora = Date.now() }) {
  return enCola(async () => {
    const id = String(pago?.external_reference ?? "");
    const pedidos = await leerPedidos(repo);
    const pedido = pedidos[id];
    if (!pedido) return "pedido desconocido";
    if (pedido.estado === "pagado") return "ya registrado";
    if (pago.status !== "approved") {
      if (["rejected", "cancelled"].includes(pago.status)) {
        pedidos[id] = { ...pedido, estado: pago.status === "rejected" ? "rechazado" : "cancelado" };
        await guardarPedidos(repo, pedidos);
      }
      return `pago ${pago.status}`;
    }
    if (pago.currency_id !== "ARS" || Number(pago.transaction_amount) !== pedido.importe) {
      await repo.agregarNovedad(`Ventas: el pago ${pago.id} del pedido ${id.slice(0, 8)} no coincide con el pedido (pagó ${pago.transaction_amount} ${pago.currency_id}, debía ser ${pedido.importe} ARS). No se descontó stock: revisalo en Mercado Pago.`.slice(0, 1000));
      return "monto distinto";
    }
    const nota = `Mercado Pago ${pago.id} · ${pedido.comprador.nombre}`;
    try {
      const { id: venta } = await aplicarInventario(repo, { tipo: "venta", items: pedido.lineas, nota }, { origen: "web", ahora });
      pedidos[id] = { ...pedido, estado: "pagado", pago: String(pago.id), venta };
      await guardarPedidos(repo, pedidos);
      return "venta registrada";
    } catch (error) {
      if (!(error instanceof ErrorInventario)) throw error;
      // Cobró alguien que ya no tenía stock: no se descuenta, se avisa para devolver el dinero
      pedidos[id] = { ...pedido, estado: "pagado_sin_stock", pago: String(pago.id) };
      await guardarPedidos(repo, pedidos);
      await repo.agregarNovedad(`Ventas: el pedido ${id.slice(0, 8)} (${pedido.comprador.nombre}, ${pedido.comprador.email}) se pagó (pago ${pago.id}) pero ya no hay stock. Hay que devolverle el dinero desde Mercado Pago.`.slice(0, 1000));
      return "pagado sin stock";
    }
  });
}
