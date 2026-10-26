import { test } from "node:test";
import assert from "node:assert/strict";
import { crearEditor, HERRAMIENTA_EDICION } from "./editor.js";
import { crearPieza } from "./ayuda-pruebas.js";

const fila = (extra = {}) => ({ id: 1, fecha: "2026-10-30", hora: "19:00", estado: "aprobada", pieza: crearPieza(extra) });

// Cliente falso: devuelve en orden las respuestas que se le den y anota lo que se le pidió
function clienteFalso(...respuestas) {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (argumentos) => {
        pedidos.push(argumentos);
        return respuestas.shift();
      },
    },
  };
}
const conPieza = (input) => ({ stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: "tool_use", name: "actualizar_pieza", input }] });
const sinHerramienta = { stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: "listo" }] };

test("aplica el cambio pedido y devuelve la pieza completa, la hora y qué cambió", async () => {
  const cliente = clienteFalso(conPieza({ ...crearPieza({ gancho: "Cumplí sin avisar." }), hora: "20:30", que_cambio: "Cambié el gancho y la hora." }));
  const editor = crearEditor({ cliente });
  const r = await editor.editarPieza({ fila: fila(), instruccion: "cambiá el gancho y pasala a las 20:30", hoy: "2026-10-26" });

  assert.equal(r.ok, true, r.errores?.join("; "));
  assert.equal(r.pieza.gancho, "Cumplí sin avisar.");
  assert.equal(r.hora, "20:30");
  assert.equal(r.queCambio, "Cambié el gancho y la hora.");
  assert.deepEqual(r.uso, { entrada: 100, salida: 50 });

  const pedido = cliente.pedidos[0];
  assert.match(pedido.messages[0].content, /cambiá el gancho y pasala a las 20:30/);
  assert.match(pedido.messages[0].content, /Atate el compromiso\. Salí\./, "le pasa la pieza actual");
  assert.match(pedido.system, /AHORA NO ARMÁS UN PLAN/);
  assert.match(pedido.system, /CEREBRO DE MARCA/, "edita con las reglas de la marca delante");
  assert.deepEqual(pedido.tools.map((t) => t.name), ["actualizar_pieza"]);
});

test("rechaza una edición que rompe las reglas de marca (cifras que no están en los datos)", async () => {
  const mala = conPieza({ ...crearPieza({ gancho: "Entrená 5 días seguidos." }), que_cambio: "x" });
  const cliente = clienteFalso(mala, mala, mala);
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "poné un número", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /cifra/);
});

test("rechaza una hora fuera del rango de publicación", async () => {
  const mala = conPieza({ ...crearPieza(), hora: "07:30", que_cambio: "x" });
  const cliente = clienteFalso(mala, mala, mala);
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "a las 7:30", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /hora/);
});

test("rechaza una fecha que ya pasó", async () => {
  const mala = conPieza({ ...crearPieza({ fecha: "2026-10-20" }), que_cambio: "x" });
  const cliente = clienteFalso(mala, mala, mala);
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "pasala al 20", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /ya pasó/);
});

test("si la pieza no pasa las reglas, le devuelve los errores a la IA y acepta la versión corregida", async () => {
  const mala = { ...conPieza({ ...crearPieza({ gancho: "Entrená 5 días seguidos." }), que_cambio: "x" }) };
  mala.content[0].id = "tu_1";
  const cliente = clienteFalso(mala, conPieza({ ...crearPieza({ gancho: "Cumplí sin avisar." }), que_cambio: "Corregido." }));
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "poné un número", hoy: "2026-10-26" });
  assert.equal(r.ok, true, r.errores?.join("; "));
  assert.equal(r.pieza.gancho, "Cumplí sin avisar.");
  assert.equal(cliente.pedidos.length, 2);
  const devuelto = cliente.pedidos[1].messages.at(-1).content[0];
  assert.deepEqual([devuelto.type, devuelto.tool_use_id, devuelto.is_error], ["tool_result", "tu_1", true]);
  assert.match(devuelto.content, /cifra/);
});

test("si la IA no usa la herramienta, reintenta una vez y después avisa", async () => {
  const cliente = clienteFalso(sinHerramienta, sinHerramienta);
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "otro gancho", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores[0], /no devolvió la pieza/);
  assert.equal(cliente.pedidos.length, 2);
});

test("una respuesta cortada por el límite de tokens no se usa", async () => {
  const cortada = { ...conPieza({ ...crearPieza(), que_cambio: "x" }), stop_reason: "max_tokens" };
  const cliente = clienteFalso(cortada, conPieza({ ...crearPieza({ gancho: "Cumplí sin avisar." }), que_cambio: "ok" }));
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "otro gancho", hoy: "2026-10-26" });
  assert.equal(r.ok, true);
  assert.equal(cliente.pedidos.length, 2);
});

test("la herramienta pide la pieza completa más una frase de qué cambió", () => {
  const { required, properties } = HERRAMIENTA_EDICION.input_schema;
  for (const campo of ["fecha", "hora", "formato", "gancho", "epigrafe", "material_a_producir", "que_cambio"]) {
    assert.ok(required.includes(campo), `falta ${campo} en required`);
    assert.ok(properties[campo], `falta ${campo} en properties`);
  }
});

test("cada tool_use de la respuesta anterior recibe su tool_result, también si vino cortada o con dos herramientas", async () => {
  const cortada = { stop_reason: "max_tokens", usage: {}, content: [{ type: "tool_use", id: "tu_a", name: "actualizar_pieza", input: {} }] };
  const doble = { stop_reason: "tool_use", usage: {}, content: [{ type: "tool_use", id: "tu_b", name: "actualizar_pieza", input: { ...crearPieza({ gancho: "Entrená 5 días seguidos." }), que_cambio: "x" } }, { type: "tool_use", id: "tu_c", name: "otra", input: {} }] };
  const buena = conPieza({ ...crearPieza({ gancho: "Cumplí sin avisar." }), que_cambio: "ok" });
  const cliente = clienteFalso(cortada, doble, buena);
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "otro gancho", hoy: "2026-10-26" });
  assert.equal(r.ok, true, r.errores?.join("; "));
  // el arreglo de mensajes es el mismo en los tres pedidos: al final tiene toda la conversación
  const resultados = cliente.pedidos[2].messages.filter((m) => m.role === "user" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")).map((m) => m.content.map((b) => b.tool_use_id));
  assert.deepEqual(resultados, [["tu_a"], ["tu_b", "tu_c"]]);
});
