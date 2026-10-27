import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearEscenario, crearPieza, crearPlan, URL_PUBLICA } from "./ayuda-pruebas.js";
import { HERRAMIENTAS_CHAT, MENSAJES_MAXIMOS_POR_DIA } from "./conversacion.js";
import { faltaArchivo, IMAGENES_IA_MAXIMAS_POR_DIA, INTENTOS_IA_POR_PIEZA, TOLERANCIA_MINUTOS } from "./servicio.js";

const VIDEO = Buffer.from("video-de-prueba");

// Deja el reel del viernes 30/10 listo para confirmar: plan recibido, aprobado y con el video adjunto
async function reelListo(escenario, { conVideo = true } = {}) {
  const fila = await escenario.cargarPieza();
  await escenario.mandar(escenario.actualizacion.boton(`aprobar:${fila.id}`));
  if (conVideo) {
    escenario.telegram.archivos.set("vid1", VIDEO);
    await escenario.mandar(escenario.actualizacion.video("vid1"));
  }
  return fila;
}

describe("plan de la semana", () => {
  test("manda el plan con un mensaje por pieza, cada uno con sus botones", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-30" }), crearPieza({ fecha: "2026-11-01", formato: "story", pilar: "proceso", material_a_producir: [] })]) });

    assert.equal(e.telegram.enviados.length, 3); // cabecera + 2 piezas
    assert.match(e.telegram.enviados[0].texto, /Plan de la semana del lunes 26\/10/);
    assert.match(e.telegram.enviados[0].texto, /19:00 hs/);
    assert.ok(e.telegram.enviados[1].botones[0].some((b) => b.dato.startsWith("aprobar:")));
    assert.ok(e.telegram.enviados[1].botones[0].some((b) => b.dato.startsWith("modificar:")));
  });

  test("avisa qué hay que filmar y cuándo se lo va a recordar (3 días antes de la publicación)", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-30" })]) });

    const cabecera = e.telegram.enviados[0].texto;
    assert.match(cabecera, /Tenés que filmar o sacar fotos/);
    assert.match(cabecera, /Pies y manos atando el cordón/);
    assert.match(cabecera, /te lo recuerdo el martes 27\/10/);
    assert.deepEqual((await e.repo.recordatoriosPendientes("2026-10-27")).map((r) => r.fecha), ["2026-10-27"]);
    assert.equal((await e.repo.recordatoriosPendientes("2026-10-26")).length, 0, "antes del 27 todavía no toca");
  });

  test("si ya pasaron los 3 días de aviso, lo marca como urgente en el propio plan y no programa recordatorio", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-28" })]) });

    assert.match(e.telegram.enviados[0].texto, /ya hay que hacerlo/);
    assert.equal((await e.repo.recordatoriosPendientes("2026-12-31")).length, 0);
  });

  test("una pieza que no necesita filmar no genera aviso ni recordatorio", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ material_a_producir: [] })]) });

    assert.match(e.telegram.enviados[0].texto, /No tenés que filmar nada esta semana/);
    assert.equal((await e.repo.recordatoriosPendientes("2026-12-31")).length, 0);
  });

  test("sin hora válida en la pieza, usa la hora por defecto", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ hora: undefined })]) });
    assert.equal((await e.repo.piezasDeSemana("2026-10-26"))[0].hora, "19:00");
  });

  test("un plan nuevo de la misma semana cancela lo que quedaba sin aprobar", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza()]) });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ gancho: "Otro gancho. Hoy." })]) });
    const estados = (await e.repo.piezasDeSemana("2026-10-26")).map((f) => f.estado);
    assert.deepEqual(estados, ["cancelada", "propuesta"]);
  });

  test("'Aprobar todas' aprueba las piezas de la semana", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza(), crearPieza({ fecha: "2026-11-01" })]) });
    await e.mandar(e.actualizacion.boton("aprobar_semana:2026-10-26"));
    const estados = (await e.repo.piezasDeSemana("2026-10-26")).map((f) => f.estado);
    assert.deepEqual(estados, ["aprobada", "aprobada"]);
    assert.match(e.telegram.ultimo().texto, /Plan aprobado/);
  });
});

describe("recordatorio de filmación", () => {
  test("a las 8 de la mañana, 3 días antes, avisa qué filmar; no se repite y lo que se responde queda en la pieza", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-30" })]) });
    const antes = e.telegram.enviados.length;

    e.mover("08:00", "2026-10-27");
    await e.servicio.tick();
    const recordatorio = e.telegram.buscar("Recordatorio");
    assert.ok(recordatorio, "tiene que mandar el recordatorio");
    assert.match(recordatorio.texto, /en 3 días \(viernes 30\/10\)/);
    assert.match(recordatorio.texto, /Pies y manos atando el cordón/);

    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Recordatorio"), 1, "no se repite");
    assert.ok(e.telegram.enviados.length > antes);

    // Responder al recordatorio con el video lo deja adjunto a esa pieza
    e.telegram.archivos.set("vid1", VIDEO);
    await e.mandar(e.actualizacion.video("vid1", { respondeA: recordatorio.id }));
    const [fila] = await e.repo.piezasDeSemana("2026-10-26");
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 1);
    assert.match(e.telegram.ultimo().texto, /Recibido para la pieza del viernes 30\/10/);
  });

  test("no manda recordatorio de una pieza cancelada", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-30" })]) });
    const [fila] = await e.repo.piezasDeSemana("2026-10-26");
    await e.mandar(e.actualizacion.boton(`cancelar:${fila.id}`));
    e.mover("08:00", "2026-10-27");
    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Recordatorio"), 0);
  });
});

describe("aviso de las 8 y confirmación del día", () => {
  test("a las 8 manda lo de hoy con la hora y los botones, una sola vez por día", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "07:59" });
    await reelListo(e);
    const antes = e.telegram.enviados.length;

    await e.servicio.tick(); // 07:59: todavía no
    assert.equal(e.telegram.enviados.length, antes);

    e.mover("08:00");
    await e.servicio.tick();
    const resumen = e.telegram.buscar("Hoy se publica a las 19:00");
    assert.ok(resumen);
    assert.match(resumen.texto, /El archivo está listo/);
    assert.ok(resumen.botones[0][0].dato.startsWith("confirmar:"));

    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Hoy se publica a las 19:00"), 1);
  });

  test("si falta el archivo, el aviso de las 8 lo dice", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    await reelListo(e, { conVideo: false });
    await e.servicio.tick();
    assert.match(e.telegram.buscar("Hoy se publica a las 19:00").texto, /Falta el video/);
  });

  test("la confirmación solo vale el mismo día: el botón de otro día no confirma nada", async () => {
    const e = crearEscenario({ fecha: "2026-10-28", hora: "08:00" });
    const fila = await reelListo(e);

    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /solo vale el mismo día/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
  });

  test("no deja confirmar si falta el archivo", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e, { conVideo: false });
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /No se puede confirmar todavía/);
    assert.match(e.telegram.ultimo().texto, /Falta el video/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
  });

  test("no deja confirmar un epígrafe que rompe las reglas de marca", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.repo.actualizarPieza(fila.id, { pieza: { ...fila.pieza, epigrafe: "Últimas unidades, solo hoy. Comprá ya." } });
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /No se puede confirmar todavía/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
  });

  test("confirmar con la hora ya pasada pregunta si publicar ahora, no publica solo", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "19:10" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /Ya pasó la hora/);
    assert.ok(e.telegram.ultimo().botones[0].some((b) => b.dato === `publicar_ahora:${fila.id}`));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
  });
});

