import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearEscenario, crearPieza, crearPlan, URL_PUBLICA } from "./ayuda-pruebas.js";
import { faltaArchivo, TOLERANCIA_MINUTOS } from "./servicio.js";

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

  test("las stories no se publican solas: a la hora avisa para publicarla a mano", async () => {
    const e = crearEscenario({ fecha: "2026-10-30", hora: "08:00" });
    const fila = await e.cargarPieza({ formato: "story", pilar: "proceso", epigrafe: "", material_a_producir: [] });
    await e.mandar(e.actualizacion.boton(`aprobar:${fila.id}`));
    await e.mandar(e.actualizacion.boton(`confirmar:${fila.id}`));
    assert.match(e.telegram.ultimo().texto, /Las stories todavía las publicás vos/);
    e.mover("19:00");
    await e.servicio.tick();
    assert.equal(e.meta.llamadas.length, 0);
    assert.match(e.telegram.ultimo().texto, /publicar tu story/);
    assert.equal((await e.repo.obtenerPieza(fila.id)).estado, "manual");
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
    assert.equal(faltaArchivo({ pieza: { formato: "story" } }, []), null);
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
