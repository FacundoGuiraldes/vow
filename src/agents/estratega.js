import { readdir, readFile } from "node:fs/promises";
import { criticarPlan, pedidoDeMejora } from "./critico.js";
import { leerPiezasDefinidas, diasEntre } from "./piezas-definidas.js";
import { revisarReglas, revisarGuion, revisarTextoAlPublico, cifrasNoPermitidas, contextoDeCifra, CIFRAS_PERMITIDAS } from "./reglas-marca.js";

// Estratega: propone el plan de contenido de UNA semana para @vow_ar.
// Propone y nada más: no publica. Una persona aprueba cada pieza.

export const MODELO_ESTRATEGA = "claude-sonnet-5-5";
export const FORMATOS = ["reel", "carrusel", "imagen", "story"];
export const PRODUCCIONES = ["propio", "ia", "mixto"];
export const LARGO_MINIMO_INSTRUCCIONES_IA = 40; // una indicación de verdad dice qué mostrar, cómo encuadrar y qué colores usar
export const PILARES = ["promesa", "proceso", "producto en uso", "gente que entrena", "lanzamiento"];
export const MAXIMO_PIEZAS = 5;
const INTENTOS_MAXIMOS = 2;
// Un plan con varias piezas, justificaciones y referencias ocupa más de 4096 tokens: si la respuesta se corta a mitad de la
// herramienta, el plan llega incompleto. Se pide más espacio de entrada y, si igual se corta, se reintenta con el doble.
export const MAX_TOKENS_ESTRATEGA = 8192;
const LARGO_MAXIMO_GANCHO = 140;
export const PALABRAS_MAXIMAS_GANCHO = 12; // un gancho fuerte es corto
export const ALTERNATIVAS_PEDIDAS = 4;
const ALTERNATIVAS_MINIMAS = 3;
export const PIEZAS_POR_DEFECTO = 2; // sin producto, mejor pocas y buenas que rellenar
// Rango de horas de publicación: el mensaje de confirmación sale a las 8, así que nunca se publica antes de las 9
export const HORA_MINIMA_PUBLICACION = "09:00";
export const HORA_MAXIMA_PUBLICACION = "23:00";
export const esHoraDePublicacion = (valor) =>
  typeof valor === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor) && valor >= HORA_MINIMA_PUBLICACION && valor <= HORA_MAXIMA_PUBLICACION;
// Ganchos que suenan a tutorial o a lista de consejos (descartado por Facundo)
const TONO_TUTORIAL = /^\s*(c[oó]mo|tips?\b|consejos?\b|pasos?\b|gu[ií]a\b|\d+\s+(cosas|tips|pasos|razones|formas|ideas))/i;
// Una story de encuesta o de pregunta pide una interacción en vez de pedir anotarse
export const CTA_DE_INTERACCION = /(?<!\p{L})(vot[aá]\w*|eleg[ií]\w*|respond[eé]\w*|contest[aá]\w*|cont[aá]\w*|dec[ií]\w*|mand[aá]\w*|compart[ií]\w*|deslizá|arrastrá|tocá)(?!\p{L})/iu;
const RUTA_CEREBRO = new URL("../../docs/marca/cerebro-de-marca.md", import.meta.url);
const RUTA_BANCO = new URL("../../docs/marca/banco-de-contenido.md", import.meta.url);
const RUTA_REFERENCIAS = new URL("../../docs/marca/referencias.md", import.meta.url);
const RUTA_INVESTIGACION = new URL("../../docs/investigacion/", import.meta.url);
const RUTA_RENDIMIENTO = new URL("../../docs/rendimiento/", import.meta.url);

