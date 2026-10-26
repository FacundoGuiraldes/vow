import test from "node:test";
import assert from "node:assert/strict";
import { origenPermitido } from "./servidor.js";

const permitidos = ["https://vow-17x.pages.dev"];

test("origenPermitido: el sitio principal y sus vistas previas pasan", () => {
  assert.equal(origenPermitido("https://vow-17x.pages.dev", permitidos), true);
  assert.equal(origenPermitido("https://feat-aldea-vow.vow-17x.pages.dev", permitidos), true);
  assert.equal(origenPermitido("https://3b0c7dd0.vow-17x.pages.dev", permitidos), true);
  assert.equal(origenPermitido(undefined, permitidos), true);
});

test("origenPermitido: otros sitios no pasan", () => {
  assert.equal(origenPermitido("https://otro.pages.dev", permitidos), false);
  assert.equal(origenPermitido("https://evil-vow-17x.pages.dev", permitidos), false);
  assert.equal(origenPermitido("http://x.vow-17x.pages.dev", permitidos), false);
  assert.equal(origenPermitido("https://x.vow-17x.pages.dev.evil.com", permitidos), false);
  assert.equal(origenPermitido("https://vow.test", ["https://vow.test"]), true);
  assert.equal(origenPermitido("https://a.vow.test", ["https://vow.test"]), false);
});
