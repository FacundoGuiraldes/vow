import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { crearArrepentimientos, ErrorArrepentimiento } from "./arrepentimiento.js";
import { crearRutasVentas } from "./rutas.js";
import { crearRepositorioMemoria } from "../programacion/repositorio-memoria.js";

describe("botón de arrepentimiento", () => {
  test("da un código al instante, lo guarda y avisa a VOW", async () => {
    const repo = crearRepositorioMemoria();
    const avisos = [];
    const arr = crearArrepentimientos({ repo, avisar: async (t) => avisos.push(t), ahora: () => Date.parse("2026-11-01T12:00:00Z") });
    const r = await arr.registrar({ nombre: "Ana  Pérez", email: "ANA@Mail.com", pedido: "VOW-123" });
    assert.match(r.codigo, /^ARR-[A-Z2-9]{6}$/);
    assert.equal(r.fecha, "2026-11-01T12:00:00.000Z");
    const guardado = (await repo.leerEstado("arrepentimientos")).registros;
    assert.equal(guardado.length, 1);
    assert.equal(guardado[0].email, "ana@mail.com");
    assert.equal(guardado[0].nombre, "Ana Pérez");
    assert.match(avisos[0], /Botón de arrepentimiento/);
    assert.match(avisos[0], new RegExp(r.codigo));
  });

  test("el pedido es opcional y no hace falta registrarse", async () => {
    const arr = crearArrepentimientos({ repo: crearRepositorioMemoria() });
    const r = await arr.registrar({ nombre: "Juan Gómez", email: "juan@mail.com" });
    assert.ok(r.codigo);
  });

  test("rechaza nombre o mail inválidos", async () => {
    const arr = crearArrepentimientos({ repo: crearRepositorioMemoria() });
    await assert.rejects(arr.registrar({ nombre: "", email: "a@b.com" }), ErrorArrepentimiento);
    await assert.rejects(arr.registrar({ nombre: "Ana Pérez", email: "no-es-mail" }), ErrorArrepentimiento);
  });

  test("si falla el aviso por Telegram igual entrega el código", async () => {
    const arr = crearArrepentimientos({ repo: crearRepositorioMemoria(), avisar: async () => { throw new Error("caído"); } });
    const original = console.error; console.error = () => {};
    try { assert.ok((await arr.registrar({ nombre: "Ana Pérez", email: "a@b.com" })).codigo); } finally { console.error = original; }
  });

  describe("ruta", () => {
    let servidor; let url;
    after(() => { servidor?.closeAllConnections(); servidor?.close(); });
    test("funciona con la venta cerrada y valida el pedido", async () => {
      const repo = crearRepositorioMemoria();
      const app = express(); app.use(express.json());
      app.use("/ventas", crearRutasVentas({ repo, secretoWebhook: "x", ventaAbierta: false, arrepentimientos: crearArrepentimientos({ repo }), urlPublica: "https://a.test", urlLanding: "https://b.test" }));
      servidor = await new Promise((r) => { const i = app.listen(0, "127.0.0.1", () => r(i)); });
      url = `http://127.0.0.1:${servidor.address().port}/ventas/arrepentimiento`;
      const enviar = (cuerpo) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const ok = await enviar({ nombre: "Ana Pérez", email: "ana@mail.com" });
      assert.equal(ok.status, 201);
      assert.match((await ok.json()).codigo, /^ARR-/);
      assert.equal((await enviar({ nombre: "A", email: "ana@mail.com" })).status, 400);
    });
  });
});
