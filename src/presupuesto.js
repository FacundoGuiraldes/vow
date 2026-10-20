// Tope mensual de gasto: cada llamada paga a la IA se anota en un libro, y si el mes ya llegó al tope, la siguiente se corta
// ANTES de hacerse (no gasta nada). Funciona con cualquier comando de pago (semana, plan, analizar, evals online) porque
// envuelve al cliente de la IA: los agentes no se enteran.
//
// Límite honesto: el libro vive en el equipo donde se corre (docs/gasto/, no se sube a git). Si corrés en dos lugares,
// cada uno cuenta lo suyo. El tope DURO de verdad es el límite de gasto de la consola de Anthropic: este es el freno de mano.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { costoUSD } from "./orquestador/orquestador.js";

export const TOPE_MENSUAL_USD_POR_DEFECTO = 5;
export const AVISAR_DESDE = 0.8; // avisa una vez cuando el mes pasa del 80% del tope

export class ErrorPresupuesto extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.name = "ErrorPresupuesto";
    this.estado = estado;
  }
}

// El mes se cuenta con la hora de Argentina: una llamada a las 22 hs del 31 es de ese mes, aunque en UTC ya sea el 1.
export const mesDe = (fecha) => fecha.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7);

export const libroNuevo = () => ({ movimientos: [] });

export const gastoDelMes = (libro, mes) => libro.movimientos.filter((m) => m.mes === mes).reduce((suma, m) => suma + m.costoUSD, 0);

// Devuelve un libro nuevo (no modifica el que recibe)
export function registrarMovimiento(libro, { fecha, origen, uso }) {
  const movimiento = { fecha: fecha.toISOString(), mes: mesDe(fecha), origen, entrada: uso.entrada, salida: uso.salida, costoUSD: costoUSD(uso) };
  return { ...libro, movimientos: [...libro.movimientos, movimiento] };
}

export function estadoDelMes(libro, { mes, topeUSD }) {
  const gastado = gastoDelMes(libro, mes);
  return { mes, topeUSD, gastado, restante: Math.max(0, topeUSD - gastado), agotado: gastado >= topeUSD };
}

// El tope se cambia con la variable TOPE_MENSUAL_USD del .env; si no está, vale el de por defecto
export function topeDesdeEntorno(env = process.env) {
  const crudo = env.TOPE_MENSUAL_USD;
  if (crudo === undefined || crudo === "") return TOPE_MENSUAL_USD_POR_DEFECTO;
  const numero = Number(crudo);
  if (!Number.isFinite(numero) || numero <= 0) throw new Error(`TOPE_MENSUAL_USD tiene que ser un número mayor que 0 (vale "${crudo}").`);
  return numero;
}

const usd = (n) => `US$ ${n.toFixed(2)}`;

// Devuelve algo con la forma del cliente (`messages.create`) que controla el tope y anota el gasto de cada llamada.
export function conPresupuesto(cliente, { origen, topeUSD, leerLibro, guardarLibro, ahora = () => new Date(), avisar = console.warn }) {
  return {
    messages: {
      create: async (...argumentos) => {
        const mes = mesDe(ahora());
        const antes = estadoDelMes(await leerLibro(), { mes, topeUSD });
        if (antes.agotado) {
          throw new ErrorPresupuesto(
            `Tope mensual alcanzado: llevás ${usd(antes.gastado)} de ${usd(topeUSD)} en ${mes}. No se hizo la llamada. Subí TOPE_MENSUAL_USD en el .env si querés seguir.`,
            antes,
          );
        }

        const respuesta = await cliente.messages.create(...argumentos);

        // Desde acá la plata ya se gastó: pase lo que pase, la respuesta no se pierde
        const uso = { entrada: respuesta.usage?.input_tokens ?? 0, salida: respuesta.usage?.output_tokens ?? 0 };
        try {
          // Se vuelve a leer el libro: otro comando pudo haber anotado gasto mientras esperábamos a la IA
          const libro = registrarMovimiento(await leerLibro(), { fecha: ahora(), origen, uso });
          await guardarLibro(libro);
          const despues = estadoDelMes(libro, { mes, topeUSD });
          const umbral = topeUSD * AVISAR_DESDE;
          if (antes.gastado < umbral && despues.gastado >= umbral) {
            avisar(`Atención: llevás ${usd(despues.gastado)} de ${usd(topeUSD)} del tope de ${mes} (${Math.round((despues.gastado / topeUSD) * 100)}%).`);
          }
        } catch (error) {
          avisar(`No se pudo anotar el gasto de esta llamada en el libro (${error.message}): el total del mes puede estar por debajo del real.`);
        }
        return respuesta;
      },
    },
  };
}

// El libro en un archivo JSON. Si todavía no existe, arranca vacío.
export function libroEnDisco(ruta) {
  const archivo = ruta instanceof URL ? fileURLToPath(ruta) : ruta;
  return {
    leer: async () => {
      try {
        return JSON.parse(await readFile(archivo, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return libroNuevo();
        throw error;
      }
    },
    guardar: async (libro) => {
      await mkdir(dirname(archivo), { recursive: true });
      await writeFile(archivo, JSON.stringify(libro, null, 2) + "\n");
    },
  };
}
