import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { crearApp } from "../api/servidor.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearRutasProgramacion, validarPlanEntrante } from "./rutas.js";
import { crearPieza, crearPlan } from "./ayuda-pruebas.js";

const CLAVE = "clave-de-la-api-de-prueba";
const SECRETO_WEBHOOK = "secreto-del-webhook-1234";

const levantar = (app) => new Promise((resolver) => { const i = app.listen(0, "127.0.0.1", () => resolver(i)); });
const cerrar = (i) => new Promise((resolver) => { i.closeAllConnections(); i.close(resolver); });

describe("rutas de la publicación programada", () => {
  const repo = crearRepositorioMemoria();
  const llamadas = { actualizaciones: [], ticks: 0, planes: [], fallos: [] };
  const servicio = {
    manejarActualizacion: async (u) => { llamadas.actualizaciones.push(u); },
    tick: async () => { llamadas.ticks++; return { acciones: ["ok"] }; },
    recibirPlan: async (p) => { llamadas.planes.push(p); return { piezas: p.plan.piezas.length, urgentes: 0 }; },
    avisarFalloDelPlan: async (f) => { llamadas.fallos.push(f); },
  };
  let router;
  let servidor;
  let base;

  before(async () => {
    router = crearRutasProgramacion({ servicio, repo, secretoApi: CLAVE, secretoWebhook: SECRETO_WEBHOOK });
    const app = express();
    app.use("/api/programacion", router);
    servidor = await levantar(app);
    base = `http://127.0.0.1:${servidor.address().port}/api/programacion`;
  });
  after(() => cerrar(servidor));

  const pedir = (ruta, { metodo = "GET", cuerpo, clave, encabezados = {} } = {}) =>
    fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...(clave ? { Authorization: `Bearer ${clave}` } : {}), ...encabezados },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });

  test("el webhook de Telegram rechaza un secreto equivocado o ausente", async () => {
    const mal = await pedir("/telegram", { metodo: "POST", cuerpo: { update_id: 1 }, encabezados: { "X-Telegram-Bot-Api-Secret-Token": "otro" } });
    const sin = await pedir("/telegram", { metodo: "POST", cuerpo: { update_id: 1 } });
    assert.equal(mal.status, 401);
    assert.equal(sin.status, 401);
    assert.equal(llamadas.actualizaciones.length, 0);
  });

  test("el webhook procesa cada actualización una sola vez, aunque Telegram la reenvíe", async () => {
    const encabezados = { "X-Telegram-Bot-Api-Secret-Token": SECRETO_WEBHOOK };
    const u = { update_id: 10, message: { text: "hola" } };
    assert.equal((await pedir("/telegram", { metodo: "POST", cuerpo: u, encabezados })).status, 200);
    assert.equal((await pedir("/telegram", { metodo: "POST", cuerpo: u, encabezados })).status, 200);
    await router.esperarPendientes();
    assert.equal(llamadas.actualizaciones.filter((x) => x.update_id === 10).length, 1);

  });

  test("el webhook guarda la actualización antes de contestar y, si el procesamiento se cae, queda pendiente para recuperarla", async () => {
    const encabezados = { "X-Telegram-Bot-Api-Secret-Token": SECRETO_WEBHOOK };
    const u = { update_id: 11, message: { text: "se cae" } };
    const original = servicio.manejarActualizacion;
    servicio.manejarActualizacion = async () => { throw new Error("se reinició el servidor"); };
    try {
      assert.equal((await pedir("/telegram", { metodo: "POST", cuerpo: u, encabezados })).status, 200);
      await router.esperarPendientes();
    } finally {
      servicio.manejarActualizacion = original;
    }
    // quedó guardada y sin marcar: se puede reclamar para reintentarla
    const reclamadas = await repo.reclamarActualizacionesPendientes({ antesDe: new Date(Date.now() + 1000) });
    assert.deepEqual(reclamadas.map((x) => x.id), [11]);
    assert.equal(reclamadas[0].cuerpo.message.text, "se cae");
  });

  test("el webhook ignora lo que no trae un update_id entero", async () => {
    const encabezados = { "X-Telegram-Bot-Api-Secret-Token": SECRETO_WEBHOOK };
    const antes = llamadas.actualizaciones.length;
    assert.equal((await pedir("/telegram", { metodo: "POST", cuerpo: { message: {} }, encabezados })).status, 200);
    await router.esperarPendientes();
    assert.equal(llamadas.actualizaciones.length, antes);
  });

  test("/tick exige la clave", async () => {
    assert.equal((await pedir("/tick", { metodo: "POST" })).status, 401);
    assert.equal((await pedir("/tick", { metodo: "POST", clave: "mala" })).status, 401);
    assert.equal(llamadas.ticks, 0);
    const bien = await pedir("/tick", { metodo: "POST", clave: CLAVE });
    assert.equal(bien.status, 200);
    assert.deepEqual(await bien.json(), { acciones: ["ok"] });
    assert.equal(llamadas.ticks, 1);
  });

  test("sin PROGRAMACION_SECRETO configurado, las rutas con clave quedan cerradas (503), nunca abiertas", async () => {
    const app = express();
    app.use("/api/programacion", crearRutasProgramacion({ servicio, repo, secretoApi: "", secretoWebhook: SECRETO_WEBHOOK }));
    const otro = await levantar(app);
    try {
      const r = await fetch(`http://127.0.0.1:${otro.address().port}/api/programacion/tick`, { method: "POST" });
      assert.equal(r.status, 503);
    } finally {
      await cerrar(otro);
    }
  });

  test("/plan valida y recibe el plan (también uno de más de 10 kb)", async () => {
    assert.equal((await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "mal", plan: crearPlan([crearPieza()]) } })).status, 400);
    assert.equal((await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "2026-10-26", plan: { piezas: [] } } })).status, 400);

    const grande = crearPieza({ guion: "x".repeat(30_000) });
    const r = await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "2026-10-26", plan: crearPlan([grande]), novedades_usadas: [3] } });
    assert.equal(r.status, 201);
    assert.equal(llamadas.planes.at(-1).semana, "2026-10-26");
    assert.deepEqual(llamadas.planes.at(-1).novedadesUsadas, [3]);
  });

  test("/plan con un error del workflow se lo avisa a Facundo", async () => {
    const r = await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "2026-10-26", error: "El paso planificar no pasó" } });
    assert.equal(r.status, 202);
    assert.equal(llamadas.fallos.at(-1).error, "El paso planificar no pasó");
  });

  test("/oficina y /oficina/accion piden clave y devuelven lo que muestra el juego", async () => {
    assert.equal((await pedir("/oficina")).status, 401);
    assert.equal((await pedir("/oficina", { clave: "otra" })).status, 401);
    await repo.guardarEstado("chat", [{ rol: "usuario", texto: "cambiá el gancho" }]);
    const r = await pedir("/oficina", { clave: CLAVE });
    assert.equal(r.status, 200);
    const cuerpo = await r.json();
    assert.equal(typeof cuerpo.pausa, "boolean");
    assert.ok(Array.isArray(cuerpo.piezas) && Array.isArray(cuerpo.novedades));
    assert.deepEqual(cuerpo.chat.at(-1), { rol: "usuario", texto: "cambiá el gancho", canal: "telegram", en: null });

    assert.equal((await pedir("/oficina/accion", { metodo: "POST", cuerpo: { accion: "nota", texto: "x" } })).status, 401);
    const nota = await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "nota", clave: "n1", texto: "Ojo con la luz", tipo: "anotacion" } });
    assert.equal(nota.status, 200);
    assert.equal((await (await pedir("/oficina", { clave: CLAVE })).json()).juego.notas.n1.texto, "Ojo con la luz");
    assert.equal((await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "rara" } })).status, 400);
  });

  test("la oficina también entra con su propia clave, y esa clave no sirve para el resto", async () => {
    const aparte = express();
    aparte.use("/api/programacion", crearRutasProgramacion({ servicio, repo, secretoApi: CLAVE, secretoOficina: "clave-de-la-oficina", secretoWebhook: SECRETO_WEBHOOK }));
    const i = await levantar(aparte);
    try {
      const url = `http://127.0.0.1:${i.address().port}/api/programacion`;
      const con = (ruta, metodo, clave) => fetch(`${url}${ruta}`, { method: metodo, headers: { Authorization: `Bearer ${clave}` } });
      assert.equal((await con("/oficina", "GET", "clave-de-la-oficina")).status, 200);
      assert.equal((await con("/oficina", "GET", CLAVE)).status, 200);
      assert.equal((await con("/tick", "POST", "clave-de-la-oficina")).status, 401);
    } finally {
      await cerrar(i);
    }
  });

  test("aprobar_pieza llega al servicio y avisa si no se puede", async () => {
    servicio.aprobarDesdeJuego = async (id) => (id === 7 ? { ok: true, estado: "aprobada" } : { ok: false, motivo: "Esa pieza está aprobada." });
    const bien = await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "aprobar_pieza", id: 7 } });
    assert.equal(bien.status, 200);
    const mal = await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "aprobar_pieza", id: 8 } });
    assert.equal(mal.status, 409);
    assert.equal((await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "aprobar_pieza" } })).status, 400);
  });

  test("/oficina/archivo recibe la foto o el video como cuerpo y rechaza lo demás", async () => {
    const guardados = [];
    servicio.adjuntarDesdeJuego = async (id, datos) => { guardados.push({ id, mime: datos.mime, bytes: datos.datos?.length, reemplazar: datos.reemplazar }); return { ok: true, archivos: 1, falta: null }; };
    const subir = (consulta, tipo, cuerpo, clave = CLAVE) => fetch(`${base}/oficina/archivo${consulta}`, { method: "POST", headers: { "Content-Type": tipo, ...(clave ? { Authorization: `Bearer ${clave}` } : {}) }, body: cuerpo });
    assert.equal((await subir("?id=3", "video/mp4", Buffer.from("abc"), null)).status, 401);
    assert.equal((await subir("?id=3&reemplazar=1", "video/mp4", Buffer.from("abc"))).status, 200);
    assert.deepEqual(guardados, [{ id: 3, mime: "video/mp4", bytes: 3, reemplazar: true }]);
    assert.equal((await subir("", "video/mp4", Buffer.from("abc"))).status, 400);
    servicio.adjuntarDesdeJuego = async () => ({ ok: false, motivo: "Ese tipo de archivo no sirve." });
    assert.equal((await subir("?id=3", "application/pdf", Buffer.from("abc"))).status, 409);
  });

  test("/novedades devuelve lo pendiente, con clave", async () => {
    await repo.agregarNovedad("Llegaron las gorras");
    assert.equal((await pedir("/novedades")).status, 401);
    const r = await pedir("/novedades", { clave: CLAVE });
    assert.ok((await r.json()).novedades.some((n) => n.texto === "Llegaron las gorras"));
  });

  test("/novedades también trae el foco de la semana que fijó Facundo", async () => {
    await repo.guardarEstado("operacion", { campos: { "estrategia.foco": "Suspenso del Drop 00" } });
    const datos = await (await pedir("/novedades", { clave: CLAVE })).json();
    assert.equal(datos.foco, "Suspenso del Drop 00");
    assert.equal(datos.notas_estrategia, "");
    await repo.guardarEstado("operacion", null);
  });

  describe("archivos para Meta", () => {
    let token;
    before(async () => {
      ({ token } = await repo.agregarMedio({ piezaId: 1, tipo: "video", mime: "video/mp4", datos: Buffer.from("0123456789") }));
    });

    test("sirve el archivo con su tipo", async () => {
      const r = await pedir(`/medios/${token}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("content-type"), "video/mp4");
      assert.equal(r.headers.get("accept-ranges"), "bytes");
      assert.equal(r.headers.get("cross-origin-resource-policy"), "cross-site", "el juego (otro dominio) tiene que poder mostrar el video y las imágenes");
      assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "0123456789");
    });

    test("soporta pedidos por partes (Range)", async () => {
      const r = await pedir(`/medios/${token}`, { encabezados: { Range: "bytes=2-5" } });
      assert.equal(r.status, 206);
      assert.equal(r.headers.get("content-range"), "bytes 2-5/10");
      assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "2345");
      const final = await pedir(`/medios/${token}`, { encabezados: { Range: "bytes=7-" } });
      assert.equal(Buffer.from(await final.arrayBuffer()).toString(), "789");
      const ultimos = await pedir(`/medios/${token}`, { encabezados: { Range: "bytes=-3" } });
      assert.equal(Buffer.from(await ultimos.arrayBuffer()).toString(), "789");
      assert.equal((await pedir(`/medios/${token}`, { encabezados: { Range: "bytes=50-60" } })).status, 416);
    });

    test("un token inexistente o con formato raro da 404", async () => {
      assert.equal((await pedir(`/medios/${"a".repeat(48)}`)).status, 404);
      assert.equal((await pedir("/medios/1")).status, 404);
      assert.equal((await pedir("/medios/..%2F..%2Fetc")).status, 404);
    });
  });
});

describe("dentro de la API de VOW", () => {
  test("el router va antes del parser de 10 kb y el resto de la API conserva su límite", async () => {
    const llamadas = [];
    const servicio = { recibirPlan: async (p) => { llamadas.push(p); return { piezas: 1, urgentes: 0 }; } };
    const router = crearRutasProgramacion({ servicio, repo: crearRepositorioMemoria(), secretoApi: CLAVE, secretoWebhook: SECRETO_WEBHOOK });
    const app = crearApp({ pool: null, origenesPermitidos: [], programacion: router });
    const servidor = await levantar(app);
    const url = `http://127.0.0.1:${servidor.address().port}`;
    try {
      const plan = await fetch(`${url}/api/programacion/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLAVE}` },
        body: JSON.stringify({ semana: "2026-10-26", plan: crearPlan([crearPieza({ guion: "x".repeat(20_000) })]) }),
      });
      assert.equal(plan.status, 201);

      const lista = await fetch(`${url}/api/lista-espera`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.co", origen: "x".repeat(20_000) }) });
      assert.equal(lista.status, 413, "la lista de espera sigue limitada a 10 kb");
      assert.equal((await fetch(`${url}/api/salud`)).status, 200);
    } finally {
      await cerrar(servidor);
    }
  });
});

test("validarPlanEntrante rechaza planes mal formados", () => {
  assert.equal(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan([crearPieza()]) }), null);
  assert.match(validarPlanEntrante({ plan: crearPlan([crearPieza()]) }), /semana/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan([crearPieza({ hora: "25:00" })]) }), /hora inválida/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "mañana" })]) }), /fecha, formato y gancho/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan(Array(6).fill(crearPieza())) }), /de 1 a 5 piezas/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan([crearPieza()]), novedades_usadas: ["x"] }), /novedades_usadas/);
});
