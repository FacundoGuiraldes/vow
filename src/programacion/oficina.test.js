import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearEscenario, crearPieza } from "./ayuda-pruebas.js";
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

  test("cada pieza trae su revisión de calidad y revisarla no cambia ni aprueba nada", async () => {
    const e = crearEscenario();
    const fila = await e.cargarPieza();
    const estado = await armarEstadoOficina({ repo: e.repo });
    const pieza = estado.piezas.find((p) => p.id === fila.id);
    assert.ok(["listo", "revisar", "arreglar"].includes(pieza.calidad.veredicto));
    assert.ok(Array.isArray(pieza.calidad.avisos));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, fila.estado);
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
    assert.equal(estado.chat.length, 20);
    assert.equal(estado.chat[0].canal, "telegram");
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

  test("calcula enviados por alcance y cuántas veces más vistas que lo típico (solo con 6 o más publicaciones)", async () => {
    const vistas = [100, 100, 100, 100, 100, 400];
    const meta = {
      perfil: async () => ({ username: "vow_ar" }),
      publicaciones: async () => vistas.map((_, i) => ({ id: String(i), caption: "x", timestamp: "2026-10-20T22:00:00+0000" })),
      metricas: async (id) => ({ reach: 200, views: vistas[Number(id)], shares: 10, saved: 4 }),
    };
    const r = await crearRendimientoJuego({ meta }).obtener();
    assert.equal(r.publicaciones[0].enviados_por_alcance, 5);
    assert.equal(r.publicaciones[0].guardados_por_alcance, 2);
    assert.equal(r.publicaciones[0].multiplo, 1);
    assert.equal(r.publicaciones[5].multiplo, 4);
    const pocas = await crearRendimientoJuego({ meta: { ...meta, publicaciones: async () => [{ id: "0", caption: "x" }, { id: "1", caption: "y" }] } }).obtener();
    assert.equal(pocas.publicaciones[0].multiplo, null);
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

  test("en el servidor, Cambiar contesta enseguida y el avance se ve en el estado (listo o con el error)", async () => {
    let soltar;
    const puerta = new Promise((r) => { soltar = r; }); // la IA "tarda" hasta que el test la suelta
    const editor = editorQue(async ({ fila }) => { await puerta; return { ok: true, pieza: { ...fila.pieza, gancho: "Nuevo." }, hora: fila.hora, queCambio: "", errores: [] }; });
    const e = crearEscenario({ fecha: "2026-10-30", editor });
    const fila = await e.cargarPieza();
    const trabajos = [];
    const deps = { ...e, segundoPlano: (p) => trabajos.push(p) };
    const r = await aplicarAccion(deps, { accion: "cambiar_pieza", id: fila.id });
    assert.deepEqual(r, { ok: true, trabajando: true });
    assert.equal((await armarEstadoOficina({ repo: e.repo })).cambios[fila.id].estado, "trabajando");
    await assert.rejects(aplicarAccion(deps, { accion: "cambiar_pieza", id: fila.id }), (error) => error.estado === 409 && /ya está armando/.test(error.message));
    soltar();
    await Promise.all(trabajos);
    assert.equal((await armarEstadoOficina({ repo: e.repo })).cambios[fila.id].estado, "listo");
    assert.equal((await e.repo.obtenerPieza(fila.id)).pieza.gancho, "Nuevo.");

    const malo = crearEscenario({ fecha: "2026-10-30", editor: editorQue({ ok: false, errores: ["urgencia falsa"] }) });
    const f2 = await malo.cargarPieza();
    const t2 = [];
    await aplicarAccion({ ...malo, segundoPlano: (p) => t2.push(p) }, { accion: "cambiar_pieza", id: f2.id });
    await Promise.all(t2);
    const c = (await armarEstadoOficina({ repo: malo.repo })).cambios[f2.id];
    assert.equal(c.estado, "error");
    assert.match(c.motivo, /urgencia falsa/);
  });

  test("un cambio que quedó 'trabajando' más de 5 minutos se muestra como interrumpido", async () => {
    const e = crearEscenario();
    const ahora = Date.parse("2026-10-26T12:00:00Z");
    await e.repo.guardarEstado("cambios", { 5: { estado: "trabajando", en: "2026-10-26T11:50:00Z" } });
    const c = (await armarEstadoOficina({ repo: e.repo, ahora })).cambios[5];
    assert.equal(c.estado, "error");
    assert.match(c.motivo, /interrumpió/);
  });

  test("mientras la IA trabaja, el estado muestra el paso en el que va; sin señales por 3 minutos se da por interrumpido", async () => {
    let verPaso;
    const editor = { editarPieza: async ({ fila, alAvanzar }) => {
      alAvanzar("Corrigiendo una regla de la marca (intento 2 de 3): urgencia falsa");
      await verPaso();
      return { ok: true, pieza: { ...fila.pieza, gancho: "Nuevo." }, hora: fila.hora, queCambio: "", errores: [] };
    } };
    const e = crearEscenario({ fecha: "2026-10-30", editor });
    const fila = await e.cargarPieza();
    verPaso = async () => {
      await new Promise((r) => setTimeout(r, 20));
      const c = (await armarEstadoOficina({ repo: e.repo })).cambios[fila.id];
      assert.equal(c.estado, "trabajando");
      assert.match(c.paso, /intento 2 de 3/);
    };
    await aplicarAccion(e, { accion: "cambiar_pieza", id: fila.id });
    const final = (await armarEstadoOficina({ repo: e.repo })).cambios[fila.id];
    assert.equal(final.estado, "listo");
    assert.equal(final.paso, undefined);

    const ahora = Date.parse("2026-10-26T12:00:00Z");
    await e.repo.guardarEstado("cambios", { 7: { estado: "trabajando", en: "2026-10-26T11:57:00Z", paso: "algo", pasoEn: "2026-10-26T11:56:30Z" }, 8: { estado: "trabajando", en: "2026-10-26T11:57:00Z", paso: "algo", pasoEn: "2026-10-26T11:59:30Z" } });
    const c = (await armarEstadoOficina({ repo: e.repo, ahora })).cambios;
    assert.equal(c[7].estado, "error");
    assert.equal(c[8].estado, "trabajando");
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

  test("el chat del juego usa el mismo bot: lo escrito queda en la charla compartida y los errores se muestran", async () => {
    const llm = { async conversar({ historial }) { return `Veo ${historial.length}`; } };
    const e = crearEscenario({ llm });
    const r = await aplicarAccion(e, { accion: "chat", texto: "  hola bot  " });
    assert.deepEqual([r.ok, r.respuesta], [true, "Veo 1"]);
    const estado = await armarEstadoOficina({ repo: e.repo });
    assert.deepEqual(estado.chat.map((m) => [m.rol, m.texto, m.canal]), [["usuario", "hola bot", "juego"], ["asistente", "Veo 1", "juego"]]);
    await assert.rejects(aplicarAccion(e, { accion: "chat", texto: "   " }), (error) => error instanceof ErrorAccion && error.estado === 400);
    const roto = crearEscenario({ llm: { async conversar() { throw new Error("saturada"); } } });
    await assert.rejects(aplicarAccion(roto, { accion: "chat", texto: "hola" }), (error) => error instanceof ErrorAccion && error.estado === 502 && /saturada/.test(error.message));
    const sinIA = crearEscenario();
    await assert.rejects(aplicarAccion(sinIA, { accion: "chat", texto: "hola" }), (error) => error instanceof ErrorAccion && /no está configurado/.test(error.message));
  });

  test("confirmar desde el juego es la confirmación final real: mismas reglas que el botón y avisa por Telegram", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await e.cargarPieza();
    await aplicarAccion(e, { accion: "aprobar_pieza", id: fila.id });
    await assert.rejects(aplicarAccion(e, { accion: "confirmar_pieza", id: fila.id }), (error) => error instanceof ErrorAccion && error.estado === 409 && /video/i.test(error.message), "sin archivo no se confirma");
    assert.notEqual((await e.repo.obtenerPieza(fila.id)).estado, "confirmada");
    await e.repo.agregarMedio({ piezaId: fila.id, tipo: "video", mime: "video/mp4", datos: Buffer.from("x") });
    const r = await aplicarAccion(e, { accion: "confirmar_pieza", id: fila.id });
    assert.equal(r.estado, "confirmada");
    const tras = await e.repo.obtenerPieza(fila.id);
    assert.equal(tras.estado, "confirmada");
    assert.equal(tras.confirmada_el, "2026-10-30");
    assert.ok(e.telegram.buscar("Confirmaste desde la oficina"));
  });

  test("confirmar una pieza de otro día se rechaza", async () => {
    const e = crearEscenario({ fecha: "2026-10-28", hora: "08:00" });
    const fila = await e.cargarPieza();
    await assert.rejects(aplicarAccion(e, { accion: "confirmar_pieza", id: fila.id }), (error) => error.estado === 409 && /mismo día/.test(error.message));
  });
});

describe("editar una publicación a mano desde el juego", () => {
  const llm = { async conversar() { return ""; } };

  test("el epígrafe conserva los párrafos y la edición borra la confirmación", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", llm });
    const fila = await e.cargarPieza();
    await e.repo.agregarMedio({ piezaId: fila.id, tipo: "video", mime: "video/mp4", datos: Buffer.from("x") });
    await aplicarAccion(e, { accion: "aprobar_pieza", id: fila.id });
    await aplicarAccion(e, { accion: "confirmar_pieza", id: fila.id });
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "confirmada");
    const epigrafe = "Primer párrafo del epígrafe.\r\n\r\n\r\n\r\nSegundo párrafo.\nLínea siguiente. Anotate en la lista: link en la bio.  ";
    const r = await aplicarAccion(e, { accion: "editar_pieza", id: fila.id, cambios: { epigrafe } });
    assert.equal(r.estado, "propuesta");
    const tras = await e.repo.obtenerPieza(fila.id);
    assert.equal(tras.pieza.epigrafe, "Primer párrafo del epígrafe.\n\nSegundo párrafo.\nLínea siguiente. Anotate en la lista: link en la bio.");
    assert.equal(tras.confirmada_el, null);
    assert.ok(e.telegram.buscar("Editada desde la oficina"));
  });

  test("cambiar el tipo descarta el archivo que ya no sirve y valida lo pedido", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", llm });
    const fila = await e.cargarPieza();
    await e.repo.agregarMedio({ piezaId: fila.id, tipo: "video", mime: "video/mp4", datos: Buffer.from("x") });
    await assert.rejects(aplicarAccion(e, { accion: "editar_pieza", id: fila.id, cambios: { formato: "podcast" } }), (error) => error.estado === 409 && /tipo/i.test(error.message));
    await assert.rejects(aplicarAccion(e, { accion: "editar_pieza", id: fila.id, cambios: {} }), (error) => error.estado === 409);
    await assert.rejects(aplicarAccion(e, { accion: "editar_pieza", id: fila.id, cambios: { hora: "mañana" } }), (error) => error.estado === 409);
    await aplicarAccion(e, { accion: "editar_pieza", id: fila.id, cambios: { formato: "imagen" } });
    assert.equal((await e.repo.obtenerPieza(fila.id)).pieza.formato, "imagen");
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 0);
  });

  test("adjuntar desde el juego: solo el archivo que pide el tipo, y borra la confirmación", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", llm });
    const fila = await e.cargarPieza();
    const malo = await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "image/jpeg", datos: Buffer.from("x") });
    assert.equal(malo.ok, false);
    assert.match(malo.motivo, /video/);
    assert.equal((await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "application/pdf", datos: Buffer.from("x") })).ok, false);
    const bien = await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "video/mp4", datos: Buffer.from("video") });
    assert.deepEqual([bien.ok, bien.archivos, bien.falta], [true, 1, null]);
    await aplicarAccion(e, { accion: "aprobar_pieza", id: fila.id });
    await aplicarAccion(e, { accion: "confirmar_pieza", id: fila.id });
    await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "video/mp4", datos: Buffer.from("otro") });
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 1, "un reel lleva un solo video");
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
    await aplicarAccion(e, { accion: "quitar_archivos", id: fila.id });
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 0);
  });
});

