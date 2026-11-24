// Los datos de la operación que se editan desde los dos lados: el juego (VOW HQ) y el bot (el chat de Telegram y del juego).
// Los documentos del repo son el punto de partida; lo que se cambia acá se guarda en la base ("operacion") y manda sobre ellos.
// Todo cambio deja una novedad para el Estratega y una línea en el historial, para saber quién cambió qué y cuándo.
import { ahoraArgentina, esFechaISO, esHoraValida, lunesDe } from "./fechas.js";
import { estrategiaVacia } from "./estrategia-semana.js";

export const CAMPOS = {
  "estrategia.foco": { nombre: "Foco de la semana", largo: 600 },
  "estrategia.notas": { nombre: "Notas de estrategia", largo: 1200 },
};
export const SALAS = ["estrategia", "bot", "diseno", "deposito", "recepcion", "caja"];
const MAX_PROPIAS = 60;
const MAX_OCULTAS = 120;
const MAX_HISTORIAL = 20;

export const operacionVacia = () => ({ campos: {}, agenda: { propias: {}, ocultas: [] }, estrategia: estrategiaVacia(), historial: [] });

export async function leerOperacion(repo) {
  const guardada = await repo.leerEstado("operacion");
  const base = operacionVacia();
  if (!guardada || typeof guardada !== "object") return base;
  return {
    campos: guardada.campos && typeof guardada.campos === "object" ? guardada.campos : base.campos,
    agenda: { propias: guardada.agenda?.propias ?? {}, ocultas: Array.isArray(guardada.agenda?.ocultas) ? guardada.agenda.ocultas : [] },
    estrategia: { ...estrategiaVacia(), ...(guardada.estrategia && typeof guardada.estrategia === "object" ? guardada.estrategia : {}) },
    historial: Array.isArray(guardada.historial) ? guardada.historial : [],
  };
}

const limpiar = (valor, largo) => String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, largo);

export class ErrorOperacion extends Error {}

// Aplica un cambio y devuelve { operacion, resumen }. origen: "juego" o "bot". Tira ErrorOperacion si el pedido no sirve.
export async function aplicarOperacion(repo, cambio, { origen = "juego", ahora = Date.now(), base = [] } = {}) {
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
  } else if (typeof cambio?.tipo === "string" && cambio.tipo.startsWith("estrategia_")) {
    // La estrategia vale por semana: si cambió la semana, arranca de nuevo desde la investigación
    const lunes = lunesDe(ahoraArgentina(new Date(ahora)).fecha);
    if (op.estrategia.semana !== lunes) op.estrategia = { ...estrategiaVacia(), semana: lunes };
    const e = op.estrategia;
    const esBase = (k) => base.some((l) => l.k === k);
    const clave = String(cambio.clave ?? "").slice(0, 60);
    if (cambio.tipo === "estrategia_agregar") {
      const texto = limpiar(cambio.texto, 600);
      if (!texto) throw new ErrorOperacion("Falta el texto de la línea.");
      if (Object.keys(e.propias).length >= 12) throw new ErrorOperacion("Ya hay 12 líneas propias esta semana: quitá alguna antes de agregar otra.");
      e.propias[`p${ahora.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`] = { t: texto, en };
      resumen = `Estrategia de la semana: agregó «${texto}»`;
    } else if (cambio.tipo === "estrategia_editar") {
      const texto = limpiar(cambio.texto, 600);
      if (!texto) throw new ErrorOperacion("Falta el texto nuevo.");
      if (e.propias[clave]) e.propias[clave].t = texto;
      else if (esBase(clave)) e.editadas[clave] = texto;
      else throw new ErrorOperacion("No encuentro esa línea de la estrategia.");
      resumen = `Estrategia de la semana: cambió una línea a «${texto}»`;
    } else if (cambio.tipo === "estrategia_quitar") {
      if (e.propias[clave]) {
        resumen = `Estrategia de la semana: quitó «${e.propias[clave].t}»`;
        delete e.propias[clave];
      } else if (esBase(clave)) {
        if (!e.quitadas.includes(clave)) e.quitadas.push(clave);
        delete e.editadas[clave];
        resumen = `Estrategia de la semana: quitó «${base.find((l) => l.k === clave).t.slice(0, 120)}»`;
      } else throw new ErrorOperacion("No encuentro esa línea de la estrategia.");
    } else if (cambio.tipo === "estrategia_restaurar") {
      op.estrategia = { ...estrategiaVacia(), semana: lunes };
      resumen = "Estrategia de la semana: vuelve a lo que dice la investigación";
    } else {
      throw new ErrorOperacion("Acción de estrategia desconocida.");
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
export function resumenParaChat(op, estrategia = null) {
  return {
    ...(estrategia ? { estrategia_de_la_semana: { semana: estrategia.semana, sale_del_informe: estrategia.fuente, lineas: estrategia.lineas.map((l) => ({ id: l.k, texto: l.t, origen: l.origen, editada: l.editada })) } } : {}),
    campos: Object.fromEntries(Object.entries(op.campos).map(([k, v]) => [k, v])),
    agenda_propia: Object.entries(op.agenda.propias).map(([id, e]) => ({ id, fecha: e.f, hora: e.h, sala: e.sala, texto: e.t })).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)),
    ultimos_cambios: op.historial.slice(-5),
    editables: Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.nombre])),
    nota: "Lo que no aparece en 'campos' es lo que dicen los documentos del repo (punto de partida).",
  };
}

