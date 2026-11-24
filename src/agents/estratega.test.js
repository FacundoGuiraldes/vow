import test from "node:test";
import assert from "node:assert/strict";
import { planificarSemana, recuperarDiasEnTexto, validarPlan, construirSistema, leerUltimoInforme, leerUltimoRendimiento, HERRAMIENTA_PLAN, MAXIMO_PUBLICACIONES, MAX_TOKENS_ESTRATEGA } from "./estratega.js";

const SEMANA = "2026-10-19";

const diaValido = (cambios = {}) => ({
  fecha: "2026-10-20",
  formato: "reel",
  contenido: "Un plano cerrado de unas manos atando el cordón antes de salir a entrenar. Sin cara y sin producto.",
  ...cambios,
});
const planValido = (dias = [diaValido()]) => ({ dias });

// Cliente falso: responde lo que le pidamos (una respuesta por llamada) y guarda los pedidos
const clienteFalso = (...respuestas) => {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (pedido) => {
        pedidos.push(pedido);
        if (["tool", "any"].includes(pedido.tool_choice?.type)) throw new Error('400 tool_choice: type "tool" and "any" are not supported for this model.');
        const r = respuestas[Math.min(pedidos.length - 1, respuestas.length - 1)];
        const usage = { input_tokens: 1200, output_tokens: 800 };
        if (r === null) return { content: [{ type: "text", text: "hola" }], usage, stop_reason: "end_turn" };
        if (r === "cortada") return { content: [], usage, stop_reason: "max_tokens" };
        return { content: [{ type: "tool_use", id: "t1", name: "proponer_flujo", input: r }], usage, stop_reason: "tool_use" };
      },
    },
  };
};

const leerFalso = async (ruta) => (String(ruta).includes("cerebro") ? "CEREBRO-DE-PRUEBA" : "REFERENCIAS-DE-PRUEBA");
const pedido = { semanaInicio: SEMANA, fase: "base", recursos: { producto: false, gente: false } };
const opciones = (cliente) => ({ cliente, leer: leerFalso, listar: async () => [] });

test("un flujo válido se acepta y informa cuántos tokens usó", async () => {
  const r = await planificarSemana(pedido, opciones(clienteFalso(planValido())));
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
  assert.equal(r.plan.dias.length, 1);
  assert.deepEqual(r.uso, { entrada: 1200, salida: 800 });
  assert.equal(r.intentos, 1);
});

test("pide el flujo con la herramienta en modo auto y con espacio de sobra, y le pasa la marca", async () => {
  const cliente = clienteFalso(planValido());
  await planificarSemana(pedido, opciones(cliente));
  const p = cliente.pedidos[0];
  assert.equal(p.tool_choice.type, "auto");
  assert.equal(p.tools[0].name, "proponer_flujo");
  assert.ok(p.max_tokens >= MAX_TOKENS_ESTRATEGA);
  assert.match(p.system, /CEREBRO-DE-PRUEBA/);
  assert.match(p.messages[0].content, /2026-10-19/);
  assert.match(p.messages[0].content, /2026-10-25/);
});

test("el esquema de la herramienta solo pide fecha, formato y contenido", () => {
  const item = HERRAMIENTA_PLAN.input_schema.properties.dias.items;
  assert.deepEqual(item.required, ["fecha", "formato", "contenido"]);
  assert.deepEqual(Object.keys(item.properties), ["fecha", "formato", "contenido"]);
});

test("el sistema aclara que no se escriben ganchos, guiones ni epígrafes", async () => {
  const { texto } = await construirSistema(leerFalso, { listar: async () => [] });
  assert.match(texto, /Nada más: no escribís ganchos, guiones, epígrafes, horas ni hashtags/);
});

test("si la respuesta no trae la herramienta, reintenta una vez y después lo descarta", async () => {
  const cliente = clienteFalso(null);
  const r = await planificarSemana(pedido, opciones(cliente));
  assert.equal(r.ok, false);
  assert.equal(cliente.pedidos.length, 2);
  assert.match(r.errores[0], /formato esperado/);
});

test("si la primera respuesta es texto y la segunda trae el flujo, se acepta", async () => {
  const r = await planificarSemana(pedido, opciones(clienteFalso(null, planValido())));
  assert.equal(r.ok, true);
  assert.equal(r.intentos, 2);
});

test("una respuesta cortada por el límite de tokens no se valida a medias", async () => {
  const r = await planificarSemana(pedido, opciones(clienteFalso("cortada", planValido())));
  assert.equal(r.ok, true);
});

