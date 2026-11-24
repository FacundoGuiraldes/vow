import { readdir, readFile } from "node:fs/promises";
import { revisarReglas, cifrasNoPermitidas, contextoDeCifra, CIFRAS_PERMITIDAS } from "./reglas-marca.js";

// Estratega: propone el FLUJO de una semana para @vow_ar: qué se publica cada día y de qué trata. Nada más.
// No escribe textos, ganchos ni guiones, no arma piezas y no publica: Facundo decide y hace cada publicación.

export const MODELO_ESTRATEGA = "claude-sonnet-5-5";
export const FORMATOS = ["reel", "carrusel", "imagen", "story"];
export const MAXIMO_PUBLICACIONES = 7;
export const LARGO_MINIMO_CONTENIDO = 20;
export const LARGO_MAXIMO_CONTENIDO = 600;
const INTENTOS_MAXIMOS = 2;
export const MAX_TOKENS_ESTRATEGA = 4096;
const RUTA_CEREBRO = new URL("../../docs/marca/cerebro-de-marca.md", import.meta.url);
const RUTA_BANCO = new URL("../../docs/marca/banco-de-contenido.md", import.meta.url);
const RUTA_PSICOLOGIA = new URL("../../docs/marca/psicologia-de-marketing.md", import.meta.url);
const RUTA_REFERENCIAS = new URL("../../docs/marca/referencias.md", import.meta.url);
const RUTA_INVESTIGACION = new URL("../../docs/investigacion/", import.meta.url);
const RUTA_RENDIMIENTO = new URL("../../docs/rendimiento/", import.meta.url);

// El formato de salida se le pide a la IA con una "herramienta" cuyo esquema es este: la respuesta llega como datos.
// Con Claude Sonnet 5.5 la API NO acepta obligar el uso de una herramienta (tool_choice "tool" o "any" dan 400): se usa "auto",
// se le pide en el mensaje y, si no la usa, se reintenta una vez.
export const HERRAMIENTA_PLAN = {
  name: "proponer_flujo",
  description: "Devuelve el flujo de publicaciones de la semana para el perfil de Instagram de VOW.",
  input_schema: {
    type: "object",
    required: ["dias"],
    properties: {
      dias: {
        type: "array",
        minItems: 1,
        maxItems: MAXIMO_PUBLICACIONES,
        items: {
          type: "object",
          required: ["fecha", "formato", "contenido"],
          properties: {
            fecha: { type: "string", description: "AAAA-MM-DD, dentro de la semana pedida." },
            formato: { type: "string", enum: FORMATOS },
            contenido: { type: "string", description: "De qué trata la publicación de ese día y qué se ve, en una a tres frases concretas. No es el texto final: no lleva gancho, epígrafe, guion ni hashtags." },
          },
        },
      },
    },
  },
};

// A veces la IA manda la lista como un texto con JSON en vez de como lista: se recupera sin gastar otra llamada.
export function recuperarDiasEnTexto(input) {
  if (!input || typeof input.dias !== "string") return input;
  try {
    const lista = JSON.parse(input.dias);
    return Array.isArray(lista) ? { ...input, dias: lista } : input;
  } catch {
    return input;
  }
}

const sumarDias = (fechaISO, dias) => {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
};

const esFechaISO = (valor) => typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor));

