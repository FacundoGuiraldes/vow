import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { puntuarGancho, resumenCalidad, revisarEpigrafe, revisarPieza } from "./calidad-instagram.js";

describe("gancho", () => {
  test("un gancho corto, concreto y en voseo puntúa fuerte", () => {
    const g = puntuarGancho("Probá el shaker del Drop 01");
    assert.equal(g.veredicto, "fuerte");
    assert.deepEqual(g.banderas, []);
  });

  test("saludo, anuncio y hashtag son banderas y bajan el puntaje", () => {
    const g = puntuarGancho("Hola, hoy te cuento cómo entrenar mejor todos los días con lo que tenés #viral");
    assert.equal(g.veredicto, "flojo");
    assert.equal(g.banderas.length, 3);
  });

  test("los ejes dicen qué es lo más flojo", () => {
    assert.equal(puntuarGancho("Esto es lo que hacemos todos los días").masBajo, "concreto");
    assert.equal(puntuarGancho("Probá la gorra").ejes.voz, 100);
  });

  test("un gancho vacío no rompe", () => {
    assert.equal(puntuarGancho("").veredicto, "flojo");
    assert.equal(puntuarGancho(undefined).veredicto, "flojo");
  });
});

describe("epígrafe", () => {
  const ids = (r) => r.avisos.map((a) => a.chequeo);

  test("un epígrafe prolijo queda listo", () => {
    const r = revisarEpigrafe("El shaker del Drop 01 ya tiene color.\n\nContanos cuál elegís.\n\n#vow #gym");
    assert.equal(r.veredicto, "listo");
  });

  test("más de cinco hashtags es un error; los genéricos, un aviso", () => {
    const r = revisarEpigrafe("Shaker del Drop 01 #a #b #c #d #e #viral");
    assert.equal(r.veredicto, "arreglar");
    assert.ok(r.avisos.some((a) => a.nivel === "fail" && a.chequeo === "hashtags"));
    assert.ok(r.avisos.some((a) => /genéricos/.test(a.mensaje)));
  });

  test("empezar con hashtag o arroba es un error", () => {
    assert.equal(revisarEpigrafe("#vow el shaker").veredicto, "arreglar");
    assert.equal(revisarEpigrafe("@vow_ar el shaker").veredicto, "arreglar");
  });

  test("pasarse de 2200 caracteres es un error", () => {
    assert.equal(revisarEpigrafe(`Gorra de VOW ${"a".repeat(2300)}`).veredicto, "arreglar");
  });

  test("enlaces y más de un pedido son avisos", () => {
    const r = revisarEpigrafe("Gorra del Drop 01. Entrá a https://vow-17x.pages.dev, guardalo y comentá cuál te gusta.");
    assert.ok(ids(r).includes("enlaces"));
    assert.ok(ids(r).includes("un solo pedido"));
    assert.equal(r.veredicto, "revisar");
  });

  test("en un epígrafe corto los hashtags del final no se marcan como visibles", () => {
    assert.ok(!ids(revisarEpigrafe("Gorra del Drop 01 #vow")).includes("hashtags"));
    const largo = `Gorra del Drop 01. ${"Cuerpo del texto. ".repeat(12)}`;
    assert.ok(!ids(revisarEpigrafe(`${largo}\n\n#vow`)).includes("hashtags"));
    assert.ok(ids(revisarEpigrafe(`#vow ${largo}`)).includes("primera línea"));
  });

  test("detecta caracteres invisibles, rayas largas y muletillas", () => {
    const r = revisarEpigrafe("Gorra del Drop 01 — la mejor — sin lugar a dudas.​");
    const huella = r.avisos.find((a) => a.chequeo === "suena a texto automático");
    assert.ok(huella);
    assert.match(huella.mensaje, /invisible/);
    assert.match(huella.mensaje, /rayas largas/);
    assert.match(huella.mensaje, /sin lugar a dudas/);
  });

  test("palabras clave: avisa si ninguna aparece", () => {
    assert.ok(ids(revisarEpigrafe("Gorra del Drop 01.", { palabrasClave: ["shaker"] })).includes("palabras clave"));
    assert.ok(!ids(revisarEpigrafe("Gorra del Drop 01.", { palabrasClave: ["gorra"] })).includes("palabras clave"));
  });
});

describe("pieza", () => {
  test("sin gancho ni epígrafe no hay nada que revisar", () => {
    assert.equal(revisarPieza({}), null);
    assert.equal(revisarPieza(null), null);
  });

  test("una story sin epígrafe solo se revisa por el gancho", () => {
    const r = revisarPieza({ formato: "story", gancho: "Probá la gorra del Drop 01" });
    assert.equal(r.veredicto, "listo");
    assert.ok(r.gancho.puntaje >= 70);
  });

  test("un gancho flojo suma un aviso y nunca cambia la pieza", () => {
    const pieza = { gancho: "Hola, hoy te cuento una cosa #viral", epigrafe: "Gorra del Drop 01." };
    const copia = structuredClone(pieza);
    const r = revisarPieza(pieza);
    assert.equal(r.veredicto, "revisar");
    assert.equal(r.avisos[0].chequeo, "gancho");
    assert.deepEqual(pieza, copia);
  });

  test("el resumen para Telegram es corto y aclara que son sugerencias", () => {
    const texto = resumenCalidad(revisarPieza({ gancho: "Probá el shaker del Drop 01", epigrafe: "Shaker del Drop 01 #a #b #c #d #e #f" }));
    assert.match(texto, /Revisión \(arreglar\)/);
    assert.match(texto, /decidís vos/);
    assert.equal(resumenCalidad(null), "");
  });
});
