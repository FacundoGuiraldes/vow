import { test } from "node:test";
import assert from "node:assert/strict";
import { construirProgramacion } from "./construir.js";

const BASE = { PROGRAMACION_SECRETO: "p".repeat(20), URL_PUBLICA: "https://vow.example.com" };
const construir = (extra = {}) => construirProgramacion({ pool: {}, env: { ...BASE, ...extra } });

test("sin alguna variable obligatoria no monta nada y dice cuáles faltan", async () => {
  const { router, faltan } = await construirProgramacion({ pool: {}, env: { ...BASE, URL_PUBLICA: "" } });
  assert.equal(router, null);
  assert.deepEqual(faltan, ["URL_PUBLICA"]);
});

test("el chat con la IA se activa solo con GEMINI_API_KEY", async () => {
  assert.equal((await construir()).chatConIA, false);
  assert.equal((await construir({ GEMINI_API_KEY: "clave" })).chatConIA, true);
});
