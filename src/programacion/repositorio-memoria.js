// Misma interfaz que repositorio.js, pero en memoria: para probar toda la lógica sin base de datos.
import { randomBytes } from "node:crypto";

const EDITABLES = ["fecha", "hora", "pieza", "estado", "confirmada_el", "contenedor", "permalink", "error", "intentos"];
const copiar = (valor) => (valor === null || valor === undefined ? valor : structuredClone(valor));

export function crearRepositorioMemoria() {
  let piezas = [];
  let medios = [];
  let recordatorios = [];
  const estado = new Map();
  let novedades = [];
  const ids = { pieza: 1, medio: 1, recordatorio: 1, novedad: 1 };

  const buscar = (id) => piezas.find((p) => p.id === Number(id)) ?? null;

  return {
    async crearPiezas(semana, nuevas) {
      for (const p of piezas) if (p.semana === semana && ["propuesta", "aprobada"].includes(p.estado)) p.estado = "cancelada";
      return nuevas.map(({ fecha, hora, pieza }) => {
        const fila = {
          id: ids.pieza++, semana, fecha, hora, pieza: copiar(pieza), estado: "propuesta", confirmada_el: null,
          contenedor: null, permalink: null, mensajes: [], error: null, intentos: 0,
        };
        piezas.push(fila);
        return copiar(fila);
      });
    },
    async crearPiezaSuelta({ semana, fecha, hora, pieza }) {
      const fila = {
        id: ids.pieza++, semana, fecha, hora, pieza: copiar(pieza), estado: "propuesta", confirmada_el: null,
        contenedor: null, permalink: null, mensajes: [], error: null, intentos: 0,
      };
      piezas.push(fila);
      return copiar(fila);
    },
    async obtenerPieza(id) { return copiar(buscar(id)); },
    async piezasDelDia(fecha) {
      return copiar(piezas.filter((p) => p.fecha === fecha && p.estado !== "cancelada").sort((a, b) => a.hora.localeCompare(b.hora) || a.id - b.id));
    },
    async piezasEntre(desde, hasta) {
      return copiar(piezas.filter((p) => p.fecha >= desde && p.fecha <= hasta && p.estado !== "cancelada").sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.id - b.id));
    },
    async piezasDeSemana(semana) { return copiar(piezas.filter((p) => p.semana === semana)); },
    async actualizarPieza(id, cambios) {
      const fila = buscar(id);
      if (!fila) return null;
      for (const clave of Object.keys(cambios)) if (EDITABLES.includes(clave)) fila[clave] = copiar(cambios[clave]);
      return copiar(fila);
    },
    async reclamar(id, desde, hacia) {
      const fila = buscar(id);
      if (!fila || !desde.includes(fila.estado)) return false;
      fila.estado = hacia;
      return true;
    },
    async agregarMensaje(id, mensajeId) { buscar(id)?.mensajes.push(Number(mensajeId)); },
    async piezaPorMensaje(mensajeId) { return copiar(piezas.find((p) => p.mensajes.includes(Number(mensajeId))) ?? null); },
    async agregarMedio({ piezaId, tipo, mime, datos }) {
      const orden = Math.max(0, ...medios.filter((m) => m.pieza_id === piezaId).map((m) => m.orden)) + 1;
      const fila = { id: ids.medio++, pieza_id: piezaId, orden, tipo, mime, datos: Buffer.from(datos), token: randomBytes(24).toString("hex") };
      medios.push(fila);
      return { id: fila.id, orden, tipo, mime, token: fila.token };
    },
    async mediosDePieza(piezaId) {
      return medios.filter((m) => m.pieza_id === piezaId).sort((a, b) => a.orden - b.orden).map((m) => ({ id: m.id, orden: m.orden, tipo: m.tipo, mime: m.mime, token: m.token, bytes: m.datos.length }));
    },
    async medioPorToken(token) {
      const m = medios.find((x) => x.token === token);
      return m ? { tipo: m.tipo, mime: m.mime, datos: m.datos } : null;
    },
    async borrarMedios(piezaId) { medios = medios.filter((m) => m.pieza_id !== piezaId); },
    async crearRecordatorio({ piezaId, fecha, enviado = false }) {
      recordatorios.push({ id: ids.recordatorio++, pieza_id: piezaId, fecha, enviado });
    },
    async recordatoriosPendientes(hasta) {
      return recordatorios
        .filter((r) => !r.enviado && r.fecha <= hasta && !["publicada", "cancelada", "manual", "fallida"].includes(buscar(r.pieza_id)?.estado))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
        .map(({ id, pieza_id, fecha }) => ({ id, pieza_id, fecha }));
    },
    async marcarRecordatorioEnviado(id) { const r = recordatorios.find((x) => x.id === id); if (r) r.enviado = true; },
    async borrarRecordatoriosPendientes(piezaId) { recordatorios = recordatorios.filter((r) => r.pieza_id !== piezaId || r.enviado); },
    async leerEstado(clave) { return estado.has(clave) ? copiar(estado.get(clave)) : null; },
    async guardarEstado(clave, valor) { estado.set(clave, copiar(valor)); },
    async tomarEstado(clave, valor) {
      if (estado.has(clave) && JSON.stringify(estado.get(clave)) === JSON.stringify(valor)) return false;
      estado.set(clave, copiar(valor));
      return true;
    },
    async agregarNovedad(texto) { novedades.push({ id: ids.novedad++, texto, usada: false, fecha: new Date().toISOString().slice(0, 10) }); },
    async novedadesPendientes() { return novedades.filter((n) => !n.usada).map(({ id, texto }) => ({ id, texto })); },
    async novedadesRecientes(limite = 20) { return novedades.slice(-limite).reverse().map(({ id, texto, fecha, usada }) => ({ id, texto, fecha, usada })); },
    async marcarNovedadesUsadas(lista) { for (const n of novedades) if (lista.includes(n.id)) n.usada = true; },
  };
}
