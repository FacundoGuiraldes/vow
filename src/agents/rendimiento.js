// Rendimiento de @vow_ar: mide las publicaciones propias con las métricas privadas de Meta (alcance,
// guardados, compartidos) y las compara con las cuentas de referencia. No usa IA ni gasta: son cuentas.
// El Estratega lee el último informe (docs/rendimiento/) para apoyarse en lo que ya funcionó en VOW.
import { analizarPublicaciones, mediana } from "./metricas.js";

export const LIMITE_PROPIAS = 25;
// Con menos publicaciones de un tipo, la comparación es una señal y no una conclusión
export const MUESTRA_MINIMA = 3;
// Una publicación más nueva que esto todavía suma alcance
export const DIAS_RECIENTE = 7;
// Entre estas dos relaciones (VOW / referencias) se considera "parecido"
export const MARGEN_PARECIDO = [0.8, 1.25];

// Baja perfil, publicaciones y métricas de cada una. `meta` es el cliente de src/mcp/instagram/api.js.
// Si las métricas de una publicación fallan, se sigue con las demás y se anota el motivo.
export async function medirCuentaPropia(meta, { limite = LIMITE_PROPIAS } = {}) {
  const perfil = await meta.perfil();
  const publicaciones = await meta.publicaciones(limite);
  const conMetricas = [];
  for (const p of publicaciones) {
    try {
      conMetricas.push({ ...p, metricas: await meta.metricas(p.id) });
    } catch (error) {
      conMetricas.push({ ...p, metricas: null, errorMetricas: error.message });
    }
  }
  return {
    usuario: perfil.username,
    seguidores: perfil.followers_count ?? null,
    seguidos: perfil.follows_count ?? null,
    publicaciones: conMetricas,
  };
}

// Los #hashtags del texto, en minúscula y sin repetir
export const etiquetasDe = (texto = "") => [...new Set((String(texto ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()))];

const dividir = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null);

// Cada publicación propia con las mismas cuentas que las de referencia, más las métricas que solo hay para VOW
export function analizarPropias(cuenta, { hoy = new Date() } = {}) {
  const publicaciones = cuenta.publicaciones.map((p) => ({ ...p, view_count: p.metricas?.views ?? undefined }));
  const comunes = analizarPublicaciones({ seguidores: cuenta.seguidores, publicaciones });
  return comunes.map((analizada, i) => {
    const { metricas, timestamp } = publicaciones[i];
    const alcance = metricas?.reach ?? null;
    const dias = (hoy - new Date(timestamp)) / 86_400_000;
    return {
      ...analizada,
      alcance,
      guardados: metricas?.saved ?? null,
      compartidos: metricas?.shares ?? null,
      interacciones: metricas?.total_interactions ?? null,
      interaccionesPorAlcance: dividir(metricas?.total_interactions, alcance),
      // Guardar y mandar a alguien es lo que Instagram más premia para llegar a gente nueva
      enviosPorAlcance: dividir((metricas?.saved ?? 0) + (metricas?.shares ?? 0), alcance),
      etiquetas: etiquetasDe(publicaciones[i].caption),
      alcancePorSeguidor: dividir(alcance, cuenta.seguidores),
      reciente: Number.isFinite(dias) && dias < DIAS_RECIENTE,
    };
  });
}

export function resumirPropiasPorTipo(analizadas) {
  const grupos = {};
  for (const p of analizadas) (grupos[p.tipo] ??= []).push(p);
  const suma = (lista, campo) => lista.reduce((total, p) => total + (p[campo] ?? 0), 0);
  return Object.fromEntries(
    Object.entries(grupos).map(([tipo, lista]) => [
      tipo,
      {
        cantidad: lista.length,
        medianaReaccionesPorSeguidor: mediana(lista.map((p) => p.reaccionesPorSeguidor)),
        medianaVistasPorSeguidor: mediana(lista.map((p) => p.vistasPorSeguidor)),
        medianaAlcancePorSeguidor: mediana(lista.map((p) => p.alcancePorSeguidor)),
        medianaInteraccionesPorAlcance: mediana(lista.map((p) => p.interaccionesPorAlcance)),
        medianaEnviosPorAlcance: mediana(lista.map((p) => p.enviosPorAlcance)),
        guardados: suma(lista, "guardados"),
        compartidos: suma(lista, "compartidos"),
      },
    ])
  );
}