describe("eliminar una publicación desde el juego", () => {
  test("queda cancelada, sin archivos ni recordatorios, y no se puede eliminar dos veces", async () => {
    const e = crearEscenario();
    const fila = await e.cargarPieza();
    await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "video/mp4", datos: Buffer.from("video") });
    const r = await aplicarAccion(e, { accion: "eliminar_pieza", id: fila.id });
    assert.deepEqual([r.ok, r.estado], [true, "cancelada"]);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "cancelada");
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 0);
    await assert.rejects(aplicarAccion(e, { accion: "eliminar_pieza", id: fila.id }), /no se puede eliminar/);
    await assert.rejects(aplicarAccion(e, { accion: "eliminar_pieza" }), /Falta el id/);
  });
});

describe("quitar del juego una pieza que solo está en los documentos", () => {
  test("queda guardada como oculta, sin duplicar, y llega al estado del juego", async () => {
    const e = crearEscenario();
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "pieza_ocultar", fecha: "2026-10-27", formato: "Carrusel" } });
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "pieza_ocultar", fecha: "2026-10-27", formato: "carrusel" } });
    const estado = await armarEstadoOficina({ repo: e.repo });
    assert.deepEqual(estado.operacion.piezasOcultas, ["2026-10-27|carrusel"]);
    await assert.rejects(aplicarAccion(e, { accion: "operacion", cambio: { tipo: "pieza_ocultar", fecha: "mañana", formato: "reel" } }), /AAAA-MM-DD/);
  });
});

