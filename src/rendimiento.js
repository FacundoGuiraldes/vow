import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { crearClienteMeta } from "./mcp/instagram/api.js";
import { descargarCuenta } from "./agents/instagram.js";
import { resumirCuenta } from "./agents/metricas.js";
import { armarInforme, informeAMarkdown, medirCuentaPropia, LIMITE_PROPIAS } from "./agents/rendimiento.js";

// Uso:
//   npm run rendimiento                        (mide @vow_ar y la compara con docs/marca/cuentas-referencia.json)
//   npm run rendimiento -- --limite 40         (cuántas publicaciones propias y de cada referencia)
//   npm run rendimiento -- --sin-referencias   (solo VOW: una consulta por publicación propia, nada más)
//   npm run rendimiento -- --simulado          (no llama a Meta: prueba el flujo con datos inventados)
// Necesita INSTAGRAM_TOKEN e INSTAGRAM_USER_ID en el .env. Solo lee: no usa IA ni gasta.

const { values } = parseArgs({
  options: {
    limite: { type: "string", default: String(LIMITE_PROPIAS) },
    "sin-referencias": { type: "boolean", default: false },
    simulado: { type: "boolean", default: false },
  },
});

const token = process.env.INSTAGRAM_TOKEN;
const idCuenta = process.env.INSTAGRAM_USER_ID;
if (!values.simulado && (!token || !idCuenta)) {
  console.error("Falta INSTAGRAM_TOKEN o INSTAGRAM_USER_ID. Para probar sin datos reales, agregá --simulado.");
  process.exit(1);
}
const limite = Number(values.limite);

// Datos de mentira con la forma de la API real, para probar sin token
const metaSimulada = {
  perfil: async () => ({ username: "vow_ar", followers_count: 300, follows_count: 2000 }),
  publicaciones: async () =>
    Array.from({ length: 4 }, (_, i) => ({
      id: `SIMULADO${i}`,
      caption: `Texto de ejemplo ${i + 1}.`,
      media_type: i % 2 ? "VIDEO" : "CAROUSEL_ALBUM",
      permalink: `https://www.instagram.com/${i % 2 ? "reel" : "p"}/SIMULADO${i}/`,
      timestamp: `2026-10-${10 + i}T18:00:00+0000`,
      like_count: 10 * (i + 1),
      comments_count: i,
    })),
  metricas: async (id) => {
    const i = Number(id.slice(-1));
    return { reach: 200 * (i + 1), views: 300 * (i + 1), saved: i, shares: i, total_interactions: 12 * (i + 1) };
  },
};
const fetchReferenciasSimulado = async () => ({
  ok: true,
  json: async () => ({
    business_discovery: {
      followers_count: 1_000_000,
      media: { data: [{ like_count: 3000, comments_count: 30, media_type: "CAROUSEL_ALBUM", timestamp: "2026-10-10T18:00:00+0000", caption: "x", permalink: "https://www.instagram.com/p/X/" }] },
    },
  }),
});

const meta = values.simulado ? metaSimulada : crearClienteMeta({ token, idCuenta });
let cuenta;
try {
  cuenta = await medirCuentaPropia(meta, { limite });
} catch (error) {
  console.error(`No se pudo medir la cuenta propia: ${error.message}`);
  process.exit(1);
}
console.log(`✓ @${cuenta.usuario}: ${cuenta.publicaciones.length} publicaciones, ${cuenta.seguidores} seguidores`);

const referencias = [];
const fallas = [];
if (!values["sin-referencias"]) {
  const { cuentas } = JSON.parse(await readFile(new URL("../docs/marca/cuentas-referencia.json", import.meta.url), "utf8"));
  for (const { usuario, marca } of cuentas) {
    try {
      const datos = await descargarCuenta(usuario, {
        token: values.simulado ? "simulado" : token,
        idCuentaPropia: values.simulado ? "simulado" : idCuenta,
        limite,
        fetchFn: values.simulado ? fetchReferenciasSimulado : fetch,
      });
      referencias.push({ marca, ...resumirCuenta(datos) });
      console.log(`✓ ${marca} (@${usuario})`);
    } catch (error) {
      fallas.push({ marca, usuario, motivo: error.message });
      console.error(`✗ ${marca} (@${usuario}): ${error.message}`);
    }
  }
}

const fecha = new Date().toISOString().slice(0, 10);
const informe = armarInforme({ fecha, cuenta, referencias, fallas, hoy: new Date() });
const sufijo = values.simulado ? "-simulado" : "";
const carpeta = new URL("../docs/rendimiento/", import.meta.url);
await mkdir(carpeta, { recursive: true });
await writeFile(new URL(`rendimiento-${fecha}${sufijo}.json`, carpeta), JSON.stringify(informe, null, 2) + "\n");
await writeFile(new URL(`rendimiento-${fecha}${sufijo}.md`, carpeta), informeAMarkdown(informe));
console.log(`\nInforme guardado en docs/rendimiento/rendimiento-${fecha}${sufijo}.md. El Estratega lee el último en cada plan.`);
