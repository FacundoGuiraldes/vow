import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownDeOperacion, operacionVacia } from "../src/programacion/operacion.js";

test("la copia legible muestra lo cambiado, la agenda agregada y el historial, sin hora de generación", () => {
  const op = operacionVacia();
  op.campos["deposito.gorras"] = "Llegan | el 5/11";
  op.agenda.propias.a1 = { f: "2026-11-05", h: "10:00", sala: "deposito", t: "Retirar las gorras" };
  op.agenda.ocultas.push("2026-11-02|Llegan las medias");
  op.historial.push({ en: "2026-10-26T18:00:00.000Z", origen: "bot", texto: "Gorras: Llegan el 5/11" });
  const md = markdownDeOperacion(op);
  assert.match(md, /\| Gorras \(entrega y estado\) \| Llegan \/ el 5\/11 \|/);
  assert.match(md, /\| Medias \(entrega y estado\) \| _igual que los documentos_ \|/);
  assert.match(md, /- 2026-11-05 10:00 · deposito · Retirar las gorras/);
  assert.match(md, /2026-11-02 · Llegan las medias/);
  assert.match(md, /2026-10-26 18:00 UTC · bot · Gorras/);
  assert.equal(markdownDeOperacion(op), md, "mismo estado, mismo texto: no genera commits de más");
});
