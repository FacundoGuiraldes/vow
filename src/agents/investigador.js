import { readFile } from "node:fs/promises";

// Investigador: analiza los datos reales de las cuentas de referencia y pone a prueba las ideas
// de formatos (hipótesis). Propone y nada más: no publica y no cambia al Estratega por su cuenta.
//
// Regla de oro: solo se afirma lo que los datos sostienen. Cada conclusión tiene que citar
// publicaciones reales (enlaces que existen en los datos) y decir qué tan segura es.

export const MODELO_INVESTIGADOR = "claude-sonnet-5-5";
export const VEREDICTOS = ["respaldada", "contradicha", "mixta", "no se puede medir con estos datos", "evidencia insuficiente"];
export const CONFIANZAS = ["alta", "media", "baja"];
// Un veredicto "fuerte" necesita al menos esta cantidad de publicaciones citadas
export const ENLACES_MINIMOS_VEREDICTO = 2;
const INTENTOS_MAXIMOS = 2;
const LARGO_MAXIMO_LINEA = 200;

const RUTA_CEREBRO = new URL("../../docs/marca/cerebro-de-marca.md", import.meta.url);

export const HERRAMIENTA_INFORME = {
  name: "entregar_informe",
  description: "Entrega el informe de investigación de las cuentas de referencia.",
  input_schema: {
    type: "object",
    required: ["resumen", "hallazgos", "hipotesis", "recomendaciones_para_estratega", "limites"],
    properties: {
      resumen: { type: "string", description: "En 3 o 4 frases, lo más importante que dicen los datos." },
      hallazgos: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["titulo", "evidencia", "enlaces", "confianza"],
          properties: {
            titulo: { type: "string" },
            evidencia: { type: "string", description: "Qué muestran los datos, con las cifras exactas que aparecen en ellos y de qué cuentas." },
            enlaces: { type: "array", items: { type: "string" }, description: "Enlaces (permalink) de publicaciones reales de los datos que respaldan el hallazgo." },
            confianza: { type: "string", enum: CONFIANZAS },
          },
        },
      },
      hipotesis: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "veredicto", "explicacion", "enlaces", "confianza"],
          properties: {
            id: { type: "string", description: "El id de la hipótesis, tal cual se te dio." },
            veredicto: { type: "string", enum: VEREDICTOS },
            explicacion: { type: "string", description: "Por qué ese veredicto, con la evidencia. Si no se puede medir, decí exactamente qué dato faltaría." },
            enlaces: { type: "array", items: { type: "string" } },
            confianza: { type: "string", enum: CONFIANZAS },
          },
        },
      },
      recomendaciones_para_estratega: { type: "array", items: { type: "string" }, description: "Qué conviene probar en @vow_ar, compatible con el cerebro de marca." },
      limites: { type: "array", items: { type: "string" }, description: "Qué no pudo saberse y por qué: tamaño de la muestra, vistas pagas, falta de imagen y sonido, etc." },
    },
  },
};

// Deja los datos en la forma más corta posible para no gastar de más
export function prepararDatos(datos) {
  const redondear = (x) => (x == null ? null : Number((x * 100).toFixed(3)));
  return {
    fecha: datos.fecha,
    cuentas: (datos.cuentas ?? []).map((c) => ({
      marca: c.marca,
      pais: c.pais,
      usuario: c.usuario,
      seguidores: c.seguidores,
      porTipo: Object.fromEntries(
        Object.entries(c.porTipo ?? {}).map(([tipo, r]) => [
          tipo,
          {
            cantidad: r.cantidad,
            mediana_reacciones_pct_seguidores: redondear(r.medianaReaccionesPorSeguidor),
            mediana_vistas_pct_seguidores: redondear(r.medianaVistasPorSeguidor),
          },
        ])
      ),
      publicaciones: (c.publicaciones ?? []).map((p) => ({
        enlace: p.enlace,
        tipo: p.tipo,
        fecha: p.fecha?.slice(0, 10),
        likes: p.likes,
        comentarios: p.comentarios,
        vistas: p.vistas,
        reacciones_pct_seguidores: redondear(p.reaccionesPorSeguidor),
        vistas_pct_seguidores: redondear(p.vistasPorSeguidor),
        primera_linea: String(p.primeraLinea ?? "").slice(0, LARGO_MAXIMO_LINEA),
        palabras_texto: p.palabras,
        emojis: p.emojis,
        hashtags: p.hashtags,
      })),
    })),
  };
}

export function enlacesDeLosDatos(datos) {
  return new Set((datos.cuentas ?? []).flatMap((c) => (c.publicaciones ?? []).map((p) => p.enlace).filter(Boolean)));
}

