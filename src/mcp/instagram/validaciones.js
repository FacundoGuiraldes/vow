// Controles antes de tocar la cuenta: reglas de marca sobre el texto, formato de las direcciones de los
// archivos y de los IDs. Todo lo que se publica pasa por acá; si algo falla, no se llama a Meta.
import { cifrasNoPermitidas, revisarReglas, revisarTextoAlPublico } from "../../agents/reglas-marca.js";

// Límites de Instagram para el texto de una publicación
export const LARGO_MAXIMO_TEXTO = 2200;
export const HASHTAGS_MAXIMOS = 30;
export const ITEMS_CARRUSEL = { minimo: 2, maximo: 20 };

// Problemas de un texto que va a ver el público (epígrafe o respuesta), con las mismas reglas que las piezas
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

// Meta descarga el archivo desde la dirección: tiene que ser pública y por https
export function validarUrlPublica(url) {
  let direccion;
  try {
    direccion = new URL(url);
  } catch {
    throw new Error(`La dirección no es válida: "${url}".`);
  }
  if (direccion.protocol !== "https:") throw new Error(`La dirección tiene que empezar con https://: "${url}".`);
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.)/.test(direccion.hostname) || !direccion.hostname.includes(".")) {
    throw new Error(`La dirección no es pública (Meta no puede descargarla): "${url}".`);
  }
  return direccion.toString();
}

// IDs de Meta: solo dígitos. Evita que un valor raro arme otra ruta de la API ("123/../otra-cosa").
export function validarId(id, nombre = "ID") {
  if (typeof id !== "string" || !/^\d{1,30}$/.test(id)) throw new Error(`${nombre} inválido: "${id}".`);
  return id;
}
