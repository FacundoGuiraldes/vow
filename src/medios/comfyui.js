// Cliente de ComfyUI (programa gratis y local, licencia GPL-3.0) para generar imágenes y videos con modelos abiertos (por ejemplo Wan 2.2, Apache 2.0).
// ComfyUI corre en la PC de Facundo, no en el servidor: este módulo le habla por su API HTTP (por defecto http://127.0.0.1:8188).
// No publica nada: deja el archivo en una carpeta local; para usarlo en Instagram se sube después por el flujo de aprobación de siempre.
// El flujo de trabajo (workflow) se arma en ComfyUI y se exporta con "Save (API Format)"; en el JSON, el texto {{PROMPT}} se reemplaza por la descripción.
import { ESTILO_VOW } from "../programacion/imagen-ia.js";

export class ErrorComfyUI extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorComfyUI";
  }
}

const dormirReal = (ms) => new Promise((r) => setTimeout(r, ms));

// Mismo criterio que las imágenes: el estilo de VOW va detrás de la descripción y el logo y los textos no los dibuja la IA
export const armarDescripcion = (descripcion) => `${String(descripcion).trim()}. ${ESTILO_VOW}`;

// Reemplaza {{PROMPT}} en todo el flujo de trabajo, escapando el texto para que no rompa el JSON
export function llenarFlujo(plantilla, descripcion) {
  const texto = JSON.stringify(armarDescripcion(descripcion)).slice(1, -1);
  const flujo = JSON.parse(String(plantilla).replaceAll("{{PROMPT}}", () => texto));
  return flujo;
}

export function crearClienteComfyUI({ url = "http://127.0.0.1:8188", fetchFn = fetch, dormir = dormirReal, intervaloMs = 2000, maxEsperaMs = 30 * 60_000, ahora = () => Date.now() } = {}) {
  const base = String(url).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new ErrorComfyUI("COMFYUI_URL tiene que empezar con http:// o https://.");

  async function pedir(ruta, opciones) {
    try {
      return await fetchFn(`${base}${ruta}`, opciones);
    } catch {
      throw new ErrorComfyUI(`No se pudo conectar con ComfyUI en ${base}. ¿Está abierto?`);
    }
  }

  return {
    // Devuelve { archivos: [{ nombre, tipo, bytes: Buffer }] }
    async generar({ plantilla, descripcion }) {
      if (!String(descripcion ?? "").trim()) throw new ErrorComfyUI("Falta la descripción.");
      if (!String(plantilla ?? "").includes("{{PROMPT}}")) throw new ErrorComfyUI("El flujo de trabajo no tiene el texto {{PROMPT}} para poner la descripción.");
      let flujo;
      try {
        flujo = llenarFlujo(plantilla, descripcion);
      } catch {
        throw new ErrorComfyUI("El flujo de trabajo no es un JSON válido.");
      }

      const envio = await pedir("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: flujo }) });
      const datosEnvio = await envio.json().catch(() => null);
      if (!envio.ok || !datosEnvio?.prompt_id) {
        const motivo = datosEnvio?.error?.message ?? datosEnvio?.error ?? envio.status;
        throw new ErrorComfyUI(`ComfyUI rechazó el pedido (${String(motivo).slice(0, 160)}).`);
      }
      const id = datosEnvio.prompt_id;

      const limite = ahora() + maxEsperaMs;
      let historia = null;
      while (ahora() < limite) {
        const r = await pedir(`/history/${encodeURIComponent(id)}`);
        const datos = await r.json().catch(() => ({}));
        const item = datos?.[id];
        if (item?.status?.status_str === "error") throw new ErrorComfyUI("ComfyUI falló al generar (revisá la consola de ComfyUI).");
        if (item?.outputs && Object.keys(item.outputs).length > 0) { historia = item; break; }
        await dormir(intervaloMs);
      }
      if (!historia) throw new ErrorComfyUI("ComfyUI tardó demasiado. Revisá que no esté trabado.");

      // Las imágenes, GIFs y videos pueden venir en "images", "gifs" o "videos" según el nodo que guarda
      const referencias = Object.values(historia.outputs).flatMap((salida) => [salida.images, salida.gifs, salida.videos].flat().filter(Boolean));
      if (referencias.length === 0) throw new ErrorComfyUI("ComfyUI terminó pero no devolvió ningún archivo. ¿El flujo tiene un nodo que guarde?");

      const archivos = [];
      for (const ref of referencias) {
        if (ref.type === "temp") continue; // las vistas previas no son el resultado
        const consulta = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder ?? "", type: ref.type ?? "output" });
        const r = await pedir(`/view?${consulta}`);
        if (!r.ok) throw new ErrorComfyUI(`No se pudo bajar ${ref.filename} desde ComfyUI (${r.status}).`);
        archivos.push({ nombre: String(ref.filename).replace(/[^\w.\-]/g, "_"), tipo: r.headers?.get?.("content-type") ?? null, bytes: Buffer.from(await r.arrayBuffer()) });
      }
      if (archivos.length === 0) throw new ErrorComfyUI("ComfyUI no dejó archivos finales (solo vistas previas).");
      return { archivos };
    },
  };
}
