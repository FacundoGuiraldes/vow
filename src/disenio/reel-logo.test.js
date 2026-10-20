import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium as playwright } from "playwright-core";
import {
  CIERRE, DURACION, FIRMA, SEGUNDOS_PAPEL, SEGUNDOS_TEXTO_PROMESA, TEXTOS, TEXTO_GANCHO, TEXTO_PROMESA, TIEMPOS,
  avancesDelLogo, estadoEn, generar, htmlDelReel, revisarGuion, suave,
} from "./reel-logo.js";

const [C0, C1] = TIEMPOS.contornos;
const mitad = ([d, h]) => (d + h) / 2;

test("el guion cumple las reglas de marca", () => {
  assert.deepEqual(revisarGuion(), []);
});

test("el guion rechaza modo bestia, una cifra que no es 01 ni 2027 y explicar la marca por dentro", () => {
  assert.ok(revisarGuion("Modo bestia").length > 0);
  assert.ok(revisarGuion("Drop 01 en 2028").some((p) => p.regla === "cifra que no está en los datos"));
  assert.ok(revisarGuion("Nuestra paleta y tipografía").some((p) => p.regla === "explica la marca por dentro"));
});

test("el cierre es '¿Y vos? ¿Qué te prometés? Cumplilo.', las líneas entran en orden y no hay nada de Drop ni de fechas", () => {
  assert.deepEqual(CIERRE.map((c) => c.texto), ["¿Y vos?", "¿Qué te", "prometés?", "Cumplilo."]);
  const entradas = CIERRE.map((c) => c.entra);
  assert.deepEqual(entradas, [...entradas].sort((a, b) => a - b));
  assert.ok(!/drop|2027|01/i.test(TEXTOS));
  assert.equal(estadoEn(DURACION).pie, undefined);
});

test("dura entre 7 y 30 segundos, el gancho está desde el primer cuadro y el logo ya se está dibujando en el primer medio segundo", () => {
  assert.ok(DURACION >= 7 && DURACION <= 30);
  const primero = estadoEn(0);
  assert.equal(primero.escena, "papel");
  assert.deepEqual(primero.lineas.map((l) => l.texto), TEXTO_GANCHO);
  assert.ok(primero.lineas[0].avance <= 0.01); // entra, no aparece de golpe
  assert.ok(C0[0] <= 0.5);
  assert.ok(estadoEn(0.5).logo.contornos[0] > 0);
});

test("el dibujo sigue un orden: primero el trazo curvo, después la V con la flecha, después el relleno y al final el sello", () => {
  assert.deepEqual(avancesDelLogo(0), { contornos: [0, 0], relleno: 0, sello: 0 });
  const fases = [C0, C1, TIEMPOS.relleno, TIEMPOS.sello];
  fases.slice(1).forEach((f, i) => assert.ok(f[0] >= fases[i][1], "cada fase empieza cuando termina la anterior"));
  const a = avancesDelLogo(mitad(C0));
  assert.ok(a.contornos[0] > 0 && a.contornos[0] < 1);
  assert.equal(a.contornos[1], 0);
  assert.equal(a.relleno, 0);
  const b = avancesDelLogo(mitad(C1));
  assert.equal(b.contornos[0], 1);
  assert.ok(b.contornos[1] > 0 && b.contornos[1] < 1);
  assert.equal(b.relleno, 0);
  const c = avancesDelLogo(mitad(TIEMPOS.relleno));
  assert.deepEqual(c.contornos, [1, 1]);
  assert.ok(c.relleno > 0 && c.relleno < 1);
  assert.deepEqual(avancesDelLogo(TIEMPOS.sello[1]), { contornos: [1, 1], relleno: 1, sello: 1 });
});

test("suave arranca y frena: a un cuarto del tiempo lleva un octavo, a tres cuartos siete octavos", () => {
  assert.equal(suave(0), 0);
  assert.equal(suave(1), 1);
  assert.equal(suave(-2), 0);
  assert.equal(suave(5), 1);
  assert.ok(Math.abs(suave(0.25) - 0.125) < 1e-9);
  assert.ok(Math.abs(suave(0.75) - 0.875) < 1e-9);
  const [d, h] = C0;
  assert.ok(Math.abs(avancesDelLogo(d + (h - d) * 0.25).contornos[0] - 0.125) < 1e-9);
});

