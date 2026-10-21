import { describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ALTO, ANCHO, armarPedido, componer, crearGeneradorImagen, ErrorImagenIA, MODELO_CLOUDFLARE } from "./imagen-ia.js";

// Una imagen cualquiera, apaisada, como la que devolvería la IA
const imagenDePrueba = () => sharp({ create: { width: 1600, height: 900, channels: 3, background: "#8C8378" } }).png().toBuffer();
const respuesta = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
const conImagenCloudflare = async () => respuesta({ success: true, result: { image: (await imagenDePrueba()).toString("base64") }, errors: [] });
const conImagen = async () => respuesta({ candidates: [{ content: { parts: [{ text: "ok" }, { inlineData: { mimeType: "image/png", data: (await imagenDePrueba()).toString("base64") } }] } }] });

describe("imagen con IA", () => {
  test("el pedido arranca con la descripción y agrega el estilo, todo en positivo (sin prohibiciones ni ropa que desvíen a la IA)", () => {
    const pedido = armarPedido("  una mesa de madera con luz de ventana ");
    assert.ok(pedido.startsWith("una mesa de madera con luz de ventana."), "la descripción va primero");
    assert.match(pedido, /minimalista/);
    assert.match(pedido, /negro profundo, hueso y beige/);
    assert.doesNotMatch(pedido, /\b(no|sin|nunca|ni)\b/i, "FLUX no entiende negaciones: nombrar algo lo dibuja");
    assert.doesNotMatch(pedido, /ropa|entrenar|accesorios|marca/i, "no se le da un tema que compita con la descripción");
  });

  test("compone: recorta a 1080x1350 en JPEG y le pone el isotipo (el resultado cambia en la esquina)", async () => {
    const entrada = await imagenDePrueba();
    const salida = await componer(entrada);
    const meta = await sharp(salida).metadata();
    assert.deepEqual([meta.width, meta.height, meta.format], [ANCHO, ALTO, "jpeg"]);
    // Esquina inferior derecha (donde va el isotipo) vs. esquina inferior izquierda: la primera tiene que ser distinta del fondo liso
    // (stats() ignora los recortes que se le encadenan: hay que recortar primero a un buffer)
    const esquina = async (izquierda) => sharp(await sharp(salida).extract({ left: izquierda, top: ALTO - 200, width: 200, height: 200 }).toBuffer()).stats();
    const derecha = await esquina(ANCHO - 200);
    const izquierda = await esquina(0);
    assert.ok(derecha.channels[0].stdev > 5, "hay isotipo a la derecha");
    assert.ok(izquierda.channels[0].stdev < 2, "la izquierda queda lisa");
  });

  test("manda la clave en un encabezado (no en la dirección) y devuelve la imagen compuesta", async () => {
    const pedidos = [];
    const generador = crearGeneradorImagen({ proveedor: "gemini", apiKey: "clave-secreta", fetchFn: async (url, opciones) => { pedidos.push({ url, opciones }); return conImagen(); } });
    const imagen = await generador.generar({ descripcion: "un fondo negro" });
    assert.equal((await sharp(imagen).metadata()).height, ALTO);
    assert.ok(!pedidos[0].url.includes("clave-secreta"), "la clave no va en la dirección");
    assert.equal(pedidos[0].opciones.headers["x-goog-api-key"], "clave-secreta");
    assert.match(JSON.parse(pedidos[0].opciones.body).contents[0].parts[0].text, /un fondo negro/);
  });

  test("errores claros: sin clave, sin descripción, cupo agotado, descripción bloqueada, sin imagen, falla de red", async () => {
    const generar = (fetchFn, argumentos = { descripcion: "algo" }, apiKey = "k") => crearGeneradorImagen({ proveedor: "gemini", apiKey, fetchFn }).generar(argumentos);
    await assert.rejects(generar(conImagen, { descripcion: "algo" }, ""), /Falta GEMINI_API_KEY/);
    await assert.rejects(generar(conImagen, { descripcion: "  " }), /Falta la descripción/);
    await assert.rejects(generar(async () => respuesta({}, 429)), /plan gratis de Gemini no incluye imágenes/);
    await assert.rejects(generar(async () => respuesta({ promptFeedback: { blockReason: "SAFETY" } })), /no aceptó esa descripción/);
    await assert.rejects(generar(async () => respuesta({ candidates: [{ content: { parts: [{ text: "no puedo" }] } }] })), /no devolvió ninguna imagen/);
    await assert.rejects(generar(async () => { throw new Error("ECONNRESET k"); }), (error) => error instanceof ErrorImagenIA && !error.message.includes("ECONNRESET"));
    await assert.rejects(generar(async () => respuesta({ error: { message: "API key not valid" } }, 400)), /rechazó el pedido \(400/);
  });

  test("una imagen corrupta se explica en vez de romper", async () => {
    const corrupta = async () => respuesta({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("no soy una imagen").toString("base64") } }] } }] });
    await assert.rejects(crearGeneradorImagen({ proveedor: "gemini", apiKey: "k", fetchFn: corrupta }).generar({ descripcion: "algo" }), /no se pudo procesar/);
  });
});

