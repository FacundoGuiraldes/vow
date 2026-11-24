// Controles antes de tocar la cuenta: reglas de marca sobre el texto y formato de los IDs.
// Toda respuesta pública pasa por acá; si algo falla, no se llama a Meta.
import { cifrasNoPermitidas, revisarReglas, revisarTextoAlPublico } from "../../agents/reglas-marca.js";

// Límites de Instagram para el texto público
export const LARGO_MAXIMO_TEXTO = 2200;
export const HASHTAGS_MAXIMOS = 30;

// Problemas de un texto que va a ver el público (una respuesta a un comentario), con las reglas de la marca
export function revisarTextoPublico(texto) {
  if (typeof texto !== "string" || texto.trim() === "") return ["El texto está vacío."];
  const problemas = [
    ...revisarReglas(texto),
    ...revisarTextoAlPublico(texto),
    ...cifrasNoPermitidas(texto).map((cifra) => ({ regla: "cifra que no está en los datos", fragmento: cifra })),
  ].map(({ regla, fragmento }) => `${regla} ("${fragmento}")`);

  if (texto.length > LARGO_MAXIMO_TEXTO) problemas.push(`supera los ${LARGO_MAXIMO_TEXTO} caracteres de Instagram`);
  const hashtags = texto.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (hashtags.length > HASHTAGS_MAXIMOS) problemas.push(`tiene ${hashtags.length} hashtags (Instagram admite hasta ${HASHTAGS_MAXIMOS})`);
  return problemas;
}

// IDs de Meta: solo dígitos. Evita que un valor raro arme otra ruta de la API ("123/../otra-cosa").
export function validarId(id, nombre = "ID") {
  if (typeof id !== "string" || !/^\d{1,30}$/.test(id)) throw new Error(`${nombre} inválido: "${id}".`);
  return id;
}
