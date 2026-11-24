import { test } from "node:test";
import assert from "node:assert/strict";
import { crearDocumentosOficina } from "./oficina-documentos.js";

test("los documentos se arman una vez y se guardan unos minutos", () => {
  let reloj = 1_000_000;
  let armados = 0;
  const armar = () => { armados++; return { D: { actualizado: "2026-10-19" } }; };
  const docs = crearDocumentosOficina({ directorio: "/tmp/vow-oficina-test", armar, ahora: () => reloj });
  assert.deepEqual(docs.documentos(), { D: { actualizado: "2026-10-19" } });
  docs.documentos();
  assert.equal(armados, 1);
  reloj += 11 * 60 * 1000;
  docs.documentos();
  assert.equal(armados, 2);
});

test("solo entrega D: ya no hay archivos de piezas", () => {
  const docs = crearDocumentosOficina({ directorio: "/tmp/vow-oficina-test", armar: () => ({ D: {}, MED: { piezas: {} } }) });
  assert.deepEqual(Object.keys(docs.documentos()), ["D"]);
  assert.equal(docs.archivo, undefined);
});
