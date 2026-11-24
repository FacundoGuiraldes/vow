import test from "node:test";
import assert from "node:assert/strict";
import { armarPlan, ejecutarCaso, ejecutarEvals, ejecutarFrases, leerConjunto, leerFrases, reglasSinCaso } from "./ejecutar.js";
import { NOMBRES_DE_REGLAS, NOMBRES_DE_REGLAS_DURAS } from "../src/agents/reglas-marca.js";

test("todos los casos del Revisor dan el resultado esperado", async () => {
  const { resultados } = await ejecutarEvals(await leerConjunto());
  const fallidos = resultados.filter((r) => !r.ok).map((r) => `${r.id}: ${r.motivos.join("; ")}`);
  assert.deepEqual(fallidos, []);
});

test("cada regla dura de marca tiene al menos un caso que la dispara", async () => {
  assert.deepEqual(reglasSinCaso(await leerConjunto()), []);
});

test("hay casos que aprueban y casos que rechazan (no solo un lado)", async () => {
  const { casos } = await leerConjunto();
  assert.ok(casos.some((c) => c.esperado.aprobada));
  assert.ok(casos.some((c) => !c.esperado.aprobada));
  assert.equal(new Set(casos.map((c) => c.id)).size, casos.length, "hay ids repetidos");
});

test("el ejecutor detecta un caso mal esperado (si no, las evals no servirían)", async () => {
  const conjunto = await leerConjunto();
  const caso = conjunto.casos.find((c) => c.id === "resultado-fisico");
  // Decimos que se aprueba, pero promete un resultado físico: tiene que marcarlo como fallido
  assert.equal((await ejecutarCaso(conjunto, { ...caso, esperado: { aprobada: true, problemas_contienen: [] } })).ok, false);
  // Decimos que se rechaza por otro motivo: también
  assert.equal((await ejecutarCaso(conjunto, { ...caso, esperado: { aprobada: false, problemas_contienen: ["urgencia falsa"] } })).ok, false);
  // Y un caso que se aprueba no puede declarar problemas esperados
  const bueno = conjunto.casos.find((c) => c.id === "base-valido");
  assert.equal((await ejecutarCaso(conjunto, { ...bueno, esperado: { aprobada: false, problemas_contienen: [] } })).ok, false);
});

test("reglasSinCaso avisa cuando una regla no tiene caso", async () => {
  const conjunto = await leerConjunto();
  // Sacamos todos los casos que apuntan a esa regla
  const sinUrgencia = { ...conjunto, casos: conjunto.casos.filter((c) => ![...c.esperado.problemas_contienen, ...(c.esperado.avisos_contienen ?? [])].includes("urgencia falsa")) };
  assert.deepEqual(reglasSinCaso(sinUrgencia), ["urgencia falsa"]);
});

test("armarPlan combina el día base con los cambios", async () => {
  const conjunto = await leerConjunto();
  const plan = armarPlan(conjunto, { dia: { formato: "story" }, plan: { nota: "R" } });
  assert.equal(plan.dias[0].formato, "story");
  assert.equal(plan.dias[0].fecha, conjunto.base.fecha);
  assert.equal(plan.nota, "R");
  assert.equal(armarPlan(conjunto, { dias: [{}, {}] }).dias.length, 2);
});

test("las reglas duras son un subconjunto de las reglas de marca", () => {
  assert.ok(NOMBRES_DE_REGLAS_DURAS.length > 0);
  assert.ok(NOMBRES_DE_REGLAS_DURAS.every((r) => NOMBRES_DE_REGLAS.includes(r)));
});

test("cada regla de marca detecta todas las frases de ejemplo y ninguna frase común dispara una regla", async () => {
  const fallidas = ejecutarFrases(await leerFrases()).filter((r) => !r.ok).map((r) => `${r.id}: ${r.motivos.join("; ")}`);
  assert.deepEqual(fallidas, []);
});

test("las frases por regla cubren todas las reglas de marca", async () => {
  const { disparan } = await leerFrases();
  assert.deepEqual(NOMBRES_DE_REGLAS.filter((regla) => !(disparan[regla]?.length > 0)), []);
});

test("ejecutarFrases detecta una frase mal clasificada", () => {
  const mal = { disparan: { "presumir": ["Cumplite a vos primero."] }, no_disparan: ["Dominá la barra."] };
  const resultados = ejecutarFrases(mal);
  assert.equal(resultados.length, 2);
  assert.ok(resultados.every((r) => !r.ok));
});

test("el verbo \"pesa\" no se confunde con las pesas del gimnasio (falso positivo corregido)", async () => {
  const r = await ejecutarCaso(await leerConjunto(), { id: "x", dia: { contenido: "Texto sobre fondo hueso: lo que pesa, se sostiene. Una frase por vez, sin música." }, esperado: { aprobada: true, problemas_contienen: [] } });
  assert.equal(r.ok, true, r.motivos.join("; "));
});
