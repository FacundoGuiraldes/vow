import test from "node:test";
import assert from "node:assert/strict";
import { clasificarError, compararConLineaBase, correrEvalsOnline, resumir } from "./ejecutar-online.js";

const pedidos = [
  { id: "a", semana: "2026-11-02", fase: "base", piezas: 1 },
  { id: "b", semana: "2026-11-09", fase: "base", piezas: 2 },
  { id: "c", semana: "2026-11-16", fase: "base", piezas: 2 },
];
const crearCliente = () => ({});

// Planificador falso: contesta lo que le indiquemos por pedido, sin tocar la API
const falso = (porSemana) => async ({ semanaInicio }) => {
  const r = porSemana[semanaInicio];
  if (r instanceof Error) throw r;
  return r;
};
const bueno = (entrada = 1000, salida = 500) => ({ ok: true, errores: [], uso: { entrada, salida } });
const malo = (errores, entrada = 1000, salida = 500) => ({ ok: false, errores, uso: { entrada, salida } });

test("cuenta aprobados y rechazados y calcula tasa y costo (entrada 1000 + salida 500 = US$ 0,007)", async () => {
  const planificar = falso({ "2026-11-02": bueno(), "2026-11-09": malo(["Pieza 1: urgencia falsa (\"solo hoy\")."]), "2026-11-16": bueno() });
  const { resumen, resultados } = await correrEvalsOnline({ pedidos, crearCliente, planificar });
  assert.equal(resumen.aprobados, 2);
  assert.equal(resumen.rechazados, 1);
  assert.ok(Math.abs(resumen.tasaAprobacion - 2 / 3) < 1e-9);
  assert.ok(Math.abs(resumen.costoMedioUSD - 0.007) < 1e-9, String(resumen.costoMedioUSD));
  assert.deepEqual(resultados.map((r) => r.estado), ["aprobado", "rechazado", "aprobado"]);
});

test("un error de red es 'error-tecnico': no baja la tasa de aprobación", async () => {
  const planificar = falso({ "2026-11-02": bueno(), "2026-11-09": new Error("ECONNRESET"), "2026-11-16": bueno() });
  const { resumen, resultados } = await correrEvalsOnline({ pedidos, crearCliente, planificar });
  assert.equal(resumen.erroresTecnicos, 1);
  assert.equal(resumen.tasaAprobacion, 1);
  assert.deepEqual(resultados[1].errores, ["ECONNRESET"]);
});

test("el tope de gasto corta: lo que falta queda 'omitido' y no se llama a la IA", async () => {
  let llamadas = 0;
  const planificar = async () => { llamadas++; return bueno(1_000_000, 0); }; // cada pedido cuesta US$ 2
  const { resumen, resultados } = await correrEvalsOnline({ pedidos, crearCliente, planificar, topeUSD: 1 });
  assert.equal(llamadas, 1);
  assert.deepEqual(resultados.map((r) => r.estado), ["aprobado", "omitido", "omitido"]);
  assert.equal(resumen.omitidos, 2);
  assert.equal(resumen.costoTotalUSD, 2);
});

test("el tope corta también cuando el gasto llega justo al tope (no hace falta pasarse)", async () => {
  let llamadas = 0;
  const planificar = async () => { llamadas++; return bueno(1_000_000, 0); }; // US$ 2 cada uno
  await correrEvalsOnline({ pedidos, crearCliente, planificar, topeUSD: 2 });
  assert.equal(llamadas, 1);
});

test("repeticiones corre cada pedido varias veces y los distingue por número", async () => {
  const { resultados } = await correrEvalsOnline({ pedidos: [pedidos[0]], crearCliente, planificar: falso({ "2026-11-02": bueno() }), repeticiones: 3 });
  assert.deepEqual(resultados.map((r) => r.id), ["a #1", "a #2", "a #3"]);
});

test("le pasa al planificador los datos del pedido y un cliente propio", async () => {
  const recibido = [];
  const planificar = async (pedido, { cliente }) => { recibido.push({ pedido, cliente }); return bueno(); };
  const pedido = { id: "x", semana: "2026-11-02", fase: "expectativa", piezas: 2, recursos: { producto: true }, notas: "N" };
  await correrEvalsOnline({ pedidos: [pedido], crearCliente: (p) => ({ para: p.id }), planificar });
  assert.deepEqual(recibido[0].pedido, { semanaInicio: "2026-11-02", fase: "expectativa", recursos: { producto: true }, notas: "N", piezas: 2 });
  assert.deepEqual(recibido[0].cliente, { para: "x" });
});

