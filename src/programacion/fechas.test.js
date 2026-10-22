import { test } from "node:test";
import assert from "node:assert/strict";
import { ahoraArgentina, diasHasta, esFechaISO, fechaEnTexto, esHoraValida, fechaLegible, horaDesdeMinutos, lunesDe, minutosDelDia, sumarDias } from "./fechas.js";

test("ahoraArgentina convierte de UTC a hora argentina (UTC-3), también al cruzar de día", () => {
  assert.deepEqual(ahoraArgentina(new Date("2026-10-26T11:00:00Z")), { fecha: "2026-10-26", hora: "08:00" });
  assert.deepEqual(ahoraArgentina(new Date("2026-10-27T02:30:00Z")), { fecha: "2026-10-26", hora: "23:30" });
  assert.deepEqual(ahoraArgentina(new Date("2026-10-26T03:00:00Z")), { fecha: "2026-10-26", hora: "00:00" });
});

test("el lunes 8:00 de Argentina son las 11:00 UTC, todo el año (sin horario de verano)", () => {
  for (const instante of ["2026-01-05T11:00:00Z", "2026-07-06T11:00:00Z"]) {
    assert.equal(ahoraArgentina(new Date(instante)).hora, "08:00");
  }
});

test("sumarDias y diasHasta", () => {
  assert.equal(sumarDias("2026-10-30", -3), "2026-10-27");
  assert.equal(sumarDias("2026-10-30", 3), "2026-11-02");
  assert.equal(sumarDias("2026-12-30", 3), "2027-01-02");
  assert.equal(diasHasta("2026-10-27", "2026-10-30"), 3);
  assert.equal(diasHasta("2026-10-30", "2026-10-27"), -3);
});

test("fechaLegible dice el día de la semana", () => {
  assert.equal(fechaLegible("2026-10-30"), "viernes 30/10");
  assert.equal(fechaLegible("2026-11-01"), "domingo 01/11");
});

test("lunesDe: el lunes de la semana, o el próximo si no es lunes", () => {
  assert.equal(lunesDe("2026-10-26"), "2026-10-26");
  assert.equal(lunesDe("2026-10-30"), "2026-10-26");
  assert.equal(lunesDe("2026-10-30", { siguiente: true }), "2026-11-02");
  assert.equal(lunesDe("2026-11-01", { siguiente: true }), "2026-11-02");
  assert.equal(lunesDe("2026-10-26", { siguiente: true }), "2026-10-26");
});

test("validaciones de fecha y hora", () => {
  assert.ok(esFechaISO("2026-10-30"));
  assert.ok(!esFechaISO("30/10/2026"));
  assert.ok(!esFechaISO("2026-13-45"));
  assert.ok(esHoraValida("08:00"));
  assert.ok(esHoraValida("23:59"));
  assert.ok(!esHoraValida("24:00"));
  assert.ok(!esHoraValida("8:00"));
});

test("minutos y horas", () => {
  assert.equal(minutosDelDia("19:30"), 1170);
  assert.equal(horaDesdeMinutos(1170), "19:30");
  assert.equal(horaDesdeMinutos(5000), "23:59");
});

test("fechaEnTexto: encuentra la fecha de la que se habla", () => {
  const hoy = "2026-10-22"; // jueves
  assert.equal(fechaEnTexto("la publicación para el jueves 29/10 quedaría así", hoy), "2026-10-29");
  assert.equal(fechaEnTexto("es para el 5/11", hoy), "2026-11-05");
  assert.equal(fechaEnTexto("para el viernes", hoy), "2026-10-23");
  assert.equal(fechaEnTexto("el jueves", hoy), "2026-10-22", "hoy cuenta como la próxima ocurrencia");
  assert.equal(fechaEnTexto("mañana a la noche", hoy), "2026-10-23");
  assert.equal(fechaEnTexto("miércoles", hoy), "2026-10-28", "con y sin tilde");
  assert.equal(fechaEnTexto("miercoles", hoy), "2026-10-28");
  assert.equal(fechaEnTexto("2/1", "2026-12-30"), "2027-01-02", "una fecha ya lejana en el pasado es del año que viene");
  assert.equal(fechaEnTexto("31/2", hoy), null);
  assert.equal(fechaEnTexto("Drop 01 en 2027 https://vow-17x.pages.dev/?origen=instagram", hoy), null);
  assert.equal(fechaEnTexto("", hoy), null);
});
