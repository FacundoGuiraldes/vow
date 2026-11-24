// El chat con la IA: lo que el modelo puede hacer (herramientas) y cómo se le explica el trabajo (sistema).
// Las herramientas están en el formato de Gemini (tipos en mayúscula). Ninguna publica nada: el bot no publica en Instagram.
import { fechaLegible, nombreDelDia, sumarDias } from "./fechas.js";

export const MENSAJES_MAXIMOS_POR_DIA = 80; // freno de uso: el plan gratis tiene cupo diario
export const TURNOS_DE_MEMORIA = 30; // cuántos mensajes de la charla se recuerdan (la misma charla para Telegram y para el juego)
export const LARGO_MAXIMO_RECUERDO = 1500;

export const HERRAMIENTAS_CHAT = [
  { name: "ver_flujo", description: "Muestra el flujo de publicaciones de esta semana y de la próxima (día, formato y contenido), si ya se armó." },
  { name: "ver_operacion", description: "Muestra la estrategia de la semana (con los id de cada línea), la agenda y lo que se cambió desde el juego o el chat.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "editar_dato",
    description: "Cambia el foco de la semana o las notas de estrategia. El juego lo ve al instante. Mandá valor vacío para volver a lo que dicen los documentos.",
    parameters: {
      type: "OBJECT",
      properties: {
        campo: { type: "STRING", description: "estrategia.foco o estrategia.notas." },
        valor: { type: "STRING", description: "El texto nuevo, corto y claro." },
      },
      required: ["campo", "valor"],
    },
  },
  {
    name: "editar_estrategia",
    description: "Cambia la estrategia de ESTA semana (sale de la investigación y vale hasta el lunes). accion: agregar una línea nueva (texto), editar una existente (id y texto nuevo), quitar una (id) o restaurar todo a lo que dice la investigación. Los id salen de ver_operacion.",
    parameters: { type: "OBJECT", properties: { accion: { type: "STRING", description: "agregar, editar, quitar o restaurar." }, id: { type: "STRING" }, texto: { type: "STRING", description: "El texto de la línea, corto y claro." } }, required: ["accion"] },
  },
  {
    name: "descuento_lista_espera",
    description: "Beneficio para quienes se anotaron en la lista de espera: un mail con diseño de VOW y un código de descuento único por persona. accion: ver (cuántos anotados, a cuántos falta avisar, cuántos códigos se usaron), prueba (manda el mail de ejemplo a un mail de destino, con un código de muestra que no sirve) o enviar (manda los códigos reales a quienes todavía no recibieron). Antes de enviar SIEMPRE hacé ver, decile a Facundo cuántas personas son y esperá que confirme; en enviar pasá esa cantidad en esperados. Nunca envíes sin que Facundo lo haya pedido y confirmado en este chat.",
    parameters: { type: "OBJECT", properties: { accion: { type: "STRING", description: "ver, prueba o enviar." }, destino: { type: "STRING", description: "Solo para prueba: el mail donde se recibe el ejemplo." }, esperados: { type: "INTEGER", description: "Solo para enviar: la cantidad de personas por avisar que Facundo confirmó." } }, required: ["accion"] },
  },
  { name: "ver_stock", description: "Muestra el stock del Almacén (gorras negras y beige, shakers negros y claros, medias), las ventas recientes, los totales y qué se puede vender con su precio." },
  {
    name: "registrar_llegada",
    description: "Suma al stock mercadería que llegó. El Almacén y la Caja del juego lo ven al instante. producto: gorra-negra, gorra-beige, shaker-negro, shaker-claro o medias (pares).",
    parameters: { type: "OBJECT", properties: { producto: { type: "STRING" }, cantidad: { type: "INTEGER" }, nota: { type: "STRING", description: "Opcional." } }, required: ["producto", "cantidad"] },
  },
  {
    name: "ajustar_stock",
    description: "Corrige el stock de un producto a la cantidad exacta que hay (por conteo o error). No es para ventas: para eso, registrar_venta.",
    parameters: { type: "OBJECT", properties: { producto: { type: "STRING" }, cantidad: { type: "INTEGER" }, nota: { type: "STRING" } }, required: ["producto", "cantidad"] },
  },
  {
    name: "registrar_venta",
    description: "Registra una venta y resta el stock sola. El precio lo define el sistema: NO se puede cambiar ni inventar. Cada item: producto (gorra, medias, shaker, pledge, kept, oath, medias2 o medias3), cantidad, y el color si lleva gorra (gorra: negra o beige) o shaker (shaker: negro o claro). Si falta un color, preguntáselo a Facundo antes. Si no alcanza el stock, no se registra.",
    parameters: {
      type: "OBJECT",
      properties: {
        items: { type: "ARRAY", items: { type: "OBJECT", properties: { producto: { type: "STRING" }, cantidad: { type: "INTEGER" }, gorra: { type: "STRING", description: "negra o beige." }, shaker: { type: "STRING", description: "negro o claro." } }, required: ["producto", "cantidad"] } },
        nota: { type: "STRING", description: "Opcional: quién compró o cómo pagó." },
        fecha: { type: "STRING", description: "AAAA-MM-DD, solo si no fue hoy." },
      },
      required: ["items"],
    },
  },
  { name: "anular_venta", description: "Anula una venta registrada y devuelve su stock al Almacén (usá el id_venta o el id que devuelve ver_stock).", parameters: { type: "OBJECT", properties: { id: { type: "STRING" } }, required: ["id"] } },
  {
    name: "agregar_agenda",
    description: "Agrega un evento a la agenda de la oficina (llegada de mercadería, una reunión, una fecha límite). Las publicaciones no van acá: son del flujo semanal, que arma el Estratega los lunes.",
    parameters: {
      type: "OBJECT",
      properties: {
        fecha: { type: "STRING", description: "AAAA-MM-DD." },
        hora: { type: "STRING", description: "HH:MM, opcional." },
        sala: { type: "STRING", description: "estrategia, bot, diseno, deposito o recepcion." },
        texto: { type: "STRING", description: "Qué pasa ese día." },
      },
      required: ["fecha", "texto"],
    },
  },
  { name: "quitar_agenda", description: "Quita un evento de la agenda que se agregó antes (usá el id que devuelve ver_operacion).", parameters: { type: "OBJECT", properties: { id: { type: "STRING" } }, required: ["id"] } },
  { name: "anotar_novedad", description: "Guarda una novedad de VOW (un dato nuevo del proyecto) para que el Estratega la use en el flujo del próximo lunes.", parameters: { type: "OBJECT", properties: { texto: { type: "STRING" } }, required: ["texto"] } },
];

