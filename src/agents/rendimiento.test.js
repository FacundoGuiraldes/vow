import test from "node:test";
import assert from "node:assert/strict";
import {
  medirCuentaPropia,
  analizarPropias,
  resumirPropiasPorTipo,
  resumirReferenciasPorTipo,
  veredicto,
  compararConReferencias,
  armarInforme,
  informeAMarkdown,
  MUESTRA_MINIMA,
} from "./rendimiento.js";

const HOY = new Date("2026-10-21T18:00:00Z");

// Muestra real de @vow_ar del 21/10/2026 (perfil, el reel con sus métricas y el carrusel)
const REEL = {
  id: "17987918105882137",
  caption: "¿Y vos? ¿Qué te prometés? Cumplilo.\n\nEscribí tu promesa de esta semana en los comentarios.",
  media_type: "VIDEO",
  permalink: "https://www.instagram.com/reel/DesvQr2zTTo/",
  timestamp: "2026-10-20T02:16:22+0000",
  like_count: 20,
  comments_count: 2,
};
const CARRUSEL = {
  id: "17898108060611787",
  caption: "Una promesa con vos. \n\nAnotate en la lista de espera.",
  media_type: "CAROUSEL_ALBUM",
  permalink: "https://www.instagram.com/p/DeriKp-FdNV/",
  timestamp: "2026-10-19T15:02:25+0000",
  like_count: 42,
  comments_count: 2,
};
const METRICAS_REEL = { reach: 734, views: 1086, likes: 20, comments: 2, saved: 0, shares: 0, total_interactions: 22 };
const METRICAS_CARRUSEL = { reach: 900, views: 1500, likes: 42, comments: 2, saved: 3, shares: 1, total_interactions: 48 };

const metaFalsa = ({ falla = null } = {}) => {
  const pedidos = [];
  return {
    pedidos,
    perfil: async () => ({ username: "vow_ar", followers_count: 306, follows_count: 2007 }),
    publicaciones: async (limite) => {
      pedidos.push(["publicaciones", limite]);
      return [REEL, CARRUSEL];
    },
    metricas: async (id) => {
      pedidos.push(["metricas", id]);
      if (id === falla) throw new Error("Meta rechazó el pedido");
      return id === REEL.id ? METRICAS_REEL : METRICAS_CARRUSEL;
    },
  };
};

const cuentaVow = async (opciones) => medirCuentaPropia(metaFalsa(opciones), { limite: 10 });

// Cuentas de referencia ya resumidas, como las devuelve resumirCuenta (metricas.js)
const referencia = (marca, carrusel, reel) => ({
  marca,
  porTipo: {
    carrusel: { cantidad: 5, medianaReaccionesPorSeguidor: carrusel, medianaVistasPorSeguidor: null },
    reel: { cantidad: 5, medianaReaccionesPorSeguidor: reel, medianaVistasPorSeguidor: 0.05 },
  },
});

test("mide la cuenta propia: perfil, publicaciones y las métricas de cada una", async () => {
  const meta = metaFalsa();
  const cuenta = await medirCuentaPropia(meta, { limite: 10 });
  assert.deepEqual(meta.pedidos, [["publicaciones", 10], ["metricas", REEL.id], ["metricas", CARRUSEL.id]]);
  assert.equal(cuenta.usuario, "vow_ar");
  assert.equal(cuenta.seguidores, 306);
  assert.equal(cuenta.seguidos, 2007);
  assert.deepEqual(cuenta.publicaciones[0].metricas, METRICAS_REEL);
});

test("si fallan las métricas de una publicación, sigue con las demás y anota el motivo", async () => {
  const cuenta = await cuentaVow({ falla: REEL.id });
  assert.equal(cuenta.publicaciones[0].metricas, null);
  assert.match(cuenta.publicaciones[0].errorMetricas, /rechazó/);
  assert.deepEqual(cuenta.publicaciones[1].metricas, METRICAS_CARRUSEL);
});

test("analiza cada publicación propia con las medidas comunes y las privadas", async () => {
  const [reel, carrusel] = analizarPropias(await cuentaVow(), { hoy: HOY });
  assert.equal(reel.tipo, "reel");
  assert.equal(carrusel.tipo, "carrusel");
  assert.equal(reel.vistas, 1086, "las vistas salen de las métricas privadas");
  assert.equal(reel.reaccionesPorSeguidor, 22 / 306);
  assert.equal(reel.vistasPorSeguidor, 1086 / 306);
  assert.equal(reel.alcance, 734);
  assert.equal(reel.alcancePorSeguidor, 734 / 306);
  assert.equal(reel.interaccionesPorAlcance, 22 / 734);
  assert.equal(carrusel.guardados, 3);
  assert.equal(carrusel.compartidos, 1);
  assert.equal(reel.primeraLinea, "¿Y vos? ¿Qué te prometés? Cumplilo.");
});

