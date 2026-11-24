// Lógica del bot de Telegram y de la oficina. Habla con cosas que se inyectan (por eso se prueba sin red ni base):
//   repo      → la base (repositorio.js, o repositorio-memoria.js en los tests)
//   telegram  → el bot con el que Facundo recibe y responde
//   llm       → (opcional) la IA con la que Facundo charla; sin ella, lo que escribe queda como novedad
//
// Qué hace:
//   1. Recibe el FLUJO SEMANAL que arma el Estratega (día, formato y contenido de cada publicación), lo guarda y se lo manda a Facundo.
//   2. Conversa: stock, ventas, estrategia, agenda, descuentos y novedades. Nada de esto publica en Instagram.
// El bot NO publica ni arma piezas: Facundo hace cada publicación a mano.
import { ErrorOperacion, aplicarOperacion, leerOperacion, resumenParaChat } from "./operacion.js";
import { ErrorInventario, aplicarInventario, leerInventario, vistaInventario } from "./inventario.js";
import { lineasDeInvestigacion, vistaEstrategia } from "./estrategia-semana.js";
import { HERRAMIENTAS_CHAT, afirmaCambio, MENSAJES_MAXIMOS_POR_DIA, construirSistemaChat, paraElModelo, recortarRecuerdo } from "./conversacion.js";
import { ahoraArgentina, fechaLegible, lunesDe, nombreDelDia, sumarDias } from "./fechas.js";
import { textoFlujoSemanal } from "./mensajes.js";

export const clavePlan = (semana) => `flujo:${semana}`;

