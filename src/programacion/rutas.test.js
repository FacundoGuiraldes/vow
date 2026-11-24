import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { crearApp } from "../api/servidor.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearRutasProgramacion, validarPlanEntrante } from "./rutas.js";
import { crearDia, crearPlan } from "./ayuda-pruebas.js";

const CLAVE = "clave-de-la-api-de-prueba";

const levantar = (app) => new Promise((resolver) => { const i = app.listen(0, "127.0.0.1", () => resolver(i)); });
const cerrar = (i) => new Promise((resolver) => { i.closeAllConnections(); i.close(resolver); });

describe("rutas de la oficina", () => {
  const repo = crearRepositorioMemoria();
  const llamadas = { planes: [], fallos: [] };
  const servicio = {
    recibirPlan: async (p) => { llamadas.planes.push(p); return { publicaciones: p.plan.dias.length }; },
    flujosVigentes: async () => [],
    leerFlujo: async (semana) => (semana === "2026-12-08" ? { dias: [crearDia()] } : null),
    avisarFalloDelPlan: async (f) => { llamadas.fallos.push(f); },
  };
  let router;
  let servidor;
  let base;

  before(async () => {
    router = crearRutasProgramacion({ servicio, repo, secretoApi: CLAVE });
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

  test("/tick exige la clave y ya no hace nada", async () => {
    assert.equal((await pedir("/tick", { metodo: "POST" })).status, 401);
    assert.equal((await pedir("/tick", { metodo: "POST", clave: "mala" })).status, 401);
    const bien = await pedir("/tick", { metodo: "POST", clave: CLAVE });
    assert.equal(bien.status, 200);
    assert.equal((await bien.json()).ok, true);
  });

  test("sin PROGRAMACION_SECRETO configurado, las rutas con clave quedan cerradas (503), nunca abiertas", async () => {
    const app = express();
    app.use("/api/programacion", crearRutasProgramacion({ servicio, repo, secretoApi: "" }));
    const otro = await levantar(app);
    try {
      const r = await fetch(`http://127.0.0.1:${otro.address().port}/api/programacion/tick`, { method: "POST" });
      assert.equal(r.status, 503);
    } finally {
      await cerrar(otro);
    }
  });

  test("/plan valida y recibe el flujo", async () => {
    assert.equal((await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "mal", plan: crearPlan() } })).status, 400);
    assert.equal((await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "2026-10-26", plan: { dias: [] } } })).status, 400);
    const r = await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "2026-10-26", plan: crearPlan(), novedades_usadas: [3] } });
    assert.equal(r.status, 201);
    assert.equal(llamadas.planes.at(-1).semana, "2026-10-26");
    assert.deepEqual(llamadas.planes.at(-1).novedadesUsadas, [3]);
  });

  test("/plan con un error del workflow se lo avisa a Facundo", async () => {
    const r = await pedir("/plan", { metodo: "POST", clave: CLAVE, cuerpo: { semana: "2026-10-26", error: "El paso planificar no pasó" } });
    assert.equal(r.status, 202);
    assert.equal(llamadas.fallos.at(-1).error, "El paso planificar no pasó");
  });

  test("los documentos de la oficina y sus archivos no se ven sin clave", async () => {
    assert.equal((await pedir("/oficina/documentos")).status, 401);
    assert.equal((await pedir("/oficina/documentos", { clave: "otra" })).status, 401);
    const ok = await pedir("/oficina/documentos", { clave: CLAVE });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const { D } = await ok.json();
    assert.ok(D && typeof D === "object");
    assert.equal(JSON.stringify(D).includes("medios/"), false, "no salen rutas de archivos");
    assert.equal((await pedir("/oficina/medios/x/1.png")).status, 404, "ya no hay archivos de piezas");
  });

  test("/oficina y /oficina/accion piden clave y devuelven lo que muestra el juego", async () => {
    assert.equal((await pedir("/oficina")).status, 401);
    assert.equal((await pedir("/oficina", { clave: "otra" })).status, 401);
    await repo.guardarEstado("chat", [{ rol: "usuario", texto: "cambiá el foco" }]);
    const r = await pedir("/oficina", { clave: CLAVE });
    assert.equal(r.status, 200);
    const cuerpo = await r.json();
    assert.ok(Array.isArray(cuerpo.flujo) && Array.isArray(cuerpo.novedades));
    assert.equal(cuerpo.piezas, undefined);
    assert.deepEqual(cuerpo.chat.at(-1), { rol: "usuario", texto: "cambiá el foco", canal: "juego", en: null });

    assert.equal((await pedir("/oficina/accion", { metodo: "POST", cuerpo: { accion: "nota", texto: "x" } })).status, 401);
    const nota = await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "nota", clave: "n1", texto: "Ojo con la luz", tipo: "anotacion" } });
    assert.equal(nota.status, 200);
    assert.equal((await (await pedir("/oficina", { clave: CLAVE })).json()).juego.notas.n1.texto, "Ojo con la luz");
    assert.equal((await pedir("/oficina/accion", { metodo: "POST", clave: CLAVE, cuerpo: { accion: "rara" } })).status, 400);
  });

  test("la oficina también entra con su propia clave, y esa clave no sirve para el resto", async () => {
    const aparte = express();
    aparte.use("/api/programacion", crearRutasProgramacion({ servicio, repo, secretoApi: CLAVE, secretoOficina: "clave-de-la-oficina" }));
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

  test("/novedades devuelve lo pendiente, con clave", async () => {
    await repo.agregarNovedad("Llegaron las gorras");
    assert.equal((await pedir("/novedades")).status, 401);
    const r = await pedir("/novedades", { clave: CLAVE });
    assert.ok((await r.json()).novedades.some((n) => n.texto === "Llegaron las gorras"));
  });

  test("/plan/:semana dice si la semana ya tiene flujo, con clave", async () => {
    assert.equal((await pedir("/plan/2026-12-07")).status, 401);
    assert.equal((await pedir("/plan/mañana", { clave: CLAVE })).status, 400);
    assert.deepEqual(await (await pedir("/plan/2026-12-07", { clave: CLAVE })).json(), { existe: false, publicaciones: 0 });
    assert.deepEqual(await (await pedir("/plan/2026-12-08", { clave: CLAVE })).json(), { existe: true, publicaciones: 1 });
  });

  test("/novedades también trae el foco de la semana que fijó Facundo", async () => {
    await repo.guardarEstado("operacion", { campos: { "estrategia.foco": "Suspenso del Drop 00" } });
    const datos = await (await pedir("/novedades", { clave: CLAVE })).json();
    assert.equal(datos.foco, "Suspenso del Drop 00");
    assert.equal(datos.notas_estrategia, "");
    await repo.guardarEstado("operacion", null);
  });
});

