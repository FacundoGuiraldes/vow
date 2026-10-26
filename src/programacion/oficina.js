// Lo que muestra y hace "la oficina" (el juego de VOW HQ). Todo pasa por acá y con clave: la charla con el bot es privada.
//   armarEstadoOficina → lo que el juego lee (piezas, medios, novedades, charla, lo que marcaste, rendimiento de Instagram)
//   aplicarAccion      → lo que el juego puede hacer: aprobar una pieza, marcar pendientes como cumplidos, anotar en el cuaderno
// Lo que se marca en el juego queda también como novedad: el Estratega lo lee en el próximo plan.
// NO se puede confirmar la publicación del día desde acá: esa confirmación sigue siendo solo por Telegram.
import { ErrorOperacion, aplicarOperacion, leerOperacion } from "./operacion.js";
import { createHash } from "node:crypto";
const DIA_MS = 86_400_000;
const LIMITE_ENTRADAS = 200;
const LIMITE_TEXTO = 300;
const TIPOS_NOTA = new Set(["anotacion", "confirmado"]);
const fechaISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const recortar = (valor, largo = LIMITE_TEXTO) => String(valor ?? "").trim().slice(0, largo);
const claveValida = (valor) => typeof valor === "string" && /^[\w:-]{1,60}$/.test(valor);

export class ErrorAccion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

async function leerJuego(repo) {
  const j = (await repo.leerEstado("juego")) ?? {};
  return { hechos: j.hechos ?? {}, notas: j.notas ?? {} };
}

// Guarda quedándose con las últimas LIMITE_ENTRADAS entradas de cada mapa (la base no es un archivo infinito)
async function guardarJuego(repo, juego) {
  const ultimas = (mapa) => Object.fromEntries(Object.entries(mapa).sort((a, b) => String(a[1].en).localeCompare(String(b[1].en))).slice(-LIMITE_ENTRADAS));
  await repo.guardarEstado("juego", { hechos: ultimas(juego.hechos), notas: ultimas(juego.notas) });
}

export async function armarEstadoOficina({ repo, rendimiento = null, permitirPublicar = false, ahora = Date.now() }) {
  const [piezas, novedades, recordatorios, pausa, chat, juego, operacion] = await Promise.all([
    repo.piezasEntre(fechaISO(ahora - 21 * DIA_MS), fechaISO(ahora + 45 * DIA_MS)),
    repo.novedadesRecientes(20),
    repo.recordatoriosPendientes(fechaISO(ahora + 45 * DIA_MS)),
    repo.leerEstado("pausa"),
    repo.leerEstado("chat"),
    leerJuego(repo),
    leerOperacion(repo),
  ]);
  const filas = await Promise.all(
    piezas.map(async (p) => ({
      id: p.id, fecha: p.fecha, hora: p.hora, estado: p.estado, formato: p.pieza?.formato ?? null, pilar: p.pieza?.pilar ?? null,
      gancho: p.pieza?.gancho ?? null, pieza: p.pieza ?? null,
      confirmada_el: p.confirmada_el ?? null, permalink: p.permalink ?? null, error: p.error ?? null,
      medios: (await repo.mediosDePieza(p.id)).map((m) => ({ tipo: m.tipo, token: m.token })),
    })),
  );
  let rend = null;
  if (rendimiento) {
    try {
      rend = await rendimiento.obtener();
    } catch (error) {
      rend = { error: String(error.message).slice(0, 200) };
    }
  }
  const cuerpo = {
    generado: new Date(ahora).toISOString(),
    pausa: pausa === true,
    publica_de_verdad: permitirPublicar,
    recordatorios_pendientes: recordatorios.length,
    piezas: filas,
    novedades: novedades.map((n) => ({ id: n.id, fecha: n.fecha, texto: recortar(n.texto, 240), usada: n.usada === true })),
    chat: (Array.isArray(chat) ? chat : []).slice(-30).map((m) => ({ rol: m.rol, texto: recortar(m.visible ?? m.texto, 1500), canal: m.canal ?? "telegram", en: m.en ?? null })),
    juego,
    operacion,
    rendimiento: rend,
  };
  // La versión cambia solo cuando cambia algo: el juego pregunta seguido y, si no cambió, el servidor contesta cortito
  const { generado, ...sinHora } = cuerpo;
  void generado;
  return { ...cuerpo, version: createHash("sha1").update(JSON.stringify(sinHora)).digest("hex").slice(0, 16) };
}

