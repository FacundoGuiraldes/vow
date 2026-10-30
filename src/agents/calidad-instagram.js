// Control de calidad de lo que se publica en Instagram: revisa el gancho y el epígrafe de una pieza y avisa, sin cambiar nada.
// La persona sigue decidiendo: estos avisos se muestran en Telegram y en VOW HQ junto a la pieza, pero nunca aprueban ni frenan una publicación.
//
// Inspirado en las herramientas de "Instagram Agent Skill" (Jake Schincariol, licencia MIT):
//   https://github.com/Jakeschincariol/instagram-agent-skill
// No es una copia: las reglas están reescritas para español rioplatense y para las reglas de VOW (sin urgencia falsa,
// sin cifras inventadas). Se tomó la idea de puntuar el gancho en varios ejes, el linter de epígrafe (primeros 125
// caracteres, hashtags, enlaces, un solo pedido) y el detector de "huellas de IA" (caracteres invisibles, rayas largas, muletillas).

const LIMITE_EPIGRAFE = 2200;
const VISIBLE = 125; // lo que se ve del epígrafe en el feed antes del "más"
const MAXIMO_HASHTAGS = 5;

const HASHTAGS_GENERICOS = new Set(["#viral", "#fyp", "#explore", "#explorepage", "#explorar", "#foryou", "#foryoupage", "#parati", "#paratii", "#trending", "#tendencia", "#instagood", "#love", "#follow", "#like4like", "#reels", "#reelsinstagram", "#viralreels", "#instadaily"]);

// Muletillas típicas de texto escrito en piloto automático. Se avisa, no se reemplaza.
const MULETILLAS = [
  "en el mundo actual", "en la era digital", "en el vertiginoso mundo", "hoy en día", "sin lugar a dudas", "cabe destacar", "es importante destacar", "vale la pena mencionar",
  "en resumen", "en conclusión", "sumergite", "sumergirse", "llevá al siguiente nivel", "llevalo al siguiente nivel", "desbloqueá", "potenciá", "revolucioná",
  "transformador", "revolucionario", "innovador", "imprescindible", "descubrí cómo", "el secreto de", "no te lo podés perder", "no te lo pierdas",
  "dejá tu comentario", "dejame tu comentario", "etiquetá a alguien", "etiquetá a esa persona", "seguinos para más", "seguime para más", "doble tap", "compartilo con alguien que lo necesite",
  "¿estás de acuerdo?", "¿qué opinás?", "spoiler alert", "stop scrolling", "dejá de scrollear",
];

const INVISIBLES = /[​-‏⁠⁣﻿­᠎؜     ]|[\u{E0000}-\u{E007F}]/gu;
const NUMERO = /\$\s?\d|\b\d[\d.,]*\b/;
const MAYUSCULA_PROPIA = /(?<![.!?¿¡]\s)(?<!^)(?<!\n)\b\p{Lu}[\p{L}]{2,}/u;
const PRODUCTOS = /(?<!\p{L})(gorras?|shakers?|medias?|straps?|grips?|drop|vow|hq)(?!\p{L})/iu;

const PEDIDOS = [
  /(?<!\p{L})coment[aá](?!\p{L})/iu, /(?<!\p{L})(escrib[ií]me|mandame|escribinos|mandanos)(?!\p{L})/iu, /\bDM\b|mensaje directo/i,
  /(?<!\p{L})guard[aá](lo|la)?(?!\p{L})/iu, /(?<!\p{L})compart[ií](lo|la)?(?!\p{L})/iu, /(?<!\p{L})(seguinos|seguime|segu[ií])(?!\p{L})/iu,
  /link en (la )?(bio|biograf[ií]a)/i, /(?<!\p{L})(desliz[aá]|deslizar)(?!\p{L})/iu, /(?<!\p{L})(contame|decime|contanos)(?!\p{L})/iu,
];

