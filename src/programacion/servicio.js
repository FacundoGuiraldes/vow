// Lógica de la oficina (VOW HQ). Habla con cosas que se inyectan (por eso se prueba sin red ni base):
//   repo      → la base (repositorio.js, o repositorio-memoria.js en los tests)
//   llm       → (opcional) la IA con la que Facundo charla desde el juego
//
// Qué hace:
//   1. Recibe el FLUJO SEMANAL que arma el Estratega (día, formato y contenido de cada publicación) y lo guarda: el juego lo muestra.
//   2. Conversa: stock, ventas, estrategia, agenda, descuentos y novedades. Nada de esto publica en Instagram.
// No publica ni arma piezas: Facundo hace cada publicación a mano.
import { ErrorOperacion, aplicarOperacion, leerOperacion, resumenParaChat } from "./operacion.js";
import { ErrorInventario, aplicarInventario, leerInventario, vistaInventario } from "./inventario.js";
import { lineasDeInvestigacion, vistaEstrategia } from "./estrategia-semana.js";
import { HERRAMIENTAS_CHAT, afirmaCambio, MENSAJES_MAXIMOS_POR_DIA, construirSistemaChat, paraElModelo, recortarRecuerdo } from "./conversacion.js";
import { ahoraArgentina, lunesDe, nombreDelDia, sumarDias } from "./fechas.js";

export const clavePlan = (semana) => `flujo:${semana}`;

export function crearServicio({ repo, llm = null, ahora = () => ahoraArgentina(), descuentos = null, investigacion = lineasDeInvestigacion } = {}) {
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
    return { publicaciones: dias.length };
  }

  // El workflow del lunes avisa si no pudo armar el flujo: queda guardado y en el log
  async function avisarFalloDelPlan({ semana, error }) {
    console.error(`No se pudo armar el flujo de la semana del ${semana}: ${error}`);
    await repo.guardarEstado(`flujo-error:${semana}`, { semana, error, en: new Date().toISOString() });
  }

  // ───────────────────────── Chat con la IA ─────────────────────────
  // Un mensaje a la vez: si Facundo escribe dos veces casi juntas, el segundo espera al primero y ve su resultado
  let cola = Promise.resolve();
  const enCola = (tarea) => {
    const corrida = cola.then(tarea, tarea);
    cola = corrida.catch(() => {});
    return corrida;
  };

  // El núcleo de la charla: memoria ("chat"), mismas herramientas, mismas reglas.
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

  // El chat del juego. Un error acá no se anota como novedad: el juego lo muestra y Facundo reintenta.
  async function conversarDesdeJuego(texto) {
    const limpio = String(texto ?? "").trim().slice(0, 2000);
    if (!limpio) return { ok: false, error: "El mensaje está vacío." };
    if (!llm) return { ok: false, error: "El chat con la IA no está configurado en el servicio (falta GEMINI_API_KEY)." };
    return enCola(() => pensar({ texto: limpio, canal: "juego" }));
  }

  // La charla guardada, lista para mostrar (lo que se ve es lo que Facundo escribió, sin los avisos internos)
  async function charla(limite = 30) {
    const memoria = (await repo.leerEstado("chat")) ?? [];
    return memoria.slice(-limite).map((m) => ({ rol: m.rol, texto: m.visible ?? m.texto, canal: m.canal ?? "juego", en: m.en ?? null }));
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

  return { recibirPlan, avisarFalloDelPlan, leerFlujo, flujosVigentes, conversarDesdeJuego, charla };
}