describe("publicación a la hora", () => {
  test("camino completo: confirma a la mañana, a las 18:45 arma el contenedor, a las 19:00 publica una sola vez", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /Confirmada\. Se publica hoy a las 19:00/);

    e.mover("18:29");
    await e.servicio.tick();
    assert.equal(e.meta.llamadas.length, 0, "falta más de 15 minutos: no toca Meta");

    e.mover("18:45");
    await e.servicio.tick();
    assert.equal(e.meta.veces("crearContenedor"), 1);
    const [, parametros] = e.meta.llamadas[0];
    assert.equal(parametros.media_type, "REELS");
    assert.match(parametros.video_url, new RegExp(`^${URL_PUBLICA}/api/programacion/medios/[a-f0-9]{48}$`));
    assert.equal(parametros.caption, fila.pieza.epigrafe);
    assert.equal(e.meta.veces("publicar"), 0, "todavía no es la hora");
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "preparada");

    e.mover("19:00");
    await e.servicio.tick();
    assert.equal(e.meta.veces("publicar"), 1);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "publicada");
    assert.match(e.telegram.ultimo().texto, /Publicada a las 19:00/);
    assert.match(e.telegram.ultimo().texto, /instagram\.com\/p\/ABC123/);
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 0, "el archivo se borra de la base una vez publicado");

    for (const hora of ["19:01", "19:05", "19:30", "23:00"]) {
      e.mover(hora);
      await e.servicio.tick();
    }
    assert.equal(e.meta.veces("publicar"), 1, "nunca se publica dos veces");
    assert.equal(e.meta.veces("crearContenedor"), 1);
  });

  test("dos ciclos al mismo tiempo (cron-job.org y GitHub Actions) no duplican la publicación", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("18:50");
    await Promise.all([e.servicio.tick(), e.servicio.tick()]);
    assert.equal(e.meta.veces("crearContenedor"), 1);

    e.mover("19:00");
    await Promise.all([e.servicio.tick(), e.servicio.tick(), e.servicio.tick()]);
    assert.equal(e.meta.veces("publicar"), 1);
  });

  test("sin confirmación del día no se publica nada: avisa una sola vez y pregunta", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e); // aprobada para la semana, pero NO confirmada hoy
    for (const hora of ["18:45", "19:00", "19:01", "20:00"]) {
      e.mover(hora);
      await e.servicio.tick();
    }
    assert.equal(e.meta.llamadas.length, 0);
    assert.equal(e.telegram.cantidad("no confirmaste esta pieza"), 1);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
  });

  test("dos horas antes, si no confirmó, le recuerda con botones; una sola vez; sin respuesta no se publica nada", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    e.mover("16:59");
    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Faltan 2 horas"), 0, "todavía falta más de dos horas");
    for (const hora of ["17:00", "17:01", "18:00"]) {
      e.mover(hora);
      await e.servicio.tick();
    }
    assert.equal(e.telegram.cantidad("Faltan 2 horas para las 19:00"), 1);
    const aviso = e.telegram.buscar("Faltan 2 horas");
    assert.match(aviso.texto, /Si no respondés, no se publica nada/);
    assert.ok(JSON.stringify(aviso.botones ?? aviso.opciones ?? aviso).includes(`confirmar:${fila.id}`), "trae el botón de confirmar");
    for (const hora of ["18:45", "19:00", "19:10"]) {
      e.mover(hora);
      await e.servicio.tick();
    }
    assert.equal(e.meta.llamadas.length, 0, "sin confirmación no se publica");
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
  });

  test("si ya confirmó, no hay recordatorio de dos horas", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("17:00");
    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Faltan 2 horas"), 0);
  });

  test("si cambia la hora de la pieza, el recordatorio vuelve a avisar para la nueva", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    e.mover("17:00");
    await e.servicio.tick();
    await e.repo.actualizarPieza(fila.id, { hora: "21:00" });
    e.mover("19:00");
    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Faltan 2 horas"), 2);
  });

  test("una confirmación de otro día no autoriza publicar hoy", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "19:00" });
    const fila = await reelListo(e);
    await e.repo.actualizarPieza(fila.id, { estado: "confirmada", confirmada_el: "2026-10-29" });
    await e.servicio.tick();
    assert.equal(e.meta.llamadas.length, 0);
  });

  test("si el sistema estuvo caído y llega tarde, no publica solo: pregunta, y 'Publicar ahora' lo publica", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));

    e.mover(`19:${String(TOLERANCIA_MINUTOS + 1).padStart(2, "0")}`);
    await e.servicio.tick();
    assert.equal(e.meta.llamadas.length, 0);
    const pregunta = e.telegram.buscar("Se pasó la hora");
    assert.ok(pregunta);
    await e.servicio.tick();
    assert.equal(e.telegram.cantidad("Se pasó la hora"), 1, "pregunta una sola vez");

    await e.mandar(e.actualizacion.boton(`publicar_ahora:${fila.id}`, pregunta.id));
    const actualizada = await e.repo.obtenerPieza(fila.id);
    assert.equal(actualizada.estado, "confirmada");
    assert.equal(actualizada.hora, "19:26");

    await e.servicio.tick(); // 19:21, faltan 5 minutos: arma el contenedor
    assert.equal(e.meta.veces("crearContenedor"), 1);
    e.mover("19:26");
    await e.servicio.tick();
    assert.equal(e.meta.veces("publicar"), 1);
  });

  test("/pausar frena la publicación y /reanudar la deja salir si todavía está a tiempo", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("18:50");
    await e.servicio.tick();

    await e.mandar(e.actualizacion.texto("/pausar"));
    e.mover("19:00");
    await e.servicio.tick();
    await e.servicio.tick();
    assert.equal(e.meta.veces("publicar"), 0);
    assert.equal(e.telegram.cantidad("Estás en pausa"), 1);

    await e.mandar(e.actualizacion.texto("/reanudar"));
    e.mover("19:05");
    await e.servicio.tick();
    assert.equal(e.meta.veces("publicar"), 1);
  });

  test("modo simulación: recorre todo el flujo pero nunca toca Instagram", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", permitirPublicar: false, sinMeta: true });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /Modo simulación/);
    e.mover("18:50");
    await e.servicio.tick();
    e.mover("19:00");
    await e.servicio.tick();
    assert.match(e.telegram.ultimo().texto, /\[SIMULACIÓN\]/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "manual");
  });

  test("si Meta falla al publicar, queda 'fallida', avisa y NO reintenta sola", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("18:50");
    await e.servicio.tick();
    e.meta.estado.fallaAlPublicar = true;
    e.mover("19:00");
    await e.servicio.tick();

    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "fallida");
    assert.match(e.telegram.ultimo().texto, /Falló la publicación/);
    assert.match(e.telegram.ultimo().texto, /puede haberse publicado igual/);
    for (const hora of ["19:01", "19:02", "19:10"]) {
      e.mover(hora);
      await e.servicio.tick();
    }
    assert.equal(e.meta.veces("publicar"), 1);
  });

  test("si Meta todavía está procesando el video, espera y publica en el próximo ciclo", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("18:50");
    await e.servicio.tick();

    e.meta.estado.contenedor = "IN_PROGRESS";
    e.mover("19:00");
    await e.servicio.tick();
    assert.equal(e.meta.veces("publicar"), 0);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "preparada");

    e.meta.estado.contenedor = "FINISHED";
    e.mover("19:01");
    await e.servicio.tick();
    assert.equal(e.meta.veces("publicar"), 1);
  });

  test("si Meta no pudo procesar el archivo, no publica y pide volver a confirmar", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("18:50");
    await e.servicio.tick();
    e.meta.estado.contenedor = "ERROR";
    e.mover("19:00");
    await e.servicio.tick();

    assert.equal(e.meta.veces("publicar"), 0);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
    assert.match(e.telegram.ultimo().texto, /Meta no pudo procesar el archivo/);
  });

  test("si no se puede armar el contenedor, reintenta y al tercer fallo avisa sin publicar nada", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.meta.estado.cupo = { usado: 100, total: 100 };
    for (const hora of ["18:46", "18:47", "18:48"]) {
      e.mover(hora);
      await e.servicio.tick();
    }
    assert.equal(e.meta.llamadas.length, 0);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
    assert.match(e.telegram.ultimo().texto, /No pude preparar la publicación/);
    assert.match(e.telegram.ultimo().texto, /cupo/);
  });

  test("una historia con foto se publica sola a la hora, sin epígrafe", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await e.cargarPieza({ formato: "story", pilar: "proceso", epigrafe: "", material_a_producir: [] });
    await e.mandar(e.actualizacion.boton(`aprobar:${fila.id}`));
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /No se puede confirmar todavía/);
    assert.match(e.telegram.ultimo().texto, /Falta la foto o el video de la historia/);
    await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "image/jpeg", datos: Buffer.from("foto") });
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /Se publica hoy a las/);
    e.mover("18:50");
    await e.servicio.tick();
    const [, parametros] = e.meta.llamadas.find(([n]) => n === "crearContenedor");
    assert.equal(parametros.media_type, "STORIES");
    assert.ok(parametros.image_url);
    assert.equal(parametros.caption, undefined);
    e.mover("19:00");
    await e.servicio.tick();
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "publicada");
    assert.equal(e.meta.veces("publicar"), 1);
  });

  test("una historia con video usa video_url", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await e.cargarPieza({ formato: "story", pilar: "proceso", epigrafe: "", material_a_producir: [] });
    await e.servicio.adjuntarDesdeJuego(fila.id, { mime: "video/mp4", datos: Buffer.from("video") });
    await e.mandar(e.actualizacion.boton(`aprobar:${fila.id}`));
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    e.mover("18:50");
    await e.servicio.tick();
    const [, parametros] = e.meta.llamadas.find(([n]) => n === "crearContenedor");
    assert.equal(parametros.media_type, "STORIES");
    assert.ok(parametros.video_url);
    assert.equal(parametros.image_url, undefined);
  });
});