describe("imagen con IA: Cloudflare (FLUX)", () => {
  const generador = (fetchFn, extra = {}) => crearGeneradorImagen({ proveedor: "cloudflare", accountId: "cuenta1", apiToken: "token-secreto", fetchFn, ...extra });

  test("llama al modelo FLUX de la cuenta con el token en el encabezado y devuelve la imagen compuesta", async () => {
    const pedidos = [];
    const imagen = await generador(async (url, opciones) => { pedidos.push({ url: String(url), opciones }); return conImagenCloudflare(); }).generar({ descripcion: "un fondo negro" });
    assert.deepEqual([(await sharp(imagen).metadata()).width, (await sharp(imagen).metadata()).height], [ANCHO, ALTO]);
    assert.equal(pedidos[0].url, `https://api.cloudflare.com/client/v4/accounts/cuenta1/ai/run/${MODELO_CLOUDFLARE}`);
    assert.equal(pedidos[0].opciones.headers.Authorization, "Bearer token-secreto");
    assert.ok(!pedidos[0].url.includes("token-secreto"));
    const cuerpo = JSON.parse(pedidos[0].opciones.body);
    assert.match(cuerpo.prompt, /un fondo negro/);
    assert.ok(cuerpo.prompt.length <= 2000 && cuerpo.steps <= 8, "respeta los máximos del modelo (prompt 2048, 8 pasos)");
  });

  test("un descripción larguísima se recorta para no pasar el máximo del modelo", async () => {
    let cuerpo;
    await generador(async (url, opciones) => { cuerpo = JSON.parse(opciones.body); return conImagenCloudflare(); }).generar({ descripcion: "x".repeat(5000) });
    assert.ok(cuerpo.prompt.length <= 2000);
  });

  test("errores claros: sin credenciales, token inválido, cupo del día, rechazo, sin imagen y red; sin filtrar el token", async () => {
    const pedir = (fetchFn, extra) => generador(fetchFn, extra).generar({ descripcion: "algo" });
    await assert.rejects(pedir(conImagenCloudflare, { accountId: "" }), /Faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN/);
    await assert.rejects(pedir(async () => respuesta({ success: false, errors: [{ message: "Authentication error" }] }, 403)), /no aceptó la clave \(403: Authentication error\).*Workers AI/);
    await assert.rejects(pedir(async () => respuesta({}, 429)), /cupo gratis de imágenes de hoy/);
    await assert.rejects(pedir(async () => respuesta({ success: false, errors: [{ message: "bad input" }] }, 400)), /rechazó el pedido \(400: bad input\)/);
    await assert.rejects(pedir(async () => respuesta({ success: true, result: {} })), /no devolvió ninguna imagen/);
    await assert.rejects(pedir(async () => { throw new Error("ECONNRESET token-secreto"); }), (error) => error instanceof ErrorImagenIA && !error.message.includes("token-secreto"));
  });
});
