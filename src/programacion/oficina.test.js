import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearEscenario } from "./ayuda-pruebas.js";
import { aplicarAccion, armarEstadoOficina, ErrorAccion } from "./oficina.js";
import { crearRendimientoJuego } from "./rendimiento-juego.js";

describe("la oficina", () => {
  test("aprobar desde el juego equivale al botón de Telegram y avisa por Telegram", async () => {
    const e = crearEscenario();
    const fila = await e.cargarPieza();
    const r = await aplicarAccion(e, { accion: "aprobar_pieza", id: fila.id });
    assert.equal(r.estado, "aprobada");
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
    assert.ok(e.telegram.buscar("Aprobaste desde la oficina"));
    await assert.rejects(aplicarAccion(e, { accion: "aprobar_pieza", id: fila.id }), (error) => error instanceof ErrorAccion && error.estado === 409);
  });

  test("aprobar desde el juego NO confirma la publicación del día", async () => {
    const e = crearEscenario({ fecha: "2026-10-30" });
    const fila = await e.cargarPieza();
    await aplicarAccion(e, { accion: "aprobar_pieza", id: fila.id });
    const tras = await e.repo.obtenerPieza(fila.id);
    assert.notEqual(tras.estado, "confirmada");
    assert.equal(tras.confirmada_el, null);
  });

  test("lo que se cumple o se anota queda guardado y le llega al Estratega como novedad", async () => {
    const e = crearEscenario();
    await aplicarAccion(e, { accion: "cumplir", clave: "p1", texto: "Filmar el reel", sala: "diseno" });
    await aplicarAccion(e, { accion: "nota", clave: "n1", texto: "Gorras llegan el lunes", tipo: "confirmado" });
    let estado = await armarEstadoOficina({ repo: e.repo });
    assert.equal(estado.juego.hechos.p1.texto, "Filmar el reel");
    assert.equal(estado.juego.notas.n1.tipo, "confirmado");
    assert.deepEqual((await e.repo.novedadesPendientes()).map((n) => n.texto), ["Cumplido desde la oficina: Filmar el reel", "Confirmado desde la oficina: Gorras llegan el lunes"]);
    await aplicarAccion(e, { accion: "deshacer", clave: "p1" });
    await aplicarAccion(e, { accion: "quitar_nota", clave: "n1" });
    estado = await armarEstadoOficina({ repo: e.repo });
    assert.deepEqual(estado.juego, { hechos: {}, notas: {} });
  });

  test("rechaza pedidos mal armados y recorta lo largo", async () => {
    const e = crearEscenario();
    await assert.rejects(aplicarAccion(e, { accion: "cumplir", clave: "con espacios", texto: "x" }), ErrorAccion);
    await assert.rejects(aplicarAccion(e, { accion: "nota", texto: "  " }), ErrorAccion);
    await assert.rejects(aplicarAccion(e, { accion: "aprobar_pieza", id: "uno" }), ErrorAccion);
    await aplicarAccion(e, { accion: "cumplir", clave: "p2", texto: "a".repeat(900) });
    assert.equal((await armarEstadoOficina({ repo: e.repo })).juego.hechos.p2.texto.length, 300);
  });

  test("guarda como máximo 200 entradas", async () => {
    const e = crearEscenario();
    for (let i = 0; i < 205; i++) await aplicarAccion(e, { accion: "cumplir", clave: `p${i}`, texto: `t${i}` }, Date.UTC(2026, 9, 1) + i * 1000);
    assert.equal(Object.keys((await armarEstadoOficina({ repo: e.repo })).juego.hechos).length, 200);
  });

  test("el estado trae las piezas con sus archivos, la charla reciente y el rendimiento", async () => {
    const e = crearEscenario();
    const fila = await e.cargarPieza();
    await e.repo.agregarMedio({ piezaId: fila.id, tipo: "video", mime: "video/mp4", datos: Buffer.from("x") });
    await e.repo.guardarEstado("chat", Array.from({ length: 20 }, (_, i) => ({ rol: "usuario", texto: `m${i}` })));
    const estado = await armarEstadoOficina({ repo: e.repo, rendimiento: { obtener: async () => ({ totales: { alcance: 5 } }) }, ahora: Date.UTC(2026, 9, 28) });
    assert.equal(estado.piezas[0].medios[0].tipo, "video");
    assert.match(estado.piezas[0].medios[0].token, /^[a-f0-9]{48}$/);
    assert.equal(estado.piezas[0].pieza.gancho, fila.pieza.gancho);
    assert.equal(estado.chat.length, 12);
    assert.equal(estado.rendimiento.totales.alcance, 5);
    const roto = await armarEstadoOficina({ repo: e.repo, rendimiento: { obtener: async () => { throw new Error("token vencido"); } } });
    assert.equal(roto.rendimiento.error, "token vencido");
  });
});

