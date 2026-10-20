import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium as playwright } from "playwright-core";
import {
  CIERRE, DURACION, PUNTA, SALIDA_DEL_MARCADOR, SEGUNDOS_PAPEL, TEXTO_GANCHO, TEXTO_PROMESA, TIEMPOS, TRAZOS,
  avancesDelLogo, estadoEn, generar, htmlDelReel, marcadorEn, puntoEn, revisarGuion,
} from "./reel-logo.js";

test("el guion cumple las reglas de marca", () => {
  assert.deepEqual(revisarGuion(), []);
});

test("el guion rechaza modo bestia, una cifra que no es 01 ni 2027 y explicar la marca por dentro", () => {
  assert.ok(revisarGuion("Modo bestia").length > 0);
  assert.ok(revisarGuion("Drop 01 en 2028").some((p) => p.regla === "cifra que no está en los datos"));
  assert.ok(revisarGuion("Nuestra paleta y tipografía").some((p) => p.regla === "explica la marca por dentro"));
});

test("el video cierra con la pregunta y 'Cumplilo.' al final; las líneas entran en orden", () => {
  assert.deepEqual(CIERRE.map((c) => c.texto), ["¿Y vos?", "¿Qué te", "prometés?", "Cumplilo."]);
  const entradas = CIERRE.map((c) => c.entra);
  assert.deepEqual(entradas, [...entradas].sort((a, b) => a - b));
  assert.equal(CIERRE.at(-1).texto, "Cumplilo.");
});

test("dura entre 7 y 30 segundos y el gancho está desde el primer cuadro", () => {
  assert.ok(DURACION >= 7 && DURACION <= 30);
  const primero = estadoEn(0);
  assert.equal(primero.escena, "papel");
  assert.deepEqual(primero.lineas.map((l) => l.texto), TEXTO_GANCHO);
  assert.ok(primero.lineas[0].avance <= 0.01); // entra, no aparece de golpe
});

test("puntoEn recorre una línea quebrada por largo, y no se pasa de los extremos", () => {
  const l = [[0, 0], [10, 0], [10, 10]]; // largo total 20
  assert.deepEqual(puntoEn(l, 0), [0, 0]);
  assert.deepEqual(puntoEn(l, 0.5), [10, 0]);
  assert.deepEqual(puntoEn(l, 0.75), [10, 5]);
  assert.deepEqual(puntoEn(l, 1), [10, 10]);
  assert.deepEqual(puntoEn(l, 3), [10, 10]);
  assert.deepEqual(puntoEn(l, -1), [0, 0]);
});

test("el logo se dibuja en orden: trazo curvo, pata izquierda, pata derecha, eje y punta de la flecha", () => {
  assert.deepEqual(avancesDelLogo(0), { trazos: [0, 0, 0, 0], punta: 0 });
  const t1 = avancesDelLogo((TIEMPOS.curva[0] + TIEMPOS.curva[1]) / 2);
  assert.ok(t1.trazos[3] > 0 && t1.trazos[3] < 1);
  assert.deepEqual(t1.trazos.slice(0, 3), [0, 0, 0]); // todavía no empezó la V
  const t2 = avancesDelLogo((TIEMPOS.trazos[0][0] + TIEMPOS.trazos[0][1]) / 2);
  assert.equal(t2.trazos[3], 1);
  assert.ok(t2.trazos[0] > 0 && t2.trazos[0] < 1);
  assert.equal(t2.trazos[1], 0);
  assert.deepEqual(avancesDelLogo(TIEMPOS.punta[1]), { trazos: [1, 1, 1, 1], punta: 1 });
  // cada parte empieza cuando termina la anterior
  const arranques = [TIEMPOS.curva, ...TIEMPOS.trazos, TIEMPOS.punta];
  arranques.slice(1).forEach((a, i) => assert.ok(a[0] >= arranques[i][1]));
});

