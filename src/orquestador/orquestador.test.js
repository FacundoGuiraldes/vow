import test from "node:test";
import assert from "node:assert/strict";
import { ejecutarFlujo, registroNuevo, aprobar, rehacerDesde, costoUSD } from "./orquestador.js";

const ahora = () => new Date("2026-10-26T12:00:00Z");

// Paso de prueba: anota que corrió y devuelve lo que le pidamos
const paso = (nombre, { salida = nombre.toUpperCase(), uso, ok, errores, lanzar } = {}, corridas = []) => ({
  nombre,
  correr: async (contexto) => {
    corridas.push({ nombre, salidas: { ...contexto.salidas } });
    if (lanzar) throw new Error(lanzar);
    return { ok, salida, uso, errores };
  },
});
const puerta = (nombre) => ({ nombre, tipo: "aprobacion" });

test("ejecuta los pasos en orden y cada uno recibe lo que produjeron los anteriores", async () => {
  const corridas = [];
  const pasos = [paso("a", { salida: 1 }, corridas), paso("b", { salida: 2 }, corridas), paso("c", { salida: 3 }, corridas)];
  const r = await ejecutarFlujo({ pasos, registro: registroNuevo("2026-10-26"), ahora });
  assert.equal(r.estado, "completo");
  assert.deepEqual(corridas.map((c) => c.nombre), ["a", "b", "c"]);
  assert.deepEqual(corridas[2].salidas, { a: 1, b: 2 });
});

test("se frena en la puerta de aprobación y no corre lo que viene después", async () => {
  const corridas = [];
  const pasos = [paso("plan", {}, corridas), puerta("aprobar"), paso("guardar", {}, corridas)];
  const r = await ejecutarFlujo({ pasos, registro: registroNuevo("s"), ahora });
  assert.equal(r.estado, "esperando-aprobacion");
  assert.equal(r.esperando, "aprobar");
  assert.deepEqual(corridas.map((c) => c.nombre), ["plan"]);
  assert.equal(r.registro.pasos.guardar, undefined);
});

test("con la aprobación sigue, y no repite los pasos que ya terminaron", async () => {
  const corridas = [];
  const pasos = [paso("plan", {}, corridas), puerta("aprobar"), paso("guardar", {}, corridas)];
  const primera = await ejecutarFlujo({ pasos, registro: registroNuevo("s"), ahora });
  const segunda = await ejecutarFlujo({ pasos, registro: aprobar(primera.registro, "aprobar"), ahora });
  assert.equal(segunda.estado, "completo");
  assert.deepEqual(corridas.map((c) => c.nombre), ["plan", "guardar"]); // "plan" corrió una sola vez
  assert.equal(corridas[1].salidas.plan, "PLAN"); // lo guardado se reutiliza
});

test("aprobar un paso no lo marca como hecho hasta que el flujo lo recorre", () => {
  const r = aprobar(registroNuevo("s"), "aprobar");
  assert.equal(r.aprobaciones.aprobar, true);
  assert.equal(r.pasos.aprobar, undefined);
});

test("un paso que falla (ok: false) frena el flujo, guarda los errores y se vuelve a intentar", async () => {
  const corridas = [];
  const pasos = [paso("a", {}, corridas), paso("b", { ok: false, errores: ["no cumple X"], uso: { entrada: 10, salida: 5 } }, corridas), paso("c", {}, corridas)];
  const r = await ejecutarFlujo({ pasos, registro: registroNuevo("s"), ahora });
  assert.equal(r.estado, "error");
  assert.equal(r.fallo, "b");
  assert.deepEqual(r.registro.pasos.b.errores, ["no cumple X"]);
  assert.equal(r.registro.pasos.c, undefined);
  // al reintentar, "a" no se repite pero "b" sí
  await ejecutarFlujo({ pasos, registro: r.registro, ahora });
  assert.deepEqual(corridas.map((c) => c.nombre), ["a", "b", "b"]);
});

test("una excepción dentro de un paso queda registrada como error y no tira el flujo", async () => {
  const r = await ejecutarFlujo({ pasos: [paso("a", { lanzar: "se cayó la red" })], registro: registroNuevo("s"), ahora });
  assert.equal(r.estado, "error");
  assert.deepEqual(r.registro.pasos.a.errores, ["se cayó la red"]);
});

test("el gasto se acumula entre corridas, también el de los pasos que fallaron", async () => {
  const pasos = [paso("a", { uso: { entrada: 100, salida: 50 } }), paso("b", { ok: false, uso: { entrada: 1000, salida: 500 } })];
  const r = await ejecutarFlujo({ pasos, registro: registroNuevo("s"), ahora });
  assert.deepEqual(r.registro.gasto, { entrada: 1100, salida: 550 });
  const otra = await ejecutarFlujo({ pasos, registro: r.registro, ahora }); // "b" falla otra vez: se vuelve a gastar
  assert.deepEqual(otra.registro.gasto, { entrada: 2100, salida: 1050 });
});

test("rehacerDesde borra ese paso y los siguientes, aprobaciones incluidas", async () => {
  const pasos = [paso("plan"), puerta("aprobar"), paso("guardar")];
  const p1 = await ejecutarFlujo({ pasos, registro: registroNuevo("s"), ahora });
  const p2 = await ejecutarFlujo({ pasos, registro: aprobar(p1.registro, "aprobar"), ahora });
  assert.equal(p2.estado, "completo");
  const limpio = rehacerDesde(p2.registro, pasos, "plan");
  assert.deepEqual(limpio.pasos, {});
  assert.deepEqual(limpio.aprobaciones, {});
  assert.deepEqual(limpio.gasto, p2.registro.gasto); // la plata ya gastada no se borra
  const parcial = rehacerDesde(p2.registro, pasos, "guardar");
  assert.deepEqual(Object.keys(parcial.pasos), ["plan", "aprobar"]);
  assert.equal(parcial.aprobaciones.aprobar, true);
  assert.throws(() => rehacerDesde(p2.registro, pasos, "inexistente"), /No existe el paso/);
});

test("no modifica el registro que recibe", async () => {
  const original = registroNuevo("s");
  await ejecutarFlujo({ pasos: [paso("a", { uso: { entrada: 5, salida: 5 } })], registro: original, ahora });
  assert.deepEqual(original, registroNuevo("s"));
});

test("costoUSD: un millón de tokens de entrada y uno de salida cuestan 12 dólares", () => {
  assert.equal(costoUSD({ entrada: 1_000_000, salida: 1_000_000 }), 12);
  assert.equal(costoUSD({}), 0);
  assert.ok(Math.abs(costoUSD({ entrada: 25_000, salida: 5_000 }) - 0.1) < 1e-9);
});
