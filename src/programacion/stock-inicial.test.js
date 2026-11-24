import { test } from "node:test";
import assert from "node:assert/strict";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { aplicarInventario, cargarStockInicial, leerInventario, ErrorInventario } from "./inventario.js";
import { MARCA_STOCK_INICIAL, STOCK_INICIAL } from "./stock-inicial.js";

test("el stock inicial se carga una sola vez y deja cada talle y color en su cantidad", async () => {
  const repo = crearRepositorioMemoria();
  assert.ok(await cargarStockInicial(repo, STOCK_INICIAL, { marca: MARCA_STOCK_INICIAL }));
  const inv = await leerInventario(repo);
  assert.equal(inv.stock["medias-beige-grande"], 17);
  assert.equal(inv.stock["gorra-negra"], 9);
  // Una venta baja el stock; reiniciar el servicio no vuelve a pisarlo
  await aplicarInventario(repo, { tipo: "venta", items: [{ producto: "medias", cantidad: 2, medias: "negro", talle: "super" }] });
  assert.equal(await cargarStockInicial(repo, STOCK_INICIAL, { marca: MARCA_STOCK_INICIAL }), null);
  assert.equal((await leerInventario(repo)).stock["medias-negro-super"], 28);
});

test("las medias piden color y talle, y el talle súper acepta tilde", async () => {
  const repo = crearRepositorioMemoria();
  await cargarStockInicial(repo, STOCK_INICIAL, { marca: MARCA_STOCK_INICIAL });
  await assert.rejects(aplicarInventario(repo, { tipo: "venta", items: [{ producto: "medias", cantidad: 1, medias: "negro" }] }), ErrorInventario);
  await assert.rejects(aplicarInventario(repo, { tipo: "venta", items: [{ producto: "medias", cantidad: 1, talle: "grande" }] }), ErrorInventario);
  await aplicarInventario(repo, { tipo: "venta", items: [{ producto: "pledge", cantidad: 1, gorra: "beige", medias: "hueso", talle: "Súper" }] });
  const { stock } = await leerInventario(repo);
  assert.equal(stock["medias-hueso-super"], 17);
  assert.equal(stock["gorra-beige"], 8);
});
