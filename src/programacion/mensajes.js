// Textos y botones de los mensajes de Telegram. Son funciones puras: reciben datos y devuelven texto, así se prueban sin red.
// Todo va en texto plano (sin Markdown) para que ningún carácter del epígrafe rompa el mensaje.
import { LIMITE_MENSAJE } from "./telegram.js";
import { fechaLegible, sumarDias } from "./fechas.js";

export const DIAS_RECORDATORIO = 3;

const recortar = (texto, maximo) => (texto.length > maximo ? `${texto.slice(0, maximo - 1).trimEnd()}…` : texto);
const material = (fila) => (Array.isArray(fila.pieza.material_a_producir) ? fila.pieza.material_a_producir : []);
const lista = (items) => items.map((item) => `  • ${item}`).join("\n");

// Fecha en la que hay que avisar para filmar o sacar fotos
export const fechaDeAviso = (fechaPieza) => sumarDias(fechaPieza, -DIAS_RECORDATORIO);

export const ESTADOS_LEGIBLES = {
  propuesta: "propuesta (falta que la apruebes)",
  aprobada: "aprobada para la semana (falta la confirmación del día)",
  confirmada: "confirmada (se publica a la hora)",
  preparando: "preparándose",
  preparada: "lista en Instagram (se publica a la hora)",
  publicando: "publicándose",
  publicada: "publicada",
  fallida: "falló",
  cancelada: "cancelada",
  manual: "para publicar a mano",
};

export function textoPieza(fila, { titulo = "" } = {}) {
  const p = fila.pieza;
  const partes = [
    titulo,
    `${fechaLegible(fila.fecha)} · ${fila.hora} hs · ${p.formato} · ${p.pilar}`,
    `Gancho: ${p.gancho}`,
    p.epigrafe ? `Epígrafe: ${p.epigrafe}` : "",
    p.guion ? `Guion: ${recortar(p.guion, 900)}` : "",
    material(fila).length ? `🎬 Para filmar o sacar fotos:\n${lista(material(fila))}\nTe aviso el ${fechaLegible(fechaDeAviso(fila.fecha))}.` : "",
  ];
  return recortar(partes.filter(Boolean).join("\n"), LIMITE_MENSAJE - 100);
}

export function textoPlanSemanal({ semana, resumen, filas, urgentes = [], hoy = null }) {
  const urgentesIds = new Set(urgentes.map((f) => f.id));
  const agenda = filas.map((f) => `• ${fechaLegible(f.fecha)} ${f.hora} hs · ${f.pieza.formato} · ${f.pieza.gancho}`);
  const filmar = filas.filter((f) => material(f).length);
  const bloqueFilmar = filmar.length
    ? [
        "🎬 Tenés que filmar o sacar fotos para:",
        ...filmar.map((f) => {
          const aviso = urgentesIds.has(f.id)
            ? "⚠️ ya hay que hacerlo: faltan menos de 3 días para publicarla"
            : fechaDeAviso(f.fecha) === hoy
              ? "este mensaje es el aviso: faltan 3 días"
              : `te lo recuerdo el ${fechaLegible(fechaDeAviso(f.fecha))}`;
          return `• ${fechaLegible(f.fecha)} (${f.pieza.formato}): ${material(f).join("; ")} — ${aviso}`;
        }),
      ].join("\n")
    : "No tenés que filmar nada esta semana.";
  return recortar(
    [
      `📅 Plan de la semana del ${fechaLegible(semana)}`,
      resumen,
      agenda.join("\n"),
      bloqueFilmar,
      "Aprobá, o respondé a cada pieza con lo que quieras cambiar. Cada día a las 8 te pido la confirmación final: sin ella no se publica nada.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    LIMITE_MENSAJE - 100,
  );
}

export function textoRecordatorio(fila, diasFaltan) {
  const cuando = diasFaltan === 0 ? "hoy" : diasFaltan === 1 ? "mañana" : `en ${diasFaltan} días (${fechaLegible(fila.fecha)})`;
  return recortar(
    [
      `🎬 Recordatorio: ${cuando} se publica un ${fila.pieza.formato} a las ${fila.hora} hs.`,
      `Gancho: ${fila.pieza.gancho}`,
      `Tenés que filmar o sacar fotos:\n${lista(material(fila))}`,
      fila.pieza.guion ? `Guion: ${recortar(fila.pieza.guion, 700)}` : "",
      "Mandame el archivo respondiendo a este mensaje y queda adjunto a la pieza.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    LIMITE_MENSAJE - 100,
  );
}

export function textoResumenDiario(fila, { faltaArchivo = null } = {}) {
  return recortar(
    [
      `☀️ Hoy se publica a las ${fila.hora} hs (${fila.pieza.formato})`,
      textoPieza(fila),
      fila.error ? `Último problema: ${fila.error}` : "",
      fila.pieza.formato === "story" ? "Las stories todavía las publicás vos a mano: si confirmás, te aviso a la hora." : faltaArchivo ? `⚠️ ${faltaArchivo}` : "📎 El archivo está listo.",
      fila.pieza.formato === "story" ? "" : `Si lo confirmás, se publica solo a las ${fila.hora}. Si no lo confirmás, no se publica nada.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    LIMITE_MENSAJE - 100,
  );
}

// `conIA`: la pieza es una imagen y el generador está configurado, así que se ofrece el botón de generarla
const filaIA = (id) => [{ texto: "🎨 Generar con IA", dato: `ia:${id}` }];
export const botonesPlan = (id, { conIA = false } = {}) => [
  [{ texto: "✅ Aprobar", dato: `aprobar:${id}` }, { texto: "✏️ Modificar", dato: `modificar:${id}` }],
  ...(conIA ? [filaIA(id)] : []),
];
export const botonesDia = (id, hora, { conIA = false } = {}) => [
  [{ texto: `✅ Confirmar ${hora} hs`, dato: `confirmar:${id}` }],
  [{ texto: "✏️ Modificar", dato: `modificar:${id}` }, { texto: "🚫 Cancelar", dato: `cancelar:${id}` }],
  ...(conIA ? [filaIA(id)] : []),
];
// Debajo de la imagen que generó la IA
export const botonesImagenIA = (id) => [
  [{ texto: "✅ Usar esta", dato: `ia_usar:${id}` }, { texto: "🔁 Otra", dato: `ia_otra:${id}` }],
  [{ texto: "✏️ Cambiar indicación", dato: `ia_cambiar:${id}` }],
];
// Cuando la IA propone cancelar: la decisión la toma Facundo con este botón
export const botonesCancelar = (id) => [[{ texto: "🚫 Sí, cancelarla", dato: `cancelar:${id}` }, { texto: "↩️ Dejarla", dato: `dejar:${id}` }]];
export const botonesTarde = (id) => [[{ texto: "▶️ Publicar ahora", dato: `publicar_ahora:${id}` }, { texto: "🚫 Cancelar", dato: `cancelar:${id}` }]];
