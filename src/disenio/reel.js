// Genera un reel de texto animado (MP4 vertical 1080x1920, 30 fps) con el mismo sistema visual que las láminas.
// Uso: node src/disenio/reel.js [carpeta de salida]
// Cómo funciona: Playwright dibuja cada cuadro de la animación y ffmpeg los une en un video.
// El guion se revisa con las reglas de marca antes de dibujar: si alguna frase las rompe, no se genera nada.
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { cifrasNoPermitidas, revisarReglas, revisarTextoAlPublico } from "../agents/reglas-marca.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");

export const ANCHO = 1080;
export const ALTO = 1920;
export const CUADROS_POR_SEGUNDO = 30;
const MARGEN = 96;

const COLOR = { hueso: "#ECE8E1", negro: "#0A0A0A", beige: "#CDBFA6", bordo: "#7A1F24" };

// Cada escena: cuánto dura (segundos), sus líneas de texto, colores y tamaño de letra (px).
// La primera es el gancho: una pregunta que se lee en menos de 2 segundos.
// `logo: true` dibuja la marca arriba del texto (solo en la escena final).
export const ESCENAS = [
  { segundos: 2.2, lineas: ["¿Hoy no", "tenés", "ganas?"], tamano: 128, fondo: COLOR.negro, tinta: COLOR.hueso },
  { segundos: 1.6, lineas: ["Entrená", "igual."], tamano: 128, fondo: COLOR.hueso, tinta: COLOR.negro },
  { segundos: 1.6, lineas: ["Nadie", "te mira."], tamano: 128, fondo: COLOR.negro, tinta: COLOR.hueso },
  { segundos: 3.0, lineas: ["Lo que", "firmás", "con vos", "no se", "rompe."], tamano: 112, fondo: COLOR.hueso, tinta: COLOR.negro },
  { segundos: 2.0, lineas: ["Cumplite", "a vos", "primero."], tamano: 112, fondo: COLOR.negro, tinta: COLOR.hueso },
  { segundos: 2.8, lineas: ["Una promesa", "con vos."], tamano: 84, fondo: COLOR.beige, tinta: COLOR.negro, logo: true, pie: "Drop 01 en 2027" },
];

export const duracionTotal = (escenas = ESCENAS) => escenas.reduce((suma, e) => suma + e.segundos, 0);

export function revisarEscenas(escenas = ESCENAS) {
  return escenas.flatMap((e, i) => {
    const texto = [...e.lineas, e.pie ?? ""].join(" ");
    return [
      ...revisarReglas(texto),
      ...revisarTextoAlPublico(texto),
      ...cifrasNoPermitidas(texto).map((cifra) => ({ regla: "cifra que no está en los datos", fragmento: cifra })),
    ].map((p) => ({ escena: i + 1, ...p }));
  });
}

// Qué escena se ve en el segundo `t` y cuánto lleva desde que empezó
export function escenaEn(t, escenas = ESCENAS) {
  let inicio = 0;
  for (const [indice, escena] of escenas.entries()) {
    if (t < inicio + escena.segundos || indice === escenas.length - 1) return { indice, escena, local: Math.max(0, t - inicio) };
    inicio += escena.segundos;
  }
}

// Avance de una animación (0 a 1) con arranque suave: cada línea entra un poco después de la anterior
export const entrada = (local, orden, retraso = 0.12, duracion = 0.4) => {
  const x = Math.min(1, Math.max(0, (local - orden * retraso) / duracion));
  return 1 - (1 - x) ** 3;
};

const fuente = (paquete, archivo) =>
  readFileSync(join(raiz, "node_modules", "@fontsource", paquete, "files", archivo)).toString("base64");
const marca = readFileSync(join(raiz, "web", "src", "assets", "logo-mark.svg"), "utf8");

