// Lógica de la publicación programada. Habla con tres cosas que se inyectan (por eso se prueba sin red ni base):
//   repo      → la base (repositorio.js, o repositorio-memoria.js en los tests)
//   telegram  → el bot con el que Facundo recibe y responde
//   meta      → la API de Instagram (src/mcp/instagram/api.js)
//   llm       → (opcional) la IA con la que Facundo charla; sin ella, responder a una pieza usa el editor y lo demás son novedades
//
// Reglas que no se negocian (están probadas en servicio.test.js):
//   1. Solo se publica una pieza que Facundo CONFIRMÓ el mismo día de la publicación. La aprobación de la semana no alcanza.
//   2. Cualquier cambio de la pieza (texto, fecha, hora o archivo) borra la confirmación: hay que volver a confirmar.
//   3. Una publicación que ya se intentó nunca se reintenta sola: si algo falla, se avisa y se espera una orden.
//   4. Fuera de la hora (más de TOLERANCIA_MINUTOS tarde) no se publica sola: se pregunta.
//   5. /pausar frena toda publicación.
import { ErrorOperacion, aplicarOperacion, leerOperacion, resumenParaChat } from "./operacion.js";
import { ErrorInventario, aplicarInventario, leerInventario, vistaInventario } from "./inventario.js";
import { lineasDeInvestigacion, vistaEstrategia } from "./estrategia-semana.js";
import { revisarTextoPublico, validarUrlPublica } from "../mcp/instagram/validaciones.js";
import { CAMPOS_EDITABLES, HERRAMIENTAS_CHAT, afirmaCambio, MENSAJES_MAXIMOS_POR_DIA, construirSistemaChat, paraElModelo, recortarRecuerdo } from "./conversacion.js";
import { ahoraArgentina, esFechaISO, esHoraValida, lunesDe, fechaEnTexto, fechaLegible, horaDesdeMinutos, minutosDelDia, sumarDias, diasHasta } from "./fechas.js";
import {
  ESTADOS_LEGIBLES, botonesCancelar, botonesDia, botonesImagenIA, botonesPlan, botonesTarde, fechaDeAviso, textoPieza, textoPlanSemanal, textoRecordatorio, textoResumenDiario,
} from "./mensajes.js";

export const HORA_RESUMEN = "08:00";
export const HORA_POR_DEFECTO = "19:00";
export const MINUTOS_PARA_PREPARAR = 15; // se arma el contenedor en Meta este rato antes de la hora
export const TOLERANCIA_MINUTOS = 20; // pasado este margen, no se publica sola
export const INTENTOS_PREPARAR = 3;
export const EDICIONES_MAXIMAS_POR_DIA = 30; // freno de gasto de la IA (el tope duro es el de la consola de Anthropic)
export const MINUTOS_PUBLICAR_AHORA = 5;
export const INTENTOS_IA_POR_PIEZA = 3; // imágenes con IA por pieza (el plan gratis tiene cupo diario)
export const IMAGENES_IA_MAXIMAS_POR_DIA = 10;
export const MINUTOS_AVISO_SIN_CONFIRMAR = 120; // si dos horas antes todavía no confirmó, se lo recuerda

// Qué archivos necesita cada formato. Las stories todavía no se publican solas.
export const MEDIOS_REQUERIDOS = {
  reel: { tipo: "video", minimo: 1, maximo: 1 },
  imagen: { tipo: "imagen", minimo: 1, maximo: 1 },
  carrusel: { tipo: "imagen", minimo: 2, maximo: 20 },
};

const VIVAS = ["propuesta", "aprobada", "confirmada", "preparada"];
const material = (fila) => (Array.isArray(fila.pieza.material_a_producir) ? fila.pieza.material_a_producir : []);

// Texto de lo que falta, o null si el material está completo
export function faltaArchivo(fila, medios) {
  const requerido = MEDIOS_REQUERIDOS[fila.pieza.formato];
  if (!requerido) return null;
  const sirven = medios.filter((m) => m.tipo === requerido.tipo);
  if (sirven.length < medios.length) return "Hay archivos que no son del tipo que pide este formato. Mandalos de nuevo.";
  if (sirven.length >= requerido.minimo) return null;
  if (requerido.tipo === "video") return "Falta el video: mandámelo respondiendo a este mensaje.";
  return requerido.minimo === 1
    ? "Falta la foto: mandámela respondiendo a este mensaje."
    : `Faltan fotos: tengo ${sirven.length} y hacen falta al menos ${requerido.minimo}. Mandalas respondiendo a este mensaje.`;
}

function elegirArchivo(msg) {
  if (msg.photo?.length) {
    const foto = msg.photo.at(-1);
    return { fileId: foto.file_id, tipo: "imagen", mime: "image/jpeg", bytes: foto.file_size };
  }
  if (msg.video) return { fileId: msg.video.file_id, tipo: "video", mime: msg.video.mime_type ?? "video/mp4", bytes: msg.video.file_size };
  const documento = msg.document;
  if (documento?.mime_type === "image/jpeg") return { fileId: documento.file_id, tipo: "imagen", mime: "image/jpeg", bytes: documento.file_size };
  if (["video/mp4", "video/quicktime"].includes(documento?.mime_type)) return { fileId: documento.file_id, tipo: "video", mime: documento.mime_type, bytes: documento.file_size };
  return null;
}

