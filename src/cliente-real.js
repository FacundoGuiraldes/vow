// El cliente de Claude que usan todos los comandos de pago: ya viene con el tope mensual puesto.
// Los comandos con --simulado no pasan por acá (no gastan).
import { ErrorPresupuesto, conPresupuesto, libroEnDisco, topeDesdeEntorno } from "./presupuesto.js";

export const RUTA_LIBRO = new URL("../docs/gasto/libro.json", import.meta.url);

// `origen` es el nombre del comando ("semana", "plan", "analizar", "evals-online"): queda anotado en cada movimiento
export async function crearClienteReal(origen, { env = process.env } = {}) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { leer, guardar } = libroEnDisco(RUTA_LIBRO);
  return conPresupuesto(new Anthropic(), { origen, topeUSD: topeDesdeEntorno(env), leerLibro: leer, guardarLibro: guardar });
}

// Para los comandos de la terminal: si lo que falló es el tope mensual, muestra solo el mensaje claro y sale
// (en vez de un error con 30 líneas de pila). Cualquier otro error sigue su camino.
export async function corteLimpio(promesa, { salir = (codigo) => process.exit(codigo), escribir = console.error } = {}) {
  try {
    return await promesa;
  } catch (error) {
    if (!(error instanceof ErrorPresupuesto)) throw error;
    escribir(error.message);
    return salir(1);
  }
}