// Revisa que el flujo tenga la forma pedida y no rompa las reglas duras de la marca (datos inventados, tono, voseo).
// Devuelve { ok, errores }. Con algún error, el flujo se descarta.
export function validarPlan(plan, { semanaInicio, cifrasPermitidas = CIFRAS_PERMITIDAS } = {}) {
  const errores = [];
  if (!plan || typeof plan !== "object") return { ok: false, errores: ["El flujo no es un objeto."] };
  if (!Array.isArray(plan.dias)) return { ok: false, errores: [`El flujo no tiene días: "dias" ${plan.dias === undefined ? "no vino" : `llegó como ${typeof plan.dias}`}.`] };
  if (plan.dias.length === 0) return { ok: false, errores: ["El flujo no tiene publicaciones."] };
  if (plan.dias.length > MAXIMO_PUBLICACIONES) errores.push(`Hay más de ${MAXIMO_PUBLICACIONES} publicaciones.`);

  const desde = semanaInicio;
  const hasta = semanaInicio ? sumarDias(semanaInicio, 6) : null;
  const vistas = new Set();
  plan.dias.forEach((dia, i) => {
    const etiqueta = `Publicación ${i + 1}`;
    if (!esFechaISO(dia?.fecha)) errores.push(`${etiqueta}: la fecha no es AAAA-MM-DD.`);
    else if (desde && (dia.fecha < desde || dia.fecha > hasta)) errores.push(`${etiqueta}: la fecha ${dia.fecha} está fuera de la semana (${desde} a ${hasta}).`);
    if (!FORMATOS.includes(dia?.formato)) errores.push(`${etiqueta}: formato inválido (${dia?.formato}).`);
    const clave = `${dia?.fecha}|${dia?.formato}`;
    if (vistas.has(clave)) errores.push(`${etiqueta}: repite el formato ${dia.formato} el mismo día.`);
    vistas.add(clave);
    const contenido = typeof dia?.contenido === "string" ? dia.contenido.trim() : "";
    if (contenido.length < LARGO_MINIMO_CONTENIDO) {
      errores.push(`${etiqueta}: el contenido es muy corto (mínimo ${LARGO_MINIMO_CONTENIDO} caracteres): decí de qué trata y qué se ve.`);
      return;
    }
    if (contenido.length > LARGO_MAXIMO_CONTENIDO) errores.push(`${etiqueta}: el contenido supera ${LARGO_MAXIMO_CONTENIDO} caracteres: es una idea, no el texto final.`);
    for (const { regla, fragmento } of revisarReglas(contenido, { soloDuras: true })) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
    for (const cifra of cifrasNoPermitidas(contenido, cifrasPermitidas, { produccion: true })) errores.push(`${etiqueta}: la cifra "${cifra}" no está en los datos cargados ("${contextoDeCifra(contenido, cifra)}").`);
  });
  return { ok: errores.length === 0, errores };
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
  const [cerebro, banco, psicologia, referencias, informe, patrones, rendimiento] = await Promise.all([
    leer(RUTA_CEREBRO),
    leer(RUTA_BANCO).catch(() => ""),
    leer(RUTA_PSICOLOGIA).catch(() => ""),
    leer(RUTA_REFERENCIAS),
    leerUltimoInforme({ leer, listar }),
    leerUltimosPatrones({ leer, listar }),
    leerUltimoRendimiento({ leer, listar }),
  ]);
  const bloque = (titulo, doc) => (doc ? `\n\n=== ${titulo} (${doc.nombre}) ===\n${doc.texto}` : "");
  return { cerebro, texto: `Sos el estratega de contenido de VOW, marca argentina de indumentaria y accesorios para entrenar. Proponés el FLUJO de una semana para su perfil de Instagram: qué se publica cada día, en qué formato, y de qué trata. Nada más: no escribís ganchos, guiones, epígrafes, horas ni hashtags, y no armás piezas. Facundo decide y hace cada publicación.

Reglas:
- Todo lo que escribas sigue el cerebro de marca de abajo. Si algo lo contradice, gana el cerebro de marca. Voseo rioplatense.
- Cada publicación dice, en una a tres frases concretas, de qué trata y qué se ve en el primer segundo (algo que se pueda filmar, fotografiar o dibujar). Nada de frases vacías, teasers sin dato ni sentencias.
- Nunca inventes cifras, pruebas, stock, fechas ni opiniones. No uses números salvo los que permite el cerebro de marca. No uses urgencia ni escasez falsas.
- Solo proponé lo que se puede hacer con los recursos que te indican: sin producto no propongas mostrar producto; sin gente confirmada no propongas gente que entrena.
- Armá un flujo con ritmo: mezclá formatos (las stories son el canal diario y barato; sumá una o dos publicaciones de feed) y no repitas la misma idea dos días. Con poco para mostrar, pocas publicaciones y buenas; no rellenes para llegar a un número.
- Si hay un FOCO DE LA SEMANA o novedades de Facundo, el flujo gira alrededor de eso y las tomás como ciertas.
- Apoyate en la investigación y en el rendimiento de @vow_ar si están abajo: repetí lo que guardaron y compartieron, cambiá lo que no generó interacción. Con muestra chica es una señal, no una conclusión. No copies ideas ni textos de las referencias.

=== CEREBRO DE MARCA ===
${cerebro}
${banco ? `\n=== BANCO DE CONTENIDO ===\n${banco}\n` : ""}${psicologia ? `\n=== PSICOLOGÍA DE MARKETING ===\n${psicologia}\n` : ""}
=== MARCAS DE REFERENCIA ===
${referencias}${bloque("INVESTIGACIÓN DE MERCADO", informe)}${bloque("QUÉ FUNCIONÓ EN EL MERCADO", patrones)}${bloque("RENDIMIENTO DE @vow_ar", rendimiento)}` };
}