// Lo que la IA tiene que saber para sugerir algo mejor: novedades, charla con el bot, resto de la semana y cómo les fue a las últimas publicaciones
export async function armarContexto({ repo, rendimiento = null }, idPieza, ahora = Date.now()) {
  const [piezas, novedades, chat] = await Promise.all([repo.piezasEntre(fechaISO(ahora - 14 * DIA_MS), fechaISO(ahora + 30 * DIA_MS)), repo.novedadesRecientes(10), repo.leerEstado("chat")]);
  const partes = [];
  const otras = piezas.filter((p) => p.id !== idPieza && p.estado !== "cancelada").map((p) => `- ${p.fecha} ${p.pieza?.formato ?? ""} (${p.estado}): ${p.pieza?.gancho ?? ""}`);
  if (otras.length) partes.push(`Otras piezas cerca (no repetir):\n${otras.join("\n")}`);
  if (novedades.length) partes.push(`Novedades de Facundo:\n${novedades.map((n) => `- ${recortar(n.texto, 200)}`).join("\n")}`);
  const mensajes = (Array.isArray(chat) ? chat : []).slice(-8).map((m) => `${m.rol === "usuario" ? "Facundo" : "Bot"}: ${recortar(m.texto, 250)}`);
  if (mensajes.length) partes.push(`Últimos mensajes con el bot:\n${mensajes.join("\n")}`);
  try {
    const r = rendimiento ? await rendimiento.obtener() : null;
    if (r?.publicaciones?.length) partes.push(`Rendimiento de las últimas publicaciones:\n${r.publicaciones.map((p) => `- ${p.fecha} ${p.gancho}: alcance ${p.alcance ?? "?"}, me gusta ${p.me_gusta ?? "?"}, guardados ${p.guardados ?? "?"}`).join("\n")}`);
  } catch {
    // sin rendimiento igual se puede sugerir
  }
  return partes.join("\n\n");
}

