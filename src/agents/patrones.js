// Patrones de éxito de las cuentas de referencia, calculados con CÓDIGO (sin IA) sobre los datos reales de Instagram.
// Cada afirmación sale de una cuenta y una publicación con enlace, y se mide contra el tamaño y la mediana de esa misma cuenta:
// así una marca chica y una enorme se pueden comparar, y un post suelto no pasa por tendencia.

import { mediana } from "./metricas.js";

export const TOP_POR_GRUPO = 6;
export const MINIMO_PUBLICACIONES_CUENTA = 5; // con menos, la mediana de la cuenta no sirve de vara

const redondear = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : "—");

// "Veces la mediana de su cuenta": 3 significa que esa publicación rindió el triple de lo normal para esa cuenta
function conRelativo(cuenta) {
  const publicaciones = cuenta.publicaciones ?? [];
  const base = mediana(publicaciones.map((p) => p.reaccionesPorSeguidor));
  if (publicaciones.length < MINIMO_PUBLICACIONES_CUENTA || !base) return [];
  return publicaciones
    .filter((p) => Number.isFinite(p.reaccionesPorSeguidor) && p.enlace)
    .map((p) => ({ marca: cuenta.marca, grupo: cuenta.grupo ?? "sin grupo", pais: cuenta.pais, relativo: p.reaccionesPorSeguidor / base, ...p }));
}

function rasgos(lista) {
  const n = lista.length;
  if (n === 0) return null;
  const parte = (f) => lista.filter(f).length / n;
  return {
    publicaciones: n,
    palabras_texto: redondear(mediana(lista.map((p) => p.palabras))),
    palabras_primera_linea: redondear(mediana(lista.map((p) => p.palabrasPrimeraLinea))),
    con_pregunta: redondear(parte((p) => p.esPregunta)),
    con_emojis: redondear(parte((p) => (p.emojis ?? 0) > 0)),
    con_hashtags: redondear(parte((p) => (p.hashtags ?? 0) > 0)),
    tipos: Object.fromEntries(Object.entries(lista.reduce((acc, p) => ({ ...acc, [p.tipo]: (acc[p.tipo] ?? 0) + 1 }), {})).map(([t, c]) => [t, redondear(c / n)])),
  };
}

export function calcularPatrones(datos) {
  const todas = (datos?.cuentas ?? []).flatMap(conRelativo);
  const grupos = [...new Set(todas.map((p) => p.grupo))];
  const por = (lista) => {
    const ordenadas = [...lista].sort((a, b) => b.relativo - a.relativo);
    const corte = Math.max(1, Math.ceil(ordenadas.length / 3));
    return {
      cuentas: [...new Set(lista.map((p) => p.marca))],
      publicaciones: lista.length,
      mejores: ordenadas.slice(0, TOP_POR_GRUPO).map((p) => ({ marca: p.marca, tipo: p.tipo, fecha: p.fecha?.slice(0, 10), veces_su_mediana: redondear(p.relativo), reacciones_pct_seguidores: redondear(p.reaccionesPorSeguidor * 100, 3), primera_linea: String(p.primeraLinea ?? "").slice(0, 160), enlace: p.enlace })),
      rasgos_del_tercio_mejor: rasgos(ordenadas.slice(0, corte)),
      rasgos_del_resto: rasgos(ordenadas.slice(corte)),
      rendimiento_por_tipo: Object.fromEntries(
        ["reel", "carrusel", "imagen", "video"].flatMap((t) => {
          const l = lista.filter((p) => p.tipo === t);
          return l.length ? [[t, { publicaciones: l.length, mediana_veces_su_mediana: redondear(mediana(l.map((p) => p.relativo))) }]] : [];
        })
      ),
    };
  };
  return { fecha: datos?.fecha ?? null, total_publicaciones: todas.length, grupos: Object.fromEntries(grupos.map((g) => [g, por(todas.filter((p) => p.grupo === g))])), todos: todas.length ? por(todas) : null };
}

export function patronesAMarkdown(patrones) {
  if (!patrones || !patrones.total_publicaciones) return "";
  const lineas = [`# Qué funcionó en las cuentas de referencia${patrones.fecha ? ` · ${patrones.fecha}` : ""}`, "", "> Calculado con código sobre datos reales de Instagram, sin IA. \"Veces su mediana\" compara cada publicación con lo normal de SU cuenta (3 = rindió el triple). Muestras chicas: son señales, no leyes. Las vistas pueden incluir anuncios pagos; acá solo se miden reacciones sobre seguidores.", ""];
  for (const [grupo, g] of Object.entries(patrones.grupos)) {
    lineas.push(`## Grupo ${grupo} (${g.cuentas.join(", ")}; ${g.publicaciones} publicaciones)`, "");
    const tipos = Object.entries(g.rendimiento_por_tipo).map(([t, v]) => `${t}: ${v.mediana_veces_su_mediana}x (${v.publicaciones})`).join(" · ");
    if (tipos) lineas.push(`Por tipo (mediana de veces su mediana): ${tipos}`, "");
    lineas.push("Lo que más rindió:");
    for (const p of g.mejores) lineas.push(`- ${p.marca} · ${p.tipo} · ${p.veces_su_mediana}x su mediana (${p.reacciones_pct_seguidores}% de sus seguidores)${p.primera_linea ? ` · "${p.primera_linea}"` : ""} ${p.enlace}`);
    const a = g.rasgos_del_tercio_mejor;
    const b = g.rasgos_del_resto;
    if (a && b) {
      lineas.push("", `Rasgos del tercio que mejor rindió contra el resto: palabras del texto ${a.palabras_texto} vs ${b.palabras_texto}; palabras de la primera línea ${a.palabras_primera_linea} vs ${b.palabras_primera_linea}; con pregunta ${pct(a.con_pregunta)} vs ${pct(b.con_pregunta)}; con emojis ${pct(a.con_emojis)} vs ${pct(b.con_emojis)}; con hashtags ${pct(a.con_hashtags)} vs ${pct(b.con_hashtags)}.`);
    }
    lineas.push("");
  }
  return lineas.join("\n");
}