describe("archivos", () => {
  test("un archivo sin responder va a la única pieza próxima a la que le falta material", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    await e.cargarPieza();
    e.telegram.archivos.set("vid1", VIDEO);
    await e.mandar(e.actualizacion.video("vid1"));
    const [fila] = await e.repo.piezasDeSemana("2026-10-26");
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 1);
  });

  test("si hay dos candidatas, pide que responda a la pieza", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza(), crearPieza({ fecha: "2026-11-01", gancho: "Sostenelo hoy. Cumplilo." })]) });
    e.telegram.archivos.set("vid1", VIDEO);
    await e.mandar(e.actualizacion.video("vid1"));
    assert.match(e.telegram.ultimo().texto, /No sé para qué pieza es/);
  });

  test("si respondió a un mensaje del chat, la fecha que nombra ahí dice de qué pieza es", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-29" }), crearPieza({ fecha: "2026-11-01", gancho: "Sostenelo hoy. Cumplilo." })]) });
    e.telegram.archivos.set("vid1", VIDEO);
    await e.mandar(e.actualizacion.video("vid1", { respondeTexto: "Entonces la publicación para el jueves 29/10 quedaría así, con el video adjunto." }));
    const filas = await e.repo.piezasDeSemana("2026-10-26");
    const jueves = filas.find((f) => f.fecha === "2026-10-29");
    const domingo = filas.find((f) => f.fecha === "2026-11-01");
    assert.equal((await e.repo.mediosDePieza(jueves.id)).length, 1);
    assert.equal((await e.repo.mediosDePieza(domingo.id)).length, 0);
    assert.match(e.telegram.ultimo().texto, /Recibido para la pieza del jueves 29\/10/);
  });

  test("la fecha en el texto del archivo también sirve", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-29" }), crearPieza({ fecha: "2026-11-01", gancho: "Sostenelo hoy. Cumplilo." })]) });
    e.telegram.archivos.set("vid1", VIDEO);
    await e.mandar(e.actualizacion.video("vid1", { pie: "para el domingo" }));
    const domingo = (await e.repo.piezasDeSemana("2026-10-26")).find((f) => f.fecha === "2026-11-01");
    assert.equal((await e.repo.mediosDePieza(domingo.id)).length, 1);
  });

  test("si no se sabe de qué pieza es, lista las que esperan archivo", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza({ fecha: "2026-10-29" }), crearPieza({ fecha: "2026-11-01", gancho: "Sostenelo hoy. Cumplilo." })]) });
    e.telegram.archivos.set("vid1", VIDEO);
    await e.mandar(e.actualizacion.video("vid1", { respondeTexto: "Drop 01 en 2027, sí… pero la paciencia no es nuestro fuerte." }));
    const texto = e.telegram.ultimo().texto;
    assert.match(texto, /No sé para qué pieza es/);
    assert.match(texto, /jueves 29\/10/);
    assert.match(texto, /domingo 01\/11/);
  });

  test("si algo falla al guardar el archivo, lo avisa en vez de quedarse callado", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    const fila = await e.cargarPieza();
    e.telegram.archivos.set("vid1", VIDEO);
    e.repo.agregarMedio = async () => { throw new Error("la base no responde"); };
    await e.mandar(e.actualizacion.video("vid1", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    assert.match(e.telegram.ultimo().texto, /No pude terminar eso: la base no responde/);
  });

  test("rechaza un formato que no corresponde (foto para un reel)", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    const fila = await e.cargarPieza();
    e.telegram.archivos.set("foto1", Buffer.from("jpg"));
    await e.mandar(e.actualizacion.foto("foto1", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    assert.match(e.telegram.ultimo().texto, /necesita un video/);
  });

  test("si Telegram no deja bajar el archivo (más de 20 MB), lo explica", async () => {
    const e = crearEscenario({ fecha: "2026-10-27" });
    await e.cargarPieza();
    await e.mandar(e.actualizacion.video("no-existe"));
    assert.match(e.telegram.ultimo().texto, /No pude bajar el archivo/);
  });

  test("cambiar el archivo de una pieza ya confirmada borra la confirmación", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "confirmada");

    e.telegram.archivos.set("vid2", Buffer.from("otro video"));
    await e.mandar(e.actualizacion.video("vid2", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    const despues = await e.repo.obtenerPieza(fila.id);
    assert.equal(despues.estado, "aprobada");
    assert.equal(despues.confirmada_el, null);
    assert.match(e.telegram.ultimo().texto, /volver a confirmar/);
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 1, "el reel queda con un solo video: el nuevo");
  });

  test("un carrusel necesita al menos 2 fotos", () => {
    const fila = { pieza: { formato: "carrusel" } };
    assert.match(faltaArchivo(fila, [{ tipo: "imagen" }]), /Faltan fotos: tengo 1/);
    assert.equal(faltaArchivo(fila, [{ tipo: "imagen" }, { tipo: "imagen" }]), null);
    assert.match(faltaArchivo({ pieza: { formato: "reel" } }, [{ tipo: "imagen" }]), /no son del tipo/);
    assert.match(faltaArchivo({ pieza: { formato: "story" } }, []), /foto o el video de la historia/);
    assert.equal(faltaArchivo({ pieza: { formato: "story" } }, [{ tipo: "video" }]), null);
    assert.equal(faltaArchivo({ pieza: { formato: "story" } }, [{ tipo: "imagen" }]), null);
  });
});

