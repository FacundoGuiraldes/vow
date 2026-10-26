// El chat con la IA: lo que el modelo puede hacer (herramientas) y cómo se le explica el trabajo (sistema).
// Las herramientas están en el formato de Gemini (tipos en mayúscula). Ninguna publica ni confirma: confirmar y cancelar
// siempre pasan por un botón que toca Facundo, así una frase mal entendida nunca publica ni borra nada sola.
import { fechaLegible, nombreDelDia, sumarDias } from "./fechas.js";

export const MENSAJES_MAXIMOS_POR_DIA = 80; // freno de uso: el plan gratis tiene cupo diario
export const TURNOS_DE_MEMORIA = 10; // cuántos mensajes de la charla se recuerdan
export const LARGO_MAXIMO_RECUERDO = 1500;

// Campos de una pieza que el chat puede cambiar (el resto de la pieza queda igual)
export const CAMPOS_EDITABLES = ["fecha", "hora", "gancho", "epigrafe", "guion", "texto_en_pantalla", "produccion", "instrucciones_ia", "material_a_producir"];

const id = { type: "INTEGER", description: "ID de la pieza, tal como lo devuelve ver_semana." };

export const HERRAMIENTAS_CHAT = [
  { name: "ver_semana", description: "Lista las piezas de los próximos 14 días (y las de ayer), con su ID, fecha, hora, formato, estado y si ya tienen archivo." },
  { name: "ver_pieza", description: "Devuelve una pieza completa: guion, epígrafe, textos en pantalla, cómo se produce y las indicaciones para la IA.", parameters: { type: "OBJECT", properties: { id }, required: ["id"] } },
  {
    name: "modificar_pieza",
    description:
      "Cambia campos de UNA pieza que todavía no se publicó. Solo mandá los campos que cambian. Si la pieza estaba aprobada o confirmada, vuelve a quedar 'propuesta' y hay que aprobarla de nuevo. El sistema revisa las reglas de marca: si rechaza el cambio, te devuelve los errores.",
    parameters: {
      type: "OBJECT",
      properties: {
        id,
        cambios: {
          type: "OBJECT",
          description: "Solo los campos que cambian.",
          properties: {
            fecha: { type: "STRING", description: "AAAA-MM-DD, de hoy en adelante." },
            hora: { type: "STRING", description: "HH:MM entre 09:00 y 23:00, hora de Argentina." },
            gancho: { type: "STRING" },
            epigrafe: { type: "STRING" },
            guion: { type: "STRING" },
            texto_en_pantalla: { type: "ARRAY", items: { type: "STRING" } },
            produccion: { type: "STRING", description: "propio, ia o mixto." },
            instrucciones_ia: { type: "STRING", description: "Indicación para copiar y pegar en una IA (obligatoria si produccion es ia o mixto)." },
            material_a_producir: { type: "ARRAY", items: { type: "STRING" } },
          },
        },
        que_cambio: { type: "STRING", description: "Una frase corta que cuenta qué cambiaste." },
      },
      required: ["id", "cambios", "que_cambio"],
    },
  },
  { name: "aprobar_pieza", description: "Aprueba una pieza propuesta para la semana. No la publica ni la confirma.", parameters: { type: "OBJECT", properties: { id }, required: ["id"] } },
  {
    name: "pedir_confirmacion",
    description: "Le manda a Facundo la pieza DE HOY con el botón Confirmar. Nunca confirmás vos: la confirmación es un botón que toca él. Solo sirve para piezas de hoy.",
    parameters: { type: "OBJECT", properties: { id }, required: ["id"] },
  },
  { name: "pedir_cancelacion", description: "Le manda a Facundo un botón para cancelar la pieza. Nunca cancelás vos: lo confirma él con el botón.", parameters: { type: "OBJECT", properties: { id }, required: ["id"] } },
  { name: "anotar_novedad", description: "Guarda una novedad de VOW (un dato nuevo del proyecto) para que el Estratega la use en el plan del próximo lunes.", parameters: { type: "OBJECT", properties: { texto: { type: "STRING" } }, required: ["texto"] } },
  { name: "reenviar_hoy", description: "Reenvía las piezas de hoy que faltan confirmar, con sus botones." },
  { name: "pausar_publicaciones", description: "Frena toda publicación automática hasta que se reanude." },
  { name: "reanudar_publicaciones", description: "Reactiva las publicaciones automáticas." },
  { name: "estado_del_sistema", description: "Dice si está en pausa, si publica de verdad o en simulación, y la fecha y hora actuales." },
];

// Calendario de los próximos días con el día de la semana: los modelos fallan seguido al calcular "el viernes" o "pasado mañana"
export function calendario(hoy, dias = 15) {
  return Array.from({ length: dias }, (_, i) => {
    const f = sumarDias(hoy, i);
    return `${i === 0 ? "hoy" : i === 1 ? "mañana" : ""}${i < 2 ? ": " : ""}${fechaLegible(f)} = ${f}`;
  }).join("\n");
}

