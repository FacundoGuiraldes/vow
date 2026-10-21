import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteSimulado } from "../agents/cliente-simulado.js";
import { correrPlanDelLunes, opcionesDelPlan } from "./plan-lunes.js";

const ENTORNO = { ANTHROPIC_API_KEY: "clave", URL_PUBLICA: "https://vow.example.com", PROGRAMACION_SECRETO: "secreto" };
const VALORES = { fase: "base", producto: false, gente: false, notas: "", piezas: "2", simulado: false, "sin-enviar": false };
const respuesta = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

// Servicio falso: anota lo que le mandan
function servicioFalso({ novedades = [], estadoPlan = 201 } = {}) {
  const pedidos = [];
  const fetchFn = async (url, opciones) => {
    const ruta = new URL(url).pathname.replace("/api/programacion/", "");
    pedidos.push({ ruta, metodo: opciones.method, autorizacion: opciones.headers.Authorization, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    if (ruta === "novedades") return respuesta({ novedades });
    return respuesta(estadoPlan === 201 ? { piezas: 1, urgentes: 0 } : { error: "no" }, estadoPlan);
  };
  return { pedidos, fetchFn };
}

// Cliente de IA que anota el pedido y contesta con el plan de ejemplo
function clienteQueAnota(semana) {
  const base = crearClienteSimulado(semana);
  const pedidos = [];
  return { pedidos, messages: { create: async (argumentos) => { pedidos.push(argumentos); return base.messages.create(argumentos); } } };
}

test("la semana por defecto es el lunes de hoy, o el próximo", () => {
  assert.equal(opcionesDelPlan({ valores: VALORES, hoy: "2026-10-26" }).semana, "2026-10-26");
  assert.equal(opcionesDelPlan({ valores: VALORES, hoy: "2026-10-28" }).semana, "2026-11-02");
  assert.equal(opcionesDelPlan({ valores: { ...VALORES, semana: "2026-11-09" }, hoy: "2026-10-28" }).semana, "2026-11-09");
});

test("las novedades de VOW viajan como notas para el Estratega", () => {
  const { notas } = opcionesDelPlan({ valores: { ...VALORES, notas: "Foco en el reel." }, hoy: "2026-10-26", novedades: [{ id: 1, texto: "Llegaron las gorras" }, { id: 2, texto: "El Drop 00 sale en noviembre" }] });
  assert.match(notas, /Foco en el reel\./);
  assert.match(notas, /Llegaron las gorras \| El Drop 00 sale en noviembre/);
});

test("trae las novedades, arma el plan y lo manda al servicio con las novedades usadas", async () => {
  const servicio = servicioFalso({ novedades: [{ id: 7, texto: "Llegaron las gorras" }] });
  const cliente = clienteQueAnota("2026-10-26");
  const logs = [];
  const r = await correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: (t) => logs.push(t), fetchFn: servicio.fetchFn, crearCliente: async () => cliente });

  assert.equal(r.enviado, true);
  assert.deepEqual(servicio.pedidos.map((p) => `${p.metodo} ${p.ruta}`), ["GET novedades", "POST plan"]);
  assert.ok(servicio.pedidos.every((p) => p.autorizacion === "Bearer secreto"));
  const enviado = servicio.pedidos[1].cuerpo;
  assert.equal(enviado.semana, "2026-10-26");
  assert.equal(enviado.plan.piezas.length, 1);
  assert.deepEqual(enviado.novedades_usadas, [7]);
  assert.match(cliente.pedidos[0].messages[0].content, /Llegaron las gorras/);
});

test("no manda una aprobación: el plan sale solo planificado y revisado", async () => {
  const servicio = servicioFalso();
  const r = await correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => crearClienteSimulado("2026-10-26") });
  assert.ok(!("aprobado" in servicio.pedidos[1].cuerpo));
  assert.equal(r.plan.piezas.length, 1);
});

test("--simulado nunca toca el servicio real", async () => {
  const servicio = servicioFalso();
  const r = await correrPlanDelLunes({ valores: { ...VALORES, simulado: true }, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn });
  assert.equal(r.enviado, false);
  assert.equal(servicio.pedidos.length, 0);
});

test("--sin-enviar arma el plan pero no lo manda", async () => {
  const servicio = servicioFalso();
  const r = await correrPlanDelLunes({ valores: { ...VALORES, "sin-enviar": true }, env: { ANTHROPIC_API_KEY: "clave" }, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => crearClienteSimulado("2026-10-26") });
  assert.equal(r.enviado, false);
  assert.equal(servicio.pedidos.length, 0);
});

test("si el plan no pasa las reglas, se lo avisa a Facundo por Telegram y termina con error", async () => {
  const servicio = servicioFalso();
  const clienteMalo = { messages: { create: async () => ({ usage: {}, stop_reason: "tool_use", content: [{ type: "tool_use", name: "proponer_plan", input: { resumen: "", piezas: [] } }] }) } };
  await assert.rejects(
    correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => clienteMalo }),
    /no pasó/,
  );
  const aviso = servicio.pedidos.find((p) => p.metodo === "POST");
  assert.equal(aviso.ruta, "plan");
  assert.match(aviso.cuerpo.error, /planificar/);
  assert.equal(aviso.cuerpo.semana, "2026-10-26");
});

test("sin ANTHROPIC_API_KEY falla con un mensaje claro y no gasta", async () => {
  await assert.rejects(correrPlanDelLunes({ valores: VALORES, env: { URL_PUBLICA: ENTORNO.URL_PUBLICA, PROGRAMACION_SECRETO: "s" }, hoy: "2026-10-26", log: () => {}, fetchFn: servicioFalso().fetchFn }), /Falta ANTHROPIC_API_KEY/);
});

test("un error del servicio (400) no se reintenta; uno de servidor (500) sí", async () => {
  let intentos = 0;
  const fetch500 = async () => { intentos++; return respuesta({ error: "caído" }, intentos < 3 ? 503 : 200); };
  const r = await correrPlanDelLunes({ valores: { ...VALORES, "sin-enviar": false }, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: async (url, o) => (new URL(url).pathname.endsWith("novedades") ? fetch500() : respuesta({ piezas: 1 })), crearCliente: async () => crearClienteSimulado("2026-10-26") });
  assert.equal(r.enviado, true);
  assert.equal(intentos, 3);

  let intentos400 = 0;
  await assert.rejects(
    correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: async () => { intentos400++; return respuesta({ error: "No autorizado." }, 401); }, crearCliente: async () => crearClienteSimulado("2026-10-26") }),
    /401/,
  );
  assert.equal(intentos400, 1);
});