// Revisa que el informe tenga la forma pedida y que no cite nada inventado.
export function validarInforme(informe, { hipotesis = [], enlacesConocidos = new Set() } = {}) {
  const errores = [];
  if (!informe || typeof informe !== "object") return { ok: false, errores: ["El informe no es un objeto."] };
  if (typeof informe.resumen !== "string" || informe.resumen.trim() === "") errores.push("Falta el resumen.");
  if (!Array.isArray(informe.hallazgos) || informe.hallazgos.length === 0) errores.push("No hay hallazgos.");
  if (!Array.isArray(informe.limites) || informe.limites.length === 0) errores.push("Faltan los límites: todo informe tiene que decir qué no pudo saberse.");
  if (!Array.isArray(informe.recomendaciones_para_estratega)) errores.push("Faltan las recomendaciones para el Estratega.");

  const revisarEnlaces = (enlaces, donde) => {
    if (!Array.isArray(enlaces)) return errores.push(`${donde}: faltan los enlaces.`);
    for (const e of enlaces) if (!enlacesConocidos.has(e)) errores.push(`${donde}: cita un enlace que no está en los datos ("${e}").`);
  };

  (informe.hallazgos ?? []).forEach((h, i) => {
    const donde = `Hallazgo ${i + 1}`;
    if (!CONFIANZAS.includes(h?.confianza)) errores.push(`${donde}: confianza inválida (${h?.confianza}).`);
    if (typeof h?.evidencia !== "string" || h.evidencia.trim() === "") errores.push(`${donde}: falta la evidencia.`);
    revisarEnlaces(h?.enlaces, donde);
    if (Array.isArray(h?.enlaces) && h.enlaces.length === 0) errores.push(`${donde}: un hallazgo sin publicaciones citadas no se puede comprobar.`);
  });

  const respondidas = new Map();
  for (const h of informe.hipotesis ?? []) {
    const donde = `Hipótesis "${h?.id}"`;
    if (respondidas.has(h?.id)) errores.push(`${donde}: está repetida.`);
    respondidas.set(h?.id, h);
    if (!hipotesis.some((x) => x.id === h?.id)) errores.push(`${donde}: no es una de las hipótesis pedidas.`);
    if (!VEREDICTOS.includes(h?.veredicto)) errores.push(`${donde}: veredicto inválido (${h?.veredicto}).`);
    if (!CONFIANZAS.includes(h?.confianza)) errores.push(`${donde}: confianza inválida (${h?.confianza}).`);
    if (typeof h?.explicacion !== "string" || h.explicacion.trim() === "") errores.push(`${donde}: falta la explicación.`);
    revisarEnlaces(h?.enlaces, donde);
    const fuerte = ["respaldada", "contradicha", "mixta"].includes(h?.veredicto);
    if (fuerte && Array.isArray(h?.enlaces) && h.enlaces.length < ENLACES_MINIMOS_VEREDICTO) {
      errores.push(`${donde}: un veredicto "${h.veredicto}" necesita al menos ${ENLACES_MINIMOS_VEREDICTO} publicaciones citadas.`);
    }
  }
  for (const { id } of hipotesis) if (!respondidas.has(id)) errores.push(`Falta responder la hipótesis "${id}".`);

  return { ok: errores.length === 0, errores };
}

export async function construirSistemaInvestigador(leer = (ruta) => readFile(ruta, "utf8")) {
  const cerebro = await leer(RUTA_CEREBRO);
  return `Sos el investigador de contenido de VOW, marca argentina de indumentaria y accesorios para entrenar. Analizás datos reales de cuentas de Instagram de marcas de referencia y ponés a prueba ideas de formatos para captar la atención del público de VOW. Solo informás: una persona decide qué se hace con tu informe.

Reglas:
- Afirmá solo lo que los datos sostienen. Nunca inventes cifras, publicaciones, enlaces ni motivos. Usá las cifras tal como aparecen en los datos.
- Cada hallazgo y cada veredicto cita publicaciones reales por su enlace. Un veredicto "respaldada", "contradicha" o "mixta" necesita al menos ${ENLACES_MINIMOS_VEREDICTO} publicaciones citadas.
- Comparás siempre contra el tamaño de la cuenta (los datos traen porcentajes sobre seguidores) y con la mediana por tipo, nunca con una publicación suelta: el mismo texto puede tener 595 mil o 13 mil vistas.
- Las vistas existen solo en videos e incluyen las pagas. Los carruseles no tienen vistas. Una cuenta con muchas vistas puede estar impulsando con publicidad.
- La muestra es chica (pocas publicaciones por cuenta y por tipo). Decilo cuando corresponda y bajá la confianza.
- Lo que los datos NO traen: la imagen, el sonido, la música, los primeros segundos del video, los guardados ni los compartidos. Solo hay números, tipo de publicación, fecha, enlace y la primera línea del texto. Si una hipótesis depende de algo visual o sonoro, el veredicto es "no se puede medir con estos datos" y explicás qué dato faltaría. No lo adivines.
- "evidencia insuficiente" es válido y honesto cuando hay datos pero no alcanzan.
- Las recomendaciones para el Estratega tienen que ser compatibles con el cerebro de marca de abajo (voseo, sobriedad, sin motivación vacía, sin mostrar lo que todavía no existe, sin producto físico por ahora).
- Respondé siempre en español rioplatense.

=== CEREBRO DE MARCA ===
${cerebro}`;
}