// Pide el flujo de una semana. `cliente` se inyecta para poder probar sin gastar plata.
export async function planificarSemana({ semanaInicio, fase, recursos = {}, notas = "" }, { cliente, modelo = MODELO_ESTRATEGA, leer, listar } = {}) {
  if (!esFechaISO(semanaInicio)) throw new Error("semanaInicio tiene que ser AAAA-MM-DD.");
  if (!cliente) throw new Error("Falta el cliente de Anthropic.");

  const { texto: system } = await construirSistema(leer, { listar });
  const pedido = [
    `Armá el flujo de la semana que empieza el ${semanaInicio} (hasta el ${sumarDias(semanaInicio, 6)}): qué se publica cada día y de qué trata.`,
    `Fase del proyecto: ${fase}.`,
    `Recursos disponibles: producto físico: ${recursos.producto ? "sí" : "no"}; personas que entrenan confirmadas: ${recursos.gente ? "sí" : "no"}.`,
    `Cantidad: la decidís vos, entre 1 y ${MAXIMO_PUBLICACIONES} publicaciones, según el material real que hay.`,
    notas ? `Notas: ${notas}` : "",
  ].filter(Boolean).join("\n");

  const mensajes = [{ role: "user", content: `${pedido}\n\nRespondé llamando a la herramienta ${HERRAMIENTA_PLAN.name}. No escribas nada fuera de la herramienta.` }];
  const uso = { entrada: 0, salida: 0 };
  const llamar = async (msgs) => {
    const respuesta = await cliente.messages.create({ model: modelo, max_tokens: MAX_TOKENS_ESTRATEGA, system, messages: msgs, tools: [HERRAMIENTA_PLAN], tool_choice: { type: "auto" } });
    uso.entrada += respuesta.usage?.input_tokens ?? 0;
    uso.salida += respuesta.usage?.output_tokens ?? 0;
    const bloque = respuesta.stop_reason === "max_tokens" ? null : respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_PLAN.name) ?? null;
    return { respuesta, bloque };
  };

  let bloque = null;
  let intentos = 0;
  for (let intento = 1; intento <= INTENTOS_MAXIMOS && !bloque; intento++) {
    intentos++;
    const r = await llamar(mensajes);
    bloque = r.bloque;
    if (!bloque) {
      mensajes.push({ role: "assistant", content: r.respuesta.content ?? [] });
      mensajes.push({ role: "user", content: `Tenés que responder llamando a la herramienta ${HERRAMIENTA_PLAN.name}.` });
    }
  }
  if (!bloque) return { ok: false, plan: null, errores: ["La respuesta no trajo el flujo en el formato esperado."], uso, intentos };

  let input = recuperarDiasEnTexto(bloque.input);
  let validacion = validarPlan(input, { semanaInicio });
  if (!validacion.ok) {
    // Un flujo que no pasa las reglas tiene una segunda oportunidad: se le devuelven los errores a la IA
    try {
      const { bloque: corregido } = await llamar([
        ...mensajes,
        { role: "assistant", content: [{ type: "tool_use", id: bloque.id, name: HERRAMIENTA_PLAN.name, input }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: bloque.id, is_error: true, content: `El flujo no pasó las reglas. Corregilo y mandalo de nuevo con la herramienta (dias tiene que ser una lista):\n- ${validacion.errores.join("\n- ")}` }] },
      ]);
      intentos++;
      if (corregido) {
        const nuevo = recuperarDiasEnTexto(corregido.input);
        const v = validarPlan(nuevo, { semanaInicio });
        if (v.ok) {
          input = nuevo;
          validacion = v;
        }
      }
    } catch {
      // Si el reintento falla (red, crédito) se informan los errores del primer intento
    }
  }
  return { ok: validacion.ok, plan: validacion.ok ? input : null, errores: validacion.errores, uso, propuesta: input, intentos };
}
