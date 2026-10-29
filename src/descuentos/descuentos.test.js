import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ErrorCodigo, crearGestorCodigos, normalizarCodigo } from "./codigos.js";
import { armarMail } from "./correo.js";
import { crearEnvioDescuentos } from "./lista-espera.js";
import { crearPedido, confirmarPago, ErrorPedido } from "../pagos/pedidos.js";
import { aplicarInventario, leerInventario } from "../programacion/inventario.js";
import { crearRepositorioMemoria } from "../programacion/repositorio-memoria.js";

const COMPRADOR = { nombre: "Ana Pérez", email: "ana@mail.com", telefono: "11 5555-1234" };
const base = { urlPublica: "https://api.vow.test", urlLanding: "https://vow.test" };
let reloj = Date.parse("2026-11-01T12:00:00Z");
const ahora = () => reloj;

async function armar() {
  const repo = crearRepositorioMemoria();
  await aplicarInventario(repo, { tipo: "entrada", sku: "shaker-negro", cantidad: 5 });
  const preferencias = [];
  const mp = { crearPreferencia: async (p) => { preferencias.push(p); return { init_point: `https://mp.test/${p.external_reference}` }; } };
  return { repo, mp, preferencias, codigos: crearGestorCodigos({ repo, ahora }) };
}
const pedir = (ctx, extra = {}) => crearPedido({ repo: ctx.repo, mp: ctx.mp, codigos: ctx.codigos, ...base, cuerpo: { items: [{ producto: "shaker", cantidad: 2, shaker: "negro" }], comprador: COMPRADOR, entrega: { tipo: "retiro" }, ...extra } });

describe("códigos de descuento", () => {
  test("un código por persona, estable, con formato legible y sin letras confusas", async () => {
    const { codigos } = await armar();
    const a = await codigos.asegurarCodigos({ emails: ["a@x.com", "b@x.com"], porcentaje: 10, venceEn: "2026-11-15T00:00:00Z" });
    assert.match(a["a@x.com"].codigo, /^VOW-[A-HJKMNP-Z2-9]{6}$/);
    assert.notEqual(a["a@x.com"].codigo, a["b@x.com"].codigo);
    const otra = await codigos.asegurarCodigos({ emails: ["a@x.com"], porcentaje: 99, venceEn: "2030-01-01T00:00:00Z" });
    assert.deepEqual(otra["a@x.com"], a["a@x.com"]); // no se pisa ni cambia el vencimiento
  });

  test("se aceptan minúsculas, espacios y sin el VOW", async () => {
    const { codigos } = await armar();
    const { "a@x.com": { codigo } } = await codigos.asegurarCodigos({ emails: ["a@x.com"], porcentaje: 10, venceEn: null });
    for (const variante of [codigo, codigo.toLowerCase(), codigo.replace("-", " "), codigo.slice(4)]) assert.equal((await codigos.validar(variante)).porcentaje, 10);
    assert.equal(normalizarCodigo("vow-abc234"), "ABC234");
  });

  test("rechaza inexistente, vencido, usado y apartado por otro pedido", async () => {
    const { codigos } = await armar();
    const { "a@x.com": { codigo } } = await codigos.asegurarCodigos({ emails: ["a@x.com"], porcentaje: 10, venceEn: new Date(reloj + 3600_000).toISOString() });
    await assert.rejects(codigos.validar("VOW-ZZZZZZ"), /no existe/);
    await codigos.reservar(codigo, "pedido1");
    await assert.rejects(codigos.reservar(codigo, "pedido2"), (e) => e instanceof ErrorCodigo && /otro pedido/.test(e.message));
    await codigos.consumir(codigo, "pedido1");
    await assert.rejects(codigos.validar(codigo), /ya se usó/);
    const { "b@x.com": { codigo: vencido } } = await codigos.asegurarCodigos({ emails: ["b@x.com"], porcentaje: 10, venceEn: new Date(reloj - 1000).toISOString() });
    await assert.rejects(codigos.validar(vencido), /venció/);
  });
});

