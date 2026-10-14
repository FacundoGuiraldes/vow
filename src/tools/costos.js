const redondear = (valor, decimales = 2) => {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
};

const exigirPositivo = (nombre, valor) => {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) {
    throw new Error(`${nombre} debe ser un número mayor que 0`);
  }
};

export function calcularCosto({
  fobUnitarioUSD,
  unidades,
  fleteTotalUSD,
  derechoPct = 20,
  tasaEstadisticaPct = 3,
  ivaPct = 21,
  tipoCambio,
  precioVentaARS,
}) {
  exigirPositivo("fobUnitarioUSD", fobUnitarioUSD);
  exigirPositivo("unidades", unidades);
  exigirPositivo("tipoCambio", tipoCambio);
  exigirPositivo("precioVentaARS", precioVentaARS);
  if (typeof fleteTotalUSD !== "number" || !Number.isFinite(fleteTotalUSD) || fleteTotalUSD < 0) {
    throw new Error("fleteTotalUSD debe ser un número de 0 o más");
  }

  const fobTotalUSD = fobUnitarioUSD * unidades;
  const cifUSD = fobTotalUSD + fleteTotalUSD;
  const derechoUSD = cifUSD * (derechoPct / 100);
  const tasaEstadisticaUSD = cifUSD * (tasaEstadisticaPct / 100);
  const costoTotalUSD = cifUSD + derechoUSD + tasaEstadisticaUSD;
  const costoUnitarioUSD = costoTotalUSD / unidades;
  const costoUnitarioARS = costoUnitarioUSD * tipoCambio;
  const precioNetoARS = precioVentaARS / (1 + ivaPct / 100);
  const margenARS = precioNetoARS - costoUnitarioARS;

  return {
    fobTotalUSD: redondear(fobTotalUSD),
    cifUSD: redondear(cifUSD),
    derechoUSD: redondear(derechoUSD),
    tasaEstadisticaUSD: redondear(tasaEstadisticaUSD),
    costoTotalUSD: redondear(costoTotalUSD),
    costoUnitarioUSD: redondear(costoUnitarioUSD),
    costoUnitarioARS: redondear(costoUnitarioARS),
    precioNetoARS: redondear(precioNetoARS),
    margenARS: redondear(margenARS),
    margenPct: redondear((margenARS / precioNetoARS) * 100),
  };
}
