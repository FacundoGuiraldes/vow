// Cliente mínimo de la API de bots de Telegram: enviar mensajes con botones, bajar archivos y registrar el webhook.
// `fetchFn` se inyecta para probar sin red. Los errores nunca incluyen el token (va en la dirección).
const BASE = "https://api.telegram.org";
export const LIMITE_MENSAJE = 4096;
export const LIMITE_DESCARGA_BYTES = 20 * 1024 * 1024; // lo máximo que Telegram deja bajar a un bot

export class ErrorTelegram extends Error {
  constructor(mensaje, { codigo = null } = {}) {
    super(mensaje);
    this.name = "ErrorTelegram";
    this.codigo = codigo;
  }
}

// botones: lista de filas, cada fila una lista de { texto, dato }. `dato` vuelve en el callback (hasta 64 bytes).
const tecladoDe = (botones) => ({ inline_keyboard: botones.map((fila) => fila.map(({ texto, dato }) => ({ text: texto, callback_data: dato }))) });

export function crearClienteTelegram({ token, chatId, fetchFn = fetch } = {}) {
  async function llamar(metodo, cuerpo = {}) {
    if (!token) throw new ErrorTelegram("Falta TELEGRAM_TOKEN en el entorno.");
    let respuesta;
    try {
      respuesta = await fetchFn(`${BASE}/bot${token}/${metodo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      throw new ErrorTelegram("No se pudo conectar con Telegram.");
    }
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || !datos?.ok) {
      throw new ErrorTelegram(`Telegram rechazó ${metodo}: ${datos?.description ?? respuesta.status}`, { codigo: datos?.error_code ?? respuesta.status });
    }
    return datos.result;
  }

  return {
    chatId: chatId === undefined || chatId === null ? null : String(chatId),

    // Devuelve el ID del mensaje enviado (sirve para mapear las respuestas a una pieza)
    async enviarMensaje(texto, { botones, responderA } = {}) {
      const cuerpo = { chat_id: chatId, text: texto.slice(0, LIMITE_MENSAJE), disable_web_page_preview: true };
      if (botones?.length) cuerpo.reply_markup = tecladoDe(botones);
      if (responderA) cuerpo.reply_parameters = { message_id: responderA, allow_sending_without_reply: true };
      return (await llamar("sendMessage", cuerpo)).message_id;
    },

    // Manda una foto (Buffer JPEG) con texto y botones. Devuelve el ID del mensaje y el file_id de la foto más grande,
    // que sirve para volver a bajarla después sin tener que guardarla en ningún lado.
    async enviarFoto(foto, { texto = "", botones, responderA } = {}) {
      if (!token) throw new ErrorTelegram("Falta TELEGRAM_TOKEN en el entorno.");
      const formulario = new FormData();
      formulario.append("chat_id", String(chatId));
      formulario.append("photo", new Blob([foto], { type: "image/jpeg" }), "imagen.jpg");
      if (texto) formulario.append("caption", texto.slice(0, 1024));
      if (botones?.length) formulario.append("reply_markup", JSON.stringify(tecladoDe(botones)));
      if (responderA) formulario.append("reply_parameters", JSON.stringify({ message_id: responderA, allow_sending_without_reply: true }));
      let respuesta;
      try {
        respuesta = await fetchFn(`${BASE}/bot${token}/sendPhoto`, { method: "POST", body: formulario });
      } catch {
        throw new ErrorTelegram("No se pudo conectar con Telegram.");
      }
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok || !datos?.ok) throw new ErrorTelegram(`Telegram rechazó sendPhoto: ${datos?.description ?? respuesta.status}`, { codigo: datos?.error_code ?? respuesta.status });
      return { id: datos.result.message_id, fileId: datos.result.photo?.at(-1)?.file_id ?? null };
    },

    // Mensaje a otro chat (solo lo usa /start para decirle a quien escribe cuál es su chat id)
    enviarA: (destino, texto) => llamar("sendMessage", { chat_id: destino, text: texto.slice(0, LIMITE_MENSAJE) }),

    // Saca los botones de un mensaje viejo para que no se puedan volver a tocar
    quitarBotones: (mensajeId) =>
      llamar("editMessageReplyMarkup", { chat_id: chatId, message_id: mensajeId, reply_markup: { inline_keyboard: [] } }).catch(() => null),

    // "escribiendo…" mientras la IA piensa (dura unos segundos; si falla no importa)
    escribiendo: () => llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => null),

    responderBoton: (idCallback, texto = "") => llamar("answerCallbackQuery", { callback_query_id: idCallback, text: texto.slice(0, 200) }).catch(() => null),

    async descargarArchivo(fileId) {
      const archivo = await llamar("getFile", { file_id: fileId }).catch((error) => {
        if (/too big/i.test(error.message)) throw new ErrorTelegram("El archivo pesa más de 20 MB y Telegram no me deja bajarlo.");
        throw error;
      });
      if (archivo.file_size && archivo.file_size > LIMITE_DESCARGA_BYTES) throw new ErrorTelegram("El archivo pesa más de 20 MB y Telegram no me deja bajarlo.");
      let respuesta;
      try {
        respuesta = await fetchFn(`${BASE}/file/bot${token}/${archivo.file_path}`);
      } catch {
        throw new ErrorTelegram("No se pudo bajar el archivo de Telegram.");
      }
      if (!respuesta.ok) throw new ErrorTelegram(`No se pudo bajar el archivo de Telegram (${respuesta.status}).`);
      return Buffer.from(await respuesta.arrayBuffer());
    },

    configurarWebhook: (url, secreto) =>
      llamar("setWebhook", { url, secret_token: secreto, allowed_updates: ["message", "callback_query"], drop_pending_updates: true }),
  };
}