export function armarPedido({ datos, hipotesis }) {
  return [
    "Estos son los datos reales de las cuentas de referencia (porcentajes sobre seguidores):",
    JSON.stringify(prepararDatos(datos)),
    "",
    "Estas son las ideas de formatos que hay que poner a prueba. Respondé CADA una, con su id:",
    JSON.stringify(hipotesis),
    "",
    "Además, buscá patrones propios en los datos: qué tipo de publicación rinde mejor según la cuenta, qué estilo de primera línea de texto aparece en lo que mejor rinde, y qué difiere entre la cuenta argentina y las del exterior.",
    "Respondé llamando a la herramienta entregar_informe. No escribas nada fuera de la herramienta.",
  ].join("\n");
}

// `cliente` se inyecta para poder probar sin gastar plata.
export async function analizarMercado({ datos, hipotesis }, { cliente, modelo = MODELO_INVESTIGADOR, leer } = {}) {
  if (!cliente) throw new Error("Falta el cliente de Anthropic.");
  if (!datos?.cuentas?.length) throw new Error("No hay datos de cuentas para analizar.");

  const system = await construirSistemaInvestigador(leer);
  const mensajes = [{ role: "user", content: armarPedido({ datos, hipotesis }) }];
  const uso = { entrada: 0, salida: 0 };
  let bloque = null;

  for (let intento = 1; intento <= INTENTOS_MAXIMOS && !bloque; intento++) {
    // Sonnet 5.5 no acepta obligar el uso de una herramienta: se usa "auto" y se reintenta una vez
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: 8192,
      system,
      messages: mensajes,
      tools: [HERRAMIENTA_INFORME],
      tool_choice: { type: "auto" },
    });
    uso.entrada += respuesta.usage?.input_tokens ?? 0;
    uso.salida += respuesta.usage?.output_tokens ?? 0;
    bloque = respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_INFORME.name) ?? null;
    if (!bloque) {
      mensajes.push({ role: "assistant", content: respuesta.content ?? [] });
      mensajes.push({ role: "user", content: "Tenés que responder llamando a la herramienta entregar_informe." });
    }
  }
  if (!bloque) return { ok: false, informe: null, errores: ["La respuesta no trajo el informe en el formato esperado."], uso };

  const { ok, errores } = validarInforme(bloque.input, { hipotesis, enlacesConocidos: enlacesDeLosDatos(datos) });
  return { ok, informe: ok ? bloque.input : null, errores, uso, propuesta: bloque.input };
}

// Versión legible del informe, para leer en el resumen de GitHub o en un archivo
export function informeAMarkdown(informe, { hipotesis = [], fecha = "" } = {}) {
  const nombres = Object.fromEntries(hipotesis.map((h) => [h.id, h.nombre]));
  const enlaces = (lista) => (lista?.length ? "\n" + lista.map((e) => `  - ${e}`).join("\n") : "");
  return [
    `# Informe de investigación${fecha ? ` · ${fecha}` : ""}`,
    "",
    "## Resumen",
    informe.resumen,
    "",
    "## Hallazgos",
    ...informe.hallazgos.map((h) => `- **${h.titulo}** (confianza ${h.confianza}). ${h.evidencia}${enlaces(h.enlaces)}`),
    "",
    "## Ideas puestas a prueba",
    ...informe.hipotesis.map((h) => `- **${nombres[h.id] ?? h.id}**: ${h.veredicto} (confianza ${h.confianza}). ${h.explicacion}${enlaces(h.enlaces)}`),
    "",
    "## Para el Estratega",
    ...informe.recomendaciones_para_estratega.map((r) => `- ${r}`),
    "",
    "## Límites",
    ...informe.limites.map((l) => `- ${l}`),
    "",
  ].join("\n");
}