// Por tipo, la mediana de las medianas de cada cuenta de referencia (así una cuenta enorme no pesa más)
export function resumirReferenciasPorTipo(cuentasResumidas) {
  const grupos = {};
  for (const cuenta of cuentasResumidas) {
    for (const [tipo, datos] of Object.entries(cuenta.porTipo ?? {})) (grupos[tipo] ??= []).push(datos);
  }
  return Object.fromEntries(
    Object.entries(grupos).map(([tipo, lista]) => [
      tipo,
      {
        cuentas: lista.length,
        medianaReaccionesPorSeguidor: mediana(lista.map((d) => d.medianaReaccionesPorSeguidor)),
        medianaVistasPorSeguidor: mediana(lista.map((d) => d.medianaVistasPorSeguidor)),
      },
    ])
  );
}

export function veredicto(vow, referencias, cantidad) {
  if (!Number.isFinite(vow) || !Number.isFinite(referencias) || referencias <= 0) return "sin datos para comparar";
  if (cantidad < MUESTRA_MINIMA) return "muestra muy chica";
  const relacion = vow / referencias;
  if (relacion < MARGEN_PARECIDO[0]) return "por debajo";
  if (relacion > MARGEN_PARECIDO[1]) return "por encima";
  return "parecido";
}

export function compararConReferencias(propioPorTipo, referenciasPorTipo) {
  const filas = [];
  for (const [tipo, propio] of Object.entries(propioPorTipo)) {
    const ref = referenciasPorTipo[tipo];
    for (const [medida, campo] of [["reacciones por seguidor", "medianaReaccionesPorSeguidor"], ["vistas por seguidor", "medianaVistasPorSeguidor"]]) {
      const vow = propio[campo];
      const referencias = ref?.[campo] ?? null;
      if (vow === null && referencias === null) continue;
      filas.push({ tipo, medida, cantidad: propio.cantidad, vow, referencias, veredicto: veredicto(vow, referencias, propio.cantidad) });
    }
  }
  return filas;
}

// ---------- Mejor horario, formatos y hashtags (adaptado de las ideas de pp-instagram: best-time, formats, hashtag-perf) ----------
// Todo se calcula con las publicaciones propias y con código. Con pocas publicaciones es una señal, no una conclusión.
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const FRANJAS = [
  { nombre: "madrugada (0 a 6 h)", desde: 0, hasta: 6 },
  { nombre: "mañana (6 a 12 h)", desde: 6, hasta: 12 },
  { nombre: "tarde (12 a 18 h)", desde: 12, hasta: 18 },
  { nombre: "noche (18 a 24 h)", desde: 18, hasta: 24 },
];
const ARGENTINA_UTC = -3;

// Día y hora de Argentina (sin horario de verano) de un timestamp de Meta
export function momentoArgentino(timestamp) {
  const t = new Date(timestamp);
  if (Number.isNaN(t.getTime())) return null;
  const local = new Date(t.getTime() + ARGENTINA_UTC * 3_600_000);
  return { dia: DIAS[local.getUTCDay()], hora: local.getUTCHours() };
}

// Lo que se compara entre grupos: cuánto de la gente alcanzada hizo algo (interacciones por alcance)
const MEDIDA_GRUPOS = "interaccionesPorAlcance";

function resumirGrupo(clave, lista) {
  return {
    clave,
    cantidad: lista.length,
    medianaInteraccionesPorAlcance: mediana(lista.map((p) => p[MEDIDA_GRUPOS])),
    medianaAlcancePorSeguidor: mediana(lista.map((p) => p.alcancePorSeguidor)),
    muestraSuficiente: lista.length >= MUESTRA_MINIMA,
  };
}

const ordenarGrupos = (grupos) =>
  grupos.sort((a, b) => (b.medianaInteraccionesPorAlcance ?? -1) - (a.medianaInteraccionesPorAlcance ?? -1));

