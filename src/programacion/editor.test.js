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
  const cliente = clienteFalso(conPieza({ ...crearPieza({ gancho: "Entrená 5 días seguidos." }), que_cambio: "x" }));
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "poné un número", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /cifra/);
});

test("rechaza una hora fuera del rango de publicación", async () => {
  const cliente = clienteFalso(conPieza({ ...crearPieza(), hora: "07:30", que_cambio: "x" }));
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "a las 7:30", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /hora/);
});

test("rechaza una fecha que ya pasó", async () => {
  const cliente = clienteFalso(conPieza({ ...crearPieza({ fecha: "2026-10-20" }), que_cambio: "x" }));
  const r = await crearEditor({ cliente }).editarPieza({ fila: fila(), instruccion: "pasala al 20", hoy: "2026-10-26" });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /ya pasó/);
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
