import { test } from "node:test";
import assert from "node:assert/strict";
import { HERRAMIENTA_PLAN, esHoraDePublicacion, validarPlan, construirSistema } from "./estratega.js";
import { crearPieza, crearPlan } from "../programacion/ayuda-pruebas.js";

const validar = (pieza) => validarPlan(crearPlan([pieza]), { semanaInicio: "2026-10-26", recursos: { gente: true }, piezas: 1 });

test("una pieza con hora y material a producir válidos pasa", () => {
  const { ok, errores } = validar(crearPieza());
  assert.equal(ok, true, errores.join("; "));
});

test("los planes viejos, sin hora ni material a producir, siguen siendo válidos", () => {
  const { hora, material_a_producir: material, ...vieja } = crearPieza();
  void hora;
  void material;
  assert.equal(validar(vieja).ok, true);
});

test("rechaza horas con mal formato o fuera de 09:00–23:00", () => {
  for (const hora of ["08:59", "23:01", "25:00", "7:30", "19h", 1900, null]) {
    const { ok, errores } = validar(crearPieza({ hora }));
    assert.equal(ok, false, `la hora ${JSON.stringify(hora)} no debería pasar`);
    assert.match(errores.join(" "), /hora/);
  }
  for (const hora of ["09:00", "12:30", "23:00"]) assert.equal(validar(crearPieza({ hora })).ok, true);
});

test("el material a producir tiene que ser una lista de textos que cumpla las reglas de marca", () => {
  assert.match(validar(crearPieza({ material_a_producir: "filmar pies" })).errores.join(" "), /material_a_producir/);
  assert.match(validar(crearPieza({ material_a_producir: ["", "otro"] })).errores.join(" "), /material_a_producir/);
  assert.equal(validar(crearPieza({ material_a_producir: [] })).ok, true);
});

test("la herramienta del plan le pide a la IA la hora y el material a producir", () => {
  const item = HERRAMIENTA_PLAN.input_schema.properties.piezas.items;
  assert.ok(item.required.includes("hora"));
  assert.ok(item.required.includes("material_a_producir"));
  assert.match(item.properties.hora.description, /09:00/);
  assert.equal(item.properties.material_a_producir.type, "array");
});

test("esHoraDePublicacion", () => {
  assert.ok(esHoraDePublicacion("19:00"));
  assert.ok(!esHoraDePublicacion("08:00"));
  assert.ok(!esHoraDePublicacion(undefined));
});

test("las instrucciones del Estratega piden hora, material a producir y filmar de jueves en adelante", async () => {
  const { texto } = await construirSistema();
  assert.match(texto, /hora de publicación/);
  assert.match(texto, /material_a_producir/);
  assert.match(texto, /de jueves en adelante/);
  assert.match(texto, /música de la biblioteca de Instagram/);
});

const INDICACION = "Imagen vertical 4:5 de 1080x1350, fondo negro #0A0A0A con mucho espacio vacío y luz suave. Texto exacto: DROP 01. 2027. Revisá la ortografía.";

test("una pieza con IA pasa si trae una indicación completa; las viejas sin 'produccion' siguen valiendo", () => {
  assert.equal(validar(crearPieza({ produccion: "ia", instrucciones_ia: INDICACION })).ok, true);
  assert.equal(validar(crearPieza({ produccion: "mixto", instrucciones_ia: INDICACION })).ok, true);
  assert.equal(validar(crearPieza({ produccion: "propio", instrucciones_ia: "" })).ok, true);
  const { produccion, instrucciones_ia: indicacion, ...vieja } = crearPieza();
  void produccion;
  void indicacion;
  assert.equal(validar(vieja).ok, true);
});

test("una pieza con IA sin indicación (o con una de una palabra) no pasa", () => {
  for (const instrucciones_ia of [undefined, "", "   ", "Una imagen linda"]) {
    const { ok, errores } = validar(crearPieza({ produccion: "ia", instrucciones_ia }));
    assert.equal(ok, false, `${JSON.stringify(instrucciones_ia)} no debería pasar`);
    assert.match(errores.join(" "), /instrucciones_ia/);
  }
});

test("'produccion' solo acepta propio, ia o mixto", () => {
  for (const produccion of ["video", "IA", "", null, 3]) assert.match(validar(crearPieza({ produccion })).errores.join(" "), /produccion tiene que ser/);
});

test("la indicación para la IA también respeta las reglas de marca", () => {
  const { ok, errores } = validar(crearPieza({ produccion: "ia", instrucciones_ia: `${INDICACION} Mostrá un cuerpo soñado, cuerpo soñado en cada plano.` }));
  assert.equal(ok, false);
  assert.match(errores.join(" "), /instrucciones para la IA/);
});

test("la herramienta del plan pide 'produccion' e 'instrucciones_ia', y el prompt explica cuándo usar cada una y cómo escribir la indicación", async () => {
  const item = HERRAMIENTA_PLAN.input_schema.properties.piezas.items;
  assert.ok(item.required.includes("produccion") && item.required.includes("instrucciones_ia"));
  assert.deepEqual(item.properties.produccion.enum, ["propio", "ia", "mixto"]);
  const { texto } = await construirSistema();
  assert.match(texto, /instrucciones_ia es la indicación para copiar y pegar/);
  assert.match(texto, /textos EXACTOS de texto_en_pantalla/);
  assert.match(texto, /nunca lo que no tiene que aparecer/);
});