describe("datos de la operación: ida y vuelta entre el juego y el bot", () => {
  test("lo que se edita en el juego queda en la base, llega al estado y al Estratega como novedad", async () => {
    const e = crearEscenario();
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "campo", campo: "estrategia.foco", valor: "Llegan el 5/11, 100 unidades" } });
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "agenda_agregar", fecha: "2026-11-05", hora: "10:00", sala: "deposito", texto: "Retirar las gorras" } });
    const estado = await armarEstadoOficina({ repo: e.repo });
    assert.equal(estado.operacion.campos["estrategia.foco"], "Llegan el 5/11, 100 unidades");
    const [id, ev] = Object.entries(estado.operacion.agenda.propias)[0];
    assert.deepEqual([ev.f, ev.h, ev.sala, ev.t], ["2026-11-05", "10:00", "deposito", "Retirar las gorras"]);
    assert.ok((await e.repo.novedadesPendientes()).some((n) => /Dato actualizado desde la oficina: Foco de la semana/.test(n.texto)));
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "agenda_quitar", clave: id } });
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "agenda_quitar", clave: "2026-11-02|Llegan las medias" } });
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "campo", campo: "estrategia.foco", valor: "" } });
    const tras = await armarEstadoOficina({ repo: e.repo });
    assert.deepEqual([tras.operacion.campos, tras.operacion.agenda.propias, tras.operacion.agenda.ocultas], [{}, {}, ["2026-11-02|Llegan las medias"]]);
    assert.equal(tras.operacion.historial.length, 5);
  });

  test("rechaza datos que no se pueden editar, fechas inválidas y textos vacíos", async () => {
    const e = crearEscenario();
    for (const cambio of [{ tipo: "campo", campo: "marca.nombre", valor: "x" }, { tipo: "agenda_agregar", fecha: "mañana", texto: "x" }, { tipo: "agenda_agregar", fecha: "2026-11-05", texto: " " }, { tipo: "otra" }]) {
      await assert.rejects(aplicarAccion(e, { accion: "operacion", cambio }), (error) => error instanceof ErrorAccion && error.estado === 400);
    }
  });

  test("el bot ve lo que cambió el juego y lo que cambia el bot aparece en el juego", async () => {
    const llm = {
      async conversar({ ejecutar }) {
        const antes = await ejecutar("ver_operacion", {});
        await ejecutar("editar_dato", { campo: "estrategia.notas", valor: "Llegaron, faltan etiquetas" });
        await ejecutar("agregar_agenda", { fecha: "2026-11-06", texto: "Reunión con el proveedor", sala: "deposito" });
        return `Antes: ${antes.campos["estrategia.foco"]}. Listo, quedó guardado.`;
      },
    };
    const e = crearEscenario({ llm });
    await aplicarAccion(e, { accion: "operacion", cambio: { tipo: "campo", campo: "estrategia.foco", valor: "Llegan el 5/11" } });
    const r = await aplicarAccion(e, { accion: "chat", texto: "actualizá medias y agendá la reunión" });
    assert.match(r.respuesta, /Antes: Llegan el 5\/11/);
    assert.doesNotMatch(r.respuesta, /⚠️/);
    const estado = await armarEstadoOficina({ repo: e.repo });
    assert.equal(estado.operacion.campos["estrategia.notas"], "Llegaron, faltan etiquetas");
    assert.equal(Object.values(estado.operacion.agenda.propias)[0].t, "Reunión con el proveedor");
    assert.equal(estado.operacion.historial.at(-1).origen, "bot");
  });

  test("cambiar una pieza que solo está en los documentos la arma en el momento y queda propuesta (no se manda como nota)", async () => {
    const calls = [];
    const editor = { editarPieza: async (pedido) => { calls.push(pedido); return { ok: true, pieza: crearPieza({ fecha: pedido.fila.fecha, formato: pedido.fila.pieza.formato, gancho: "Gancho rehecho" }), hora: "19:00", queCambio: "Rehecha." }; } };
    const e = crearEscenario({ fecha: "2026-10-26", hora: "10:00", editor });
    const r = await aplicarAccion(e, { accion: "cambiar_pieza", fecha: "2026-10-29", formato: "carrusel", indicacion: "más simple", base: "Texto del documento" });
    assert.equal(r.estado, "propuesta");
    const fila = await e.repo.obtenerPieza(r.id);
    assert.equal(fila.fecha, "2026-10-29");
    assert.equal(fila.pieza.gancho, "Gancho rehecho");
    assert.match(calls[0].instruccion, /Texto del documento/);
    assert.match(calls[0].instruccion, /más simple/);
    assert.deepEqual(await e.repo.novedadesPendientes(), [], "no deja una nota suelta");
    // si el día ya tiene pieza en la base, se cambia esa en vez de crear otra
    const otra = await aplicarAccion(e, { accion: "cambiar_pieza", fecha: "2026-10-29", formato: "carrusel", indicacion: "otra" });
    assert.equal(otra.id, r.id);
    assert.equal((await e.repo.piezasDelDia("2026-10-29")).length, 1);
  });
});

