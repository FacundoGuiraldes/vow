import { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPool } from "../db/conexion.js";
import { SIN_BASE, pruebaConBase } from "../db/requiere-base.js";
import { migrar } from "../db/migrar.js";
import { crearApp, MENSAJE_EXITO, MENSAJE_INSTAGRAM_INVALIDO } from "./servidor.js";

const pool = SIN_BASE ? null : crearPool(); // sin base (en local) los tests se saltean
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

const leerRegistro = async (email) => {
  const { rows } = await pool.query("SELECT email, instagram, origen FROM lista_espera WHERE email = $1", [email]);
  return rows[0];
};

const contarRegistros = async (email) => {
  const { rows } = await pool.query("SELECT count(*)::int AS total FROM lista_espera WHERE email = $1", [email]);
  return rows[0].total;
};

before(async () => {
  if (SIN_BASE) return;
  await migrar(pool);
  servidor = await levantar(crearApp({ pool, origenesPermitidos: [], limitePorMinuto: 100 }));
});

after(async () => {
  if (SIN_BASE) return;
  if (emailsCreados.size > 0) {
    await pool.query("DELETE FROM lista_espera WHERE email = ANY($1)", [[...emailsCreados]]);
  }
  await cerrar(servidor);
  await pool.end();
});

pruebaConBase("rechaza un email con formato inválido", async () => {
  for (const email of ["no-es-un-email", "falta@dominio", "con espacio@vow.com", "@vow.com"]) {
    const r = await enviar(servidor, { email });
    assert.equal(r.status, 400, email);
    assert.equal(r.cuerpo.error, "El email no tiene un formato válido.");
  }
});

pruebaConBase("rechaza un email vacío o ausente", async () => {
  for (const cuerpo of [{ email: "" }, { email: "   " }, {}]) {
    const r = await enviar(servidor, cuerpo);
    assert.equal(r.status, 400);
    assert.equal(r.cuerpo.error, "Ingresá tu email.");
  }
});

pruebaConBase("rechaza un email de 254 caracteres o más", async () => {
  const email = `${"a".repeat(240)}@vow-pruebas.invalid`;
  const r = await enviar(servidor, { email });
  assert.equal(r.status, 400);
  assert.match(r.cuerpo.error, /menos de 254 caracteres/);
});

pruebaConBase("registra un email válido normalizado en minúsculas y sin espacios", async () => {
  const email = emailDePrueba();
  const r = await enviar(servidor, { email: `  ${email.toUpperCase()}  `, origen: "landing" });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.mensaje, MENSAJE_EXITO);

  const { rows } = await pool.query("SELECT email, origen FROM lista_espera WHERE email = $1", [email]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, email);
  assert.equal(rows[0].origen, "landing");
});

pruebaConBase("un email repetido responde 200 con el mismo mensaje y no se duplica", async () => {
  const email = emailDePrueba();
  const primera = await enviar(servidor, { email });
  const segunda = await enviar(servidor, { email: email.toUpperCase() });

  assert.equal(primera.status, 200);
  assert.equal(segunda.status, 200);
  assert.deepEqual(segunda.cuerpo, primera.cuerpo);
  assert.equal(await contarRegistros(email), 1);
});

pruebaConBase("limita a 5 pedidos por minuto por IP", async () => {
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

pruebaConBase("solo habilita CORS para los orígenes de ALLOWED_ORIGINS", async () => {
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

pruebaConBase("/api/salud responde 200 y no consulta la base", async () => {
  let consultas = 0;
  const poolEspia = {
    query: async () => {
      consultas += 1;
      throw new Error("no debería consultar la base");
    },
  };
  const instancia = await levantar(crearApp({ pool: poolEspia, origenesPermitidos: [] }));
  try {
    const respuesta = await fetch(`http://127.0.0.1:${instancia.address().port}/api/salud`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { ok: true });
    assert.equal(consultas, 0);
  } finally {
    await cerrar(instancia);
  }
});

pruebaConBase("con TRUST_PROXY=1 el límite por IP usa la IP de X-Forwarded-For", async () => {
  const anterior = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "1";
  const instancia = await levantar(crearApp({ pool, origenesPermitidos: [] }));
  try {
    const desde = (ip) => enviar(instancia, { email: "no-es-un-email" }, { "X-Forwarded-For": ip });

    for (let i = 0; i < 5; i++) {
      assert.equal((await desde("203.0.113.10")).status, 400);
    }
    assert.equal((await desde("203.0.113.10")).status, 429);
    assert.equal((await desde("203.0.113.20")).status, 400);
  } finally {
    await cerrar(instancia);
    if (anterior === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = anterior;
    }
  }
});

pruebaConBase("guarda un Instagram válido normalizado", async () => {
  const email = emailDePrueba();
  const r = await enviar(servidor, { email, instagram: "@Vow_AR ", origen: "landing" });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.mensaje, MENSAJE_EXITO);

  const registro = await leerRegistro(email);
  assert.equal(registro.instagram, "vow_ar");
  assert.equal(registro.origen, "landing");
});

pruebaConBase("sin Instagram guarda NULL y responde 200", async () => {
  for (const cuerpo of [{}, { instagram: "" }, { instagram: "   " }, { instagram: null }]) {
    const email = emailDePrueba();
    const r = await enviar(servidor, { email, ...cuerpo });
    assert.equal(r.status, 200);
    assert.equal((await leerRegistro(email)).instagram, null);
  }
});

pruebaConBase("rechaza un Instagram con espacios, caracteres raros o más de 30 caracteres", async () => {
  const invalidos = ["vow ar", "vow-ar", "vow!", "vów", "@", "a".repeat(31), 12345];
  for (const instagram of invalidos) {
    const email = emailDePrueba();
    const r = await enviar(servidor, { email, instagram });
    assert.equal(r.status, 400, String(instagram));
    assert.equal(r.cuerpo.error, MENSAJE_INSTAGRAM_INVALIDO);
    assert.equal(r.cuerpo.campo, "instagram");
    assert.equal(await contarRegistros(email), 0);
  }
});

pruebaConBase("un email repetido con otro Instagram no modifica el registro", async () => {
  const email = emailDePrueba();
  const primera = await enviar(servidor, { email, instagram: "primero" });
  const segunda = await enviar(servidor, { email, instagram: "segundo" });

  assert.equal(primera.status, 200);
  assert.equal(segunda.status, 200);
  assert.deepEqual(segunda.cuerpo, primera.cuerpo);
  assert.equal(await contarRegistros(email), 1);
  assert.equal((await leerRegistro(email)).instagram, "primero");
});