function htmlDelReel() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:"Unbounded";font-weight:800;src:url(data:font/woff2;base64,${fuente("unbounded", "unbounded-latin-800-normal.woff2")}) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:400;src:url(data:font/woff2;base64,${fuente("space-mono", "space-mono-latin-400-normal.woff2")}) format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${ANCHO}px;height:${ALTO}px;overflow:hidden;position:relative}
/* Instagram tapa la parte de abajo (botones y epígrafe) y un poco la de arriba: el texto va en el centro */
#bloque{position:absolute;left:${MARGEN}px;right:${MARGEN}px;top:300px;bottom:420px;display:flex;flex-direction:column;justify-content:center}
#logo svg{height:110px;width:auto;margin-bottom:56px}
h1{font-family:"Unbounded",sans-serif;font-weight:800;line-height:1.08;word-spacing:.1em;text-transform:uppercase}
h1 span{display:block;white-space:nowrap}
#acento{height:8px;background:${COLOR.bordo};margin-top:56px}
#pie{margin-top:40px;font:400 34px "Space Mono",monospace;letter-spacing:.12em;text-transform:uppercase}
</style></head><body>
<div id="bloque"><div id="logo"></div><h1 id="texto"></h1><div id="acento"></div><div id="pie"></div></div>
<script>
// Se llama una vez por cuadro: arma la escena y fija el avance de cada animación
window.dibujar = (escena, local, avances, avanceAcento, avancePie) => {
  document.body.style.background = escena.fondo;
  document.body.style.color = escena.tinta;
  const h1 = document.getElementById("texto");
  h1.style.fontSize = escena.tamano + "px";
  h1.innerHTML = escena.lineas.map((l, i) => '<span style="opacity:' + avances[i] + ';transform:translateY(' + (1 - avances[i]) * 60 + 'px)">' + l + "</span>").join("");
  const logo = document.getElementById("logo");
  logo.innerHTML = escena.logo ? ${JSON.stringify(marca)} : "";
  logo.style.opacity = escena.logo ? avances[0] : 0;
  document.getElementById("acento").style.width = avanceAcento * 96 + "px";
  const pie = document.getElementById("pie");
  pie.textContent = escena.pie ?? "";
  pie.style.opacity = avancePie;
};
</script></body></html>`;
}

export async function generar(salida, escenas = ESCENAS) {
  const problemas = revisarEscenas(escenas);
  if (problemas.length) throw new Error(`Textos que rompen reglas de marca: ${JSON.stringify(problemas)}`);
  mkdirSync(salida, { recursive: true });
  const archivo = join(salida, "reel.mp4");
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let ffmpeg;
  try {
    const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
    await pagina.setContent(htmlDelReel());
    await pagina.evaluate(() => document.fonts.ready);

    // ffmpeg recibe los cuadros como imágenes por la entrada estándar y arma el MP4 (sin audio: la música se pone desde Instagram)
    ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(CUADROS_POR_SEGUNDO), "-i", "-",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", "-an", archivo], { stdio: ["pipe", "inherit", "inherit"] });
    const termino = new Promise((resolver, rechazar) => {
      ffmpeg.on("error", rechazar);
      ffmpeg.on("close", (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`ffmpeg terminó con código ${codigo}`))));
    });
    termino.catch(() => {}); // si se frena antes de tiempo, que el cierre forzado de ffmpeg no cuente como error sin atender

    const total = Math.round(duracionTotal(escenas) * CUADROS_POR_SEGUNDO);
    for (let cuadro = 0; cuadro < total; cuadro++) {
      const { escena, local } = escenaEn(cuadro / CUADROS_POR_SEGUNDO, escenas);
      const avances = escena.lineas.map((_, i) => entrada(local, i));
      const avanceAcento = entrada(local, escena.lineas.length, 0.12, 0.3);
      const avancePie = entrada(local, escena.lineas.length + 1, 0.12, 0.3);
      await pagina.evaluate(([e, l, a, ac, pi]) => window.dibujar(e, l, a, ac, pi), [escena, local, avances, avanceAcento, avancePie]);
      // Si una línea se sale del margen, el texto quedaría cortado: se frena en vez de entregar el video
      // (cada línea es un bloque del ancho del margen: si el texto es más ancho que el bloque, scrollWidth lo delata)
      const desbordes = await pagina.evaluate(() => [...document.querySelectorAll("h1 > span")].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent));
      if (desbordes.length) throw new Error(`Cuadro ${cuadro}: se sale del margen: ${desbordes.join(" | ")}`);
      if (!ffmpeg.stdin.write(await pagina.screenshot({ type: "png" }))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    }
    ffmpeg.stdin.end();
    await termino;
  } finally {
    ffmpeg?.kill("SIGKILL"); // si ya terminó no hace nada; si se frenó por un error, no lo deja colgado esperando cuadros
    await navegador.close();
  }
  return archivo;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const salida = process.argv[2] ?? join(raiz, "docs", "piezas", "2026-11-02-reel-promesa");
  console.log(`Reel generado: ${await generar(salida)}`);
}