describe("respuestas y novedades", () => {
  const editorQue = (resultado) => ({ editarPieza: async (pedido) => ({ ...(typeof resultado === "function" ? resultado(pedido) : resultado) }) });

  test("responder a una pieza aplica el cambio, la deja para aprobar de nuevo y borra la confirmación", async () => {
    const e = crearEscenario({
      fecha: "2026-10-30",
      hora: "08:00",
      editor: editorQue(({ fila }) => ({ ok: true, pieza: { ...fila.pieza, gancho: "Cumplí. Sin avisar." }, hora: "20:30", queCambio: "Cambié el gancho y la hora." })),
    });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    const original = (await e.repo.obtenerPieza(fila.id)).mensajes[0];

    await e.mandar(e.actualizacion.texto("cambiá el gancho y pasala a las 20:30", { respondeA: original }));
    const editada = await e.repo.obtenerPieza(fila.id);
    assert.equal(editada.pieza.gancho, "Cumplí. Sin avisar.");
    assert.equal(editada.hora, "20:30");
    assert.equal(editada.estado, "propuesta");
    assert.equal(editada.confirmada_el, null, "una edición siempre pide confirmar de nuevo");
    assert.match(e.telegram.ultimo().texto, /Cambié el gancho y la hora/);
    assert.ok(e.telegram.ultimo().botones[0].some((b) => b.dato.startsWith("aprobar:")));
  });

  test("si la edición rompe las reglas de marca, no se guarda y se cuenta por qué", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", editor: editorQue({ ok: false, errores: ["Pieza 1: urgencia falsa (\"solo hoy\")."] }) });
    const fila = await reelListo(e);
    const original = (await e.repo.obtenerPieza(fila.id)).mensajes[0];
    await e.mandar(e.actualizacion.texto("poné 'solo hoy' en el gancho", { respondeA: original }));
    assert.match(e.telegram.ultimo().texto, /No apliqué el cambio/);
    assert.match(e.telegram.ultimo().texto, /urgencia falsa/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).pieza.gancho, "Atate el compromiso. Salí.");
  });

  test("cambiar la fecha reprograma el recordatorio de filmación", async () => {
    const e = crearEscenario({
      fecha: "2026-10-26",
      editor: editorQue(({ fila }) => ({ ok: true, pieza: { ...fila.pieza, fecha: "2026-11-02" }, hora: fila.hora, queCambio: "Pasé la pieza al lunes 2/11." })),
    });
    const fila = await e.cargarPieza({ fecha: "2026-10-30" });
    assert.equal((await e.repo.recordatoriosPendientes("2026-10-27")).length, 1);
    await e.mandar(e.actualizacion.texto("pasala al lunes que viene", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    assert.equal((await e.repo.recordatoriosPendientes("2026-10-27")).length, 0, "el aviso viejo ya no corresponde");
    assert.equal((await e.repo.recordatoriosPendientes("2026-10-30")).length, 1, "el nuevo es 3 días antes del 2/11");
  });

  test("tiene un tope de ediciones por día (freno de gasto)", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", editor: editorQue({ ok: false, errores: ["no"] }) });
    const fila = await reelListo(e);
    const original = (await e.repo.obtenerPieza(fila.id)).mensajes[0];
    await e.repo.guardarEstado("ediciones:2026-10-30", 30);
    await e.mandar(e.actualizacion.texto("otro gancho", { respondeA: original }));
    assert.match(e.telegram.ultimo().texto, /máximo de 30 ediciones/);
  });

  test("sin IA configurada lo dice en vez de fallar", async () => {
    const e = crearEscenario({ fecha: "2026-10-30" });
    const fila = await reelListo(e);
    await e.mandar(e.actualizacion.texto("otro gancho", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    assert.match(e.telegram.ultimo().texto, /no está configurada/);
  });

  test("un mensaje sin responder a nada es una novedad de VOW para el próximo plan", async () => {
    const e = crearEscenario();
    await e.mandar(e.actualizacion.texto("Ya llegaron las gorras"));
    assert.deepEqual((await e.repo.novedadesPendientes()).map((n) => n.texto), ["Ya llegaron las gorras"]);
    assert.match(e.telegram.ultimo().texto, /Anotado/);
  });

  test("las novedades se marcan como usadas cuando llega el plan que las leyó", async () => {
    const e = crearEscenario({ fecha: "2026-10-26" });
    await e.mandar(e.actualizacion.texto("Ya llegaron las gorras"));
    const [novedad] = await e.repo.novedadesPendientes();
    await e.servicio.recibirPlan({ semana: "2026-10-26", plan: crearPlan([crearPieza()]), novedadesUsadas: [novedad.id] });
    assert.equal((await e.repo.novedadesPendientes()).length, 0);
  });
});

describe("seguridad del chat", () => {
  test("ignora lo que llega de otro chat", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await reelListo(e);
    const antes = e.telegram.enviados.length;
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`, 1, 999));
    await e.mandar(e.actualizacion.texto("/pausar", { chat: 999 }));
    assert.equal(e.telegram.enviados.length, antes);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
    assert.equal(await e.repo.leerEstado("pausa"), null);
  });

  test("/start desde otro chat solo dice cuál es su chat id (para configurarlo)", async () => {
    const e = crearEscenario();
    await e.mandar(e.actualizacion.texto("/start", { chat: 777 }));
    assert.equal(e.telegram.ultimo().destino, 777);
    assert.match(e.telegram.ultimo().texto, /Tu chat id es 777/);
  });

  test("/estado cuenta si está pausado, si publica de verdad y qué viene", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", permitirPublicar: false, sinMeta: true });
    await reelListo(e);
    await e.mandar(e.actualizacion.texto("/estado"));
    assert.match(e.telegram.ultimo().texto, /Modo simulación/);
    assert.match(e.telegram.ultimo().texto, /viernes 30\/10 19:00 hs · reel/);
  });
});

// ───────────────────────── Imágenes con IA ─────────────────────────
// Generador falso: anota las descripciones y devuelve bytes distintos en cada intento
function generadorFalso({ falla = null } = {}) {
  const descripciones = [];
  return {
    descripciones,
    async generar({ descripcion }) {
      if (falla) throw new Error(falla);
      descripciones.push(descripcion);
      return Buffer.from(`imagen-${descripciones.length}`);
    },
  };
}
const todosLosBotones = (mensaje) => (mensaje.botones ?? []).flat().map((b) => b.dato);
// La tarjeta de la pieza (la primera con botón de aprobar esa pieza; el primer mensaje del plan es el resumen)
const tarjetaDePieza = (e) => e.telegram.enviados.find((m) => todosLosBotones(m).some((d) => /^aprobar:/.test(d)));

describe("imágenes con IA", () => {
  async function escenarioConImagen(opciones = {}) {
    const generador = generadorFalso(opciones);
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00", generadorImagen: opciones.sinGenerador ? null : generador });
    const fila = await e.cargarPieza({ formato: "imagen", guion: "Fondo negro liso con espacio vacío.", gancho: "Estate en la lista." });
    const mensajePieza = (await e.repo.obtenerPieza(fila.id)).mensajes[0];
    return { e, fila, mensajePieza, generador };
  }

  test("la tarjeta de una imagen ofrece el botón de IA; la de un reel o sin generador, no", async () => {
    const { e } = await escenarioConImagen();
    assert.ok(todosLosBotones(tarjetaDePieza(e)).some((d) => d.startsWith("ia:")));
    const reel = crearEscenario({ generadorImagen: generadorFalso() });
    await reel.cargarPieza({ formato: "reel" });
    assert.ok(!todosLosBotones(tarjetaDePieza(reel)).some((d) => d.startsWith("ia:")));
    const sin = await escenarioConImagen({ sinGenerador: true });
    assert.ok(!todosLosBotones(tarjetaDePieza(sin.e)).some((d) => d.startsWith("ia:")));
  });

  test("generar → ver la imagen en Telegram → 'Usar esta' la guarda como archivo de la pieza", async () => {
    const { e, fila, generador } = await escenarioConImagen();
    await e.mandar(e.actualizacion.boton(`ia:${fila.id}`));
    assert.equal(generador.descripciones.length, 1);
    assert.match(generador.descripciones[0], /Fondo negro liso/, "sin indicación usa el guion de la pieza");
    const foto = e.telegram.enviados.find((m) => m.foto);
    assert.deepEqual(todosLosBotones(foto), [`ia_usar:${fila.id}`, `ia_otra:${fila.id}`, `ia_cambiar:${fila.id}`]);
    assert.match(foto.texto, /1 de 3/);
    assert.equal(await e.repo.leerEstado("ia-dia:2026-10-30"), 1, "cuenta la imagen en el tope diario");
    assert.deepEqual(await e.repo.mediosDePieza(fila.id), [], "todavía no se usó: no hay archivo");

    await e.mandar(e.actualizacion.boton(`ia_usar:${fila.id}`, foto.id));
    const medios = await e.repo.mediosDePieza(fila.id);
    assert.equal(medios.length, 1);
    assert.equal(medios[0].tipo, "imagen");
    assert.equal(medios[0].mime, "image/jpeg");
    assert.equal((await e.repo.medioPorToken(medios[0].token)).datos.toString(), "imagen-1");
    assert.ok(e.telegram.quitados.includes(foto.id), "se sacan los botones de la imagen usada");
    assert.match(e.telegram.ultimo().texto, /Ya tiene todo el material/);

    // y desde ahí se puede confirmar como cualquier otra pieza
    await e.mandar(e.actualizacion.boton(`aprobar:${fila.id}`));
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "confirmada");
  });

  test("'Otra' genera de nuevo con la misma indicación, saca los botones de la anterior y la anterior ya no se puede usar", async () => {
    const { e, fila, generador } = await escenarioConImagen();
    await e.mandar(e.actualizacion.boton(`ia:${fila.id}`));
    const primera = e.telegram.enviados.find((m) => m.foto);
    await e.mandar(e.actualizacion.boton(`ia_otra:${fila.id}`, primera.id));
    const fotos = e.telegram.enviados.filter((m) => m.foto);
    assert.equal(fotos.length, 2);
    assert.match(fotos[1].texto, /2 de 3/);
    assert.equal(generador.descripciones[1], generador.descripciones[0]);
    assert.ok(e.telegram.quitados.includes(primera.id));

    await e.mandar(e.actualizacion.boton(`ia_usar:${fila.id}`, primera.id)); // botón viejo
    assert.match(e.telegram.ultimo().texto, /ya no es la última/);
    assert.deepEqual(await e.repo.mediosDePieza(fila.id), []);
    await e.mandar(e.actualizacion.boton(`ia_usar:${fila.id}`, fotos[1].id));
    const [medio] = await e.repo.mediosDePieza(fila.id);
    assert.equal((await e.repo.medioPorToken(medio.token)).datos.toString(), "imagen-2");
  });

  test("tiene tope de intentos por pieza y de imágenes por día", async () => {
    const { e, fila } = await escenarioConImagen();
    for (let i = 0; i < INTENTOS_IA_POR_PIEZA + 1; i++) await e.mandar(e.actualizacion.boton(`ia:${fila.id}`));
    assert.equal(e.telegram.enviados.filter((m) => m.foto).length, INTENTOS_IA_POR_PIEZA);
    assert.match(e.telegram.ultimo().texto, new RegExp(`Ya hice ${INTENTOS_IA_POR_PIEZA} imágenes`));

    const { e: dia } = await escenarioConImagen();
    await dia.repo.guardarEstado("ia-dia:2026-10-30", IMAGENES_IA_MAXIMAS_POR_DIA);
    const [cualquiera] = await dia.repo.piezasDeSemana("2026-10-26");
    await dia.mandar(dia.actualizacion.boton(`ia:${cualquiera.id}`));
    assert.equal(dia.telegram.enviados.filter((m) => m.foto).length, 0);
    assert.match(dia.telegram.ultimo().texto, /máximo de 10 imágenes con IA por día/);
  });

  test("/ia respondiendo a la pieza usa la indicación que escribís; sin responder explica cómo", async () => {
    const { e, mensajePieza, generador } = await escenarioConImagen();
    await e.mandar(e.actualizacion.texto("/ia una mesa de madera con luz de ventana", { respondeA: mensajePieza }));
    assert.deepEqual(generador.descripciones, ["una mesa de madera con luz de ventana"]);
    assert.equal(e.telegram.enviados.filter((m) => m.foto).length, 1);
    await e.mandar(e.actualizacion.texto("/ia otra cosa"));
    assert.match(e.telegram.ultimo().texto, /Respondé al mensaje de una pieza con \/ia/);
    assert.equal(generador.descripciones.length, 1);
  });

  test("'Otra' después de /ia mantiene la indicación nueva, no vuelve al guion", async () => {
    const { e, fila, mensajePieza, generador } = await escenarioConImagen();
    await e.mandar(e.actualizacion.texto("/ia un fondo beige", { respondeA: mensajePieza }));
    const foto = e.telegram.enviados.find((m) => m.foto);
    await e.mandar(e.actualizacion.boton(`ia_otra:${fila.id}`, foto.id));
    assert.deepEqual(generador.descripciones, ["un fondo beige", "un fondo beige"]);
  });

  test("si el generador falla, lo cuenta, no gasta un intento y no deja nada a medias", async () => {
    const { e, fila } = await escenarioConImagen({ falla: "Se agotó el cupo gratis de imágenes por ahora." });
    await e.mandar(e.actualizacion.boton(`ia:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /No pude generar la imagen: Se agotó el cupo gratis/);
    assert.equal(await e.repo.leerEstado(`ia:${fila.id}`), null);
    assert.equal(await e.repo.leerEstado("ia-dia:2026-10-30"), null);
    assert.equal(e.telegram.enviados.filter((m) => m.foto).length, 0);
  });

  test("solo genera imágenes: un reel se rechaza, y sin la clave lo dice", async () => {
    const reel = crearEscenario({ generadorImagen: generadorFalso() });
    const filaReel = await reel.cargarPieza({ formato: "reel" });
    await reel.mandar(reel.actualizacion.boton(`ia:${filaReel.id}`));
    assert.match(reel.telegram.ultimo().texto, /solo las piezas de tipo imagen/);
    const { e, fila } = await escenarioConImagen({ sinGenerador: true });
    await e.mandar(e.actualizacion.boton(`ia:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN/);
  });

  test("usar una imagen sobre una pieza ya confirmada borra la confirmación", async () => {
    const { e, fila } = await escenarioConImagen();
    e.telegram.archivos.set("f1", Buffer.from("foto-propia"));
    await e.mandar(e.actualizacion.foto("f1", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    await e.mandar(e.actualizacion.boton(`aprobar:${fila.id}`));
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "confirmada");
    await e.mandar(e.actualizacion.boton(`ia:${fila.id}`));
    const foto = e.telegram.enviados.find((m) => m.foto);
    await e.mandar(e.actualizacion.boton(`ia_usar:${fila.id}`, foto.id));
    const despues = await e.repo.obtenerPieza(fila.id);
    assert.equal(despues.estado, "aprobada");
    assert.equal(despues.confirmada_el, null);
    assert.match(e.telegram.ultimo().texto, /volver a confirmar/);
  });

  test("ignora el botón de IA si viene de otro chat", async () => {
    const { e, fila, generador } = await escenarioConImagen();
    await e.mandar(e.actualizacion.boton(`ia:${fila.id}`, 1, 999));
    assert.equal(generador.descripciones.length, 0);
  });
});

// ───────────────────────── Chat con la IA ─────────────────────────
// IA falsa: recibe lo mismo que Gemini (sistema, charla, herramientas) y un guion que decide qué hacer con las herramientas
function llmFalso(guion = async () => "Listo.") {
  const llamadas = [];
  return { llamadas, async conversar(argumentos) { llamadas.push(argumentos); return guion(argumentos); } };
}

describe("chat con la IA", () => {
  async function escenarioChat(guion, opciones = {}) {
    const llm = llmFalso(guion);
    const e = crearEscenario({ fecha: "2026-10-30", hora: "10:00", llm, ...opciones });
    const fila = await e.cargarPieza();
    await e.mandar(e.actualizacion.boton(`aprobar:${fila.id}`));
    return { e, fila, llm, ultimo: () => e.telegram.ultimo() };
  }
  const escribir = (e, texto, opciones) => e.mandar(e.actualizacion.texto(texto, opciones));

  test("un mensaje suelto va a la IA con la fecha de hoy y el calendario, y su respuesta le llega a Facundo", async () => {
    const { e, llm } = await escenarioChat(async () => "Esta semana tenés una pieza.");
    await escribir(e, "¿qué tengo esta semana?");
    assert.equal(llm.llamadas.length, 1);
    assert.match(llm.llamadas[0].sistema, /viernes 2026-10-30, 10:00/);
    assert.match(llm.llamadas[0].sistema, /mañana: sábado 31\/10 = 2026-10-31/);
    assert.match(llm.llamadas[0].sistema, /NUNCA confirmás ni cancelás/);
    assert.match(llm.llamadas[0].sistema, /Los videos y las fotos NO pasan por vos/, "la IA sabe que el bot recibe los archivos y cómo se le indica la pieza");
    assert.equal(e.telegram.ultimo().texto, "Esta semana tenés una pieza.");
    assert.deepEqual(await e.repo.novedadesPendientes(), [], "no es una novedad");
  });

  test("si la IA dice que guardó un cambio sin haber llamado a modificar_pieza, se le avisa a Facundo que NO se guardó", async () => {
    const { e, fila } = await escenarioChat(async () => "Listo, el epígrafe quedó guardado.");
    await escribir(e, "el epígrafe tiene que ser: Se construye sin ruido");
    assert.match(e.telegram.ultimo().texto, /NO se guardó ningún cambio en la pieza/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).pieza.epigrafe, crearPieza().epigrafe);
  });

  test("si la herramienta rechazó el cambio y la IA dice que quedó, Facundo ve el motivo", async () => {
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      await ejecutar("modificar_pieza", { id: 1, cambios: { epigrafe: "Solo hoy: comprá ya" } });
      return "Ya lo cambié.";
    }, { });
    void fila;
    await escribir(e, "poné ese epígrafe");
    assert.match(e.telegram.ultimo().texto, /No quedó guardado: el sistema rechazó el cambio/);
  });

  test("si la IA llamó a modificar_pieza y funcionó, no hay ninguna advertencia", async () => {
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      const r = await ejecutar("modificar_pieza", { id: 1, cambios: { epigrafe: "Se construye sin ruido, un paso por día. Anotate en la lista de espera: link en la bio." } });
      return r.ok ? "Listo, quedó guardado." : "No se pudo.";
    }, { });
    void fila;
    await escribir(e, "poné ese epígrafe");
    assert.doesNotMatch(e.telegram.ultimo().texto, /⚠️/);
  });

  test("una respuesta que solo informa no dispara la advertencia", async () => {
    const { e } = await escenarioChat(async () => "El epígrafe actual dice: Nadie ve este momento.");
    await escribir(e, "cómo queda?");
    assert.doesNotMatch(e.telegram.ultimo().texto, /⚠️/);
  });

  test("recuerda la charla: el segundo mensaje llega con el anterior y la respuesta anterior", async () => {
    const { e, llm } = await escenarioChat(async ({ historial }) => `Mensajes que veo: ${historial.length}`);
    await escribir(e, "hola");
    await escribir(e, "y ahora?");
    assert.deepEqual(llm.llamadas[1].historial.map((m) => [m.rol, m.texto]), [["usuario", "hola"], ["asistente", "Mensajes que veo: 1"], ["usuario", "y ahora?"]]);
  });

  test("al responder a una pieza, la IA sabe de cuál se habla", async () => {
    const { e, fila, llm } = await escenarioChat(async () => "ok");
    const mensaje = (await e.repo.obtenerPieza(fila.id)).mensajes[0];
    await escribir(e, "cambiale la hora", { respondeA: mensaje });
    assert.match(llm.llamadas[0].historial.at(-1).texto, new RegExp(`pieza ${fila.id} del viernes 30/10`));
  });

  test("ver_semana y ver_pieza muestran lo que hay, con IDs", async () => {
    let semana, pieza;
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      semana = await ejecutar("ver_semana", {});
      pieza = await ejecutar("ver_pieza", { id: semana.piezas[0].id });
      return "ok";
    });
    await escribir(e, "mostrame todo");
    assert.equal(semana.piezas.length, 1);
    assert.deepEqual([semana.piezas[0].id, semana.piezas[0].fecha, semana.piezas[0].estado.split(" ")[0], semana.piezas[0].confirmada_hoy], [fila.id, "2026-10-30", "aprobada", false]);
    assert.equal(pieza.pieza.gancho, "Atate el compromiso. Salí.");
  });

  test("ver_pieza dice si ya tiene el video cargado, para que la IA lo mencione", async () => {
    let sin, con;
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      sin = await ejecutar("ver_pieza", { id: 1 });
      await e.repo.agregarMedio({ piezaId: 1, tipo: "video", mime: "video/mp4", datos: VIDEO });
      con = await ejecutar("ver_pieza", { id: 1 });
      return "ok";
    });
    await escribir(e, "cómo queda");
    assert.deepEqual(sin.archivos, []);
    assert.match(sin.falta_archivo, /Falta el video/);
    assert.deepEqual(con.archivos, ["video"]);
    assert.equal(con.falta_archivo, null);
  });

  test("modificar_pieza cambia la fecha y la hora, borra la confirmación, reprograma el recordatorio y le muestra la pieza con sus botones", async () => {
    let resultado;
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      resultado = await ejecutar("modificar_pieza", { id: 1, cambios: { fecha: "2026-11-03", hora: "20:30" }, que_cambio: "La pasé al martes 03/11 a las 20:30." });
      return "Listo, la pasé al martes.";
    });
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`)); // confirmada hoy, y después la cambia
    await escribir(e, "pasala al martes a las 20:30");
    assert.equal(resultado.ok, true, JSON.stringify(resultado));
    const despues = await e.repo.obtenerPieza(fila.id);
    assert.deepEqual([despues.fecha, despues.hora, despues.estado, despues.confirmada_el], ["2026-11-03", "20:30", "propuesta", null]);
    const tarjeta = e.telegram.buscar("La pasé al martes 03/11");
    assert.ok(tarjeta.botones.flat().some((b) => b.dato === `aprobar:${fila.id}`));
    const pendientes = await e.repo.recordatoriosPendientes("2026-11-30");
    assert.ok(pendientes.some((r) => r.pieza_id === fila.id && r.fecha === "2026-10-31"), "recordatorio 3 días antes de la fecha nueva");
  });

  test("modificar_pieza respeta las reglas de marca: si las rompe, no guarda nada y explica por qué", async () => {
    let resultado;
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      resultado = await ejecutar("modificar_pieza", { id: 1, cambios: { epigrafe: "Entrená con mancuernas y barras todos los días." }, que_cambio: "x" });
      return "No se pudo.";
    });
    await escribir(e, "poné mancuernas en el epígrafe");
    assert.equal(resultado.ok, false);
    assert.ok(resultado.errores.length > 0);
    const despues = await e.repo.obtenerPieza(fila.id);
    assert.equal(despues.pieza.epigrafe, fila.pieza.epigrafe);
    assert.equal(despues.estado, "aprobada", "no se tocó nada");
  });

  test("modificar_pieza rechaza campos que no son editables, cambios vacíos, piezas inexistentes y piezas ya publicadas", async () => {
    const resultados = [];
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      resultados.push(await ejecutar("modificar_pieza", { id: 1, cambios: { estado: "publicada", id: 9 }, que_cambio: "x" }));
      resultados.push(await ejecutar("modificar_pieza", { id: 1, cambios: {}, que_cambio: "x" }));
      resultados.push(await ejecutar("modificar_pieza", { id: 999, cambios: { hora: "20:00" }, que_cambio: "x" }));
      await e.repo.actualizarPieza(1, { estado: "publicada" });
      resultados.push(await ejecutar("modificar_pieza", { id: 1, cambios: { hora: "20:00" }, que_cambio: "x" }));
      return "ok";
    });
    await escribir(e, "hacé cosas raras");
    assert.match(resultados[0].error, /no se pueden cambiar: estado, id/);
    assert.match(resultados[1].error, /ningún cambio/);
    assert.match(resultados[2].error, /No existe una pieza/);
    assert.match(resultados[3].error, /ya no se puede modificar/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).hora, "19:00");
  });

  test("la IA no puede confirmar, cancelar ni publicar: no existe la herramienta, y las que mandan un botón no cambian el estado", async () => {
    const nombres = HERRAMIENTAS_CHAT.map((h) => h.name);
    for (const prohibida of ["confirmar", "confirmar_pieza", "cancelar_pieza", "cancelar", "publicar", "publicar_ahora"]) assert.ok(!nombres.includes(prohibida));

    const respuestas = {};
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      respuestas.inventada = await ejecutar("confirmar_pieza", { id: 1 });
      respuestas.confirmacion = await ejecutar("pedir_confirmacion", { id: 1 });
      respuestas.cancelacion = await ejecutar("pedir_cancelacion", { id: 1 });
      return "Te mandé los botones.";
    });
    await escribir(e, "confirmá y después cancelá la de hoy");
    assert.match(respuestas.inventada.error, /No existe la herramienta/);
    assert.match(respuestas.confirmacion.nota, /Falta que Facundo lo toque/);
    assert.match(respuestas.cancelacion.nota, /Falta que Facundo lo toque/);
    const pieza = await e.repo.obtenerPieza(fila.id);
    assert.deepEqual([pieza.estado, pieza.confirmada_el], ["aprobada", null], "nada quedó confirmado ni cancelado");
    assert.ok(e.telegram.buscar("Hoy se publica a las 19:00").botones.flat().some((b) => b.dato === `confirmar:${fila.id}`));
    const preguntaCancelar = e.telegram.buscar("¿Cancelo la pieza");
    assert.deepEqual(preguntaCancelar.botones.flat().map((b) => b.dato), [`cancelar:${fila.id}`, `dejar:${fila.id}`]);

    // Recién al tocar el botón se cancela; "Dejarla" no toca nada
    await e.mandar(e.actualizacion.boton(`dejar:${fila.id}`, preguntaCancelar.id));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "aprobada");
    await e.mandar(e.actualizacion.boton(`cancelar:${fila.id}`, preguntaCancelar.id));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "cancelada");
  });

  test("ninguna herramienta de la IA deja una pieza confirmada, publicándose o cancelada (barrido de todas con una pieza de hoy)", async () => {
    const { e, fila } = await escenarioChat(async ({ ejecutar }) => {
      for (const { name } of HERRAMIENTAS_CHAT) {
        await ejecutar(name, { id: 1, texto: "algo", cambios: { hora: "21:00" }, que_cambio: "x" });
      }
      return "ok";
    });
    await escribir(e, "probá todo");
    const pieza = await e.repo.obtenerPieza(fila.id);
    assert.ok(["propuesta", "aprobada"].includes(pieza.estado), `quedó ${pieza.estado}`);
    assert.equal(pieza.confirmada_el, null);
    assert.equal(e.meta.llamadas.length, 0);
  });

  test("pedir_confirmacion solo sirve para piezas de hoy; las de otro día se rechazan", async () => {
    let resultado;
    const { e } = await escenarioChat(async ({ ejecutar }) => {
      await ejecutar("modificar_pieza", { id: 1, cambios: { fecha: "2026-11-03" }, que_cambio: "x" });
      resultado = await ejecutar("pedir_confirmacion", { id: 1 });
      return "ok";
    });
    await escribir(e, "mandame para confirmar");
    assert.match(resultado.error, /solo vale el mismo día/);
  });

  test("aprobar_pieza aprueba una propuesta, anotar_novedad guarda para el plan, y pausar/reanudar frenan y reactivan", async () => {
    const resultados = {};
    const { e } = await escenarioChat(async ({ ejecutar }) => {
      await ejecutar("modificar_pieza", { id: 1, cambios: { hora: "21:00" }, que_cambio: "x" }); // vuelve a propuesta
      resultados.aprobar = await ejecutar("aprobar_pieza", { id: 1 });
      resultados.aprobarDeNuevo = await ejecutar("aprobar_pieza", { id: 1 });
      resultados.novedad = await ejecutar("anotar_novedad", { texto: "Llegaron las gorras" });
      resultados.vacia = await ejecutar("anotar_novedad", { texto: "  " });
      await ejecutar("pausar_publicaciones", {});
      resultados.pausado = (await ejecutar("estado_del_sistema", {})).pausado;
      await ejecutar("reanudar_publicaciones", {});
      resultados.reanudado = (await ejecutar("estado_del_sistema", {})).pausado;
      return "ok";
    });
    await escribir(e, "hacé todo esto");
    assert.equal(resultados.aprobar.ok, true);
    assert.match(resultados.aprobarDeNuevo.error, /no hace falta aprobarla/);
    assert.equal(resultados.novedad.ok, true);
    assert.match(resultados.vacia.error, /vacía/);
    assert.deepEqual([resultados.pausado, resultados.reanudado], [true, false]);
    assert.deepEqual((await e.repo.novedadesPendientes()).map((n) => n.texto), ["Llegaron las gorras"]);
  });

  test("tiene un tope de mensajes por día; los botones y comandos siguen funcionando", async () => {
    const { e, llm, fila } = await escenarioChat();
    await e.repo.guardarEstado("chat-dia:2026-10-30", MENSAJES_MAXIMOS_POR_DIA);
    await escribir(e, "hola");
    assert.equal(llm.llamadas.length, 0);
    assert.match(e.telegram.ultimo().texto, new RegExp(`máximo de ${MENSAJES_MAXIMOS_POR_DIA} mensajes`));
    await escribir(e, "/estado");
    assert.match(e.telegram.ultimo().texto, /Activo/);
    e.telegram.archivos.set("v1", Buffer.from("video"));
    await e.mandar(e.actualizacion.video("v1", { respondeA: (await e.repo.obtenerPieza(fila.id)).mensajes[0] }));
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "confirmada");
  });

  test("si la IA falla, un mensaje suelto queda como novedad (no se pierde) y uno respondido a una pieza pide reintentar", async () => {
    const { e, fila } = await escenarioChat(async () => { throw new Error("Se agotó el cupo gratis de la IA por ahora."); });
    await escribir(e, "Llegaron las gorras");
    assert.match(e.telegram.ultimo().texto, /cupo gratis de la IA/);
    assert.match(e.telegram.ultimo().texto, /Lo anoté como novedad/);
    assert.deepEqual((await e.repo.novedadesPendientes()).map((n) => n.texto), ["Llegaron las gorras"]);

    const mensaje = (await e.repo.obtenerPieza(fila.id)).mensajes[0];
    await escribir(e, "cambiale la hora", { respondeA: mensaje });
    assert.match(e.telegram.ultimo().texto, /Probá de nuevo en un rato/);
    assert.equal((await e.repo.novedadesPendientes()).length, 1, "lo respondido a una pieza no es una novedad");
  });

  test("los archivos y los comandos no pasan por la IA", async () => {
    const { e, fila, llm } = await escenarioChat();
    e.telegram.archivos.set("v1", Buffer.from("video"));
    const mensaje = (await e.repo.obtenerPieza(fila.id)).mensajes[0];
    await e.mandar(e.actualizacion.video("v1", { respondeA: mensaje }));
    assert.equal((await e.repo.mediosDePieza(fila.id)).length, 1);
    await escribir(e, "/pausar");
    assert.equal(llm.llamadas.length, 0);
  });

  test("sin IA configurada, el bot sigue como antes: un mensaje suelto es una novedad", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "10:00" });
    await escribir(e, "Llegaron las gorras");
    assert.match(e.telegram.ultimo().texto, /Anotado/);
  });
});

