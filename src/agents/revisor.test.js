import test from "node:test";
import assert from "node:assert/strict";
import { revisarPlan } from "./revisor.js";

const SEMANA = "2026-10-26";
const dia = (cambios = {}) => ({ fecha: "2026-10-27", formato: "reel", contenido: "Un plano fijo de unas manos atando el cordón antes de entrenar, sin cara ni producto.", ...cambios });
const plan = (dias = [dia()]) => ({ dias });

test("un flujo que cumple las reglas se aprueba", async () => {
  const r = await revisarPlan(plan(), { semanaInicio: SEMANA });
  assert.equal(r.aprobada, true);
  assert.deepEqual(r.problemas, []);
});

test("un flujo editado a mano con una palabra prohibida se rechaza y dice cuál", async () => {
  const r = await revisarPlan(plan([dia({ contenido: "Un reel que muestra cómo quemá grasa en el gimnasio con la gorra." })]), { semanaInicio: SEMANA });
  assert.equal(r.aprobada, false);
  assert.ok(r.problemas.length > 0);
});

test("las publicaciones fuera de la semana indicada se rechazan", async () => {
  const r = await revisarPlan(plan([dia({ fecha: "2026-11-20" })]), { semanaInicio: SEMANA });
  assert.equal(r.aprobada, false);
});

test("un flujo vacío o roto no explota: se rechaza", async () => {
  assert.equal((await revisarPlan(null, { semanaInicio: SEMANA })).aprobada, false);
  assert.equal((await revisarPlan({ dias: [] }, { semanaInicio: SEMANA })).aprobada, false);
});