export function crearServicio({ repo, telegram, meta = null, editor = null, generadorImagen = null, llm = null, validarEdicion = null, ahora = () => ahoraArgentina(), urlPublica = "", permitirPublicar = false, investigacion = lineasDeInvestigacion } = {}) {
  const decir = (texto, opciones) => telegram.enviarMensaje(texto, opciones);
  const decirDePieza = async (fila, texto, opciones) => {
    const id = await telegram.enviarMensaje(texto, opciones);
    await repo.agregarMensaje(fila.id, id); // así una respuesta a este mensaje se sabe de qué pieza es
    return id;
  };
  // En los avisos del sistema, un fallo de Telegram no puede tirar abajo el resto del trabajo
  const avisar = (fila, texto, opciones) => decirDePieza(fila, texto, opciones).catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
  // Solo las piezas de tipo imagen se pueden generar con IA, y solo si el generador está configurado
  const conIA = (fila) => generadorImagen !== null && fila.pieza.formato === "imagen";
  const autorizado = (chatId) => telegram.chatId !== null && String(chatId) === telegram.chatId;

  // ───────────────────────── Plan de la semana ─────────────────────────
  async function recibirPlan({ semana, plan, novedadesUsadas = [] }) {
    const { fecha: hoy } = ahora();
    const nuevas = plan.piezas.map((pieza) => {
      const hora = esHoraValida(pieza.hora) ? pieza.hora : HORA_POR_DEFECTO;
      return { fecha: pieza.fecha, hora, pieza: { ...pieza, hora } };
    });
    const filas = await repo.crearPiezas(semana, nuevas);

    // Recordatorio 3 días antes de publicar, para lo que hay que filmar o fotografiar.
    // Si ese día ya pasó (por ejemplo una pieza del martes en un plan del lunes), el aviso es el propio plan.
    const urgentes = [];
    for (const fila of filas) {
      if (material(fila).length === 0) continue;
      const aviso = fechaDeAviso(fila.fecha);
      if (aviso > hoy) await repo.crearRecordatorio({ piezaId: fila.id, fecha: aviso });
      else if (aviso < hoy) urgentes.push(fila);
    }
    await repo.marcarNovedadesUsadas(novedadesUsadas);

    await decir(textoPlanSemanal({ semana, resumen: plan.resumen, filas, urgentes, hoy }), {
      botones: [[{ texto: "✅ Aprobar todas", dato: `aprobar_semana:${semana}` }]],
    });
    for (const fila of filas) await decirDePieza(fila, textoPieza(fila), { botones: botonesPlan(fila.id, { conIA: conIA(fila) }) });
    return { piezas: filas.length, urgentes: urgentes.length };
  }

  async function avisarFalloDelPlan({ semana, error }) {
    await decir(`⚠️ No pude armar el plan de la semana del ${fechaLegible(semana)}.\n${error}\nSi querés, corré el plan de nuevo desde GitHub Actions (workflow "Plan del lunes").`);
  }

  // ───────────────────────── Botones ─────────────────────────
  async function manejarBoton(consulta) {
    if (!autorizado(consulta.message?.chat?.id)) return { ignorada: true };
    await telegram.responderBoton(consulta.id);
    const [accion, argumento] = String(consulta.data ?? "").split(":");
    const mensajeId = consulta.message.message_id;
    const responder = (texto, opciones) => decir(texto, { responderA: mensajeId, ...opciones });

    if (accion === "aprobar_semana") return aprobarSemana(argumento, responder);

    const fila = await repo.obtenerPieza(argumento);
    if (!fila) return responder("No encontré esa pieza.");
    if (accion === "aprobar") return aprobar(fila, responder);
    if (accion === "confirmar") return confirmar(fila, responder, mensajeId);
    if (accion === "modificar") {
      return decirDePieza(fila, `✏️ Respondé a ESTE mensaje con el cambio que querés para la pieza del ${fechaLegible(fila.fecha)}. Por ejemplo: «cambiá el gancho», «pasala a las 20:30» o «pasala al viernes». Si cambia algo, tenés que volver a confirmar.`, { responderA: mensajeId });
    }
    if (accion === "ia" || accion === "ia_otra") return generarConIA(fila, { responder, mensajeId });
    if (accion === "ia_usar") return usarImagenIA(fila, responder, mensajeId);
    if (accion === "ia_cambiar") return responder("✏️ Respondé a la pieza (o a la imagen) con /ia y lo que querés ver. Por ejemplo: /ia fondo negro con una sombra suave y mucho espacio vacío.");
    if (accion === "dejar") {
      telegram.quitarBotones(mensajeId);
      return responder("Listo, la dejo como está.");
    }
    if (accion === "cancelar") return cancelar(fila, responder, mensajeId);
    if (accion === "publicar_ahora") return publicarAhora(fila, responder, mensajeId);
    return responder("No entendí ese botón.");
  }

  async function aprobarSemana(semana, responder) {
    const filas = await repo.piezasDeSemana(semana);
    let aprobadas = 0;
    for (const fila of filas) if (await repo.reclamar(fila.id, ["propuesta"], "aprobada")) aprobadas++;
    if (aprobadas === 0) return responder("No había piezas por aprobar en esa semana.");
    return responder(`✅ Plan aprobado (${aprobadas} ${aprobadas === 1 ? "pieza" : "piezas"}). Cada día a las 8 te pido la confirmación final: sin ella no se publica nada.`);
  }

  async function aprobar(fila, responder) {
    if (!(await repo.reclamar(fila.id, ["propuesta"], "aprobada"))) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}.`);
    return responder(`✅ Aprobada. El ${fechaLegible(fila.fecha)} a las 8 te pido la confirmación final.`);
  }

  // Aprobación desde la oficina (el juego): vale como el botón "Aprobar" de Telegram. La confirmación final del día se da con confirmarDesdeJuego o con el botón de Telegram.
  async function aprobarDesdeJuego(id) {
    const fila = await repo.obtenerPieza(id);
    if (!fila) return { ok: false, motivo: "Esa pieza no existe." };
    if (!(await repo.reclamar(fila.id, ["propuesta"], "aprobada"))) return { ok: false, motivo: `Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}.` };
    await decir(`✅ Aprobaste desde la oficina: "${fila.pieza.gancho}" (${fechaLegible(fila.fecha)}). El día de la publicación a las 8 te pido la confirmación final.`).catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
    return { ok: true, estado: "aprobada" };
  }

  // La confirmación final desde el juego: es la misma decisión de Facundo que el botón de Telegram (mismas reglas: mismo día, con material, antes de la hora)
  async function confirmarDesdeJuego(id) {
    const fila = await repo.obtenerPieza(id);
    if (!fila) return { ok: false, motivo: "Esa pieza no existe." };
    let texto = "";
    await confirmar(fila, async (t) => { texto = String(t); }, null);
    const tras = await repo.obtenerPieza(id);
    if (tras.estado !== "confirmada") return { ok: false, motivo: texto.replace(/^[^\p{L}\p{N}¿¡]+/u, "") || "No se pudo confirmar." };
    await decir(`✅ Confirmaste desde la oficina: "${fila.pieza.gancho}" (${fechaLegible(fila.fecha)} ${fila.hora}). ${texto.replace(/^✅ Confirmada\.\s*/, "")}`).catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
    return { ok: true, estado: "confirmada", detalle: texto };
  }

  async function confirmar(fila, responder, mensajeId) {
    const { fecha: hoy, hora: horaActual } = ahora();
    if (fila.fecha !== hoy) {
      return responder(`La confirmación solo vale el mismo día de la publicación. Esta pieza es del ${fechaLegible(fila.fecha)}: te la pido ese día a las 8.`);
    }
    if (!["propuesta", "aprobada"].includes(fila.estado)) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}.`);

    const problemas = await problemasParaPublicar(fila);
    if (problemas.length) return responder(`No se puede confirmar todavía:\n${problemas.map((p) => `• ${p}`).join("\n")}`);

    if (minutosDelDia(fila.hora) <= minutosDelDia(horaActual)) {
      return responder(`Ya pasó la hora de esta pieza (${fila.hora}). No publico fuera de hora sin que me lo pidas: ¿la publico ahora?`, { botones: botonesTarde(fila.id) });
    }
    await repo.actualizarPieza(fila.id, { estado: "confirmada", confirmada_el: hoy, intentos: 0, error: null });
    if (mensajeId) telegram.quitarBotones(mensajeId);
    const detalle = MEDIOS_REQUERIDOS[fila.pieza.formato] ? `Se publica hoy a las ${fila.hora}.` : `Las stories todavía las publicás vos: a las ${fila.hora} te aviso.`;
    return responder(`✅ Confirmada. ${detalle}${permitirPublicar ? "" : "\n🧪 Modo simulación: no se publica de verdad."}`);
  }

  async function cancelar(fila, responder, mensajeId) {
    if (!VIVAS.includes(fila.estado) && fila.estado !== "fallida") return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: no se puede cancelar.`);
    await repo.actualizarPieza(fila.id, { estado: "cancelada", confirmada_el: null });
    await repo.borrarRecordatoriosPendientes(fila.id);
    await repo.borrarMedios(fila.id);
    telegram.quitarBotones(mensajeId);
    return responder("🚫 Cancelada. No se publica.");
  }

  async function publicarAhora(fila, responder, mensajeId) {
    const { fecha: hoy, hora: horaActual } = ahora();
    if (fila.fecha !== hoy) return responder(`Solo se puede publicar ahora una pieza de hoy. Esta es del ${fechaLegible(fila.fecha)}.`);
    if (!VIVAS.includes(fila.estado)) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}.`);
    const problemas = await problemasParaPublicar(fila);
    if (problemas.length) return responder(`No se puede publicar todavía:\n${problemas.map((p) => `• ${p}`).join("\n")}`);

    const minutos = minutosDelDia(horaActual) + MINUTOS_PUBLICAR_AHORA;
    if (minutos > 23 * 60 + 30) return responder("Es demasiado tarde para publicar hoy. Mejor reprogramala para mañana (respondé a la pieza con el cambio).");
    const hora = horaDesdeMinutos(minutos);
    await repo.actualizarPieza(fila.id, { hora, pieza: { ...fila.pieza, hora }, estado: "confirmada", confirmada_el: hoy, contenedor: null, intentos: 0, error: null });
    telegram.quitarBotones(mensajeId);
    return responder(`▶️ Listo: se publica hoy a las ${hora}.${permitirPublicar ? "" : "\n🧪 Modo simulación: no se publica de verdad."}`);
  }

  // Lo que impide publicar una pieza: texto que rompe las reglas de marca o archivos que faltan
  async function problemasParaPublicar(fila) {
    const problemas = [];
    if (MEDIOS_REQUERIDOS[fila.pieza.formato]) {
      problemas.push(...revisarTextoPublico(fila.pieza.epigrafe));
      const falta = faltaArchivo(fila, await repo.mediosDePieza(fila.id));
      if (falta) problemas.push(falta);
    }
    return problemas;
  }

  // ───────────────────────── Mensajes de texto, archivos y comandos ─────────────────────────
  async function manejarMensaje(msg) {
    const texto = msg.text?.trim() ?? "";
    if (!autorizado(msg.chat?.id)) {
      if (texto.startsWith("/start")) await telegram.enviarA(msg.chat.id, `Tu chat id es ${msg.chat.id}. Cargalo como TELEGRAM_CHAT_ID en el servicio para que este bot te responda.`);
      return { ignorada: true };
    }
    if (texto.startsWith("/")) return comando(texto, msg);
    if (msg.photo || msg.video || msg.document) return recibirArchivo(msg);
    if (!texto) return { ignorada: true };
    if (llm) return conversar(msg, texto);
    return msg.reply_to_message ? editar(msg, texto) : novedad(msg, texto);
  }

  async function comando(texto, msg) {
    const nombre = texto.split(/[\s@]/)[0].toLowerCase();
    const responder = (t, o) => decir(t, { responderA: msg.message_id, ...o });
    if (nombre === "/pausar") {
      await repo.guardarEstado("pausa", true);
      return responder("⏸️ Pausado: no se publica nada hasta que mandes /reanudar.");
    }
    if (nombre === "/reanudar") {
      await repo.guardarEstado("pausa", false);
      return responder("▶️ Reanudado. Lo que esté confirmado para hoy se publica a su hora.");
    }
    if (nombre === "/ia") {
      const fila = msg.reply_to_message ? await repo.piezaPorMensaje(msg.reply_to_message.message_id) : null;
      if (!fila) return responder("Respondé al mensaje de una pieza con /ia y lo que querés ver. Por ejemplo: /ia una mesa de madera con luz de ventana.");
      return generarConIA(fila, { descripcion: texto.replace(/^\/ia(@\w+)?\s*/i, ""), responder: (t, o) => decir(t, { responderA: msg.message_id, ...o }), mensajeId: msg.message_id });
    }
    if (nombre === "/hoy") {
      const cantidad = await enviarResumenDiario(ahora().fecha);
      return cantidad === 0 ? responder("Hoy no tenés nada pendiente de confirmar.") : { enviadas: cantidad };
    }
    if (nombre === "/estado") {
      const { fecha: hoy } = ahora();
      const filas = await repo.piezasEntre(hoy, sumarDias(hoy, 7));
      const lineas = filas.map((f) => `• ${fechaLegible(f.fecha)} ${f.hora} hs · ${f.pieza.formato}: ${ESTADOS_LEGIBLES[f.estado]}`);
      return responder(
        [
          (await repo.leerEstado("pausa")) === true ? "⏸️ En pausa." : "▶️ Activo.",
          permitirPublicar ? "Publicación real activada." : "🧪 Modo simulación: no se publica de verdad.",
          lineas.length ? `Próximos 7 días:\n${lineas.join("\n")}` : "No hay piezas en los próximos 7 días.",
        ].join("\n"),
      );
    }
    return responder("Comandos: /hoy (reenvía lo de hoy), /estado, /pausar y /reanudar; respondiendo a una pieza de tipo imagen, /ia genera la imagen con IA. Respondé a una pieza para cambiarla, mandame el archivo respondiendo a su recordatorio, o escribime sin responder para dejar una novedad de VOW.");
  }

  async function novedad(msg, texto) {
    await repo.agregarNovedad(texto);
    return decir("📝 Anotado. Se lo paso al Estratega en el próximo plan del lunes. Si querías cambiar una pieza, respondé a su mensaje.", { responderA: msg.message_id });
  }

  // Guarda un archivo como material de la pieza. Si cambió el material, lo que estaba confirmado ya no vale.
  async function guardarMaterial(fila, requerido, archivo, datos) {
    if (requerido.maximo === 1) await repo.borrarMedios(fila.id);
    else if ((await repo.mediosDePieza(fila.id)).length >= requerido.maximo) return { error: `Ya hay ${requerido.maximo} fotos: es el máximo de Instagram.` };
    await repo.agregarMedio({ piezaId: fila.id, tipo: archivo.tipo, mime: archivo.mime, datos });
    let nota = "";
    if (["confirmada", "preparada"].includes(fila.estado)) {
      await repo.actualizarPieza(fila.id, { estado: "aprobada", confirmada_el: null, contenedor: null });
      nota = " Como cambió el archivo, tenés que volver a confirmar la publicación.";
    }
    return { nota };
  }

  async function recibirArchivo(msg) {
    const { fecha: hoy } = ahora();
    const responder = (texto) => decir(texto, { responderA: msg.message_id });

    let fila = msg.reply_to_message ? await repo.piezaPorMensaje(msg.reply_to_message.message_id) : null;
    const proximas = fila ? [] : await repo.piezasEntre(hoy, sumarDias(hoy, 14));
    const pendientes = [];
    if (!fila) {
      // Sin pieza a la vista: si hay una sola próxima a la que le falta material, es esa
      for (const f of proximas) {
        if (!MEDIOS_REQUERIDOS[f.pieza.formato] || !["propuesta", "aprobada", "confirmada"].includes(f.estado) || material(f).length === 0) continue;
        if (faltaArchivo(f, await repo.mediosDePieza(f.id))) pendientes.push(f);
      }
      if (pendientes.length === 1) fila = pendientes[0];
    }
    if (!fila) {
      // Si respondió a un mensaje del chat (que no es de una pieza) o puso un pie al archivo, la fecha que nombra ahí dice cuál es
      const pista = [msg.caption, msg.reply_to_message?.text, msg.reply_to_message?.caption].filter(Boolean).join(" ");
      const fechaPista = fechaEnTexto(pista, hoy);
      const coinciden = fechaPista ? proximas.filter((f) => f.fecha === fechaPista && MEDIOS_REQUERIDOS[f.pieza.formato] && VIVAS.includes(f.estado)) : [];
      if (coinciden.length === 1) fila = coinciden[0];
    }
    if (!fila) {
      const lista = pendientes.map((f) => `• ${fechaLegible(f.fecha)} ${f.hora} hs · ${f.pieza.formato}`).join("\n");
      return responder(
        `No sé para qué pieza es. Mandame el archivo respondiendo al mensaje de la pieza o a su recordatorio, o escribí la fecha en el texto del archivo (por ejemplo «29/10»).${lista ? `\nEstas esperan archivo:\n${lista}` : ""}`,
      );
    }

    const requerido = MEDIOS_REQUERIDOS[fila.pieza.formato];
    if (!requerido) return responder("Las stories todavía no se publican solas, así que no necesito el archivo.");
    if (!VIVAS.includes(fila.estado)) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no puedo adjuntarle archivos.`);
    const archivo = elegirArchivo(msg);
    if (!archivo) return responder("Ese tipo de archivo no sirve. Mandame una foto JPEG o un video MP4.");
    if (archivo.tipo !== requerido.tipo) return responder(`Esta pieza es un ${fila.pieza.formato}: necesita ${requerido.tipo === "video" ? "un video" : "fotos"}.`);

    let datos;
    try {
      datos = await telegram.descargarArchivo(archivo.fileId);
    } catch (error) {
      return responder(`No pude bajar el archivo: ${error.message} Mandalo como video (no como archivo) o comprimilo.`);
    }
    const guardado = await guardarMaterial(fila, requerido, archivo, datos);
    if (guardado.error) return responder(guardado.error);
    const nota = guardado.nota;
    const falta = faltaArchivo(fila, await repo.mediosDePieza(fila.id));
    return responder(`📎 Recibido para la pieza del ${fechaLegible(fila.fecha)}. ${falta ?? "Ya tiene todo el material."}${nota}`);
  }

  // ───────────────────────── Imágenes con IA ─────────────────────────
  const descripcionPorDefecto = (fila) => `${fila.pieza.guion ?? ""} ${fila.pieza.gancho ?? ""}`.trim().slice(0, 700);

  async function generarConIA(fila, { descripcion = "", responder, mensajeId }) {
    const { fecha: hoy } = ahora();
    if (!generadorImagen) return responder("La generación de imágenes con IA no está configurada (faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en el servicio).");
    if (fila.pieza.formato !== "imagen") return responder(`Por ahora genero con IA solo las piezas de tipo imagen. Esta es un ${fila.pieza.formato}: mandame los archivos vos.`);
    if (!VIVAS.includes(fila.estado)) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no puedo cambiarle la imagen.`);

    const previo = (await repo.leerEstado(`ia:${fila.id}`)) ?? {};
    const intentos = previo.intentos ?? 0;
    if (intentos >= INTENTOS_IA_POR_PIEZA) return responder(`Ya hice ${INTENTOS_IA_POR_PIEZA} imágenes para esta pieza. Mandame la foto vos, respondiendo al mensaje de la pieza.`);
    const clave = `ia-dia:${hoy}`;
    const hechas = Number(await repo.leerEstado(clave)) || 0;
    if (hechas >= IMAGENES_IA_MAXIMAS_POR_DIA) return responder(`Llegué al máximo de ${IMAGENES_IA_MAXIMAS_POR_DIA} imágenes con IA por día (es un freno por el cupo gratis). Mañana seguimos, o mandame la foto vos.`);

    const texto = descripcion.trim() || previo.descripcion || descripcionPorDefecto(fila);
    await responder("🎨 Generando la imagen… puede tardar un minuto.");
    let imagen;
    try {
      imagen = await generadorImagen.generar({ descripcion: texto });
    } catch (error) {
      return responder(`❌ No pude generar la imagen: ${error.message}`);
    }
    await repo.guardarEstado(clave, hechas + 1);
    // Los botones de la imagen anterior ya no sirven: se sacan para que no se pueda usar una vieja por error
    if (previo.mensajeFoto) await telegram.quitarBotones(previo.mensajeFoto);

    const { id, fileId } = await telegram.enviarFoto(imagen, {
      texto: `🎨 Imagen con IA (${intentos + 1} de ${INTENTOS_IA_POR_PIEZA}) para la pieza del ${fechaLegible(fila.fecha)}. El logo lo puse yo; la IA no dibuja textos.\n¿Te sirve?`,
      botones: botonesImagenIA(fila.id),
      responderA: mensajeId,
    });
    await repo.agregarMensaje(fila.id, id);
    await repo.guardarEstado(`ia:${fila.id}`, { intentos: intentos + 1, descripcion: texto, fileId, mensajeFoto: id });
  }

  async function usarImagenIA(fila, responder, mensajeId) {
    const requerido = MEDIOS_REQUERIDOS[fila.pieza.formato];
    if (!requerido) return responder("Esta pieza no lleva imagen.");
    if (!VIVAS.includes(fila.estado)) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no puedo cambiarle la imagen.`);
    const estado = await repo.leerEstado(`ia:${fila.id}`);
    if (!estado?.fileId) return responder("No tengo una imagen para usar. Generala de nuevo con el botón 🎨.");
    if (estado.mensajeFoto !== mensajeId) return responder("Esa imagen ya no es la última. Usá los botones de la más nueva.");
    let datos;
    try {
      datos = await telegram.descargarArchivo(estado.fileId);
    } catch (error) {
      return responder(`No pude recuperar la imagen: ${error.message} Generala de nuevo.`);
    }
    const guardado = await guardarMaterial(fila, requerido, { tipo: "imagen", mime: "image/jpeg" }, datos);
    if (guardado.error) return responder(guardado.error);
    await telegram.quitarBotones(mensajeId);
    const falta = faltaArchivo(fila, await repo.mediosDePieza(fila.id));
    return responder(`✅ Listo, usé esa imagen para la pieza del ${fechaLegible(fila.fecha)}. ${falta ?? "Ya tiene todo el material."}${guardado.nota}`);
  }

  // Guarda una pieza editada (por el editor con Claude o por el chat). Cualquier edición borra la confirmación y el contenedor
  // ya armado en Meta, y reprograma el recordatorio de filmación. Devuelve la pieza nueva y un aviso si quedan menos de 3 días.
  async function guardarEdicion(fila, { pieza, hora: horaNueva, hoy }) {
    const hora = esHoraValida(horaNueva) ? horaNueva : fila.hora;
    const fecha = pieza.fecha ?? fila.fecha;
    await repo.actualizarPieza(fila.id, { fecha, hora, pieza: { ...pieza, hora }, estado: "propuesta", confirmada_el: null, contenedor: null, error: null });
    await repo.borrarRecordatoriosPendientes(fila.id);
    const nueva = await repo.obtenerPieza(fila.id);
    let aviso = "";
    if (material(nueva).length) {
      const diaAviso = fechaDeAviso(fecha);
      if (diaAviso > hoy) await repo.crearRecordatorio({ piezaId: fila.id, fecha: diaAviso });
      else if (diaAviso < hoy) aviso = "\n⚠️ Con esta fecha te quedan menos de 3 días para producir el material.";
    }
    return { nueva, aviso };
  }

  async function editar(msg, instruccion) {
    const { fecha: hoy } = ahora();
    const responder = (texto, opciones) => decir(texto, { responderA: msg.message_id, ...opciones });
    const fila = await repo.piezaPorMensaje(msg.reply_to_message.message_id);
    if (!fila) return responder("No sé a qué pieza responde ese mensaje. Respondé a un mensaje de una pieza, o escribime sin responder para dejar una novedad de VOW.");
    if (!VIVAS.includes(fila.estado)) return responder(`Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no se puede editar.`);
    if (!editor) return responder("La edición con IA no está configurada (falta ANTHROPIC_API_KEY en el servicio).");

    const clave = `ediciones:${hoy}`;
    const hechas = Number(await repo.leerEstado(clave)) || 0;
    if (hechas >= EDICIONES_MAXIMAS_POR_DIA) return responder(`Llegaste al máximo de ${EDICIONES_MAXIMAS_POR_DIA} ediciones por día (es un freno de gasto). Mañana seguimos.`);
    await repo.guardarEstado(clave, hechas + 1);
    await responder("✏️ Aplicando el cambio…");

    let resultado;
    try {
      resultado = await editor.editarPieza({ fila, instruccion, hoy });
    } catch (error) {
      return responder(`No pude editar la pieza: ${error.message}`);
    }
    if (!resultado.ok) return responder(`No apliqué el cambio:\n${resultado.errores.map((e) => `• ${e}`).join("\n")}`);

    const { nueva, aviso } = await guardarEdicion(fila, { pieza: resultado.pieza, hora: resultado.hora, hoy });
    return decirDePieza(nueva, `${resultado.queCambio ? `✏️ ${resultado.queCambio}\n\n` : ""}${textoPieza(nueva)}${aviso}`, { botones: botonesPlan(fila.id, { conIA: conIA(nueva) }), responderA: msg.message_id });
  }

  // Desde la oficina: la IA arma otra sugerencia para el día de una pieza, que Facundo tiene que aprobar de nuevo.
  async function sugerirCambio(id, { indicacion = "", contexto = "", alAvanzar = null } = {}) {
    const { fecha: hoy } = ahora();
    const fila = await repo.obtenerPieza(id);
    if (!fila) return { ok: false, motivo: "Esa pieza no existe." };
    if (!VIVAS.includes(fila.estado)) return { ok: false, motivo: `Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no se puede cambiar.` };
    if (fila.fecha < hoy) return { ok: false, motivo: "Esa fecha ya pasó." };
    if (!editor) return { ok: false, motivo: "La IA no está configurada en el servicio (falta ANTHROPIC_API_KEY)." };
    const clave = `ediciones:${hoy}`;
    const hechas = Number(await repo.leerEstado(clave)) || 0;
    if (hechas >= EDICIONES_MAXIMAS_POR_DIA) return { ok: false, motivo: `Llegaste al máximo de ${EDICIONES_MAXIMAS_POR_DIA} ediciones por día (es un freno de gasto).` };
    await repo.guardarEstado(clave, hechas + 1);

    const instruccion = `Armá otra sugerencia para esta pieza.${indicacion ? `\nPedido de Facundo: ${indicacion}` : ""}${contexto ? `\n\nContexto:\n${contexto}` : ""}`;
    let resultado;
    try {
      resultado = await editor.editarPieza({ fila, instruccion, hoy, alternativa: true, alAvanzar });
    } catch (error) {
      return { ok: false, motivo: `No pude armar la sugerencia: ${error.message}` };
    }
    if (!resultado.ok) return { ok: false, motivo: `La sugerencia no pasó las reglas de la marca: ${resultado.errores.join(" ")}` };

    alAvanzar?.("Guardando la sugerencia y avisando por Telegram…");
    const { nueva, aviso } = await guardarEdicion(fila, { pieza: resultado.pieza, hora: resultado.hora, hoy });
    await decirDePieza(nueva, `🔄 Nueva sugerencia pedida desde la oficina${resultado.queCambio ? `: ${resultado.queCambio}` : ""}\n\n${textoPieza(nueva)}${aviso}`, { botones: botonesPlan(fila.id, { conIA: conIA(nueva) }) }).catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
    return { ok: true, estado: nueva.estado };
  }

  // "Cambiar" en el juego sobre una pieza que todavía no está en la base (solo en los documentos): la IA arma la nueva en el momento
  async function cambiarSinFila({ fecha, formato, indicacion = "", base = "", alAvanzar = null }) {
    const { fecha: hoy } = ahora();
    if (!esFechaISO(fecha)) return { ok: false, motivo: "Falta la fecha de la pieza." };
    const viva = (await repo.piezasDelDia(fecha)).find((f) => VIVAS.includes(f.estado));
    if (viva) return { ...(await sugerirCambio(viva.id, { indicacion, alAvanzar })), id: viva.id };
    const pedido = `${base ? `Esta pieza existe solo en los documentos y hay que rehacerla o mejorarla. Versión actual:\n${String(base).slice(0, 1500)}\n\n` : ""}Pedido de Facundo: ${indicacion || "armá otra sugerencia mejor para ese día"}`;
    const r = await programarPieza({ fecha, formato: String(formato || "reel").toLowerCase(), indicacion: pedido }, { hoy, canal: "juego", alAvanzar });
    if (r.ok) return { ok: true, estado: r.estado, id: r.id };
    return { ok: false, motivo: r.error ?? (r.errores ?? []).join(" ") };
  }

  // "Editar" en el juego: cambia la publicación que ya existe (tipo, epígrafe con párrafos, gancho, hora) sin pedirle nada a la IA.
  // Si la pieza solo está en los documentos, primero se carga tal cual en el sistema. Cualquier edición borra la confirmación.
  const FORMATOS_EDITABLES = ["reel", "carrusel", "imagen", "story"];
  async function editarDesdeJuego({ id = null, fecha = null, formato = null, base = "", cambios = {} } = {}) {
    const { fecha: hoy } = ahora();
    if (!validarEdicion) return { ok: false, motivo: "La edición no está disponible en este momento." };
    let fila = Number.isInteger(id) ? await repo.obtenerPieza(id) : null;
    if (!fila && esFechaISO(fecha)) {
      fila = (await repo.piezasDelDia(fecha)).find((f) => VIVAS.includes(f.estado)) ?? null;
      if (!fila) {
        const pedido = `Esta pieza existe solo en los documentos. Cargala en el sistema SIN cambiar su contenido (mismo gancho, guion, epígrafe y textos; solo completá lo que falte para cumplir las reglas).\n${String(base).slice(0, 1500)}`;
        const r = await programarPieza({ fecha, formato: String(formato || "reel").toLowerCase(), indicacion: pedido }, { hoy, canal: "juego" });
        if (!r.ok) return { ok: false, motivo: r.error ?? (r.errores ?? []).join(" ") };
        fila = await repo.obtenerPieza(r.id);
      }
    }
    if (!fila) return { ok: false, motivo: "Esa pieza no existe." };
    if (!VIVAS.includes(fila.estado)) return { ok: false, motivo: `Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no se puede editar.` };
    if (fila.fecha < hoy) return { ok: false, motivo: "Esa fecha ya pasó." };

    const nuevos = {};
    if (cambios.formato !== undefined) {
      const f = String(cambios.formato).toLowerCase();
      if (!FORMATOS_EDITABLES.includes(f)) return { ok: false, motivo: "El tipo tiene que ser publicación (imagen o carrusel), reel o historia." };
      nuevos.formato = f;
    }
    for (const campo of ["epigrafe", "gancho"]) {
      if (cambios[campo] === undefined) continue;
      // Se respetan los párrafos y los saltos de línea, como en Instagram
      const texto = String(cambios[campo]).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (campo === "epigrafe" && texto.length > 2200) return { ok: false, motivo: "El epígrafe de Instagram admite hasta 2200 caracteres." };
      if (campo === "gancho" && texto.includes("\n")) return { ok: false, motivo: "El gancho es una sola línea." };
      nuevos[campo] = texto;
    }
    if (cambios.hora !== undefined) {
      if (!esHoraValida(cambios.hora)) return { ok: false, motivo: "La hora tiene que ser HH:MM." };
      nuevos.hora = cambios.hora;
    }
    if (!Object.keys(nuevos).length) return { ok: false, motivo: "No cambiaste nada." };

    const pieza = { ...fila.pieza, ...nuevos, fecha: fila.fecha, hora: nuevos.hora ?? fila.hora };
    const errores = await validarEdicion({ fila, pieza, hoy });
    if (errores.length) return { ok: false, motivo: `No pasó las reglas de la marca: ${errores.join(" ")}` };

    if (nuevos.formato && nuevos.formato !== fila.pieza.formato) {
      // Un archivo que no sirve para el tipo nuevo se descarta (un reel necesita video, un carrusel fotos)
      const requerido = MEDIOS_REQUERIDOS[nuevos.formato];
      const medios = await repo.mediosDePieza(fila.id);
      if (medios.some((m) => !requerido || m.tipo !== requerido.tipo)) await repo.borrarMedios(fila.id);
    }
    const { nueva, aviso } = await guardarEdicion(fila, { pieza, hora: pieza.hora, hoy });
    await decirDePieza(nueva, `✏️ Editada desde la oficina\n\n${textoPieza(nueva)}${aviso}`, { botones: botonesPlan(nueva.id, { conIA: conIA(nueva) }) }).catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
    return { ok: true, id: nueva.id, estado: nueva.estado };
  }

  // Archivo subido desde el juego para una pieza (foto JPEG o video MP4/MOV). Vale como mandarlo por Telegram.
  async function adjuntarDesdeJuego(id, { mime, datos, reemplazar = false } = {}) {
    const { fecha: hoy } = ahora();
    const fila = Number.isInteger(id) ? await repo.obtenerPieza(id) : null;
    if (!fila) return { ok: false, motivo: "Esa pieza no existe." };
    if (!VIVAS.includes(fila.estado)) return { ok: false, motivo: `Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no se le puede cambiar el archivo.` };
    if (fila.fecha < hoy) return { ok: false, motivo: "Esa fecha ya pasó." };
    const tipo = mime === "image/jpeg" ? "imagen" : ["video/mp4", "video/quicktime"].includes(mime) ? "video" : null;
    if (!tipo) return { ok: false, motivo: "Ese tipo de archivo no sirve: subí una foto JPEG o un video MP4." };
    if (!datos?.length) return { ok: false, motivo: "El archivo llegó vacío." };
    const requerido = MEDIOS_REQUERIDOS[fila.pieza.formato] ?? { tipo, minimo: 1, maximo: 1 }; // una historia lleva una foto o un video
    if (tipo !== requerido.tipo) return { ok: false, motivo: `Esta pieza es ${fila.pieza.formato === "story" ? "una historia" : `un ${fila.pieza.formato}`}: necesita ${requerido.tipo === "video" ? "un video" : "fotos"}. Si querés otro tipo, cambialo en Editar.` };
    if (reemplazar) await repo.borrarMedios(fila.id);
    const guardado = await guardarMaterial(fila, requerido, { tipo, mime }, datos);
    if (guardado.error) return { ok: false, motivo: guardado.error };
    const medios = await repo.mediosDePieza(fila.id);
    return { ok: true, archivos: medios.length, falta: faltaArchivo({ pieza: fila.pieza }, medios) };
  }

  async function quitarArchivosDesdeJuego(id) {
    const fila = Number.isInteger(id) ? await repo.obtenerPieza(id) : null;
    if (!fila) return { ok: false, motivo: "Esa pieza no existe." };
    if (!VIVAS.includes(fila.estado)) return { ok: false, motivo: `Esa pieza está ${ESTADOS_LEGIBLES[fila.estado]}.` };
    await repo.borrarMedios(fila.id);
    if (["confirmada", "preparada"].includes(fila.estado)) await repo.actualizarPieza(fila.id, { estado: "aprobada", confirmada_el: null, contenedor: null });
    return { ok: true };
  }

  async function manejarActualizacion(actualizacion) {
    try {
      if (actualizacion.callback_query) return await manejarBoton(actualizacion.callback_query);
      if (actualizacion.message) return await manejarMensaje(actualizacion.message);
      return { ignorada: true };
    } catch (error) {
      // Un fallo no tiene que pasar en silencio: si Facundo no ve respuesta, no sabe si el bot cayó o si no entendió
      console.error(`Error en el bot de Telegram: ${error.message}`);
      const chatId = actualizacion.message?.chat?.id ?? actualizacion.callback_query?.message?.chat?.id;
      if (autorizado(chatId)) {
        const aviso = String(error.message).slice(0, 300);
        const idMensaje = actualizacion.message?.message_id;
        await decir(`⚠️ No pude terminar eso: ${aviso}\nProbá de nuevo. Si se repite, mirá los logs del servicio en Render.`, idMensaje ? { responderA: idMensaje } : undefined).catch(() => {});
      }
      return { error: true };
    }
  }

  // ───────────────────────── Aviso de las 8 ─────────────────────────
  async function enviarRecordatorios(hoy) {
    let enviados = 0;
    for (const recordatorio of await repo.recordatoriosPendientes(hoy)) {
      const fila = await repo.obtenerPieza(recordatorio.pieza_id);
      if (fila && fila.fecha >= hoy) {
        await decirDePieza(fila, textoRecordatorio(fila, diasHasta(hoy, fila.fecha)));
        enviados++;
      }
      await repo.marcarRecordatorioEnviado(recordatorio.id);
    }
    return enviados;
  }

  async function enviarResumenDiario(hoy) {
    const pendientes = (await repo.piezasDelDia(hoy)).filter((f) => ["propuesta", "aprobada"].includes(f.estado));
    for (const fila of pendientes) await enviarTarjetaDelDia(fila);
    return pendientes.length;
  }

  // La pieza de hoy con su hora y los botones para confirmarla, modificarla o cancelarla
  async function enviarTarjetaDelDia(fila) {
    const falta = faltaArchivo(fila, await repo.mediosDePieza(fila.id));
    return decirDePieza(fila, textoResumenDiario(fila, { faltaArchivo: falta }), { botones: botonesDia(fila.id, fila.hora, { conIA: conIA(fila) }) });
  }

  // ───────────────────────── Chat con la IA ─────────────────────────
  // Facundo escribe como en cualquier chat y la IA entiende, mira y cambia las piezas con las herramientas de conversacion.js.
  // Ninguna herramienta publica, confirma ni cancela: eso siempre pasa por un botón que toca Facundo.
  // Un mensaje a la vez: si Facundo escribe en Telegram y en el juego casi juntos, el segundo espera al primero y ve su resultado
  let cola = Promise.resolve();
  const enCola = (tarea) => {
    const corrida = cola.then(tarea, tarea);
    cola = corrida.catch(() => {});
    return corrida;
  };

  // El núcleo de la charla, igual para Telegram y para el juego: misma memoria ("chat"), mismas herramientas, mismas reglas.
  // Devuelve { ok, respuesta, limite } o { ok: false, error }.
  async function pensar({ texto, canal, fila = null }) {
    const { fecha: hoy, hora } = ahora();
    const clave = `chat-dia:${hoy}`;
    const hechos = Number(await repo.leerEstado(clave)) || 0;
    if (hechos >= MENSAJES_MAXIMOS_POR_DIA) {
      return { ok: false, limite: true, respuesta: `Llegué al máximo de ${MENSAJES_MAXIMOS_POR_DIA} mensajes de charla por hoy (es un freno por el cupo gratis de la IA). Los botones y comandos siguen andando; mañana seguimos charlando.` };
    }
    await repo.guardarEstado(clave, hechos + 1);

    const entrada = fila ? `[Facundo responde al mensaje de la pieza ${fila.id} del ${fechaLegible(fila.fecha)} (${fila.pieza.formato}: "${fila.pieza.gancho}"). Si no aclara otra cosa, se refiere a esa pieza.]\n${texto}` : texto;
    const memoria = (await repo.leerEstado("chat")) ?? [];
    const historial = [...memoria, { rol: "usuario", texto: entrada, visible: texto, canal, en: new Date().toISOString() }];

    const efectos = { guardados: 0, rechazos: [] };
    let salida;
    try {
      salida = await llm.conversar({
        sistema: construirSistemaChat({ fecha: hoy, hora, permitirPublicar }),
        historial: paraElModelo(historial),
        herramientas: HERRAMIENTAS_CHAT,
        ejecutar: async (nombre, argumentos) => {
          const resultado = await ejecutarHerramienta(nombre, argumentos, { hoy, hora, canal });
          if (["modificar_pieza", "programar_pieza", "editar_dato", "agregar_agenda", "quitar_agenda"].includes(nombre)) {
            if (resultado?.ok === true) efectos.guardados++;
            else efectos.rechazos.push(resultado?.error ?? (resultado?.errores ?? []).join(" "));
          }
          return resultado;
        },
      });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    let respuesta = salida || "Listo.";
    // La IA a veces "acuerda" un cambio en la charla y dice que lo guardó sin llamar a la herramienta: Facundo tiene que enterarse
    if (efectos.guardados === 0 && afirmaCambio(respuesta)) {
      const motivo = efectos.rechazos.filter(Boolean).join(" ").slice(0, 300);
      respuesta += motivo
        ? `\n\n⚠️ No quedó guardado: el sistema rechazó el cambio (${motivo}).`
        : "\n\n⚠️ Ojo: NO se guardó ningún cambio en la pieza. Respondé al mensaje de la pieza con el texto exacto y lo guardo, o escribime «cambiá el epígrafe de la pieza del 29/10 a: …».";
    }
    await repo.guardarEstado("chat", recortarRecuerdo([...historial, { rol: "asistente", texto: respuesta, canal, en: new Date().toISOString() }]));
    return { ok: true, respuesta };
  }

  // Telegram
  async function conversar(msg, texto) {
    const responder = (t, o) => decir(t, { responderA: msg.message_id, ...o });
    const fila = msg.reply_to_message ? await repo.piezaPorMensaje(msg.reply_to_message.message_id) : null;
    telegram.escribiendo?.();
    const resultado = await enCola(() => pensar({ texto, canal: "telegram", fila }));
    if (resultado.ok || resultado.limite) return responder(resultado.respuesta);
    // Lo que no se pudo entender no se pierde: si era una novedad suelta, queda anotada para el próximo plan
    if (!fila) {
      await repo.agregarNovedad(texto);
      return responder(`No pude procesar tu mensaje: ${resultado.error}\nLo anoté como novedad de VOW para el próximo plan. Si era un pedido, repetímelo en un rato o usá los botones.`);
    }
    return responder(`No pude procesar tu mensaje: ${resultado.error}\nProbá de nuevo en un rato o usá los botones de la pieza.`);
  }

  // El juego: el mismo bot y la misma memoria. Un error acá no se anota como novedad: el juego lo muestra y Facundo reintenta.
  async function conversarDesdeJuego(texto) {
    const limpio = String(texto ?? "").trim().slice(0, 2000);
    if (!limpio) return { ok: false, error: "El mensaje está vacío." };
    if (!llm) return { ok: false, error: "El chat con la IA no está configurado en el servicio (falta GEMINI_API_KEY)." };
    return enCola(() => pensar({ texto: limpio, canal: "juego" }));
  }

  // La charla guardada, lista para mostrar (lo que se ve es lo que Facundo escribió, sin los avisos internos)
  async function charla(limite = 30) {
    const memoria = (await repo.leerEstado("chat")) ?? [];
    return memoria.slice(-limite).map((m) => ({ rol: m.rol, texto: m.visible ?? m.texto, canal: m.canal ?? "telegram", en: m.en ?? null }));
  }

  // Arma con la IA una pieza nueva para un día libre (la usan el chat y el "Cambiar" del juego para piezas que solo existen en los documentos)
  async function programarPieza(entrada, { hoy, canal, alAvanzar = null }) {
    const fecha = String(entrada.fecha ?? "").trim();
    if (!esFechaISO(fecha)) return { error: "La fecha tiene que ser AAAA-MM-DD." };
    if (fecha < hoy) return { error: `El ${fechaLegible(fecha)} ya pasó.` };
    if (diasHasta(hoy, fecha) > 60) return { error: "Solo se programa hasta 60 días hacia adelante." };
    const formato = String(entrada.formato || "reel").toLowerCase();
    if (!["reel", "carrusel", "imagen", "story"].includes(formato)) return { error: "El formato tiene que ser reel, carrusel, imagen o story." };
    const horaPieza = esHoraValida(entrada.hora) ? entrada.hora : HORA_POR_DEFECTO;
    const indicacion = String(entrada.indicacion ?? "").trim();
    if (!indicacion) return { error: "Falta la indicación: qué quiere Facundo que diga o muestre la pieza." };
    if (!editor) return { error: "Armar piezas con IA no está configurado en el servicio (falta ANTHROPIC_API_KEY)." };
    const viva = (await repo.piezasDelDia(fecha)).find((f) => VIVAS.includes(f.estado));
    if (viva) return { error: `El ${fechaLegible(fecha)} ya tiene la pieza ${viva.id} ("${viva.pieza.gancho}"). Usá modificar_pieza para cambiarla.` };
    const claveEdiciones = `ediciones:${hoy}`;
    const hechas = Number(await repo.leerEstado(claveEdiciones)) || 0;
    if (hechas >= EDICIONES_MAXIMAS_POR_DIA) return { error: `Se llegó al máximo de ${EDICIONES_MAXIMAS_POR_DIA} ediciones por día (es un freno de gasto).` };
    await repo.guardarEstado(claveEdiciones, hechas + 1);

    const cercanas = await repo.piezasEntre(sumarDias(hoy, -14), sumarDias(hoy, 14));
    const contexto = cercanas.map((f) => `- ${fechaLegible(f.fecha)} (${f.pieza.formato}): ${f.pieza.gancho}`).join("\n");
    const instruccion = `Pieza nueva para el ${fecha} (${fechaLegible(fecha)}), formato ${formato}, a las ${horaPieza}.\n${indicacion}${contexto ? `\n\nPiezas de estos días (no las repitas):\n${contexto}` : ""}`;
    let resultado;
    try {
      resultado = await editor.editarPieza({ fila: { pieza: { formato }, fecha, hora: horaPieza }, instruccion, hoy, nueva: true, alAvanzar });
    } catch (error) {
      return { error: `No pude armar la pieza: ${error.message}` };
    }
    if (!resultado.ok) return { ok: false, errores: resultado.errores };

    const pieza = { ...resultado.pieza, fecha, hora: horaPieza };
    const fila = await repo.crearPiezaSuelta({ semana: lunesDe(fecha), fecha, hora: horaPieza, pieza });
    let aviso = "";
    if (material(fila).length) {
      const diaAviso = fechaDeAviso(fecha);
      if (diaAviso > hoy) await repo.crearRecordatorio({ piezaId: fila.id, fecha: diaAviso });
      else if (diaAviso < hoy) aviso = "\n⚠️ Con esta fecha te quedan menos de 3 días para producir el material.";
    }
    await decirDePieza(fila, `🆕 Pieza nueva para el ${fechaLegible(fecha)}, armada desde ${canal === "juego" ? "el juego" : "el chat"}${resultado.queCambio ? `: ${resultado.queCambio}` : ""}\n\n${textoPieza(fila)}${aviso}`, { botones: botonesPlan(fila.id, { conIA: conIA(fila) }) })
      .catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
    return { ok: true, id: fila.id, estado: "propuesta", fecha, hora: horaPieza, formato: pieza.formato, nota: `Quedó propuesta (ID ${fila.id}) y ya se la mostré a Facundo en Telegram con sus botones. Falta que la apruebe.${aviso}` };
  }

  async function ejecutarHerramienta(nombre, argumentos, { hoy, hora, canal = "telegram" }) {
    const piezaDe = async (valor) => {
      const fila = Number.isInteger(Number(valor)) ? await repo.obtenerPieza(Number(valor)) : null;
      return fila && fila.estado !== "cancelada" ? fila : null;
    };
    const noExiste = { error: "No existe una pieza con ese ID. Usá ver_semana para ver los IDs." };

    if (nombre === "ver_semana") {
      const filas = await repo.piezasEntre(sumarDias(hoy, -1), sumarDias(hoy, 14));
      const piezas = [];
      for (const f of filas) {
        const medios = await repo.mediosDePieza(f.id);
        piezas.push({
          id: f.id, fecha: f.fecha, dia: fechaLegible(f.fecha), hora: f.hora, formato: f.pieza.formato, gancho: f.pieza.gancho,
          produccion: f.pieza.produccion ?? "propio", estado: ESTADOS_LEGIBLES[f.estado], confirmada_hoy: f.confirmada_el === hoy,
          archivos: medios.length, falta_archivo: faltaArchivo(f, medios),
        });
      }
      return { piezas, nota: piezas.length ? undefined : "No hay piezas en estos días." };
    }
    if (nombre === "ver_pieza") {
      const fila = await piezaDe(argumentos.id);
      if (!fila) return noExiste;
      const medios = await repo.mediosDePieza(fila.id);
      return {
        id: fila.id, fecha: fila.fecha, hora: fila.hora, estado: ESTADOS_LEGIBLES[fila.estado], pieza: fila.pieza,
        archivos: medios.map((m) => m.tipo), falta_archivo: faltaArchivo(fila, medios), // lo que ya se subió (por ejemplo ["video"]) y lo que falta, si falta algo
      };
    }
    if (nombre === "modificar_pieza") {
      const fila = await piezaDe(argumentos.id);
      if (!fila) return noExiste;
      if (!VIVAS.includes(fila.estado)) return { error: `La pieza está ${ESTADOS_LEGIBLES[fila.estado]}: ya no se puede modificar.` };
      if (!validarEdicion) return { error: "La edición no está disponible en este momento." };
      const cambios = argumentos.cambios && typeof argumentos.cambios === "object" ? argumentos.cambios : {};
      const ajenos = Object.keys(cambios).filter((c) => !CAMPOS_EDITABLES.includes(c));
      if (ajenos.length) return { error: `Esos campos no se pueden cambiar: ${ajenos.join(", ")}. Los editables son: ${CAMPOS_EDITABLES.join(", ")}.` };
      if (!Object.keys(cambios).length) return { error: "No indicaste ningún cambio." };

      const pieza = { ...fila.pieza, ...cambios, fecha: cambios.fecha ?? fila.fecha, hora: cambios.hora ?? fila.hora };
      const errores = await validarEdicion({ fila, pieza, hoy });
      if (errores.length) return { ok: false, errores };
      const { nueva, aviso } = await guardarEdicion(fila, { pieza, hora: pieza.hora, hoy });
      // Facundo ve la pieza actualizada con sus botones; la IA no tiene que repetirla entera
      await decirDePieza(nueva, `${argumentos.que_cambio ? `✏️ ${String(argumentos.que_cambio).slice(0, 300)}\n\n` : ""}${textoPieza(nueva)}${aviso}`, { botones: botonesPlan(nueva.id, { conIA: conIA(nueva) }) });
      return { ok: true, estado: ESTADOS_LEGIBLES[nueva.estado], fecha: nueva.fecha, hora: nueva.hora, nota: `Ya le mostré a Facundo la pieza actualizada con sus botones.${aviso ? ` Aviso: ${aviso.trim()}` : ""}` };
    }
    if (nombre === "programar_pieza") return programarPieza(argumentos, { hoy, canal });
    if (nombre === "ver_operacion") {
      const base = await investigacion();
      const op = await leerOperacion(repo);
      return resumenParaChat(op, vistaEstrategia(op.estrategia, base, lunesDe(hoy)));
    }
    if (nombre === "editar_dato" || nombre === "agregar_agenda" || nombre === "quitar_agenda" || nombre === "editar_estrategia") {
      const accionEstrategia = { agregar: "estrategia_agregar", editar: "estrategia_editar", quitar: "estrategia_quitar", restaurar: "estrategia_restaurar" }[argumentos.accion];
      if (nombre === "editar_estrategia" && !accionEstrategia) return { error: "La acción tiene que ser agregar, editar, quitar o restaurar." };
      const cambio = nombre === "editar_dato" ? { tipo: "campo", campo: argumentos.campo, valor: argumentos.valor }
        : nombre === "agregar_agenda" ? { tipo: "agenda_agregar", fecha: argumentos.fecha, hora: argumentos.hora, sala: argumentos.sala, texto: argumentos.texto }
          : nombre === "editar_estrategia" ? { tipo: accionEstrategia, clave: argumentos.id, texto: argumentos.texto }
            : { tipo: "agenda_quitar", clave: argumentos.id };
      try {
        const { lineas } = await investigacion();
        const { resumen } = await aplicarOperacion(repo, cambio, { origen: "bot", base: lineas });
        return { ok: true, nota: `Guardado y visible en el juego: ${resumen}` };
      } catch (error) {
        if (error instanceof ErrorOperacion) return { error: error.message };
        throw error;
      }
    }
    if (nombre === "ver_stock") return vistaInventario(await leerInventario(repo), hoy);
    if (nombre === "registrar_llegada" || nombre === "ajustar_stock" || nombre === "registrar_venta" || nombre === "anular_venta") {
      const cambio = nombre === "registrar_llegada" ? { tipo: "entrada", sku: argumentos.producto, cantidad: argumentos.cantidad, nota: argumentos.nota }
        : nombre === "ajustar_stock" ? { tipo: "ajuste", sku: argumentos.producto, cantidad: argumentos.cantidad, nota: argumentos.nota }
          : nombre === "registrar_venta" ? { tipo: "venta", items: argumentos.items, nota: argumentos.nota, fecha: argumentos.fecha }
            : { tipo: "anular_venta", id: argumentos.id };
      try {
        const { resumen, id, inventario } = await aplicarInventario(repo, cambio, { origen: "bot" });
        return { ok: true, nota: `Guardado y visible en el juego: ${resumen}`, ...(id ? { id_venta: id } : {}), stock: inventario.stock };
      } catch (error) {
        if (error instanceof ErrorInventario) return { error: error.message };
        throw error;
      }
    }
    if (nombre === "aprobar_pieza") {
      const fila = await piezaDe(argumentos.id);
      if (!fila) return noExiste;
      if (!(await repo.reclamar(fila.id, ["propuesta"], "aprobada"))) return { error: `La pieza está ${ESTADOS_LEGIBLES[fila.estado]}: no hace falta aprobarla.` };
      return { ok: true, nota: `Aprobada. El ${fechaLegible(fila.fecha)} a las 8 se le pide la confirmación final.` };
    }
    if (nombre === "pedir_confirmacion") {
      const fila = await piezaDe(argumentos.id);
      if (!fila) return noExiste;
      if (fila.fecha !== hoy) return { error: `La confirmación solo vale el mismo día de la publicación. Esta pieza es del ${fechaLegible(fila.fecha)}.` };
      if (!["propuesta", "aprobada"].includes(fila.estado)) return { error: `La pieza está ${ESTADOS_LEGIBLES[fila.estado]}.` };
      await enviarTarjetaDelDia(fila);
      return { ok: true, nota: "Le mandé la pieza con el botón Confirmar. Falta que Facundo lo toque: vos no podés confirmar." };
    }
    if (nombre === "pedir_cancelacion") {
      const fila = await piezaDe(argumentos.id);
      if (!fila) return noExiste;
      if (!VIVAS.includes(fila.estado) && fila.estado !== "fallida") return { error: `La pieza está ${ESTADOS_LEGIBLES[fila.estado]}: no se puede cancelar.` };
      await decirDePieza(fila, `¿Cancelo la pieza del ${fechaLegible(fila.fecha)} a las ${fila.hora} ("${fila.pieza.gancho}")? No se publica y se borran sus archivos.`, { botones: botonesCancelar(fila.id) });
      return { ok: true, nota: "Le mandé el botón para cancelar. Falta que Facundo lo toque: vos no podés cancelar." };
    }
    if (nombre === "anotar_novedad") {
      const texto = String(argumentos.texto ?? "").trim();
      if (!texto) return { error: "La novedad está vacía." };
      await repo.agregarNovedad(texto.slice(0, 1000));
      return { ok: true, nota: "Anotada para el plan del próximo lunes." };
    }
    if (nombre === "reenviar_hoy") return { ok: true, enviadas: await enviarResumenDiario(hoy) };
    if (nombre === "pausar_publicaciones") {
      await repo.guardarEstado("pausa", true);
      return { ok: true, nota: "Pausado: no se publica nada hasta que se reanude." };
    }
    if (nombre === "reanudar_publicaciones") {
      await repo.guardarEstado("pausa", false);
      return { ok: true, nota: "Reanudado: lo confirmado para hoy se publica a su hora." };
    }
    if (nombre === "estado_del_sistema") {
      return { pausado: (await repo.leerEstado("pausa")) === true, publica_de_verdad: permitirPublicar, fecha: hoy, hora };
    }
    return { error: `No existe la herramienta ${nombre}.` };
  }

  // ───────────────────────── Publicación ─────────────────────────
  async function urlsDeMedios(fila) {
    return (await repo.mediosDePieza(fila.id)).map((m) => validarUrlPublica(`${urlPublica.replace(/\/$/, "")}/api/programacion/medios/${m.token}`));
  }

  // Arma el contenedor en Meta (todavía no se publica). Devuelve su ID.
  async function crearContenedor(fila) {
    const problemas = await problemasParaPublicar(fila);
    if (problemas.length) throw new Error(problemas.join("; "));
    const urls = await urlsDeMedios(fila);
    const { formato, epigrafe } = fila.pieza;
    const cupo = await meta.cupo();
    if (cupo.total !== null && cupo.usado !== null && cupo.usado >= cupo.total) throw new Error(`Se usó todo el cupo de publicaciones por API de las últimas 24 h (${cupo.usado} de ${cupo.total}).`);
    if (formato === "imagen") return meta.crearContenedor({ image_url: urls[0], caption: epigrafe });
    if (formato === "reel") return meta.crearContenedor({ media_type: "REELS", video_url: urls[0], caption: epigrafe });
    const hijos = [];
    for (const url of urls) hijos.push(await meta.crearContenedor({ image_url: url, is_carousel_item: "true" }));
    return meta.crearContenedor({ media_type: "CAROUSEL", children: hijos.join(","), caption: epigrafe });
  }

  async function preparar(fila) {
    if (!(await repo.reclamar(fila.id, ["confirmada"], "preparando"))) return null;
    try {
      let contenedor = "simulado";
      if (permitirPublicar) contenedor = await crearContenedor(fila);
      else {
        const problemas = await problemasParaPublicar(fila);
        if (problemas.length) throw new Error(problemas.join("; "));
      }
      await repo.actualizarPieza(fila.id, { estado: "preparada", contenedor, error: null });
      return "preparada";
    } catch (error) {
      // Todavía no se publicó nada: es seguro volver a intentar unos minutos
      const intentos = fila.intentos + 1;
      if (intentos < INTENTOS_PREPARAR) {
        await repo.actualizarPieza(fila.id, { estado: "confirmada", intentos, error: error.message });
        return "reintento";
      }
      await repo.actualizarPieza(fila.id, { estado: "aprobada", confirmada_el: null, intentos, error: error.message });
      await avisar(fila, `❌ No pude preparar la publicación de las ${fila.hora}: ${error.message}\nNo se publicó nada. Cuando lo arregles, confirmala de nuevo.`, { botones: botonesDia(fila.id, fila.hora, { conIA: conIA(fila) }) });
      return "no-preparada";
    }
  }

  async function publicar(fila) {
    if (!(await repo.reclamar(fila.id, ["preparada"], "publicando"))) return null;

    if (!permitirPublicar) {
      await repo.actualizarPieza(fila.id, { estado: "manual" });
      await repo.borrarMedios(fila.id);
      await avisar(fila, `🧪 [SIMULACIÓN] A las ${fila.hora} se habría publicado este ${fila.pieza.formato}. No se tocó Instagram. Para publicar de verdad hay que activar INSTAGRAM_PERMITIR_PUBLICAR=1 en el servicio.`);
      return "simulada";
    }

    let estado;
    try {
      estado = await meta.estadoContenedor(fila.contenedor);
    } catch (error) {
      await repo.actualizarPieza(fila.id, { estado: "preparada", error: error.message }); // no se publicó: se reintenta en el próximo ciclo
      return "error-de-lectura";
    }
    if (estado === "IN_PROGRESS") {
      await repo.actualizarPieza(fila.id, { estado: "preparada" });
      return "esperando-a-meta";
    }
    if (estado !== "FINISHED") {
      await repo.actualizarPieza(fila.id, { estado: "aprobada", confirmada_el: null, contenedor: null, error: `Meta no pudo procesar el archivo (estado ${estado}).` });
      await avisar(fila, `❌ Meta no pudo procesar el archivo de las ${fila.hora} (estado ${estado}). No se publicó nada. Mandame el archivo de nuevo y confirmala otra vez.`, { botones: botonesDia(fila.id, fila.hora, { conIA: conIA(fila) }) });
      return "contenedor-con-error";
    }

    try {
      const { permalink } = await meta.publicar(fila.contenedor);
      await repo.actualizarPieza(fila.id, { estado: "publicada", permalink: permalink ?? null, error: null });
      await repo.borrarMedios(fila.id);
      await avisar(fila, `✅ Publicada a las ${fila.hora}.${permalink ? `\n${permalink}` : ""}`);
      return "publicada";
    } catch (error) {
      // Acá no se sabe si Instagram llegó a publicar: NUNCA se reintenta solo (podría duplicar la publicación)
      await repo.actualizarPieza(fila.id, { estado: "fallida", error: error.message });
      await avisar(fila, `❌ Falló la publicación de las ${fila.hora}: ${error.message}\nNo la reintento sola porque puede haberse publicado igual. Revisá @vow_ar antes de hacer nada más.`);
      return "fallida";
    }
  }

  async function avisarTarde(fila, hoy) {
    if (!(await repo.tomarEstado(`tarde:${fila.id}`, hoy))) return null;
    await avisar(fila, `⏰ Se pasó la hora (${fila.hora}) y esta pieza no se publicó. No publico fuera de hora sin que me lo pidas: ¿la publico ahora?`, { botones: botonesTarde(fila.id) });
    return "tarde";
  }

  async function avisarPausa(fila, hoy) {
    if (!(await repo.tomarEstado(`pausa-aviso:${fila.id}`, hoy))) return null;
    await avisar(fila, `⏸️ Estás en pausa, así que no publiqué lo de las ${fila.hora}. Mandá /reanudar y, si ya pasó la hora, tocá "Publicar ahora".`, { botones: botonesTarde(fila.id) });
    return "pausa";
  }

  async function procesarPieza(fila, { hoy, minutos, pausado }) {
    const faltan = minutosDelDia(fila.hora) - minutos; // negativo si la hora ya pasó
    const retraso = -faltan;

    if (fila.estado === "propuesta" || fila.estado === "aprobada") {
      // Dos horas antes: recordatorio de que falta confirmar (una vez por día y hora; si cambia la hora, vuelve a avisar).
      // Si esas dos horas caen antes del aviso de las 8 (o justo en él), el propio aviso de las 8 ya cumple ese papel.
      // Sin respuesta no pasa nada: sin confirmación del día no se publica.
      if (
        faltan > 0 &&
        faltan <= MINUTOS_AVISO_SIN_CONFIRMAR &&
        minutosDelDia(fila.hora) - MINUTOS_AVISO_SIN_CONFIRMAR > minutosDelDia(HORA_RESUMEN) &&
        (await repo.tomarEstado(`aviso-2h:${fila.id}`, `${hoy} ${fila.hora}`))
      ) {
        const falta = faltaArchivo(fila, await repo.mediosDePieza(fila.id));
        await decirDePieza(
          fila,
          `⏳ Faltan 2 horas para las ${fila.hora} hs y esta pieza sigue sin confirmar.\n\n${textoPieza(fila)}\n\n${falta ? `⚠️ ${falta}\n\n` : ""}¿Querés cambiar algo antes de confirmarla? Respondé a este mensaje con el cambio, o tocá Confirmar. Si no respondés, no se publica nada.`,
          { botones: botonesDia(fila.id, fila.hora, { conIA: conIA(fila) }) },
        ).catch((error) => console.error(`No se pudo avisar por Telegram: ${error.message}`));
        return "aviso-2h";
      }
      // Sin confirmación no se publica nada: se avisa una sola vez
      if (faltan <= 0 && (await repo.tomarEstado(`sin-confirmar:${fila.id}`, hoy))) {
        await avisar(fila, `🔕 Son las ${fila.hora} y no confirmaste esta pieza, así que no publiqué nada. ¿La publico ahora?`, { botones: botonesTarde(fila.id) });
        return "sin-confirmar";
      }
      return null;
    }

    if (fila.estado === "confirmada") {
      if (fila.confirmada_el !== hoy) return null;
      if (!MEDIOS_REQUERIDOS[fila.pieza.formato]) {
        if (faltan > 0 || !(await repo.reclamar(fila.id, ["confirmada"], "manual"))) return null;
        await avisar(fila, `🔔 Es la hora (${fila.hora}) de publicar tu story. Las stories todavía las publicás vos a mano.`);
        return "story";
      }
      if (faltan > MINUTOS_PARA_PREPARAR) return null;
      if (retraso > TOLERANCIA_MINUTOS) return avisarTarde(fila, hoy);
      if (pausado) return avisarPausa(fila, hoy);
      return preparar(fila);
    }

    if (fila.estado === "preparada") {
      if (faltan > 0) return null;
      if (retraso > TOLERANCIA_MINUTOS) return avisarTarde(fila, hoy);
      if (pausado) return avisarPausa(fila, hoy);
      return publicar(fila);
    }

    if ((fila.estado === "preparando" || fila.estado === "publicando") && retraso > 0 && (await repo.tomarEstado(`trabada:${fila.id}`, hoy))) {
      await avisar(fila, `⚠️ La publicación de las ${fila.hora} quedó trabada (estado: ${ESTADOS_LEGIBLES[fila.estado]}). Revisá @vow_ar por si salió, y si no, mandame /hoy o respondé a la pieza.`);
      return "trabada";
    }
    return null;
  }

  // Se llama cada minuto (cron-job.org) y cada 5 minutos (GitHub Actions, de respaldo). Es idempotente: llamarlo de más no hace nada.
  async function tick() {
    const { fecha: hoy, hora } = ahora();
    const minutos = minutosDelDia(hora);
    const acciones = [];

    // Aviso de las 8: recordatorios de filmación y confirmación de lo de hoy (una sola vez por día)
    if (minutos >= minutosDelDia(HORA_RESUMEN)) {
      const previo = await repo.leerEstado("resumen_diario");
      if (await repo.tomarEstado("resumen_diario", hoy)) {
        try {
          acciones.push(`recordatorios:${await enviarRecordatorios(hoy)}`, `resumen:${await enviarResumenDiario(hoy)}`);
        } catch (error) {
          await repo.guardarEstado("resumen_diario", previo ?? ""); // que el próximo ciclo lo reintente
          console.error(`No se pudo mandar el aviso de las 8: ${error.message}`);
          acciones.push({ error: error.message });
        }
      }
    }

    const pausado = (await repo.leerEstado("pausa")) === true;
    for (const fila of await repo.piezasDelDia(hoy)) {
      try {
        const accion = await procesarPieza(fila, { hoy, minutos, pausado });
        if (accion) acciones.push(`${fila.id}:${accion}`);
      } catch (error) {
        console.error(`Error procesando la pieza ${fila.id}: ${error.message}`);
        acciones.push({ pieza: fila.id, error: error.message });
      }
    }
    return { fecha: hoy, hora, acciones };
  }

  return { recibirPlan, avisarFalloDelPlan, manejarActualizacion, aprobarDesdeJuego, confirmarDesdeJuego, sugerirCambio, cambiarSinFila, editarDesdeJuego, adjuntarDesdeJuego, quitarArchivosDesdeJuego, conversarDesdeJuego, charla, tick, enviarResumenDiario: () => enviarResumenDiario(ahora().fecha) };
}
