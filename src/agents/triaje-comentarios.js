// Ordena los comentarios que recibe @vow_ar para saber a cuáles contestar primero. Solo clasifica: no responde nada.
// Inspirado en el triaje de "ig-reply" de Instagram Agent Skill (Jake Schincariol, MIT), reescrito para VOW:
// una consulta de precio, stock o envío es una oportunidad de venta ("consulta") y una duda que repiten varios es material de contenido.
//
// Categorías, de la más a la menos urgente:
//   consulta   quiere comprar o saber algo concreto (precio, stock, talle, envío, cuándo sale, dónde comprar)
//   pregunta   hace una pregunta que no es de compra
//   aporte     escribió algo largo y pensado
//   apoyo      un elogio o reacción corta
//   ruido      spam, enlaces o texto sin contenido

const CONSULTA = /(?<!\p{L})(precio|cu[aá]nto (sale|cuesta|est[aá])|valor|stock|queda(n)?|hay (stock|disponible)|talle|medidas?|env[ií]os?|env[ií]an|mandan|llega(n)?|retiro|c[oó]mo (compro|puedo comprar|hago para comprar)|d[oó]nde (compro|lo consigo|se compra)|cu[aá]ndo (sale|sal[ei]|lanz|abren|hay)|lista de espera|c[oó]digo|descuento|link|reservar)(?!\p{L})/iu;
const SPAM = /https?:\/\/|www\.|\.com\b|ganá dinero|seguidores gratis|sorteo falso|escrib[ií]me al privado para/i;
const SOLO_SIMBOLOS = /^[\s\p{Extended_Pictographic}\p{P}\p{S}\d]*$/u;

const palabras = (t) => (String(t).match(/[\p{L}\p{N}]+/gu) ?? []).length;

export function clasificarComentario(texto) {
  const t = String(texto ?? "").trim();
  if (!t || SOLO_SIMBOLOS.test(t)) return t ? "apoyo" : "ruido";
  if (SPAM.test(t)) return "ruido";
  if (CONSULTA.test(t)) return "consulta";
  if (/[?¿]/.test(t)) return "pregunta";
  if (palabras(t) >= 25) return "aporte";
  return "apoyo";
}

const ORDEN = ["consulta", "pregunta", "aporte", "apoyo", "ruido"];

// Devuelve los comentarios con su categoría, de lo más urgente a lo menos, y el conteo por categoría
export function triarComentarios(comentarios) {
  const lista = (Array.isArray(comentarios) ? comentarios : []).map((c) => ({ ...c, categoria: clasificarComentario(c?.text ?? c?.texto) }));
  const conteo = Object.fromEntries(ORDEN.map((c) => [c, lista.filter((x) => x.categoria === c).length]));
  lista.sort((a, b) => ORDEN.indexOf(a.categoria) - ORDEN.indexOf(b.categoria));
  return { conteo, comentarios: lista };
}

// Cómo contestar, según la categoría (lo ve quien responde; la respuesta la escribe y la confirma una persona)
export const GUIA_DE_RESPUESTA = {
  consulta: "Respondé en público con el dato concreto y, si hace falta, invitá a la lista de espera. Nunca mandes mensajes privados a quien no comentó.",
  pregunta: "Contestá lo que preguntó. Si la repiten varios, es una idea para una pieza.",
  aporte: "Es el comentario que más merece respuesta: que sea la más larga del hilo.",
  apoyo: "Alcanza con un me gusta o 3 a 8 palabras.",
  ruido: "No respondas. Si es abusivo, ocultalo.",
};
