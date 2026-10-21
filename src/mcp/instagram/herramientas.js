// Herramientas del servidor MCP de Instagram de VOW. Cada una es { nombre, titulo, descripcion, esquema,
// anotaciones, manejar }, así se pueden probar sin levantar el servidor.
//
// Reglas de escritura:
// - Todo lo que publica o responde está apagado salvo INSTAGRAM_PERMITIR_PUBLICAR=1.
// - Publicar lleva dos pasos: preparar (valida y crea el contenedor, todavía no es público) y publicar
//   (exige confirmar: true y que el contenedor esté listo).
// - Todo texto que va a ver el público pasa por las reglas de marca; si rompe una, no se llama a Meta.
import { z } from "zod";
import { LIMITE_LISTA_MAXIMO } from "./api.js";
import { ITEMS_CARRUSEL, revisarTextoPublico, validarId, validarUrlPublica } from "./validaciones.js";

const ok = (datos) => ({ content: [{ type: "text", text: JSON.stringify(datos, null, 2) }] });
const fallo = (mensaje) => ({ content: [{ type: "text", text: mensaje }], isError: true });

const ESCRITURA_APAGADA =
  "La publicación está apagada. Para habilitarla, poné INSTAGRAM_PERMITIR_PUBLICAR=1 en el .env y reiniciá el servidor.";

const QUE_HACER_SEGUN_ESTADO = {
  IN_PROGRESS: "Meta todavía está procesando el archivo (pasa con los videos). Probá de nuevo en un minuto.",
  EXPIRED: "El contenedor venció (pasaron más de 24 h). Prepará la publicación de nuevo.",
  ERROR: "Meta no pudo procesar el archivo. Revisá que la dirección sea pública y el formato correcto (imágenes en JPEG).",
  PUBLISHED: "Ese contenedor ya se publicó.",
};

const LECTURA = { readOnlyHint: true, openWorldHint: true };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const errorDeTexto = (problemas) =>
  fallo(`El texto no cumple las reglas de la marca, no se envió nada a Instagram:\n- ${problemas.join("\n- ")}`);

async function verificarCupo(meta) {
  const cupo = await meta.cupo();
  if (cupo.total !== null && cupo.usado !== null && cupo.usado >= cupo.total) {
    throw new Error(`Se usó todo el cupo de publicaciones por API de las últimas 24 h (${cupo.usado} de ${cupo.total}).`);
  }
  return cupo;
}

