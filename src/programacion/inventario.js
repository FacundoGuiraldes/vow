// Stock y ventas del Drop 00. Es la única fuente de verdad: el Almacén del juego lo muestra, la Caja del juego lo mueve y el bot lo lee y lo mueve con herramientas.
// Todo se guarda en la base ("inventario"). Cada cambio deja un movimiento (quién, cuándo, qué) y una novedad para el Estratega.
// Los precios los define el sistema (acá, según docs/productos/stock-inicial.md): ni el juego ni el bot los cambian al vender.
import { esFechaISO } from "./fechas.js";

// Lo que hay en el Almacén. "medias" va sin desglose de color y talle hasta que Facundo confirme el reparto.
export const PRODUCTOS = {
  "gorra-negra": { nombre: "Gorra negra", corto: "Gorras negras", grupo: "gorra" },
  "gorra-beige": { nombre: "Gorra beige", corto: "Gorras beige", grupo: "gorra" },
  "shaker-negro": { nombre: "Shaker negro", corto: "Shakers negros", grupo: "shaker" },
  "shaker-claro": { nombre: "Shaker claro", corto: "Shakers claros", grupo: "shaker" },
  medias: { nombre: "Medias (par)", corto: "Medias (pares)", grupo: "medias" },
};
export const SKUS = Object.keys(PRODUCTOS);

// Lo que se vende: cada uno descuenta de uno o más SKUs. gorra/shaker piden color porque hay dos.
export const CATALOGO = {
  gorra: { nombre: "Gorra", precio: 29900, usa: [["gorra", 1]] },
  medias: { nombre: "Medias (par)", precio: 9900, usa: [["medias", 1]] },
  shaker: { nombre: "Shaker", precio: 12900, usa: [["shaker", 1]] },
  pledge: { nombre: "Pack Pledge (gorra + medias)", precio: 34900, usa: [["gorra", 1], ["medias", 1]] },
  kept: { nombre: "Pack Kept (shaker + medias)", precio: 19900, usa: [["shaker", 1], ["medias", 1]] },
  oath: { nombre: "Pack Oath (gorra + medias + shaker)", precio: 47900, usa: [["gorra", 1], ["medias", 1], ["shaker", 1]] },
  medias2: { nombre: "Medias x2", precio: 17900, usa: [["medias", 2]] },
  medias3: { nombre: "Medias x3", precio: 26900, usa: [["medias", 3]] },
};
const COLORES = { gorra: { negra: "gorra-negra", beige: "gorra-beige" }, shaker: { negro: "shaker-negro", claro: "shaker-claro" } };
const MAX_UNIDADES = 100_000;
const MAX_MOVIMIENTOS = 150;
const MAX_VENTAS = 150;

export class ErrorInventario extends Error {}

export const inventarioVacio = () => ({ stock: Object.fromEntries(SKUS.map((s) => [s, 0])), ventas: {}, movimientos: [] });

export async function leerInventario(repo) {
  const g = await repo.leerEstado("inventario");
  const base = inventarioVacio();
  if (!g || typeof g !== "object") return base;
  const stock = { ...base.stock };
  for (const s of SKUS) if (Number.isInteger(g.stock?.[s]) && g.stock[s] >= 0) stock[s] = g.stock[s];
  return { stock, ventas: g.ventas && typeof g.ventas === "object" ? g.ventas : {}, movimientos: Array.isArray(g.movimientos) ? g.movimientos : [] };
}

const entero = (valor, nombre, { min = 1, max = MAX_UNIDADES } = {}) => {
  const n = typeof valor === "string" && /^\d+$/.test(valor.trim()) ? Number(valor) : valor;
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorInventario(`${nombre} tiene que ser un número entero entre ${min} y ${max}.`);
  return n;
};
const limpiar = (valor, largo) => String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, largo);
const pesos = (n) => `$${n.toLocaleString("es-AR")}`;

// "gorra" + color → "gorra-negra". Acepta también el SKU entero ("gorra-negra") o solo el color si el producto lo deja claro.
function skuDe(grupo, color, nombreItem) {
  const opciones = COLORES[grupo];
  const c = limpiar(color, 20).toLowerCase();
  if (opciones[c]) return opciones[c];
  throw new ErrorInventario(`${nombreItem}: falta el color de ${grupo === "gorra" ? "la gorra (negra o beige)" : "el shaker (negro o claro)"}.`);
}

