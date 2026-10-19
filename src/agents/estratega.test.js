import test from "node:test";
import assert from "node:assert/strict";
import { planificarSemana, validarPlan, construirSistema, HERRAMIENTA_PLAN } from "./estratega.js";

const SEMANA = "2026-10-19";

// Una pieza que cumple todas las reglas, para modificarla en cada caso
const piezaValida = (cambios = {}) => ({
  fecha: "2026-10-20",
  formato: "reel",
  pilar: "promesa",
  gancho: "Una promesa para vos.",
  guion: "Texto sobre fondo hueso. Cada línea aparece sola, sin música fuerte.",
  texto_en_pantalla: ["Una promesa para vos.", "La escribís vos. Nadie más la lee."],
  epigrafe: "Es lo que sostiene todo lo demás. Anotate en la lista: link en la bio.",
  palabras_clave: ["promesa", "constancia", "entrenar"],
  cta: "Anotate en la lista de espera.",
  recursos: ["Diseño en colores de marca"],
  justificacion: "Presenta la idea central de la marca sin mostrar producto, que todavía no existe.",
  ...cambios,
});

const planValido = (piezas = [piezaValida()]) => ({ resumen: "Semana de presentación de la idea central.", piezas });

// Cliente falso: responde lo que le pidamos y guarda el pedido que recibió
const clienteFalso = (input, usage = { input_tokens: 1200, output_tokens: 800 }) => {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (pedido) => {
        pedidos.push(pedido);
        return {
          content: input === null ? [{ type: "text", text: "hola" }] : [{ type: "tool_use", id: "t1", name: "proponer_plan", input }],
          usage,
        };
      },
    },
  };
};

const leerFalso = async (ruta) => (String(ruta).includes("cerebro") ? "CEREBRO-DE-PRUEBA" : "REFERENCIAS-DE-PRUEBA");
const pedido = { semanaInicio: SEMANA, fase: "base", recursos: { producto: false, gente: false } };

test("un plan válido se acepta y informa cuántos tokens usó", async () => {
  const cliente = clienteFalso(planValido());
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
  assert.equal(r.plan.piezas.length, 1);
  assert.deepEqual(r.uso, { entrada: 1200, salida: 800 });
});

test("le exige a la IA el formato con la herramienta y le pasa la marca y las referencias", async () => {
  const cliente = clienteFalso(planValido());
  await planificarSemana(pedido, { cliente, leer: leerFalso });
  const enviado = cliente.pedidos[0];
  assert.deepEqual(enviado.tool_choice, { type: "tool", name: HERRAMIENTA_PLAN.name });
  assert.equal(enviado.tools[0].name, "proponer_plan");
  assert.match(enviado.system, /CEREBRO-DE-PRUEBA/);
  assert.match(enviado.system, /REFERENCIAS-DE-PRUEBA/);
  assert.match(enviado.messages[0].content, /2026-10-19/);
  assert.match(enviado.messages[0].content, /producto físico: no/);
});

test("el sistema lee los archivos reales de marca", async () => {
  const sistema = await construirSistema();
  assert.match(sistema, /Cerebro de marca/);
  assert.match(sistema, /Vanquish/);
});

test("si la respuesta no trae el plan en el formato esperado, se descarta", async () => {
  const r = await planificarSemana(pedido, { cliente: clienteFalso(null), leer: leerFalso });
  assert.equal(r.ok, false);
  assert.equal(r.plan, null);
  assert.match(r.errores[0], /formato esperado/);
});

test("un plan sin piezas o con campos que faltan se rechaza", () => {
  assert.equal(validarPlan({ resumen: "x", piezas: [] }, { semanaInicio: SEMANA }).ok, false);
  const sinGancho = validarPlan(planValido([piezaValida({ gancho: "" })]), { semanaInicio: SEMANA });
  assert.equal(sinGancho.ok, false);
  assert.match(sinGancho.errores.join(" "), /falta gancho/);
});

test("rechaza formato o pilar inventados y fechas fuera de la semana", () => {
  const { ok, errores } = validarPlan(
    planValido([piezaValida({ formato: "tiktok", pilar: "humor", fecha: "2026-10-30" })]),
    { semanaInicio: SEMANA }
  );
  assert.equal(ok, false);
  assert.match(errores.join(" "), /formato inválido/);
  assert.match(errores.join(" "), /pilar inválido/);
  assert.match(errores.join(" "), /fuera de la semana/);
});

test("rechaza una pieza que rompe las reglas de marca", () => {
  const { ok, errores } = validarPlan(
    planValido([piezaValida({ gancho: "Sin excusas, quemá grasa", cta: "Comprá ya" })]),
    { semanaInicio: SEMANA }
  );
  assert.equal(ok, false);
  assert.match(errores.join(" "), /motivación vacía/);
  assert.match(errores.join(" "), /promesa de resultados físicos/);
  assert.match(errores.join(" "), /anotarse en la lista/);
});

test("rechaza cifras que no están en los datos cargados", () => {
  const { ok, errores } = validarPlan(
    planValido([piezaValida({ epigrafe: "Probamos 5 straps hasta que cedan. Anotate en la lista." })]),
    { semanaInicio: SEMANA }
  );
  assert.equal(ok, false);
  assert.match(errores.join(" "), /cifra "5"/);
});

test("no deja mostrar producto ni gente si todavía no hay", () => {
  const sinProducto = validarPlan(planValido([piezaValida({ pilar: "producto en uso" })]), {
    semanaInicio: SEMANA,
    recursos: { producto: false },
  });
  assert.match(sinProducto.errores.join(" "), /todavía no hay producto/);

  const conProducto = validarPlan(planValido([piezaValida({ pilar: "producto en uso" })]), {
    semanaInicio: SEMANA,
    recursos: { producto: true },
  });
  assert.equal(conProducto.ok, true);

  const sinGente = validarPlan(planValido([piezaValida({ pilar: "gente que entrena" })]), { semanaInicio: SEMANA });
  assert.match(sinGente.errores.join(" "), /no hay personas confirmadas/);
});

test("rechaza más de 5 piezas en la semana", () => {
  const piezas = Array.from({ length: 6 }, () => piezaValida());
  const { ok, errores } = validarPlan(planValido(piezas), { semanaInicio: SEMANA });
  assert.equal(ok, false);
  assert.match(errores.join(" "), /más de 5 piezas/);
});

test("un plan inválido devuelve los errores y no entrega el plan", async () => {
  const cliente = clienteFalso(planValido([piezaValida({ gancho: "Sin excusas" })]));
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso });
  assert.equal(r.ok, false);
  assert.equal(r.plan, null);
  assert.ok(r.propuesta, "se conserva la propuesta para poder mirarla");
  assert.match(r.errores.join(" "), /motivación vacía/);
});

test("exige una fecha de inicio válida y un cliente", async () => {
  await assert.rejects(() => planificarSemana({ ...pedido, semanaInicio: "mañana" }, { cliente: clienteFalso({}) }), /AAAA-MM-DD/);
  await assert.rejects(() => planificarSemana(pedido, {}), /cliente/);
});