test("cuando el logo termina cambia el texto a 'Una promesa con vos.' (más grande) y después pasa al cierre sobre fondo negro", () => {
  const antes = estadoEn(SEGUNDOS_TEXTO_PROMESA - 0.05);
  assert.deepEqual(antes.lineas.map((l) => l.texto), TEXTO_GANCHO);
  assert.equal(antes.tamano, 68);
  const despues = estadoEn(SEGUNDOS_TEXTO_PROMESA + 0.8);
  assert.deepEqual(despues.lineas.map((l) => l.texto), TEXTO_PROMESA);
  assert.equal(despues.tamano, 84);
  assert.equal(estadoEn(SEGUNDOS_TEXTO_PROMESA).tamano, 84);
  assert.equal(estadoEn(SEGUNDOS_PAPEL - 0.01).escena, "papel");
  assert.equal(estadoEn(SEGUNDOS_PAPEL).escena, "cierre");
  assert.equal(estadoEn(SEGUNDOS_PAPEL).fondo, "#0A0A0A");
});

test("en el cierre, '¿Y vos?' aparece primero y 'Cumplilo.' al final; 'prometés?' entra un instante después de '¿Qué te'", () => {
  const e1 = estadoEn(SEGUNDOS_PAPEL + 0.6);
  assert.ok(e1.lineas[0].avance > 0.9 && e1.lineas[3].avance === 0);
  const e2 = estadoEn(SEGUNDOS_PAPEL + 1.2);
  assert.ok(e2.lineas[2].avance < e2.lineas[1].avance && e2.lineas[2].avance > 0);
  const e3 = estadoEn(SEGUNDOS_PAPEL + 2.0);
  assert.ok(e3.lineas[1].avance > 0.9 && e3.lineas[2].avance > 0.9 && e3.lineas[3].avance === 0);
  assert.ok(estadoEn(DURACION).lineas.every((l) => l.avance > 0.99));
});

test("la firma bordó se traza después de que entra 'Cumplilo.': no aparece de golpe y termina completa", () => {
  const entra = SEGUNDOS_PAPEL + CIERRE.at(-1).entra;
  assert.equal(estadoEn(entra + FIRMA.despues - 0.01).firma, 0);
  const aMedias = estadoEn(entra + FIRMA.despues + FIRMA.dura * 0.25).firma;
  assert.ok(Math.abs(aMedias - 0.125) < 1e-9);
  assert.equal(estadoEn(entra + FIRMA.despues + FIRMA.dura).firma, 1);
  assert.equal(estadoEn(DURACION).firma, 1);
});

const chromium = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const hayFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const sinNavegador = !existsSync(chromium) && "no hay Chromium";

// Abre la página, dibuja el estado y ejecuta `fn(pagina)`
async function conPagina(estado, fn) {
  const navegador = await playwright.launch({ executablePath: chromium });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 } });
    await pagina.setContent(htmlDelReel());
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.evaluate((e) => window.dibujar(e), estado);
    // la primera vez la tipografía todavía puede estar cargándose; en el video ya está cargada desde el primer cuadro
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.evaluate((e) => window.dibujar(e), estado);
    return await fn(pagina);
  } finally {
    await navegador.close();
  }
}

test("al terminar de dibujarse, el logo queda igual al logo real (menos de 0,05% de diferencia, y sin contorno sobrante)", { skip: sinNavegador }, async () => {
  const estado = estadoEn(TIEMPOS.sello[1] + 0.1);
  estado.lineas = [];
  await conPagina(estado, async (pagina) => {
    const recorte = { x: 200, y: 620, width: 680, height: 720 };
    const dibujado = (await pagina.screenshot({ clip: recorte })).toString("base64");
    // el logo real: el archivo original del logo (web/src/assets/logo-mark.svg), con su propia regla de relleno
    const original = readFileSync(new URL("../../web/src/assets/logo-mark.svg", import.meta.url), "utf8").replace(/<svg[^>]*>/, "").replace("</svg>", "");
    await pagina.evaluate((interior) => { const l = document.getElementById("logo"); l.setAttribute("fill", "#0A0A0A"); l.innerHTML = interior; }, original);
    const real = (await pagina.screenshot({ clip: recorte })).toString("base64");
    const { tinta, faltan, sobran } = await pagina.evaluate(async ([a, b]) => {
      const leer = (b64) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0); ok(x.getImageData(0, 0, i.width, i.height).data); }; i.src = "data:image/png;base64," + b64; });
      const [da, dr] = [await leer(a), await leer(b)];
      let t = 0, f = 0, s = 0;
      for (let i = 0; i < dr.length; i += 4) { if (dr[i] < 110) t++; if (da[i] - dr[i] > 60) f++; if (dr[i] - da[i] > 60) s++; }
      return { tinta: t, faltan: f, sobran: s };
    }, [dibujado, real]);
    assert.ok(tinta > 100000, "se midió el logo");
    assert.ok(faltan / tinta < 0.0005, `faltan ${faltan} de ${tinta} píxeles`);
    assert.ok(sobran / tinta < 0.0005, `sobran ${sobran} de ${tinta} píxeles`);
  });
});

