import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { firmaValida } from "./mercadopago.js";
import { confirmarPago, crearPedido, ErrorPedido } from "./pedidos.js";
import { crearRutasVentas } from "./rutas.js";
import { aplicarInventario, leerInventario } from "../programacion/inventario.js";
import { crearRepositorioMemoria } from "../programacion/repositorio-memoria.js";

const SECRETO = "secreto-mp-de-prueba";
const firmar = (dataId, requestId, ts = "1700000000") => `ts=${ts},v1=${createHmac("sha256", SECRETO).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex")}`;
const COMPRADOR = { nombre: "Ana Pérez", email: "ANA@mail.com", telefono: "11 5555-1234" };
const ENVIO = { tipo: "envio", cp: "1425", calle: "Salguero", numero: "100", localidad: "CABA", provincia: "Buenos Aires" };

async function armar(stock = { "gorra-negra": 5, medias: 10, "shaker-claro": 3 }) {
  const repo = crearRepositorioMemoria();
  for (const [sku, cantidad] of Object.entries(stock)) await aplicarInventario(repo, { tipo: "entrada", sku, cantidad });
  const preferencias = [];
  const mp = { crearPreferencia: async (p) => { preferencias.push(p); return { init_point: `https://mp.test/pagar/${p.external_reference}` }; }, obtenerPago: async () => { throw new Error("no definido"); } };
  return { repo, mp, preferencias };
}
const base = { urlPublica: "https://api.vow.test", urlLanding: "https://vow.test" };

describe("firma de Mercado Pago", () => {
  test("acepta la firma correcta y rechaza el resto", () => {
    const firma = firmar("123", "req-1");
    assert.equal(firmaValida({ secreto: SECRETO, firma, requestId: "req-1", dataId: "123" }), true);
    assert.equal(firmaValida({ secreto: SECRETO, firma, requestId: "req-2", dataId: "123" }), false);
    assert.equal(firmaValida({ secreto: SECRETO, firma, requestId: "req-1", dataId: "124" }), false);
    assert.equal(firmaValida({ secreto: "otro", firma, requestId: "req-1", dataId: "123" }), false);
    assert.equal(firmaValida({ secreto: SECRETO, firma: "ts=1,v1=abc", requestId: "req-1", dataId: "123" }), false);
    assert.equal(firmaValida({ secreto: SECRETO, firma: undefined, requestId: "req-1", dataId: "123" }), false);
  });
});