describe("editar y adjuntar: casos de borde", () => {
  const llm = { async conversar() { return ""; } };

  test("editar una pieza que solo está en los documentos la carga primero con la IA y después aplica el cambio", async () => {
    const editor = { async editarPieza({ nueva, instruccion }) { assert.ok(nueva); assert.match(instruccion, /SIN cambiar su contenido/); return { ok: true, pieza: crearPieza({ fecha: "2026-10-29", formato: "reel" }), hora: "19:00", queCambio: "", errores: [] }; } };
    const e = crearEscenario({ fecha: "2026-10-26", hora: "08:00", editor, llm });
    const r = await aplicarAccion(e, { accion: "editar_pieza", fecha: "2026-10-29", formato: "reel", base: "Texto del documento", cambios: { epigrafe: "Uno.\n\nDos. Anotate en la lista: link en la bio." } });
    assert.equal(r.estado, "propuesta");
    assert.equal((await e.repo.obtenerPieza(r.id)).pieza.epigrafe, "Uno.\n\nDos. Anotate en la lista: link en la bio.");
    await assert.rejects(aplicarAccion(e, { accion: "editar_pieza", id: 999, cambios: { epigrafe: "x" } }), (error) => error.estado === 409);
  });

  test("una historia acepta una foto o un video, y uno solo", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", llm });
    const fila = await e.cargarPieza();
    await aplicarAccion(e, { accion: "editar_pieza", id: fila.id, cambios: { formato: "story" } });
    assert.equal((await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "image/jpeg", datos: Buffer.from("a") })).ok, true);
    assert.equal((await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "video/mp4", datos: Buffer.from("b") })).ok, true);
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 1);
  });
});

