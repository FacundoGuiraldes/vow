import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { crearClienteMeta } from "./api.js";
import { crearHerramientas } from "./herramientas.js";
import { revisarTextoPublico, validarId } from "./validaciones.js";

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

const EPIGRAFE_OK = "El voto se cumple cuando nadie te ve. Drop 01.";

function preparar({ respuestas = {} } = {}) {
  const falso = metaFalso(respuestas);
  const meta = crearClienteMeta({ token: TOKEN, idCuenta: CUENTA, fetchFn: falso.fetchFn });
  const herramientas = Object.fromEntries(crearHerramientas(meta).map((h) => [h.nombre, h]));
  return { ...falso, herramientas };
}

const texto = (resultado) => resultado.content[0].text;
const datos = (resultado) => JSON.parse(texto(resultado));

test("expone solo lectura y responder comentarios, sin nada para publicar", () => {
  const { herramientas } = preparar();
  assert.deepEqual(Object.keys(herramientas), [
    "perfil", "publicaciones", "metricas_publicacion", "comentarios", "responder_comentario",
  ]);
  for (const nombre of ["perfil", "publicaciones", "metricas_publicacion", "comentarios"]) {
    assert.equal(herramientas[nombre].anotaciones.readOnlyHint, true, nombre);
  }
  assert.equal(herramientas.responder_comentario.anotaciones.readOnlyHint, false);
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

test("valida textos largos y hashtags de más", () => {
  assert.match(revisarTextoPublico("a ".repeat(1200)).join(), /2200/);
  assert.match(revisarTextoPublico(Array.from({ length: 31 }, (_, i) => `#vow${"x".repeat(i)}`).join(" ")).join(), /31 hashtags/);
  assert.deepEqual(revisarTextoPublico(EPIGRAFE_OK), []);
});

test("responder exige confirmar: true", async () => {
  const { herramientas, pedidos } = preparar();
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
    assert.deepEqual(tools.map((t) => t.name).sort(), ["comentarios", "metricas_publicacion", "perfil", "publicaciones", "responder_comentario"]);
    const responder = tools.find((t) => t.name === "responder_comentario");
    assert.deepEqual(responder.inputSchema.required?.sort(), ["comentario", "confirmar", "mensaje"]);
    const r = await cliente.callTool({ name: "perfil", arguments: {} });
    assert.equal(r.isError, true);
  } finally {
    await cliente.close();
  }
});

