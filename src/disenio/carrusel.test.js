import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARRUSELES, generar, htmlDeLamina, revisarLaminas } from "./carrusel.js";

test("los textos de todos los carruseles cumplen las reglas de marca", () => {
  for (const [nombre, { laminas }] of Object.entries(CARRUSELES)) {
    assert.deepEqual(revisarLaminas(laminas), [], `carrusel ${nombre}`);
  }
});

test("revisarLaminas detecta un texto que rompe las reglas, también dentro de una línea con flecha", () => {
  const mala = [{ lineas: [{ texto: "Dominá la barra", flecha: true }], fondo: "#000", tinta: "#fff", apoyo: "#888" }];
  const problemas = revisarLaminas(mala);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].lamina, 1);
  assert.equal(problemas[0].regla, "nombra elementos del gimnasio");
});

test("no se genera nada si un texto rompe las reglas", async () => {
  const mala = [{ lineas: ["Sin excusas"], fondo: "#000", tinta: "#fff", apoyo: "#888" }];
  await assert.rejects(() => generar(join(tmpdir(), "no-se-crea"), mala), /reglas de marca/);
});

test("las láminas de ambos carruseles son 5 y cada una tiene al menos una línea", () => {
  for (const { laminas } of Object.values(CARRUSELES)) {
    assert.equal(laminas.length, 5);
    assert.ok(laminas.every((l) => l.lineas.length > 0));
  }
});

test("la línea con flecha dibuja la flecha como imagen y la de texto no", () => {
  const html = htmlDeLamina(CARRUSELES.presentacion.laminas[2], 2, 5);
  assert.equal((html.match(/class="flecha"/g) ?? []).length, 1);
  assert.ok(!htmlDeLamina(CARRUSELES.promesa.laminas[0], 0, 5).includes('class="flecha"'));
});

test("el HTML no muestra números de lámina (se sacaron a pedido de Facundo)", () => {
  for (const { laminas } of Object.values(CARRUSELES)) {
    laminas.forEach((l, i) => assert.ok(!/0\d \/ 0\d/.test(htmlDeLamina(l, i, laminas.length))));
  }
});

// Necesita Chromium: en el CI de tests no está, así que se saltea
const chromium = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
test("genera los 5 PNG de cada carrusel sin que ninguna línea se salga del margen", { skip: !existsSync(chromium) && "no hay Chromium" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  for (const [nombre, { laminas }] of Object.entries(CARRUSELES)) {
    const salida = mkdtempSync(join(tmpdir(), `carrusel-${nombre}-`));
    await generar(salida, laminas);
    assert.deepEqual(readdirSync(salida).sort(), [1, 2, 3, 4, 5].map((n) => `lamina-${n}.png`));
  }
});

test("una línea demasiado larga se frena en vez de entregarse cortada", { skip: !existsSync(chromium) && "no hay Chromium" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  const larga = [{ lineas: ["Una línea muchísimo más larga que el margen permitido"], fondo: "#000", tinta: "#fff", apoyo: "#888" }];
  await assert.rejects(() => generar(mkdtempSync(join(tmpdir(), "carrusel-largo-")), larga), /se sale del margen/);
});

test("las láminas pueden decir 2027 (año del lanzamiento) pero no otra cifra", () => {
  const lamina = (texto) => [{ lineas: [texto], fondo: "#000", tinta: "#fff", apoyo: "#888" }];
  assert.deepEqual(revisarLaminas(lamina("Drop 01 en 2027.")), []);
  const problemas = revisarLaminas(lamina("Somos 500."));
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].fragmento, "500");
});

test("la presentación dice el año del lanzamiento en la última lámina", () => {
  const ultima = CARRUSELES.presentacion.laminas.at(-1);
  assert.ok(ultima.lineas.join(" ").includes("2027"));
});

test("las portadas de los dos carruseles tienen fondos distintos, para que la grilla del perfil alterne claro y oscuro", () => {
  assert.notEqual(CARRUSELES.promesa.laminas[0].fondo, CARRUSELES.presentacion.laminas[0].fondo);
});

test("dentro de cada carrusel, las láminas 1 a 4 alternan fondo claro y oscuro", () => {
  for (const { laminas } of Object.values(CARRUSELES)) {
    for (let i = 1; i < 4; i++) assert.notEqual(laminas[i].fondo, laminas[i - 1].fondo);
  }
});
