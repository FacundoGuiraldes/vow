import { calcularCosto } from "./tools/costos.js";

console.log(
  calcularCosto({
    fobUnitarioUSD: 6.5,
    unidades: 100,
    fleteTotalUSD: 120,
    tipoCambio: 1500,
    precioVentaARS: 36000,
  })
);