// El formato de salida se le pide a la IA con una "herramienta" cuyo esquema es este.
// Así la respuesta llega como datos y no como texto libre que haya que interpretar.
// Con Claude Sonnet 5.5 la API NO acepta obligar el uso de una herramienta (tool_choice "tool" o "any"
// devuelven un error 400): se usa "auto", se le pide en el mensaje y, si no la usa, se reintenta una vez.
export const HERRAMIENTA_PLAN = {
  name: "proponer_plan",
  description: "Devuelve el plan de contenido de la semana para el perfil de Instagram de VOW.",
  input_schema: {
    type: "object",
    required: ["resumen", "piezas"],
    properties: {
      resumen: { type: "string", description: "En 2 o 3 frases, la lógica del plan de la semana." },
      piezas: {
        type: "array",
        minItems: 1,
        maxItems: MAXIMO_PIEZAS,
        items: {
          type: "object",
          required: ["fecha", "hora", "formato", "pilar", "gancho", "ganchos_alternativos", "guion", "texto_en_pantalla", "epigrafe", "palabras_clave", "cta", "recursos", "material_a_producir", "produccion", "instrucciones_ia", "justificacion"],
          properties: {
            fecha: { type: "string", description: "AAAA-MM-DD, dentro de la semana pedida." },
            hora: {
              type: "string",
              description: `HH:MM, hora de Argentina a la que se publica ese día, entre ${HORA_MINIMA_PUBLICACION} y ${HORA_MAXIMA_PUBLICACION}. Elegila con los datos de rendimiento si los hay; si no, una hora de buena actividad (por ejemplo 19:00).`,
            },
            formato: { type: "string", enum: FORMATOS },
            pilar: { type: "string", enum: PILARES },
            gancho: { type: "string", description: "Lo que se dice o se lee en los primeros 3 segundos." },
            ganchos_alternativos: {
              type: "array",
              items: { type: "string" },
              description: `${ALTERNATIVAS_PEDIDAS} ganchos NUEVOS y distintos entre sí para esta misma pieza, en el mismo estilo. No copies ni parafrasees los ejemplos del cerebro de marca.`,
            },
            guion: { type: "string", description: "Qué pasa en la pieza, paso a paso." },
            texto_en_pantalla: { type: "array", items: { type: "string" } },
            epigrafe: { type: "string", description: "Texto que acompaña la publicación: dos a cuatro frases en lenguaje cotidiano, en párrafos cortos separados por una línea en blanco (\\n\\n); la acción final va en su propia línea. En una story va vacío: las stories no llevan epígrafe." },
            palabras_clave: { type: "array", items: { type: "string" } },
            cta: { type: "string", description: "Una sola acción: anotarse en la lista de espera. En una story de encuesta o de pregunta, la acción es la propia interacción (\"Votá\", \"Contanos\", \"Respondé\")." },
            recursos: { type: "array", items: { type: "string" }, description: "Qué hace falta tener para hacerla." },
            material_a_producir: {
              type: "array",
              items: { type: "string" },
              description: "Lo que Facundo tiene que filmar o fotografiar él mismo para esta pieza, una toma concreta por ítem. Lista vacía si la pieza sale de material que ya existe o de código.",
            },
            produccion: {
              type: "string",
              enum: PRODUCCIONES,
              description: "Cómo hace Facundo esta pieza: \"propio\" (la filma o fotografía él), \"ia\" (la crea con una herramienta de IA siguiendo instrucciones_ia) o \"mixto\" (parte filmada, parte con IA).",
            },
            instrucciones_ia: {
              type: "string",
              description: "Si produccion es \"ia\" o \"mixto\": indicación en español, lista para copiar y pegar en una herramienta de IA de imágenes o video. Si es \"propio\": cadena vacía.",
            },
            justificacion: { type: "string", description: "Por qué esta pieza, con apoyo en la marca o en las referencias." },
            referencias: { type: "array", items: { type: "string" }, description: "Cuentas de referencia que inspiran la pieza, si aplica." },
          },
        },
      },
    },
  },
};

// A veces la IA escribe el salto de línea como los dos caracteres "\n" en vez de un salto real, y se publicaría tal cual.
// Se convierte en un salto verdadero en todos los textos de la pieza.
export function normalizarSaltos(valor) {
  if (typeof valor === "string") return valor.replace(/\\(?:r\\n|n)/g, "\n");
  if (Array.isArray(valor)) return valor.map(normalizarSaltos);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizarSaltos(v)]));
  return valor;
}

const sumarDias = (fechaISO, dias) => {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

const esFechaISO = (valor) => typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor));

// Lo que ve la gente: no incluye el guion, que son instrucciones de producción
const textosAlPublico = (pieza) => [
  pieza.gancho,
  pieza.epigrafe,
  pieza.cta,
  ...(Array.isArray(pieza.texto_en_pantalla) ? pieza.texto_en_pantalla : []),
  ...(Array.isArray(pieza.ganchos_alternativos) ? pieza.ganchos_alternativos : []),
];

// Cada texto con el campo del que sale, para que un error diga dónde está el problema
const textosDeLaPieza = (pieza) => [
  ["gancho", pieza.gancho],
  ["guion", pieza.guion],
  ["epigrafe", pieza.epigrafe],
  ["cta", pieza.cta],
  ...(Array.isArray(pieza.texto_en_pantalla) ? pieza.texto_en_pantalla : []).map((t) => ["texto_en_pantalla", t]),
];

// Compara ganchos sin tildes, mayúsculas ni puntuación
const normalizar = (texto) => String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

// Saca del cerebro de marca los ganchos de la sección 8 (aprobados, pendientes y descartados)
export function extraerGanchosConocidos(textoCerebro) {
  const inicio = textoCerebro.indexOf("## 8.");
  const fin = textoCerebro.indexOf("## 9.");
  if (inicio === -1) return { aprobados: [], conocidos: [] };
  const seccion = textoCerebro.slice(inicio, fin === -1 ? undefined : fin);
  const conocidos = [];
  const aprobados = [];
  let esAprobado = false;
  for (const linea of seccion.split("\n")) {
    if (linea.startsWith("**")) esAprobado = /^\*\*Aprobados? por/i.test(linea);
    const coincidencia = linea.match(/^- "(.+?)"/);
    if (!coincidencia) continue;
    conocidos.push(coincidencia[1]);
    if (esAprobado) aprobados.push(coincidencia[1]);
  }
  return { aprobados, conocidos };
}

