// La web nunca debe ofrecer más de lo que hay, y el servidor nunca debe aceptar más de lo que hay: se prueba cada producto y combo contra muchas situaciones de stock.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO, aplicarInventario } from "../programacion/inventario.js";
import { crearRepositorioMemoria } from "../programacion/repositorio-memoria.js";
import { ErrorPedido, crearPedido } from "./pedidos.js";
import { TOPE_POR_COMPRA, disponibilidadDe } from "./disponibilidad.js";
import { ajustarCarrito, maximoParaSumar } from "../../web/src/stock-carrito.js";

const COMPRADOR = { nombre: "Ana Pérez", email: "ana@mail.com", telefono: "11 5555-1234" };
const base = { urlPublica: "https://api.vow.test", urlLanding: "https://vow.test" };
const mp = { crearPreferencia: async (p) => ({ init_point: `https://mp.test/${p.external_reference}` }) };
const SKUS = ["gorra-negra", "gorra-beige", "shaker-negro", "shaker-claro", "medias"];
const COLOR = { gorra: "negra", shaker: "claro" }; // los colores que se piden en la prueba

const conStock = async (stock) => {
  const repo = crearRepositorioMemoria();
  for (const [sku, cantidad] of Object.entries(stock)) if (cantidad > 0) await aplicarInventario(repo, { tipo: "entrada", sku, cantidad });
  return repo;
};
const lineaDe = (producto, cantidad) => ({ producto, cantidad, ...Object.fromEntries(CATALOGO[producto].usa.map(([g]) => g).filter((g) => g !== "medias").map((g) => [g, COLOR[g]])) });
const skusDe = (producto) => CATALOGO[producto].usa.map(([g]) => (g === "medias" ? "medias" : `${g}-${COLOR[g]}`));
const pedidoAceptado = async (stock, producto, cantidad) => {
  const repo = await conStock(stock);
  const { color, ...linea } = lineaDe(producto, cantidad);
  try {
    await crearPedido({ repo, mp, ...base, cuerpo: { items: [linea], comprador: COMPRADOR, entrega: { tipo: "retiro" } } });
    return true;
  } catch (error) {
    if (error instanceof ErrorPedido && error.estado === 409) return false;
    throw error;
  }
};

describe("lo que ofrece la web coincide con lo que acepta el servidor", () => {
  const NIVELES = [0, 1, 2, 3, 5, 6, 15, 40];
  for (const producto of Object.keys(CATALOGO)) {
    test(`${producto}: el máximo que ofrece la web es justo lo que el servidor deja pedir`, async () => {
      const relevantes = skusDe(producto);
      const combos = relevantes.reduce((acc, sku) => acc.flatMap((c) => NIVELES.map((n) => ({ ...c, [sku]: n }))), [{}]);
      for (const stock of combos) {
        const info = disponibilidadDe(Object.fromEntries(SKUS.map((s) => [s, stock[s] ?? 0])));
        const def = info.productos.find((p) => p.id === producto);
        const ofrecido = maximoParaSumar(def, COLOR, info.maximos, [], info.productos);
        // El mayor n (hasta el tope) que el servidor acepta
        let aceptado = 0;
        for (let n = 1; n <= TOPE_POR_COMPRA + 1; n += 1) if (await pedidoAceptado(stock, producto, n)) aceptado = n; else break;
        assert.equal(ofrecido, Math.min(aceptado, TOPE_POR_COMPRA), `${producto} con stock ${JSON.stringify(stock)}: la web ofrece ${ofrecido} y el servidor acepta ${aceptado}`);
        if (ofrecido > 0) assert.equal(def.disponible, true);
      }
    });
  }
});

describe("carrito con varias líneas", () => {
  const stock = { "gorra-negra": 2, "shaker-claro": 1, medias: 3, "gorra-beige": 0, "shaker-negro": 0 };
  const info = disponibilidadDe(stock);

  test("las medias sueltas y las de los packs comparten el mismo stock", () => {
    const carrito = [lineaDe("medias", 2)];
    const pledge = info.productos.find((p) => p.id === "pledge");
    // Quedan 3 − 2 = 1 par: un pack Pledge entra, dos no
    assert.equal(maximoParaSumar(pledge, COLOR, info.maximos, carrito, info.productos), 1);
    const oath = info.productos.find((p) => p.id === "oath");
    assert.equal(maximoParaSumar(oath, COLOR, info.maximos, carrito, info.productos), 1);
    const medias3 = info.productos.find((p) => p.id === "medias3");
    assert.equal(maximoParaSumar(medias3, COLOR, info.maximos, carrito, info.productos), 0);
  });

  test("si el stock baja con el carrito armado, se recorta lo que ya no alcanza", () => {
    const carrito = [lineaDe("medias", 3), lineaDe("kept", 1)];
    const baja = disponibilidadDe({ ...stock, medias: 1 });
    assert.equal(ajustarCarrito(carrito, baja.productos, baja.maximos), true);
    const usadas = carrito.reduce((a, l) => a + (l.producto === "medias" ? l.cantidad : 1), 0);
    assert.ok(usadas <= 1, `quedaron ${usadas} pares`);
  });

  test("nunca se ofrece más del tope por compra", () => {
    const grande = disponibilidadDe({ ...stock, medias: 50 });
    const medias = grande.productos.find((p) => p.id === "medias");
    assert.equal(maximoParaSumar(medias, COLOR, grande.maximos, [], grande.productos), TOPE_POR_COMPRA);
    assert.ok(grande.maximos.medias <= 15, "no se informa cuánto stock hay por encima del tope");
  });
});