const LINEAS = { fuente: "2026-10-19", lineas: [{ k: "iaaaa1111", t: "Probar carruseles de frase corta." }, { k: "ibbbb2222", t: "No poner ofertas en la primera línea." }] };
const investigacion = async () => LINEAS;

describe("Almacén y Caja: stock y ventas conectados entre el juego y el bot", () => {
  const llegada = (e, sku, cantidad) => aplicarAccion(e, { accion: "inventario", cambio: { tipo: "entrada", sku, cantidad } });

  test("el stock arranca en 0; una llegada lo suma y una venta lo resta sola, con el precio del sistema", async () => {
    const e = crearEscenario({ investigacion });
    const vacio = await armarEstadoOficina({ repo: e.repo, investigacion });
    assert.deepEqual(Object.values(vacio.inventario.stock), [0, 0, 0, 0, 0]);
    await llegada(e, "gorra-negra", 10);
    await llegada(e, "medias", 132);
    const r = await aplicarAccion(e, { accion: "inventario", cambio: { tipo: "venta", items: [{ producto: "pledge", cantidad: 2, gorra: "negra" }, { producto: "medias2", cantidad: 1 }], nota: "Ana" } });
    assert.equal(r.inventario.stock["gorra-negra"], 8);
    assert.equal(r.inventario.stock.medias, 132 - 2 - 2);
    assert.equal(r.inventario.totales.ventas, 1);
    assert.equal(r.inventario.totales.importe, 2 * 34900 + 17900);
    const estado = await armarEstadoOficina({ repo: e.repo, investigacion });
    assert.equal(estado.inventario.stock["gorra-negra"], 8);
    assert.ok((await e.repo.novedadesPendientes()).some((n) => /Caja \(oficina\): Venta: 2 × Pack Pledge/.test(n.texto)));
  });

  test("no deja vender lo que no hay, ni cambiar el precio, y no toca nada si falla", async () => {
    const e = crearEscenario({ investigacion });
    await llegada(e, "shaker-negro", 1);
    const mala = (cambio) => assert.rejects(aplicarAccion(e, { accion: "inventario", cambio }), (error) => error instanceof ErrorAccion && error.estado === 400);
    await mala({ tipo: "venta", items: [{ producto: "shaker", cantidad: 2, shaker: "negro" }] });
    await mala({ tipo: "venta", items: [{ producto: "shaker", cantidad: 1, shaker: "negro", precio: 1 }] });
    await mala({ tipo: "venta", items: [{ producto: "shaker", cantidad: 1 }] });
    await mala({ tipo: "venta", items: [{ producto: "oath", cantidad: 1, gorra: "beige", shaker: "negro" }] });
    await mala({ tipo: "entrada", sku: "remera", cantidad: 3 });
    await mala({ tipo: "entrada", sku: "medias", cantidad: -4 });
    const estado = await armarEstadoOficina({ repo: e.repo, investigacion });
    assert.equal(estado.inventario.stock["shaker-negro"], 1);
    assert.equal(estado.inventario.ventas.length, 0);
  });

  test("anular una venta devuelve el stock, y dos ventas juntas no se pisan", async () => {
    const e = crearEscenario({ investigacion });
    await llegada(e, "medias", 10);
    const [a, b] = await Promise.all([1, 2].map(() => aplicarAccion(e, { accion: "inventario", cambio: { tipo: "venta", items: [{ producto: "medias", cantidad: 3 }] } })));
    assert.equal((await armarEstadoOficina({ repo: e.repo, investigacion })).inventario.stock.medias, 4);
    const t = await aplicarAccion(e, { accion: "inventario", cambio: { tipo: "anular_venta", id: a.id } });
    assert.equal(t.inventario.stock.medias, 7);
    await assert.rejects(aplicarAccion(e, { accion: "inventario", cambio: { tipo: "anular_venta", id: a.id } }), (error) => error.estado === 400);
    assert.equal(t.inventario.totales.ventas, 1);
    void b;
  });

  test("el bot ve el stock del juego y lo que registra el bot (llegada, venta, anulación) aparece en el juego", async () => {
    const llm = {
      async conversar({ ejecutar }) {
        const antes = await ejecutar("ver_stock", {});
        const sinColor = await ejecutar("registrar_venta", { items: [{ producto: "gorra", cantidad: 1 }] });
        await ejecutar("registrar_llegada", { producto: "gorra-beige", cantidad: 5 });
        const v = await ejecutar("registrar_venta", { items: [{ producto: "gorra", cantidad: 2, gorra: "beige" }, { producto: "shaker", cantidad: 1, shaker: "claro" }] });
        const cambiaPrecio = await ejecutar("registrar_venta", { items: [{ producto: "medias", cantidad: 1, precio: 1 }] });
        return `Antes ${antes.stock["shaker-claro"]}. ${sinColor.error ? "Faltaba el color." : ""} ${v.error ?? "Vendido."} ${cambiaPrecio.error ? "Precio fijo." : ""}`;
      },
    };
    const e = crearEscenario({ llm, investigacion });
    await llegada(e, "shaker-claro", 4);
    await llegada(e, "medias", 1);
    const r = await aplicarAccion(e, { accion: "chat", texto: "vendí 2 gorras beige y un shaker claro" });
    assert.match(r.respuesta, /Antes 4\. Faltaba el color\. Vendido\. Precio fijo\./);
    const estado = await armarEstadoOficina({ repo: e.repo, investigacion });
    assert.equal(estado.inventario.stock["gorra-beige"], 3);
    assert.equal(estado.inventario.stock["shaker-claro"], 3);
    assert.equal(estado.inventario.ventas[0].origen, "bot");
    assert.equal(estado.inventario.totales.importe, 2 * 29900 + 12900);
  });
});

