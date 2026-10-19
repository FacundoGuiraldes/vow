// Orquestador: ejecuta una lista de pasos en orden y se frena donde hace falta una persona.
// No sabe nada de Instagram ni de Claude: solo ordena pasos, guarda lo que hicieron y cuenta el gasto.
// Es una función pura: no lee ni escribe archivos (eso lo hace quien lo llama), así se puede probar sin red.
//
// Un paso es { nombre, correr(contexto) } o { nombre, tipo: "aprobacion" }.
//   correr devuelve { ok = true, salida, uso, errores }:
//     - salida: lo que produjo (lo reciben los pasos siguientes en contexto.salidas[nombre]),
//     - uso: { entrada, salida } tokens gastados (aunque el paso falle, la plata ya se gastó),
//     - ok: false si el paso no logró lo que debía (se frena el flujo y se guardan los errores).
//
// El registro es el estado compartido: qué pasos terminaron, qué salió de cada uno, quién aprobó y cuánto se gastó.
// Si se vuelve a ejecutar con el mismo registro, los pasos que ya terminaron no se repiten.

export const PRECIO_USD_POR_MILLON = { entrada: 2, salida: 10 }; // claude-sonnet-5-5

export const costoUSD = (uso = {}) =>
  ((uso.entrada ?? 0) * PRECIO_USD_POR_MILLON.entrada + (uso.salida ?? 0) * PRECIO_USD_POR_MILLON.salida) / 1_000_000;

export const registroNuevo = (semana) => ({
  semana,
  pasos: {},
  aprobaciones: {},
  gasto: { entrada: 0, salida: 0 }, // acumulado de todas las corridas, incluidas las que fallaron
});

export function aprobar(registro, nombre) {
  return { ...registro, aprobaciones: { ...registro.aprobaciones, [nombre]: true } };
}

// Borra lo hecho desde un paso en adelante (incluidas las aprobaciones) para rehacerlo.
// La aprobación de un plan viejo no puede valer para un plan nuevo.
export function rehacerDesde(registro, pasos, nombre) {
  const indice = pasos.findIndex((p) => p.nombre === nombre);
  if (indice === -1) throw new Error(`No existe el paso "${nombre}". Pasos: ${pasos.map((p) => p.nombre).join(", ")}.`);
  const borrar = new Set(pasos.slice(indice).map((p) => p.nombre));
  const quedan = (objeto) => Object.fromEntries(Object.entries(objeto).filter(([clave]) => !borrar.has(clave)));
  return { ...registro, pasos: quedan(registro.pasos), aprobaciones: quedan(registro.aprobaciones) };
}

// Devuelve { estado, registro, esperando?, fallo? }
//   estado: "completo" | "esperando-aprobacion" | "error"
export async function ejecutarFlujo({ pasos, registro, contexto = {}, ahora = () => new Date() }) {
  let actual = { ...registro, pasos: { ...registro.pasos }, gasto: { ...registro.gasto } };
  const salidas = {};

  for (const paso of pasos) {
    const previo = actual.pasos[paso.nombre];
    if (previo?.estado === "ok") {
      salidas[paso.nombre] = previo.salida;
      continue;
    }

    if (paso.tipo === "aprobacion") {
      if (actual.aprobaciones[paso.nombre] === true) {
        actual.pasos[paso.nombre] = { estado: "ok", salida: { aprobado: true }, fin: ahora().toISOString() };
        salidas[paso.nombre] = { aprobado: true };
        continue;
      }
      actual.pasos[paso.nombre] = { estado: "esperando", inicio: ahora().toISOString() };
      return { estado: "esperando-aprobacion", registro: actual, esperando: paso.nombre };
    }

    const inicio = ahora().toISOString();
    let resultado;
    try {
      resultado = (await paso.correr({ ...contexto, salidas })) ?? {};
    } catch (error) {
      resultado = { ok: false, errores: [error.message] }; // una excepción no tira el flujo: queda registrada
    }

    const uso = { entrada: resultado.uso?.entrada ?? 0, salida: resultado.uso?.salida ?? 0 };
    actual.gasto = { entrada: actual.gasto.entrada + uso.entrada, salida: actual.gasto.salida + uso.salida };

    if (resultado.ok === false) {
      actual.pasos[paso.nombre] = { estado: "error", errores: resultado.errores ?? [], uso, inicio, fin: ahora().toISOString() };
      return { estado: "error", registro: actual, fallo: paso.nombre };
    }
    actual.pasos[paso.nombre] = { estado: "ok", salida: resultado.salida, uso, inicio, fin: ahora().toISOString() };
    salidas[paso.nombre] = resultado.salida;
  }

  return { estado: "completo", registro: actual };
}
