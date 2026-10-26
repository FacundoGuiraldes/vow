
import { afirmaCambio as afirmaCambioProgramar } from "./conversacion.js";
import { test as testProgramar } from "node:test";
import assert from "node:assert/strict";
testProgramar("afirmaCambio también detecta cuando dice que programó o armó una pieza", () => {
  assert.equal(afirmaCambioProgramar("Listo, ya la programé para el lunes."), true);
  assert.equal(afirmaCambioProgramar("La pieza quedó programada."), true);
  assert.equal(afirmaCambioProgramar("¿Querés que la programe?"), false);
});