export async function aplicarAccion({ repo, servicio, rendimiento = null }, accion, ahora = Date.now()) {
  const en = new Date(ahora).toISOString();
  const tipo = accion?.accion;

  if (tipo === "aprobar_pieza") {
    if (!Number.isInteger(accion.id)) throw new ErrorAccion("Falta el id de la pieza.");
    const resultado = await servicio.aprobarDesdeJuego(accion.id);
    if (!resultado.ok) throw new ErrorAccion(resultado.motivo, 409);
    return { ok: true, estado: resultado.estado };
  }

  if (tipo === "confirmar_pieza") {
    if (!Number.isInteger(accion.id)) throw new ErrorAccion("Falta el id de la pieza.");
    const resultado = await servicio.confirmarDesdeJuego(accion.id);
    if (!resultado.ok) throw new ErrorAccion(resultado.motivo, 409);
    return { ok: true, estado: resultado.estado, detalle: resultado.detalle };
  }

  if (tipo === "cambiar_pieza" && !Number.isInteger(accion.id) && typeof accion.fecha === "string") {
    // La pieza solo está en los documentos: la IA arma la nueva en el momento y queda propuesta para aprobar
    const resultado = await servicio.cambiarSinFila({ fecha: accion.fecha, formato: accion.formato, indicacion: recortar(accion.indicacion, 300), base: recortar(accion.base, 1500) });
    if (!resultado.ok) throw new ErrorAccion(resultado.motivo, 409);
    return { ok: true, estado: resultado.estado, id: resultado.id };
  }

  if (tipo === "cambiar_pieza") {
    if (!Number.isInteger(accion.id)) throw new ErrorAccion("Falta el id de la pieza.");
    const resultado = await servicio.sugerirCambio(accion.id, { indicacion: recortar(accion.indicacion, 300), contexto: await armarContexto({ repo, rendimiento }, accion.id) });
    if (!resultado.ok) throw new ErrorAccion(resultado.motivo, 409);
    return { ok: true, estado: resultado.estado };
  }

  // "Editar": cambia la publicación existente a mano (tipo, epígrafe con párrafos, gancho, hora), sin IA
  if (tipo === "editar_pieza") {
    const cambios = accion.cambios && typeof accion.cambios === "object" ? accion.cambios : {};
    const resultado = await servicio.editarDesdeJuego({
      id: Number.isInteger(accion.id) ? accion.id : null,
      fecha: typeof accion.fecha === "string" ? accion.fecha : null,
      formato: typeof accion.formato === "string" ? accion.formato : null,
      base: recortar(accion.base, 1500),
      cambios,
    });
    if (!resultado.ok) throw new ErrorAccion(resultado.motivo, 409);
    return { ok: true, id: resultado.id, estado: resultado.estado };
  }

  if (tipo === "quitar_archivos") {
    const resultado = await servicio.quitarArchivosDesdeJuego(accion.id);
    if (!resultado.ok) throw new ErrorAccion(resultado.motivo, 409);
    return { ok: true };
  }

  // El chat del juego es el mismo bot y la misma memoria que Telegram
  if (tipo === "chat") {
    const texto = typeof accion.texto === "string" ? accion.texto.trim() : "";
    if (!texto) throw new ErrorAccion("Escribí un mensaje.");
    const resultado = await servicio.conversarDesdeJuego(texto);
    if (resultado.limite) return { ok: true, respuesta: resultado.respuesta, limite: true };
    if (!resultado.ok) throw new ErrorAccion(resultado.error, 502);
    return { ok: true, respuesta: resultado.respuesta };
  }

  // Datos de depósito, recepción, estrategia y agenda: el juego los edita y el bot los ve (y los puede editar él también)
  if (tipo === "operacion") {
    try {
      const { operacion, resumen } = await aplicarOperacion(repo, accion.cambio, { origen: "juego", ahora });
      return { ok: true, operacion, resumen };
    } catch (error) {
      if (error instanceof ErrorOperacion) throw new ErrorAccion(error.message, 400);
      throw error;
    }
  }

  if (tipo === "cumplir" || tipo === "deshacer" || tipo === "nota" || tipo === "quitar_nota") {
    if (!claveValida(accion.clave) && tipo !== "nota") throw new ErrorAccion("Falta la clave.");
    const juego = await leerJuego(repo);

    if (tipo === "deshacer") delete juego.hechos[accion.clave];
    else if (tipo === "quitar_nota") delete juego.notas[accion.clave];
    else {
      const texto = recortar(accion.texto);
      if (!texto) throw new ErrorAccion("Falta el texto.");
      const sala = recortar(accion.sala, 30);
      if (tipo === "cumplir") {
        juego.hechos[accion.clave] = { en, texto, sala, ...(accion.tipo === "pieza" ? { tipo: "pieza" } : {}) };
        await repo.agregarNovedad(`Cumplido desde la oficina: ${texto}`);
      } else {
        const clase = TIPOS_NOTA.has(accion.tipo) ? accion.tipo : "anotacion";
        const clave = claveValida(accion.clave) ? accion.clave : `n${ahora.toString(36)}`;
        juego.notas[clave] = { en, texto, sala, tipo: clase };
        await repo.agregarNovedad(clase === "confirmado" ? `Confirmado desde la oficina: ${texto}` : `Nota desde la oficina: ${texto}`);
      }
    }
    await guardarJuego(repo, juego);
    return { ok: true, juego: await leerJuego(repo) };
  }
  throw new ErrorAccion("Acción desconocida.");
}
