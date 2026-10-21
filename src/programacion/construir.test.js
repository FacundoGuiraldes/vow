import { test } from "node:test";
import assert from "node:assert/strict";
import { construirProgramacion } from "./construir.js";

const BASE = { TELEGRAM_TOKEN: "t", TELEGRAM_CHAT_ID: "1", TELEGRAM_WEBHOOK_SECRETO: "s".repeat(20), PROGRAMACION_SECRETO: "p".repeat(20), URL_PUBLICA: "https://vow.example.com" };
const construir = (extra = {}) => construirProgramacion({ pool: {}, env: { ...BASE, ...extra } });

test("sin alguna variable obligatoria no monta nada y dice cuáles faltan", async () => {
  const { router, faltan } = await construirProgramacion({ pool: {}, env: { ...BASE, TELEGRAM_CHAT_ID: "" } });
  assert.equal(router, null);
  assert.deepEqual(faltan, ["TELEGRAM_CHAT_ID"]);
});

test("las imágenes con IA se activan solo con credenciales completas; Cloudflare tiene prioridad sobre Gemini", async () => {
  assert.equal((await construir()).imagenesConIA, false);
  assert.equal((await construir({ CLOUDFLARE_ACCOUNT_ID: "cuenta" })).imagenesConIA, false, "con la mitad de las credenciales no se activa");
  assert.equal((await construir({ CLOUDFLARE_ACCOUNT_ID: "cuenta", CLOUDFLARE_API_TOKEN: "token" })).imagenesConIA, true);
  assert.equal((await construir({ GEMINI_API_KEY: "clave" })).imagenesConIA, true);
});
