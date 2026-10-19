import test from "node:test";
import assert from "node:assert/strict";
import { armarCampos, descargarCuenta, explicarError, validarUsuario } from "./instagram.js";
import { tipoDePublicacion, mediana, rasgosDelTexto, resumirCuenta } from "./metricas.js";

// Muestra real (recortada) de lo que devolvió la API para @gymshark el 18/10/2026: datos públicos
const GYMSHARK = {
  business_discovery: {
    followers_count: 8697137,
    media_count: 1772,
    media: {
      data: [
        { like_count: 6823, comments_count: 185, media_type: "CAROUSEL_ALBUM", timestamp: "2026-10-18T18:08:26+0000", caption: "Celebrating Strength in Culture 💪\n\nFrom pushing limits...", permalink: "https://www.instagram.com/p/DepSqR3iDPC/" },
        { like_count: 18719, comments_count: 96, view_count: 595159, media_type: "VIDEO", timestamp: "2026-10-17T18:02:28+0000", caption: "New season. New Routines. Same commitment.\nWe’re still here.", permalink: "https://www.instagram.com/reel/DemtG1Kodh4/" },
        { like_count: 75, comments_count: 3, view_count: 13068, media_type: "VIDEO", timestamp: "2026-10-15T21:00:16+0000", caption: "New season. New routines. Same commitment.\nWe’re still here.", permalink: "https://www.instagram.com/reel/Deh369FhOxc/" },
      ],
    },
  },
};

const fetchFalso = (cuerpo, { ok = true } = {}) => {
  const pedidos = [];
  const fn = async (url) => {
    pedidos.push(String(url));
    return { ok, json: async () => cuerpo };
  };
  fn.pedidos = pedidos;
  return fn;
};

test("arma la consulta con usuario validado y límite acotado", () => {
  assert.match(armarCampos("Gymshark", 5), /business_discovery\.username\(gymshark\)\{followers_count,media_count,media\.limit\(5\)\{/);
  assert.match(armarCampos("gymshark", 9999), /media\.limit\(50\)/);
  assert.match(armarCampos("gymshark", "no es número"), /media\.limit\(25\)/);
});

test("rechaza usuarios que podrían inyectar campos en la consulta", () => {
  for (const malo of ["a)b", "x{y}", "uno dos", "", "a".repeat(31), null, "gym/shark"]) {
    assert.throws(() => validarUsuario(malo), /inválido/, String(malo));
  }
  assert.equal(validarUsuario("vqfit"), "vqfit");
});

test("descarga una cuenta y devuelve seguidores y publicaciones", async () => {
  const fetchFn = fetchFalso(GYMSHARK);
  const cuenta = await descargarCuenta("gymshark", { token: "T", idCuentaPropia: "123", limite: 3, fetchFn });
  assert.equal(cuenta.seguidores, 8697137);
  assert.equal(cuenta.publicaciones.length, 3);
  assert.match(fetchFn.pedidos[0], /graph\.facebook\.com\/v26\.0\/123\?/);
});

test("exige token y cuenta propia", async () => {
  await assert.rejects(descargarCuenta("gymshark", { idCuentaPropia: "1" }), /Falta el token/);
  await assert.rejects(descargarCuenta("gymshark", { token: "T" }), /Falta el ID/);
});

test("traduce los errores de Meta y nunca muestra el token", async () => {
  const permisos = fetchFalso({ error: { code: 10, message: "(#10) Application does not have permission" } }, { ok: false });
  await assert.rejects(descargarCuenta("gymshark", { token: "SECRETO-123", idCuentaPropia: "1", fetchFn: permisos }), /permiso/);
  assert.match(explicarError({ code: 190 }), /token venció/);
  assert.match(explicarError({ code: 110 }), /no existe/);
  // Si falla la red, el mensaje no puede incluir la dirección (que lleva el token)
  const sinRed = async () => { throw new Error("fetch failed https://graph.facebook.com/?access_token=SECRETO-123"); };
  await assert.rejects(descargarCuenta("gymshark", { token: "SECRETO-123", idCuentaPropia: "1", fetchFn: sinRed }), (e) => !e.message.includes("SECRETO-123"));
});

test("distingue reel, video, carrusel e imagen", () => {
  assert.equal(tipoDePublicacion({ media_type: "VIDEO", permalink: "https://www.instagram.com/reel/x/" }), "reel");
  assert.equal(tipoDePublicacion({ media_type: "VIDEO", permalink: "https://www.instagram.com/p/x/" }), "video");
  assert.equal(tipoDePublicacion({ media_type: "CAROUSEL_ALBUM" }), "carrusel");
  assert.equal(tipoDePublicacion({ media_type: "IMAGE" }), "imagen");
});

test("la mediana ignora valores raros y no inventa datos", () => {
  assert.equal(mediana([1, 100, 3]), 3);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
  assert.equal(mediana([null, undefined, 5]), 5);
});

test("rasgos del texto: palabras, primera línea, emojis, hashtags y pregunta", () => {
  const r = rasgosDelTexto("¿Listo para entrenar? 💪\nSumate #VOW #entrenar");
  assert.equal(r.primeraLinea, "¿Listo para entrenar? 💪");
  assert.equal(r.palabrasPrimeraLinea, 4);
  assert.equal(r.emojis, 1);
  assert.equal(r.hashtags, 2);
  assert.equal(r.esPregunta, true);
  assert.equal(rasgosDelTexto(undefined).palabras, 0);
});

test("mide cada publicación contra el tamaño de la cuenta (con los datos reales de Gymshark)", async () => {
  const cuenta = await descargarCuenta("gymshark", { token: "T", idCuentaPropia: "1", fetchFn: fetchFalso(GYMSHARK) });
  const r = resumirCuenta(cuenta);
  const reel = r.publicaciones.find((p) => p.vistas === 595159);
  assert.equal(reel.tipo, "reel");
  assert.ok(Math.abs(reel.vistasPorSeguidor - 595159 / 8697137) < 1e-12);
  assert.ok(Math.abs(reel.reaccionesPorSeguidor - (18719 + 96) / 8697137) < 1e-12);
  const carrusel = r.publicaciones.find((p) => p.tipo === "carrusel");
  assert.equal(carrusel.vistas, null, "los carruseles no traen vistas");
  assert.equal(carrusel.vistasPorSeguidor, null);
  assert.equal(r.porTipo.reel.cantidad, 2);
  assert.equal(r.porTipo.carrusel.medianaVistasPorSeguidor, null);
});
