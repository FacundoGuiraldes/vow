// Genera las láminas del carrusel como PNG 1080x1350 (formato vertical 4:5 de Instagram).
// Uso: node src/disenio/carrusel.js [promesa|presentacion] [carpeta de salida]
// Los textos se revisan con las reglas de marca antes de dibujar: si alguno las rompe, no se genera nada.
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { cifrasNoPermitidas, revisarReglas, revisarTextoAlPublico } from "../agents/reglas-marca.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");

const COLOR = { hueso: "#ECE8E1", negro: "#0A0A0A", beige: "#CDBFA6", bordo: "#7A1F24", topo: "#8C8378" };

const FLECHA = { flecha: true }; // se dibuja como imagen vectorial (la tipografía no trae la flecha)

// fondo, color del texto y color de apoyo de cada lámina. `tamano`: tamaño de letra en px (100 por defecto);
// `espaciado`: separación entre letras en em (0 por defecto).
// Cada línea es un texto, o { texto, flecha: true } para un texto seguido de la flecha de marca.
const promesa = [
  { lineas: ["Cumplite", "a vos", "primero"], fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { lineas: ["Lo que", "firmás", "con vos", "no se", "rompe"], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { lineas: ["El trabajo", "diario no", "busca", "aplausos"], fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { lineas: ["Construí", "en silencio.", "Que hable", "el tiempo"], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { lineas: ["Anotate en", "la lista", "de espera."], fondo: COLOR.beige, tinta: COLOR.negro, apoyo: COLOR.negro, cierre: "Link en la bio" },
];

const presentacion = [
  { espaciado: 0.02, lineas: ["Esto es", "VOW."], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { espaciado: 0.02, lineas: ["Una marca", "argentina de", "ropa y", "accesorios", "para entrenar."], tamano: 72, fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { espaciado: 0.02, lineas: [{ texto: "VOW", flecha: true }, "Promesa."], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { lineas: ["Lo que", "firmás", "con vos", "no se", "rompe"], fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { lineas: ["Construí", "en silencio.", "Que hable", "el tiempo"], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { espaciado: 0.02, lineas: ["Simples a", "propósito.", "Diseño hecho", "con criterio."], tamano: 80, fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { espaciado: 0.02, lineas: ["Drop 01", "en 2027.", "Anotate en la", "lista de", "espera."], tamano: 72, fondo: COLOR.beige, tinta: COLOR.negro, apoyo: COLOR.negro, cierre: "Link en la bio" },
];

export const CARRUSELES = {
  promesa: { laminas: promesa, salida: join(raiz, "docs", "piezas", "2026-10-27-laminas") },
  presentacion: { laminas: presentacion, salida: join(raiz, "docs", "piezas", "2026-10-19-laminas") },
};
export const LAMINAS = promesa; // compatibilidad: el primer carrusel

const textoDeLinea = (linea) => (typeof linea === "string" ? linea : linea.texto);

export function revisarLaminas(laminas = LAMINAS) {
  return laminas.flatMap((l, i) => {
    const texto = [...l.lineas.map(textoDeLinea), l.cierre ?? ""].join(" ");
    return [
      ...revisarReglas(texto),
      ...revisarTextoAlPublico(texto),
      ...cifrasNoPermitidas(texto).map((cifra) => ({ regla: "cifra que no está en los datos", fragmento: cifra })), // solo 01 y 2027
    ].map((p) => ({ lamina: i + 1, ...p }));
  });
}

const fuente = (paquete, archivo) =>
  readFileSync(join(raiz, "node_modules", "@fontsource", paquete, "files", archivo)).toString("base64");

// Flecha larga con punta, en el trazo del logo
const FLECHA_SVG = `<svg class="flecha" viewBox="0 0 200 100" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M8 50 H186"/><path d="M142 10 L188 50 L142 90"/></svg>`;

const marca = readFileSync(join(raiz, "web", "src", "assets", "logo-mark.svg"), "utf8");

export function htmlDeLamina(lamina, indice, total) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:"Unbounded";font-weight:800;src:url(data:font/woff2;base64,${fuente("unbounded", "unbounded-latin-800-normal.woff2")}) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:400;src:url(data:font/woff2;base64,${fuente("space-mono", "space-mono-latin-400-normal.woff2")}) format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:${lamina.fondo};color:${lamina.tinta};position:relative;overflow:hidden}
h1{position:absolute;left:96px;right:96px;bottom:300px;font:800 ${lamina.tamano ?? 100}px/1.08 "Unbounded",sans-serif;letter-spacing:${lamina.espaciado ?? 0}em;word-spacing:.1em;text-transform:uppercase}
h1 span{display:block;white-space:nowrap}
.linea-flecha{display:flex;align-items:center;gap:.35em}
.flecha{height:.7em;width:auto;color:${COLOR.bordo}}
.acento{position:absolute;left:96px;bottom:238px;width:72px;height:6px;background:${COLOR.bordo}}
.pie{position:absolute;left:96px;right:96px;bottom:96px;display:flex;justify-content:space-between;align-items:flex-end;color:${lamina.apoyo}}
.pie svg{height:64px;width:auto;color:${lamina.tinta}}
.pie p{font:400 26px "Space Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:${lamina.tinta}}
</style></head><body>
<h1>${lamina.lineas.map((l) => (typeof l === "string" ? `<span>${l}</span>` : `<span class="linea-flecha">${l.texto}${FLECHA_SVG}</span>`)).join("")}</h1>
<div class="acento"></div>
<div class="pie">${marca}${lamina.cierre ? `<p>${lamina.cierre}</p>` : ""}</div>
</body></html>`;
}

export async function generar(salida, laminas = LAMINAS) {
  const problemas = revisarLaminas(laminas);
  if (problemas.length) throw new Error(`Textos que rompen reglas de marca: ${JSON.stringify(problemas)}`);
  mkdirSync(salida, { recursive: true });
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
    for (const [i, lamina] of laminas.entries()) {
      await pagina.setContent(htmlDeLamina(lamina, i, laminas.length));
      await pagina.evaluate(() => document.fonts.ready);
      // Si una línea se sale del margen derecho (96 px), el texto queda cortado en la imagen: se frena en vez de entregarla
      const desbordes = await pagina.evaluate(() => [...document.querySelectorAll("h1 > span")].filter((s) => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().right > 1080 - 96 + 1).map((s) => s.textContent));
      if (desbordes.length) throw new Error(`Lámina ${i + 1}: se sale del margen: ${desbordes.join(" | ")}`);
      await pagina.screenshot({ path: join(salida, `lamina-${i + 1}.png`) });
    }
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nombre = process.argv[2] ?? "promesa";
  const carrusel = CARRUSELES[nombre];
  if (!carrusel) {
    console.error(`No existe el carrusel "${nombre}". Carruseles: ${Object.keys(CARRUSELES).join(", ")}.`);
    process.exit(1);
  }
  await generar(process.argv[3] ?? carrusel.salida, carrusel.laminas);
  console.log(`Láminas de "${nombre}" generadas en ${process.argv[3] ?? carrusel.salida}`);
}