export function crearServicio({ repo, telegram, llm = null, ahora = () => ahoraArgentina(), descuentos = null, investigacion = lineasDeInvestigacion } = {}) {
  const decir = (texto, opciones) => telegram.enviarMensaje(texto, opciones);
  const autorizado = (chatId) => telegram.chatId !== null && String(chatId) === telegram.chatId;

  // ───────────────────────── Flujo de la semana ─────────────────────────
  async function leerFlujo(semana) {
    const guardado = await repo.leerEstado(clavePlan(semana));
    return guardado && Array.isArray(guardado.dias) ? guardado : null;
  }

  // El de esta semana y el de la próxima (lo que muestran la oficina y el chat)
  async function flujosVigentes(hoy = ahora().fecha) {
    const actual = lunesDe(hoy);
    const salida = [];
    for (const semana of [actual, sumarDias(actual, 7)]) {
      const flujo = await leerFlujo(semana);
      if (flujo) salida.push({ semana, dias: flujo.dias.map((d) => ({ ...d, dia: nombreDelDia(d.fecha) })) });
    }
    return salida;
  }

  async function recibirPlan({ semana, plan, novedadesUsadas = [] }) {
    const dias = plan.dias.map(({ fecha, formato, contenido }) => ({ fecha, formato, contenido: String(contenido).trim() }));
    await repo.guardarEstado(clavePlan(semana), { semana, dias, creado: new Date().toISOString() });
    await repo.marcarNovedadesUsadas(novedadesUsadas);
    await decir(textoFlujoSemanal({ semana, dias }));
    return { publicaciones: dias.length };
  }

  async function avisarFalloDelPlan({ semana, error }) {
    await decir(`⚠️ No pude armar el flujo de la semana del ${fechaLegible(semana)}.\n${error}\nSi querés, corré el plan de nuevo desde GitHub Actions (workflow "Plan del lunes").`);
  }

  // ───────────────────────── Mensajes y comandos ─────────────────────────
  async function manejarMensaje(msg) {
    const texto = msg.text?.trim() ?? "";
    if (!autorizado(msg.chat?.id)) {
      if (texto.startsWith("/start")) await telegram.enviarA(msg.chat.id, `Tu chat id es ${msg.chat.id}. Cargalo como TELEGRAM_CHAT_ID en el servicio para que este bot te responda.`);
      return { ignorada: true };
    }
    if (texto.startsWith("/")) return comando(texto, msg);
    if (msg.photo || msg.video || msg.document) {
      return decir("Este bot ya no recibe archivos: las publicaciones las hacés vos desde Instagram. Si querés contarme algo, escribilo.", { responderA: msg.message_id });
    }
    if (!texto) return { ignorada: true };
    if (llm) return conversar(msg, texto);
    return novedad(msg, texto);
  }

  async function comando(texto, msg) {
    const nombre = texto.split(/[\s@]/)[0].toLowerCase();
    const responder = (t, o) => decir(t, { responderA: msg.message_id, ...o });
    if (nombre === "/flujo" || nombre === "/hoy") {
      const [actual] = await flujosVigentes();
      return actual ? responder(textoFlujoSemanal(actual)) : responder("Todavía no hay flujo para esta semana. Se arma los lunes.");
    }
    return responder("Comandos: /flujo (te manda el flujo de la semana). Escribime para charlar (stock, ventas, estrategia) o para dejar una novedad de VOW.");
  }

  async function novedad(msg, texto) {
    await repo.agregarNovedad(texto);
    return decir("📝 Anotado. Se lo paso al Estratega en el próximo flujo del lunes.", { responderA: msg.message_id });
  }

  async function manejarActualizacion(actualizacion) {
    try {
      if (actualizacion.message) return await manejarMensaje(actualizacion.message);
      return { ignorada: true };
    } catch (error) {
      // Un fallo no tiene que pasar en silencio: si Facundo no ve respuesta, no sabe si el bot cayó o si no entendió
      console.error(`Error en el bot de Telegram: ${error.message}`);
      const chatId = actualizacion.message?.chat?.id;
      if (autorizado(chatId)) {
        const aviso = String(error.message).slice(0, 300);
        const idMensaje = actualizacion.message?.message_id;
        await decir(`⚠️ No pude terminar eso: ${aviso}\nProbá de nuevo. Si se repite, mirá los logs del servicio en Render.`, idMensaje ? { responderA: idMensaje } : undefined).catch(() => {});
      }
      return { error: true };
    }
  }

  // ───────────────────────── Chat con la IA ─────────────────────────
  // Un mensaje a la vez: si Facundo escribe en Telegram y en el juego casi juntos, el segundo espera al primero y ve su resultado
  let cola = Promise.resolve();
  const enCola = (tarea) => {
    const corrida = cola.then(tarea, tarea);
    cola = corrida.catch(() => {});
    return corrida;
  };

  // El núcleo de la charla, igual para Telegram y para el juego: misma memoria ("chat"), mismas herramientas, mismas reglas.
  // Devuelve { ok, respuesta, limite } o { ok: false, error }.
  async function pensar({ texto, canal }) {
    const { fecha: hoy, hora } = ahora();
    const clave = `chat-dia:${hoy}`;
    const hechos = Number(await repo.leerEstado(clave)) || 0;
    if (hechos >= MENSAJES_MAXIMOS_POR_DIA) {
      return { ok: false, limite: true, respuesta: `Llegué al máximo de ${MENSAJES_MAXIMOS_POR_DIA} mensajes de charla por hoy (es un freno por el cupo gratis de la IA). Mañana seguimos charlando.` };
    }
    await repo.guardarEstado(clave, hechos + 1);

    const memoria = (await repo.leerEstado("chat")) ?? [];
    const historial = [...memoria, { rol: "usuario", texto, canal, en: new Date().toISOString() }];

    const efectos = { guardados: 0, rechazos: [] };
    let salida;
    try {
      salida = await llm.conversar({
        sistema: construirSistemaChat({ fecha: hoy, hora }),
        historial: paraElModelo(historial),
        herramientas: HERRAMIENTAS_CHAT,
        ejecutar: async (nombre, argumentos) => {
          const resultado = await ejecutarHerramienta(nombre, argumentos, { hoy });
          if (["editar_dato", "editar_estrategia", "agregar_agenda", "quitar_agenda", "registrar_llegada", "ajustar_stock", "registrar_venta", "anular_venta", "anotar_novedad"].includes(nombre)) {
            if (resultado?.ok === true) efectos.guardados++;
            else efectos.rechazos.push(resultado?.error ?? "");
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
      respuesta += motivo ? `\n\n⚠️ No quedó guardado: el sistema rechazó el cambio (${motivo}).` : "\n\n⚠️ Ojo: NO se guardó ningún cambio. Decímelo de nuevo con el dato exacto y lo guardo.";
    }
    await repo.guardarEstado("chat", recortarRecuerdo([...historial, { rol: "asistente", texto: respuesta, canal, en: new Date().toISOString() }]));
    return { ok: true, respuesta };
  }

  // Telegram
  async function conversar(msg, texto) {
    const responder = (t, o) => decir(t, { responderA: msg.message_id, ...o });
    telegram.escribiendo?.();
    const resultado = await enCola(() => pensar({ texto, canal: "telegram" }));
    if (resultado.ok || resultado.limite) return responder(resultado.respuesta);
    // Lo que no se pudo entender no se pierde: queda anotado como novedad para el próximo flujo
    await repo.agregarNovedad(texto);
    return responder(`No pude procesar tu mensaje: ${resultado.error}\nLo anoté como novedad de VOW para el próximo flujo. Si era un pedido, repetímelo en un rato.`);
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

  async function ejecutarHerramienta(nombre, argumentos, { hoy }) {
    if (nombre === "ver_flujo") {
      const flujos = await flujosVigentes(hoy);
      return flujos.length ? { flujos } : { nota: "Todavía no hay flujo para esta semana ni para la próxima. Se arma los lunes." };
    }
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
    if (nombre === "descuento_lista_espera") {
      if (!descuentos) return { error: "Los mails de descuento todavía no están configurados: faltan en Render MAIL_USUARIO y GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN." };
      try {
        if (argumentos.accion === "ver") return await descuentos.estado();
        if (argumentos.accion === "prueba") return { ok: true, ...(await descuentos.prueba(String(argumentos.destino ?? "").trim().toLowerCase())) };
        if (argumentos.accion === "enviar") return { ok: true, ...(await descuentos.enviar({ esperados: argumentos.esperados })) };
        return { error: "La acción tiene que ser ver, prueba o enviar." };
      } catch (error) {
        return { error: `No se pudo: ${String(error.message).slice(0, 200)}` };
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
    if (nombre === "anotar_novedad") {
      const texto = String(argumentos.texto ?? "").trim();
      if (!texto) return { error: "La novedad está vacía." };
      await repo.agregarNovedad(texto.slice(0, 1000));
      return { ok: true, nota: "Anotada para el flujo del próximo lunes." };
    }
    return { error: `No existe la herramienta ${nombre}.` };
  }

  // ───────────────────────── Mensajes que quedaron sin procesar ─────────────────────────
  // Mensajes de Telegram que se guardaron pero no llegaron a procesarse (el servicio se cayó a mitad de camino).
  // Se reintentan hasta 3 veces; los ya procesados se borran a los 7 días. Se revisa al arrancar el servicio.
  async function recuperarActualizaciones({ minutos = 2 } = {}) {
    const pendientes = await repo.reclamarActualizacionesPendientes({ antesDe: new Date(Date.now() - minutos * 60_000) });
    for (const { id, cuerpo } of pendientes) {
      try {
        await manejarActualizacion(cuerpo);
        await repo.marcarActualizacionProcesada(id);
      } catch (error) {
        console.error(`Error al recuperar el mensaje ${id} de Telegram (se reintenta hasta 3 veces): ${error.message}`);
      }
    }
    await repo.borrarActualizacionesViejas(new Date(Date.now() - 7 * 24 * 60 * 60_000));
    return pendientes.length;
  }

  return { recibirPlan, avisarFalloDelPlan, leerFlujo, flujosVigentes, manejarActualizacion, conversarDesdeJuego, charla, recuperarActualizaciones };
}
