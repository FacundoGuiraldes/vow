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
  // Cadenas de signos de exclamación
  { regla: "exceso de exclamaciones", patron: /!{2,}/ },
  // "Drop" suelto: solo se acepta "Drop 01"
  { regla: '"drop" fuera de "Drop 01"', patron: /\bdrops?\b(?!\s*0?1\b)/i },
];

const MAXIMO_EMOJIS = 1;

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

// Regla "toda cifra que aparece existe en los datos cargados": cualquier número del texto
// tiene que estar en la lista de cifras permitidas (por defecto solo "01", de "Drop 01").
export function cifrasNoPermitidas(texto, permitidas = ["01"]) {
  if (typeof texto !== "string") return [];
  const numeros = texto.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numeros.filter((numero) => !permitidas.includes(numero));
}