// Reglas que tiene que cumplir cualquier gancho, principal o alternativo
function revisarGancho(gancho, etiqueta, { reglas = true, advertencias = [] } = {}) {
  const errores = [];
  const palabras = gancho.trim().split(/\s+/).length;
  if (palabras > PALABRAS_MAXIMAS_GANCHO) errores.push(`${etiqueta}: tiene ${palabras} palabras (máximo ${PALABRAS_MAXIMAS_GANCHO}).`);
  if (gancho.length > LARGO_MAXIMO_GANCHO) errores.push(`${etiqueta}: supera ${LARGO_MAXIMO_GANCHO} caracteres.`);
  if (TONO_TUTORIAL.test(gancho)) advertencias.push(`${etiqueta}: suena a tutorial o consejo ("${gancho}").`);
  // El gancho principal ya pasa por las reglas de marca junto con el resto de los textos de la pieza
  if (reglas) {
    for (const { regla, fragmento } of revisarReglas(gancho, { soloDuras: true })) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
    for (const cifra of cifrasNoPermitidas(gancho)) errores.push(`${etiqueta}: la cifra "${cifra}" no está en los datos cargados ("${contextoDeCifra(gancho, cifra)}").`);
  }
  return errores;
}

// Revisa que el plan tenga la forma pedida y cumpla las reglas de marca.
// Devuelve { ok, errores }. Si hay algún error, el plan se descarta (no se guarda).
export function validarPlan(plan, { semanaInicio, recursos = {}, cifrasPermitidas = CIFRAS_PERMITIDAS, piezas = PIEZAS_POR_DEFECTO, ganchosConocidos = [], piezasDefinidas = [] } = {}) {
  const errores = [];
  const advertencias = []; // reglas de estilo de la marca: avisan, no rechazan
  const conocidos = new Set(ganchosConocidos.map(normalizar));
  const frasesUsadas = new Set(piezasDefinidas.flatMap((p) => p.frases ?? []).map(normalizar));
  if (!plan || typeof plan !== "object") return { ok: false, errores: ["El plan no es un objeto."] };
  if (typeof plan.resumen !== "string" || plan.resumen.trim() === "") errores.push("Falta el resumen.");
  if (!Array.isArray(plan.piezas)) {
    // Distinto de un plan vacío: sirve para saber qué mandó la IA (por ejemplo un texto en vez de una lista)
    const recibido = plan.piezas === undefined ? "no vino" : `llegó como ${Array.isArray(plan.piezas) ? "lista" : typeof plan.piezas}`;
    return { ok: false, errores: [...errores, `El plan no tiene piezas: "piezas" ${recibido}.`] };
  }
  if (plan.piezas.length === 0) {
    return { ok: false, errores: [...errores, "El plan no tiene piezas."] };
  }
  if (plan.piezas.length > MAXIMO_PIEZAS) errores.push(`Hay más de ${MAXIMO_PIEZAS} piezas.`);
  if (plan.piezas.length > piezas) errores.push(`Se pidieron ${piezas} piezas y el plan trae ${plan.piezas.length}.`);

  const desde = semanaInicio;
  const hasta = semanaInicio ? sumarDias(semanaInicio, 6) : null;

  plan.piezas.forEach((pieza, i) => {
    const etiqueta = `Pieza ${i + 1}`;
    const falta = (campo) => errores.push(`${etiqueta}: falta ${campo}.`);

    if (!esFechaISO(pieza.fecha)) errores.push(`${etiqueta}: la fecha no es AAAA-MM-DD.`);
    else if (desde && (pieza.fecha < desde || pieza.fecha > hasta)) errores.push(`${etiqueta}: la fecha ${pieza.fecha} está fuera de la semana (${desde} a ${hasta}).`);
    if (!FORMATOS.includes(pieza.formato)) errores.push(`${etiqueta}: formato inválido (${pieza.formato}).`);
    if (!PILARES.includes(pieza.pilar)) errores.push(`${etiqueta}: pilar inválido (${pieza.pilar}).`);
    // Una story no tiene epígrafe: puede venir vacío, pero si viene tiene que ser texto
    const obligatorios = pieza.formato === "story" ? ["gancho", "guion", "cta", "justificacion"] : ["gancho", "guion", "epigrafe", "cta", "justificacion"];
    for (const campo of obligatorios) {
      if (typeof pieza[campo] !== "string" || pieza[campo].trim() === "") falta(campo);
    }
    if (pieza.formato === "story" && pieza.epigrafe !== undefined && typeof pieza.epigrafe !== "string") errores.push(`${etiqueta}: el epígrafe no es texto.`);
    for (const campo of ["texto_en_pantalla", "palabras_clave", "recursos"]) {
      if (!Array.isArray(pieza[campo])) falta(campo);
    }
    // Hora y material a producir son opcionales para los planes viejos, pero si vienen tienen que ser válidos
    if (pieza.hora !== undefined && !esHoraDePublicacion(pieza.hora)) {
      errores.push(`${etiqueta}: la hora ${JSON.stringify(pieza.hora)} no es HH:MM entre ${HORA_MINIMA_PUBLICACION} y ${HORA_MAXIMA_PUBLICACION}.`);
    }
    if (pieza.material_a_producir !== undefined) {
      if (!Array.isArray(pieza.material_a_producir) || pieza.material_a_producir.some((m) => typeof m !== "string" || m.trim() === "")) {
        errores.push(`${etiqueta}: material_a_producir tiene que ser una lista de textos.`);
      } else {
        for (const item of pieza.material_a_producir) {
          for (const { regla, fragmento } of revisarReglas(item, { soloDuras: true })) errores.push(`${etiqueta}: ${regla} en el material a producir ("${fragmento}").`);
        }
      }
    }
    // Cómo se produce: opcional para los planes viejos (se toma como "propio"); si es con IA, tiene que traer la indicación
    if (pieza.produccion !== undefined && !PRODUCCIONES.includes(pieza.produccion)) {
      errores.push(`${etiqueta}: produccion tiene que ser ${PRODUCCIONES.map((v) => `"${v}"`).join(", ")}.`);
    } else if (pieza.produccion === "ia" || pieza.produccion === "mixto") {
      if (typeof pieza.instrucciones_ia !== "string" || pieza.instrucciones_ia.trim().length < LARGO_MINIMO_INSTRUCCIONES_IA) {
        errores.push(`${etiqueta}: si se hace con IA, instrucciones_ia tiene que ser una indicación completa (qué mostrar, encuadre y colores, al menos ${LARGO_MINIMO_INSTRUCCIONES_IA} caracteres).`);
      } else {
        for (const { regla, fragmento } of revisarReglas(pieza.instrucciones_ia, { soloDuras: true })) errores.push(`${etiqueta}: ${regla} en las instrucciones para la IA ("${fragmento}").`);
      }
    }
    if (typeof pieza.gancho === "string" && pieza.gancho.trim() !== "") errores.push(...revisarGancho(pieza.gancho, `${etiqueta}: el gancho`, { reglas: false, advertencias }));
    // Ganchos alternativos: tienen que ser nuevos, distintos entre sí y cumplir las mismas reglas
    if (!Array.isArray(pieza.ganchos_alternativos) || pieza.ganchos_alternativos.length < ALTERNATIVAS_MINIMAS) {
      errores.push(`${etiqueta}: tiene que traer al menos ${ALTERNATIVAS_MINIMAS} ganchos alternativos.`);
    } else {
      const vistos = new Set([normalizar(pieza.gancho)]);
      pieza.ganchos_alternativos.forEach((alternativo, j) => {
        const nombre = `${etiqueta}, alternativo ${j + 1}`;
        if (typeof alternativo !== "string" || alternativo.trim() === "") return errores.push(`${nombre}: está vacío.`);
        if (conocidos.has(normalizar(alternativo))) errores.push(`${nombre}: copia un ejemplo del cerebro de marca ("${alternativo}").`);
        if (vistos.has(normalizar(alternativo))) errores.push(`${nombre}: está repetido.`);
        vistos.add(normalizar(alternativo));
        errores.push(...revisarGancho(alternativo, nombre, { advertencias }));
      });
    }
    // No repetir lo que ya está decidido: ni sus frases ni su formato y pilar en fechas cercanas
    for (const texto of [pieza.gancho, ...(pieza.ganchos_alternativos ?? []), ...(Array.isArray(pieza.texto_en_pantalla) ? pieza.texto_en_pantalla : [])]) {
      if (typeof texto === "string" && frasesUsadas.has(normalizar(texto))) errores.push(`${etiqueta}: reutiliza una frase de una pieza ya definida ("${texto}").`);
    }
    for (const definida of piezasDefinidas) {
      if (definida.formato === pieza.formato && definida.pilar === pieza.pilar && esFechaISO(pieza.fecha) && definida.fecha && diasEntre(pieza.fecha, definida.fecha) <= 7) {
        errores.push(`${etiqueta}: repite el formato (${pieza.formato}) y el pilar (${pieza.pilar}) de la pieza ya definida del ${definida.fecha}.`);
      }
    }
    // Una sola acción: anotarse en la lista de espera
    // (una story puede cerrar con su propia interacción: votar, responder, contar)
    const cierraConInteraccion = pieza.formato === "story" && CTA_DE_INTERACCION.test(pieza.cta ?? "");
    if (typeof pieza.cta === "string" && !/lista/i.test(pieza.cta) && !cierraConInteraccion) errores.push(`${etiqueta}: la acción final tiene que ser anotarse en la lista${pieza.formato === "story" ? " (o, en una story, votar o responder)" : ""}.`);

    // No se puede mostrar lo que todavía no existe
    if (pieza.pilar === "producto en uso" && !recursos.producto) errores.push(`${etiqueta}: pide "producto en uso" pero todavía no hay producto.`);
    if (pieza.pilar === "gente que entrena" && !recursos.gente) errores.push(`${etiqueta}: pide "gente que entrena" pero no hay personas confirmadas.`);

    for (const texto of textosAlPublico(pieza)) {
      for (const { regla, fragmento } of revisarTextoAlPublico(texto)) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
    }
    // Los recursos también pueden pedir papel y lapicera
    for (const recurso of Array.isArray(pieza.recursos) ? pieza.recursos : []) {
      for (const { regla, fragmento } of revisarReglas(recurso, { soloDuras: true })) errores.push(`${etiqueta}: ${regla} en los recursos ("${fragmento}").`);
    }
    for (const [campo, texto] of textosDeLaPieza(pieza)) {
      const revisar = campo === "guion" ? revisarGuion : revisarReglas;
      for (const { regla, fragmento } of revisar(texto, { soloDuras: true })) errores.push(`${etiqueta} (${campo}): ${regla} ("${fragmento}").`);
      // Las reglas de estilo no rechazan la pieza: quedan como advertencias para el editor crítico
      for (const { regla, fragmento } of revisar(texto, { soloBlandas: true })) advertencias.push(`${etiqueta} (${campo}): ${regla} ("${fragmento}").`);
      for (const cifra of cifrasNoPermitidas(texto, cifrasPermitidas, { produccion: campo === "guion" })) errores.push(`${etiqueta} (${campo}): la cifra "${cifra}" no está en los datos cargados ("${contextoDeCifra(texto, cifra)}").`);
    }
  });

  // Entre piezas: a lo sumo un gancho principal puede salir de la lista del cerebro de marca,
  // y ningún pilar se repite más de lo razonable (con 2 piezas, pilares distintos)
  const principalesCopiados = plan.piezas.filter((pieza) => conocidos.has(normalizar(pieza.gancho)));
  if (principalesCopiados.length > 1) errores.push("Más de un gancho principal sale de la lista del cerebro de marca: tiene que crear ganchos nuevos.");
  const maximoPorPilar = Math.ceil(plan.piezas.length / 2);
  const cuentaPilares = {};
  for (const pieza of plan.piezas) cuentaPilares[pieza.pilar] = (cuentaPilares[pieza.pilar] ?? 0) + 1;
  for (const [pilar, cantidad] of Object.entries(cuentaPilares)) {
    if (cantidad > maximoPorPilar) errores.push(`El pilar "${pilar}" aparece ${cantidad} veces: tiene que haber variedad entre piezas.`);
  }

  return { ok: errores.length === 0, errores, advertencias };
}

