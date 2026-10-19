import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { crearClienteSimulado } from "./agents/cliente-simulado.js";
import { resumenDePlan } from "./agents/resumen-plan.js";
import { ejecutarFlujo, registroNuevo, aprobar, rehacerDesde, costoUSD } from "./orquestador/orquestador.js";
import { armarPasos, PASOS } from "./orquestador/flujo-semanal.js";

// Uso:
//   npm run semana -- --semana 2026-10-26                       corre el flujo hasta donde haga falta tu aprobación
//   npm run semana -- --semana 2026-10-26 --aprobar aprobar-plan   aprueba el plan (después volvé a correr el comando de arriba)
//   npm run semana -- --semana 2026-10-26 --desde planificar       rehace desde ese paso (borra también las aprobaciones)
//   agregá --simulado para probar el flujo completo sin gastar plata
// Opciones del plan: --fase, --piezas, --producto, --gente, --notas (iguales a npm run plan)

const { values } = parseArgs({
  options: {
    semana: { type: "string" },
    fase: { type: "string", default: "base" },
    producto: { type: "boolean", default: false },
    gente: { type: "boolean", default: false },
    notas: { type: "string", default: "" },
    piezas: { type: "string", default: "2" },
    simulado: { type: "boolean", default: false },
    aprobar: { type: "string" },
    desde: { type: "string" },
  },
});

if (!values.semana) {
  console.error("Falta --semana AAAA-MM-DD (el lunes de la semana a planificar).");
  process.exit(1);
}

const sufijo = values.simulado ? "-simulado" : "";
const carpetaPlanes = new URL("../docs/planes/", import.meta.url);
const carpetaRegistros = new URL("../docs/ejecuciones/", import.meta.url);
const archivoRegistro = new URL(`${values.semana}${sufijo}.json`, carpetaRegistros);

const leerRegistro = async () => {
  try {
    return JSON.parse(await readFile(archivoRegistro, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return registroNuevo(values.semana);
    throw error;
  }
};
const guardarRegistro = async (registro) => {
  await mkdir(carpetaRegistros, { recursive: true });
  await writeFile(archivoRegistro, JSON.stringify(registro, null, 2) + "\n");
};

let registro = await leerRegistro();

if (values.aprobar) {
  if (!PASOS.includes(values.aprobar)) {
    console.error(`"${values.aprobar}" no es un paso. Pasos: ${PASOS.join(", ")}.`);
    process.exit(1);
  }
  if (registro.pasos["revisar"]?.estado !== "ok") {
    console.error("Todavía no hay un plan revisado para aprobar. Corré primero: npm run semana -- --semana " + values.semana);
    process.exit(1);
  }
  registro = aprobar(registro, values.aprobar);
  await guardarRegistro(registro);
  console.log(`Aprobado: ${values.aprobar}. Volvé a correr el comando sin --aprobar para que el flujo siga.`);
  process.exit(0);
}

let cliente = crearClienteSimulado(values.semana);
if (!values.simulado) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY en el .env. Para probar sin gastar, agregá --simulado.");
    process.exit(1);
  }
  cliente = new Anthropic();
}

const pasos = armarPasos({
  opciones: {
    semana: values.semana,
    fase: values.fase,
    recursos: { producto: values.producto, gente: values.gente },
    notas: values.notas,
    piezas: Number(values.piezas),
  },
  cliente,
  escribir: async (nombre, texto) => {
    await mkdir(carpetaPlanes, { recursive: true });
    await writeFile(new URL(nombre, carpetaPlanes), texto);
  },
  sufijo,
});

if (values.desde) registro = rehacerDesde(registro, pasos, values.desde);

const resultado = await ejecutarFlujo({ pasos, registro });
await guardarRegistro(resultado.registro);

const iconos = { ok: "✔", error: "✘", esperando: "…" };
for (const nombre of PASOS) {
  const paso = resultado.registro.pasos[nombre];
  console.log(`${paso ? iconos[paso.estado] : "·"} ${nombre}${paso?.estado === "esperando" ? " (esperando tu aprobación)" : ""}`);
  for (const error of paso?.estado === "error" ? paso.errores : []) console.log(`    - ${error}`);
}
const { gasto } = resultado.registro;
console.log(`Gasto acumulado de esta semana: ${gasto.entrada} tokens de entrada, ${gasto.salida} de salida (≈ US$ ${costoUSD(gasto).toFixed(2)}).`);

if (resultado.estado === "esperando-aprobacion") {
  console.log(`\n${resumenDePlan(resultado.registro.pasos.planificar.salida)}`);
  console.log(`\nSi te gusta, aprobalo con:\n  npm run semana -- --semana ${values.semana}${values.simulado ? " --simulado" : ""} --aprobar ${resultado.esperando}\ny volvé a correr el comando sin --aprobar. Si no, rehacé con --desde planificar.`);
} else if (resultado.estado === "completo") {
  console.log(`\nFlujo completo. Plan guardado en docs/planes/plan-${values.semana}${sufijo}.json`);
} else {
  console.log(`\nEl flujo se frenó en "${resultado.fallo}". Corregí o volvé a intentar con --desde ${resultado.fallo}.`);
  process.exit(1);
}
