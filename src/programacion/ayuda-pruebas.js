// Piezas de apoyo para los tests de la oficina: un flujo de ejemplo y un escenario con repositorio en memoria y reloj manual.
// Ningún test toca la red ni la base.
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearServicio } from "./servicio.js";

export const crearDia = (extra = {}) => ({
  fecha: "2026-10-30",
  formato: "reel",
  contenido: "Un plano continuo de alguien atándose el cordón antes de salir a entrenar, sin cara y sin producto.",
  ...extra,
});

export const crearPlan = (dias = [crearDia()]) => ({ dias });

// Escenario completo: servicio + repositorio en memoria + reloj manual
export function crearEscenario({ fecha = "2026-10-26", hora = "08:00", llm = null, descuentos = null, investigacion = undefined } = {}) {
  const reloj = { fecha, hora };
  const repo = crearRepositorioMemoria();
  const servicio = crearServicio({ repo, llm, descuentos, ahora: () => ({ ...reloj }), ...(investigacion ? { investigacion } : {}) });
  return { reloj, repo, servicio };
}