// Último archivo de una carpeta cuyo nombre cumple `patron` (los nombres llevan la fecha, así que el último ordenado es el más nuevo).
// Si no hay, o no se puede leer, devuelve null y el Estratega trabaja sin eso.
async function leerUltimo(carpeta, patron, { leer = (ruta) => readFile(ruta, "utf8"), listar = (c) => readdir(c) } = {}) {
  try {
    const nombres = (await listar(carpeta)).filter((n) => patron.test(n)).sort();
    if (nombres.length === 0) return null;
    const nombre = nombres.at(-1);
    return { nombre, texto: await leer(new URL(nombre, carpeta)) };
  } catch {
    return null;
  }
}

// Último informe del Investigador (docs/investigacion/informe-AAAA-MM-DD.md), si hay uno.
export const leerUltimoInforme = (opciones) => leerUltimo(RUTA_INVESTIGACION, /^informe-\d{4}-\d{2}-\d{2}\.md$/, opciones);

// Últimos patrones de éxito de las cuentas de referencia (docs/investigacion/patrones-AAAA-MM-DD.md), calculados con código.
export const leerUltimosPatrones = (opciones) => leerUltimo(RUTA_INVESTIGACION, /^patrones-\d{4}-\d{2}-\d{2}\.md$/, opciones);

