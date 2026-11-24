// Lo que muestra y hace "la oficina" (el juego de VOW HQ). Todo pasa por acá y con clave: la charla con el bot es privada.
//   armarEstadoOficina → lo que el juego lee (flujo semanal, novedades, charla, lo que marcaste, estrategia, stock, rendimiento de Instagram)
//   aplicarAccion      → lo que el juego puede hacer: charlar con el bot, editar estrategia, mover stock y ventas, marcar pendientes, anotar
// Lo que se marca en el juego queda también como novedad: el Estratega lo lee en el próximo flujo.
import { ErrorOperacion, aplicarOperacion, leerOperacion } from "./operacion.js";
import { ErrorInventario, aplicarInventario, leerInventario, vistaInventario } from "./inventario.js";
import { lineasDeInvestigacion, vistaEstrategia } from "./estrategia-semana.js";
import { ahoraArgentina, lunesDe } from "./fechas.js";
import { createHash } from "node:crypto";
const LIMITE_ENTRADAS = 200;
const LIMITE_TEXTO = 300;
const TIPOS_NOTA = new Set(["anotacion", "confirmado"]);
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

export async function armarEstadoOficina({ repo, servicio = null, rendimiento = null, ahora = Date.now(), investigacion = lineasDeInvestigacion }) {
  const hoy = ahoraArgentina(new Date(ahora)).fecha;
  const [flujo, novedades, chat, juego, operacion, inventario, lineas] = await Promise.all([
    servicio ? servicio.flujosVigentes(hoy) : [],
    repo.novedadesRecientes(20),
    repo.leerEstado("chat"),
    leerJuego(repo),
    leerOperacion(repo),
    leerInventario(repo),
    investigacion(),
  ]);
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
    flujo,
    novedades: novedades.map((n) => ({ id: n.id, fecha: n.fecha, texto: recortar(n.texto, 240), usada: n.usada === true })),
    chat: (Array.isArray(chat) ? chat : []).slice(-30).map((m) => ({ rol: m.rol, texto: recortar(m.visible ?? m.texto, 1500), canal: m.canal ?? "telegram", en: m.en ?? null })),
    juego,
    operacion,
    estrategia_semana: vistaEstrategia(operacion.estrategia, lineas, lunesDe(hoy)),
    inventario: vistaInventario(inventario, hoy),
    rendimiento: rend,
  };
  // La versión cambia solo cuando cambia algo: el juego pregunta seguido y, si no cambió, el servidor contesta cortito
  const { generado, ...sinHora } = cuerpo;
  void generado;
  return { ...cuerpo, version: createHash("sha1").update(JSON.stringify(sinHora)).digest("hex").slice(0, 16) };
}

export async function aplicarAccion(deps, accion, ahora = Date.now()) {
  const { repo, servicio } = deps;
  const en = new Date(ahora).toISOString();
  const tipo = accion?.accion;

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
      const { lineas } = await (deps.investigacion ?? lineasDeInvestigacion)();
      const { operacion, resumen } = await aplicarOperacion(repo, accion.cambio, { origen: "juego", ahora, base: lineas });
      return { ok: true, operacion, resumen };
    } catch (error) {
      if (error instanceof ErrorOperacion) throw new ErrorAccion(error.message, 400);
      throw error;
    }
  }

  // Almacén y Caja: llegadas, correcciones y ventas. El stock se resta solo al vender; el precio lo define el sistema.
  if (tipo === "inventario") {
    try {
      const { inventario, resumen, id } = await aplicarInventario(repo, accion.cambio, { origen: "juego", ahora });
      return { ok: true, resumen, ...(id ? { id } : {}), inventario: vistaInventario(inventario, ahoraArgentina(new Date(ahora)).fecha) };
    } catch (error) {
      if (error instanceof ErrorInventario) throw new ErrorAccion(error.message, 400);
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