// Convierte una línea de venta en lo que descuenta, o tira ErrorInventario
function lineaDeVenta(item) {
  const producto = limpiar(item?.producto, 20).toLowerCase();
  const def = CATALOGO[producto];
  if (!def) throw new ErrorInventario(`Producto desconocido. Se vende: ${Object.keys(CATALOGO).join(", ")}.`);
  const cantidad = entero(item.cantidad ?? 1, `La cantidad de ${def.nombre}`, { max: 1000 });
  if (item.precio !== undefined && item.precio !== null && item.precio !== "") throw new ErrorInventario("El precio lo define el sistema: no se puede cambiar al registrar una venta.");
  const precio = def.precio;
  const colores = {};
  const descuenta = {};
  for (const [grupo, porUnidad] of def.usa) {
    const sku = grupo === "medias" ? "medias" : skuDe(grupo, grupo === "gorra" ? item.gorra ?? item.color : item.shaker ?? item.color, def.nombre);
    if (grupo !== "medias") colores[grupo] = sku;
    descuenta[sku] = (descuenta[sku] ?? 0) + porUnidad * cantidad;
  }
  return { producto, nombre: def.nombre, cantidad, precio, colores, descuenta };
}

const descripcionLinea = (l) => `${l.cantidad} × ${l.nombre}${Object.values(l.colores).length ? ` (${Object.values(l.colores).map((s) => PRODUCTOS[s].nombre.toLowerCase()).join(", ")})` : ""}`;

// Uno por vez: dos cambios que llegan juntos (el bot y el juego) no se pisan el stock
let cola = Promise.resolve();
const enCola = (trabajo) => {
  const turno = cola.then(trabajo);
  cola = turno.catch(() => {});
  return turno;
};

