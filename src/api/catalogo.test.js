import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { crearPool } from "../db/conexion.js";
import { migrar } from "../db/migrar.js";
import { seedCatalogo } from "../db/seed-catalogo.js";
import { drop01 } from "../data/drop-01.js";
import { crearApp } from "./servidor.js";

const CAMPOS_PUBLICOS = [
  "categoria",
  "colores",
  "descripcion",
  "destacado",
  "drop_numero",
  "estado",
  "imagen",
  "nombre",
  "numero",
  "slug",
];
const CAMPOS_PROHIBIDOS = /^(id|precio|price|stock|material|gramaje|medidas?|costo)/i;

const pool = crearPool();
let servidor;

const levantar = (app) =>
  new Promise((resolver) => {
    const instancia = app.listen(0, "127.0.0.1", () => resolver(instancia));
  });

const cerrar = (instancia) =>
  new Promise((resolver) => {
    instancia.closeAllConnections();
    instancia.close(resolver);
  });

const pedir = async (ruta) => {
  const respuesta = await fetch(`http://127.0.0.1:${servidor.address().port}${ruta}`);
  return { status: respuesta.status, headers: respuesta.headers, cuerpo: await respuesta.json() };
};

before(async () => {
  await migrar(pool);
  await seedCatalogo(pool);
  servidor = await levantar(crearApp({ pool, origenesPermitidos: [], limiteCatalogoPorMinuto: 1000 }));
});

after(async () => {
  await cerrar(servidor);
  await pool.end();
});

test("la lista devuelve los 7 productos ordenados por número", async () => {
  const r = await pedir("/api/productos");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=300");
  assert.equal(r.cuerpo.productos.length, 7);
  assert.deepEqual(
    r.cuerpo.productos.map((p) => p.numero),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.deepEqual(
    r.cuerpo.productos.map((p) => p.slug),
    drop01.map((p) => p.slug)
  );
});

test("?drop=1 filtra por drop", async () => {
  const uno = await pedir("/api/productos?drop=1");
  assert.equal(uno.status, 200);
  assert.equal(uno.cuerpo.productos.length, 7);
  assert.ok(uno.cuerpo.productos.every((p) => p.drop_numero === 1));

  const otro = await pedir("/api/productos?drop=999");
  assert.equal(otro.status, 200);
  assert.deepEqual(otro.cuerpo.productos, []);
});

test("?drop inválido responde 400", async () => {
  for (const valor of ["abc", "0", "-1", "1.5", ""]) {
    const r = await pedir(`/api/productos?drop=${valor}`);
    assert.equal(r.status, 400, valor);
    assert.equal(r.cuerpo.error, "El parámetro drop tiene que ser un número entero positivo.");
  }
  const repetido = await pedir("/api/productos?drop=1&drop=2");
  assert.equal(repetido.status, 400);
});

test("el detalle por slug devuelve el producto", async () => {
  const r = await pedir("/api/productos/hoodie-oversize");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=300");
  assert.equal(r.cuerpo.producto.nombre, "Hoodie oversize");
  assert.equal(r.cuerpo.producto.numero, 2);
  assert.deepEqual(r.cuerpo.producto.colores, ["beige", "negro", "gris topo"]);
});

test("un slug inexistente responde 404", async () => {
  const r = await pedir("/api/productos/producto-que-no-existe");
  assert.equal(r.status, 404);
  assert.equal(r.cuerpo.error, "Producto no encontrado");
});

test("un slug con caracteres inválidos responde 400", async () => {
  for (const slug of ["Remera-Oversize", "remera_oversize", "remera%20oversize", "remera%27--", "a".repeat(61)]) {
    const r = await pedir(`/api/productos/${slug}`);
    assert.equal(r.status, 400, slug);
    assert.match(r.cuerpo.error, /identificador del producto/);
  }
});

test("la respuesta no incluye id ni campos de precio, stock o material", async () => {
  const lista = await pedir("/api/productos");
  const detalle = await pedir("/api/productos/remera-oversize");
  for (const producto of [...lista.cuerpo.productos, detalle.cuerpo.producto]) {
    assert.deepEqual(Object.keys(producto).sort(), CAMPOS_PUBLICOS);
    assert.ok(Object.keys(producto).every((campo) => !CAMPOS_PROHIBIDOS.test(campo)));
  }
});

test("todos los productos están en estado concepto y sin imagen", async () => {
  const r = await pedir("/api/productos?drop=1");
  for (const producto of r.cuerpo.productos) {
    assert.equal(producto.estado, "concepto", producto.slug);
    assert.equal(producto.imagen, null, producto.slug);
  }
});

test("correr el seed dos veces no duplica productos", async () => {
  await seedCatalogo(pool);
  await seedCatalogo(pool);
  const { rows } = await pool.query(
    "SELECT slug, count(*)::int AS total FROM productos WHERE slug = ANY($1) GROUP BY slug",
    [drop01.map((p) => p.slug)]
  );
  assert.equal(rows.length, 7);
  assert.ok(rows.every((fila) => fila.total === 1));

  const total = await pool.query("SELECT count(*)::int AS total FROM productos WHERE drop_numero = 1");
  assert.equal(total.rows[0].total, 7);
});
