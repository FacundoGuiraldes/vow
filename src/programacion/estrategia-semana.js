// La estrategia de la semana: sale de la última investigación (docs/investigacion/informe-AAAA-MM-DD.json, campo recomendaciones_para_estratega)
// y se puede modificar desde el juego y desde el bot. Lo que se cambia vive en la base (operacion.estrategia) y vale solo para esa semana:
// el lunes vuelve a arrancar de la investigación.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const RUTA_INVESTIGACION = new URL("../../docs/investigacion/", import.meta.url);

const claveDe = (texto) => `i${createHash("sha1").update(texto).digest("hex").slice(0, 8)}`;

// Líneas de la investigación más reciente: [{ k, t }] y el nombre del informe del que salen
export async function lineasDeInvestigacion({ leer = (r) => readFile(r, "utf8"), listar = (c) => readdir(c), carpeta = RUTA_INVESTIGACION } = {}) {
  try {
    const nombre = (await listar(carpeta)).filter((n) => /^informe-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().at(-1);
    if (!nombre) return { fuente: null, lineas: [] };
    const datos = JSON.parse(await leer(new URL(nombre, carpeta)));
    const recomendaciones = (Array.isArray(datos.recomendaciones_para_estratega) ? datos.recomendaciones_para_estratega : []).filter((t) => typeof t === "string" && t.trim());
    return { fuente: nombre.slice(8, 18), lineas: recomendaciones.map((t) => ({ k: claveDe(t.trim()), t: t.trim().slice(0, 600) })) };
  } catch {
    return { fuente: null, lineas: [] };
  }
}

export const estrategiaVacia = () => ({ semana: "", editadas: {}, quitadas: [], propias: {} });

// Lo que se ve esta semana: las líneas de la investigación (con lo que se cambió) más las que se agregaron a mano
export function vistaEstrategia(estrategia, { fuente, lineas }, lunes) {
  const e = estrategia?.semana === lunes ? estrategia : estrategiaVacia();
  const base = lineas.filter((l) => !e.quitadas.includes(l.k)).map((l) => ({ k: l.k, t: e.editadas[l.k] ?? l.t, origen: "investigacion", editada: l.k in e.editadas }));
  const propias = Object.entries(e.propias).map(([k, p]) => ({ k, t: p.t, origen: "propia", editada: false, en: p.en })).sort((a, b) => a.en.localeCompare(b.en));
  return { semana: lunes, fuente, lineas: [...base, ...propias], cambiada: Boolean(Object.keys(e.editadas).length || e.quitadas.length || propias.length) };
}
