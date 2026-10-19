// Reglas duras de la marca, en código. Salen de docs/marca/cerebro-de-marca.md.
// Si una pieza rompe una regla, el plan se rechaza: no dependemos de que la IA "se acuerde".

const REGLAS = [
  // Motivación vacía
  { regla: "motivación vacía", patron: /sin excusas|tu mejor versi[oó]n|la mejor versi[oó]n de vos|nada es imposible/i },
  // Promesas de resultados físicos o de salud
  {
    regla: "promesa de resultados físicos",
    patron: /quem[aá]\w* grasa|gan[aá]\w* m[uú]sculo|baj[aá]\w* de peso|evit[aá]\w* (las )?lesion\w*|te hace m[aá]s fuerte|cuerpo so[nñ]ado/i,
  },
  // Urgencia o escasez falsa
  { regla: "urgencia falsa", patron: /[uú]ltimas unidades|solo hoy|no te lo pierdas|[uú]ltima chance|se agota ya/i },
  // Presumir
  { regla: "presumir", patron: /mostr[aá] tu f[ií]sico|modo bestia|\bcrack\b|\bbestia\b/i },
  // Inglés innecesario ("Drop" solo vale como "Drop 01", se revisa aparte)
  { regla: "inglés innecesario", patron: /\bgains?\b|\bgrind\b|no pain,? no gain|\baesthetic\b/i },
  // Voz que no es de vos: tú/usted y conjugaciones de "tú". Se usan límites con \p{L} porque \b
  // no reconoce letras con tilde (ú, é).
  {
    regla: "no está en voseo",
    patron: /(?<!\p{L})(tú|usted|ustedes|ud|tienes|puedes|eres|quieres|debes|hazlo)(?!\p{L})/iu,
  },
  // Anunciar lo que falta (descartado por Facundo): una marca no muestra que no tiene producto
  { regla: "anuncia lo que falta", patron: /todav[ií]a no (hay|tenemos|llega|lleg[oó]|existe)|no hay (prenda|producto|stock)\b/i },
  // Elementos del gimnasio (descartado por Facundo): nombrarlos suena forzado. Grips y straps son el producto y sí se pueden nombrar.
  {
    regla: "nombra elementos del gimnasio",
    patron: /(?<!\p{L})(barras?|mancuernas?|pesas?|kettlebells?|fierros?|hierros?|discos? de peso)(?!\p{L})/iu,
  },
  // La promesa es de uno consigo mismo, no un papel (corregido por Facundo)
  { regla: "promesa en papel", patron: /a mano|lapicera|birome|l[aá]piz|cartulina/i },
  // Cadenas de signos de exclamación
  { regla: "exceso de exclamaciones", patron: /!{2,}/ },
  // "Drop" suelto: solo se acepta "Drop 01"
  { regla: '"drop" fuera de "Drop 01"', patron: /\bdrops?\b(?!\s*0?1\b)/i },
];

const MAXIMO_EMOJIS = 1;

// Lo que ve la gente no explica la marca por dentro (paleta, tipografías, manual): le habla a quien mira.
// Estas palabras sí pueden aparecer en el guion, que son instrucciones de producción, pero no en lo que se publica.
const MARCA_POR_DENTRO = /paleta|tipograf[ií]a|unbounded|space (mono|grotesk)|manual de marca|gu[ií]a de estilo|identidad visual/i;

// Devuelve problemas para un texto que va a ver el público (gancho, texto en pantalla, epígrafe).
export function revisarTextoAlPublico(texto) {
  if (typeof texto !== "string") return [];
  const coincidencia = texto.match(MARCA_POR_DENTRO);
  return coincidencia ? [{ regla: "explica la marca por dentro", fragmento: coincidencia[0] }] : [];
}

// Devuelve una lista de problemas (vacía si el texto cumple las reglas).
export function revisarReglas(texto) {
  const problemas = [];
  if (typeof texto !== "string") return problemas;

  for (const { regla, patron } of REGLAS) {
    const coincidencia = texto.match(patron);
    if (coincidencia) problemas.push({ regla, fragmento: coincidencia[0] });
  }

  const emojis = texto.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emojis.length > MAXIMO_EMOJIS) {
    problemas.push({ regla: "demasiados emojis", fragmento: emojis.join("") });
  }
  return problemas;
}

const NUMERACION_DE_PARTES = /(?<!\p{L})(l[aá]minas?|slides?|stor(?:y|ies)|paso|pasos|escenas?|planos?|tomas?|pantallas?|frames?|p[aá]ginas?)\s+\d+(?:\s*(?:y|a|-|–)\s*\d+)?/giu;

// Regla "toda cifra que aparece existe en los datos cargados": cualquier número del texto
// tiene que estar en la lista de cifras permitidas (por defecto solo "01", de "Drop 01").
export function cifrasNoPermitidas(texto, permitidas = ["01"]) {
  if (typeof texto !== "string") return [];
  // Numerar las partes de una pieza ("Lámina 2", "Story 3", "Paso 1") no es una cifra de la marca
  const sinNumeracion = texto.replace(NUMERACION_DE_PARTES, "");
  const numeros = sinNumeracion.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numeros.filter((numero) => !permitidas.includes(numero));
}

// En el guion (instrucciones de producción) es válido nombrar algo para descartarlo:
// "No aparece papel ni lapicera" o "no se habla de lo que todavía no hay" no son una infracción.
// Solo se perdona en estas reglas, y solo si la oración tiene una negación aparte del fragmento marcado.
const REGLAS_PERDONABLES_EN_GUION = new Set(["promesa en papel", "anuncia lo que falta"]);
const NEGACION = /(?<!\p{L})(no|ni|sin|nunca|evitar)(?!\p{L})/iu;

function oracionNegada(texto, fragmento) {
  const oracion = texto.split(/(?<=[.!?;:])\s+/).find((o) => o.toLowerCase().includes(fragmento.toLowerCase()));
  if (!oracion) return false;
  return NEGACION.test(oracion.replace(new RegExp(fragmento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), ""));
}

export function revisarGuion(texto) {
  return revisarReglas(texto).filter((p) => !(REGLAS_PERDONABLES_EN_GUION.has(p.regla) && oracionNegada(texto, p.fragmento)));
}
