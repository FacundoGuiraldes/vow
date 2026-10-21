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

const mejorPor = (lista, campo) =>
  lista.filter((p) => Number.isFinite(p[campo])).reduce((mejor, p) => (!mejor || p[campo] > mejor[campo] ? p : mejor), null);

// Junta todo en un informe. `referencias` son cuentas ya resumidas con resumirCuenta (metricas.js).
export function armarInforme({ fecha, cuenta, referencias = [], fallas = [], hoy = new Date(fecha) }) {
  const publicaciones = analizarPropias(cuenta, { hoy });
  const porTipo = resumirPropiasPorTipo(publicaciones);
  const referenciasPorTipo = resumirReferenciasPorTipo(referencias);
  const comparacion = referencias.length ? compararConReferencias(porTipo, referenciasPorTipo) : [];

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
