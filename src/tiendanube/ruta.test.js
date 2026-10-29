import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { crearRutasProgramacion } from "../programacion/rutas.js";
import { crearRepositorioMemoria } from "../programacion/repositorio-memoria.js";
import { aplicarInventario, leerInventario } from "../programacion/inventario.js";
import { procesarAviso } from "./procesar.js";

const SECRETO = "client-secret-de-prueba";
const levantar = (app) => new Promise((resolver) => { const i = app.listen(0, "127.0.0.1", () => resolver(i)); });

describe("POST /api/programacion/tiendanube", () => {
  const repo = crearRepositorioMemoria();
  const pedidos = { 321: { number: 12, products: [{ sku: "medias2", quantity: 1 }] } };
  const cliente = { obtenerPedido: async (id) => pedidos[id] };
  let servidor;
  let base;

  before(async () => {
    await aplicarInventario(repo, { tipo: "entrada", sku: "medias", cantidad: 10 });
    const router = crearRutasProgramacion({ servicio: {}, repo, secretoApi: "clave", secretoWebhook: "secreto-webhook-1234", tiendanube: { secreto: SECRETO, procesar: (aviso) => procesarAviso({ repo, cliente, aviso }) } });
    const app = express();
    app.use("/api/programacion", router);
    servidor = await levantar(app);
    base = `http://127.0.0.1:${servidor.address().port}/api/programacion/tiendanube`;
  });
  after(() => { servidor.closeAllConnections(); servidor.close(); });

  const enviar = (cuerpo, firmar = SECRETO) => {
    const texto = JSON.stringify(cuerpo);
    return fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...(firmar ? { "x-linkedstore-hmac-sha256": createHmac("sha256", firmar).update(texto).digest("hex") } : {}) }, body: texto });
  };

  test("rechaza avisos sin firma o con firma ajena", async () => {
    assert.equal((await enviar({ event: "order/paid", id: 321 }, null)).status, 401);
    assert.equal((await enviar({ event: "order/paid", id: 321 }, "otro-secreto")).status, 401);
    assert.equal((await leerInventario(repo)).stock.medias, 10);
  });

  test("un aviso firmado descuenta el stock del Almacén", async () => {
    const r = await enviar({ store_id: 1, event: "order/paid", id: 321 });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).resultado, "venta registrada");
    assert.equal((await leerInventario(repo)).stock.medias, 8);
  });
});
