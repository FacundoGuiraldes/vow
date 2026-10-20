import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ESCENAS, duracionTotal, entrada, escenaEn, generar, revisarEscenas } from "./reel.js";

test("el guion del reel cumple las reglas de marca", () => {
  assert.deepEqual(revisarEscenas(), []);
});

test("una frase que rompe las reglas de marca se detecta y se dice en qué escena", () => {
  const malas = [{ segundos: 1, lineas: ["Modo bestia", "activado"], tamano: 100, fondo: "#000", tinta: "#fff" }];
  const problemas = revisarEscenas(malas);
  assert.ok(problemas.length > 0);
  assert.equal(problemas[0].escena, 1);
});

test("una cifra que no es 01 ni 2027 se rechaza", () => {
  const mala = [{ segundos: 1, lineas: ["Drop 01"], pie: "en 2028", tamano: 100, fondo: "#000", tinta: "#fff" }];
  assert.ok(revisarEscenas(mala).some((p) => p.regla === "cifra que no está en los datos"));
});

test("el gancho es la primera escena y se lee en menos de 2,5 segundos; el reel dura entre 7 y 30 segundos", () => {
  assert.ok(ESCENAS[0].segundos <= 2.5);
  assert.ok(ESCENAS[0].lineas.join(" ").includes("?"));
  assert.ok(duracionTotal() >= 7 && duracionTotal() <= 30);
});

test("escenaEn devuelve la escena y el tiempo local; después del final se queda en la última", () => {
  assert.equal(escenaEn(0).indice, 0);
  assert.equal(escenaEn(ESCENAS[0].segundos).indice, 1); // justo en el corte pasa a la siguiente
  assert.ok(Math.abs(escenaEn(ESCENAS[0].segundos + 0.5).local - 0.5) < 1e-9);
  assert.equal(escenaEn(999).indice, ESCENAS.length - 1);
});

test("entrada arranca rápido y frena al final (no es lineal)", () => {
  assert.ok(entrada(0.2, 0) > 0.5); // a mitad de tiempo ya avanzó más de la mitad
  assert.ok(entrada(0.2, 0) < 1);
});

test("entrada va de 0 a 1 y cada línea arranca después de la anterior", () => {
  assert.equal(entrada(0, 0), 0);
  assert.equal(entrada(10, 0), 1);
  assert.ok(entrada(0.2, 0) > entrada(0.2, 1));
});

const chromium = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const hayFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
test("genera un MP4 vertical sin que ninguna línea se salga del margen", { skip: (!existsSync(chromium) || !hayFfmpeg) && "no hay Chromium o ffmpeg" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  const corta = ESCENAS.slice(0, 1).map((e) => ({ ...e, segundos: 0.5 }));
  const archivo = await generar(mkdtempSync(join(tmpdir(), "reel-")), corta);
  assert.ok(statSync(archivo).size > 1000);
  const sonda = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", archivo]).stdout.toString().trim();
  assert.equal(sonda, "1080,1920");
});

test("si una línea se pasa del margen derecho (96 px), frena sin generar el video", { skip: (!existsSync(chromium) || !hayFfmpeg) && "no hay Chromium o ffmpeg" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  // "Cumplite" a 140 px mide unos 920 px: entra en la pantalla (1080) pero invade el margen (límite 888 px de texto)
  const ancha = [{ segundos: 0.2, lineas: ["Cumplite"], tamano: 140, fondo: "#000", tinta: "#fff" }];
  await assert.rejects(generar(mkdtempSync(join(tmpdir(), "reel-")), ancha), /se sale del margen/);
});

test("un texto que explica la marca por dentro (paleta, tipografías) no puede estar en pantalla", () => {
  const mala = [{ segundos: 1, lineas: ["Nuestra paleta", "y tipografía"], tamano: 100, fondo: "#000", tinta: "#fff" }];
  assert.ok(revisarEscenas(mala).some((p) => p.regla === "explica la marca por dentro"));
});