describe("estrategia de la semana: sale de la investigación y se modifica desde el juego y el bot", () => {
  const hoy = Date.parse("2026-10-28T15:00:00Z"); // miércoles; la semana arranca el lunes 26/10
  const cambiar = (e, cambio, ahora = hoy) => aplicarAccion(e, { accion: "operacion", cambio }, ahora);

  test("muestra las líneas de la investigación y permite editar, quitar y agregar (y volver atrás)", async () => {
    const e = crearEscenario({ investigacion });
    const e1 = { ...e, investigacion };
    let estado = await armarEstadoOficina({ repo: e.repo, investigacion, ahora: hoy });
    assert.deepEqual(estado.estrategia_semana.lineas.map((l) => l.t), LINEAS.lineas.map((l) => l.t));
    assert.equal(estado.estrategia_semana.semana, "2026-10-26");
    await cambiar(e1, { tipo: "estrategia_editar", clave: "iaaaa1111", texto: "Carruseles de frase, uno por semana." });
    await cambiar(e1, { tipo: "estrategia_quitar", clave: "ibbbb2222" });
    await cambiar(e1, { tipo: "estrategia_agregar", texto: "Mostrar el proceso con las manos." });
    estado = await armarEstadoOficina({ repo: e.repo, investigacion, ahora: hoy });
    assert.deepEqual(estado.estrategia_semana.lineas.map((l) => [l.t, l.origen, l.editada]), [["Carruseles de frase, uno por semana.", "investigacion", true], ["Mostrar el proceso con las manos.", "propia", false]]);
    assert.ok((await e.repo.novedadesPendientes()).some((n) => /Estrategia de la semana: agregó/.test(n.texto)), "el Estratega se entera");
    await assert.rejects(cambiar(e1, { tipo: "estrategia_editar", clave: "inexistente", texto: "x" }), (error) => error.estado === 400);
    await cambiar(e1, { tipo: "estrategia_restaurar" });
    estado = await armarEstadoOficina({ repo: e.repo, investigacion, ahora: hoy });
    assert.equal(estado.estrategia_semana.lineas.length, 2);
    assert.equal(estado.estrategia_semana.cambiada, false);
  });

  test("el lunes siguiente vuelve a arrancar desde la investigación", async () => {
    const e = crearEscenario({ investigacion });
    await cambiar({ ...e, investigacion }, { tipo: "estrategia_quitar", clave: "iaaaa1111" });
    const lunesQueViene = Date.parse("2026-11-02T12:00:00Z");
    const estado = await armarEstadoOficina({ repo: e.repo, investigacion, ahora: lunesQueViene });
    assert.equal(estado.estrategia_semana.lineas.length, 2);
    assert.equal(estado.estrategia_semana.semana, "2026-11-02");
  });

  test("el bot ve las líneas (con id) y las cambia; el juego lo ve", async () => {
    const llm = {
      async conversar({ ejecutar }) {
        const v = await ejecutar("ver_operacion", {});
        const id = v.estrategia_de_la_semana.lineas[0].id;
        await ejecutar("editar_estrategia", { accion: "editar", id, texto: "Más carruseles." });
        const mal = await ejecutar("editar_estrategia", { accion: "borrar" });
        return `${v.estrategia_de_la_semana.lineas.length} líneas. ${mal.error ? "Acción inválida." : ""}`;
      },
    };
    const e = crearEscenario({ llm, investigacion });
    const r = await aplicarAccion(e, { accion: "chat", texto: "cambiá la primera línea de la estrategia" });
    assert.match(r.respuesta, /2 líneas\. Acción inválida\./);
    const estado = await armarEstadoOficina({ repo: e.repo, investigacion });
    assert.equal(estado.estrategia_semana.lineas[0].t, "Más carruseles.");
    assert.equal(estado.operacion.historial.at(-1).origen, "bot");
  });
});

describe("Instagram ya no tiene Productos del Drop", () => {
  test("ese dato ya no se puede editar", async () => {
    const e = crearEscenario({ investigacion });
    await assert.rejects(aplicarAccion(e, { accion: "operacion", cambio: { tipo: "campo", campo: "recepcion.productos", valor: "x" } }), (error) => error.estado === 400);
  });
});