describe("dentro de la API de VOW", () => {
  test("el router va antes del parser de 10 kb y el resto de la API conserva su límite", async () => {
    const llamadas = [];
    const servicio = { recibirPlan: async (p) => { llamadas.push(p); return { publicaciones: 1 }; } };
    const router = crearRutasProgramacion({ servicio, repo: crearRepositorioMemoria(), secretoApi: CLAVE });
    const app = crearApp({ pool: null, origenesPermitidos: [], programacion: router });
    const servidor = await levantar(app);
    const url = `http://127.0.0.1:${servidor.address().port}`;
    try {
      const plan = await fetch(`${url}/api/programacion/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLAVE}` },
        body: JSON.stringify({ semana: "2026-10-26", plan: crearPlan([crearDia({ contenido: "x".repeat(500) })]) }),
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

test("validarPlanEntrante rechaza flujos mal formados", () => {
  assert.equal(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan() }), null);
  assert.match(validarPlanEntrante({ plan: crearPlan() }), /semana/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan([crearDia({ fecha: "mañana" })]) }), /fecha, formato y contenido/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan([crearDia({ formato: "podcast" })]) }), /fecha, formato y contenido/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan(Array(8).fill(crearDia())) }), /de 1 a 7/);
  assert.match(validarPlanEntrante({ semana: "2026-10-26", plan: crearPlan(), novedades_usadas: ["x"] }), /novedades_usadas/);
});
