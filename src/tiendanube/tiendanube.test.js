import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { firmaValida } from "./firma.js";
import { itemsDelPedido, productoDeSku } from "./mapeo.js";
import { procesarAviso } from "./procesar.js";
import { aplicarInventario, leerInventario } from "../programacion/inventario.js";
import { crearRepositorioMemoria } from "../programacion/repositorio-memoria.js";

test("firmaValida acepta la firma correcta y rechaza el resto", () => {
  const cuerpo = Buffer.from('{"event":"order/paid","id":1}');
  const firma = createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  assert.equal(firmaValida(cuerpo, firma, "secreto"), true);
  assert.equal(firmaValida(cuerpo, firma, "otro"), false);
  assert.equal(firmaValida(Buffer.from("{}"), firma, "secreto"), false);
  assert.equal(firmaValida(cuerpo, "abc", "secreto"), false);
  assert.equal(firmaValida(cuerpo, firma, ""), false);
  assert.equal(firmaValida("texto", firma, "secreto"), false);
});

test("productoDeSku reconoce productos sueltos y packs con color", () => {
  assert.deepEqual(productoDeSku("gorra-negra"), { producto: "gorra", gorra: "negra" });
  assert.deepEqual(productoDeSku("Shaker-Claro"), { producto: "shaker", shaker: "claro" });
  assert.deepEqual(productoDeSku("medias"), { producto: "medias" });
  assert.deepEqual(productoDeSku("medias3"), { producto: "medias3" });
  assert.deepEqual(productoDeSku("pledge:beige"), { producto: "pledge", gorra: "beige" });
  assert.deepEqual(productoDeSku("oath:negra,claro"), { producto: "oath", gorra: "negra", shaker: "claro" });
  assert.equal(productoDeSku("oath:negra"), null);
  assert.equal(productoDeSku("pledge:rojo"), null);
  assert.equal(productoDeSku("remera"), null);
  assert.equal(productoDeSku(undefined), null);
});

test("itemsDelPedido separa lo que no tiene código VOW", () => {
  const { items, sinMapear } = itemsDelPedido({ products: [{ sku: "gorra-negra", quantity: 2 }, { sku: "", quantity: 1, name: "Algo" }, { sku: "medias", quantity: 0, name: "Medias" }] });
  assert.deepEqual(items, [{ producto: "gorra", gorra: "negra", cantidad: 2 }]);
  assert.deepEqual(sinMapear, ["Algo", "Medias"]);
});

async function armar(stock = { "gorra-negra": 10, medias: 20, "shaker-claro": 5 }) {
  const repo = crearRepositorioMemoria();
  for (const [sku, cantidad] of Object.entries(stock)) await aplicarInventario(repo, { tipo: "entrada", sku, cantidad });
  const pedidos = {};
  const cliente = { obtenerPedido: async (id) => { if (!pedidos[id]) throw new Error("Tiendanube respondió 500"); return pedidos[id]; } };
  return { repo, cliente, pedidos };
}

test("un pedido pagado descuenta el stock una sola vez aunque el aviso llegue repetido", async () => {
  const { repo, cliente, pedidos } = await armar();
  pedidos["100"] = { number: 7, products: [{ sku: "pledge:negra", quantity: 2 }] };
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 100 } }), "venta registrada");
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 100 } }), "ya registrado");
  const inv = await leerInventario(repo);
  assert.equal(inv.stock["gorra-negra"], 8);
  assert.equal(inv.stock.medias, 18);
  assert.equal(Object.keys(inv.ventas).length, 1);
  assert.match(Object.values(inv.ventas)[0].nota, /Tiendanube #7/);
});

test("un pedido cancelado devuelve el stock y no se anula dos veces", async () => {
  const { repo, cliente, pedidos } = await armar();
  pedidos["5"] = { number: 1, products: [{ sku: "shaker-claro", quantity: 1 }] };
  await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: "5" } });
  assert.equal((await leerInventario(repo)).stock["shaker-claro"], 4);
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/cancelled", id: "5" } }), "venta anulada");
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/cancelled", id: "5" } }), "sin venta que anular");
  assert.equal((await leerInventario(repo)).stock["shaker-claro"], 5);
});

test("si no alcanza el stock no se pierde el aviso: queda una novedad", async () => {
  const { repo, cliente, pedidos } = await armar({ "gorra-negra": 1, medias: 1 });
  pedidos["9"] = { number: 3, products: [{ sku: "gorra-negra", quantity: 3 }] };
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 9 } }), "no se pudo descontar");
  assert.equal((await leerInventario(repo)).stock["gorra-negra"], 1);
  assert.ok((await repo.novedadesPendientes()).some((n) => /pedido #3 está pagado/.test(n.texto)));
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 9 } }), "ya registrado");
});

test("productos sin código VOW avisan y no tocan el stock", async () => {
  const { repo, cliente, pedidos } = await armar();
  pedidos["11"] = { number: 4, products: [{ sku: "", name: "Gorra", quantity: 1 }] };
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 11 } }), "sin productos de VOW");
  assert.equal((await leerInventario(repo)).stock["gorra-negra"], 10);
  assert.ok((await repo.novedadesPendientes()).some((n) => /sin código VOW/.test(n.texto)));
});

test("si falla la consulta a Tiendanube tira error (para que Tiendanube reintente) y no registra nada", async () => {
  const { repo, cliente } = await armar();
  await assert.rejects(procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 77 } }), /500/);
  assert.equal(await procesarAviso({ repo, cliente, aviso: { event: "order/paid", id: 77 } }).catch(() => "falló otra vez"), "falló otra vez");
});

test("avisos de otro tipo o con id raro se ignoran", async () => {
  const { repo, cliente } = await armar();
  for (const aviso of [{ event: "product/updated", id: 1 }, { event: "order/paid", id: "../x" }, null, {}]) {
    assert.equal(await procesarAviso({ repo, cliente, aviso }), "ignorado");
  }
});
