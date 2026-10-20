// Genera la foto de perfil de Instagram (1080x1080 PNG) en dos versiones: fondo negro y fondo hueso.
// Instagram recorta la foto en círculo: el logo se deja bien adentro (ocupa menos de la mitad del alto) para que no se corte.
// Uso: node src/disenio/foto-perfil.js [salida]
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright-core";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");
const COLOR = { hueso: "#ECE8E1", negro: "#0A0A0A" };

export const VERSIONES = [
  { nombre: "perfil-negro", fondo: COLOR.negro, logo: COLOR.hueso },
  { nombre: "perfil-hueso", fondo: COLOR.hueso, logo: COLOR.negro },
];

const marca = readFileSync(join(raiz, "web", "src", "assets", "logo-mark.svg"), "utf8");

export const htmlDePerfil = ({ fondo, logo }) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}
body{width:1080px;height:1080px;background:${fondo};display:flex;align-items:center;justify-content:center}
svg{height:500px;width:auto;color:${logo}}
</style></head><body>${marca}</body></html>`;

export async function generar(salida) {
  mkdirSync(salida, { recursive: true });
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1080 } });
    for (const version of VERSIONES) {
      await pagina.setContent(htmlDePerfil(version));
      await pagina.screenshot({ path: join(salida, `${version.nombre}.png`) });
    }
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const salida = process.argv[2] ?? join(raiz, "docs", "marca", "perfil");
  await generar(salida);
  console.log(`Fotos de perfil generadas en ${salida}`);
}