export function mejorHorario(publicaciones) {
  const conMomento = publicaciones.map((p) => ({ p, m: momentoArgentino(p.fecha) })).filter(({ m }) => m);
  const porFranja = FRANJAS.map((f) => resumirGrupo(f.nombre, conMomento.filter(({ m }) => m.hora >= f.desde && m.hora < f.hasta).map(({ p }) => p))).filter((g) => g.cantidad > 0);
  const porDia = DIAS.map((d) => resumirGrupo(d, conMomento.filter(({ m }) => m.dia === d).map(({ p }) => p))).filter((g) => g.cantidad > 0);
  const elegir = (grupos) => ordenarGrupos([...grupos]).find((g) => g.muestraSuficiente && Number.isFinite(g.medianaInteraccionesPorAlcance)) ?? null;
  return { porFranja: ordenarGrupos(porFranja), porDia: ordenarGrupos(porDia), mejorFranja: elegir(porFranja), mejorDia: elegir(porDia) };
}

// Los formatos ordenados por lo que más premia Instagram: guardados y envíos por alcance, y después interacción por alcance
export function rankingDeFormatos(porTipo) {
  return Object.entries(porTipo)
    .map(([tipo, d]) => ({ tipo, cantidad: d.cantidad, enviosPorAlcance: d.medianaEnviosPorAlcance, interaccionesPorAlcance: d.medianaInteraccionesPorAlcance, muestraSuficiente: d.cantidad >= MUESTRA_MINIMA }))
    .sort((a, b) => (b.enviosPorAlcance ?? -1) - (a.enviosPorAlcance ?? -1) || (b.interaccionesPorAlcance ?? -1) - (a.interaccionesPorAlcance ?? -1));
}

// Cada hashtag contra las publicaciones sin hashtags. Con una cuenta chica casi nunca hay muestra: se avisa.
export function rendimientoDeHashtags(publicaciones) {
  const sin = publicaciones.filter((p) => p.etiquetas.length === 0);
  const por = new Map();
  for (const p of publicaciones) for (const t of p.etiquetas) por.set(t, [...(por.get(t) ?? []), p]);
  const base = resumirGrupo("sin hashtags", sin);
  const etiquetas = ordenarGrupos([...por].map(([t, lista]) => resumirGrupo(t, lista)));
  return { sinHashtags: base, etiquetas };
}

const mejorPor = (lista, campo) =>
  lista.filter((p) => Number.isFinite(p[campo])).reduce((mejor, p) => (!mejor || p[campo] > mejor[campo] ? p : mejor), null);