// Compara puntos con una tolerancia mínima (los decimales de la geometría)
const casi = (a, b) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${a} no es ${b}`);

test("el marcador entra desde afuera, sigue la punta del trazo y se va al terminar", () => {
  assert.equal(marcadorEn(0).opacidad, 0);
  assert.equal(marcadorEn(TIEMPOS.curva[0]).opacidad, 1);
  casi(marcadorEn(TIEMPOS.curva[0]).punto, TRAZOS[3].puntos[0]); // empieza donde empieza el trazo curvo
  casi(marcadorEn(TIEMPOS.curva[1]).punto, TRAZOS[3].puntos.at(-1));
  const a = TRAZOS[0].puntos[0];
  casi(marcadorEn(TIEMPOS.trazos[0][0]).punto, a); // pata izquierda
  const enAire = marcadorEn((TIEMPOS.curva[1] + TIEMPOS.trazos[0][0]) / 2).punto; // viaja de un trazo al siguiente
  assert.notDeepEqual(enAire, TRAZOS[3].puntos.at(-1));
  assert.notDeepEqual(enAire, a);
  casi(marcadorEn(TIEMPOS.punta[1]).punto, PUNTA.hasta);
  assert.equal(marcadorEn(TIEMPOS.punta[1] + 2).opacidad, 0);
});

test("cuando el logo termina cambia el texto a 'Una promesa con vos.' y después pasa al cierre sobre fondo negro", () => {
  const antes = estadoEn(TIEMPOS.punta[1] + 0.05);
  assert.deepEqual(antes.lineas.map((l) => l.texto), TEXTO_GANCHO);
  const despues = estadoEn(9.0);
  assert.deepEqual(despues.lineas.map((l) => l.texto), TEXTO_PROMESA);
  assert.ok(despues.logo.sello >= 0.99); // el sello bordó ya está completo
  assert.equal(estadoEn(SEGUNDOS_PAPEL - 0.01).escena, "papel");
  const cierre = estadoEn(SEGUNDOS_PAPEL + 0.01);
  assert.equal(cierre.escena, "cierre");
  assert.equal(cierre.fondo, "#0A0A0A");
});

test("en el cierre, '¿Y vos?' aparece primero y 'Cumplilo.' al final", () => {
  const e1 = estadoEn(SEGUNDOS_PAPEL + 0.6);
  assert.ok(e1.lineas[0].avance > 0.9 && e1.lineas[3].avance === 0);
  const e2 = estadoEn(SEGUNDOS_PAPEL + 1.8);
  assert.ok(e2.lineas[1].avance > 0.9 && e2.lineas[2].avance > 0.9 && e2.lineas[3].avance === 0);
  const e3 = estadoEn(DURACION);
  assert.ok(e3.lineas.every((l) => l.avance > 0.99) && e3.pie.avance > 0.99 && e3.acento > 0.99);
});

const chromium = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const hayFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const sinNavegador = !existsSync(chromium) && "no hay Chromium";

test("al terminar de dibujarse, el logo queda igual al logo real (menos de 0,05% de diferencia)", { skip: sinNavegador }, async () => {
  const navegador = await playwright.launch({ executablePath: chromium });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 } });
    await pagina.setContent(htmlDelReel());
    await pagina.evaluate(() => document.fonts.ready);
    const estado = estadoEn(TIEMPOS.punta[1] + 0.1);
    estado.logo.marcador.opacidad = 0;
    estado.lineas = [];
    await pagina.evaluate((e) => window.dibujar(e), estado);
    const recorte = { x: 200, y: 620, width: 680, height: 720 };
    const con = (await pagina.screenshot({ clip: recorte })).toString("base64");
    await pagina.evaluate(() => document.querySelector("#logo g").removeAttribute("mask"));
    const sin = (await pagina.screenshot({ clip: recorte })).toString("base64");
    // se comparan los píxeles dentro de la página: cuánta tinta del logo real falta en el dibujado
    const { tinta, faltan } = await pagina.evaluate(async ([a, b]) => {
      const leer = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0); ok(x.getImageData(0, 0, i.width, i.height).data); }; i.src = "data:image/png;base64," + b64; });
      const [dc, ds] = [await leer(a), await leer(b)];
      let t = 0, f = 0;
      for (let i = 0; i < ds.length; i += 4) { if (ds[i] < 110) { t++; if (dc[i] - ds[i] > 60) f++; } }
      return { tinta: t, faltan: f };
    }, [con, sin]);
    assert.ok(tinta > 100000, "se midió el logo");
    assert.ok(faltan / tinta < 0.0005, `faltan ${faltan} de ${tinta} píxeles`);
  } finally {
    await navegador.close();
  }
});

test("genera un MP4 vertical (prueba con el primer segundo)", { skip: (sinNavegador || !hayFfmpeg) && "no hay Chromium o ffmpeg" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  const archivo = await generar(mkdtempSync(join(tmpdir(), "reel-logo-")), { segundos: 0.4 });
  assert.ok(statSync(archivo).size > 1000);
  const sonda = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", archivo]).stdout.toString().trim();
  assert.equal(sonda, "1080,1920");
});

test("puntoEn no se rompe con dos puntos iguales seguidos (tramo de largo cero)", () => {
  assert.deepEqual(puntoEn([[0, 0], [0, 0], [10, 0]], 0), [0, 0]);
  assert.deepEqual(puntoEn([[0, 0], [0, 0], [10, 0]], 0.5), [5, 0]);
});

test("los trazos arrancan y frenan suave: a un cuarto del tiempo llevan un octavo, y a tres cuartos siete octavos", () => {
  const [d, h] = TIEMPOS.curva;
  assert.ok(Math.abs(avancesDelLogo(d + (h - d) * 0.25).trazos[3] - 0.125) < 1e-9);
  assert.ok(Math.abs(avancesDelLogo(d + (h - d) * 0.75).trazos[3] - 0.875) < 1e-9);
});

test("el marcador entra suave: a mitad del recorrido de entrada está en el punto medio", () => {
  const inicio = TRAZOS[3].puntos[0];
  const medio = [(SALIDA_DEL_MARCADOR[0] + inicio[0]) / 2, (SALIDA_DEL_MARCADOR[1] + inicio[1]) / 2];
  casi(marcadorEn(0.7).punto, medio); // la entrada va de 0,4 s a 1,0 s
});

test("entre dos trazos el marcador viaja suave: a un cuarto del viaje recorrió un octavo", () => {
  const fin = TRAZOS[3].puntos.at(-1);
  const inicio = TRAZOS[0].puntos[0];
  const [d, h] = [TIEMPOS.curva[1], TIEMPOS.trazos[0][0]];
  const esperado = [fin[0] + (inicio[0] - fin[0]) * 0.125, fin[1] + (inicio[1] - fin[1]) * 0.125];
  casi(marcadorEn(d + (h - d) * 0.25).punto, esperado);
});

test("el texto es más grande en 'Una promesa con vos.' que en el gancho, y el corte al cierre es justo en 9,6 s", () => {
  assert.equal(estadoEn(1).tamano, 68);
  assert.equal(estadoEn(9.0).tamano, 84);
  assert.equal(estadoEn(SEGUNDOS_PAPEL).escena, "cierre");
});

test("en el cierre 'prometés?' entra un instante después de '¿Qué te' y el acento y el pie se animan (no aparecen de golpe)", () => {
  const e = estadoEn(SEGUNDOS_PAPEL + 1.2);
  assert.ok(e.lineas[2].avance < e.lineas[1].avance);
  const ultima = CIERRE.at(-1).entra;
  const enAcento = estadoEn(SEGUNDOS_PAPEL + ultima + 0.5 + 0.15);
  assert.ok(enAcento.acento > 0 && enAcento.acento < 1);
  const enPie = estadoEn(SEGUNDOS_PAPEL + ultima + 0.9 + 0.15);
  assert.ok(enPie.pie.avance > 0 && enPie.pie.avance < 1);
});