describe("rendimiento de Instagram para el juego", () => {
  const metaFalsa = () => {
    const veces = { perfil: 0 };
    return {
      veces,
      perfil: async () => { veces.perfil++; return { username: "vow_ar", followers_count: 120, media_count: 3 }; },
      publicaciones: async () => [
        { id: "1", caption: "Atate el compromiso\nresto", timestamp: "2026-10-20T22:00:00+0000", media_product_type: "REELS", like_count: 4, comments_count: 1, permalink: "https://ig/1" },
        { id: "2", caption: "", timestamp: "2026-10-22T22:00:00+0000", media_type: "IMAGE" },
      ],
      metricas: async (id) => { if (id === "2") throw new Error("sin métricas"); return { reach: 100, likes: 9, saved: 2, total_interactions: 14 }; },
    };
  };

  test("junta alcance y reacciones, y tolera una publicación sin métricas", async () => {
    const r = await crearRendimientoJuego({ meta: metaFalsa() }).obtener();
    assert.equal(r.cuenta.seguidores, 120);
    assert.equal(r.publicaciones[0].gancho, "Atate el compromiso");
    assert.equal(r.publicaciones[0].alcance, 100);
    assert.equal(r.publicaciones[1].alcance, null);
    assert.deepEqual(r.totales, { alcance: 100, interacciones: 14, me_gusta: 9, guardados: 2 });
  });

  test("guarda el resultado unos minutos para no gastar el cupo de Meta", async () => {
    let reloj = 0;
    const meta = metaFalsa();
    const rend = crearRendimientoJuego({ meta, ttlMs: 1000, ahora: () => reloj });
    await rend.obtener();
    reloj = 500;
    await rend.obtener();
    assert.equal(meta.veces.perfil, 1);
    reloj = 1500;
    await rend.obtener();
    assert.equal(meta.veces.perfil, 2);
    assert.equal(await crearRendimientoJuego({ meta: null }).obtener(), null);
  });
});

describe("cambiar una pieza desde la oficina", () => {
  const editorQue = (resultado) => ({ pedidos: [], async editarPieza(p) { this.pedidos.push(p); return typeof resultado === "function" ? resultado(p) : resultado; } });

  test("la IA arma otra sugerencia con el contexto, la deja para aprobar y avisa por Telegram", async () => {
    const editor = editorQue(({ fila }) => ({ ok: true, pieza: { ...fila.pieza, gancho: "Otra idea. Mismo día." }, hora: fila.hora, queCambio: "Cambié el enfoque.", errores: [] }));
    const e = crearEscenario({ fecha: "2026-10-26", editor });
    const fila = await e.cargarPieza();
    await e.repo.agregarNovedad("Llegaron las gorras");
    await e.repo.guardarEstado("chat", [{ rol: "usuario", texto: "quiero algo más de proceso" }]);
    await aplicarAccion({ ...e, rendimiento: { obtener: async () => ({ publicaciones: [{ fecha: "2026-10-19", gancho: "Presentación", alcance: 200 }] }) } }, { accion: "cambiar_pieza", id: fila.id, indicacion: "más corto" });
    const nueva = await e.repo.obtenerPieza(fila.id);
    assert.equal(nueva.pieza.gancho, "Otra idea. Mismo día.");
    assert.equal(nueva.estado, "propuesta");
    assert.ok(editor.pedidos[0].alternativa);
    for (const dato of ["más corto", "Llegaron las gorras", "quiero algo más de proceso", "alcance 200"]) assert.ok(editor.pedidos[0].instruccion.includes(dato), dato);
    assert.match(e.telegram.ultimo().texto, /Nueva sugerencia pedida desde la oficina/);
  });

  test("si estaba confirmada, vuelve a pedir aprobación; sin IA o con pieza ya publicada, avisa por qué no", async () => {
    const editor = editorQue(({ fila }) => ({ ok: true, pieza: { ...fila.pieza, gancho: "Nuevo." }, hora: fila.hora, queCambio: "", errores: [] }));
    const e = crearEscenario({ fecha: "2026-10-30", editor });
    const fila = await e.cargarPieza();
    await e.repo.actualizarPieza(fila.id, { estado: "confirmada", confirmada_el: "2026-10-30" });
    await aplicarAccion(e, { accion: "cambiar_pieza", id: fila.id });
    const nueva = await e.repo.obtenerPieza(fila.id);
    assert.equal(nueva.estado, "propuesta");
    assert.equal(nueva.confirmada_el, null);
    await e.repo.actualizarPieza(fila.id, { estado: "publicada" });
    await assert.rejects(aplicarAccion(e, { accion: "cambiar_pieza", id: fila.id }), (error) => error.estado === 409);

    const sinIA = crearEscenario({ fecha: "2026-10-30" });
    const f2 = await sinIA.cargarPieza();
    await assert.rejects(aplicarAccion(sinIA, { accion: "cambiar_pieza", id: f2.id }), /ANTHROPIC_API_KEY/);
  });

  test("una sugerencia que rompe las reglas de la marca no se guarda", async () => {
    const e = crearEscenario({ fecha: "2026-10-26", editor: editorQue({ ok: false, errores: ["urgencia falsa"] }) });
    const fila = await e.cargarPieza();
    const antes = fila.pieza.gancho;
    await assert.rejects(aplicarAccion(e, { accion: "cambiar_pieza", id: fila.id }), /urgencia falsa/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).pieza.gancho, antes);
  });

  test("la versión del estado solo cambia cuando cambia algo", async () => {
    const e = crearEscenario();
    const a = await armarEstadoOficina({ repo: e.repo, ahora: 1000 });
    const b = await armarEstadoOficina({ repo: e.repo, ahora: 9000 });
    assert.equal(a.version, b.version);
    await e.repo.agregarNovedad("algo nuevo");
    assert.notEqual((await armarEstadoOficina({ repo: e.repo })).version, a.version);
  });
});
