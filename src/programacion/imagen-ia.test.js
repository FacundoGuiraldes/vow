import { describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ALTO, ANCHO, armarPedido, componer, crearGeneradorImagen, ErrorImagenIA } from "./imagen-ia.js";

// Una imagen cualquiera, apaisada, como la que devolvería la IA
const imagenDePrueba = () => sharp({ create: { width: 1600, height: 900, channels: 3, background: "#8C8378" } }).png().toBuffer();
const respuesta = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
const conImagen = async () => respuesta({ candidates: [{ content: { parts: [{ text: "ok" }, { inlineData: { mimeType: "image/png", data: (await imagenDePrueba()).toString("base64") } }] } }] });

describe("imagen con IA", () => {
  test("el pedido lleva el estilo de VOW y le prohíbe a la IA dibujar texto o logos", () => {
    const pedido = armarPedido("  una mesa de madera con luz de ventana ");
    assert.match(pedido, /VOW/);
    assert.match(pedido, /NO incluyas texto/);
    assert.match(pedido, /#0A0A0A/);
    assert.match(pedido, /una mesa de madera con luz de ventana$/);
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
    const generador = crearGeneradorImagen({ apiKey: "clave-secreta", fetchFn: async (url, opciones) => { pedidos.push({ url, opciones }); return conImagen(); } });
    const imagen = await generador.generar({ descripcion: "un fondo negro" });
    assert.equal((await sharp(imagen).metadata()).height, ALTO);
    assert.ok(!pedidos[0].url.includes("clave-secreta"), "la clave no va en la dirección");
    assert.equal(pedidos[0].opciones.headers["x-goog-api-key"], "clave-secreta");
    assert.match(JSON.parse(pedidos[0].opciones.body).contents[0].parts[0].text, /un fondo negro/);
  });

  test("errores claros: sin clave, sin descripción, cupo agotado, descripción bloqueada, sin imagen, falla de red", async () => {
    const generar = (fetchFn, argumentos = { descripcion: "algo" }, apiKey = "k") => crearGeneradorImagen({ apiKey, fetchFn }).generar(argumentos);
    await assert.rejects(generar(conImagen, { descripcion: "algo" }, ""), /Falta GEMINI_API_KEY/);
    await assert.rejects(generar(conImagen, { descripcion: "  " }), /Falta la descripción/);
    await assert.rejects(generar(async () => respuesta({}, 429)), /cupo gratis/);
    await assert.rejects(generar(async () => respuesta({ promptFeedback: { blockReason: "SAFETY" } })), /no aceptó esa descripción/);
    await assert.rejects(generar(async () => respuesta({ candidates: [{ content: { parts: [{ text: "no puedo" }] } }] })), /no devolvió ninguna imagen/);
    await assert.rejects(generar(async () => { throw new Error("ECONNRESET k"); }), (error) => error instanceof ErrorImagenIA && !error.message.includes("ECONNRESET"));
    await assert.rejects(generar(async () => respuesta({ error: { message: "API key not valid" } }, 400)), /rechazó el pedido \(400/);
  });

  test("una imagen corrupta se explica en vez de romper", async () => {
    const corrupta = async () => respuesta({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("no soy una imagen").toString("base64") } }] } }] });
    await assert.rejects(crearGeneradorImagen({ apiKey: "k", fetchFn: corrupta }).generar({ descripcion: "algo" }), /no se pudo procesar/);
  });
});
