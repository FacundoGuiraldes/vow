import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteSimulado } from "../agents/cliente-simulado.js";
import { correrPlanDelLunes, opcionesDelPlan } from "./plan-lunes.js";

const ENTORNO = { ANTHROPIC_API_KEY: "clave", URL_PUBLICA: "https://vow.example.com", PROGRAMACION_SECRETO: "secreto" };
const VALORES = { fase: "base", producto: false, gente: false, notas: "", piezas: "2", simulado: false, "sin-enviar": false };
const respuesta = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

// Servicio falso: anota lo que le mandan
function servicioFalso({ novedades = [], estadoPlan = 201, planExistente = 0 } = {}) {
  const pedidos = [];
  const fetchFn = async (url, opciones) => {
    const ruta = new URL(url).pathname.replace("/api/programacion/", "");
    pedidos.push({ ruta, metodo: opciones.method, autorizacion: opciones.headers.Authorization, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    if (ruta === "novedades") return respuesta({ novedades });
    if (ruta.startsWith("plan/")) return respuesta({ existe: planExistente > 0, piezas: planExistente });
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
  assert.deepEqual(servicio.pedidos.map((p) => `${p.metodo} ${p.ruta}`), ["GET novedades", "GET plan/2026-10-26", "POST plan"]);
  assert.ok(servicio.pedidos.every((p) => p.autorizacion === "Bearer secreto"));
  const enviado = servicio.pedidos.find((p) => p.ruta === "plan" && p.metodo === "POST").cuerpo;
  assert.equal(enviado.semana, "2026-10-26");
  assert.equal(enviado.plan.piezas.length, 1);
  assert.deepEqual(enviado.novedades_usadas, [7]);
  assert.match(cliente.pedidos[0].messages[0].content, /Llegaron las gorras/);
});

test("no manda una aprobación: el plan sale solo planificado y revisado", async () => {
  const servicio = servicioFalso();
  const r = await correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => crearClienteSimulado("2026-10-26") });
  assert.ok(!("aprobado" in servicio.pedidos.find((p) => p.metodo === "POST").cuerpo));
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

test("el foco y las notas de estrategia del juego llegan al Estratega como notas", () => {
  const o = opcionesDelPlan({ valores: VALORES, hoy: "2026-10-26", foco: "Suspenso del Drop 00", notasEstrategia: "Más stories" });
  assert.match(o.notas, /FOCO DE LA SEMANA.*Suspenso del Drop 00/);
  assert.match(o.notas, /Más stories/);
  assert.equal(opcionesDelPlan({ valores: VALORES, hoy: "2026-10-26" }).notas, VALORES.notas ?? "");
});

test("sin cantidad fija, la IA decide cuántas piezas arma (auto)", async () => {
  assert.equal(opcionesDelPlan({ valores: { ...VALORES, piezas: "auto" }, hoy: "2026-10-26" }).piezas, "auto");
  assert.equal(opcionesDelPlan({ valores: { ...VALORES, piezas: undefined }, hoy: "2026-10-26" }).piezas, "auto");
  assert.equal(opcionesDelPlan({ valores: { ...VALORES, piezas: "3" }, hoy: "2026-10-26" }).piezas, 3);
  const cliente = clienteQueAnota("2026-10-26");
  await correrPlanDelLunes({ valores: { ...VALORES, piezas: "auto", "sin-enviar": true }, env: { ANTHROPIC_API_KEY: "clave" }, hoy: "2026-10-26", log: () => {}, crearCliente: async () => cliente });
  assert.match(cliente.pedidos[0].messages[0].content, /la decidís vos/);
});

test("si la semana ya tiene plan, no arma otro (el workflow se programa varias veces el lunes)", async () => {
  const servicio = servicioFalso({ planExistente: 3 });
  const cliente = clienteQueAnota("2026-10-26");
  const r = await correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => cliente });
  assert.equal(r.omitido, true);
  assert.equal(r.enviado, false);
  assert.equal(cliente.pedidos.length, 0, "no se gasta la IA");
  assert.ok(!servicio.pedidos.some((p) => p.metodo === "POST"));
});

test("--forzar arma el plan aunque la semana ya tenga uno", async () => {
  const servicio = servicioFalso({ planExistente: 3 });
  const r = await correrPlanDelLunes({ valores: { ...VALORES, forzar: true }, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => crearClienteSimulado("2026-10-26") });
  assert.equal(r.enviado, true);
});

test("si el servicio todavía no tiene la ruta del plan, planifica igual", async () => {
  const servicio = servicioFalso();
  const fetchFn = async (url, opciones) => (new URL(url).pathname.includes("/plan/") ? respuesta({ error: "no existe" }, 404) : servicio.fetchFn(url, opciones));
  const r = await correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn, crearCliente: async () => crearClienteSimulado("2026-10-26") });
  assert.equal(r.enviado, true);
});

test("reintenta el plan hasta 3 veces antes de avisar del fallo", async () => {
  const servicio = servicioFalso();
  let llamadas = 0;
  const base = crearClienteSimulado("2026-10-26");
  // Las dos primeras corridas vuelven sin plan (solo texto); la tercera trae el plan
  const cliente = { messages: { create: async (a) => (++llamadas <= 4 ? { content: [{ type: "text", text: "hola" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } : base.messages.create(a)) } };
  const logs = [];
  const r = await correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: (t) => logs.push(t), fetchFn: servicio.fetchFn, crearCliente: async () => cliente });
  assert.equal(r.enviado, true);
  assert.equal(logs.filter((l) => l.startsWith("Intento")).length, 2);
  assert.ok(!servicio.pedidos.some((p) => p.cuerpo?.error), "no se avisó de ningún fallo");
});

test("si los 3 intentos fallan, avisa del fallo una sola vez", async () => {
  const servicio = servicioFalso();
  const cliente = { messages: { create: async () => ({ content: [{ type: "text", text: "hola" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) } };
  await assert.rejects(() => correrPlanDelLunes({ valores: VALORES, env: ENTORNO, hoy: "2026-10-26", log: () => {}, fetchFn: servicio.fetchFn, crearCliente: async () => cliente }), /no pasó/);
  assert.equal(servicio.pedidos.filter((p) => p.cuerpo?.error).length, 1);
});