// Último informe de rendimiento de la cuenta propia (docs/rendimiento/rendimiento-AAAA-MM-DD.md), si hay uno.
export const leerUltimoRendimiento = (opciones) => leerUltimo(RUTA_RENDIMIENTO, /^rendimiento-\d{4}-\d{2}-\d{2}\.md$/, opciones);

export async function construirSistema(leer = (ruta) => readFile(ruta, "utf8"), { listar } = {}) {
  const [cerebro, banco, referencias, informe, patrones, rendimiento, piezas] = await Promise.all([
    leer(RUTA_CEREBRO),
    leer(RUTA_BANCO).catch(() => ""),
    leer(RUTA_REFERENCIAS),
    leerUltimoInforme({ leer, listar }),
    leerUltimosPatrones({ leer, listar }),
    leerUltimoRendimiento({ leer, listar }),
    leerPiezasDefinidas({ leer, listar }),
  ]);
  const bloqueInvestigacion = informe
    ? `

=== INVESTIGACIÓN DE MERCADO (${informe.nombre}) ===
${informe.texto}`
    : "";
  const bloquePatrones = patrones
    ? `

=== QUÉ FUNCIONÓ EN EL MERCADO: DATOS REALES (${patrones.nombre}) ===
${patrones.texto}`
    : "";
  const bloqueRendimiento = rendimiento
    ? `

=== RENDIMIENTO DE @vow_ar (${rendimiento.nombre}) ===
${rendimiento.texto}`
    : "";
  const bloquePiezas = piezas.length
    ? `

=== PIEZAS YA DEFINIDAS ===
${piezas.map((p) => p.texto.trim()).join("\n\n---\n\n")}`
    : "";
  return { cerebro, piezas, texto: `Sos el estratega de contenido de VOW, marca argentina de indumentaria y accesorios para entrenar. Proponés el plan de contenido de una semana para su perfil de Instagram. Solo proponés: una persona aprueba cada pieza antes de que salga.

Reglas:
- Todo lo que escribas sigue el cerebro de marca de abajo. Si algo lo contradice, gana el cerebro de marca.
- Hablás en voseo rioplatense. Cada pieza de feed termina con una sola acción: anotarse en la lista de espera. Una story de encuesta o de pregunta puede cerrar con su propia interacción ("Votá", "Contanos") y no necesita pedir la lista.
- MÉTODO (seguilo en este orden antes de llamar a la herramienta): 1) Leé el BANCO DE CONTENIDO y las notas: si hay un FOCO DE LA SEMANA de Facundo, el plan gira alrededor de ese foco. 2) Para cada pieza elegí primero el trabajo (mostrar, preguntar o sumar) y el dato visible concreto (qué se ve en el primer segundo), y recién después escribí el gancho. 3) Pensá tres enfoques distintos para cada pieza y quedate con el más concreto, el que se pueda filmar o hacer esta semana. 4) Pasá cada frase por la prueba del amigo; si suena a póster, reescribila diciendo la cosa concreta. 5) Mezclá formatos: las stories (y secuencias de stories) son el canal diario y barato; sumá 1 o 2 piezas de feed. No hagas todas las piezas de frases sobre la promesa: como mucho una.
- Cada pieza tiene que mostrar o preguntar algo concreto (una decisión real, un detalle de una prenda, un color sobre una tela, una pregunta con opciones). En guion y texto_en_pantalla nombrá lo que se ve, no el concepto.
- Nunca inventes cifras, pruebas, stock, fechas ni opiniones. No uses números en los textos salvo "01" de "Drop 01" con su año "2027", y "00" de "Drop 00" con su año "2026". Los años van sin mes ni día. Al Drop 00 solo lo nombrás como adelanto y solo si Facundo lo pidió, está en las novedades o es el foco de la semana: sin precios, cantidades ni stock; podés mostrar indicios concretos (un bordado de cerca, el color de un hilo, el borde de una media) cuando el foco lo pide.
- Solo podés proponer piezas que se puedan hacer con los recursos disponibles que te indican. Si no hay producto, no propongas mostrar producto.
- Cada pieza lleva su hora de publicación (hora de Argentina, entre ${HORA_MINIMA_PUBLICACION} y ${HORA_MAXIMA_PUBLICACION}). Si hay un RENDIMIENTO de @vow_ar, elegí la hora con esos datos; si no, una hora de buena actividad como 19:00. Nunca inventes que una hora "rinde mejor" sin datos.
- En material_a_producir listá, una toma por ítem, lo que Facundo tiene que filmar o fotografiar él mismo. Si la pieza sale de material que ya existe o se genera con código, dejá la lista vacía. Facundo recibe el plan el lunes y se le recuerda 3 días antes de publicar: ubicá las piezas que necesitan filmación de jueves en adelante.
- En produccion elegí cómo hace Facundo cada pieza: "propio" cuando lo real es el valor (su proceso, gente que entrena, producto real); "ia" para escenas, texturas, fondos o piezas tipográficas que crea él con una herramienta de IA; "mixto" si lleva ambas. La IA nunca puede mostrar producto que no existe ni gente que entrena sin confirmar: valen las mismas reglas de recursos.
- Si produccion es "ia" o "mixto", instrucciones_ia es la indicación para copiar y pegar en esa herramienta: qué mostrar con un tema concreto (describí lo que se ve, nunca lo que no tiene que aparecer), formato vertical (video 9:16; imagen 4:5, 1080x1350), luz sobria, la paleta de la marca (negro #0A0A0A, hueso #ECE8E1, beige #CDBFA6 y bordó #7A1F24 solo como acento) y sin música. Si la pieza lleva texto en pantalla, copiá en la indicación los textos EXACTOS de texto_en_pantalla y pedí revisar la ortografía; las IA suelen deformar letras, así que también sugerí agregar el texto aparte con un editor, en Unbounded ExtraBold en mayúsculas y Space Mono. Si produccion es "propio", instrucciones_ia va vacía. En una pieza con IA, material_a_producir lista el archivo que hay que crear.
- Las piezas se publican solas por la API de Instagram, que no permite agregar música de la biblioteca de Instagram: no la pidas en los recursos. Si una pieza lleva sonido, tiene que venir en el propio archivo (por ejemplo, el sonido ambiente real).
- Las referencias son inspiración, no datos para citar. No copies sus textos ni sus ideas al pie de la letra.
- Los ganchos tienen que ser claros, simples y verdaderos, como pide la sección 8 del cerebro de marca: de 3 a 8 palabras, con palabras de todos los días. Pueden ser una afirmación que compromete, una observación concreta de lo que le pasa a quien entrena o una pregunta simple. Un gancho normal y verdadero vale más que uno que suena a póster. Nunca tono de tutorial, de consejo ni de lo que falta.
- BLOQUEOS Y GUÍA: lo que bloquea un plan es lo que es falso o dañino (cifras inventadas, promesas de resultados físicos, urgencia o escasez falsa, no usar voseo, mostrar producto o gente que no hay). Lo de estilo (teasers, elementos del gimnasio, "no es X, es Y", exclamaciones, inglés) es guía: respetala cuando no le saque fuerza a la pieza, pero no sacrifiques una pieza que los datos respaldan por una cuestión de estilo. Priorizá el equilibrio entre el estilo de VOW y lo que los datos muestran que se comparte y se guarda.
- CALIDAD DEL TEXTO (sección "Calidad del texto" del cerebro de marca): antes de escribir cada frase hacete la prueba: ¿se lo dirías en voz alta a un amigo que entrena sin sentir vergüenza?, ¿se entiende sola en tres segundos? Si suena a eslogan, a póster de gimnasio, a anuncio o a película, reescribila con palabras simples o sacala. Prohibido: teasers que anuncian que "algo llega" sin decir qué, sentencias pseudo-profundas, "no es X, es Y", listas de tres fragmentos con ritmo de publicidad y frases de coaching. Una idea por pieza y la palabra "promesa" no más de una vez.
- Si no tenés algo concreto y verdadero para decir, proponé una pieza más simple: nunca rellenes con frases bonitas. Una story necesita una razón concreta: mostrar algo real, hacer una pregunta o una encuesta con una decisión real, o invitar a anotarse con un motivo claro. Nada de stories de intriga ni de "generar expectativa" sin un dato a la vista.
- El epígrafe son dos a cuatro frases en lenguaje cotidiano, escritas como las diría una persona, en párrafos cortos separados por una línea en blanco. No repite el gancho: lo completa o dice algo que la pieza no dice. La acción final va en su propia línea.
- Los ganchos de la sección 8 son ejemplos de estilo. A lo sumo UNO de los ganchos principales del plan puede ser uno de los aprobados; todos los demás tienen que ser creados por vos. Los ganchos alternativos son siempre nuevos: ni copias ni paráfrasis de los ejemplos.
- Cada pieza trae un gancho principal y 4 alternativos distintos entre sí. Las piezas de una misma semana no pueden repetir el mismo pilar más de dos veces (y variá formatos).
- La promesa es algo que una persona se hace a sí misma y cumple. No es un texto escrito: nunca propongas escribirla a mano ni mostrar papel, lapicera o cartulina.
- Nunca nombres elementos del gimnasio (barras, mancuernas, pesas, discos, kettlebells, fierros). Suenan forzados. El producto (grips, straps, prendas) sí se puede nombrar cuando hay producto.
- Cada pieza le habla a quien la mira y le da algo: una idea, un gesto, una razón para sumarse. No explica la marca por dentro (paleta, tipografías, manual de marca). Si una pieza de diseño o de proceso solo sirve para un diseñador, no la propongas.
- En "justificacion" explicá por qué la pieza encaja con la marca o con una referencia.
- Si abajo hay PIEZAS YA DEFINIDAS, son piezas ya decididas: no repitas su idea, no uses su formato y pilar en fechas cercanas (una semana) y no reutilices sus frases. Las piezas que se piden se suman a las definidas.
- Si abajo hay una INVESTIGACIÓN DE MERCADO, apoyate en ella: elegí formatos y estilos que los datos respaldan y evitá los que contradicen. Cuando una pieza se apoye en un hallazgo, nombralo por su título en "justificacion". La investigación es una guía con muestra chica, no una verdad: nunca gana sobre el cerebro de marca, no copies piezas ni textos de las marcas estudiadas y no uses sus cifras en los textos de la pieza.
- Si abajo hay un RENDIMIENTO DE @vow_ar, son los resultados reales de la cuenta propia. Cuando un tipo tiene muestra suficiente, pesa más que las referencias; con muestra chica es una señal, no una conclusión. Repetí lo que guardaron, compartieron o comentaron, y cambiá lo que no generó interacción. Cuando una pieza se apoye en una publicación propia, nombrala por su fecha y tipo en "justificacion". No uses sus cifras en los textos de la pieza.

=== CEREBRO DE MARCA ===
${cerebro}
${banco ? `
=== BANCO DE CONTENIDO (de qué hablar y cómo bajarlo a algo que se ve) ===
${banco}
` : ""}
=== MARCAS DE REFERENCIA ===
${referencias}${bloqueInvestigacion}${bloquePatrones}${bloqueRendimiento}${bloquePiezas}` };
}

