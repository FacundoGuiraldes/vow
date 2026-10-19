// Genera las láminas del carrusel como PNG 1080x1350 (formato vertical 4:5 de Instagram).
// Uso: node src/disenio/carrusel.js [salida]
// Los textos se revisan con las reglas de marca antes de dibujar: si alguno las rompe, no se genera nada.
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";
import { revisarReglas, revisarTextoAlPublico } from "../agents/reglas-marca.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");

const COLOR = { hueso: "#ECE8E1", negro: "#0A0A0A", beige: "#CDBFA6", bordo: "#7A1F24", topo: "#8C8378" };

// fondo, color del texto y color de apoyo (etiquetas y marca) de cada lámina
export const LAMINAS = [
  { lineas: ["Cumplite", "a vos", "primero"], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { lineas: ["Lo que", "firmás", "con vos", "no se rompe"], fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { lineas: ["El trabajo", "diario no", "busca", "aplausos"], fondo: COLOR.hueso, tinta: COLOR.negro, apoyo: COLOR.topo },
  { lineas: ["Construí", "en silencio.", "Que hable", "el tiempo"], fondo: COLOR.negro, tinta: COLOR.hueso, apoyo: COLOR.topo },
  { lineas: ["Anotate en", "la lista", "de espera."], fondo: COLOR.beige, tinta: COLOR.negro, apoyo: COLOR.negro, cierre: "Link en la bio" },
];

export function revisarLaminas(laminas = LAMINAS) {
  return laminas.flatMap((l, i) => {
    const texto = [...l.lineas, l.cierre ?? ""].join(" ");
    return [...revisarReglas(texto), ...revisarTextoAlPublico(texto)].map((p) => ({ lamina: i + 1, ...p }));
  });
}

const fuente = (paquete, archivo) =>
  readFileSync(join(raiz, "node_modules", "@fontsource", paquete, "files", archivo)).toString("base64");

const marca = readFileSync(join(raiz, "web", "src", "assets", "logo-mark.svg"), "utf8");

export function htmlDeLamina(lamina, indice, total) {
  const n = (x) => String(x).padStart(2, "0");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:"Unbounded";font-weight:800;src:url(data:font/woff2;base64,${fuente("unbounded", "unbounded-latin-800-normal.woff2")}) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:400;src:url(data:font/woff2;base64,${fuente("space-mono", "space-mono-latin-400-normal.woff2")}) format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:${lamina.fondo};color:${lamina.tinta};position:relative;overflow:hidden}
.et{position:absolute;top:96px;left:96px;right:96px;display:flex;justify-content:space-between;font:400 26px "Space Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:${lamina.apoyo}}
h1{position:absolute;left:96px;right:96px;bottom:300px;font:800 100px/1.08 "Unbounded",sans-serif;letter-spacing:0;word-spacing:.1em;text-transform:uppercase}
h1 span{display:block}
.acento{position:absolute;left:96px;bottom:238px;width:72px;height:6px;background:${COLOR.bordo}}
.pie{position:absolute;left:96px;right:96px;bottom:96px;display:flex;justify-content:space-between;align-items:flex-end;color:${lamina.apoyo}}
.pie svg{height:64px;width:auto;color:${lamina.tinta}}
.pie p{font:400 26px "Space Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:${lamina.tinta}}
</style></head><body>
<div class="et"><span>${n(indice + 1)} / ${n(total)}</span></div>
<h1>${lamina.lineas.map((l) => `<span>${l}</span>`).join("")}</h1>
<div class="acento"></div>
<div class="pie">${marca}${lamina.cierre ? `<p>${lamina.cierre}</p>` : ""}</div>
</body></html>`;
}

export async function generar(salida) {
  const problemas = revisarLaminas();
  if (problemas.length) throw new Error(`Textos que rompen reglas de marca: ${JSON.stringify(problemas)}`);
  mkdirSync(salida, { recursive: true });
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
    for (const [i, lamina] of LAMINAS.entries()) {
      await pagina.setContent(htmlDeLamina(lamina, i, LAMINAS.length));
      await pagina.evaluate(() => document.fonts.ready);
      await pagina.screenshot({ path: join(salida, `lamina-${i + 1}.png`) });
    }
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const salida = process.argv[2] ?? join(raiz, "docs", "piezas", "2026-10-27-laminas");
  await generar(salida);
  console.log(`Láminas generadas en ${salida}`);
}
