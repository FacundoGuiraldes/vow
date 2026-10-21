// Textos y botones de los mensajes de Telegram. Son funciones puras: reciben datos y devuelven texto, así se prueban sin red.
// Todo va en texto plano (sin Markdown) para que ningún carácter del epígrafe rompa el mensaje.
import { LIMITE_MENSAJE } from "./telegram.js";
import { fechaLegible, sumarDias } from "./fechas.js";

export const DIAS_RECORDATORIO = 3;

const recortar = (texto, maximo) => (texto.length > maximo ? `${texto.slice(0, maximo - 1).trimEnd()}…` : texto);
const material = (fila) => (Array.isArray(fila.pieza.material_a_producir) ? fila.pieza.material_a_producir : []);
const lista = (items) => items.map((item) => `  • ${item}`).join("\n");

// Cómo se hace cada pieza: "propio" (la filma o fotografía Facundo), "ia" (la crea él con una herramienta de IA siguiendo las
// instrucciones del plan) o "mixto". Los planes viejos no traen el dato y se tratan como "propio".
export const PRODUCCION_LEGIBLE = { propio: "con video o fotos propios", ia: "creada con IA", mixto: "mixta (material propio + IA)" };
const produccionDe = (pieza) => (pieza.produccion in PRODUCCION_LEGIBLE ? pieza.produccion : "propio");
const tituloDeMaterial = (pieza) => ({ propio: "🎬 Para filmar o sacar fotos:", ia: "🎨 Para crear con IA:", mixto: "🎬 Para filmar y crear con IA:" })[produccionDe(pieza)];
const bloqueIA = (pieza) =>
  produccionDe(pieza) !== "propio" && String(pieza.instrucciones_ia ?? "").trim()
    ? `🤖 Indicación para tu IA (copiala y pegala):\n${recortar(pieza.instrucciones_ia.trim(), 900)}`
    : "";

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
    p.produccion ? `🛠️ Cómo hacerla: ${PRODUCCION_LEGIBLE[produccionDe(p)]}` : "",
    `Gancho: ${p.gancho}`,
    p.epigrafe ? `Epígrafe: ${p.epigrafe}` : "",
    p.guion ? `Guion: ${recortar(p.guion, 900)}` : "",
    bloqueIA(p),
    material(fila).length ? `${tituloDeMaterial(p)}\n${lista(material(fila))}\nTe aviso el ${fechaLegible(fechaDeAviso(fila.fecha))}.` : "",
  ];
  return recortar(partes.filter(Boolean).join("\n"), LIMITE_MENSAJE - 100);
}

export function textoPlanSemanal({ semana, resumen, filas, urgentes = [], hoy = null }) {
  const urgentesIds = new Set(urgentes.map((f) => f.id));
  const agenda = filas.map((f) => `• ${fechaLegible(f.fecha)} ${f.hora} hs · ${f.pieza.formato} · ${f.pieza.gancho}`);
  const filmar = filas.filter((f) => material(f).length);
  const conIA = filmar.some((f) => produccionDe(f.pieza) !== "propio");
  const bloqueFilmar = filmar.length
    ? [
        conIA ? "🎬 Tenés que producir (filmar, sacar fotos o crear con IA) para:" : "🎬 Tenés que filmar o sacar fotos para:",
        ...filmar.map((f) => {
          const aviso = urgentesIds.has(f.id)
            ? "⚠️ ya hay que hacerlo: faltan menos de 3 días para publicarla"
            : fechaDeAviso(f.fecha) === hoy
              ? "este mensaje es el aviso: faltan 3 días"
              : `te lo recuerdo el ${fechaLegible(fechaDeAviso(f.fecha))}`;
          const como = produccionDe(f.pieza) === "propio" ? "" : ` [${PRODUCCION_LEGIBLE[produccionDe(f.pieza)]}]`;
          return `• ${fechaLegible(f.fecha)} (${f.pieza.formato})${como}: ${material(f).join("; ")} — ${aviso}`;
        }),
        ...(conIA ? ["La indicación para la IA de cada pieza está en su tarjeta."] : []),
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
      `${produccionDe(fila.pieza) === "propio" ? "Tenés que filmar o sacar fotos" : produccionDe(fila.pieza) === "ia" ? "Tenés que crear con IA" : "Tenés que filmar y crear con IA"}:\n${lista(material(fila))}`,
      bloqueIA(fila.pieza),
      fila.pieza.guion ? `Guion: ${recortar(fila.pieza.guion, 700)}` : "",
      "Cuando lo tengas, mandame el archivo respondiendo a este mensaje y queda adjunto a la pieza.",
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
export const botonesTarde = (id) => [[{ texto: "▶️ Publicar ahora", dato: `publicar_ahora:${id}` }, { texto: "🚫 Cancelar", dato: `cancelar:${id}` }]];
