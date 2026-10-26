// Los datos de la operación que se editan desde los dos lados: el juego (VOW HQ) y el bot (el chat de Telegram y del juego).
// Los documentos del repo son el punto de partida; lo que se cambia acá se guarda en la base ("operacion") y manda sobre ellos.
// Todo cambio deja una novedad para el Estratega y una línea en el historial, para saber quién cambió qué y cuándo.
import { esFechaISO, esHoraValida } from "./fechas.js";

export const CAMPOS = {
  "deposito.gorras": { nombre: "Gorras (entrega y estado)", largo: 300 },
  "deposito.medias": { nombre: "Medias (entrega y estado)", largo: 300 },
  "deposito.shakers": { nombre: "Shakers (entrega y estado)", largo: 300 },
  "deposito.venta": { nombre: "Venta (cuándo y cómo)", largo: 300 },
  "recepcion.productos": { nombre: "Productos del Drop", largo: 300 },
  "estrategia.foco": { nombre: "Foco de la estrategia", largo: 600 },
  "estrategia.notas": { nombre: "Notas de estrategia", largo: 1200 },
};
export const SALAS = ["estrategia", "bot", "diseno", "deposito", "recepcion"];
const MAX_PROPIAS = 60;
const MAX_OCULTAS = 120;
const MAX_HISTORIAL = 20;

export const operacionVacia = () => ({ campos: {}, agenda: { propias: {}, ocultas: [] }, historial: [] });

export async function leerOperacion(repo) {
  const guardada = await repo.leerEstado("operacion");
  const base = operacionVacia();
  if (!guardada || typeof guardada !== "object") return base;
  return {
    campos: guardada.campos && typeof guardada.campos === "object" ? guardada.campos : base.campos,
    agenda: { propias: guardada.agenda?.propias ?? {}, ocultas: Array.isArray(guardada.agenda?.ocultas) ? guardada.agenda.ocultas : [] },
    historial: Array.isArray(guardada.historial) ? guardada.historial : [],
  };
}

const limpiar = (valor, largo) => String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, largo);

export class ErrorOperacion extends Error {}

// Aplica un cambio y devuelve { operacion, resumen }. origen: "juego" o "bot". Tira ErrorOperacion si el pedido no sirve.
export async function aplicarOperacion(repo, cambio, { origen = "juego", ahora = Date.now() } = {}) {
  const op = await leerOperacion(repo);
  const en = new Date(ahora).toISOString();
  let resumen;

  if (cambio?.tipo === "campo") {
    const def = CAMPOS[cambio.campo];
    if (!def) throw new ErrorOperacion(`Ese dato no se puede editar. Los editables son: ${Object.keys(CAMPOS).join(", ")}.`);
    const valor = limpiar(cambio.valor, def.largo);
    if (valor) {
      op.campos[cambio.campo] = valor;
      resumen = `${def.nombre}: ${valor}`;
    } else {
      delete op.campos[cambio.campo];
      resumen = `${def.nombre}: vuelve a lo que dicen los documentos`;
    }
  } else if (cambio?.tipo === "agenda_agregar") {
    const texto = limpiar(cambio.texto, 140);
    if (!esFechaISO(cambio.fecha)) throw new ErrorOperacion("La fecha tiene que ser AAAA-MM-DD.");
    if (!texto) throw new ErrorOperacion("Falta qué pasa ese día.");
    const hora = cambio.hora && esHoraValida(cambio.hora) ? cambio.hora : "";
    const sala = SALAS.includes(cambio.sala) ? cambio.sala : "bot";
    if (Object.keys(op.agenda.propias).length >= MAX_PROPIAS) throw new ErrorOperacion(`Ya hay ${MAX_PROPIAS} eventos propios: quitá alguno antes de agregar otro.`);
    const id = `a${ahora.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    op.agenda.propias[id] = { f: cambio.fecha, h: hora, sala, t: texto, en };
    resumen = `Agenda: ${cambio.fecha}${hora ? ` ${hora}` : ""} · ${texto}`;
  } else if (cambio?.tipo === "agenda_quitar") {
    const clave = String(cambio.clave ?? "").slice(0, 200);
    if (!clave) throw new ErrorOperacion("Falta qué evento quitar.");
    if (op.agenda.propias[clave]) {
      resumen = `Agenda: quitó «${op.agenda.propias[clave].t}»`;
      delete op.agenda.propias[clave];
    } else {
      if (!op.agenda.ocultas.includes(clave)) op.agenda.ocultas.push(clave);
      if (op.agenda.ocultas.length > MAX_OCULTAS) op.agenda.ocultas = op.agenda.ocultas.slice(-MAX_OCULTAS);
      resumen = `Agenda: quitó el evento ${clave.split("|").pop()}`;
    }
  } else {
    throw new ErrorOperacion("Acción desconocida.");
  }

  op.historial = [...op.historial, { en, origen, texto: resumen.slice(0, 200) }].slice(-MAX_HISTORIAL);
  await repo.guardarEstado("operacion", op);
  await repo.agregarNovedad(`Dato actualizado desde ${origen === "juego" ? "la oficina" : "el chat"}: ${resumen}`.slice(0, 1000));
  return { operacion: op, resumen };
}

// Lo que ve la IA: lo que se cambió sobre los documentos, en texto corto
export function resumenParaChat(op) {
  return {
    campos: Object.fromEntries(Object.entries(op.campos).map(([k, v]) => [k, v])),
    agenda_propia: Object.entries(op.agenda.propias).map(([id, e]) => ({ id, fecha: e.f, hora: e.h, sala: e.sala, texto: e.t })).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)),
    ultimos_cambios: op.historial.slice(-5),
    editables: Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.nombre])),
    nota: "Lo que no aparece en 'campos' es lo que dicen los documentos del repo (punto de partida).",
  };
}