describe("el mismo bot en Telegram y en el juego", () => {
  const editorNuevo = (calls = []) => ({
    editarPieza: async (pedido) => {
      calls.push(pedido);
      return { ok: true, pieza: crearPieza({ fecha: pedido.fila.fecha, hora: pedido.fila.hora, formato: pedido.fila.pieza.formato, gancho: "Gancho de la pieza nueva" }), hora: pedido.fila.hora, queCambio: "Armé la pieza." };
    },
  });
  async function escenario(guion, { editor = editorNuevo() } = {}) {
    const llm = llmFalso(guion);
    const e = crearEscenario({ fecha: "2026-10-28", hora: "10:00", llm, editor });
    await e.cargarPieza();
    return { e, llm };
  }

  test("lo que se charla en Telegram lo ve el juego y lo que se escribe en el juego lo ve Telegram (misma memoria)", async () => {
    const { e, llm } = await escenario(async ({ historial }) => `Veo ${historial.length}`);
    await e.mandar(e.actualizacion.texto("hola desde telegram"));
    const r = await e.servicio.conversarDesdeJuego("hola desde el juego");
    assert.equal(r.ok, true);
    assert.deepEqual(llm.llamadas[1].historial.map((m) => m.texto), ["hola desde telegram", "Veo 1", "[Mensaje escrito en el juego VOW HQ] hola desde el juego"]);
    await e.mandar(e.actualizacion.texto("y ahora otra vez en telegram"));
    assert.equal(llm.llamadas[2].historial.length, 5);
    const charla = await e.servicio.charla();
    assert.deepEqual(charla.map((m) => m.canal), ["telegram", "telegram", "juego", "asistente" === "x" ? "" : "juego", "telegram", "telegram"]);
    assert.equal(charla[2].texto, "hola desde el juego", "el juego muestra lo que Facundo escribió, sin la marca interna");
  });

  test("dos mensajes casi juntos se procesan de a uno", async () => {
    let enCurso = 0;
    let maximo = 0;
    const { e } = await escenario(async () => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 15));
      enCurso--;
      return "ok";
    });
    await Promise.all([e.servicio.conversarDesdeJuego("uno"), e.mandar(e.actualizacion.texto("dos")), e.servicio.conversarDesdeJuego("tres")]);
    assert.equal(maximo, 1);
    assert.equal((await e.servicio.charla(30)).length, 6);
  });

  test("un error de la IA en el juego se devuelve para mostrarlo y no se anota como novedad ni se guarda en la memoria", async () => {
    const { e } = await escenario(async () => { throw new Error("La IA está saturada."); });
    const r = await e.servicio.conversarDesdeJuego("hacé algo");
    assert.deepEqual([r.ok, r.error], [false, "La IA está saturada."]);
    assert.deepEqual(await e.repo.novedadesPendientes(), []);
    assert.deepEqual(await e.servicio.charla(), []);
  });

  test("programar_pieza arma una pieza nueva para un día libre, la deja propuesta y se la manda a Telegram con sus botones", async () => {
    const calls = [];
    const { e } = await escenario(async ({ ejecutar }) => {
      const r = await ejecutar("programar_pieza", { fecha: "2026-11-02", formato: "reel", indicacion: "algo sobre constancia" });
      return r.ok ? "Listo, quedó programada." : `Falló ${r.error}`;
    }, { editor: editorNuevo(calls) });
    const r = await e.servicio.conversarDesdeJuego("programame un reel para el lunes 2/11");
    assert.equal(r.respuesta, "Listo, quedó programada.");
    assert.match(calls[0].instruccion, /2026-11-02/);
    assert.match(calls[0].instruccion, /algo sobre constancia/);
    assert.equal(calls[0].nueva, true);
    const nuevas = await e.repo.piezasDelDia("2026-11-02");
    assert.equal(nuevas.length, 1);
    assert.equal(nuevas[0].estado, "propuesta");
    assert.equal(nuevas[0].hora, "19:00");
    assert.equal(nuevas[0].pieza.fecha, "2026-11-02");
    assert.ok(e.telegram.buscar("Pieza nueva para el"));
    assert.ok(e.telegram.ultimo().botones[0].some((b) => b.dato.startsWith("aprobar:")));
    assert.equal((await e.repo.piezasDelDia("2026-10-30")).length, 1, "las otras piezas no se tocan");
  });

  test("programar_pieza rechaza un día que ya tiene pieza, una fecha pasada y una lejana", async () => {
    const resultados = [];
    const { e } = await escenario(async ({ ejecutar }) => {
      resultados.push(await ejecutar("programar_pieza", { fecha: "2026-10-30", indicacion: "x" }));
      resultados.push(await ejecutar("programar_pieza", { fecha: "2026-10-20", indicacion: "x" }));
      resultados.push(await ejecutar("programar_pieza", { fecha: "2027-03-01", indicacion: "x" }));
      resultados.push(await ejecutar("programar_pieza", { fecha: "mañana", indicacion: "x" }));
      return "no";
    });
    await e.servicio.conversarDesdeJuego("probá");
    assert.match(resultados[0].error, /ya tiene la pieza/);
    assert.match(resultados[1].error, /ya pasó/);
    assert.match(resultados[2].error, /60 días/);
    assert.match(resultados[3].error, /AAAA-MM-DD/);
    assert.equal((await e.repo.piezasDelDia("2026-10-20")).length, 0);
  });

  test("si la pieza armada rompe las reglas de la marca no se guarda y el motivo llega a Facundo", async () => {
    const editor = { editarPieza: async () => ({ ok: false, errores: ["urgencia falsa"] }) };
    const { e } = await escenario(async ({ ejecutar }) => {
      await ejecutar("programar_pieza", { fecha: "2026-11-02", indicacion: "x" });
      return "Listo, ya la programé.";
    }, { editor });
    const r = await e.servicio.conversarDesdeJuego("programá");
    assert.match(r.respuesta, /No quedó guardado/);
    assert.equal((await e.repo.piezasDelDia("2026-11-02")).length, 0);
  });
});