// Copia legible de lo que se cambió desde el juego y el bot, para que el repo también lo muestre.
// Solo depende del estado (sin hora de generación), así que si nada cambió el archivo queda idéntico y no hay commit.
export function markdownDeOperacion(op) {
  const filas = Object.entries(CAMPOS).map(([clave, def]) => `| ${def.nombre} | ${op.campos[clave] ? op.campos[clave].replace(/\|/g, "/") : "_igual que los documentos_"} |`);
  const propias = Object.values(op.agenda.propias).sort((a, b) => (a.f + a.h).localeCompare(b.f + b.h));
  const agenda = propias.length ? propias.map((e) => `- ${e.f}${e.h ? ` ${e.h}` : ""} · ${e.sala} · ${e.t}`) : ["_Nada agregado._"];
  const ocultas = op.agenda.ocultas.length ? op.agenda.ocultas.map((c) => `- ${c.replace("|", " · ")}`) : ["_Ninguno._"];
  const historial = op.historial.length ? [...op.historial].reverse().map((h) => `- ${h.en.slice(0, 16).replace("T", " ")} UTC · ${h.origen === "juego" ? "juego" : "bot"} · ${h.texto}`) : ["_Sin cambios._"];
  return [
    "# Operación: datos editados desde el juego y el bot",
    "",
    "Copia automática de lo que se cambió en VOW HQ y en el chat del bot. La fuente de verdad es la base de datos del servicio: no se edita a mano acá (el próximo sincronizado lo pisa).",
    "",
    "## Datos",
    "",
    "| Dato | Valor |",
    "| --- | --- |",
    ...filas,
    "",
    "## Estrategia de la semana (cambios sobre la investigación)",
    "",
    ...(op.estrategia?.semana ? [`Semana del ${op.estrategia.semana}.`, ...Object.values(op.estrategia.editadas).map((t) => `- Editada: ${t}`), ...op.estrategia.quitadas.map((k) => `- Quitada: ${k}`), ...Object.values(op.estrategia.propias).map((p) => `- Agregada: ${p.t}`)] : ["_Igual que la investigación._"]),
    "",
    "## Agenda agregada",
    "",
    ...agenda,
    "",
    "## Eventos de los documentos que se quitaron de la agenda",
    "",
    ...ocultas,
    "",
    "## Últimos cambios",
    "",
    ...historial,
    "",
  ].join("\n");
}
