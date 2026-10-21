import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { crearClienteMeta } from "./api.js";
import { crearHerramientas } from "./herramientas.js";
import { revisarTextoPublico, validarId, validarUrlPublica } from "./validaciones.js";

const TOKEN = "TOKEN-SECRETO-DE-PRUEBA";
const CUENTA = "17841400000000000";

// Meta falso: responde según "MÉTODO ruta" y guarda cada pedido para revisar qué se envió
function metaFalso(respuestas = {}) {
  const pedidos = [];
  const fetchFn = async (url, { method = "GET", body } = {}) => {
    const direccion = new URL(url);
    const ruta = direccion.pathname.replace(/^\/v[\d.]+\//, "");
    const params = Object.fromEntries(method === "GET" ? direccion.searchParams : new URLSearchParams(body));
    pedidos.push({ metodo: method, ruta, params, url: String(url) });
    const respuesta = respuestas[`${method} ${ruta}`];
    const cuerpo = typeof respuesta === "function" ? respuesta(params) : respuesta;
    if (cuerpo === undefined) return { ok: false, json: async () => ({ error: { code: 100, message: `sin respuesta para ${method} ${ruta}` } }) };
    return { ok: !cuerpo.error, json: async () => cuerpo };
  };
  return { fetchFn, pedidos };
}

const CUPO_LIBRE = { data: [{ quota_usage: 3, config: { quota_total: 100 } }] };
const EPIGRAFE_OK = "El voto se cumple cuando nadie te ve. Drop 01.";

function preparar({ respuestas = {}, permitirPublicar = true } = {}) {
  const falso = metaFalso({ [`GET ${CUENTA}/content_publishing_limit`]: CUPO_LIBRE, ...respuestas });
  const meta = crearClienteMeta({ token: TOKEN, idCuenta: CUENTA, fetchFn: falso.fetchFn });
  const herramientas = Object.fromEntries(crearHerramientas(meta, { permitirPublicar }).map((h) => [h.nombre, h]));
  return { ...falso, herramientas };
}

const texto = (resultado) => resultado.content[0].text;
const datos = (resultado) => JSON.parse(texto(resultado));

test("expone las 7 herramientas, con lectura y escritura bien marcadas", () => {
  const { herramientas } = preparar();
  assert.deepEqual(Object.keys(herramientas), [
    "perfil", "publicaciones", "metricas_publicacion", "comentarios", "preparar_publicacion", "publicar", "responder_comentario",
  ]);
  for (const nombre of ["perfil", "publicaciones", "metricas_publicacion", "comentarios"]) {
    assert.equal(herramientas[nombre].anotaciones.readOnlyHint, true, nombre);
  }
  for (const nombre of ["preparar_publicacion", "publicar", "responder_comentario"]) {
    assert.equal(herramientas[nombre].anotaciones.readOnlyHint, false, nombre);
  }
});

test("perfil pide los campos de la cuenta propia", async () => {
  const { herramientas, pedidos } = preparar({
    respuestas: { [`GET ${CUENTA}`]: { username: "vow_ar", followers_count: 120, media_count: 9 } },
  });
  const r = await herramientas.perfil.manejar();
  assert.equal(r.isError, undefined);
  assert.equal(datos(r).username, "vow_ar");
  assert.match(pedidos[0].params.fields, /followers_count/);
  assert.match(pedidos[0].url, /graph\.facebook\.com\/v26\.0\//);
});

test("métricas devuelve un valor por métrica, sin la deprecada impressions", async () => {
  const { herramientas, pedidos } = preparar({
    respuestas: {
      "GET 111/insights": { data: [{ name: "reach", values: [{ value: 40 }] }, { name: "saved", values: [{ value: 3 }] }] },
    },
  });
  const r = await herramientas.metricas_publicacion.manejar({ publicacion: "111" });
  assert.deepEqual(datos(r), { reach: 40, saved: 3 });
  assert.doesNotMatch(pedidos[0].params.metric, /impressions/);
});

test("rechaza IDs que podrían armar otra ruta de la API, sin llamar a Meta", async () => {
  const { herramientas, pedidos } = preparar();
  for (const malo of ["123/../456", "abc", "", "1 2"]) {
    const r = await herramientas.metricas_publicacion.manejar({ publicacion: malo });
    assert.equal(r.isError, true, malo);
  }
  assert.equal(pedidos.length, 0);
  assert.throws(() => validarId("12a"), /inválido/);
});

test("los errores de Meta se explican y nunca muestran el token", async () => {
  const vencido = preparar({ respuestas: { [`GET ${CUENTA}`]: { error: { code: 190, message: "Token expired" } } } });
  const r1 = await vencido.herramientas.perfil.manejar();
  assert.equal(r1.isError, true);
  assert.match(texto(r1), /token venció/i);

  const sinRed = crearHerramientas(
    crearClienteMeta({ token: TOKEN, idCuenta: CUENTA, fetchFn: async (url) => { throw new Error(`falló ${url}`); } })
  )[0];
  const r2 = await sinRed.manejar();
  assert.match(texto(r2), /No se pudo conectar/);
  assert.doesNotMatch(texto(r2), new RegExp(TOKEN));
});

test("sin token ni ID de cuenta, avisa qué falta en el .env", async () => {
  const [perfil] = crearHerramientas(crearClienteMeta({ fetchFn: async () => assert.fail("no tenía que llamar a Meta") }));
  assert.match(texto(await perfil.manejar()), /INSTAGRAM_TOKEN/);
});

test("con la escritura apagada, preparar, publicar y responder se niegan sin llamar a Meta", async () => {
  const { herramientas, pedidos } = preparar({ permitirPublicar: false });
  const intentos = [
    herramientas.preparar_publicacion.manejar({ tipo: "imagen", urls: ["https://vow-17x.pages.dev/a.jpg"], epigrafe: EPIGRAFE_OK }),
    herramientas.publicar.manejar({ contenedor: "999", confirmar: true }),
    herramientas.responder_comentario.manejar({ comentario: "555", mensaje: "Gracias por estar.", confirmar: true }),
  ];
  for (const r of await Promise.all(intentos)) {
    assert.equal(r.isError, true);
    assert.match(texto(r), /INSTAGRAM_PERMITIR_PUBLICAR=1/);
  }
  assert.equal(pedidos.length, 0);
});

test("un epígrafe que rompe las reglas de la marca no llega a Meta", async () => {
  const { herramientas, pedidos } = preparar();
  const r = await herramientas.preparar_publicacion.manejar({
    tipo: "imagen",
    urls: ["https://vow-17x.pages.dev/a.jpg"],
    epigrafe: "Últimas unidades a 25000, sin excusas",
  });
  assert.equal(r.isError, true);
  assert.match(texto(r), /urgencia falsa/);
  assert.match(texto(r), /motivación vacía/);
  assert.match(texto(r), /cifra que no está en los datos \("25000"\)/);
  assert.equal(pedidos.length, 0);
});

test("valida textos largos, hashtags de más y direcciones que Meta no puede descargar", () => {
  assert.match(revisarTextoPublico("a ".repeat(1200)).join(), /2200/);
  assert.match(revisarTextoPublico(Array.from({ length: 31 }, (_, i) => `#vow${"x".repeat(i)}`).join(" ")).join(), /31 hashtags/);
  assert.deepEqual(revisarTextoPublico(EPIGRAFE_OK), []);
  for (const mala of ["http://vow-17x.pages.dev/a.jpg", "https://localhost/a.jpg", "https://192.168.0.2/a.jpg", "no es url"]) {
    assert.throws(() => validarUrlPublica(mala), undefined, mala);
  }
});

test("preparar una imagen chequea el cupo y crea el contenedor, sin publicar", async () => {
  const { herramientas, pedidos } = preparar({
    respuestas: { [`POST ${CUENTA}/media`]: { id: "777" }, "GET 777": { status_code: "FINISHED" } },
  });
  const r = await herramientas.preparar_publicacion.manejar({
    tipo: "imagen",
    urls: ["https://vow-17x.pages.dev/img/a.jpg"],
    epigrafe: EPIGRAFE_OK,
  });
  assert.equal(r.isError, undefined, texto(r));
  assert.equal(datos(r).contenedor, "777");
  assert.equal(datos(r).estado, "FINISHED");
  assert.deepEqual(pedidos.map((p) => `${p.metodo} ${p.ruta}`), [
    `GET ${CUENTA}/content_publishing_limit`, `POST ${CUENTA}/media`, "GET 777",
  ]);
  const creacion = pedidos[1];
  assert.equal(creacion.params.image_url, "https://vow-17x.pages.dev/img/a.jpg");
  assert.equal(creacion.params.caption, EPIGRAFE_OK);
  assert.doesNotMatch(creacion.url, new RegExp(TOKEN), "en POST el token va en el cuerpo, no en la dirección");
  assert.ok(!pedidos.some((p) => p.ruta.endsWith("media_publish")));
});

test("preparar un carrusel crea cada imagen como ítem y después el contenedor del carrusel", async () => {
  let n = 0;
  const { herramientas, pedidos } = preparar({
    respuestas: { [`POST ${CUENTA}/media`]: () => ({ id: String(++n) }), "GET 3": { status_code: "FINISHED" } },
  });
  const urls = ["https://vow-17x.pages.dev/1.jpg", "https://vow-17x.pages.dev/2.jpg"];
  const r = await herramientas.preparar_publicacion.manejar({ tipo: "carrusel", urls, epigrafe: EPIGRAFE_OK });
  assert.equal(datos(r).contenedor, "3");
  const creaciones = pedidos.filter((p) => p.metodo === "POST").map((p) => p.params);
  assert.deepEqual(creaciones.slice(0, 2).map((c) => c.is_carousel_item), ["true", "true"]);
  assert.equal(creaciones[2].media_type, "CAROUSEL");
  assert.equal(creaciones[2].children, "1,2");

  const corto = await herramientas.preparar_publicacion.manejar({ tipo: "carrusel", urls: urls.slice(0, 1), epigrafe: EPIGRAFE_OK });
  assert.match(texto(corto), /de 2 a 20/);
});

test("con el cupo diario agotado no se crea nada", async () => {
  const { herramientas, pedidos } = preparar({
    respuestas: { [`GET ${CUENTA}/content_publishing_limit`]: { data: [{ quota_usage: 100, config: { quota_total: 100 } }] } },
  });
  const r = await herramientas.preparar_publicacion.manejar({ tipo: "imagen", urls: ["https://vow-17x.pages.dev/a.jpg"], epigrafe: EPIGRAFE_OK });
  assert.match(texto(r), /cupo/);
  assert.ok(!pedidos.some((p) => p.metodo === "POST"));
});

test("publicar solo publica un contenedor listo y devuelve el link", async () => {
  const procesando = preparar({ respuestas: { "GET 777": { status_code: "IN_PROGRESS" } } });
  const r1 = await procesando.herramientas.publicar.manejar({ contenedor: "777", confirmar: true });
  assert.match(texto(r1), /un minuto/);
  assert.ok(!procesando.pedidos.some((p) => p.metodo === "POST"));

  const listo = preparar({
    respuestas: {
      "GET 777": { status_code: "FINISHED" },
      [`POST ${CUENTA}/media_publish`]: { id: "888" },
      "GET 888": { permalink: "https://www.instagram.com/p/abc/" },
    },
  });
  const r2 = await listo.herramientas.publicar.manejar({ contenedor: "777", confirmar: true });
  assert.deepEqual(datos(r2), { id: "888", permalink: "https://www.instagram.com/p/abc/" });
  assert.equal(listo.pedidos.find((p) => p.ruta.endsWith("media_publish")).params.creation_id, "777");
});

test("publicar y responder exigen confirmar: true", async () => {
  const { herramientas, pedidos } = preparar();
  assert.match(texto(await herramientas.publicar.manejar({ contenedor: "777" })), /confirmar/);
  assert.match(texto(await herramientas.responder_comentario.manejar({ comentario: "5", mensaje: "Gracias." })), /confirmar/);
  assert.equal(pedidos.length, 0);
});

test("responder un comentario pasa por las reglas de la marca", async () => {
  const { herramientas, pedidos } = preparar({ respuestas: { "POST 555/replies": { id: "666" } } });
  const mala = await herramientas.responder_comentario.manejar({ comentario: "555", mensaje: "¿Tú quieres más info?", confirmar: true });
  assert.match(texto(mala), /voseo/);
  assert.equal(pedidos.length, 0);

  const buena = await herramientas.responder_comentario.manejar({ comentario: "555", mensaje: "Gracias por estar. Se viene el Drop 01.", confirmar: true });
  assert.deepEqual(datos(buena), { respuesta: "666" });
  assert.equal(pedidos[0].params.message, "Gracias por estar. Se viene el Drop 01.");
});

test("el servidor arranca por stdio sin token y lista las herramientas, sin ensuciar stdout", async () => {
  const servidor = fileURLToPath(new URL("./servidor.js", import.meta.url));
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [servidor],
    env: { PATH: process.env.PATH, INSTAGRAM_TOKEN: "", INSTAGRAM_USER_ID: "" },
    stderr: "pipe",
  });
  const cliente = new Client({ name: "prueba", version: "1.0.0" });
  try {
    await cliente.connect(transporte);
    const { tools } = await cliente.listTools();
    assert.equal(tools.length, 7);
    const publicar = tools.find((t) => t.name === "publicar");
    assert.deepEqual(publicar.inputSchema.required?.sort(), ["confirmar", "contenedor"]);
    const r = await cliente.callTool({ name: "perfil", arguments: {} });
    assert.equal(r.isError, true);
  } finally {
    await cliente.close();
  }
});

