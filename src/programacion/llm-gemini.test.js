import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearLLMGemini, ErrorLLM } from "./llm-gemini.js";

const respuesta = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
const texto = (t) => respuesta({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, finishReason: "STOP" }] });
const llamar = (name, args, extra = {}) => respuesta({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args }, ...extra }] } }] });

// fetch falso que contesta en orden y anota lo que le mandaron
function conRespuestas(...respuestas) {
  const pedidos = [];
  const fetchFn = async (url, opciones) => {
    pedidos.push({ url: String(url), opciones, cuerpo: JSON.parse(opciones.body) });
    const siguiente = respuestas.shift();
    return typeof siguiente === "function" ? siguiente() : siguiente;
  };
  return { fetchFn, pedidos };
}
const base = { sistema: "Sos un asistente.", historial: [{ rol: "usuario", texto: "hola" }], herramientas: [{ name: "ver_semana", description: "x" }] };

describe("cliente de Gemini para el chat", () => {
  test("una respuesta de texto: manda el sistema, la charla y las herramientas, con la clave en el encabezado", async () => {
    const { fetchFn, pedidos } = conRespuestas(texto("Hola, Facundo."));
    const llm = crearLLMGemini({ apiKey: "clave-secreta", fetchFn });
    const salida = await llm.conversar({ ...base, historial: [{ rol: "usuario", texto: "hola" }, { rol: "asistente", texto: "buenas" }, { rol: "usuario", texto: "¿qué hay hoy?" }], ejecutar: async () => ({}) });
    assert.equal(salida, "Hola, Facundo.");
    const { url, opciones, cuerpo } = pedidos[0];
    assert.ok(url.includes(":generateContent") && !url.includes("clave-secreta"));
    assert.equal(opciones.headers["x-goog-api-key"], "clave-secreta");
    assert.equal(cuerpo.systemInstruction.parts[0].text, "Sos un asistente.");
    assert.deepEqual(cuerpo.contents.map((c) => [c.role, c.parts[0].text]), [["user", "hola"], ["model", "buenas"], ["user", "¿qué hay hoy?"]]);
    assert.deepEqual(cuerpo.tools[0].functionDeclarations.map((f) => f.name), ["ver_semana"]);
  });

  test("ejecuta la herramienta que pide el modelo y le devuelve el resultado para que siga, reenviando su respuesta tal cual", async () => {
    const { fetchFn, pedidos } = conRespuestas(llamar("ver_semana", {}, { thoughtSignature: "firma-1" }), texto("Hay una pieza el jueves."));
    const ejecutadas = [];
    const salida = await crearLLMGemini({ apiKey: "k", fetchFn }).conversar({ ...base, ejecutar: async (nombre, args) => { ejecutadas.push([nombre, args]); return { piezas: [{ id: 7 }] }; } });
    assert.equal(salida, "Hay una pieza el jueves.");
    assert.deepEqual(ejecutadas, [["ver_semana", {}]]);
    const segundo = pedidos[1].cuerpo.contents;
    assert.equal(segundo.at(-2).parts[0].thoughtSignature, "firma-1", "se devuelve la respuesta del modelo sin tocarla");
    assert.deepEqual(segundo.at(-1), { role: "user", parts: [{ functionResponse: { name: "ver_semana", response: { piezas: [{ id: 7 }] } } }] });
  });

  test("si la herramienta falla, el modelo recibe el error en vez de romper la charla; las partes de 'pensamiento' no se muestran", async () => {
    const final = respuesta({ candidates: [{ content: { role: "model", parts: [{ text: "razonando…", thought: true }, { text: "No pude." }] }, finishReason: "STOP" }] });
    const { fetchFn, pedidos } = conRespuestas(llamar("ver_semana", {}), final);
    const salida = await crearLLMGemini({ apiKey: "k", fetchFn }).conversar({ ...base, ejecutar: async () => { throw new Error("base caída"); } });
    assert.equal(salida, "No pude.");
    assert.match(pedidos[1].cuerpo.contents.at(-1).parts[0].functionResponse.response.error, /base caída/);
  });

  test("corta si el modelo da vueltas sin terminar", async () => {
    const siempre = () => llamar("ver_semana", {});
    const { fetchFn } = conRespuestas(...Array.from({ length: 10 }, () => siempre));
    await assert.rejects(crearLLMGemini({ apiKey: "k", fetchFn, pasosMaximos: 3 }).conversar({ ...base, ejecutar: async () => ({}) }), /demasiadas vueltas/);
  });

  test("errores claros: sin clave, cupo, clave inválida, rechazo, bloqueo, sin respuesta y red; sin filtrar la clave", async () => {
    const pedir = (fetchFn, extra = {}) => crearLLMGemini({ apiKey: "clave-secreta", fetchFn, ...extra }).conversar({ ...base, ejecutar: async () => ({}) });
    await assert.rejects(pedir(async () => texto("x"), { apiKey: "" }), /Falta GEMINI_API_KEY/);
    await assert.rejects(pedir(async () => respuesta({}, 429)), /cupo gratis de la IA/);
    await assert.rejects(pedir(async () => respuesta({}, 403)), /no aceptó la clave de la IA \(403\)/);
    await assert.rejects(pedir(async () => respuesta({ error: { message: "model not found" } }, 404)), /rechazó el pedido \(404: model not found\)/);
    await assert.rejects(pedir(async () => respuesta({ promptFeedback: { blockReason: "SAFETY" } })), /no aceptó ese mensaje/);
    await assert.rejects(pedir(async () => respuesta({ candidates: [{ finishReason: "SAFETY" }] })), /no pudo responder a eso/);
    await assert.rejects(pedir(async () => respuesta({ candidates: [] })), /no devolvió ninguna respuesta/);
    await assert.rejects(pedir(async () => { throw new Error("ECONNRESET clave-secreta"); }), (e) => e instanceof ErrorLLM && !e.message.includes("clave-secreta"));
  });

  test("reintenta ante un 503 o un corte de red y después responde", async () => {
    const esperas = [];
    const { fetchFn, pedidos } = conRespuestas(respuesta({ error: { message: "overloaded" } }, 503), () => { throw new TypeError("fetch failed"); }, texto("Ya estoy."));
    const salida = await crearLLMGemini({ apiKey: "k", fetchFn, esperar: async (ms) => esperas.push(ms) }).conversar({ ...base, ejecutar: async () => ({}) });
    assert.equal(salida, "Ya estoy.");
    assert.equal(pedidos.length, 3);
    assert.equal(esperas.length, 2);
  });

  test("si sigue fallando después de los reintentos, avisa; un 429 no se reintenta", async () => {
    const a = conRespuestas(respuesta({}, 503), respuesta({}, 503), respuesta({}, 503));
    await assert.rejects(crearLLMGemini({ apiKey: "k", fetchFn: a.fetchFn, esperar: async () => {} }).conversar({ ...base, ejecutar: async () => ({}) }), ErrorLLM);
    assert.equal(a.pedidos.length, 3);
    const b = conRespuestas(respuesta({}, 429), texto("no"));
    await assert.rejects(crearLLMGemini({ apiKey: "k", fetchFn: b.fetchFn, esperar: async () => {} }).conversar({ ...base, ejecutar: async () => ({}) }), /cupo gratis/);
    assert.equal(b.pedidos.length, 1);
  });
});
