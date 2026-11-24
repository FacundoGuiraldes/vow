// Textos de los mensajes de Telegram. Son funciones puras: reciben datos y devuelven texto, así se prueban sin red.
// Todo va en texto plano (sin Markdown) para que ningún carácter del contenido rompa el mensaje.
import { LIMITE_MENSAJE } from "./telegram.js";
import { fechaLegible } from "./fechas.js";

const recortar = (texto, maximo) => (texto.length > maximo ? `${texto.slice(0, maximo - 1).trimEnd()}…` : texto);

export const FORMATOS_LEGIBLES = { reel: "Reel", carrusel: "Carrusel", imagen: "Imagen", story: "Story" };

// El flujo de la semana: por cada día, qué se publica y de qué trata. Nada más.
export function textoFlujoSemanal({ semana, dias }) {
  const lineas = [...dias]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => `• ${fechaLegible(d.fecha)} · ${FORMATOS_LEGIBLES[d.formato] ?? d.formato}\n  ${d.contenido}`);
  return recortar([`📅 Flujo de la semana del ${fechaLegible(semana)}`, lineas.join("\n\n")].join("\n\n"), LIMITE_MENSAJE - 100);
}
