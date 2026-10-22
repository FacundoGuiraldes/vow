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

const sinTildes = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const DIAS_SIN_TILDES = DIAS.map(sinTildes);
const esDiaReal = (fechaISO) => esFechaISO(fechaISO) && new Date(`${fechaISO}T00:00:00Z`).toISOString().slice(0, 10) === fechaISO;

// Busca en un texto libre la fecha de la que se habla: "29/10", "jueves", "mañana" o "hoy" (en ese orden de prioridad).
// Devuelve AAAA-MM-DD, o null si no hay ninguna. Un día de la semana es su próxima ocurrencia desde `hoy` (hoy incluido).
export function fechaEnTexto(texto, hoy) {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const t = sinTildes(texto);
  const numerica = t.match(/(?<!\d)(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?(?!\d)/);
  if (numerica) {
    const dia = numerica[1].padStart(2, "0");
    const mes = numerica[2].padStart(2, "0");
    let anio = numerica[3] ? (numerica[3].length === 2 ? `20${numerica[3]}` : numerica[3]) : hoy.slice(0, 4);
    let fecha = `${anio}-${mes}-${dia}`;
    if (!numerica[3] && esDiaReal(fecha) && diasHasta(hoy, fecha) < -180) fecha = `${Number(anio) + 1}-${mes}-${dia}`; // "2/1" dicho en diciembre
    if (esDiaReal(fecha)) return fecha;
  }
  const dia = DIAS_SIN_TILDES.findIndex((nombre) => new RegExp(`\\b${nombre}\\b`).test(t));
  if (dia >= 0) {
    for (let n = 0; n < 7; n++) {
      const fecha = sumarDias(hoy, n);
      if (new Date(`${fecha}T12:00:00Z`).getUTCDay() === dia) return fecha;
    }
  }
  if (/\bmanana\b/.test(t)) return sumarDias(hoy, 1);
  if (/\bhoy\b/.test(t)) return hoy;
  return null;
}
