// Códigos de descuento de un solo uso, uno por persona de la lista de espera.
//   asegurarCodigos  crea el código de cada email (si ya tenía, devuelve el mismo)
//   validar          dice si un código se puede usar y cuánto descuenta
//   reservar         lo aparta mientras alguien paga, para que dos pedidos no usen el mismo
//   consumir         lo marca como usado cuando el pago se aprueba
// El estado vive en la misma base que el resto del sistema (repo.leerEstado / guardarEstado).
import { randomInt } from "node:crypto";

const CLAVE = "descuentos";
const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin I, L, O, 0, 1: no se confunden al copiarlas
const HORAS_RESERVA = 2;

export class ErrorCodigo extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

// "vow-k7p2q9", "VOW K7P2Q9" y "K7P2Q9" son el mismo código
export const normalizarCodigo = (texto) => {
  const limpio = String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpio.length === 9 && limpio.startsWith("VOW") ? limpio.slice(3) : limpio;
};
export const formatoCodigo = (cuerpo) => `VOW-${cuerpo}`;
const generar = () => Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join("");

let cola = Promise.resolve();
const enCola = (trabajo) => {
  const turno = cola.then(trabajo);
  cola = turno.catch(() => {});
  return turno;
};

async function leer(repo) {
  const g = await repo.leerEstado(CLAVE);
  return { codigos: g && typeof g.codigos === "object" && g.codigos ? g.codigos : {} };
}
const guardar = (repo, estado) => repo.guardarEstado(CLAVE, estado);

export function crearGestorCodigos({ repo, ahora = () => Date.now() }) {
  return {
    // emails: lista de emails. Devuelve { email: { codigo: "VOW-XXXXXX", vence } }. Los que ya tenían código lo conservan (con su vencimiento).
    asegurarCodigos: ({ emails, porcentaje, venceEn }) => enCola(async () => {
      const estado = await leer(repo);
      const porEmail = new Map(Object.entries(estado.codigos).map(([cuerpo, c]) => [c.email, cuerpo]));
      const resultado = {};
      let cambio = false;
      for (const email of emails) {
        let cuerpo = porEmail.get(email);
        if (!cuerpo) {
          do cuerpo = generar(); while (estado.codigos[cuerpo]);
          estado.codigos[cuerpo] = { email, porcentaje, creado: new Date(ahora()).toISOString(), vence: venceEn ?? null };
          porEmail.set(email, cuerpo);
          cambio = true;
        }
        resultado[email] = { codigo: formatoCodigo(cuerpo), vence: estado.codigos[cuerpo].vence };
      }
      if (cambio) await guardar(repo, estado);
      return resultado;
    }),

    marcarEnviado: (email, cuando = ahora()) => enCola(async () => {
      const estado = await leer(repo);
      const cuerpo = Object.keys(estado.codigos).find((k) => estado.codigos[k].email === email);
      if (!cuerpo) return;
      estado.codigos[cuerpo].enviado = new Date(cuando).toISOString();
      await guardar(repo, estado);
    }),

    // Cuántos hay y en qué estado, sin mostrar los códigos
    resumen: async () => {
      const { codigos } = await leer(repo);
      const lista = Object.values(codigos);
      return { total: lista.length, enviados: lista.filter((c) => c.enviado).length, usados: lista.filter((c) => c.usadoPor).length };
    },

    emailsConEnvio: async () => {
      const { codigos } = await leer(repo);
      return new Set(Object.values(codigos).filter((c) => c.enviado).map((c) => c.email));
    },

    // Devuelve { porcentaje } o lanza ErrorCodigo con un mensaje para mostrarle a quien compra
    validar: async (codigo, { pedidoId = null } = {}) => {
      const cuerpo = normalizarCodigo(codigo);
      const { codigos } = await leer(repo);
      return revisar(codigos[cuerpo], ahora(), pedidoId);
    },

    reservar: (codigo, pedidoId) => enCola(async () => {
      const cuerpo = normalizarCodigo(codigo);
      const estado = await leer(repo);
      const c = estado.codigos[cuerpo];
      const { porcentaje } = revisar(c, ahora(), pedidoId);
      c.reservadoPor = pedidoId;
      c.reservadoHasta = new Date(ahora() + HORAS_RESERVA * 3600_000).toISOString();
      await guardar(repo, estado);
      return { porcentaje };
    }),

    liberar: (codigo, pedidoId) => enCola(async () => {
      const estado = await leer(repo);
      const c = estado.codigos[normalizarCodigo(codigo)];
      if (c && c.reservadoPor === pedidoId && !c.usadoPor) {
        delete c.reservadoPor;
        delete c.reservadoHasta;
        await guardar(repo, estado);
      }
    }),

    consumir: (codigo, pedidoId) => enCola(async () => {
      const estado = await leer(repo);
      const c = estado.codigos[normalizarCodigo(codigo)];
      if (!c || c.usadoPor) return false;
      c.usadoPor = pedidoId;
      c.usadoEn = new Date(ahora()).toISOString();
      delete c.reservadoPor;
      delete c.reservadoHasta;
      await guardar(repo, estado);
      return true;
    }),
  };
}

function revisar(c, ahoraMs, pedidoId) {
  if (!c) throw new ErrorCodigo("Ese código no existe. Revisá que esté bien escrito.");
  if (c.usadoPor) throw new ErrorCodigo("Ese código ya se usó.");
  if (c.vence && Date.parse(c.vence) < ahoraMs) throw new ErrorCodigo("Ese código venció.");
  if (c.reservadoPor && c.reservadoPor !== pedidoId && Date.parse(c.reservadoHasta) > ahoraMs) throw new ErrorCodigo("Ese código se está usando en otro pedido. Probá de nuevo en un rato.", 409);
  return { porcentaje: c.porcentaje };
}