// Junta todo en un informe. `referencias` son cuentas ya resumidas con resumirCuenta (metricas.js).
export function armarInforme({ fecha, cuenta, referencias = [], fallas = [], hoy = new Date(fecha) }) {
  const publicaciones = analizarPropias(cuenta, { hoy });
  const porTipo = resumirPropiasPorTipo(publicaciones);
  const referenciasPorTipo = resumirReferenciasPorTipo(referencias);
  const comparacion = referencias.length ? compararConReferencias(porTipo, referenciasPorTipo) : [];
  const horarios = mejorHorario(publicaciones);
  const formatos = rankingDeFormatos(porTipo);
  const hashtags = rendimientoDeHashtags(publicaciones);

  const avisos = [];
  if (Number.isFinite(cuenta.seguidos) && Number.isFinite(cuenta.seguidores) && cuenta.seguidos > cuenta.seguidores * 2) {
    avisos.push(`La cuenta sigue a ${cuenta.seguidos} y tiene ${cuenta.seguidores} seguidores: parte de los seguidores pueden ser de seguir de vuelta, que no miran el contenido. Las medidas por seguidor van a cambiar a medida que se limpien.`);
  }
  if (referencias.length) {
    avisos.push("Una cuenta chica suele tener más reacciones por seguidor que una enorme: la comparación con las referencias orienta, no es una competencia pareja.");
    avisos.push("Las vistas de las referencias pueden incluir anuncios pagos. VOW no tiene anuncios: sus vistas son orgánicas.");
  } else {
    avisos.push("No hay datos de referencias: el informe solo mide a VOW contra sí misma.");
  }
  const recientes = publicaciones.filter((p) => p.reciente).length;
  if (recientes) avisos.push(`${recientes} de ${publicaciones.length} publicaciones tienen menos de ${DIAS_RECIENTE} días y todavía suman alcance.`);
  const chicos = Object.entries(porTipo).filter(([, d]) => d.cantidad < MUESTRA_MINIMA).map(([tipo, d]) => `${tipo} (${d.cantidad})`);
  if (chicos.length) avisos.push(`Muestra muy chica en: ${chicos.join(", ")}. Con menos de ${MUESTRA_MINIMA} publicaciones de un tipo, tomalo como señal y no como conclusión.`);
  if (!horarios.mejorFranja) avisos.push(`Todavía no alcanza para decir cuál es el mejor horario: hace falta al menos ${MUESTRA_MINIMA} publicaciones en una misma franja. Hasta entonces, un horario de buena actividad es una apuesta y no un dato.`);
  if (hashtags.etiquetas.every((e) => !e.muestraSuficiente)) avisos.push(`Con menos de ${MUESTRA_MINIMA} publicaciones por hashtag no se puede decir cuáles ayudan: no se saca ninguna conclusión de hashtags todavía.`);
  const sinMetricas = cuenta.publicaciones.filter((p) => p.metricas === null).length;
  if (sinMetricas) avisos.push(`${sinMetricas} publicaciones no trajeron métricas de Meta y quedan sin alcance ni guardados.`);
  for (const { marca, motivo } of fallas) avisos.push(`No se pudo bajar ${marca}: ${motivo}`);

  return {
    fecha,
    cuenta: { usuario: cuenta.usuario, seguidores: cuenta.seguidores, seguidos: cuenta.seguidos },
    referencias: referencias.map((r) => r.marca ?? r.usuario),
    porTipo,
    referenciasPorTipo,
    comparacion,
    horarios,
    formatos,
    hashtags,
    destacadas: {
      masInteraccionPorAlcance: mejorPor(publicaciones, "interaccionesPorAlcance"),
      masGuardada: mejorPor(publicaciones.filter((p) => p.guardados > 0), "guardados"),
      masCompartida: mejorPor(publicaciones.filter((p) => p.compartidos > 0), "compartidos"),
    },
    avisos,
    publicaciones,
  };
}