describe("crearPedido", () => {
  test("calcula el total con los precios del sistema y suma el envío", async () => {
    const { repo, mp, preferencias } = await armar();
    const r = await crearPedido({ repo, mp, ...base, cotizarEnvio: async () => ({ costo: 5000, servicio: "Correo Argentino" }), cuerpo: { items: [{ producto: "pledge", cantidad: 1, gorra: "negra" }], comprador: COMPRADOR, entrega: ENVIO } });
    assert.equal(r.importe, 34900 + 5000);
    assert.match(r.link, /^https:\/\/mp\.test\/pagar\//);
    assert.deepEqual(preferencias[0].items.map((i) => i.unit_price), [34900, 5000]);
    assert.equal(preferencias[0].payer.email, "ana@mail.com");
    assert.equal(preferencias[0].external_reference, r.id);
    assert.equal((await leerInventario(repo)).stock["gorra-negra"], 5, "crear el pedido no descuenta stock");
  });

  test("el precio no se puede mandar desde el navegador", async () => {
    const { repo, mp } = await armar();
    await assert.rejects(crearPedido({ repo, mp, ...base, cuerpo: { items: [{ producto: "gorra", cantidad: 1, gorra: "negra", precio: 1 }], comprador: COMPRADOR, entrega: { tipo: "retiro" } } }), ErrorPedido);
  });

  test("rechaza lo que no alcanza, lo incompleto y el envío sin cotizador", async () => {
    const { repo, mp } = await armar();
    const pedir = (cuerpo, extra = {}) => crearPedido({ repo, mp, ...base, ...extra, cuerpo });
    await assert.rejects(pedir({ items: [{ producto: "gorra", cantidad: 9, gorra: "negra" }], comprador: COMPRADOR, entrega: { tipo: "retiro" } }), /stock suficiente/);
    await assert.rejects(pedir({ items: [], comprador: COMPRADOR, entrega: { tipo: "retiro" } }), /carrito está vacío/);
    await assert.rejects(pedir({ items: [{ producto: "medias", cantidad: 1 }], comprador: { ...COMPRADOR, email: "x" }, entrega: { tipo: "retiro" } }), /email/);
    await assert.rejects(pedir({ items: [{ producto: "medias", cantidad: 1 }], comprador: COMPRADOR, entrega: { ...ENVIO, cp: "abc" } }), /código postal/);
    await assert.rejects(pedir({ items: [{ producto: "medias", cantidad: 1 }], comprador: COMPRADOR, entrega: ENVIO }), /solo hay retiro/);
    await assert.rejects(pedir({ items: [{ producto: "gorra", cantidad: 1 }], comprador: COMPRADOR, entrega: { tipo: "retiro" } }), /color/);
    const r = await pedir({ items: [{ producto: "medias", cantidad: 2 }], comprador: COMPRADOR, entrega: { tipo: "retiro" } });
    assert.equal(r.importe, 19800);
  });
});

describe("confirmarPago", () => {
  const pagoDe = (r, extra = {}) => ({ id: 555, external_reference: r.id, status: "approved", currency_id: "ARS", transaction_amount: r.importe, ...extra });
  const pedirUno = async (repo, mp) => crearPedido({ repo, mp, ...base, cuerpo: { items: [{ producto: "kept", cantidad: 1, shaker: "claro" }], comprador: COMPRADOR, entrega: { tipo: "retiro" } } });

  test("un pago aprobado descuenta el stock una sola vez", async () => {
    const { repo, mp } = await armar();
    const r = await pedirUno(repo, mp);
    assert.equal(await confirmarPago({ repo, pago: pagoDe(r) }), "venta registrada");
    assert.equal(await confirmarPago({ repo, pago: pagoDe(r) }), "ya registrado");
    const inv = await leerInventario(repo);
    assert.equal(inv.stock["shaker-claro"], 2);
    assert.equal(inv.stock.medias, 9);
    assert.match(Object.values(inv.ventas)[0].nota, /Mercado Pago 555/);
  });

  test("pagos pendientes, rechazados o de otro monto no descuentan", async () => {
    const { repo, mp } = await armar();
    const r = await pedirUno(repo, mp);
    assert.equal(await confirmarPago({ repo, pago: pagoDe(r, { status: "pending" }) }), "pago pending");
    assert.equal(await confirmarPago({ repo, pago: pagoDe(r, { status: "rejected" }) }), "pago rejected");
    assert.equal(await confirmarPago({ repo, pago: pagoDe(r, { status: "approved", transaction_amount: 1 }) }), "monto distinto");
    assert.equal(await confirmarPago({ repo, pago: pagoDe({ id: "no-existe", importe: 1 }) }), "pedido desconocido");
    assert.equal((await leerInventario(repo)).stock["shaker-claro"], 3);
    assert.ok((await repo.novedadesPendientes()).some((n) => /no coincide/.test(n.texto)));
  });

  test("si ya no queda stock, avisa para devolver el dinero", async () => {
    const { repo, mp } = await armar({ "shaker-claro": 1, medias: 5 });
    const a = await pedirUno(repo, mp);
    const b = await pedirUno(repo, mp);
    assert.equal(await confirmarPago({ repo, pago: pagoDe(a) }), "venta registrada");
    assert.equal(await confirmarPago({ repo, pago: pagoDe(b, { id: 556 }) }), "pagado sin stock");
    assert.equal((await leerInventario(repo)).stock["shaker-claro"], 0);
    assert.ok((await repo.novedadesPendientes()).some((n) => /devolverle el dinero/.test(n.texto)));
  });
});

describe("rutas de ventas", () => {
  let servidor;
  let url;
  let repo;
  let pagos;
  const levantar = async (opciones) => {
    const armado = await armar();
    repo = armado.repo;
    pagos = {};
    const mp = { crearPreferencia: armado.mp.crearPreferencia, obtenerPago: async (id) => pagos[id] };
    const app = express();
    app.use(express.json());
    app.use("/ventas", crearRutasVentas({ repo, mp, secretoWebhook: SECRETO, ...base, ...opciones }));
    servidor = await new Promise((r) => { const i = app.listen(0, "127.0.0.1", () => r(i)); });
    url = `http://127.0.0.1:${servidor.address().port}/ventas`;
  };
  after(() => { servidor?.closeAllConnections(); servidor?.close(); });

  test("con la venta cerrada no se pueden crear pedidos", async () => {
    await levantar({ ventaAbierta: false });
    assert.deepEqual(await (await fetch(`${url}/estado`)).json(), { abierta: false });
    const r = await fetch(`${url}/pedidos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 503);
    servidor.closeAllConnections(); servidor.close();
  });

  test("con la venta abierta: pedido, aviso firmado y stock descontado", async () => {
    await levantar({ ventaAbierta: true });
    const estado = await (await fetch(`${url}/estado`)).json();
    assert.equal(estado.abierta, true);
    assert.equal(estado.productos.find((p) => p.id === "gorra").precio, 29900);
    assert.ok(!JSON.stringify(estado).includes("stock"));
    const r = await fetch(`${url}/pedidos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ producto: "medias", cantidad: 1 }], comprador: COMPRADOR, entrega: { tipo: "retiro" } }) });
    assert.equal(r.status, 201);
    const pedido = await r.json();
    pagos["777"] = { id: 777, external_reference: pedido.id, status: "approved", currency_id: "ARS", transaction_amount: pedido.importe };
    const aviso = (firma) => fetch(`${url}/mercadopago?data.id=777&type=payment`, { method: "POST", headers: { "Content-Type": "application/json", "x-request-id": "r-9", "x-signature": firma }, body: JSON.stringify({ type: "payment", data: { id: "777" } }) });
    assert.equal((await aviso("ts=1,v1=" + "0".repeat(64))).status, 401);
    assert.equal((await leerInventario(repo)).stock.medias, 10);
    const ok = await aviso(firmar("777", "r-9"));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).resultado, "venta registrada");
    assert.equal((await leerInventario(repo)).stock.medias, 9);
  });
});