describe("pedido con código", () => {
  test("descuenta solo los productos (no el envío), lo aparta y se gasta al pagar", async () => {
    const ctx = await armar();
    const { "a@x.com": { codigo } } = await ctx.codigos.asegurarCodigos({ emails: ["a@x.com"], porcentaje: 10, venceEn: null });
    const r = await pedir(ctx, { codigo: codigo.toLowerCase() });
    assert.equal(r.importe, 2 * 11610); // 12.900 − 10%
    assert.deepEqual(r.descuento, { porcentaje: 10, ahorro: 2 * 1290 });
    assert.equal(ctx.preferencias[0].items[0].unit_price, 11610);
    await assert.rejects(pedir(ctx, { codigo }), /otro pedido/); // apartado mientras se paga
    const pago = { id: 9, external_reference: r.id, status: "approved", currency_id: "ARS", transaction_amount: r.importe };
    assert.equal(await confirmarPago({ repo: ctx.repo, pago, codigos: ctx.codigos }), "venta registrada");
    assert.equal((await leerInventario(ctx.repo)).stock["shaker-negro"], 3);
    await assert.rejects(pedir(ctx, { codigo }), /ya se usó/);
  });

  test("si el pago se rechaza el código vuelve a quedar disponible", async () => {
    const ctx = await armar();
    const { "a@x.com": { codigo } } = await ctx.codigos.asegurarCodigos({ emails: ["a@x.com"], porcentaje: 10, venceEn: null });
    const r = await pedir(ctx, { codigo });
    await confirmarPago({ repo: ctx.repo, pago: { id: 1, external_reference: r.id, status: "rejected" }, codigos: ctx.codigos });
    assert.equal((await ctx.codigos.validar(codigo)).porcentaje, 10);
  });

  test("si falla Mercado Pago al armar el link, el código se libera", async () => {
    const ctx = await armar();
    const { "a@x.com": { codigo } } = await ctx.codigos.asegurarCodigos({ emails: ["a@x.com"], porcentaje: 10, venceEn: null });
    const roto = { ...ctx, mp: { crearPreferencia: async () => { throw new Error("caído"); } } };
    await assert.rejects(pedir(roto, { codigo }), /caído/);
    assert.equal((await ctx.codigos.validar(codigo)).porcentaje, 10);
  });

  test("un código inventado o sin sistema de códigos no baja el precio", async () => {
    const ctx = await armar();
    await assert.rejects(pedir(ctx, { codigo: "VOW-AAAAAA" }), (e) => e instanceof ErrorPedido && /no existe/.test(e.message));
    await assert.rejects(pedir({ ...ctx, codigos: null }, { codigo: "VOW-AAAAAA" }), /no están disponibles/);
    assert.equal((await pedir(ctx)).importe, 2 * 12900); // sin código, precio completo
  });
});

describe("mail y envío", () => {
  test("el mail lleva el código, el porcentaje, el vencimiento y la baja; escapa lo que corresponde", () => {
    const m = armarMail({ codigo: "VOW-K7P2Q9", porcentaje: 15, vence: "2026-11-15T12:00:00Z", urlLanding: "https://vow.test/", contacto: "vow@gmail.com" });
    assert.match(m.asunto, /15% off/);
    for (const parte of ["VOW-K7P2Q9", "15% off", "15 de noviembre", "mailto:vow@gmail.com", "https://vow.test/#tienda", "https://vow.test/assets/logo-mail.png"]) assert.ok(m.html.includes(parte), parte);
    assert.ok(m.texto.includes("VOW-K7P2Q9"));
    assert.match(armarMail({ codigo: "X", porcentaje: 10, vence: null, urlLanding: "https://v.t", contacto: "a@b.c", prueba: true }).asunto, /^\[PRUEBA\]/);
  });

  test("envía solo a quien falta, en tandas, y no repite", async () => {
    const { codigos } = await armar();
    const enviados = [];
    let falla = "c@x.com";
    const correo = { contacto: "vow@gmail.com", enviar: async ({ para, texto }) => { if (para === falla) throw new Error("rechazado"); enviados.push({ para, texto }); } };
    const emails = ["a@x.com", "b@x.com", "c@x.com"];
    const envio = crearEnvioDescuentos({ codigos, listarEmails: async () => emails, correo, porcentaje: 10, urlLanding: "https://vow.test", ahora, pausaMs: 0, dormir: async () => {} });
    assert.deepEqual(await envio.estado(), { anotados: 3, pendientes: 3, enviados: 0, usados: 0, porcentaje: 10, dias: 14 });
    await assert.rejects(envio.enviar({ esperados: 2 }), /Hay 3 personas/); // cantidad vieja: no manda nada
    assert.equal(enviados.length, 0);
    const r = await envio.enviar({ esperados: 3 });
    assert.equal(r.enviados, 2);
    assert.equal(r.fallidos.length, 1);
    assert.equal(r.quedan, 1);
    assert.ok(enviados.every((e) => /VOW-[A-Z0-9]{6}/.test(e.texto)));
    falla = null;
    const r2 = await envio.enviar({ esperados: 1 }); // reintento: solo a quien faltaba
    assert.equal(r2.enviados, 1);
    assert.equal(enviados.length, 3);
    assert.equal((await envio.enviar({ esperados: 0 })).enviados, 0);
  });

  test("la prueba manda el ejemplo con un código que no sirve", async () => {
    const { codigos } = await armar();
    const enviados = [];
    const envio = crearEnvioDescuentos({ codigos, listarEmails: async () => ["a@x.com"], correo: { contacto: "v@g.com", enviar: async (m) => enviados.push(m) }, porcentaje: 10, urlLanding: "https://vow.test", ahora });
    await envio.prueba("yo@mail.com");
    assert.equal(enviados[0].para, "yo@mail.com");
    assert.match(enviados[0].asunto, /^\[PRUEBA\]/);
    await assert.rejects(codigos.validar("VOW-EJEMPL"), /no existe/);
    await assert.rejects(envio.prueba("no-es-mail"), /no es válido/);
    assert.equal((await envio.estado()).enviados, 0);
  });
});

