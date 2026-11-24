// De punta a punta, por HTTP, como lo vive Facundo: llega el flujo del lunes, el bot lo manda, lo consulta con /flujo
// y la oficina responde. Corre con la base en memoria y, si hay base, con Postgres.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearApp } from "../api/servidor.js";
import { crearPool } from "../db/conexion.js";
import { migrar } from "../db/migrar.js";
import { SIN_BASE } from "../db/requiere-base.js";
import { CHAT, crearDia, crearPlan, crearTelegramFalso } from "./ayuda-pruebas.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearRutasProgramacion } from "./rutas.js";
import { crearServicio } from "./servicio.js";

const CLAVE = "clave-de-integracion-1234";
const SECRETO = "secreto-de-integracion-1234";
const PREFIJO = `integracion-${process.pid}-${Date.now()}:`; // las claves de estado de esta prueba no se mezclan con las reales
const SEMANA = "2098-01-06"; // lunes
const levantar = (app) => new Promise((resolver) => { const i = app.listen(0, "127.0.0.1", () => resolver(i)); });
const cerrar = (i) => new Promise((resolver) => { i.closeAllConnections(); i.close(resolver); });

function correr(nombre, crearRepo, { saltear = false, alTerminar = async () => {} } = {}) {
  describe(`de punta a punta (${nombre})`, { skip: saltear }, () => {
    let servidor, base, router, repo, telegram;
    let numeroDeActualizacion = 100;

    before(async () => {
      repo = await crearRepo();
      telegram = crearTelegramFalso();
      const servicio = crearServicio({ repo, telegram, ahora: () => ({ fecha: SEMANA, hora: "08:00" }) });
      router = crearRutasProgramacion({ servicio, repo, secretoApi: CLAVE, secretoWebhook: SECRETO });
      servidor = await levantar(crearApp({ pool: null, origenesPermitidos: [], programacion: router }));
      base = `http://127.0.0.1:${servidor.address().port}/api/programacion`;
    });
    after(async () => {
      await cerrar(servidor);
      await alTerminar();
    });

    const api = (ruta, cuerpo) => fetch(`${base}${ruta}`, { method: cuerpo ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLAVE}` }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const escribir = async (texto) => {
      const antes = telegram.enviados.length;
      const r = await fetch(`${base}/telegram`, { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRETO }, body: JSON.stringify({ update_id: numeroDeActualizacion++, message: { message_id: numeroDeActualizacion, chat: { id: CHAT }, text: texto } }) });
      assert.equal(r.status, 200);
      for (let i = 0; i < 100 && telegram.enviados.length === antes; i++) await new Promise((r2) => setTimeout(r2, 20));
    };

    test("llega el flujo del lunes, se avisa por Telegram y la oficina responde", async () => {
      assert.deepEqual(await (await api(`/plan/${SEMANA}`)).json(), { existe: false, publicaciones: 0 });
      const dias = [crearDia({ fecha: "2098-01-08" }), crearDia({ fecha: "2098-01-10", formato: "story", contenido: "Detrás de escena del taller, con las manos y sin cara." })];
      const r = await api("/plan", { semana: SEMANA, plan: crearPlan(dias) });
      assert.equal(r.status, 201);
      assert.deepEqual(await r.json(), { publicaciones: 2 });
      assert.match(telegram.textos().at(-1), /Flujo de la semana/);
      assert.deepEqual(await (await api(`/plan/${SEMANA}`)).json(), { existe: true, publicaciones: 2 });
      const oficina = await (await api("/oficina")).json();
      assert.ok(Array.isArray(oficina.flujo)); // la oficina usa la fecha real: acá solo se comprueba que responde con el flujo
    });

    test("un mensaje de Facundo queda como novedad y /flujo devuelve el flujo", async () => {
      await escribir("Llegaron las gorras beige");
      assert.ok((await (await api("/novedades")).json()).novedades.some((n) => n.texto === "Llegaron las gorras beige"));
      await escribir("/flujo");
      assert.match(telegram.textos().at(-1), /Flujo de la semana/);
    });
  });
}

correr("en memoria", async () => crearRepositorioMemoria());

let pool = null;
correr(
  "en Postgres",
  async () => {
    pool = crearPool();
    await migrar(pool);
    return crearRepositorio(pool, { prefijoEstado: PREFIJO });
  },
  {
    saltear: SIN_BASE,
    alTerminar: async () => {
      if (!pool) return;
      await pool.query("DELETE FROM bot_estado WHERE clave LIKE $1", [`${PREFIJO}%`]);
      await pool.query("DELETE FROM novedades WHERE texto = 'Llegaron las gorras beige'");
      await pool.end();
    },
  },
);
