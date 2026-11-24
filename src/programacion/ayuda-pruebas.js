// Piezas de apoyo para los tests del bot: un flujo de ejemplo, un Telegram falso (anota lo que se le pidió)
// y un reloj que se mueve a mano. Ningún test toca la red ni la base.
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearServicio } from "./servicio.js";

export const CHAT = 42;

export const crearDia = (extra = {}) => ({
  fecha: "2026-10-30",
  formato: "reel",
  contenido: "Un plano continuo de alguien atándose el cordón antes de salir a entrenar, sin cara y sin producto.",
  ...extra,
});

export const crearPlan = (dias = [crearDia()]) => ({ dias });

export function crearTelegramFalso() {
  const enviados = [];
  let siguiente = 100;
  return {
    chatId: String(CHAT),
    enviados,
    async enviarMensaje(texto, opciones = {}) {
      const id = siguiente++;
      enviados.push({ id, texto, ...opciones });
      return id;
    },
    async escribiendo() {},
    async enviarA(destino, texto) {
      enviados.push({ destino, texto });
    },
    ultimo: () => enviados.at(-1),
    textos: () => enviados.map((e) => e.texto),
  };
}

// Escenario completo: servicio + repositorio en memoria + Telegram falso + reloj manual
export function crearEscenario({ fecha = "2026-10-26", hora = "08:00", llm = null, descuentos = null, investigacion = undefined } = {}) {
  const reloj = { fecha, hora };
  const repo = crearRepositorioMemoria();
  const telegram = crearTelegramFalso();
  const servicio = crearServicio({ repo, telegram, llm, descuentos, ahora: () => ({ ...reloj }), ...(investigacion ? { investigacion } : {}) });
  let mensajeEntrante = 5000;
  const texto = (t, { chat = CHAT } = {}) => ({ message: { message_id: mensajeEntrante++, chat: { id: chat }, text: t } });
  return { reloj, repo, telegram, servicio, texto, mandar: (cuerpo) => servicio.manejarActualizacion(cuerpo) };
}
