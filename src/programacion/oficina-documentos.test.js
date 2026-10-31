import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearDocumentosOficina } from "./oficina-documentos.js";

function preparar({ ahora = () => 1_000_000 } = {}) {
  const directorio = mkdtempSync(join(tmpdir(), "docs-oficina-"));
  const armar = ({ destino }) => {
    mkdirSync(join(destino, "medios", "2026-10-19_carrusel"), { recursive: true });
    writeFileSync(join(destino, "medios", "2026-10-19_carrusel", "1.png"), "png");
    return { D: { actualizado: "2026-10-19", piezas: [{ titulo: "x" }] }, MED: { piezas: { "2026-10-19_carrusel": { imgs: ["medios/2026-10-19_carrusel/1.png"], md: "texto" } } } };
  };
  return crearDocumentosOficina({ secreto: "secreto-de-prueba", directorio, armar, ahora });
}
const partes = (url) => {
  const u = new URL(url, "http://x");
  const [, , , , , clave, archivo] = u.pathname.split("/");
  return [decodeURIComponent(clave), decodeURIComponent(archivo), u.searchParams.get("e"), u.searchParams.get("f")];
};

test("los archivos salen como enlaces firmados, no como rutas abiertas", () => {
  const { MED } = preparar().documentos();
  const [url] = MED.piezas["2026-10-19_carrusel"].imgs;
  assert.match(url, /^\/api\/programacion\/oficina\/medios\/2026-10-19_carrusel\/1\.png\?e=\d+&f=[a-f0-9]{64}$/);
  assert.equal(MED.piezas["2026-10-19_carrusel"].md, "texto");
});

test("el enlace firmado abre el archivo; sin firma, con otra firma o con otro archivo no", () => {
  const docs = preparar();
  const [clave, archivo, e, f] = partes(docs.documentos().MED.piezas["2026-10-19_carrusel"].imgs[0]);
  assert.ok(docs.archivo(clave, archivo, e, f));
  assert.equal(docs.archivo(clave, archivo, e, undefined), null);
  assert.equal(docs.archivo(clave, archivo, e, "0".repeat(64)), null);
  assert.equal(docs.archivo(clave, "2.png", e, f), null);
  assert.equal(docs.archivo(clave, archivo, Number(e) + 1, f), null);
});

test("el enlace vence", () => {
  let reloj = 1_000_000;
  const docs = preparar({ ahora: () => reloj });
  const [clave, archivo, e, f] = partes(docs.documentos().MED.piezas["2026-10-19_carrusel"].imgs[0]);
  reloj += 13 * 60 * 60 * 1000;
  assert.equal(docs.archivo(clave, archivo, e, f), null);
});

test("no se puede salir de la carpeta de medios", () => {
  const docs = preparar();
  assert.equal(docs.archivo("..", "datos.json", "9999999999999", "a".repeat(64)), null);
  assert.equal(docs.archivo("2026-10-19_carrusel", "../datos.json", "9999999999999", "a".repeat(64)), null);
  assert.equal(docs.archivo(".", "1.png", "9999999999999", "a".repeat(64)), null);
});
