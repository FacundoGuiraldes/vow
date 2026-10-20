// Evals con la IA real: le pide al Estratega varios pedidos distintos y mide qué porcentaje de planes cumple las reglas
// de marca, cuánto cuesta cada uno y qué reglas rechazan más. GASTA PLATA (unos US$ 0,05 por plan): por eso tiene tope.
//
// Uso:
//   npm run evals:online                       corre los pedidos con Claude (necesita ANTHROPIC_API_KEY)
//   npm run evals:online -- --simulado         prueba el flujo sin gastar
//   --tope-usd 0.5          corta cuando el gasto llega a ese número (por defecto 0.50)
//   --repeticiones 2        repite cada pedido (la IA no da siempre lo mismo)
//   --solo id1,id2          corre solo esos pedidos
//   --guardar-linea-base    guarda este resultado como referencia para comparar los próximos
//   --base-desde <informe>  arma la línea base desde un informe que ya existe (no llama a la API, no gasta)
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { planificarSemana, MODELO_ESTRATEGA } from "../src/agents/estratega.js";
import { crearClienteSimulado } from "../src/agents/cliente-simulado.js";
import { costoUSD } from "../src/orquestador/orquestador.js";

const RUTA_PEDIDOS = new URL("./pedidos-estratega.json", import.meta.url);
const RUTA_LINEA_BASE = new URL("./linea-base-online.json", import.meta.url);
const CARPETA_RESULTADOS = new URL("./resultados/", import.meta.url);

