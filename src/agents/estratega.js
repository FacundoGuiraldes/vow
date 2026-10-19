import { readFile } from "node:fs/promises";
import { revisarReglas, cifrasNoPermitidas } from "./reglas-marca.js";

// Estratega: propone el plan de contenido de UNA semana para @vow_ar.
// Propone y nada más: no publica. Una persona aprueba cada pieza.

export const MODELO_ESTRATEGA = "claude-sonnet-5-5";
export const FORMATOS = ["reel", "carrusel", "imagen", "story"];
export const PILARES = ["promesa", "proceso", "producto en uso", "gente que entrena", "lanzamiento"];
export const MAXIMO_PIEZAS = 5;
const INTENTOS_MAXIMOS = 2;
const LARGO_MAXIMO_GANCHO = 140;
const RUTA_CEREBRO = new URL("../../docs/marca/cerebro-de-marca.md", import.meta.url);
const RUTA_REFERENCIAS = new URL("../../docs/marca/referencias.md", import.meta.url);

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
          required: ["fecha", "formato", "pilar", "gancho", "guion", "texto_en_pantalla", "epigrafe", "palabras_clave", "cta", "recursos", "justificacion"],
          properties: {
            fecha: { type: "string", description: "AAAA-MM-DD, dentro de la semana pedida." },
            formato: { type: "string", enum: FORMATOS },
            pilar: { type: "string", enum: PILARES },
            gancho: { type: "string", description: "Lo que se dice o se lee en los primeros 3 segundos." },
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

const textosDeLaPieza = (pieza) => [
  pieza.gancho,
  pieza.guion,
  pieza.epigrafe,
  pieza.cta,
  ...(Array.isArray(pieza.texto_en_pantalla) ? pieza.texto_en_pantalla : []),
];

// Revisa que el plan tenga la forma pedida y cumpla las reglas de marca.
// Devuelve { ok, errores }. Si hay algún error, el plan se descarta (no se guarda).
export function validarPlan(plan, { semanaInicio, recursos = {}, cifrasPermitidas = ["01"] } = {}) {
  const errores = [];
  if (!plan || typeof plan !== "object") return { ok: false, errores: ["El plan no es un objeto."] };
  if (typeof plan.resumen !== "string" || plan.resumen.trim() === "") errores.push("Falta el resumen.");
  if (!Array.isArray(plan.piezas) || plan.piezas.length === 0) {
    return { ok: false, errores: [...errores, "El plan no tiene piezas."] };
  }
  if (plan.piezas.length > MAXIMO_PIEZAS) errores.push(`Hay más de ${MAXIMO_PIEZAS} piezas.`);

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
    if (typeof pieza.gancho === "string" && pieza.gancho.length > LARGO_MAXIMO_GANCHO) {
      errores.push(`${etiqueta}: el gancho supera ${LARGO_MAXIMO_GANCHO} caracteres.`);
    }
    // Una sola acción: anotarse en la lista de espera
    if (typeof pieza.cta === "string" && !/lista/i.test(pieza.cta)) errores.push(`${etiqueta}: la acción final tiene que ser anotarse en la lista.`);

    // No se puede mostrar lo que todavía no existe
    if (pieza.pilar === "producto en uso" && !recursos.producto) errores.push(`${etiqueta}: pide "producto en uso" pero todavía no hay producto.`);
    if (pieza.pilar === "gente que entrena" && !recursos.gente) errores.push(`${etiqueta}: pide "gente que entrena" pero no hay personas confirmadas.`);

    for (const texto of textosDeLaPieza(pieza)) {
      for (const { regla, fragmento } of revisarReglas(texto)) errores.push(`${etiqueta}: ${regla} ("${fragmento}").`);
      for (const cifra of cifrasNoPermitidas(texto, cifrasPermitidas)) errores.push(`${etiqueta}: la cifra "${cifra}" no está en los datos cargados.`);
    }
  });

  return { ok: errores.length === 0, errores };
}

export async function construirSistema(leer = (ruta) => readFile(ruta, "utf8")) {
  const [cerebro, referencias] = await Promise.all([leer(RUTA_CEREBRO), leer(RUTA_REFERENCIAS)]);
  return `Sos el estratega de contenido de VOW, marca argentina de indumentaria y accesorios para entrenar. Proponés el plan de contenido de una semana para su perfil de Instagram. Solo proponés: una persona aprueba cada pieza antes de que salga.

Reglas:
- Todo lo que escribas sigue el cerebro de marca de abajo. Si algo lo contradice, gana el cerebro de marca.
- Hablás en voseo rioplatense. Cada pieza termina con una sola acción: anotarse en la lista de espera.
- Nunca inventes cifras, pruebas, stock, fechas ni opiniones. No uses números en los textos salvo "01" de "Drop 01".
- Solo podés proponer piezas que se puedan hacer con los recursos disponibles que te indican. Si no hay producto, no propongas mostrar producto.
- Las referencias son inspiración, no datos para citar. No copies sus textos ni sus ideas al pie de la letra.
- En "justificacion" explicá por qué la pieza encaja con la marca o con una referencia.

=== CEREBRO DE MARCA ===
${cerebro}

=== MARCAS DE REFERENCIA ===
${referencias}`;
}

// Pide el plan de una semana. `cliente` se inyecta para poder probar sin gastar plata.
export async function planificarSemana({ semanaInicio, fase, recursos = {}, notas = "" }, { cliente, modelo = MODELO_ESTRATEGA, leer } = {}) {
  if (!esFechaISO(semanaInicio)) throw new Error("semanaInicio tiene que ser AAAA-MM-DD.");
  if (!cliente) throw new Error("Falta el cliente de Anthropic.");

  const system = await construirSistema(leer);
  const pedido = [
    `Armá el plan de la semana que empieza el ${semanaInicio} (hasta el ${sumarDias(semanaInicio, 6)}).`,
    `Fase del proyecto: ${fase}.`,
    `Recursos disponibles: producto físico: ${recursos.producto ? "sí" : "no"}; personas que entrenan confirmadas: ${recursos.gente ? "sí" : "no"}.`,
    "Ritmo propuesto: 3 piezas (2 reels y 1 carrusel).",
    notas ? `Notas: ${notas}` : "",
  ].filter(Boolean).join("\n");

  const mensajes = [{ role: "user", content: `${pedido}\n\nRespondé llamando a la herramienta proponer_plan. No escribas nada fuera de la herramienta.` }];
  const uso = { entrada: 0, salida: 0 }; // cuánto se consumió, para controlar el gasto
  let bloque = null;

  for (let intento = 1; intento <= INTENTOS_MAXIMOS && !bloque; intento++) {
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: 4096,
      system,
      messages: mensajes,
      tools: [HERRAMIENTA_PLAN],
      tool_choice: { type: "auto" },
    });
    uso.entrada += respuesta.usage?.input_tokens ?? 0;
    uso.salida += respuesta.usage?.output_tokens ?? 0;

    bloque = respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_PLAN.name) ?? null;
    if (!bloque) {
      // La IA contestó con texto: se le recuerda que tiene que usar la herramienta
      mensajes.push({ role: "assistant", content: respuesta.content ?? [] });
      mensajes.push({ role: "user", content: "Tenés que responder llamando a la herramienta proponer_plan." });
    }
  }

  if (!bloque) return { ok: false, plan: null, errores: ["La respuesta no trajo el plan en el formato esperado."], uso };

  const { ok, errores } = validarPlan(bloque.input, { semanaInicio, recursos });
  return { ok, plan: ok ? bloque.input : null, errores, uso, propuesta: bloque.input };
}