// Calendario de los próximos días con el día de la semana: los modelos fallan seguido al calcular "el viernes" o "pasado mañana"
// Incluye anteayer y ayer: sin eso el modelo confunde "ayer" con el día anterior al que corresponde
export function calendario(hoy, dias = 15) {
  const pasados = [[-2, "anteayer"], [-1, "ayer"]].map(([i, nombre]) => `${nombre}: ${fechaLegible(sumarDias(hoy, i))} = ${sumarDias(hoy, i)}`);
  const proximos = Array.from({ length: dias }, (_, i) => {
    const f = sumarDias(hoy, i);
    return `${i === 0 ? "hoy" : i === 1 ? "mañana" : ""}${i < 2 ? ": " : ""}${fechaLegible(f)} = ${f}`;
  });
  return [...pasados, ...proximos].join("\n");
}

export function construirSistemaChat({ fecha, hora }) {
  return `Sos el asistente de Facundo para la operación de VOW (@vow_ar), una marca argentina de ropa y accesorios para entrenar. Hablás con él por Telegram y también por el juego VOW HQ (la oficina en la web): es la MISMA charla, con la misma memoria. Los mensajes que vienen del juego empiezan con «[Mensaje escrito en el juego VOW HQ]». Lo que acordaron en un lado vale en el otro.

Cómo hablás: en español rioplatense (voseo), claro, cálido y breve. Texto plano: sin Markdown, sin asteriscos ni títulos. Respuestas cortas, de pocas líneas. Si algo es ambiguo, preguntá antes de cambiar.

Ahora es ${nombreDelDia(fecha)} ${fecha}, ${hora} (hora de Argentina). Calendario:
${calendario(fecha)}

Cómo trabajás:
- «Hoy», «ayer» y «mañana» se leen SOLO del calendario de arriba. Si Facundo dice que te equivocaste de día, creele, volvé a leer el calendario y corregí sin discutir.
- Las publicaciones de Instagram no las hacés ni las programás vos ni el bot: el Estratega arma cada lunes un flujo semanal (qué se publica cada día y de qué trata) y Facundo lo hace. Para contarle qué hay, usá ver_flujo. Si te pide cambiar el flujo, anotalo como novedad (anotar_novedad) o como foco de la semana (editar_dato) para que el próximo flujo lo tenga en cuenta, y decíselo así.
- El foco de la semana y la agenda se cambian con editar_dato, agregar_agenda y quitar_agenda, y las líneas de la estrategia de la semana con editar_estrategia; el juego los muestra al instante. Antes de decir qué hay cargado, mirá con ver_operacion.
- El stock y las ventas son del sistema: para saber cuánto hay usá ver_stock, cuando llega mercadería registrar_llegada, y cuando Facundo cuenta que vendió algo registrar_venta (resta el stock solo; los precios los define el sistema y no se cambian; si falta el color de una gorra o un shaker, preguntalo). Nunca digas «anotado» si la herramienta devolvió un error, por ejemplo por falta de stock.
- Los mails con el código de descuento para la lista de espera se manejan con descuento_lista_espera: primero ver, después una prueba a un mail de Facundo y recién cuando él lo pida y confirme la cantidad, enviar. Nunca muestres códigos de descuento en el chat.
- Si Facundo cuenta una novedad de VOW (algo nuevo del proyecto), usá anotar_novedad.
- Si pide varias cosas en un mismo mensaje, hacelas todas con las herramientas y contá al final qué quedó hecho y qué no. Si te falta un dato para hacerlo bien, preguntá una sola cosa clara.
- Si te pide algo que no podés hacer con tus herramientas (publicar, escribir textos de publicaciones, generar imágenes), decíselo con honestidad y proponé lo que sí se puede.
- Nunca digas que hiciste algo si la herramienta devolvió un error. Un cambio existe SOLO si la herramienta devolvió ok en este mismo mensaje: ponerse de acuerdo en la charla no guarda nada. El sistema revisa tus respuestas: si decís que guardaste algo y no llamaste a una herramienta, le avisa a Facundo que no se guardó.`;
}