// "Pieza 1: nombra elementos del gimnasio ("barra")." y "Pieza 2: nombra elementos del gimnasio ("pesas")."
// son el mismo problema: se agrupan quitando la etiqueta de la pieza, lo citado y los números.
export function clasificarError(error) {
  return String(error)
    .replace(/^[^:]*:\s*/, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .replace(/[\s.]+$/, "")
    .trim();
}

export async function correrEvalsOnline({ pedidos, crearCliente, planificar = planificarSemana, topeUSD = 0.5, repeticiones = 1, reloj = () => Date.now() }) {
  const resultados = [];
  let gastadoUSD = 0;
  for (const pedido of pedidos) {
    for (let vuelta = 1; vuelta <= repeticiones; vuelta++) {
      const id = repeticiones > 1 ? `${pedido.id} #${vuelta}` : pedido.id;
      if (gastadoUSD >= topeUSD) {
        resultados.push({ id, estado: "omitido", errores: [`se llegó al tope de US$ ${topeUSD}`], uso: { entrada: 0, salida: 0 }, costoUSD: 0, ms: 0 });
        continue;
      }
      const inicio = reloj();
      try {
        const r = await planificar(
          { semanaInicio: pedido.semana, fase: pedido.fase, recursos: pedido.recursos ?? {}, notas: pedido.notas ?? "", piezas: pedido.piezas },
          { cliente: crearCliente(pedido) }
        );
        const costo = costoUSD(r.uso);
        gastadoUSD += costo;
        resultados.push({
          id,
          estado: r.ok ? "aprobado" : "rechazado",
          errores: r.errores ?? [],
          uso: r.uso,
          costoUSD: costo,
          ms: reloj() - inicio,
          intentos: r.intentos ?? null,
          // Lo que la IA propuso y se rechazó: sin esto un rechazo es un número sin contexto y no se puede investigar
          propuesta: r.ok ? null : r.propuesta ?? null,
        });
      } catch (error) {
        // Un corte de red o un error de la API no es un plan malo: se cuenta aparte
        resultados.push({ id, estado: "error-tecnico", errores: [error.message], uso: { entrada: 0, salida: 0 }, costoUSD: 0, ms: reloj() - inicio });
      }
    }
  }
  return { resultados, resumen: resumir(resultados) };
}

export function resumir(resultados) {
  const cuenta = (estado) => resultados.filter((r) => r.estado === estado).length;
  const aprobados = cuenta("aprobado");
  const rechazados = cuenta("rechazado");
  const medidos = aprobados + rechazados;
  const frecuencias = new Map();
  for (const r of resultados.filter((x) => x.estado === "rechazado")) {
    for (const clave of new Set(r.errores.map(clasificarError))) frecuencias.set(clave, (frecuencias.get(clave) ?? 0) + 1);
  }
  const costoTotalUSD = resultados.reduce((suma, r) => suma + r.costoUSD, 0);
  return {
    total: resultados.length,
    aprobados,
    rechazados,
    erroresTecnicos: cuenta("error-tecnico"),
    omitidos: cuenta("omitido"),
    tasaAprobacion: medidos === 0 ? null : aprobados / medidos,
    costoTotalUSD,
    costoMedioUSD: medidos === 0 ? null : costoTotalUSD / medidos,
    tokens: {
      entrada: resultados.reduce((s, r) => s + r.uso.entrada, 0),
      salida: resultados.reduce((s, r) => s + r.uso.salida, 0),
    },
    problemasFrecuentes: [...frecuencias.entries()].map(([problema, veces]) => ({ problema, veces })).sort((a, b) => b.veces - a.veces),
  };
}

// Compara contra el último resultado que se aceptó como referencia. La IA varía de una corrida a otra,
// por eso hay un margen: solo avisa si empeora más que eso.
export function compararConLineaBase(resumen, base, { margenTasa = 0.15, margenCosto = 0.5 } = {}) {
  if (!base) return { ok: true, sinBase: true, avisos: ["Todavía no hay línea base. Guardá esta corrida con --guardar-linea-base si te parece buena."] };
  const avisos = [];
  if (resumen.tasaAprobacion !== null && base.tasaAprobacion !== null && resumen.tasaAprobacion < base.tasaAprobacion - margenTasa) {
    avisos.push(`Bajó la tasa de aprobación: ${porcentaje(resumen.tasaAprobacion)} (antes ${porcentaje(base.tasaAprobacion)}).`);
  }
  if (resumen.costoMedioUSD !== null && base.costoMedioUSD !== null && resumen.costoMedioUSD > base.costoMedioUSD * (1 + margenCosto)) {
    avisos.push(`Subió el costo por plan: US$ ${resumen.costoMedioUSD.toFixed(3)} (antes US$ ${base.costoMedioUSD.toFixed(3)}).`);
  }
  return { ok: avisos.length === 0, sinBase: false, avisos };
}

// La línea base que se guarda a partir de un informe ya generado, sin volver a gastar.
// Rechaza informes que no sirven de referencia: simulados, con errores técnicos o con pedidos omitidos.
export function lineaBaseDesdeInforme(informe) {
  if (!informe?.resumen || !Array.isArray(informe.resultados)) throw new Error("El archivo no parece un informe de evals online.");
  if (informe.simulado) throw new Error("No se guarda una línea base con un informe simulado.");
  const { resumen } = informe;
  if (resumen.erroresTecnicos > 0 || resumen.omitidos > 0 || resumen.tasaAprobacion === null) {
    throw new Error("El informe tiene errores técnicos o pedidos omitidos: no sirve como referencia.");
  }
  // Con --repeticiones los ids vienen como "pedido #2": en la base van una sola vez y sin el número
  const pedidos = [...new Set(informe.resultados.map((r) => r.id.replace(/ #\d+$/, "")))];
  return { fecha: informe.fecha, modelo: informe.modelo, pedidos, resumen };
}

const porcentaje = (x) => `${Math.round(x * 100)}%`;

async function leerJSON(ruta) {
  try {
    return JSON.parse(await readFile(ruta, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      simulado: { type: "boolean", default: false },
      "tope-usd": { type: "string", default: "0.5" },
      repeticiones: { type: "string", default: "1" },
      solo: { type: "string" },
      "guardar-linea-base": { type: "boolean", default: false },
      "base-desde": { type: "string" },
    },
  });

  // Atajo gratis: convierte un informe que ya tenés en la línea base y termina (no usa la API)
  if (values["base-desde"]) {
    const informe = await leerJSON(values["base-desde"]);
    if (!informe) {
      console.error(`No existe el informe ${values["base-desde"]}.`);
      process.exit(1);
    }
    try {
      const base = lineaBaseDesdeInforme(informe);
      await writeFile(RUTA_LINEA_BASE, JSON.stringify(base, null, 2) + "\n");
      console.log(`Línea base guardada en evals/linea-base-online.json (${base.pedidos.length} pedidos, aprobación ${porcentaje(base.resumen.tasaAprobacion)}).`);
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  let crearCliente = (pedido) => crearClienteSimulado(pedido.semana);
  if (!values.simulado) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("Falta ANTHROPIC_API_KEY en el .env. Para probar sin gastar, agregá --simulado.");
      process.exit(1);
    }
    const { crearClienteReal } = await import("../src/cliente-real.js");
    const cliente = await crearClienteReal("evals-online");
    crearCliente = () => cliente;
  }

  let { pedidos } = await leerJSON(RUTA_PEDIDOS);
  if (values.solo) {
    const ids = values.solo.split(",");
    const desconocidos = ids.filter((id) => !pedidos.some((p) => p.id === id));
    if (desconocidos.length) {
      console.error(`No existe: ${desconocidos.join(", ")}. Pedidos: ${pedidos.map((p) => p.id).join(", ")}.`);
      process.exit(1);
    }
    pedidos = pedidos.filter((p) => ids.includes(p.id));
  }
  const topeUSD = Number(values["tope-usd"]);
  const repeticiones = Number(values.repeticiones);
  if (!(topeUSD > 0) || !Number.isInteger(repeticiones) || repeticiones < 1) {
    console.error("--tope-usd tiene que ser mayor que 0 y --repeticiones un entero de 1 o más.");
    process.exit(1);
  }

  const { resultados, resumen } = await correrEvalsOnline({ pedidos, crearCliente, topeUSD, repeticiones });

  const iconos = { aprobado: "✔", rechazado: "✘", "error-tecnico": "!", omitido: "·" };
  for (const r of resultados) {
    console.log(`${iconos[r.estado]} ${r.id}  (US$ ${r.costoUSD.toFixed(3)}, ${Math.round(r.ms / 1000)} s)`);
    for (const e of r.estado === "aprobado" ? [] : r.errores) console.log(`    - ${e}`);
  }
  console.log(`\n${resumen.aprobados} aprobados, ${resumen.rechazados} rechazados, ${resumen.erroresTecnicos} errores técnicos, ${resumen.omitidos} omitidos por el tope.`);
  if (resumen.tasaAprobacion !== null) console.log(`Tasa de aprobación: ${porcentaje(resumen.tasaAprobacion)}. Costo medio por plan: US$ ${resumen.costoMedioUSD.toFixed(3)}.`);
  console.log(`Gasto total: US$ ${resumen.costoTotalUSD.toFixed(3)} (${resumen.tokens.entrada} tokens de entrada, ${resumen.tokens.salida} de salida).`);
  if (resumen.problemasFrecuentes.length) {
    console.log("\nQué rechazó más:");
    for (const { problema, veces } of resumen.problemasFrecuentes.slice(0, 5)) console.log(`  ${veces} × ${problema}`);
  }

  const informe = { fecha: new Date().toISOString(), modelo: MODELO_ESTRATEGA, simulado: values.simulado, topeUSD, repeticiones, resumen, resultados };
  await mkdir(CARPETA_RESULTADOS, { recursive: true });
  const archivo = new URL(`online-${informe.fecha.replace(/[:.]/g, "-")}${values.simulado ? "-simulado" : ""}.json`, CARPETA_RESULTADOS);
  await writeFile(archivo, JSON.stringify(informe, null, 2) + "\n");
  console.log(`\nInforme completo en evals/resultados/${archivo.pathname.split("/").pop()}`);

  const base = await leerJSON(RUTA_LINEA_BASE);
  const comparacion = values.simulado ? { ok: true, avisos: [] } : compararConLineaBase(resumen, base?.resumen ?? null);
  for (const aviso of comparacion.avisos) console.log(`${comparacion.ok ? "ℹ" : "⚠"} ${aviso}`);

  if (values["guardar-linea-base"]) {
    if (values.simulado) {
      console.error("No se guarda una línea base con --simulado.");
      process.exit(1);
    }
    await writeFile(RUTA_LINEA_BASE, JSON.stringify({ fecha: informe.fecha, modelo: informe.modelo, pedidos: pedidos.map((p) => p.id), resumen }, null, 2) + "\n");
    console.log("Línea base guardada en evals/linea-base-online.json");
  }
  process.exit(comparacion.ok && resumen.erroresTecnicos === 0 && resumen.tasaAprobacion !== null ? 0 : 1);
}
