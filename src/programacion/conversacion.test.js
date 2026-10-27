
import { afirmaCambio as afirmaCambioProgramar, construirSistemaChat } from "./conversacion.js";
import { test as testProgramar } from "node:test";
import assert from "node:assert/strict";
testProgramar("afirmaCambio también detecta cuando dice que programó o armó una pieza", () => {
  assert.equal(afirmaCambioProgramar("Listo, ya la programé para el lunes."), true);
  assert.equal(afirmaCambioProgramar("La pieza quedó programada."), true);
  assert.equal(afirmaCambioProgramar("¿Querés que la programe?"), false);
});
testProgramar("el sistema del chat aclara que las historias se publican solas con archivo y confirmación", () => {
  for (const permitirPublicar of [true, false]) {
    const texto = construirSistemaChat({ fecha: "2026-10-27", hora: "09:00", permitirPublicar });
    assert.match(texto, /historias \(stories\) se publican solas/);
    assert.match(texto, /foto o un video/);
  }
});
