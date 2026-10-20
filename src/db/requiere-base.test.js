import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoParaSaltear } from "./requiere-base.js";

test("con DATABASE_URL no se saltea nada", () => {
  assert.equal(motivoParaSaltear({ DATABASE_URL: "postgres://x" }), false);
});

test("sin DATABASE_URL en una máquina local se saltea y explica por qué", () => {
  const motivo = motivoParaSaltear({});
  assert.match(motivo, /DATABASE_URL/);
  assert.match(motivo, /\.env/);
});

test("en CI sin DATABASE_URL NO se saltea (tiene que fallar fuerte)", () => {
  assert.equal(motivoParaSaltear({ CI: "true" }), false);
});

test("una DATABASE_URL vacía cuenta como que falta", () => {
  assert.ok(motivoParaSaltear({ DATABASE_URL: "" }));
});