test("no hay ningún lápiz ni pluma en pantalla: el logo se traza solo", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(mitad(C1)), async (pagina) => {
    assert.equal(await pagina.evaluate(() => document.getElementById("pluma")), null);
    assert.ok(!/pluma|l[áa]piz|marcador/i.test(htmlDelReel().replace(/\/\/[^\n]*/g, "")));
  });
});

test("el contorno no se ve hasta que se empieza a trazar (sin puntitos), y la firma tampoco hasta que se traza", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(0.1), async (pagina) => {
    const opacidades = await pagina.evaluate(() => [...document.querySelectorAll(".contorno")].map((c) => c.style.opacity));
    assert.deepEqual(opacidades, ["0", "0"]);
  });
  await conPagina(estadoEn(mitad(C0)), async (pagina) => {
    const opacidades = await pagina.evaluate(() => [...document.querySelectorAll(".contorno")].map((c) => c.style.opacity));
    assert.deepEqual(opacidades, ["1", "0"]); // el primero se está dibujando, el segundo todavía no
  });
  await conPagina(estadoEn(SEGUNDOS_PAPEL + 0.1), async (pagina) => {
    assert.equal(await pagina.evaluate(() => document.getElementById("firma").style.opacity), "0");
  });
  await conPagina(estadoEn(DURACION), async (pagina) => {
    assert.equal(await pagina.evaluate(() => document.getElementById("firma").style.opacity), "1");
  });
});

test("el relleno entra con borde suave (no corte seco) y el contorno tiene un grosor de lápiz fino", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(mitad(TIEMPOS.relleno)), async (pagina) => {
    const [a, b] = await pagina.evaluate(() => [+document.getElementById("barrido-a").getAttribute("offset"), +document.getElementById("barrido-b").getAttribute("offset")]);
    assert.ok(a > 0 && b > a && b <= 1, `${a} ${b}`);
    const grosor = await pagina.evaluate(() => +document.querySelector(".contorno").getAttribute("stroke-width"));
    assert.ok(grosor >= 3 && grosor <= 6);
  });
});

test("la firma no se ve mientras no empezó a trazarse, aunque 'Cumplilo.' ya esté en pantalla", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(SEGUNDOS_PAPEL + CIERRE.at(-1).entra + 0.3), async (pagina) => {
    assert.equal(await pagina.evaluate(() => document.getElementById("firma").style.opacity), "0");
  });
});

test("la línea bordó del final es recta (horizontal, de extremos rectos) y tiene el largo de la palabra 'Cumplilo.'", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(DURACION), async (pagina) => {
    const r = await pagina.evaluate(() => {
      const trazo = document.querySelector("#firma path");
      const caja = trazo.getBBox();
      const f = document.getElementById("firma").getBoundingClientRect();
      const h1 = document.getElementById("texto");
      const rango = document.createRange();
      rango.selectNodeContents(h1.lastElementChild);
      const t = rango.getBoundingClientRect();
      return { alto: caja.height, ancho: caja.width, extremos: trazo.getAttribute("stroke-linecap"), color: trazo.getAttribute("stroke"), dEs: trazo.getAttribute("d"), izq: f.left - t.left, anchoPantalla: f.width - t.width, debajo: f.top - t.bottom };
    });
    assert.equal(r.alto, 0, "recta: sin altura");
    assert.ok(r.ancho > 0);
    assert.match(r.dEs, /^M [\d.]+ ([\d.]+) L [\d.]+ \1$/, "mismo alto de punta a punta");
    assert.equal(r.extremos, "butt");
    assert.equal(r.color, "#7A1F24");
    assert.ok(Math.abs(r.izq) < 1 && Math.abs(r.anchoPantalla) < 1, "alineada con la palabra");
    assert.ok(r.debajo > 0 && r.debajo < 60, "justo debajo del texto");
  });
});

test("genera un MP4 vertical (prueba con el primer segundo)", { skip: (sinNavegador || !hayFfmpeg) && "no hay Chromium o ffmpeg" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  const archivo = await generar(mkdtempSync(join(tmpdir(), "reel-logo-")), { segundos: 0.4 });
  assert.ok(statSync(archivo).size > 1000);
  const sonda = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", archivo]).stdout.toString().trim();
  assert.equal(sonda, "1080,1920");
});