export function crearHerramientas(meta, { permitirPublicar = false } = {}) {
  const herramientas = [
    {
      nombre: "perfil",
      titulo: "Perfil de @vow_ar",
      descripcion: "Datos de la cuenta de Instagram de VOW: usuario, nombre, biografía, web, seguidores, seguidos y cantidad de publicaciones.",
      esquema: {},
      anotaciones: LECTURA,
      manejar: async () => ok(await meta.perfil()),
    },
    {
      nombre: "publicaciones",
      titulo: "Últimas publicaciones",
      descripcion: "Últimas publicaciones de @vow_ar con tipo, texto, fecha, link, likes y comentarios.",
      esquema: { limite: z.number().int().min(1).max(LIMITE_LISTA_MAXIMO).optional().describe("Cuántas traer (por defecto 12).") },
      anotaciones: LECTURA,
      manejar: async ({ limite }) => ok(await meta.publicaciones(limite)),
    },
    {
      nombre: "metricas_publicacion",
      titulo: "Métricas de una publicación",
      descripcion: "Alcance, vistas, likes, comentarios, guardados, compartidos e interacciones totales de una publicación de @vow_ar.",
      esquema: { publicacion: z.string().describe("ID de la publicación (sale de la herramienta publicaciones).") },
      anotaciones: LECTURA,
      manejar: async ({ publicacion }) => ok(await meta.metricas(validarId(publicacion, "ID de publicación"))),
    },
    {
      nombre: "comentarios",
      titulo: "Comentarios de una publicación",
      descripcion: "Comentarios de una publicación de @vow_ar: ID, texto, usuario, fecha y likes.",
      esquema: {
        publicacion: z.string().describe("ID de la publicación."),
        limite: z.number().int().min(1).max(LIMITE_LISTA_MAXIMO).optional().describe("Cuántos traer (por defecto 25)."),
      },
      anotaciones: LECTURA,
      manejar: async ({ publicacion, limite }) => ok(await meta.comentarios(validarId(publicacion, "ID de publicación"), limite)),
    },
    {
      nombre: "preparar_publicacion",
      titulo: "Preparar una publicación (no la publica)",
      descripcion:
        "Valida el texto con las reglas de la marca, chequea el cupo diario y crea el contenedor en Meta. Todavía NO se publica: " +
        "devuelve el ID del contenedor para revisarlo y publicarlo después con la herramienta publicar. " +
        "Las imágenes tienen que ser JPEG en una dirección https pública. El contenedor vence a las 24 h.",
      esquema: {
        tipo: z.enum(["imagen", "reel", "carrusel"]).describe("imagen: una foto. reel: un video. carrusel: de 2 a 20 imágenes."),
        urls: z.array(z.string()).min(1).max(ITEMS_CARRUSEL.maximo).describe("Direcciones https públicas de los archivos, en orden."),
        epigrafe: z.string().describe("Texto de la publicación, tal como lo va a ver la gente."),
      },
      anotaciones: ESCRITURA,
      manejar: async ({ tipo, urls, epigrafe }) => {
        if (!permitirPublicar) return fallo(ESCRITURA_APAGADA);
        const problemas = revisarTextoPublico(epigrafe);
        if (problemas.length > 0) return errorDeTexto(problemas);

        const direcciones = urls.map(validarUrlPublica);
        if (tipo !== "carrusel" && direcciones.length !== 1) return fallo(`Un ${tipo} lleva exactamente un archivo.`);
        if (tipo === "carrusel" && direcciones.length < ITEMS_CARRUSEL.minimo) {
          return fallo(`Un carrusel lleva de ${ITEMS_CARRUSEL.minimo} a ${ITEMS_CARRUSEL.maximo} imágenes.`);
        }
        const cupo = await verificarCupo(meta);

        let contenedor;
        if (tipo === "imagen") {
          contenedor = await meta.crearContenedor({ image_url: direcciones[0], caption: epigrafe });
        } else if (tipo === "reel") {
          contenedor = await meta.crearContenedor({ media_type: "REELS", video_url: direcciones[0], caption: epigrafe });
        } else {
          const hijos = [];
          for (const url of direcciones) hijos.push(await meta.crearContenedor({ image_url: url, is_carousel_item: "true" }));
          contenedor = await meta.crearContenedor({ media_type: "CAROUSEL", children: hijos.join(","), caption: epigrafe });
        }
        const estado = await meta.estadoContenedor(contenedor);
        return ok({
          contenedor,
          estado,
          tipo,
          archivos: direcciones,
          epigrafe,
          cupo,
          siguientePaso:
            "Todavía no se publicó. Revisá el texto y los archivos; para publicar, usá la herramienta publicar con este " +
            "contenedor y confirmar: true. Vence en 24 h." + (estado === "IN_PROGRESS" ? " Meta lo está procesando: esperá un minuto." : ""),
        });
      },
    },
    {
      nombre: "publicar",
      titulo: "Publicar en @vow_ar",
      descripcion:
        "Publica en Instagram un contenedor creado con preparar_publicacion. Queda visible para todo el mundo. " +
        "Exige confirmar: true y que el contenedor esté listo (FINISHED).",
      esquema: {
        contenedor: z.string().describe("ID del contenedor que devolvió preparar_publicacion."),
        confirmar: z.literal(true).describe("Tiene que ser true: confirma que se revisó la publicación."),
      },
      anotaciones: ESCRITURA,
      manejar: async ({ contenedor, confirmar }) => {
        if (!permitirPublicar) return fallo(ESCRITURA_APAGADA);
        if (confirmar !== true) return fallo("Falta confirmar: true.");
        validarId(contenedor, "ID de contenedor");
        const estado = await meta.estadoContenedor(contenedor);
        if (estado !== "FINISHED") return fallo(QUE_HACER_SEGUN_ESTADO[estado] ?? `El contenedor no está listo (estado: ${estado}).`);
        await verificarCupo(meta);
        return ok(await meta.publicar(contenedor));
      },
    },
    {
      nombre: "responder_comentario",
      titulo: "Responder un comentario",
      descripcion:
        "Responde públicamente un comentario en una publicación de @vow_ar. El texto pasa por las reglas de la marca. " +
        "Solo se pueden responder comentarios principales (no respuestas) y no ocultos. Exige confirmar: true.",
      esquema: {
        comentario: z.string().describe("ID del comentario (sale de la herramienta comentarios)."),
        mensaje: z.string().describe("Texto de la respuesta, tal como lo va a ver la gente."),
        confirmar: z.literal(true).describe("Tiene que ser true: confirma que se revisó la respuesta."),
      },
      anotaciones: ESCRITURA,
      manejar: async ({ comentario, mensaje, confirmar }) => {
        if (!permitirPublicar) return fallo(ESCRITURA_APAGADA);
        if (confirmar !== true) return fallo("Falta confirmar: true.");
        validarId(comentario, "ID de comentario");
        const problemas = revisarTextoPublico(mensaje);
        if (problemas.length > 0) return errorDeTexto(problemas);
        return ok({ respuesta: await meta.responder(comentario, mensaje) });
      },
    },
  ];

  // Cualquier error (de validación o de Meta) vuelve como resultado con isError, no como excepción
  return herramientas.map((h) => ({
    ...h,
    manejar: async (args = {}) => {
      try {
        return await h.manejar(args);
      } catch (error) {
        return fallo(error.message);
      }
    },
  }));
}
