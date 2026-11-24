
import { afirmaCambio as afirmaCambioProgramar, construirSistemaChat } from "./conversacion.js";
import { test as testProgramar } from "node:test";
import assert from "node:assert/strict";
testProgramar("afirmaCambio también detecta cuando dice que borró, eliminó o quitó una pieza", () => {
  assert.equal(afirmaCambioProgramar("Listo, ya la borré."), true);
  assert.equal(afirmaCambioProgramar("Eliminé el carrusel de la promesa."), true);
  assert.equal(afirmaCambioProgramar("La pieza quedó eliminada."), true);
  assert.equal(afirmaCambioProgramar("Lo quité del juego."), true);
  assert.equal(afirmaCambioProgramar("¿Querés que la borre?"), false);
});

testProgramar("afirmaCambio también detecta cuando dice que programó o armó algo", () => {
  assert.equal(afirmaCambioProgramar("Listo, ya la programé para el lunes."), true);
  assert.equal(afirmaCambioProgramar("¿Querés que la programe?"), false);
});

testProgramar("el sistema del chat aclara que el bot no publica y que el flujo lo arma el Estratega", () => {
  const texto = construirSistemaChat({ fecha: "2026-10-27", hora: "09:00" });
  assert.match(texto, /no las hacés ni las programás vos ni el bot/);
  assert.match(texto, /ver_flujo/);
  assert.doesNotMatch(texto, /se publican solas/);
});
