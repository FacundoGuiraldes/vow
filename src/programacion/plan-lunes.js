// Plan de los lunes: corre los agentes (Estratega y Revisor) y le manda el plan al bot de Telegram.
// Lo ejecuta el workflow "Plan del lunes" (npm run plan:lunes). Acá NO se aprueba nada: la aprobación es de Facundo, en Telegram.
//
//   npm run plan:lunes                          planifica la semana de hoy (o la próxima, si hoy no es lunes) y la envía
//   npm run plan:lunes -- --semana 2026-11-02   una semana puntual
//   npm run plan:lunes -- --simulado            sin gastar plata: usa el plan de ejemplo y lo muestra (nunca lo manda a Telegram)
//   npm run plan:lunes -- --sin-enviar          arma el plan con la IA real y lo muestra, sin mandarlo
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { crearClienteReal } from "../cliente-real.js";
import { crearClienteSimulado } from "../agents/cliente-simulado.js";
import { ejecutarFlujo, registroNuevo } from "../orquestador/orquestador.js";
import { armarPasos } from "../orquestador/flujo-semanal.js";
import { ahoraArgentina, esFechaISO, lunesDe } from "./fechas.js";

export function opcionesDelPlan({ valores, hoy, novedades = [], foco = "", notasEstrategia = "" }) {
  const semana = valores.semana ?? lunesDe(hoy, { siguiente: true });
  const notasDeNovedades = novedades.length ? `Novedades que Facundo te pasó por Telegram (tomalas como ciertas): ${novedades.map((n) => n.texto).join(" | ")}` : "";
  const notasDelJuego = [foco && `FOCO DE LA SEMANA que fijó Facundo (el plan gira alrededor de esto): ${foco}`, notasEstrategia && `Notas de estrategia de Facundo: ${notasEstrategia}`].filter(Boolean).join("\n");
  return {
    semana,
    fase: valores.fase,
    recursos: { producto: valores.producto, gente: valores.gente },
    notas: [valores.notas, notasDelJuego, notasDeNovedades].filter(Boolean).join("\n"),
    piezas: Number(valores.piezas),
  };
}

// Llamada a la API del servicio (Render). Si no responde, se reintenta: con el plan gratis el servicio puede estar dormido.
async function llamarServicio(ruta, { metodo = "GET", cuerpo, env = process.env, fetchFn = fetch, intentos = 3 } = {}) {
  const base = env.URL_PUBLICA?.replace(/\/$/, "");
  if (!base || !env.PROGRAMACION_SECRETO) throw new Error("Faltan URL_PUBLICA y PROGRAMACION_SECRETO para hablar con el servicio.");
  let ultimo;
  for (let intento = 1; intento <= intentos; intento++) {
    let respuesta;
    try {
      respuesta = await fetchFn(`${base}/api/programacion/${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${env.PROGRAMACION_SECRETO}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(90_000), // dormido, Render tarda cerca de un minuto en despertar
      });
    } catch (error) {
      ultimo = new Error(`No se pudo conectar con el servicio: ${error.message}`);
      continue;
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) return datos;
    ultimo = new Error(`El servicio respondió ${respuesta.status}: ${datos.error ?? "sin detalle"}`);
    if (respuesta.status < 500) throw ultimo; // un error del pedido no mejora reintentando
  }
  throw ultimo;
}

export async function correrPlanDelLunes({
  valores: pedidos,
  env = process.env,
  hoy = ahoraArgentina().fecha,
  log = console.log,
  fetchFn = fetch,
  crearCliente = (origen) => crearClienteReal(origen), // se inyecta en los tests para no gastar
}) {
  // Una corrida simulada nunca toca el servicio real: no llena el Telegram de Facundo con un plan de ejemplo
  const valores = pedidos.simulado ? { ...pedidos, "sin-enviar": true } : pedidos;
  const puedeHablarConElServicio = Boolean(env.URL_PUBLICA && env.PROGRAMACION_SECRETO) && !valores.simulado;
  let novedades = [];
  let foco = "";
  let notasEstrategia = "";
  if (puedeHablarConElServicio) {
    const datos = await llamarServicio("novedades", { env, fetchFn });
    novedades = datos.novedades ?? [];
    foco = datos.foco ?? "";
    notasEstrategia = datos.notas_estrategia ?? "";
    log(`Novedades de VOW para el Estratega: ${novedades.length}${foco ? " (con foco de la semana)" : ""}`);
  }
  const opciones = opcionesDelPlan({ valores, hoy, novedades, foco, notasEstrategia });
  if (!esFechaISO(opciones.semana)) throw new Error("--semana tiene que ser AAAA-MM-DD.");

  let cliente = crearClienteSimulado(opciones.semana);
  if (!valores.simulado) {
    if (!env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY. Para probar sin gastar, agregá --simulado.");
    cliente = await crearCliente("plan-lunes");
  }

  // Solo planificar y revisar: la aprobación no es un paso de acá, es de Facundo en Telegram
  const pasos = armarPasos({ opciones, cliente, escribir: async () => {} }).filter((paso) => ["planificar", "revisar"].includes(paso.nombre));
  const resultado = await ejecutarFlujo({ pasos, registro: registroNuevo(opciones.semana) });

  if (resultado.estado !== "completo") {
    const motivo = (resultado.registro.pasos[resultado.fallo]?.errores ?? ["motivo desconocido"]).join("; ");
    const mensaje = `El paso "${resultado.fallo}" no pasó: ${motivo}`;
    if (puedeHablarConElServicio && !valores["sin-enviar"]) await llamarServicio("plan", { metodo: "POST", cuerpo: { semana: opciones.semana, error: mensaje }, env, fetchFn });
    throw new Error(mensaje);
  }

  const plan = resultado.registro.pasos.planificar.salida;
  log(`Plan de la semana del ${opciones.semana}: ${plan.piezas.length} ${plan.piezas.length === 1 ? "pieza" : "piezas"}.`);
  if (valores["sin-enviar"]) {
    log(JSON.stringify(plan, null, 2));
    return { plan, enviado: false };
  }
  if (!puedeHablarConElServicio) throw new Error("Faltan URL_PUBLICA y PROGRAMACION_SECRETO para enviar el plan (o usá --sin-enviar).");
  const respuesta = await llamarServicio("plan", {
    metodo: "POST",
    cuerpo: { semana: opciones.semana, plan, novedades_usadas: novedades.map((n) => n.id) },
    env,
    fetchFn,
  });
  log(`Plan enviado a Telegram: ${respuesta.piezas} ${respuesta.piezas === 1 ? "pieza" : "piezas"}.`);
  return { plan, enviado: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      semana: { type: "string" },
      fase: { type: "string", default: "base" },
      producto: { type: "boolean", default: false },
      gente: { type: "boolean", default: false },
      notas: { type: "string", default: "" },
      piezas: { type: "string", default: "4" },
      simulado: { type: "boolean", default: false },
      "sin-enviar": { type: "boolean", default: false },
    },
  });
  try {
    await correrPlanDelLunes({ valores: values });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