export function construirSistemaChat({ fecha, hora, permitirPublicar }) {
  return `Sos el asistente de Facundo para planificar y publicar el Instagram de VOW (@vow_ar), una marca argentina de ropa y accesorios técnicos para entrenar que todavía no lanzó su primer producto (Drop 01, 2027). Hablás con él por Telegram, como en un chat.

Cómo hablás: en español rioplatense (voseo), claro, cálido y breve. Texto plano: sin Markdown, sin asteriscos ni títulos. Respuestas cortas, de pocas líneas. Si algo es ambiguo, preguntá antes de cambiar.

Ahora es ${nombreDelDia(fecha)} ${fecha}, ${hora} (hora de Argentina). Calendario:
${calendario(fecha)}

Cómo trabajás:
- Para saber qué hay, usá ver_semana y ver_pieza. Nunca inventes IDs, fechas ni estados: miralos con las herramientas.
- Para cambiar una pieza usá modificar_pieza con solo lo que cambia. Las fechas, calculalas con el calendario de arriba. Si el sistema rechaza el cambio por las reglas de marca, explicale a Facundo qué regla fue y proponé una alternativa que la cumpla.
- Para aprobar una pieza de la semana, aprobar_pieza.
- NUNCA confirmás ni cancelás una publicación por tu cuenta: para confirmar usá pedir_confirmacion y para cancelar pedir_cancelacion. Eso le manda un botón a Facundo y la decisión es suya. Decile claro que te falta que toque el botón.
- La publicación es automática: se hace sola a la hora indicada, y solo si Facundo confirmó esa pieza ese mismo día. Si no confirma, no se publica nada. No prometas nada distinto.
- ${permitirPublicar ? "Hoy el sistema publica de verdad." : "Hoy el sistema está en modo simulación: no se publica de verdad en Instagram."}
- Si Facundo cuenta una novedad de VOW (algo nuevo del proyecto, no un cambio a una pieza), usá anotar_novedad.
- Los videos y las fotos NO pasan por vos: Facundo se los manda al bot y el bot los guarda solo en la pieza. Para que sepa de qué pieza es, tiene que mandar el archivo respondiendo al mensaje de la pieza o a su recordatorio, o escribir la fecha en el texto del archivo (por ejemplo «29/10»). Nunca le digas que no se pueden recibir videos ni archivos por acá; explicale eso. Para ver si una pieza ya tiene archivo, usá ver_semana o ver_pieza.
- Cuando te pregunten cómo queda una pieza, mirala con ver_pieza y contá lo que se publica: día y hora, gancho, epígrafe (el texto que va debajo) y el archivo. Decí siempre si ya tiene el video o las fotos (campo archivos). Si ya tiene el video, decilo con esas palabras.
- texto_en_pantalla es el texto que se escribe DENTRO del video. Si la pieza ya tiene el video cargado, ese texto ya está hecho en el archivo: no lo muestres ni propongas cambiarlo salvo que Facundo lo pida. No lo rellenes copiando el epígrafe. Si te pide cambiar el texto de la publicación, es el epígrafe (y el gancho si él lo pide).
- Si te pide algo que no podés hacer con tus herramientas (por ejemplo generar un video), decíselo con honestidad y proponé lo que sí se puede.
- Nunca digas que hiciste algo si la herramienta devolvió un error.
- Un cambio en una pieza existe SOLO si modificar_pieza devolvió ok en este mismo mensaje. Si acuerdan un texto (un epígrafe, un gancho, una hora), llamá a modificar_pieza en ese turno: ponerse de acuerdo en la charla no guarda nada. No digas «guardado», «cambiado» ni «listo» antes de ver el resultado. Cuando guardes, repetile el texto exacto que quedó. El sistema revisa tus respuestas: si decís que guardaste algo y no llamaste a modificar_pieza, le avisa a Facundo que no se guardó.`;
}

// ¿La respuesta de la IA dice que ya cambió o guardó algo? Se usa para avisar si lo dijo sin haberlo hecho de verdad.
const AFIRMA_CAMBIO = /(?<![\p{L}])(guard(é|ado|ada|amos)|(cambi|modifiqu|actualic|apliqu)(é|ado|ada)|(qued[oó]|dej[eé]) (guardad|cambiad|actualizad|list)\p{L}*|ya (lo |la )?(cambi|actualic|guard|modifiqu)\p{L}*)(?![\p{L}])/iu;
export const afirmaCambio = (texto) => AFIRMA_CAMBIO.test(String(texto ?? ""));

// La charla que se recuerda entre mensajes: solo el texto, sin los pasos internos de las herramientas
export function recortarRecuerdo(historial) {
  return historial.slice(-TURNOS_DE_MEMORIA).map((m) => ({ rol: m.rol, texto: String(m.texto).slice(0, LARGO_MAXIMO_RECUERDO) }));
}
