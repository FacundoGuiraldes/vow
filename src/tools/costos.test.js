import test from "node:test";
import assert from "node:assert/strict";
import { calcularCosto } from "./costos.js";

const base = {
  fobUnitarioUSD: 6.5,
  unidades: 100,
  fleteTotalUSD: 120,
  tipoCambio: 1500,
  precioVentaARS: 36000,
};

test("calcula el costo puesto y el margen de una remera", () => {
  const r = calcularCosto(base);
  assert.equal(r.fobTotalUSD, 650);
  assert.equal(r.cifUSD, 770);
  assert.equal(r.derechoUSD, 154);
  assert.equal(r.tasaEstadisticaUSD, 23.1);
  assert.equal(r.costoTotalUSD, 947.1);
  assert.equal(r.costoUnitarioARS, 14206.5);
  assert.equal(r.precioNetoARS, 29752.07);
  assert.equal(r.margenPct, 52.25);
});

test("rechaza unidades en cero", () => {
  assert.throws(() => calcularCosto({ ...base, unidades: 0 }), /unidades/);
});

test("rechaza flete negativo", () => {
  assert.throws(() => calcularCosto({ ...base, fleteTotalUSD: -1 }), /fleteTotalUSD/);
});
