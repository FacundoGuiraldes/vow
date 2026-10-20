import "dotenv/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { corteLimpio, crearClienteReal } from "./cliente-real.js";
import { analizarMercado, informeAMarkdown } from "./agents/investigador.js";

// Uso:
//   npm run analizar                 (analiza con Claude los últimos datos bajados con `npm run investigar`: gasta plata)
//   npm run analizar -- --simulado   (no llama a Claude: prueba el flujo gratis, con los datos simulados)
// Primero hay que haber corrido `npm run investigar` para tener los datos.

const { values } = parseArgs({ options: { simulado: { type: "boolean", default: false } } });

const carpeta = new URL("../docs/investigacion/", import.meta.url);
const archivos = (await readdir(carpeta).catch(() => []))
  .filter((nombre) => /^datos-\d{4}-\d{2}-\d{2}(-simulado)?\.json$/.test(nombre))
  .filter((nombre) => nombre.includes("-simulado") === values.simulado)
  .sort();
if (archivos.length === 0) {
  console.error("No hay datos para analizar. Corré antes `npm run investigar` (o con --simulado para probar).");
  process.exit(1);
}
const archivoDatos = archivos.at(-1);
const datos = JSON.parse(await readFile(new URL(archivoDatos, carpeta), "utf8"));
const { hipotesis } = JSON.parse(await readFile(new URL("hipotesis.json", carpeta), "utf8"));
console.log(`Analizando ${archivoDatos}: ${datos.cuentas.length} cuentas, ${hipotesis.length} ideas a probar.`);

// Cliente que no llama a Claude: devuelve un informe de ejemplo que cumple las reglas
const clienteSimulado = {
  messages: {
    create: async () => ({
      content: [
        {
          type: "tool_use",
          id: "simulado",
          name: "entregar_informe",
          input: {
            resumen: "Informe de ejemplo (modo simulado, no usa IA).",
            hallazgos: [
              { titulo: "Hallazgo de ejemplo", evidencia: "Dato inventado para probar el flujo.", enlaces: [datos.cuentas[0].publicaciones[0].enlace], confianza: "baja" },
            ],
            hipotesis: hipotesis.map((h) => ({
              id: h.id,
              veredicto: "no se puede medir con estos datos",
              explicacion: "Modo simulado: no se analizó nada.",
              enlaces: [],
              confianza: "baja",
            })),
            recomendaciones_para_estratega: ["Recomendación de ejemplo."],
            limites: ["Modo simulado."],
          },
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  },
};

let cliente = clienteSimulado;
if (!values.simulado) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY. Para probar sin gastar, agregá --simulado.");
    process.exit(1);
  }
  cliente = await crearClienteReal("analizar");
}

const resultado = await corteLimpio(analizarMercado({ datos, hipotesis }, { cliente }));
console.log(`Tokens usados: ${resultado.uso.entrada} de entrada, ${resultado.uso.salida} de salida.`);

if (!resultado.ok) {
  console.error("El informe se descartó por estos problemas:");
  for (const error of resultado.errores) console.error(` - ${error}`);
  if (resultado.propuesta) console.error("\nPropuesta rechazada:\n" + JSON.stringify(resultado.propuesta, null, 2));
  process.exit(1);
}

const fecha = datos.fecha ?? new Date().toISOString().slice(0, 10);
const base = `informe-${fecha}${values.simulado ? "-simulado" : ""}`;
await writeFile(new URL(`${base}.json`, carpeta), JSON.stringify(resultado.informe, null, 2) + "\n");
const markdown = informeAMarkdown(resultado.informe, { hipotesis, fecha });
await writeFile(new URL(`${base}.md`, carpeta), markdown);
console.log(`Informe guardado en docs/investigacion/${base}.md y .json\n`);
console.log(markdown);
