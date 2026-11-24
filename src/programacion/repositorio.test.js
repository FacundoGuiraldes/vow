// El mismo juego de pruebas corre contra el repositorio en memoria (siempre) y contra el de Postgres (cuando hay base).
// Así se sabe que los dos se comportan igual, y por lo tanto que los tests del servicio (que usan el de memoria) valen para producción.
// Con la base real solo se borra lo que estos tests crearon.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearPool } from "../db/conexion.js";
import { migrar } from "../db/migrar.js";
import { SIN_BASE } from "../db/requiere-base.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";

const prefijo = `prueba-${process.pid}-${Date.now()}`;

function contrato(nombre, crear, { saltear = false, alTerminar = async () => {} } = {}) {
  describe(`repositorio ${nombre}`, { skip: saltear }, () => {
    let repo;
    before(async () => {
      repo = await crear();
    });
    after(alTerminar);

    test("la bandeja de Telegram guarda cada actualización una vez y permite recuperar las que no se terminaron", async () => {
      const id = 900_000_000 + (process.pid % 1000);
      assert.equal(await repo.registrarActualizacion(id, { update_id: id, message: { text: "a" } }), true);
      assert.equal(await repo.registrarActualizacion(id, { update_id: id }), false);
      const futuro = new Date(Date.now() + 3_600_000);
      // recién registrada: todavía no toca reintentarla
      assert.equal((await repo.reclamarActualizacionesPendientes({ antesDe: new Date(Date.now() - 3_600_000) })).filter((x) => x.id === id).length, 0);
      const primera = await repo.reclamarActualizacionesPendientes({ antesDe: futuro });
      assert.deepEqual(primera.filter((x) => x.id === id).map((x) => x.cuerpo.message.text), ["a"]);
      // reclamarla la marca como "en intento": otro reclamo inmediato no la devuelve de nuevo
      assert.equal((await repo.reclamarActualizacionesPendientes({ antesDe: new Date(Date.now() - 3_600_000) })).filter((x) => x.id === id).length, 0);
      await repo.marcarActualizacionProcesada(id);
      assert.equal((await repo.reclamarActualizacionesPendientes({ antesDe: new Date(Date.now() + 3_600_000) })).filter((x) => x.id === id).length, 0);
      await repo.borrarActualizacionesViejas(new Date(Date.now() + 3_600_000));
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
    return crearRepositorio(pool);
  },
  {
    saltear: SIN_BASE,
    alTerminar: async () => {
      if (!pool) return;
      await pool.query("DELETE FROM bot_estado WHERE clave LIKE $1", [`${prefijo}%`]);
      await pool.query("DELETE FROM telegram_pendientes WHERE clave LIKE '%tg:9000%'");
      await pool.query("DELETE FROM novedades WHERE texto LIKE $1", [`${prefijo}%`]);
      await pool.end();
    },
  },
);
