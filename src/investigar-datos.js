import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { descargarCuenta, LIMITE_POR_DEFECTO } from "./agents/instagram.js";
import { resumirCuenta } from "./agents/metricas.js";

// Uso:
//   npm run investigar                       (baja las cuentas de docs/marca/cuentas-referencia.json)
//   npm run investigar -- --limite 40        (cuántas publicaciones por cuenta)
//   npm run investigar -- --simulado         (no llama a Meta: prueba el flujo con datos inventados)
// Necesita INSTAGRAM_TOKEN e INSTAGRAM_USER_ID en el .env (o en variables de entorno). Solo lee datos públicos.

const { values } = parseArgs({
  options: {
    limite: { type: "string", default: String(LIMITE_POR_DEFECTO) },
    simulado: { type: "boolean", default: false },
  },
});

const { cuentas } = JSON.parse(await readFile(new URL("../docs/marca/cuentas-referencia.json", import.meta.url), "utf8"));

// Respuesta de mentira con la forma de la API real, para probar sin token
const fetchSimulado = async (url) => {
  const campos = new URL(url).searchParams.get("fields") ?? "";
  const usuario = /username\(([^)]+)\)/.exec(campos)?.[1] ?? "x";
  const publicaciones = Array.from({ length: 4 }, (_, i) => ({
    like_count: 1000 * (i + 1),
    comments_count: 10 * (i + 1),
    ...(i % 2 ? { view_count: 50000 * (i + 1) } : {}),
    media_type: i % 2 ? "VIDEO" : "CAROUSEL_ALBUM",
    timestamp: `2026-10-${10 + i}T18:00:00+0000`,
    caption: `Texto de ejemplo ${i + 1} de ${usuario}.`,
    permalink: `https://www.instagram.com/${i % 2 ? "reel" : "p"}/SIMULADO${i}/`,
  }));
  return { ok: true, json: async () => ({ business_discovery: { followers_count: 1_000_000, media_count: 500, media: { data: publicaciones } } }) };
};

const token = process.env.INSTAGRAM_TOKEN;
const idCuentaPropia = process.env.INSTAGRAM_USER_ID;
if (!values.simulado && (!token || !idCuentaPropia)) {
  console.error("Falta INSTAGRAM_TOKEN o INSTAGRAM_USER_ID. Para probar sin datos reales, agregá --simulado.");
  process.exit(1);
}

const resultados = [];
const fallas = [];
for (const { usuario, marca, pais } of cuentas) {
  try {
    const cuenta = await descargarCuenta(usuario, {
      token: values.simulado ? "simulado" : token,
      idCuentaPropia: values.simulado ? "simulado" : idCuentaPropia,
      limite: Number(values.limite),
      fetchFn: values.simulado ? fetchSimulado : fetch,
    });
    resultados.push({ marca, pais, ...resumirCuenta(cuenta) });
    console.log(`✓ ${marca} (@${usuario}): ${cuenta.publicaciones.length} publicaciones, ${cuenta.seguidores?.toLocaleString("es-AR")} seguidores`);
  } catch (error) {
    fallas.push({ marca, usuario, motivo: error.message });
    console.error(`✗ ${marca} (@${usuario}): ${error.message}`);
  }
}

const fecha = new Date().toISOString().slice(0, 10);
const carpeta = new URL("../docs/investigacion/", import.meta.url);
await mkdir(carpeta, { recursive: true });
const archivo = new URL(`datos-${fecha}${values.simulado ? "-simulado" : ""}.json`, carpeta);
await writeFile(archivo, JSON.stringify({ fecha, simulado: values.simulado, cuentas: resultados, fallas }, null, 2) + "\n");
console.log(`\nDatos guardados en docs/investigacion/${archivo.pathname.split("/").pop()} (no se sube a GitHub).`);
if (fallas.length > 0) process.exitCode = 1;
