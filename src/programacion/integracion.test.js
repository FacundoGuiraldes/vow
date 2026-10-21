// De punta a punta, por HTTP, como lo vive Facundo: llega el plan del lunes, lo aprueba, el viernes confirma y manda el
// video, y a la hora se publica. Meta es falso, pero "descarga" el video desde la dirección pública que recibe, igual que
// el verdadero, para probar que el archivo que se sube es el que Meta vería. Corre con la base en memoria y, si hay base, con Postgres.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearApp } from "../api/servidor.js";
import { crearPool } from "../db/conexion.js";
import { migrar } from "../db/migrar.js";
import { SIN_BASE } from "../db/requiere-base.js";
import { CHAT, URL_PUBLICA, crearMetaFalso, crearPieza, crearPlan, crearTelegramFalso } from "./ayuda-pruebas.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearRutasProgramacion } from "./rutas.js";
import { crearServicio } from "./servicio.js";

const CLAVE = "clave-de-integracion-1234";
const SECRETO = "secreto-de-integracion-1234";
const PREFIJO = `integracion-${process.pid}-${Date.now()}:`; // las claves de estado de esta prueba no se mezclan con las reales
const SEMANA = "2098-01-06"; // lunes (año propio: el test del repositorio usa 2099 y corre en paralelo contra la misma base)
const VIERNES = "2098-01-10";
const levantar = (app) => new Promise((resolver) => { const i = app.listen(0, "127.0.0.1", () => resolver(i)); });
const cerrar = (i) => new Promise((resolver) => { i.closeAllConnections(); i.close(resolver); });

function correr(nombre, crearRepo, { saltear = false, alTerminar = async () => {} } = {}) {
  describe(`de punta a punta (${nombre})`, { skip: saltear }, () => {
    let servidor, base, router, repo, telegram, meta, reloj;
    let numeroDeActualizacion = 100;
    const descargado = [];

    before(async () => {
      repo = await crearRepo();
      reloj = { fecha: SEMANA, hora: "08:00" };
      telegram = crearTelegramFalso();
      meta = crearMetaFalso();
      // El Meta verdadero descarga el archivo de la dirección que se le da: acá se hace lo mismo contra el servidor de prueba
      const crearContenedor = meta.crearContenedor;
      meta.crearContenedor = async (parametros) => {
        const respuesta = await fetch(parametros.video_url.replace(URL_PUBLICA, base));
        assert.equal(respuesta.status, 200, "Meta tiene que poder descargar el archivo");
        descargado.push({ tipo: respuesta.headers.get("content-type"), datos: Buffer.from(await respuesta.arrayBuffer()) });
        return crearContenedor(parametros);
      };
      const servicio = crearServicio({ repo, telegram, meta, ahora: () => ({ ...reloj }), urlPublica: URL_PUBLICA, permitirPublicar: true });
      router = crearRutasProgramacion({ servicio, repo, secretoApi: CLAVE, secretoWebhook: SECRETO });
      servidor = await levantar(crearApp({ pool: null, origenesPermitidos: [], programacion: router }));
      base = `http://127.0.0.1:${servidor.address().port}`;
      await repo.guardarEstado("ultimo_update", 0);
    });
    after(async () => {
      await cerrar(servidor);
      await alTerminar();
    });

    const api = (ruta, cuerpo) =>
      fetch(`${base}/api/programacion/${ruta}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLAVE}` }, body: JSON.stringify(cuerpo ?? {}) });
    const telegramManda = async (actualizacion) => {
      const r = await fetch(`${base}/api/programacion/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRETO },
        body: JSON.stringify({ update_id: ++numeroDeActualizacion, ...actualizacion }),
      });
      assert.equal(r.status, 200);
      await router.esperarPendientes();
    };
    const mover = (hora, fecha) => { reloj.hora = hora; if (fecha) reloj.fecha = fecha; };
    const boton = (dato, mensajeId = 1) => ({ callback_query: { id: "cb", data: dato, message: { message_id: mensajeId, chat: { id: CHAT } } } });

    test("lunes: llega el plan, se aprueba; viernes: aviso de las 8, video, confirmación y publicación a la hora", async () => {
      // Lunes 8:00: el workflow manda el plan
      const respuesta = await api("plan", { semana: SEMANA, plan: crearPlan([crearPieza({ fecha: VIERNES })]) });
      assert.equal(respuesta.status, 201);
      assert.match(telegram.enviados[0].texto, /Tenés que filmar o sacar fotos/);
      const [fila] = await repo.piezasDeSemana(SEMANA);
      assert.equal(fila.estado, "propuesta");
      assert.deepEqual(fila.mensajes.length, 1, "el mensaje de la pieza quedó mapeado a su fila");

      await telegramManda(boton(`aprobar_semana:${SEMANA}`));
      assert.equal((await repo.obtenerPieza(fila.id)).estado, "aprobada");

      // Miércoles 8:00: el recordatorio de filmación (3 días antes del viernes)
      mover("08:00", "2098-01-08");
      await (await api("tick")).json();
      assert.match(telegram.buscar("Recordatorio").texto, /en 2 días|en 3 días/);

      // Viernes 8:00: el aviso del día; Facundo manda el video y confirma
      mover("08:00", VIERNES);
      const tick = await (await api("tick")).json();
      assert.ok(tick.acciones.includes("resumen:1"), JSON.stringify(tick));
      const resumen = telegram.buscar("Hoy se publica a las 19:00");
      assert.match(resumen.texto, /Falta el video/);

      telegram.archivos.set("video-1", Buffer.from("contenido-del-video"));
      await telegramManda({ message: { message_id: 7000, chat: { id: CHAT }, video: { file_id: "video-1", mime_type: "video/mp4" }, reply_to_message: { message_id: resumen.id } } });
      assert.equal((await repo.mediosDePieza(fila.id)).length, 1);

      await telegramManda(boton(`confirmar:${fila.id}`, resumen.id));
      assert.equal((await repo.obtenerPieza(fila.id)).estado, "confirmada");

      // 18:45: se arma el contenedor, y Meta descarga el video desde la API
      mover("18:45");
      await api("tick");
      assert.equal(descargado.length, 1);
      assert.equal(descargado[0].tipo, "video/mp4");
      assert.equal(descargado[0].datos.toString(), "contenido-del-video");

      // 19:00: se publica, una sola vez aunque lleguen varios ticks juntos
      mover("19:00");
      await Promise.all([api("tick"), api("tick"), api("tick")]);
      assert.equal(meta.veces("publicar"), 1);
      const final = await repo.obtenerPieza(fila.id);
      assert.equal(final.estado, "publicada");
      assert.match(final.permalink, /instagram\.com/);
      assert.equal((await repo.mediosDePieza(fila.id)).length, 0);
      assert.match(telegram.ultimo().texto, /Publicada a las 19:00/);
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
    await pool.query("DELETE FROM piezas_programadas WHERE semana BETWEEN '2098-01-01' AND '2098-12-31'");
    return crearRepositorio(pool, { prefijoEstado: PREFIJO });
  },
  {
    saltear: SIN_BASE,
    alTerminar: async () => {
      if (!pool) return;
      await pool.query("DELETE FROM piezas_programadas WHERE semana BETWEEN '2098-01-01' AND '2098-12-31'");
      await pool.query("DELETE FROM bot_estado WHERE clave LIKE $1", [`${PREFIJO}%`]);
      await pool.end();
    },
  },
);