test("marca como recientes solo las publicaciones de menos de 7 días", async () => {
  const cuenta = await cuentaVow();
  const viejo = { ...cuenta, publicaciones: [{ ...cuenta.publicaciones[0], timestamp: "2026-10-14T17:00:00+0000" }] };
  assert.equal(analizarPropias(cuenta, { hoy: HOY })[0].reciente, true);
  assert.equal(analizarPropias(viejo, { hoy: HOY })[0].reciente, false, "7 días y una hora ya no es reciente");
  const casi = { ...cuenta, publicaciones: [{ ...cuenta.publicaciones[0], timestamp: "2026-10-14T19:00:00+0000" }] };
  assert.equal(analizarPropias(casi, { hoy: HOY })[0].reciente, true, "6 días y 23 horas todavía es reciente");
});

test("sin métricas o sin alcance no inventa porcentajes", async () => {
  const cuenta = await cuentaVow({ falla: REEL.id });
  const [reel] = analizarPropias(cuenta, { hoy: HOY });
  assert.equal(reel.alcance, null);
  assert.equal(reel.vistas, null);
  assert.equal(reel.interaccionesPorAlcance, null);
  assert.equal(reel.alcancePorSeguidor, null);
  const alcanceCero = { ...cuenta, publicaciones: [{ ...REEL, metricas: { ...METRICAS_REEL, reach: 0 } }] };
  assert.equal(analizarPropias(alcanceCero, { hoy: HOY })[0].interaccionesPorAlcance, null);
});

test("resume por tipo con medianas y suma guardados y compartidos", async () => {
  const analizadas = analizarPropias(await cuentaVow(), { hoy: HOY });
  const otroReel = { ...analizadas[0], interaccionesPorAlcance: 0.1, guardados: 2, compartidos: null };
  const porTipo = resumirPropiasPorTipo([...analizadas, otroReel]);
  assert.equal(porTipo.reel.cantidad, 2);
  assert.equal(porTipo.reel.medianaInteraccionesPorAlcance, (22 / 734 + 0.1) / 2);
  assert.equal(porTipo.reel.guardados, 2);
  assert.equal(porTipo.reel.compartidos, 0, "un dato que falta no rompe la suma");
  assert.equal(porTipo.carrusel.guardados, 3);
});

test("las referencias se resumen con la mediana de las medianas de cada cuenta", () => {
  const porTipo = resumirReferenciasPorTipo([referencia("A", 0.001, 0.01), referencia("B", 0.003, 0.02), referencia("C", 0.1, 0.03)]);
  assert.equal(porTipo.carrusel.cuentas, 3);
  assert.equal(porTipo.carrusel.medianaReaccionesPorSeguidor, 0.003, "una cuenta con un valor raro no la arrastra");
  assert.equal(porTipo.reel.medianaVistasPorSeguidor, 0.05);
  assert.equal(porTipo.carrusel.medianaVistasPorSeguidor, null);
});

test("el veredicto respeta el margen de parecido y la muestra mínima", () => {
  assert.equal(veredicto(0.079, 0.1, MUESTRA_MINIMA), "por debajo");
  assert.equal(veredicto(0.0801, 0.1, MUESTRA_MINIMA), "parecido");
  assert.equal(veredicto(0.1249, 0.1, MUESTRA_MINIMA), "parecido");
  assert.equal(veredicto(0.126, 0.1, MUESTRA_MINIMA), "por encima");
  assert.equal(veredicto(0.5, 0.1, MUESTRA_MINIMA - 1), "muestra muy chica");
  assert.equal(veredicto(null, 0.1, 10), "sin datos para comparar");
  assert.equal(veredicto(0.1, null, 10), "sin datos para comparar");
  assert.equal(veredicto(0.1, 0, 10), "sin datos para comparar");
});

test("compara solo lo que existe de algún lado", () => {
  const propio = {
    carrusel: { cantidad: 3, medianaReaccionesPorSeguidor: 0.2, medianaVistasPorSeguidor: null },
    reel: { cantidad: 1, medianaReaccionesPorSeguidor: 0.07, medianaVistasPorSeguidor: 3.5 },
    imagen: { cantidad: 4, medianaReaccionesPorSeguidor: 0.1, medianaVistasPorSeguidor: null },
  };
  const filas = compararConReferencias(propio, resumirReferenciasPorTipo([referencia("A", 0.003, 0.002)]));
  const fila = (tipo, medida) => filas.find((f) => f.tipo === tipo && f.medida === medida);
  assert.equal(fila("carrusel", "reacciones por seguidor").veredicto, "por encima");
  assert.equal(fila("carrusel", "vistas por seguidor"), undefined, "sin vistas de ningún lado no hay fila");
  assert.equal(fila("reel", "vistas por seguidor").veredicto, "muestra muy chica");
  assert.equal(fila("imagen", "reacciones por seguidor").veredicto, "sin datos para comparar", "las referencias no tienen imágenes");
});

