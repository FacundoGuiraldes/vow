import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearDia, crearEscenario } from "./ayuda-pruebas.js";
import { aplicarAccion, armarEstadoOficina, ErrorAccion } from "./oficina.js";
import { crearRendimientoJuego } from "./rendimiento-juego.js";

describe("la oficina", () => {
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

  test("el estado trae el flujo, la charla reciente y el rendimiento", async () => {
    const e = crearEscenario();
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: { dias: [crearDia({ fecha: "2026-10-30" })] } });
    await e.repo.guardarEstado("chat", Array.from({ length: 20 }, (_, i) => ({ rol: "usuario", texto: `m${i}` })));
    const estado = await armarEstadoOficina({ repo: e.repo, servicio: e.servicio, rendimiento: { obtener: async () => ({ totales: { alcance: 5 } }) }, ahora: Date.UTC(2026, 9, 28) });
    assert.equal(estado.flujo[0].semana, "2026-10-26");
    assert.equal(estado.flujo[0].dias[0].formato, "reel");
    assert.equal(estado.piezas, undefined);
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