const porcentaje = (n) => (Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—");
const numero = (n) => (Number.isFinite(n) ? String(n) : "—");

export function informeAMarkdown(informe) {
  const { fecha, cuenta, porTipo, comparacion, destacadas, avisos, publicaciones } = informe;
  const lineas = [
    `# Rendimiento de @${cuenta.usuario} · ${fecha}`,
    "",
    `> Calculado con código (sin IA) con datos de Meta del ${fecha}: ${publicaciones.length} publicaciones, ${numero(cuenta.seguidores)} seguidores, ${numero(cuenta.seguidos)} seguidos.${informe.referencias.length ? ` Referencias: ${informe.referencias.join(", ")}.` : ""}`,
    "",
    "## Por tipo de publicación",
    "",
    "| Tipo | Cantidad | Reacciones por seguidor | Alcance por seguidor | Interacciones por alcance | Guardados | Compartidos |",
    "|---|---|---|---|---|---|---|",
    ...Object.entries(porTipo).map(([tipo, d]) => `| ${tipo} | ${d.cantidad} | ${porcentaje(d.medianaReaccionesPorSeguidor)} | ${porcentaje(d.medianaAlcancePorSeguidor)} | ${porcentaje(d.medianaInteraccionesPorAlcance)} | ${d.guardados} | ${d.compartidos} |`),
    "",
    "Las tres columnas de porcentaje son medianas.",
  ];
  if (comparacion.length) {
    lineas.push(
      "",
      "## Contra las cuentas de referencia",
      "",
      "| Tipo | Medida | VOW | Referencias (mediana) | Resultado |",
      "|---|---|---|---|---|",
      ...comparacion.map((f) => `| ${f.tipo} | ${f.medida} | ${porcentaje(f.vow)} | ${porcentaje(f.referencias)} | ${f.veredicto} |`)
    );
  }
  const {horarios, formatos, hashtags} = informe;
  if (formatos?.length) {
    lineas.push(
      "",
      "## Qué formato lleva más gente a guardar y mandar",
      "",
      "Instagram premia más los guardados y los envíos que los likes. Ordenado por guardados y envíos sobre alcance (mediana).",
      "",
      "| Formato | Cantidad | Guardados y envíos por alcance | Interacciones por alcance | Muestra |",
      "|---|---|---|---|---|",
      ...formatos.map((f) => `| ${f.tipo} | ${f.cantidad} | ${porcentaje(f.enviosPorAlcance)} | ${porcentaje(f.interaccionesPorAlcance)} | ${f.muestraSuficiente ? "suficiente" : "chica (señal)"} |`)
    );
  }
  if (horarios && (horarios.porFranja.length || horarios.porDia.length)) {
    const tabla = (titulo, grupos) => [
      "",
      `Por ${titulo} (hora de Argentina, interacciones por alcance, mediana):`,
      "",
      `| ${titulo[0].toUpperCase()}${titulo.slice(1)} | Publicaciones | Interacciones por alcance | Muestra |`,
      "|---|---|---|---|",
      ...grupos.map((g) => `| ${g.clave} | ${g.cantidad} | ${porcentaje(g.medianaInteraccionesPorAlcance)} | ${g.muestraSuficiente ? "suficiente" : "chica (señal)"} |`),
    ];
    lineas.push("", "## Mejor horario", "", horarios.mejorFranja || horarios.mejorDia ? `Con muestra suficiente, mejor franja: ${horarios.mejorFranja?.clave ?? "sin dato"}; mejor día: ${horarios.mejorDia?.clave ?? "sin dato"}.` : "Todavía no hay muestra suficiente en ninguna franja ni día: lo que sigue es una señal y no una conclusión.", ...tabla("franja", horarios.porFranja), ...tabla("día", horarios.porDia));
  }
  if (hashtags?.etiquetas.length) {
    lineas.push(
      "",
      "## Hashtags",
      "",
      `Contra las publicaciones sin hashtags (${hashtags.sinHashtags.cantidad}, interacciones por alcance ${porcentaje(hashtags.sinHashtags.medianaInteraccionesPorAlcance)}).`,
      "",
      "| Hashtag | Publicaciones | Interacciones por alcance | Muestra |",
      "|---|---|---|---|",
      ...hashtags.etiquetas.slice(0, 10).map((g) => `| ${g.clave} | ${g.cantidad} | ${porcentaje(g.medianaInteraccionesPorAlcance)} | ${g.muestraSuficiente ? "suficiente" : "chica (señal)"} |`)
    );
  }
  const destacada = (titulo, p, detalle) => (p ? [`- **${titulo}:** ${p.tipo} del ${p.fecha?.slice(0, 10)}, ${detalle(p)}. "${String(p.primeraLinea).trim()}" ${p.enlace}`] : []);
  const lineasDestacadas = [
    ...destacada("Más interacción sobre alcance", destacadas.masInteraccionPorAlcance, (p) => `${porcentaje(p.interaccionesPorAlcance)} (${p.interacciones} de ${p.alcance})`),
    ...destacada("Más guardada", destacadas.masGuardada, (p) => `${p.guardados} guardados`),
    ...destacada("Más compartida", destacadas.masCompartida, (p) => `${p.compartidos} compartidos`),
  ];
  if (lineasDestacadas.length) lineas.push("", "## Destacadas", "", ...lineasDestacadas);
  lineas.push(
    "",
    "## Cada publicación",
    "",
    "| Fecha | Tipo | Alcance | Vistas | Likes | Comentarios | Guardados | Compartidos | Interacciones por alcance | Primera línea |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...publicaciones.map((p) => `| ${p.fecha?.slice(0, 10)}${p.reciente ? " (reciente)" : ""} | [${p.tipo}](${p.enlace}) | ${numero(p.alcance)} | ${numero(p.vistas)} | ${numero(p.likes)} | ${numero(p.comentarios)} | ${numero(p.guardados)} | ${numero(p.compartidos)} | ${porcentaje(p.interaccionesPorAlcance)} | ${String(p.primeraLinea).trim().replace(/\|/g, "/")} |`)
  );
  if (avisos.length) lineas.push("", "## Para leerlo bien", "", ...avisos.map((a) => `- ${a}`));
  return lineas.join("\n") + "\n";
}