test("el informe avisa lo que hace falta para leerlo bien", async () => {
  const informe = armarInforme({
    fecha: "2026-10-21",
    cuenta: await cuentaVow(),
    referencias: [referencia("Fuark", 0.003, 0.0005)],
    fallas: [{ marca: "Gymshark", motivo: "Se pasó el límite de consultas de Meta" }],
    hoy: HOY,
  });
  const avisos = informe.avisos.join("\n");
  assert.match(avisos, /sigue a 2007 y tiene 306 seguidores/);
  assert.match(avisos, /cuenta chica suele tener más reacciones por seguidor/);
  assert.match(avisos, /VOW no tiene anuncios/);
  assert.match(avisos, /2 de 2 publicaciones tienen menos de 7 días/);
  assert.match(avisos, /Muestra muy chica en: reel \(1\), carrusel \(1\)/);
  assert.match(avisos, /No se pudo bajar Gymshark: Se pasó el límite/);
  assert.deepEqual(informe.referencias, ["Fuark"]);
});

test("sin referencias ni seguidos de más, no muestra esos avisos ni la comparación", async () => {
  const cuenta = { ...(await cuentaVow()), seguidos: 400 };
  const informe = armarInforme({ fecha: "2026-10-21", cuenta, hoy: HOY });
  assert.deepEqual(informe.comparacion, []);
  const avisos = informe.avisos.join("\n");
  assert.doesNotMatch(avisos, /seguir de vuelta/);
  assert.doesNotMatch(avisos, /cuenta chica/);
  assert.match(avisos, /solo mide a VOW contra sí misma/);
  assert.doesNotMatch(informeAMarkdown(informe), /Contra las cuentas de referencia/);
});

test("avisa cuántas publicaciones no trajeron métricas", async () => {
  const informe = armarInforme({ fecha: "2026-10-21", cuenta: await cuentaVow({ falla: REEL.id }), hoy: HOY });
  assert.match(informe.avisos.join("\n"), /1 publicaciones no trajeron métricas/);
});

test("elige las destacadas y no destaca guardados ni compartidos en cero", async () => {
  const cuenta = await cuentaVow();
  const { destacadas } = armarInforme({ fecha: "2026-10-21", cuenta, hoy: HOY });
  assert.equal(destacadas.masInteraccionPorAlcance.enlace, CARRUSEL.permalink, "48/900 le gana a 22/734");
  assert.equal(destacadas.masGuardada.enlace, CARRUSEL.permalink);
  const sinGuardados = { ...cuenta, publicaciones: [{ ...REEL, metricas: METRICAS_REEL }] };
  const otro = armarInforme({ fecha: "2026-10-21", cuenta: sinGuardados, hoy: HOY }).destacadas;
  assert.equal(otro.masGuardada, null);
  assert.equal(otro.masCompartida, null);
});

test("el markdown trae las tablas, las destacadas y los avisos", async () => {
  const informe = armarInforme({ fecha: "2026-10-21", cuenta: await cuentaVow(), referencias: [referencia("Fuark", 0.003, 0.0005)], hoy: HOY });
  const md = informeAMarkdown(informe);
  assert.match(md, /^# Rendimiento de @vow_ar · 2026-10-21\n/);
  assert.match(md, /2 publicaciones, 306 seguidores, 2007 seguidos\. Referencias: Fuark\./);
  assert.match(md, /\| reel \| 1 \| 7\.19% \| 239\.87% \| 3\.00% \| 0 \| 0 \|/);
  assert.match(md, /\| carrusel \| reacciones por seguidor \| 14\.38% \| 0\.30% \| muestra muy chica \|/);
  assert.match(md, /\*\*Más guardada:\*\* carrusel del 2026-10-19, 3 guardados\. "Una promesa con vos\." https:\/\/www\.instagram\.com\/p\/DeriKp-FdNV\//);
  assert.match(md, /\| 2026-10-20 \(reciente\) \| \[reel\]\(https:\/\/www\.instagram\.com\/reel\/DesvQr2zTTo\/\) \| 734 \| 1086 \| 20 \| 2 \| 0 \| 0 \| 3\.00% \|/);
  assert.match(md, /## Para leerlo bien\n\n- La cuenta sigue a 2007/);
});

test("el markdown no rompe la tabla si un texto trae una barra vertical y muestra — donde falta un dato", async () => {
  const cuenta = await cuentaVow({ falla: REEL.id });
  cuenta.publicaciones[0].caption = "Antes | después";
  const md = informeAMarkdown(armarInforme({ fecha: "2026-10-21", cuenta, hoy: HOY }));
  assert.match(md, /\| — \| — \| 20 \| 2 \| — \| — \| — \| Antes \/ después \|/);
});
