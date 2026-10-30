// Botón de arrepentimiento (Resolución 424/2020 de la Secretaría de Comercio Interior; art. 34 de la Ley 24.240).
// Quien compró por la web pide revocar la compra sin registrarse ni hacer otro trámite. Se le da un código de arrepentimiento
// en el mismo momento y por el mismo medio (dentro del plazo de 24 horas que pide la norma) y se avisa a VOW por Telegram.
import { randomInt } from "node:crypto";

const CLAVE = "arrepentimientos";
const MAX_REGISTROS = 500;
const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ErrorArrepentimiento extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const texto = (v, largo) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, largo);

let cola = Promise.resolve();
const enCola = (trabajo) => {
  const turno = cola.then(trabajo);
  cola = turno.catch(() => {});
  return turno;
};

export function crearArrepentimientos({ repo, avisar = null, ahora = () => Date.now() }) {
  return {
    async registrar(cuerpo) {
      const nombre = texto(cuerpo?.nombre, 80);
      const email = texto(cuerpo?.email, 120).toLowerCase();
      const pedido = texto(cuerpo?.pedido, 40);
      if (nombre.length < 2) throw new ErrorArrepentimiento("Escribí tu nombre y apellido.");
      if (!FORMATO_EMAIL.test(email)) throw new ErrorArrepentimiento("Escribí el mail con el que compraste.");
      const registro = await enCola(async () => {
        const estado = (await repo.leerEstado(CLAVE)) ?? {};
        const lista = Array.isArray(estado.registros) ? estado.registros : [];
        let codigo;
        do codigo = `ARR-${Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join("")}`; while (lista.some((r) => r.codigo === codigo));
        const nuevo = { codigo, nombre, email, pedido: pedido || null, fecha: new Date(ahora()).toISOString() };
        await repo.guardarEstado(CLAVE, { registros: [...lista, nuevo].slice(-MAX_REGISTROS) });
        return nuevo;
      });
      if (avisar) {
        try {
          await avisar(`Botón de arrepentimiento\nCódigo: ${registro.codigo}\nNombre: ${registro.nombre}\nMail: ${registro.email}\nPedido: ${registro.pedido ?? "no indicó"}\nHay que contestarle y coordinar la devolución.`);
        } catch (error) {
          console.error(`No se pudo avisar por Telegram del arrepentimiento ${registro.codigo}: ${error.message}`);
        }
      }
      return { codigo: registro.codigo, fecha: registro.fecha };
    },
  };
}
