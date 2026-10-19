import { readdir, readFile } from "node:fs/promises";
import { leerPiezasDefinidas, diasEntre } from "./piezas-definidas.js";
import { revisarReglas, revisarGuion, revisarTextoAlPublico, cifrasNoPermitidas } from "./reglas-marca.js";

// Estratega: propone el plan de contenido de UNA semana para @vow_ar.
// Propone y nada más: no publica. Una persona aprueba cada pieza.

export const MODELO_ESTRATEGA = "claude-sonnet-5-5";
export const FORMATOS = ["reel", "carrusel", "imagen", "story"];
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
// Ganchos que suenan a tutorial o a lista de consejos (descartado por Facundo)
const TONO_TUTORIAL = /^\s*(c[oó]mo|tips?\b|consejos?\b|pasos?\b|gu[ií]a\b|\d+\s+(cosas|tips|pasos|razones|formas|ideas))/i;
const RUTA_CEREBRO = new URL("../../docs/marca/cerebro-de-marca.md", import.meta.url);
const RUTA_REFERENCIAS = new URL("../../docs/marca/referencias.md", import.meta.url);
const RUTA_INVESTIGACION = new URL("../../docs/investigacion/", import.meta.url);

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
          required: ["fecha", "formato", "pilar", "gancho", "ganchos_alternativos", "guion", "texto_en_pantalla", "epigrafe", "palabras_clave", "cta", "recursos", "justificacion"],
          properties: {
            fecha: { type: "string", description: "AAAA-MM-DD, dentro de la semana pedida." },
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
            epigrafe: { type: "string" },
            palabras_clave: { type: "array", items: { type: "string" } },
            cta: { type: "string", description: "Una sola acción: anotarse en la lista de espera." },
            recursos: { type: "array", items: { type: "string" }, description: "Qué hace falta tener para hacerla." },
            justificacion: { type: "string", description: "Por qué esta pieza, con apoyo en la marca o en las referencias." },
            referencias: { type: "array", items: { type: "string" }, description: "Cuentas de referencia que inspiran la pieza, si aplica." },
          },
        },
      },
    },
  },
};

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