test("un flujo que rompe las reglas tiene una segunda oportunidad con los errores", async () => {
  const mal = planValido([diaValido({ fecha: "2026-11-30" })]);
  const cliente = clienteFalso(mal, planValido());
  const r = await planificarSemana(pedido, opciones(cliente));
  assert.equal(r.ok, true);
  assert.equal(cliente.pedidos.length, 2);
  const ultimo = cliente.pedidos[1].messages.at(-1).content[0];
  assert.equal(ultimo.is_error, true);
  assert.match(ultimo.content, /fuera de la semana/);
});

test("si sigue mal después del reintento, devuelve los errores y no entrega el flujo", async () => {
  const mal = planValido([diaValido({ fecha: "2026-11-30" })]);
  const r = await planificarSemana(pedido, opciones(clienteFalso(mal)));
  assert.equal(r.ok, false);
  assert.equal(r.plan, null);
  assert.ok(r.errores.length > 0);
});

test("exige una fecha de inicio válida y un cliente", async () => {
  await assert.rejects(planificarSemana({ ...pedido, semanaInicio: "mañana" }, opciones(clienteFalso(planValido()))), /AAAA-MM-DD/);
  await assert.rejects(planificarSemana(pedido, { leer: leerFalso }), /cliente/);
});

test("recupera la lista de días cuando llega como texto JSON", () => {
  const texto = JSON.stringify([diaValido()]);
  assert.equal(recuperarDiasEnTexto({ dias: texto }).dias.length, 1);
  assert.deepEqual(recuperarDiasEnTexto({ dias: "no es json" }), { dias: "no es json" });
});

test("validarPlan: forma, semana, formatos y repetidos", () => {
  assert.equal(validarPlan(planValido(), { semanaInicio: SEMANA }).ok, true);
  assert.equal(validarPlan(null).ok, false);
  assert.match(validarPlan({}).errores[0], /no tiene días/);
  assert.match(validarPlan({ dias: [] }).errores[0], /no tiene publicaciones/);
  assert.match(validarPlan(planValido([diaValido({ fecha: "20/10" })])).errores.join(" "), /AAAA-MM-DD/);
  assert.match(validarPlan(planValido([diaValido({ formato: "podcast" })])).errores.join(" "), /formato inválido/);
  assert.match(validarPlan(planValido([diaValido({ fecha: "2026-10-28" })]), { semanaInicio: SEMANA }).errores.join(" "), /fuera de la semana/);
  assert.match(validarPlan(planValido([diaValido(), diaValido()])).errores.join(" "), /repite el formato/);
  assert.match(validarPlan(planValido(Array.from({ length: MAXIMO_PUBLICACIONES + 1 }, (_, i) => diaValido({ fecha: `2026-10-${20 + (i % 6)}`, formato: ["reel", "carrusel", "imagen", "story"][i % 4] })))).errores.join(" "), /más de 7/);
});

test("validarPlan: el contenido tiene largo razonable y cumple las reglas de marca", () => {
  assert.match(validarPlan(planValido([diaValido({ contenido: "Algo corto" })])).errores.join(" "), /muy corto/);
  assert.match(validarPlan(planValido([diaValido({ contenido: "x ".repeat(400) })])).errores.join(" "), /supera/);
  assert.equal(validarPlan(planValido([diaValido({ contenido: "Un reel que muestra cómo quemá grasa rápido con la gorra de VOW." })])).ok, false);
  assert.equal(validarPlan(planValido([diaValido({ contenido: "Una story con 5000 seguidores nuevos en la última semana de la cuenta." })])).ok, false);
});

test("lee el último informe y el último rendimiento de su carpeta, y tolera que no haya", async () => {
  const listar = async () => ["informe-2026-10-05.md", "informe-2026-10-12.md", "rendimiento-2026-10-12.md"];
  const leer = async (ruta) => `texto de ${String(ruta).split("/").pop()}`;
  assert.equal((await leerUltimoInforme({ leer, listar })).nombre, "informe-2026-10-12.md");
  assert.equal((await leerUltimoRendimiento({ leer, listar })).nombre, "rendimiento-2026-10-12.md");
  assert.equal(await leerUltimoInforme({ leer, listar: async () => [] }), null);
  assert.equal(await leerUltimoInforme({ leer, listar: async () => { throw new Error("no existe"); } }), null);
});