describe("errores de correo", () => {
  test("se explican en criollo", async () => {
    const { explicarErrorDeCorreo } = await import("./correo.js");
    assert.match(explicarErrorDeCorreo({ code: "EAUTH" }), /contraseña de aplicación/);
    assert.match(explicarErrorDeCorreo({ code: "ETIMEDOUT" }), /No se pudo conectar con Gmail/);
    assert.match(explicarErrorDeCorreo(new Error("otra cosa")), /otra cosa/);
  });
});

describe("Gmail por API", () => {
  test("pide el token, manda el mail armado en base64url y reutiliza el token", async () => {
    const { crearTransporteGmailApi } = await import("./correo.js");
    const llamadas = [];
    const fetchFn = async (url, opciones) => {
      llamadas.push({ url: String(url), opciones });
      if (String(url).includes("oauth2")) return { ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
      return { ok: true, status: 200, json: async () => ({ id: "m1" }) };
    };
    const t = crearTransporteGmailApi({ usuario: "vow@gmail.com", clientId: "id", clientSecret: "sec", refreshToken: "ref", fetchFn, ahora: () => 1_000 });
    await t.enviar({ para: "ana@mail.com", asunto: "Tu 10% off", html: "<p>Hola ñandú</p>", texto: "Hola" });
    await t.enviar({ para: "bea@mail.com", asunto: "Tu 10% off", html: "<p>Hola</p>", texto: "Hola" });
    assert.equal(llamadas.filter((l) => l.url.includes("oauth2")).length, 1); // un solo token para los dos
    const envio = llamadas.find((l) => l.url.includes("messages/send"));
    assert.equal(envio.opciones.headers.Authorization, "Bearer tok");
    const crudo = Buffer.from(JSON.parse(envio.opciones.body).raw, "base64url").toString("utf8");
    assert.match(crudo, /^From: VOW <vow@gmail.com>/m);
    assert.match(crudo, /^To: ana@mail.com/m);
    assert.match(crudo, /List-Unsubscribe: <mailto:vow@gmail.com\?subject=Baja>/);
  });

  test("explica si Google rechaza el permiso o el mail", async () => {
    const { crearTransporteGmailApi } = await import("./correo.js");
    const sinPermiso = crearTransporteGmailApi({ usuario: "v@g.com", clientId: "i", clientSecret: "s", refreshToken: "r", fetchFn: async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) }) });
    await assert.rejects(sinPermiso.enviar({ para: "a@b.co", asunto: "x", html: "x", texto: "x" }), /invalid_grant.*refresh token/);
    const rechazo = crearTransporteGmailApi({ usuario: "v@g.com", clientId: "i", clientSecret: "s", refreshToken: "r", fetchFn: async (u) => String(u).includes("oauth2") ? { ok: true, json: async () => ({ access_token: "t" }) } : { ok: false, status: 403, json: async () => ({ error: { message: "Insufficient Permission" } }) } });
    await assert.rejects(rechazo.enviar({ para: "a@b.co", asunto: "x", html: "x", texto: "x" }), /403.*Insufficient/);
    assert.throws(() => crearTransporteGmailApi({ usuario: "v@g.com" }), /Faltan/);
  });
});
