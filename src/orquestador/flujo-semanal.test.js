import test from "node:test";
import assert from "node:assert/strict";
import { armarPasos, PASOS } from "./flujo-semanal.js";
import { ejecutarFlujo, registroNuevo, aprobar } from "./orquestador.js";
import { crearClienteSimulado } from "../agents/cliente-simulado.js";

const SEMANA = "2026-10-26";
const ahora = () => new Date("2026-10-26T12:00:00Z");

const entorno = (cliente = crearClienteSimulado(SEMANA)) => {
  const escritos = {};
  return {
    escritos,
    pasos: armarPasos({
      opciones: { semana: SEMANA, piezas: 1 },
      cliente,
      leer: async () => "CONTENIDO",
      listar: async () => [],
      escribir: async (archivo, texto) => { escritos[archivo] = texto; },
    }),
  };
};

test("los pasos del flujo son los que dice PASOS, en ese orden", () => {
  assert.deepEqual(entorno().pasos.map((p) => p.nombre), PASOS);
});

test("flujo completo: planifica, revisa, espera la aprobación y recién después guarda el plan", async () => {
  const { pasos, escritos } = entorno();
  const primera = await ejecutarFlujo({ pasos, registro: registroNuevo(SEMANA), ahora });
  assert.equal(primera.estado, "esperando-aprobacion");
  assert.equal(primera.esperando, "aprobar-plan");
  assert.equal(primera.registro.pasos.revisar.estado, "ok");
  assert.deepEqual(escritos, {}); // sin aprobación no se guarda nada

  const segunda = await ejecutarFlujo({ pasos, registro: aprobar(primera.registro, "aprobar-plan"), ahora });
  assert.equal(segunda.estado, "completo");
  assert.deepEqual(Object.keys(escritos), [`plan-${SEMANA}.json`]);
  assert.equal(JSON.parse(escritos[`plan-${SEMANA}.json`]).piezas[0].gancho, "Una cosa por vez.");
});

test("si la IA no devuelve un plan válido, el flujo se frena en planificar y no pide aprobación", async () => {
  const roto = { messages: { create: async () => ({ content: [{ type: "text", text: "no sé" }], usage: { input_tokens: 10, output_tokens: 5 } }) } };
  const { pasos } = entorno(roto);
  const r = await ejecutarFlujo({ pasos, registro: registroNuevo(SEMANA), ahora });
  assert.equal(r.estado, "error");
  assert.equal(r.fallo, "planificar");
  assert.ok(r.registro.gasto.entrada > 0); // se registró lo gastado aunque falló
});

test("si el plan guardado pasa a romper una regla antes de la revisión, se frena en revisar", async () => {
  // El Estratega acepta el plan, pero el Revisor lo mira con otro contexto: ahí ya hay una pieza definida igual
  const { pasos } = entorno();
  pasos[0] = { nombre: "planificar", correr: async () => ({ salida: { resumen: "x", piezas: [{ fecha: SEMANA, formato: "reel", pilar: "proceso", gancho: "Dominá la barra." }] } }) };
  const r = await ejecutarFlujo({ pasos, registro: registroNuevo(SEMANA), ahora });
  assert.equal(r.estado, "error");
  assert.equal(r.fallo, "revisar");
  assert.ok(r.registro.pasos.revisar.errores.length > 0);
});

test("con sufijo (modo simulado) el plan se guarda con otro nombre", async () => {
  const escritos = {};
  const pasos = armarPasos({ opciones: { semana: SEMANA, piezas: 1 }, cliente: crearClienteSimulado(SEMANA), leer: async () => "C", listar: async () => [], escribir: async (a, t) => { escritos[a] = t; }, sufijo: "-simulado" });
  const primera = await ejecutarFlujo({ pasos, registro: registroNuevo(SEMANA), ahora });
  await ejecutarFlujo({ pasos, registro: aprobar(primera.registro, "aprobar-plan"), ahora });
  assert.deepEqual(Object.keys(escritos), [`plan-${SEMANA}-simulado.json`]);
});
