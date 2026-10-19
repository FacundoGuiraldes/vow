import test from "node:test";
import assert from "node:assert/strict";
import { diasEntre, leerPiezasDefinidas, parsearPieza } from "./piezas-definidas.js";

const TEXTO = `# Carrusel · 27/10/2026 · pilar promesa

**Estado:** aprobado.

## Láminas
1. Cumplite a vos primero
2. Lo que firmás con vos no se rompe
3. Anotate en la lista de espera.

## Diseño
1. Esto no es una lámina
`;

test("lee formato, fecha, pilar y frases de una pieza (sin la invitación a la lista ni otras secciones)", () => {
  const p = parsearPieza("2026-10-27-carrusel-promesa.md", TEXTO);
  assert.equal(p.formato, "carrusel");
  assert.equal(p.fecha, "2026-10-27");
  assert.equal(p.pilar, "promesa");
  assert.deepEqual(p.frases, ["Cumplite a vos primero", "Lo que firmás con vos no se rompe"]);
});

test("un archivo sin el título esperado no rompe nada", () => {
  const p = parsearPieza("2026-10-27-x.md", "texto libre");
  assert.equal(p.formato, null);
  assert.equal(p.fecha, null);
  assert.deepEqual(p.frases, []);
});

test("lee solo los archivos con nombre de pieza y tolera errores", async () => {
  const listar = async () => ["README.md", "2026-10-27-carrusel-promesa.md", "2026-10-29-roto.md", "notas.txt"];
  const leer = async (ruta) => {
    if (String(ruta).includes("roto")) throw new Error("no se puede leer");
    return TEXTO;
  };
  const piezas = await leerPiezasDefinidas({ leer, listar });
  assert.equal(piezas.length, 1);
  assert.equal(piezas[0].nombre, "2026-10-27-carrusel-promesa.md");
  assert.deepEqual(await leerPiezasDefinidas({ listar: async () => { throw new Error("ENOENT"); } }), []);
});

test("cuenta los días entre fechas", () => {
  assert.equal(diasEntre("2026-10-27", "2026-10-28"), 1);
  assert.equal(diasEntre("2026-10-31", "2026-11-02"), 2);
  assert.equal(diasEntre("2026-10-28", "2026-10-27"), 1);
});