// Pide el plan de una semana. `cliente` se inyecta para poder probar sin gastar plata.
export async function planificarSemana({ semanaInicio, fase, recursos = {}, notas = "", piezas = PIEZAS_POR_DEFECTO }, { cliente, modelo = MODELO_ESTRATEGA, leer, listar, criticar = false } = {}) {
  if (!esFechaISO(semanaInicio)) throw new Error("semanaInicio tiene que ser AAAA-MM-DD.");
  if (!cliente) throw new Error("Falta el cliente de Anthropic.");

  const { cerebro, texto: system, piezas: piezasDefinidas } = await construirSistema(leer, { listar });
  const hasta = sumarDias(semanaInicio, 6);
  const definidasEnLaSemana = piezasDefinidas.filter((p) => p.fecha && p.fecha >= semanaInicio && p.fecha <= hasta);
  const { conocidos: ganchosConocidos } = extraerGanchosConocidos(cerebro);
  const pedido = [
    `Armá el plan de la semana que empieza el ${semanaInicio} (hasta el ${sumarDias(semanaInicio, 6)}).`,
    `Fase del proyecto: ${fase}.`,
    definidasEnLaSemana.length ? `Esa semana ya hay definidas: ${definidasEnLaSemana.map((p) => `${p.formato} del ${p.fecha} (pilar ${p.pilar})`).join("; ")}. No las repitas.` : "",
    `Recursos disponibles: producto físico: ${recursos.producto ? "sí" : "no"}; personas que entrenan confirmadas: ${recursos.gente ? "sí" : "no"}.`,
    `Cantidad de piezas: ${piezas}. Mezclá stories y piezas de feed; cada una con algo concreto para mostrar o preguntar (ver el método).`,
    notas ? `Notas: ${notas}` : "",
  ].filter(Boolean).join("\n");

  const mensajes = [{ role: "user", content: `${pedido}\n\nRespondé llamando a la herramienta proponer_plan. No escribas nada fuera de la herramienta.` }];
  const uso = { entrada: 0, salida: 0 }; // cuánto se consumió, para controlar el gasto
  let bloque = null;
  let intentos = 0;
  let cortada = false; // la respuesta se quedó sin espacio antes de terminar el plan
  let maxTokens = MAX_TOKENS_ESTRATEGA;

  for (let intento = 1; intento <= INTENTOS_MAXIMOS && !bloque; intento++) {
    intentos++;
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: maxTokens,
      system,
      messages: mensajes,
      tools: [HERRAMIENTA_PLAN],
      tool_choice: { type: "auto" },
    });
    uso.entrada += respuesta.usage?.input_tokens ?? 0;
    uso.salida += respuesta.usage?.output_tokens ?? 0;

    bloque = respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_PLAN.name) ?? null;
    if (respuesta.stop_reason === "max_tokens") {
      // Lo que llegó de la herramienta es un plan a medias: no se usa ni se valida (daría errores engañosos como "no tiene piezas")
      cortada = true;
      bloque = null;
      maxTokens *= 2;
      continue;
    }
    cortada = false;
    if (!bloque) {
      // La IA contestó con texto: se le recuerda que tiene que usar la herramienta
      mensajes.push({ role: "assistant", content: respuesta.content ?? [] });
      mensajes.push({ role: "user", content: "Tenés que responder llamando a la herramienta proponer_plan." });
    }
  }

  if (!bloque) {
    const motivo = cortada ? "La respuesta se cortó por el límite de tokens: el plan quedó incompleto." : "La respuesta no trajo el plan en el formato esperado.";
    return { ok: false, plan: null, errores: [motivo], uso, intentos };
  }

  bloque = { ...bloque, input: normalizarSaltos(bloque.input) };
  const opcionesValidacion = { semanaInicio, recursos, piezas, ganchosConocidos, piezasDefinidas };
  const { ok, errores, advertencias } = validarPlan(bloque.input, opcionesValidacion);
  if (!ok || !criticar) return { ok, plan: ok ? bloque.input : null, errores, uso, propuesta: bloque.input, intentos };

  // Generar, criticar, mejorar: un editor crítico puntúa el plan y, si hay piezas flojas, el Estratega las reescribe una vez.
  // Si la versión mejorada no pasa las reglas o no mejora el promedio, se queda la primera: la crítica nunca empeora un plan válido.
  let plan = bloque.input;
  let critica = null;
  try {
    critica = await criticarPlan(plan, { cliente, modelo, contexto: `semana del ${semanaInicio}; ${pedido.split("\n").find((l) => l.startsWith("Recursos")) ?? ""}${advertencias?.length ? `\nAdvertencias de estilo de marca (no bloquean, pero pesá si molestan): ${advertencias.slice(0, 8).join(" | ")}` : ""}` });
    uso.entrada += critica.uso.entrada;
    uso.salida += critica.uso.salida;
    critica.mejorada = false;
    if (critica.ok && critica.flojas.length > 0) {
      const respuesta = await cliente.messages.create({
        model: modelo,
        max_tokens: maxTokens,
        system,
        messages: [...mensajes, { role: "assistant", content: [{ type: "tool_use", id: bloque.id, name: HERRAMIENTA_PLAN.name, input: plan }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: bloque.id, content: pedidoDeMejora(critica) }] }],
        tools: [HERRAMIENTA_PLAN],
        tool_choice: { type: "auto" },
      });
      uso.entrada += respuesta.usage?.input_tokens ?? 0;
      uso.salida += respuesta.usage?.output_tokens ?? 0;
      const mejorado = respuesta.stop_reason === "max_tokens" ? null : respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_PLAN.name);
      if (mejorado) mejorado.input = normalizarSaltos(mejorado.input);
      if (mejorado && validarPlan(mejorado.input, opcionesValidacion).ok) {
        const segunda = await criticarPlan(mejorado.input, { cliente, modelo });
        uso.entrada += segunda.uso.entrada;
        uso.salida += segunda.uso.salida;
        const antes = critica.piezas.reduce((a, p) => a + p.promedio, 0) / critica.piezas.length;
        const despues = segunda.ok ? segunda.piezas.reduce((a, p) => a + p.promedio, 0) / segunda.piezas.length : -1;
        // Si la segunda crítica falla no se puede comparar: se queda el plan original
        if (segunda.ok && despues > antes) {
          plan = mejorado.input;
          critica = { ...segunda, mejorada: true, antes: Number(antes.toFixed(2)), despues: Number(despues.toFixed(2)) };
        } else {
          critica = { ...critica, mejorada: false };
        }
      }
    }
  } catch (error) {
    // La crítica es un extra: si falla (red, crédito), el plan válido sigue su camino
    critica = { ok: false, error: error.message, piezas: [], flojas: [] };
  }
  return { ok: true, plan, errores: [], uso, propuesta: plan, intentos, critica };
}
