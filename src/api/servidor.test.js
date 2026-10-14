import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPool } from "../db/conexion.js";
import { migrar } from "../db/migrar.js";
import { crearApp, MENSAJE_EXITO } from "./servidor.js";

const pool = crearPool();
const emailsCreados = new Set();
let servidor;

const emailDePrueba = () => {
  const email = `prueba-${randomUUID()}@vow-pruebas.invalid`;
  emailsCreados.add(email);
  return email;
};

const levantar = (app) =>
  new Promise((resolver) => {
    const instancia = app.listen(0, "127.0.0.1", () => resolver(instancia));
  });

const cerrar = (instancia) =>
  new Promise((resolver) => {
    instancia.closeAllConnections();
    instancia.close(resolver);
  });

const urlDe = (instancia) => `http://127.0.0.1:${instancia.address().port}/api/lista-espera`;

const enviar = async (instancia, cuerpo, encabezados = {}) => {
  const respuesta = await fetch(urlDe(instancia), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...encabezados },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, headers: respuesta.headers, cuerpo: await respuesta.json() };
};

const contarRegistros = async (email) => {
  const { rows } = await pool.query("SELECT count(*)::int AS total FROM lista_espera WHERE email = $1", [email]);
  return rows[0].total;
};

before(async () => {
  await migrar(pool);
  servidor = await levantar(crearApp({ pool, origenesPermitidos: [], limitePorMinuto: 100 }));
});

after(async () => {
  if (emailsCreados.size > 0) {
    await pool.query("DELETE FROM lista_espera WHERE email = ANY($1)", [[...emailsCreados]]);
  }
  await cerrar(servidor);
  await pool.end();
});

test("rechaza un email con formato inválido", async () => {
  for (const email of ["no-es-un-email", "falta@dominio", "con espacio@vow.com", "@vow.com"]) {
    const r = await enviar(servidor, { email });
    assert.equal(r.status, 400, email);
    assert.equal(r.cuerpo.error, "El email no tiene un formato válido.");
  }
});

test("rechaza un email vacío o ausente", async () => {
  for (const cuerpo of [{ email: "" }, { email: "   " }, {}]) {
    const r = await enviar(servidor, cuerpo);
    assert.equal(r.status, 400);
    assert.equal(r.cuerpo.error, "Ingresá tu email.");
  }
});

test("rechaza un email de 254 caracteres o más", async () => {
  const email = `${"a".repeat(240)}@vow-pruebas.invalid`;
  const r = await enviar(servidor, { email });
  assert.equal(r.status, 400);
  assert.match(r.cuerpo.error, /menos de 254 caracteres/);
});

test("registra un email válido normalizado en minúsculas y sin espacios", async () => {
  const email = emailDePrueba();
  const r = await enviar(servidor, { email: `  ${email.toUpperCase()}  `, origen: "landing" });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.mensaje, MENSAJE_EXITO);

  const { rows } = await pool.query("SELECT email, origen FROM lista_espera WHERE email = $1", [email]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, email);
  assert.equal(rows[0].origen, "landing");
});

test("un email repetido responde 200 con el mismo mensaje y no se duplica", async () => {
  const email = emailDePrueba();
  const primera = await enviar(servidor, { email });
  const segunda = await enviar(servidor, { email: email.toUpperCase() });

  assert.equal(primera.status, 200);
  assert.equal(segunda.status, 200);
  assert.deepEqual(segunda.cuerpo, primera.cuerpo);
  assert.equal(await contarRegistros(email), 1);
});

test("limita a 5 pedidos por minuto por IP", async () => {
  const limitado = await levantar(crearApp({ pool, origenesPermitidos: [] }));
  try {
    for (let i = 0; i < 5; i++) {
      const r = await enviar(limitado, { email: "no-es-un-email" });
      assert.equal(r.status, 400);
    }
    const r = await enviar(limitado, { email: "no-es-un-email" });
    assert.equal(r.status, 429);
    assert.match(r.cuerpo.error, /Demasiados intentos/);
  } finally {
    await cerrar(limitado);
  }
});

test("solo habilita CORS para los orígenes de ALLOWED_ORIGINS", async () => {
  const conCors = await levantar(crearApp({ pool, origenesPermitidos: ["https://vow.test"] }));
  try {
    const permitido = await enviar(conCors, { email: "" }, { Origin: "https://vow.test" });
    assert.equal(permitido.headers.get("access-control-allow-origin"), "https://vow.test");

    const bloqueado = await enviar(conCors, { email: "" }, { Origin: "https://otro-sitio.test" });
    assert.equal(bloqueado.headers.get("access-control-allow-origin"), null);
  } finally {
    await cerrar(conCors);
  }
});
