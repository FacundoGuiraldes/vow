import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearDia, crearEscenario, crearPlan } from "./ayuda-pruebas.js";

describe("flujo de la semana", () => {
  test("recibirPlan guarda el flujo y marca las novedades usadas", async () => {
    const e = crearEscenario();
    await e.repo.agregarNovedad("Llegan las gorras");
    const [{ id }] = await e.repo.novedadesPendientes();
    const r = await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearDia(), crearDia({ fecha: "2026-11-01", formato: "story", contenido: "Detrás de escena del taller, sin mostrar caras." })]), novedadesUsadas: [id] });
    assert.equal(r.publicaciones, 2);
    assert.deepEqual(await e.repo.novedadesPendientes(), []);
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

  test("avisarFalloDelPlan guarda el motivo", async () => {
    const e = crearEscenario();
    await e.servicio.avisarFalloDelPlan({ semana: "2026-10-26", error: "se cayó la IA" });
    assert.equal((await e.repo.leerEstado("flujo-error:2026-10-26")).error, "se cayó la IA");
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
