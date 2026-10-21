// Imágenes con IA para las piezas de tipo "imagen". Pide la imagen a Gemini (plan gratuito de Google AI Studio) y después
// la deja lista para Instagram: recorte vertical 4:5 (1080x1350) y el isotipo de VOW puesto por código.
// El logo y los textos NUNCA los dibuja la IA (suele deformar las letras): los pone este archivo o no van.
// `fetchFn` se inyecta para probar sin red. La clave viaja en un encabezado, nunca en la dirección, y no aparece en los errores.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const MODELO_POR_DEFECTO = "gemini-2.5-flash-image";
export const ANCHO = 1080;
export const ALTO = 1350;

const aqui = dirname(fileURLToPath(import.meta.url));
const ISOTIPO = readFileSync(join(aqui, "..", "..", "web", "src", "assets", "logo-mark.svg"), "utf8");

export class ErrorImagenIA extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorImagenIA";
  }
}

// Todo pedido lleva el estilo de VOW delante: así las imágenes salen coherentes con la marca aunque la descripción sea corta
export const ESTILO_VOW = [
  "Imagen para Instagram de VOW, una marca argentina de ropa y accesorios técnicos para entrenar.",
  "Estilo sobrio y minimalista, mucho espacio vacío, luz suave, aspecto de revista.",
  "Paleta: negro #0A0A0A, hueso #ECE8E1, beige #CDBFA6 y, como acento mínimo, bordó #7A1F24.",
  "Composición vertical. NO incluyas texto, letras, números, logos ni marcas de agua.",
  "NO incluyas personas ni caras salvo que la descripción lo pida expresamente.",
].join(" ");

export const armarPedido = (descripcion) => `${ESTILO_VOW}\n\nLo que tiene que mostrar: ${String(descripcion).trim()}`;

// Isotipo en hueso (el del sitio usa currentColor)
const isotipoHueso = (ancho) => Buffer.from(ISOTIPO.replace('fill="currentColor"', 'fill="#ECE8E1"').replace("<svg ", `<svg width="${ancho}" `));

// Recorta a 4:5 y le pone el isotipo en hueso abajo a la derecha
export async function componer(imagen) {
  const ancho = 96;
  const margen = 56;
  const sello = await sharp(isotipoHueso(ancho), { density: 300 }).resize({ width: ancho }).png().toBuffer();
  const { height: altoSello } = await sharp(sello).metadata();
  const base = sharp(imagen).rotate().resize(ANCHO, ALTO, { fit: "cover", position: "centre" });
  const fondo = await base.toBuffer();
  return sharp(fondo)
    .composite([{ input: sello, left: ANCHO - ancho - margen, top: ALTO - altoSello - margen }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export function crearGeneradorImagen({ apiKey, modelo = MODELO_POR_DEFECTO, fetchFn = fetch } = {}) {
  return {
    modelo,
    // Devuelve un Buffer JPEG 1080x1350 listo para publicar
    async generar({ descripcion }) {
      if (!apiKey) throw new ErrorImagenIA("Falta GEMINI_API_KEY en el servicio.");
      if (!String(descripcion ?? "").trim()) throw new ErrorImagenIA("Falta la descripción de la imagen.");
      let respuesta;
      try {
        respuesta = await fetchFn(`${BASE}/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: armarPedido(descripcion) }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
        });
      } catch {
        throw new ErrorImagenIA("No se pudo conectar con el generador de imágenes.");
      }
      const datos = await respuesta.json().catch(() => null);
      if (respuesta.status === 429) throw new ErrorImagenIA("Se agotó el cupo gratis de imágenes por ahora. Probá más tarde o mandame la foto vos.");
      if (!respuesta.ok) throw new ErrorImagenIA(`El generador de imágenes rechazó el pedido (${respuesta.status}${datos?.error?.message ? `: ${String(datos.error.message).slice(0, 160)}` : ""}).`);
      if (datos?.promptFeedback?.blockReason) throw new ErrorImagenIA("El generador no aceptó esa descripción. Probá con otra.");
      const parte = datos?.candidates?.[0]?.content?.parts?.find((p) => (p.inlineData ?? p.inline_data)?.data);
      const datosImagen = parte?.inlineData ?? parte?.inline_data;
      if (!datosImagen) throw new ErrorImagenIA("El generador no devolvió ninguna imagen. Probá de nuevo o con otra descripción.");
      try {
        return await componer(Buffer.from(datosImagen.data, "base64"));
      } catch {
        throw new ErrorImagenIA("La imagen que devolvió el generador no se pudo procesar. Probá de nuevo.");
      }
    },
  };
}
