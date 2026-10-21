// Fechas y horas en Argentina (UTC-3, sin horario de verano). Todo el sistema de publicación habla en hora argentina:
// el servidor corre en UTC, así que acá se hace la conversión una sola vez.
const ZONA = "America/Argentina/Buenos_Aires";
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esFechaISO = (valor) => typeof valor === "string" && FORMATO_FECHA.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
export const esHoraValida = (valor) => typeof valor === "string" && FORMATO_HORA.test(valor);

// { fecha: "AAAA-MM-DD", hora: "HH:MM" } de un instante, visto desde Argentina
export function ahoraArgentina(instante = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map(({ type, value }) => [type, value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

export const minutosDelDia = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

export const horaDesdeMinutos = (minutos) => {
  const limitado = Math.min(Math.max(0, Math.trunc(minutos)), 23 * 60 + 59);
  return `${String(Math.floor(limitado / 60)).padStart(2, "0")}:${String(limitado % 60).padStart(2, "0")}`;
};

export function sumarDias(fechaISO, dias) {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// Cuántos días hay de `desde` a `hasta` (negativo si `hasta` es anterior)
export const diasHasta = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

export const nombreDelDia = (fechaISO) => DIAS[new Date(`${fechaISO}T12:00:00Z`).getUTCDay()];

// "viernes 24/10"
export const fechaLegible = (fechaISO) => `${nombreDelDia(fechaISO)} ${fechaISO.slice(8, 10)}/${fechaISO.slice(5, 7)}`;

// El lunes de la semana que contiene la fecha, o el lunes siguiente si `siguiente` es true y la fecha no es lunes
export function lunesDe(fechaISO, { siguiente = false } = {}) {
  const dia = new Date(`${fechaISO}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const desdeLunes = (dia + 6) % 7;
  if (desdeLunes === 0) return fechaISO;
  return siguiente ? sumarDias(fechaISO, 7 - desdeLunes) : sumarDias(fechaISO, -desdeLunes);
}
