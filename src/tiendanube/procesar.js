// Lo que pasa cuando Tiendanube avisa de un pedido. El stock vive en el Almacén del HQ (src/programacion/inventario.js):
//   order/paid       → se registra la venta (descuenta el stock solo, una vez por pedido)
//   order/cancelled  → si ese pedido estaba registrado, se anula la venta y el stock vuelve
// Los avisos pueden llegar repetidos o desordenados: cada pedido se registra una sola vez y nunca se pierde un aviso por un error nuestro.
import { ErrorInventario, aplicarInventario, leerInventario } from "../programacion/inventario.js";
import { itemsDelPedido } from "./mapeo.js";

const CLAVE = "tiendanube";
const MAX_PEDIDOS = 300;
export const EVENTOS = ["order/paid", "order/cancelled"];

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
  const ids = Object.keys(pedidos).sort((a, b) => String(pedidos[a].en).localeCompare(String(pedidos[b].en)));
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_PEDIDOS))) delete pedidos[id];
  await repo.guardarEstado(CLAVE, { pedidos });
}

// aviso: { event, id }. Devuelve un texto de lo que hizo (para el log y los tests). Solo tira error si falló la consulta a Tiendanube: ahí conviene que reintente.
export function procesarAviso({ repo, cliente, aviso, ahora = Date.now() }) {
  return enCola(async () => {
    const id = String(aviso?.id ?? "");
    if (!EVENTOS.includes(aviso?.event) || !/^\d{1,20}$/.test(id)) return "ignorado";
    const pedidos = await leerPedidos(repo);
    const previo = pedidos[id];

    if (aviso.event === "order/cancelled") {
      if (!previo?.venta || previo.anulado) return "sin venta que anular";
      const inv = await leerInventario(repo);
      if (inv.ventas[previo.venta] && !inv.ventas[previo.venta].anulada) await aplicarInventario(repo, { tipo: "anular_venta", id: previo.venta }, { origen: "tiendanube", ahora });
      pedidos[id] = { ...previo, anulado: true };
      await guardarPedidos(repo, pedidos);
      return "venta anulada";
    }

    if (previo) return "ya registrado";
    const pedido = await cliente.obtenerPedido(id);
    const numero = pedido?.number ?? id;
    const { items, sinMapear } = itemsDelPedido(pedido);
    if (sinMapear.length) await repo.agregarNovedad(`Tiendanube: el pedido #${numero} trae productos sin código VOW en el SKU (${sinMapear.join(", ")}). Esos no se descontaron: revisá el stock a mano.`);
    if (!items.length) {
      pedidos[id] = { en: new Date(ahora).toISOString(), venta: null };
      await guardarPedidos(repo, pedidos);
      return "sin productos de VOW";
    }
    try {
      const { id: venta } = await aplicarInventario(repo, { tipo: "venta", items, nota: `Tiendanube #${numero}` }, { origen: "tiendanube", ahora });
      pedidos[id] = { en: new Date(ahora).toISOString(), venta };
      await guardarPedidos(repo, pedidos);
      return "venta registrada";
    } catch (error) {
      if (!(error instanceof ErrorInventario)) throw error;
      // La venta pasó de verdad en la tienda: no se reintenta, se avisa para que Facundo corrija el stock
      await repo.agregarNovedad(`Tiendanube: el pedido #${numero} está pagado pero no se pudo descontar del Almacén (${error.message}) Corregí el stock a mano.`.slice(0, 1000));
      pedidos[id] = { en: new Date(ahora).toISOString(), venta: null };
      await guardarPedidos(repo, pedidos);
      return "no se pudo descontar";
    }
  });
}