const textosDeLaPieza = (pieza) => [
  pieza.gancho,
  pieza.guion,
  pieza.epigrafe,
  pieza.cta,
  ...(Array.isArray(pieza.texto_en_pantalla) ? pieza.texto_en_pantalla : []),
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
function revisarGancho(gancho, etiqueta, { reglas = true } = {}) {
  const errores = [];
  const palabras = gancho.trim().split(/\s+/).length;
  if (palabras > PALABRAS_MAXIMAS_GANCHO) errores.push(`${etiqueta}: tiene ${palabras} palabras (máximo ${PALABRAS_MAXIMAS_GANCHO}).`);
  if (gancho.length > LARGO_MAXIMO_GANCHO) errores.push(`${etiqueta}: supera ${LARGO_MAXIMO_GANCHO} caracteres.`);
  if (TONO_TUTORIAL.test(gancho)) errores.push(`${etiqueta}: suena a tutorial o consejo ("${gancho}").`);
  // El gancho principal ya pasa por las reglas de marca junto con el resto de los textos de la pieza
  if (reglas) {
    for (const { regla, fragmento } of revisarReglas(gancho)) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
    for (const cifra of cifrasNoPermitidas(gancho)) errores.push(`${etiqueta}: la cifra "${cifra}" no está en los datos cargados.`);
  }
  return errores;
}

// Revisa que el plan tenga la forma pedida y cumpla las reglas de marca.
// Devuelve { ok, errores }. Si hay algún error, el plan se descarta (no se guarda).
export function validarPlan(plan, { semanaInicio, recursos = {}, cifrasPermitidas = ["01"], piezas = PIEZAS_POR_DEFECTO, ganchosConocidos = [], piezasDefinidas = [] } = {}) {
  const errores = [];
  const conocidos = new Set(ganchosConocidos.map(normalizar));
  const frasesUsadas = new Set(piezasDefinidas.flatMap((p) => p.frases ?? []).map(normalizar));
  if (!plan || typeof plan !== "object") return { ok: false, errores: ["El plan no es un objeto."] };
  if (typeof plan.resumen !== "string" || plan.resumen.trim() === "") errores.push("Falta el resumen.");
  if (!Array.isArray(plan.piezas) || plan.piezas.length === 0) {
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
    for (const campo of ["gancho", "guion", "epigrafe", "cta", "justificacion"]) {
      if (typeof pieza[campo] !== "string" || pieza[campo].trim() === "") falta(campo);
    }
    for (const campo of ["texto_en_pantalla", "palabras_clave", "recursos"]) {
      if (!Array.isArray(pieza[campo])) falta(campo);
    }
    if (typeof pieza.gancho === "string" && pieza.gancho.trim() !== "") errores.push(...revisarGancho(pieza.gancho, `${etiqueta}: el gancho`, { reglas: false }));
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
        errores.push(...revisarGancho(alternativo, nombre));
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
    if (typeof pieza.cta === "string" && !/lista/i.test(pieza.cta)) errores.push(`${etiqueta}: la acción final tiene que ser anotarse en la lista.`);

    // No se puede mostrar lo que todavía no existe
    if (pieza.pilar === "producto en uso" && !recursos.producto) errores.push(`${etiqueta}: pide "producto en uso" pero todavía no hay producto.`);
    if (pieza.pilar === "gente que entrena" && !recursos.gente) errores.push(`${etiqueta}: pide "gente que entrena" pero no hay personas confirmadas.`);

    for (const texto of textosAlPublico(pieza)) {
      for (const { regla, fragmento } of revisarTextoAlPublico(texto)) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
    }
    // Los recursos también pueden pedir papel y lapicera
    for (const recurso of Array.isArray(pieza.recursos) ? pieza.recursos : []) {
      for (const { regla, fragmento } of revisarReglas(recurso)) errores.push(`${etiqueta}: ${regla} en los recursos ("${fragmento}").`);
    }
    for (const texto of textosDeLaPieza(pieza)) {
      const revisar = texto === pieza.guion ? revisarGuion : revisarReglas;
      for (const { regla, fragmento } of revisar(texto)) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
      for (const cifra of cifrasNoPermitidas(texto, cifrasPermitidas)) errores.push(`${etiqueta}: la cifra "${cifra}" no está en los datos cargados.`);
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

  return { ok: errores.length === 0, errores };
}

// Último informe del Investigador (docs/investigacion/informe-AAAA-MM-DD.md), si hay uno.
// Si no hay, o no se puede leer, el Estratega trabaja solo con la marca y las referencias.
export async function leerUltimoInforme({ leer = (ruta) => readFile(ruta, "utf8"), listar = (carpeta) => readdir(carpeta) } = {}) {
  try {
    const nombres = (await listar(RUTA_INVESTIGACION)).filter((n) => /^informe-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();
    if (nombres.length === 0) return null;
    const nombre = nombres.at(-1);
    return { nombre, texto: await leer(new URL(nombre, RUTA_INVESTIGACION)) };
  } catch {
    return null;
  }
}

export async function construirSistema(leer = (ruta) => readFile(ruta, "utf8"), { listar } = {}) {
  const [cerebro, referencias, informe, piezas] = await Promise.all([
    leer(RUTA_CEREBRO),
    leer(RUTA_REFERENCIAS),
    leerUltimoInforme({ leer, listar }),
    leerPiezasDefinidas({ leer, listar }),
  ]);
  const bloqueInvestigacion = informe
    ? `

=== INVESTIGACIÓN DE MERCADO (${informe.nombre}) ===
${informe.texto}`
    : "";
  const bloquePiezas = piezas.length
    ? `

=== PIEZAS YA DEFINIDAS ===
${piezas.map((p) => p.texto.trim()).join("\n\n---\n\n")}`
    : "";
  return { cerebro, piezas, texto: `Sos el estratega de contenido de VOW, marca argentina de indumentaria y accesorios para entrenar. Proponés el plan de contenido de una semana para su perfil de Instagram. Solo proponés: una persona aprueba cada pieza antes de que salga.

Reglas:
- Todo lo que escribas sigue el cerebro de marca de abajo. Si algo lo contradice, gana el cerebro de marca.
- Hablás en voseo rioplatense. Cada pieza termina con una sola acción: anotarse en la lista de espera.
- Nunca inventes cifras, pruebas, stock, fechas ni opiniones. No uses números en los textos salvo "01" de "Drop 01".
- Solo podés proponer piezas que se puedan hacer con los recursos disponibles que te indican. Si no hay producto, no propongas mostrar producto.
- Las referencias son inspiración, no datos para citar. No copies sus textos ni sus ideas al pie de la letra.
- Los ganchos tienen que ser potentes y sobrios, como pide la sección 8 del cerebro de marca: afirmaciones cortas de 3 a 8 palabras, en imperativo, que comprometen. Nunca tono de tutorial, de consejo ni de lo que falta.
- Los ganchos de la sección 8 son ejemplos de estilo. A lo sumo UNO de los ganchos principales del plan puede ser uno de los aprobados; todos los demás tienen que ser creados por vos. Los ganchos alternativos son siempre nuevos: ni copias ni paráfrasis de los ejemplos.
- Cada pieza trae un gancho principal y 4 alternativos distintos entre sí. Las piezas de una misma semana tienen que ser de pilares distintos.
- La promesa es algo que una persona se hace a sí misma y cumple. No es un texto escrito: nunca propongas escribirla a mano ni mostrar papel, lapicera o cartulina.
- Nunca nombres elementos del gimnasio (barras, mancuernas, pesas, discos, kettlebells, fierros). Suenan forzados. El producto (grips, straps, prendas) sí se puede nombrar cuando hay producto.
- Cada pieza le habla a quien la mira y le da algo: una idea, un gesto, una razón para sumarse. No explica la marca por dentro (paleta, tipografías, manual de marca). Si una pieza de diseño o de proceso solo sirve para un diseñador, no la propongas.
- En "justificacion" explicá por qué la pieza encaja con la marca o con una referencia.
- Si abajo hay PIEZAS YA DEFINIDAS, son piezas ya decididas: no repitas su idea, no uses su formato y pilar en fechas cercanas (una semana) y no reutilices sus frases. Las piezas que se piden se suman a las definidas.
- Si abajo hay una INVESTIGACIÓN DE MERCADO, apoyate en ella: elegí formatos y estilos que los datos respaldan y evitá los que contradicen. Cuando una pieza se apoye en un hallazgo, nombralo por su título en "justificacion". La investigación es una guía con muestra chica, no una verdad: nunca gana sobre el cerebro de marca, no copies piezas ni textos de las marcas estudiadas y no uses sus cifras en los textos de la pieza.

=== CEREBRO DE MARCA ===
${cerebro}

=== MARCAS DE REFERENCIA ===
${referencias}${bloqueInvestigacion}${bloquePiezas}` };
}

// Pide el plan de una semana. `cliente` se inyecta para poder probar sin gastar plata.
export async function planificarSemana({ semanaInicio, fase, recursos = {}, notas = "", piezas = PIEZAS_POR_DEFECTO }, { cliente, modelo = MODELO_ESTRATEGA, leer, listar } = {}) {
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
    `Cantidad de piezas: ${piezas}. Pocas y fuertes: si no hay material real, es mejor menos piezas que rellenar.`,
    notas ? `Notas: ${notas}` : "",
  ].filter(Boolean).join("\n");

  const mensajes = [{ role: "user", content: `${pedido}\n\nRespondé llamando a la herramienta proponer_plan. No escribas nada fuera de la herramienta.` }];
  const uso = { entrada: 0, salida: 0 }; // cuánto se consumió, para controlar el gasto
  let bloque = null;
  let cortada = false; // la respuesta se quedó sin espacio antes de terminar el plan
  let maxTokens = MAX_TOKENS_ESTRATEGA;

  for (let intento = 1; intento <= INTENTOS_MAXIMOS && !bloque; intento++) {
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
    return { ok: false, plan: null, errores: [motivo], uso };
  }

  const { ok, errores } = validarPlan(bloque.input, { semanaInicio, recursos, piezas, ganchosConocidos, piezasDefinidas });
  return { ok, plan: ok ? bloque.input : null, errores, uso, propuesta: bloque.input };
}