// ¿La respuesta de la IA dice que ya cambió o guardó algo? Se usa para avisar si lo dijo sin haberlo hecho de verdad.
const AFIRMA_CAMBIO = /(?<![\p{L}])(guard(é|ado|ada|amos)|(cambi|modifiqu|actualic|apliqu|program|arm|borr|elimin|quit|ocult)(é|ado|ada)|(qued[oó]|dej[eé]) (guardad|cambiad|actualizad|programad|borrad|eliminad|quitad|ocultad|list)\p{L}*|ya (lo |la )?(cambi|actualic|guard|modifiqu|program|arm|borr|elimin|quit|ocult)\p{L}*)(?![\p{L}])/iu;
export const afirmaCambio = (texto) => AFIRMA_CAMBIO.test(String(texto ?? ""));

// La charla que se recuerda entre mensajes: solo el texto, sin los pasos internos de las herramientas
export function recortarRecuerdo(historial) {
  return historial.slice(-TURNOS_DE_MEMORIA).map((m) => ({
    rol: m.rol,
    texto: String(m.texto).slice(0, LARGO_MAXIMO_RECUERDO),
    ...(m.visible ? { visible: String(m.visible).slice(0, LARGO_MAXIMO_RECUERDO) } : {}),
    ...(m.canal ? { canal: m.canal } : {}),
    ...(m.en ? { en: m.en } : {}),
  }));
}

// Lo que ve el modelo de la charla guardada: solo rol y texto; lo que se escribió en el juego lleva la marca para que sepa de dónde vino
export const paraElModelo = (historial) =>
  historial.map((m) => ({ rol: m.rol, texto: m.rol === "usuario" && m.canal === "juego" ? `[Mensaje escrito en el juego VOW HQ] ${m.texto}` : m.texto }));
