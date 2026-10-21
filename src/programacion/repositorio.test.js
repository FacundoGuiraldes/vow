// El mismo juego de pruebas corre contra el repositorio en memoria (siempre) y contra el de Postgres (cuando hay base).
// Así se sabe que los dos se comportan igual, y por lo tanto que los tests del servicio (que usan el de memoria) valen para producción.
// Con la base real: la semana de prueba es de 2099 y solo se borra lo que estos tests crearon.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearPool } from "../db/conexion.js";
import { migrar } from "../db/migrar.js";
import { SIN_BASE } from "../db/requiere-base.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearPieza } from "./ayuda-pruebas.js";

const SEMANA = "2099-01-05";
const DIA = "2099-01-09";
const prefijo = `prueba-${process.pid}-${Date.now()}`;

function contrato(nombre, crear, { saltear = false, alTerminar = async () => {} } = {}) {
  describe(`repositorio ${nombre}`, { skip: saltear }, () => {
    let repo;
    before(async () => {
      repo = await crear();
    });
    after(alTerminar);

    const pieza = (extra = {}) => ({ fecha: DIA, hora: "19:00", pieza: crearPieza({ fecha: DIA, ...extra }) });

    test("crea piezas con sus datos y las encuentra por día, rango y semana", async () => {
      const [a, b] = await repo.crearPiezas(SEMANA, [pieza({ gancho: "Primera." }), { ...pieza({ gancho: "Segunda." }), fecha: "2099-01-10", hora: "09:30" }]);
      assert.equal(a.estado, "propuesta");
      assert.equal(a.semana, SEMANA);
      assert.equal(a.fecha, DIA);
      assert.equal(a.hora, "19:00");
      assert.equal(a.pieza.gancho, "Primera.");
      assert.deepEqual(a.mensajes, []);
      assert.equal(a.intentos, 0);
      assert.deepEqual((await repo.piezasDelDia(DIA)).map((f) => f.id), [a.id]);
      assert.deepEqual((await repo.piezasEntre(DIA, "2099-01-10")).map((f) => f.id), [a.id, b.id]);
      assert.deepEqual((await repo.piezasDeSemana(SEMANA)).map((f) => f.id), [a.id, b.id]);
      assert.equal((await repo.obtenerPieza(a.id)).pieza.gancho, "Primera.");
      assert.equal(await repo.obtenerPieza(999_999_999), null);
    });

    test("un plan nuevo de la misma semana cancela lo que estaba sin aprobar, y las canceladas no aparecen por día", async () => {
      const [vieja] = await repo.crearPiezas("2099-02-02", [{ ...pieza(), fecha: "2099-02-04" }]);
      const [nueva] = await repo.crearPiezas("2099-02-02", [{ ...pieza(), fecha: "2099-02-04" }]);
      assert.equal((await repo.obtenerPieza(vieja.id)).estado, "cancelada");
      assert.equal(nueva.estado, "propuesta");
      assert.deepEqual((await repo.piezasDelDia("2099-02-04")).map((f) => f.id), [nueva.id]);
    });

    test("actualizarPieza cambia solo columnas permitidas y guarda el JSON completo", async () => {
      const [fila] = await repo.crearPiezas("2099-03-02", [{ ...pieza(), fecha: "2099-03-05" }]);
      const nueva = { ...fila.pieza, gancho: "Cambiado.", material_a_producir: ["a", "b"] };
      const r = await repo.actualizarPieza(fila.id, { estado: "confirmada", confirmada_el: "2099-03-05", hora: "20:15", pieza: nueva, contenedor: "c1", intentos: 2, creado_en: "2000-01-01", id: 1 });
      assert.equal(r.id, fila.id, "no se puede cambiar el id");
      assert.equal(r.estado, "confirmada");
      assert.equal(r.confirmada_el, "2099-03-05");
      assert.equal(r.hora, "20:15");
      assert.deepEqual(r.pieza.material_a_producir, ["a", "b"]);
      assert.equal(r.contenedor, "c1");
      assert.equal(r.intentos, 2);
      const sinConfirmar = await repo.actualizarPieza(fila.id, { confirmada_el: null });
      assert.equal(sinConfirmar.confirmada_el, null);
    });

    test("reclamar pasa de un estado a otro una sola vez, aunque lo pidan dos a la vez", async () => {
      const [fila] = await repo.crearPiezas("2099-04-06", [{ ...pieza(), fecha: "2099-04-09" }]);
      await repo.actualizarPieza(fila.id, { estado: "preparada" });
      const resultados = await Promise.all([repo.reclamar(fila.id, ["preparada"], "publicando"), repo.reclamar(fila.id, ["preparada"], "publicando"), repo.reclamar(fila.id, ["preparada"], "publicando")]);
      assert.equal(resultados.filter(Boolean).length, 1);
      assert.equal((await repo.obtenerPieza(fila.id)).estado, "publicando");
      assert.equal(await repo.reclamar(fila.id, ["preparada", "aprobada"], "publicando"), false);
    });

    test("los mensajes de Telegram se mapean a su pieza", async () => {
      const [fila, otra] = await repo.crearPiezas("2099-05-04", [{ ...pieza(), fecha: "2099-05-07" }, { ...pieza(), fecha: "2099-05-08" }]);
      const id = 900_000_000 + (process.pid % 1000);
      await repo.agregarMensaje(fila.id, id);
      await repo.agregarMensaje(otra.id, id + 1);
      assert.equal((await repo.piezaPorMensaje(id)).id, fila.id);
      assert.equal((await repo.piezaPorMensaje(id + 1)).id, otra.id);
      assert.equal(await repo.piezaPorMensaje(id + 2), null);
      assert.deepEqual((await repo.obtenerPieza(fila.id)).mensajes, [id]);
    });

    test("guarda archivos con un token, los sirve por token y los borra", async () => {
      const [fila] = await repo.crearPiezas("2099-06-01", [{ ...pieza(), fecha: "2099-06-04" }]);
      const uno = await repo.agregarMedio({ piezaId: fila.id, tipo: "imagen", mime: "image/jpeg", datos: Buffer.from([1, 2, 3]) });
      const dos = await repo.agregarMedio({ piezaId: fila.id, tipo: "imagen", mime: "image/jpeg", datos: Buffer.from([4, 5, 6, 7]) });
      assert.match(uno.token, /^[a-f0-9]{48}$/);
      assert.notEqual(uno.token, dos.token);
      assert.deepEqual([uno.orden, dos.orden], [1, 2]);
      const medios = await repo.mediosDePieza(fila.id);
      assert.deepEqual(medios.map((m) => Number(m.bytes)), [3, 4]);
      assert.ok(medios.every((m) => m.tipo === "imagen" && m.mime === "image/jpeg"));
      const bajado = await repo.medioPorToken(dos.token);
      assert.deepEqual([...bajado.datos], [4, 5, 6, 7]);
      assert.equal(bajado.mime, "image/jpeg");
      assert.equal(await repo.medioPorToken("0".repeat(48)), null);
      await repo.borrarMedios(fila.id);
      assert.deepEqual(await repo.mediosDePieza(fila.id), []);
      assert.equal(await repo.medioPorToken(uno.token), null);
    });

    test("recordatorios: pendientes por fecha, no repiten, y no aparecen de piezas canceladas o publicadas", async () => {
      const [viva, cancelada, publicada] = await repo.crearPiezas("2099-07-06", [
        { ...pieza(), fecha: "2099-07-09" },
        { ...pieza(), fecha: "2099-07-09" },
        { ...pieza(), fecha: "2099-07-09" },
      ]);
      await repo.crearRecordatorio({ piezaId: viva.id, fecha: "2099-07-06" });
      await repo.crearRecordatorio({ piezaId: cancelada.id, fecha: "2099-07-06" });
      await repo.crearRecordatorio({ piezaId: publicada.id, fecha: "2099-07-06" });
      await repo.crearRecordatorio({ piezaId: viva.id, fecha: "2099-07-08" });
      await repo.crearRecordatorio({ piezaId: viva.id, fecha: "2099-07-06", enviado: true });
      await repo.actualizarPieza(cancelada.id, { estado: "cancelada" });
      await repo.actualizarPieza(publicada.id, { estado: "publicada" });

      const suyos = async (hasta) => (await repo.recordatoriosPendientes(hasta)).filter((r) => [viva.id, cancelada.id, publicada.id].includes(r.pieza_id));
      assert.deepEqual((await suyos("2099-07-05")).length, 0);
      const hoy = await suyos("2099-07-06");
      assert.deepEqual(hoy.map((r) => r.pieza_id), [viva.id]);
      assert.equal(hoy[0].fecha, "2099-07-06");
      assert.equal((await suyos("2099-07-08")).length, 2);
      await repo.marcarRecordatorioEnviado(hoy[0].id);
      assert.equal((await suyos("2099-07-06")).length, 0);
      await repo.borrarRecordatoriosPendientes(viva.id);
      assert.equal((await suyos("2099-12-31")).length, 0);
    });

    test("estado del bot: leer, guardar y tomar una sola vez", async () => {
      const clave = `${prefijo}-clave`;
      assert.equal(await repo.leerEstado(clave), null);
      await repo.guardarEstado(clave, true);
      assert.equal(await repo.leerEstado(clave), true);
      await repo.guardarEstado(clave, { a: 1 });
      assert.deepEqual(await repo.leerEstado(clave), { a: 1 });

      const tarea = `${prefijo}-tarea`;
      assert.equal(await repo.tomarEstado(tarea, "2099-01-01"), true);
      assert.equal(await repo.tomarEstado(tarea, "2099-01-01"), false, "la segunda vez ya está tomada");
      assert.equal(await repo.tomarEstado(tarea, "2099-01-02"), true, "al día siguiente se vuelve a poder");
      const resultados = await Promise.all([1, 2, 3, 4].map(() => repo.tomarEstado(`${prefijo}-carrera`, "x")));
      assert.equal(resultados.filter(Boolean).length, 1, "de varias llamadas simultáneas, una sola la toma");
    });

    test("novedades: pendientes hasta que se marcan como usadas", async () => {
      await repo.agregarNovedad(`${prefijo} uno`);
      await repo.agregarNovedad(`${prefijo} dos`);
      const mias = async () => (await repo.novedadesPendientes()).filter((n) => n.texto.startsWith(prefijo));
      const pendientes = await mias();
      assert.deepEqual(pendientes.map((n) => n.texto), [`${prefijo} uno`, `${prefijo} dos`]);
      await repo.marcarNovedadesUsadas([pendientes[0].id]);
      assert.deepEqual((await mias()).map((n) => n.texto), [`${prefijo} dos`]);
      await repo.marcarNovedadesUsadas([]);
      await repo.marcarNovedadesUsadas(pendientes.map((n) => n.id));
      assert.deepEqual(await mias(), []);
    });
  });
}

contrato("en memoria", async () => crearRepositorioMemoria());

let pool = null;
contrato(
  "en Postgres",
  async () => {
    pool = crearPool();
    await migrar(pool);
    // por si una corrida anterior quedó a medias
    await pool.query("DELETE FROM piezas_programadas WHERE semana >= '2099-01-01'");
    return crearRepositorio(pool);
  },
  {
    saltear: SIN_BASE,
    alTerminar: async () => {
      if (!pool) return;
      await pool.query("DELETE FROM piezas_programadas WHERE semana >= '2099-01-01'");
      await pool.query("DELETE FROM bot_estado WHERE clave LIKE $1", [`${prefijo}%`]);
      await pool.query("DELETE FROM novedades WHERE texto LIKE $1", [`${prefijo}%`]);
      await pool.end();
    },
  },
);
