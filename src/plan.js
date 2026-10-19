import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { planificarSemana } from "./agents/estratega.js";

// Uso:
//   npm run plan -- --semana 2026-10-26                 (llama a Claude: gasta plata)
//   npm run plan -- --semana 2026-10-26 --simulado      (no llama a nada: prueba el flujo gratis)
// Opciones: --fase base|expectativa|cuenta-regresiva (por defecto base),
//           --producto (ya hay producto físico), --gente (hay personas confirmadas), --notas "texto"

const { values } = parseArgs({
  options: {
    semana: { type: "string" },
    fase: { type: "string", default: "base" },
    producto: { type: "boolean", default: false },
    gente: { type: "boolean", default: false },
    notas: { type: "string", default: "" },
    simulado: { type: "boolean", default: false },
  },
});

if (!values.semana) {
  console.error("Falta --semana AAAA-MM-DD (el lunes de la semana a planificar).");
  process.exit(1);
}

// Cliente que no llama a Claude: devuelve un plan de ejemplo que cumple las reglas
const clienteSimulado = {
  messages: {
    create: async () => ({
      content: [
        {
          type: "tool_use",
          id: "simulado",
          name: "proponer_plan",
          input: {
            resumen: "Plan de ejemplo (modo simulado, no usa IA).",
            piezas: [
              {
                fecha: values.semana,
                formato: "carrusel",
                pilar: "promesa",
                gancho: "Una promesa para vos.",
                guion: "Tres láminas de texto sobre fondo hueso.",
                texto_en_pantalla: ["Una promesa para vos.", "La escribís vos. Nadie más la lee."],
                epigrafe: "Es lo que sostiene todo lo demás. Anotate en la lista: link en la bio.",
                palabras_clave: ["promesa", "constancia"],
                cta: "Anotate en la lista de espera.",
                recursos: ["Diseño en colores de marca"],
                justificacion: "Presenta la idea central de la marca sin mostrar producto.",
              },
            ],
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
    console.error("Falta ANTHROPIC_API_KEY en el .env. Para probar sin gastar, agregá --simulado.");
    process.exit(1);
  }
  cliente = new Anthropic();
}

const resultado = await planificarSemana(
  {
    semanaInicio: values.semana,
    fase: values.fase,
    recursos: { producto: values.producto, gente: values.gente },
    notas: values.notas,
  },
  { cliente }
);

console.log(`Tokens usados: ${resultado.uso.entrada} de entrada, ${resultado.uso.salida} de salida.`);

if (!resultado.ok) {
  console.error("El plan se descartó por estos problemas:");
  for (const error of resultado.errores) console.error(` - ${error}`);
  if (resultado.propuesta) console.error("\nPropuesta rechazada:\n" + JSON.stringify(resultado.propuesta, null, 2));
  process.exit(1);
}

const carpeta = new URL("../docs/planes/", import.meta.url);
await mkdir(carpeta, { recursive: true });
const archivo = new URL(`plan-${values.semana}${values.simulado ? "-simulado" : ""}.json`, carpeta);
await writeFile(archivo, JSON.stringify(resultado.plan, null, 2) + "\n");
console.log(`Plan guardado en docs/planes/${archivo.pathname.split("/").pop()}`);
console.log(`\n${resultado.plan.resumen}\n`);
for (const pieza of resultado.plan.piezas) {
  console.log(`${pieza.fecha} · ${pieza.formato} · ${pieza.pilar}\n  Gancho: ${pieza.gancho}`);
}