// Aplica un cambio y devuelve { inventario, resumen }. origen: "juego" o "bot".
//   { tipo: "entrada", sku, cantidad, nota? }           llegó mercadería: suma
//   { tipo: "ajuste", sku, cantidad, nota? }            deja el stock en esa cantidad (por conteo o corrección)
//   { tipo: "venta", items: [{ producto, cantidad, gorra?, shaker? }], nota?, fecha? }   resta el stock solo
//   { tipo: "anular_venta", id }                        devuelve el stock de esa venta
export function aplicarInventario(repo, cambio, { origen = "juego", ahora = Date.now() } = {}) {
  return enCola(async () => {
    const inv = await leerInventario(repo);
    const en = new Date(ahora).toISOString();
    let resumen;
    let ventaId = null;
    const mov = (texto, extra = {}) => inv.movimientos.push({ en, origen, texto: texto.slice(0, 220), ...extra });

    if (cambio?.tipo === "entrada" || cambio?.tipo === "ajuste") {
      if (!PRODUCTOS[cambio.sku]) throw new ErrorInventario(`Ese producto no existe. Son: ${SKUS.join(", ")}.`);
      const nota = limpiar(cambio.nota, 120);
      if (cambio.tipo === "entrada") {
        const n = entero(cambio.cantidad, "La cantidad");
        inv.stock[cambio.sku] += n;
        resumen = `Llegaron ${n} ${PRODUCTOS[cambio.sku].nombre.toLowerCase()}: ahora hay ${inv.stock[cambio.sku]}${nota ? ` (${nota})` : ""}`;
      } else {
        const n = entero(cambio.cantidad, "La cantidad", { min: 0 });
        const antes = inv.stock[cambio.sku];
        inv.stock[cambio.sku] = n;
        resumen = `Stock de ${PRODUCTOS[cambio.sku].nombre.toLowerCase()} corregido: de ${antes} a ${n}${nota ? ` (${nota})` : ""}`;
      }
      mov(resumen, { sku: cambio.sku });
    } else if (cambio?.tipo === "venta") {
      const items = Array.isArray(cambio.items) ? cambio.items : [];
      if (!items.length) throw new ErrorInventario("Falta qué se vendió.");
      if (items.length > 10) throw new ErrorInventario("Son demasiadas líneas en una sola venta.");
      const lineas = items.map(lineaDeVenta);
      const total = {};
      for (const l of lineas) for (const [sku, n] of Object.entries(l.descuenta)) total[sku] = (total[sku] ?? 0) + n;
      const faltan = Object.entries(total).filter(([sku, n]) => inv.stock[sku] < n).map(([sku, n]) => `${PRODUCTOS[sku].nombre.toLowerCase()}: hay ${inv.stock[sku]} y la venta necesita ${n}`);
      if (faltan.length) throw new ErrorInventario(`No alcanza el stock (${faltan.join("; ")}). No se registró la venta.`);
      for (const [sku, n] of Object.entries(total)) inv.stock[sku] -= n;
      const fecha = esFechaISO(cambio.fecha) ? cambio.fecha : en.slice(0, 10);
      const importe = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
      ventaId = `v${ahora.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      inv.ventas[ventaId] = { en, fecha, origen, nota: limpiar(cambio.nota, 140), importe, items: lineas.map(({ producto, cantidad, precio, colores, descuenta }) => ({ producto, cantidad, precio, colores, descuenta })), anulada: false };
      resumen = `Venta: ${lineas.map(descripcionLinea).join(" + ")} por ${pesos(importe)}${cambio.nota ? ` · ${limpiar(cambio.nota, 80)}` : ""}`;
      mov(resumen, { venta: ventaId });
    } else if (cambio?.tipo === "anular_venta") {
      const id = limpiar(cambio.id, 40);
      const v = inv.ventas[id];
      if (!v) throw new ErrorInventario("No encuentro esa venta.");
      if (v.anulada) throw new ErrorInventario("Esa venta ya estaba anulada.");
      for (const l of v.items) for (const [sku, n] of Object.entries(l.descuenta)) inv.stock[sku] += n;
      v.anulada = true;
      v.anulada_el = en;
      resumen = `Venta anulada (${v.fecha}, ${pesos(v.importe)}): el stock volvió al Almacén`;
      mov(resumen, { venta: id });
    } else {
      throw new ErrorInventario("Acción de stock desconocida.");
    }

    inv.movimientos = inv.movimientos.slice(-MAX_MOVIMIENTOS);
    // Se conservan las ventas más recientes (las viejas ya quedaron en los movimientos)
    const ids = Object.keys(inv.ventas).sort((a, b) => inv.ventas[a].en.localeCompare(inv.ventas[b].en));
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_VENTAS))) delete inv.ventas[id];
    await repo.guardarEstado("inventario", inv);
    await repo.agregarNovedad(`${cambio.tipo === "venta" || cambio.tipo === "anular_venta" ? "Caja" : "Almacén"} (${origen === "juego" ? "oficina" : origen === "tiendanube" ? "Tiendanube" : "chat"}): ${resumen}`.slice(0, 1000));
    return { inventario: inv, resumen, ...(ventaId ? { id: ventaId } : {}) };
  });
}

// Lo que ven el juego y la IA: stock, qué se puede vender, ventas recientes y totales. Sin movimientos viejos.
export function vistaInventario(inv, hoy = new Date().toISOString().slice(0, 10)) {
  const ventas = Object.entries(inv.ventas).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.en.localeCompare(a.en));
  const vivas = ventas.filter((v) => !v.anulada);
  const delDia = vivas.filter((v) => v.fecha === hoy);
  const unidades = (lista) => lista.reduce((a, v) => a + v.items.reduce((b, l) => b + l.cantidad, 0), 0);
  return {
    stock: inv.stock,
    productos: Object.fromEntries(Object.entries(PRODUCTOS).map(([k, v]) => [k, v.nombre])),
    catalogo: Object.fromEntries(Object.entries(CATALOGO).map(([k, v]) => [k, { nombre: v.nombre, precio: v.precio, usa: v.usa, pide: v.usa.map(([g]) => g).filter((g) => g !== "medias") }])),
    ventas: ventas.slice(0, 30),
    totales: { ventas: vivas.length, importe: vivas.reduce((a, v) => a + v.importe, 0), hoy: { ventas: delDia.length, importe: delDia.reduce((a, v) => a + v.importe, 0), unidades: unidades(delDia) } },
    movimientos: inv.movimientos.slice(-10),
  };
}

// Copia legible para el repo (docs/operacion/inventario.md); acepta el inventario guardado o la vista que devuelve /oficina, sin hora de generación: si nada cambió el archivo queda idéntico.
export function markdownDeInventario(inv) {
  const filas = SKUS.map((s) => `| ${PRODUCTOS[s].nombre} | ${inv.stock[s]} |`);
  const ventas = (Array.isArray(inv.ventas) ? inv.ventas : Object.entries(inv.ventas).map(([id, v]) => ({ id, ...v }))).sort((a, b) => b.en.localeCompare(a.en));
  const lineas = ventas.length ? ventas.map((v) => `- ${v.fecha} · ${v.items.map((l) => `${l.cantidad} × ${CATALOGO[l.producto]?.nombre ?? l.producto}${Object.values(l.colores).length ? ` (${Object.values(l.colores).join(", ")})` : ""}`).join(" + ")} · ${pesos(v.importe)}${v.nota ? ` · ${v.nota.replace(/\|/g, "/")}` : ""}${v.anulada ? " · ANULADA" : ""}`) : ["_Todavía no hay ventas._"];
  const movs = inv.movimientos.length ? [...inv.movimientos].reverse().slice(0, 40).map((m) => `- ${m.en.slice(0, 16).replace("T", " ")} UTC · ${m.origen === "juego" ? "juego" : m.origen === "tiendanube" ? "Tiendanube" : "bot"} · ${m.texto}`) : ["_Sin movimientos._"];
  return ["# Inventario y ventas del Drop 00", "", "Copia automática del Almacén y la Caja de VOW HQ. La fuente de verdad es la base de datos del servicio: no se edita a mano acá (el próximo sincronizado lo pisa).", "", "## Stock", "", "| Producto | Cantidad |", "| --- | --- |", ...filas, "", "## Ventas", "", ...lineas, "", "## Últimos movimientos", "", ...movs, ""].join("\n");
}