test("clasificarError agrupa el mismo problema aunque cambie la pieza o la palabra citada", () => {
  const a = clasificarError('Pieza 1: nombra elementos del gimnasio ("barra").');
  const b = clasificarError('Pieza 2: nombra elementos del gimnasio ("pesas").');
  assert.equal(a, b);
  assert.equal(a, "nombra elementos del gimnasio");
  assert.notEqual(a, clasificarError('Pieza 1: urgencia falsa ("solo hoy").'));
  assert.equal(clasificarError("Pieza 2: tiene 14 palabras (máximo 12)."), clasificarError("Pieza 1: tiene 13 palabras (máximo 12)."));
});

test("problemasFrecuentes cuenta por plan rechazado (no por repetición dentro del mismo plan) y ordena de más a menos", () => {
  const r = (errores) => ({ estado: "rechazado", errores, uso: { entrada: 0, salida: 0 }, costoUSD: 0, ms: 0 });
  const { problemasFrecuentes } = resumir([
    r(["Pieza 1: tiene 13 palabras (máximo 12)."]), // el menos frecuente aparece primero
    r(['Pieza 1: presumir ("bestia").', 'Pieza 2: presumir ("crack").']),
    r(['Pieza 1: presumir ("bestia").', "Pieza 1: tiene 14 palabras (máximo 12)."]),
    r(['Pieza 1: presumir ("crack").']),
  ]);
  assert.deepEqual(problemasFrecuentes, [{ problema: "presumir", veces: 3 }, { problema: "tiene N palabras (máximo N)", veces: 2 }]);
});

test("resumir sin ningún plan medido no divide por cero", () => {
  const s = resumir([{ estado: "omitido", errores: [], uso: { entrada: 0, salida: 0 }, costoUSD: 0, ms: 0 }]);
  assert.equal(s.tasaAprobacion, null);
  assert.equal(s.costoMedioUSD, null);
});

test("compararConLineaBase: avisa si baja la tasa o sube el costo más que el margen, y tolera la variación normal", () => {
  const base = { tasaAprobacion: 0.9, costoMedioUSD: 0.05 };
  assert.equal(compararConLineaBase({ tasaAprobacion: 0.9, costoMedioUSD: 0.05 }, base).ok, true);
  assert.equal(compararConLineaBase({ tasaAprobacion: 0.8, costoMedioUSD: 0.06 }, base).ok, true); // variación normal
  const peorTasa = compararConLineaBase({ tasaAprobacion: 0.5, costoMedioUSD: 0.05 }, base);
  assert.equal(peorTasa.ok, false);
  assert.match(peorTasa.avisos[0], /tasa de aprobación/);
  const masCaro = compararConLineaBase({ tasaAprobacion: 0.9, costoMedioUSD: 0.2 }, base);
  assert.equal(masCaro.ok, false);
  assert.match(masCaro.avisos[0], /costo/);
});

test("compararConLineaBase sin línea base no falla y lo avisa", () => {
  const r = compararConLineaBase({ tasaAprobacion: 1, costoMedioUSD: 0.05 }, null);
  assert.equal(r.ok, true);
  assert.equal(r.sinBase, true);
});

test("un plan rechazado guarda lo que propuso la IA y cuántos intentos hizo; uno aprobado no guarda la propuesta", async () => {
  const propuesta = { resumen: "x", piezas: "texto en vez de lista" };
  const planificar = falso({ "2026-11-02": { ...bueno(), intentos: 1, propuesta: { resumen: "bien" } }, "2026-11-09": { ...malo(["El plan no tiene piezas."]), intentos: 2, propuesta } });
  const { resultados } = await correrEvalsOnline({ pedidos: pedidos.slice(0, 2), crearCliente, planificar });
  assert.equal(resultados[0].propuesta, null);
  assert.equal(resultados[0].intentos, 1);
  assert.deepEqual(resultados[1].propuesta, propuesta);
  assert.equal(resultados[1].intentos, 2);
});
