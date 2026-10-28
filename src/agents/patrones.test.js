import test from "node:test";
import assert from "node:assert/strict";
import { calcularPatrones, patronesAMarkdown } from "./patrones.js";

const pub = (i, reacc, extra = {}) => ({ enlace: `https://www.instagram.com/p/X${extra.marca ?? "a"}${i}/`, tipo: "carrusel", fecha: "2026-10-10T10:00:00+0000", reaccionesPorSeguidor: reacc, palabras: 40, palabrasPrimeraLinea: 5, esPregunta: false, emojis: 0, hashtags: 0, primeraLinea: `Texto ${i}`, ...extra });
const cuenta = (marca, grupo, valores) => ({ marca, grupo, pais: "Argentina", publicaciones: valores.map((v, i) => pub(i, v, { marca })) });

test("calcula cuánto rindió cada publicación contra la mediana de SU cuenta y ordena por eso", () => {
  const datos = { fecha: "2026-10-27", cuentas: [cuenta("Uno", "argentina", [0.01, 0.01, 0.01, 0.01, 0.05]), cuenta("Dos", "global", [0.5, 0.5, 0.5, 0.5, 0.5])] };
  const p = calcularPatrones(datos);
  assert.deepEqual(Object.keys(p.grupos).sort(), ["argentina", "global"]);
  const mejor = p.grupos.argentina.mejores[0];
  assert.equal(mejor.veces_su_mediana, 5);
  assert.match(mejor.enlace, /^https:\/\/www\.instagram\.com\/p\//);
  // una cuenta enorme con números altos no le gana a una chica que rindió 5 veces lo normal
  assert.equal(p.grupos.global.mejores[0].veces_su_mediana, 1);
});

test("una cuenta con muy pocas publicaciones no sirve de vara y no entra", () => {
  const p = calcularPatrones({ cuentas: [cuenta("Chica", "chica", [0.1, 0.2])] });
  assert.equal(p.total_publicaciones, 0);
  assert.equal(patronesAMarkdown(p), "");
});

test("el markdown cita enlaces reales y avisa que son señales sobre muestras chicas", () => {
  const md = patronesAMarkdown(calcularPatrones({ fecha: "2026-10-27", cuentas: [cuenta("Uno", "argentina", [0.01, 0.01, 0.01, 0.01, 0.05])] }));
  assert.match(md, /Grupo argentina/);
  assert.match(md, /5 veces su mediana|5x su mediana/);
  assert.match(md, /instagram\.com\/p\//);
  assert.match(md, /sin IA/);
});
