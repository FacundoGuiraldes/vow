// Evals offline del Revisor: casos fijos con el resultado esperado. No usa IA ni red: cuesta US$ 0.
// Uso: npm run evals
// Sirve para saber si un cambio en las reglas o en el Estratega rompe algo que antes andaba
// (y para no repetir falsos positivos que ya corregimos).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { revisarPlan } from "../src/agents/revisor.js";
import { NOMBRES_DE_REGLAS, revisarReglas } from "../src/agents/reglas-marca.js";

export const RUTA_CASOS = new URL("./casos-revisor.json", import.meta.url);

// Arma el plan de un caso: la pieza base con los cambios indicados
export function armarPlan(conjunto, caso) {
  const overrides = caso.piezas ?? (caso.pieza ? [caso.pieza] : []);
  return { resumen: "Plan de prueba.", piezas: overrides.map((cambios) => ({ ...conjunto.base, ...cambios })), ...(caso.plan ?? {}) };
}

// Contexto falso: el cerebro, las referencias y las piezas definidas salen del propio caso, no de los archivos reales,
// así los resultados no cambian cuando se edita el cerebro de marca.
function contextoDelCaso(conjunto, caso) {
  const definidas = caso.definidas ?? {};
  return {
    listar: async (carpeta) => (String(carpeta).includes("piezas") ? Object.keys(definidas) : []),
    leer: async (ruta) => {
      const texto = String(ruta);
      if (texto.includes("cerebro")) return caso.cerebro ?? conjunto.cerebro;
      return definidas[texto.split("/").pop()] ?? "";
    },
  };
}

export async function ejecutarCaso(conjunto, caso) {
  const plan = armarPlan(conjunto, caso);
  const { aprobada, problemas } = await revisarPlan(plan, { semanaInicio: caso.semana ?? conjunto.semana, recursos: caso.recursos ?? {}, ...contextoDelCaso(conjunto, caso) });
  const faltan = caso.esperado.problemas_contienen.filter((texto) => !problemas.some((p) => p.includes(texto)));
  const motivos = [];
  if (aprobada !== caso.esperado.aprobada) motivos.push(`esperaba ${caso.esperado.aprobada ? "aprobar" : "rechazar"} y ${aprobada ? "aprobó" : "rechazó"}`);
  if (faltan.length) motivos.push(`no apareció: ${faltan.map((f) => `"${f}"`).join(", ")} (problemas: ${problemas.join(" | ") || "ninguno"})`);
  if (caso.esperado.aprobada && problemas.length) motivos.push(`aprobó con problemas: ${problemas.join(" | ")}`);
  return { id: caso.id, descripcion: caso.descripcion, ok: motivos.length === 0, motivos };
}

// Cada regla de marca tiene que tener al menos un caso que la dispare; si no, podrían borrarla sin que nada falle.
export function reglasSinCaso(conjunto) {
  const buscadas = conjunto.casos.filter((c) => !c.esperado.aprobada).flatMap((c) => c.esperado.problemas_contienen);
  return NOMBRES_DE_REGLAS.filter((regla) => !buscadas.some((texto) => texto.includes(regla)));
}

export async function ejecutarEvals(conjunto) {
  const resultados = [];
  for (const caso of conjunto.casos) resultados.push(await ejecutarCaso(conjunto, caso));
  return { resultados, sinCaso: reglasSinCaso(conjunto) };
}

export const RUTA_FRASES = new URL("./frases-por-regla.json", import.meta.url);
export const leerFrases = async () => JSON.parse(await readFile(RUTA_FRASES, "utf8"));

// Una frase por cada palabra de cada regla (para que no se pueda borrar una sin que algo falle),
// y frases comunes que no tienen que disparar nada (para cazar falsos positivos antes de que los vea el Estratega).
export function ejecutarFrases(frases) {
  const resultados = [];
  for (const [regla, lista] of Object.entries(frases.disparan)) {
    for (const frase of lista) {
      const ok = revisarReglas(frase).some((p) => p.regla === regla);
      resultados.push({ id: `${regla}: "${frase}"`, ok, motivos: ok ? [] : [`la regla "${regla}" no detectó esta frase`] });
    }
  }
  for (const frase of frases.no_disparan) {
    const problemas = revisarReglas(frase);
    resultados.push({ id: `no debe disparar: "${frase}"`, ok: problemas.length === 0, motivos: problemas.map((p) => `disparó "${p.regla}" ("${p.fragmento}")`) });
  }
  return resultados;
}

export const leerConjunto = async () => JSON.parse(await readFile(RUTA_CASOS, "utf8"));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const evaluados = await ejecutarEvals(await leerConjunto());
  const { sinCaso } = evaluados;
  const resultados = [...evaluados.resultados, ...ejecutarFrases(await leerFrases())];
  for (const r of resultados) {
    console.log(`${r.ok ? "✔" : "✘"} ${r.id}`);
    for (const motivo of r.motivos) console.log(`    - ${motivo}`);
  }
  const aprobados = resultados.filter((r) => r.ok).length;
  console.log(`\n${aprobados} de ${resultados.length} casos bien (${Math.round((aprobados / resultados.length) * 100)}%).`);
  if (sinCaso.length) console.log(`Reglas sin ningún caso que las dispare: ${sinCaso.join(", ")}`);
  process.exit(aprobados === resultados.length && sinCaso.length === 0 ? 0 : 1);
}
