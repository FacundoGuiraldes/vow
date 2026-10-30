import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { clasificarComentario, triarComentarios } from "./triaje-comentarios.js";

describe("triaje de comentarios", () => {
  test("una consulta de compra es lo primero", () => {
    for (const t of ["¿Cuánto sale la gorra?", "Hacen envíos a Córdoba?", "cuándo sale el Drop 01", "¿Hay stock del shaker negro?", "Cómo compro?"]) assert.equal(clasificarComentario(t), "consulta", t);
  });

  test("una pregunta que no es de compra, un aporte largo, un elogio y el spam", () => {
    assert.equal(clasificarComentario("¿Qué rutina hacés vos?"), "pregunta");
    assert.equal(clasificarComentario("Entreno hace tres años y lo que más me costó fue sostener la constancia cuando cambió mi trabajo, pero armé una rutina corta que me salvó el mes entero y por eso me gusta cómo lo plantean"), "aporte");
    assert.equal(clasificarComentario("Qué lindo 🔥"), "apoyo");
    assert.equal(clasificarComentario("🔥🔥🔥"), "apoyo");
    assert.equal(clasificarComentario("ganá dinero desde casa https://spam.com"), "ruido");
    assert.equal(clasificarComentario(""), "ruido");
  });

  test("ordena de lo más urgente a lo menos y cuenta por categoría sin tocar los datos", () => {
    const entrada = [{ id: "1", text: "🔥" }, { id: "2", text: "¿Cuánto sale?" }, { id: "3", text: "¿Qué entrenás?" }];
    const copia = structuredClone(entrada);
    const r = triarComentarios(entrada);
    assert.deepEqual(r.comentarios.map((c) => c.id), ["2", "3", "1"]);
    assert.deepEqual(r.conteo, { consulta: 1, pregunta: 1, aporte: 0, apoyo: 1, ruido: 0 });
    assert.deepEqual(entrada, copia);
    assert.deepEqual(triarComentarios(null).comentarios, []);
  });
});
