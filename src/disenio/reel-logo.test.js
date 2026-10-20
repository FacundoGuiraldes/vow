import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium as playwright } from "playwright-core";
import {
  CIERRE, DURACION, FIRMA, SEGUNDOS_PAPEL, SEGUNDOS_TEXTO_PROMESA, TEXTOS, TEXTO_GANCHO, TEXTO_PROMESA, TIEMPOS,
  avancesDelLogo, estadoEn, generar, htmlDelReel, marcadorEn, revisarGuion, suave,
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

test("dura entre 7 y 30 segundos, el gancho está desde el primer cuadro y la pluma ya se mueve en el primer medio segundo", () => {
  assert.ok(DURACION >= 7 && DURACION <= 30);
  const primero = estadoEn(0);
  assert.equal(primero.escena, "papel");
  assert.deepEqual(primero.lineas.map((l) => l.texto), TEXTO_GANCHO);
  assert.ok(primero.lineas[0].avance <= 0.01); // entra, no aparece de golpe
  assert.ok(C0[0] <= 0.6);
  assert.ok(estadoEn(0.3).logo.marcador.opacidad > 0);
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

test("la pluma entra desde afuera, dibuja cada contorno, viaja levantada entre los dos y se retira al final", () => {
  const entrada = marcadorEn(C0[0] / 2);
  assert.equal(entrada.tipo, "entrada");
  assert.ok(Math.abs(entrada.k - 0.5) < 1e-9);
  assert.ok(Math.abs(entrada.opacidad - 1) < 1e-9 || entrada.opacidad > 0.9);
  assert.equal(marcadorEn(0).opacidad, 0);
  assert.ok(Math.abs(marcadorEn(0.125).opacidad - 0.5) < 1e-9); // entra con un fundido de un cuarto de segundo

  const uno = marcadorEn(mitad(C0));
  assert.equal(uno.tipo, "contorno");
  assert.equal(uno.contorno, 0);
  assert.ok(Math.abs(uno.avance - 0.5) < 1e-9);
  assert.equal(uno.opacidad, 1);

  const aire = marcadorEn(C0[1] + (C1[0] - C0[1]) * 0.25);
  assert.equal(aire.tipo, "aire");
  assert.deepEqual([aire.de, aire.a], [{ contorno: 0, avance: 1 }, { contorno: 1, avance: 0 }]);
  assert.ok(Math.abs(aire.k - 0.125) < 1e-9);

  const dos = marcadorEn(mitad(C1));
  assert.equal(dos.tipo, "contorno");
  assert.equal(dos.contorno, 1);

  const sale = marcadorEn(C1[1] + 0.4);
  assert.equal(sale.tipo, "salida");
  assert.deepEqual(sale.desde, { contorno: 1, avance: 1 });
  assert.ok(Math.abs(sale.k - suave(0.5)) < 1e-9);
  assert.ok(Math.abs(sale.opacidad - 1) < 1e-9);
  assert.ok(Math.abs(marcadorEn(C1[1] + 0.6).opacidad - 0.5) < 1e-9);
  assert.equal(marcadorEn(C1[1] + 1.2).opacidad, 0);
});

test("la entrada y la salida de la pluma son suaves: a un cuarto del camino llevan un octavo", () => {
  assert.ok(Math.abs(marcadorEn(C0[0] / 4).k - 0.125) < 1e-9);
  assert.ok(Math.abs(marcadorEn(C1[1] + 0.2).k - 0.125) < 1e-9);
});

test("justo en los cortes: al terminar el primer contorno todavía es 'contorno', y al terminar el segundo todavía es 'contorno'", () => {
  assert.equal(marcadorEn(C0[1]).tipo, "contorno");
  assert.equal(marcadorEn(C1[1]).tipo, "contorno");
  assert.equal(marcadorEn(C0[0]).tipo, "contorno");
  assert.equal(marcadorEn(C1[0]).tipo, "contorno"); // en el instante en que arranca el segundo ya está dibujándolo
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
    return await fn(pagina);
  } finally {
    await navegador.close();
  }
}

test("al terminar de dibujarse, el logo queda igual al logo real (menos de 0,05% de diferencia, y sin contorno sobrante)", { skip: sinNavegador }, async () => {
  const estado = estadoEn(TIEMPOS.sello[1] + 0.1);
  estado.logo.marcador.opacidad = 0;
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

test("el contorno no se ve hasta que la pluma lo empieza (sin puntitos), y la firma tampoco hasta que se traza", { skip: sinNavegador }, async () => {
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

test("la pluma está sobre el contorno que dibuja (su punta coincide con el final del trazo visible)", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(mitad(C1)), async (pagina) => {
    // la punta de la pluma es el origen de su dibujo: se compara con el punto del contorno a ese avance, en pantalla
    const { pluma, esperado } = await pagina.evaluate(() => {
      const c = document.querySelectorAll(".contorno")[1];
      const p = c.getPointAtLength(0.5 * c.getTotalLength()); // a mitad de tiempo el avance suave es 0,5
      const caja = document.getElementById("logo").getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(document.getElementById("pluma")).transform);
      return { pluma: [m.e, m.f], esperado: [caja.left + (p.x - 308) * (caja.width / 492), caja.top + (p.y - 128) * (caja.height / 518)] };
    });
    assert.ok(Math.hypot(pluma[0] - esperado[0], pluma[1] - esperado[1]) < 1.5, `${pluma} vs ${esperado}`);
  });
});

test("genera un MP4 vertical (prueba con el primer segundo)", { skip: (sinNavegador || !hayFfmpeg) && "no hay Chromium o ffmpeg" }, async () => {
  process.env.CHROMIUM_PATH = chromium;
  const archivo = await generar(mkdtempSync(join(tmpdir(), "reel-logo-")), { segundos: 0.4 });
  assert.ok(statSync(archivo).size > 1000);
  const sonda = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", archivo]).stdout.toString().trim();
  assert.equal(sonda, "1080,1920");
});

// Punto del contorno `c` a la fracción `f` de su largo, en pantalla (calculado dentro de la página, sin usar el código del reel)
const enPantalla = (pagina, c, f) => pagina.evaluate(([c, f]) => {
  const e = document.querySelectorAll(".contorno")[c];
  const p = e.getPointAtLength(f * e.getTotalLength());
  const caja = document.getElementById("logo").getBoundingClientRect();
  return [caja.left + (p.x - 308) * (caja.width / 492), caja.top + (p.y - 128) * (caja.height / 518)];
}, [c, f]);
const plumaEn = (pagina) => pagina.evaluate(() => { const m = new DOMMatrix(getComputedStyle(document.getElementById("pluma")).transform); return [m.e, m.f]; });
const cerca = (a, b) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5, `${a} no está cerca de ${b}`);
// el punto de afuera por donde entra y sale la pluma, en pantalla (viene de 900,700 en las coordenadas del logo)
const afuera = (pagina) => pagina.evaluate(() => { const caja = document.getElementById("logo").getBoundingClientRect(); return [caja.left + (900 - 308) * (caja.width / 492), caja.top + (700 - 128) * (caja.height / 518)]; });
const medio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

test("la pluma entra desde afuera, viaja levantada entre los contornos y sale: está donde corresponde en cada momento", { skip: sinNavegador }, async () => {
  await conPagina(estadoEn(C0[0] / 2), async (p) => cerca(await plumaEn(p), medio(await afuera(p), await enPantalla(p, 0, 0))));
  await conPagina(estadoEn(C0[1] + (C1[0] - C0[1]) / 2), async (p) => cerca(await plumaEn(p), medio(await enPantalla(p, 0, 1), await enPantalla(p, 1, 0))));
  await conPagina(estadoEn(C1[1] + 0.4), async (p) => cerca(await plumaEn(p), medio(await enPantalla(p, 1, 1), await afuera(p)))); // k suave a esa altura es 0,5
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
