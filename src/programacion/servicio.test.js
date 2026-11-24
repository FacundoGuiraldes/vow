import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CHAT, crearDia, crearEscenario, crearPlan } from "./ayuda-pruebas.js";

describe("flujo de la semana", () => {
  test("recibirPlan guarda el flujo, lo manda por Telegram y marca las novedades usadas", async () => {
    const e = crearEscenario();
    const id = await e.repo.agregarNovedad("Llegan las gorras");
    const r = await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearDia(), crearDia({ fecha: "2026-11-01", formato: "story", contenido: "Detrás de escena del taller, sin mostrar caras." })]), novedadesUsadas: [id] });
    assert.equal(r.publicaciones, 2);
    assert.equal(e.telegram.enviados.length, 1);
    assert.match(e.telegram.enviados[0].texto, /Flujo de la semana del lunes 26\/10/);
    assert.match(e.telegram.enviados[0].texto, /Reel/);
    const flujo = await e.servicio.leerFlujo("2026-10-26");
    assert.equal(flujo.dias.length, 2);
  });

  test("flujosVigentes trae esta semana y la próxima, con el nombre del día", async () => {
    const e = crearEscenario();
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan() });
    await e.servicio.recibirPlan({ semana: "2026-11-02", plan: crearPlan([crearDia({ fecha: "2026-11-06" })]) });
    await e.servicio.recibirPlan({ semana: "2026-11-09", plan: crearPlan([crearDia({ fecha: "2026-11-13" })]) });
    const vigentes = await e.servicio.flujosVigentes("2026-10-28");
    assert.deepEqual(vigentes.map((v) => v.semana), ["2026-10-26", "2026-11-02"]);
    assert.ok(vigentes[0].dias[0].dia);
  });

  test("avisarFalloDelPlan explica qué pasó", async () => {
    const e = crearEscenario();
    await e.servicio.avisarFalloDelPlan({ semana: "2026-10-26", error: "se cayó la IA" });
    assert.match(e.telegram.ultimo().texto, /No pude armar el flujo/);
    assert.match(e.telegram.ultimo().texto, /se cayó la IA/);
  });
});

describe("mensajes de Telegram", () => {
  test("/flujo devuelve el flujo vigente, o avisa que todavía no hay", async () => {
    const e = crearEscenario();
    await e.mandar(e.texto("/flujo"));
    assert.match(e.telegram.ultimo().texto, /Todavía no hay flujo/);
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan() });
    await e.mandar(e.texto("/flujo"));
    assert.match(e.telegram.ultimo().texto, /Flujo de la semana/);
  });

  test("sin IA, un mensaje queda como novedad", async () => {
    const e = crearEscenario();
    await e.mandar(e.texto("Cambiamos el proveedor de gorras"));
    assert.match(e.telegram.ultimo().texto, /Anotado/);
    assert.equal((await e.repo.novedadesRecientes(5))[0].texto, "Cambiamos el proveedor de gorras");
  });

  test("los archivos se rechazan con una explicación", async () => {
    const e = crearEscenario();
    await e.mandar({ message: { message_id: 1, chat: { id: CHAT }, video: { file_id: "v" } } });
    assert.match(e.telegram.ultimo().texto, /ya no recibe archivos/);
  });

  test("un chat desconocido se ignora, y /start le dice su id", async () => {
    const e = crearEscenario();
    const r = await e.mandar(e.texto("hola", { chat: 999 }));
    assert.equal(r.ignorada, true);
    await e.mandar(e.texto("/start", { chat: 999 }));
    assert.match(e.telegram.ultimo().texto, /999/);
  });
});

describe("chat con la IA", () => {
  const llmQueLlama = (nombre, argumentos, final = "Listo.") => ({
    async conversar({ ejecutar }) {
      const resultado = await ejecutar(nombre, argumentos);
      return resultado.error ? `Error: ${resultado.error}` : final;
    },
  });

  test("anotar_novedad guarda la novedad", async () => {
    const e = crearEscenario({ llm: llmQueLlama("anotar_novedad", { texto: "Nueva remera" }) });
    const r = await e.servicio.conversarDesdeJuego("anotá que hay remera nueva");
    assert.equal(r.ok, true);
    assert.equal((await e.repo.novedadesRecientes(5))[0].texto, "Nueva remera");
  });

  test("una herramienta que no existe devuelve error", async () => {
    const e = crearEscenario({ llm: llmQueLlama("publicar_historia", {}) });
    const r = await e.servicio.conversarDesdeJuego("publicá");
    assert.match(r.respuesta, /No existe la herramienta/);
  });

  test("sin IA configurada, el juego avisa", async () => {
    const e = crearEscenario();
    const r = await e.servicio.conversarDesdeJuego("hola");
    assert.equal(r.ok, false);
  });
});
