import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { textoFlujoSemanal } from "./mensajes.js";

describe("textoFlujoSemanal", () => {
  const dias = [
    { fecha: "2026-10-31", formato: "story", contenido: "Detrás de escena del taller." },
    { fecha: "2026-10-28", formato: "reel", contenido: "Un plano continuo atándose el cordón." },
  ];

  test("lista los días en orden con formato y contenido, y nada más", () => {
    const texto = textoFlujoSemanal({ semana: "2026-10-26", dias });
    assert.match(texto, /^📅 Flujo de la semana del lunes 26\/10/);
    assert.ok(texto.indexOf("Un plano continuo") < texto.indexOf("Detrás de escena"));
    assert.match(texto, /Reel\n {2}Un plano continuo/);
    assert.match(texto, /Story\n {2}Detrás de escena/);
    assert.doesNotMatch(texto, /gancho|epígrafe|guion|aprobar/i);
  });

  test("no pasa el límite de Telegram", () => {
    const largo = Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-10-${26 + i}`, formato: "reel", contenido: "x".repeat(900) }));
    assert.ok(textoFlujoSemanal({ semana: "2026-10-26", dias: largo }).length < 4096);
  });
});