const palabras = (t) => (String(t).match(/[\p{L}\p{N}$%'’-]+/gu) ?? []);
const acotar = (n) => Math.max(0, Math.min(100, Math.round(n)));
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------- Gancho: cuatro ejes de 0 a 100 ----------
const SALUDOS = /^\s*(hola|buenas|buen[ií]simas|che|bueno|ey|hey|qu[eé] tal|bienvenid[oa]s?)(?!\p{L})/iu;
const PREAMBULO = /en este (video|reel)|hoy te (voy a )?(cuento|muestro|ense[nñ]o)|te voy a (mostrar|contar|ense[nñ]ar)/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const APERTURAS_DEBILES = /^\s*(bueno|entonces|o sea|osea|mir[aá]|escuch[aá]|b[aá]sicamente|la verdad|resulta que|hay (un|una|algo)|esto es|eso es|es que)(?!\p{L})/iu;
const IMPERATIVOS_VOS = /^\s*(prob[aá]|mir[aá]|guard[aá]|us[aá]|arm[aá]|sac[aá]|dej[aá]|segu[ií]|and[aá]|ten[eé]|pon[eé]|hac[eé]|eleg[ií]|llev[aá]|prepar[aá]|prend[eé]|apag[aá]|sum[aá]|cuid[aá])(?!\p{L})/iu;
const SEGUNDA_PERSONA = /(?<!\p{L})(vos|ten[eé]s|pod[eé]s|sab[eé]s|quer[eé]s|sos|te|tu|tus|tuyo|tuya)(?!\p{L})/iu;
const PRIMERA_PERSONA = /(?<!\p{L})(yo|mi|mis|nosotros|nuestro|nuestra|nuestros|nuestras|hicimos|hacemos|somos)(?!\p{L})/iu;

export function puntuarGancho(gancho) {
  const texto = String(gancho ?? "").trim();
  const ps = palabras(texto);
  const n = ps.length;
  const banderas = [];
  if (SALUDOS.test(texto)) banderas.push("arranca con un saludo");
  if (PREAMBULO.test(texto)) banderas.push("anuncia lo que va a pasar en vez de decirlo");
  if (/#\p{L}/u.test(texto)) banderas.push("tiene un hashtag");
  if (EMOJI.test(texto)) banderas.push("tiene un emoji");

  // Largo: de 3 a 12 palabras, y no más de 60 caracteres
  let largo = n >= 3 && n <= 12 ? 100 : n < 3 ? 100 - (3 - n) * 25 : 100 - (n - 12) * 11;
  if (texto.length > 60) largo -= 12;

  // Concreción: un número, un nombre propio o el nombre de un producto
  const aciertos = (texto.match(new RegExp(NUMERO, "g")) ?? []).length + (MAYUSCULA_PROPIA.test(texto) ? 1 : 0) + (PRODUCTOS.test(texto) ? 1 : 0);
  const concreto = aciertos === 0 ? 20 : acotar(55 + aciertos * 25);

  // Directo: lo importante en las primeras palabras, sin rodeos
  let directo = 100;
  if (APERTURAS_DEBILES.test(texto)) directo -= 35;
  if (n > 12) directo -= 15;

  // Voz: le habla a la persona (voseo) o dice "nosotros"
  const voz = IMPERATIVOS_VOS.test(texto) || SEGUNDA_PERSONA.test(texto) ? 100 : PRIMERA_PERSONA.test(texto) ? 70 : 40;

  const ejes = { largo: acotar(largo), concreto, directo: acotar(directo), voz };
  const valores = Object.values(ejes);
  const minimo = Math.min(...valores);
  const puntaje = acotar(media(valores) * 0.6 + minimo * 0.4 - 15 * banderas.length);
  const veredicto = puntaje >= 70 && minimo >= 55 && banderas.length === 0 ? "fuerte" : puntaje >= 50 ? "bien" : "flojo";
  const masBajo = Object.entries(ejes).sort((a, b) => a[1] - b[1])[0][0];
  return { puntaje, veredicto, ejes, banderas, masBajo };
}

// ---------- Epígrafe: lista de controles ----------
function huellasDeIA(texto) {
  const hallazgos = [];
  const invisibles = texto.match(INVISIBLES)?.length ?? 0;
  if (invisibles) hallazgos.push(`${invisibles} carácter(es) invisible(s)`);
  const rayas = texto.match(/—/g)?.length ?? 0;
  if (rayas >= 2) hallazgos.push(`${rayas} rayas largas (—)`);
  const bajas = texto.toLowerCase();
  const muletillas = MULETILLAS.filter((m) => bajas.includes(m));
  if (muletillas.length) hallazgos.push(`muletillas: ${muletillas.slice(0, 3).map((m) => `"${m}"`).join(", ")}`);
  // Oraciones todas del mismo largo (ritmo de máquina)
  const oraciones = texto.split(/[.!?¿¡\n]+/).map((o) => palabras(o).length).filter((l) => l > 2);
  if (oraciones.length >= 4) {
    const m = media(oraciones);
    const sd = Math.sqrt(media(oraciones.map((l) => (l - m) ** 2)));
    if (sd / m < 0.25) hallazgos.push("todas las oraciones miden casi lo mismo");
  }
  return hallazgos;
}

export function revisarEpigrafe(epigrafe, { palabrasClave = [] } = {}) {
  const texto = String(epigrafe ?? "");
  const limpio = texto.trim();
  const avisos = [];
  const agregar = (nivel, chequeo, mensaje) => avisos.push({ nivel, chequeo, mensaje });
  const visible = limpio.slice(0, VISIBLE);

  if (limpio.length > LIMITE_EPIGRAFE) agregar("fail", "largo", `Tiene ${limpio.length} caracteres y Instagram acepta ${LIMITE_EPIGRAFE}.`);
  const primera = limpio.split("\n")[0] ?? "";
  if (/^[#@]/.test(primera)) agregar("fail", "primera línea", "Empieza con # o @: la primera línea tiene que ser el gancho.");
  else if (primera.length > VISIBLE) agregar("warn", "primera línea", `La primera línea tiene ${primera.length} caracteres y en el feed se ven ${VISIBLE}: lo importante tiene que entrar antes.`);
  if (limpio && !NUMERO.test(visible) && !MAYUSCULA_PROPIA.test(visible) && !PRODUCTOS.test(visible)) agregar("warn", "gancho concreto", `En los primeros ${VISIBLE} caracteres no hay un dato, un nombre ni un producto.`);

  const etiquetas = limpio.match(/(?:^|\s)(#[\p{L}\p{N}_]+)/gu)?.map((t) => t.trim().toLowerCase()) ?? [];
  if (etiquetas.length > MAXIMO_HASHTAGS) agregar("fail", "hashtags", `Tiene ${etiquetas.length} hashtags y el máximo recomendado es ${MAXIMO_HASHTAGS}.`);
  const genericos = etiquetas.filter((t) => HASHTAGS_GENERICOS.has(t));
  if (genericos.length) agregar("warn", "hashtags", `Hashtags genéricos que no suman: ${genericos.join(" ")}.`);
  if (limpio.length > VISIBLE && etiquetas.some((t) => visible.toLowerCase().includes(t))) agregar("warn", "hashtags", "Hay un hashtag en la parte que se ve del epígrafe: van abajo del todo.");

  if (/https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|ar|co|io|net|org|ai|app|dev)\/\S*/i.test(limpio)) agregar("warn", "enlaces", "Los enlaces del epígrafe no se pueden tocar: el enlace va en la biografía.");

  const pedidos = PEDIDOS.filter((p) => p.test(limpio)).length;
  if (pedidos > 1) agregar("warn", "un solo pedido", `Hay ${pedidos} pedidos distintos (comentar, guardar, seguir...): elegí uno.`);

  if (palabrasClave.length) {
    const encontradas = palabrasClave.filter((k) => bajas(limpio).includes(bajas(k)));
    if (!encontradas.length) agregar("warn", "palabras clave", "Ninguna de las palabras clave de la pieza aparece en el epígrafe.");
  }

  const huellas = huellasDeIA(limpio);
  if (huellas.length) agregar("warn", "suena a texto automático", huellas.join("; ") + ".");

  const veredicto = avisos.some((a) => a.nivel === "fail") ? "arreglar" : avisos.length ? "revisar" : "listo";
  return { veredicto, avisos };
}
const bajas = (t) => String(t).toLowerCase();

// ---------- Pieza completa ----------
// Devuelve null si no hay nada para revisar. Nunca cambia la pieza.
export function revisarPieza(pieza) {
  if (!pieza || typeof pieza !== "object") return null;
  const tieneGancho = typeof pieza.gancho === "string" && pieza.gancho.trim() !== "";
  const tieneEpigrafe = typeof pieza.epigrafe === "string" && pieza.epigrafe.trim() !== "";
  if (!tieneGancho && !tieneEpigrafe) return null;
  const gancho = tieneGancho ? puntuarGancho(pieza.gancho) : null;
  const epigrafe = tieneEpigrafe ? revisarEpigrafe(pieza.epigrafe, { palabrasClave: Array.isArray(pieza.palabras_clave) ? pieza.palabras_clave.filter((k) => typeof k === "string") : [] }) : { veredicto: "listo", avisos: [] };
  const avisos = [...epigrafe.avisos];
  if (gancho && gancho.veredicto === "flojo") avisos.unshift({ nivel: "warn", chequeo: "gancho", mensaje: `El gancho puntúa ${gancho.puntaje}/100${gancho.banderas.length ? ` (${gancho.banderas.join(", ")})` : `; lo más flojo: ${NOMBRE_EJE[gancho.masBajo]}`}.` });
  const veredicto = avisos.some((a) => a.nivel === "fail") ? "arreglar" : avisos.length ? "revisar" : "listo";
  return { veredicto, gancho: gancho && { puntaje: gancho.puntaje, veredicto: gancho.veredicto, masBajo: gancho.masBajo }, avisos };
}
const NOMBRE_EJE = { largo: "el largo", concreto: "falta un dato, un nombre o un producto", directo: "va con rodeos", voz: "no le habla a la persona" };

// Una línea para Telegram
export function resumenCalidad(calidad) {
  if (!calidad) return "";
  if (calidad.veredicto === "listo") return calidad.gancho ? `✅ Revisión: sin avisos (gancho ${calidad.gancho.puntaje}/100).` : "✅ Revisión: sin avisos.";
  const lineas = calidad.avisos.slice(0, 4).map((a) => `• ${a.mensaje}`);
  return `🔎 Revisión (${calidad.veredicto}): ${calidad.avisos.length} aviso(s). Son sugerencias: decidís vos.\n${lineas.join("\n")}`;
}
