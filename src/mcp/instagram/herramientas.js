// Herramientas del servidor MCP de Instagram de VOW. Cada una es { nombre, titulo, descripcion, esquema,
// anotaciones, manejar }, así se pueden probar sin levantar el servidor.
//
// El servidor es de solo lectura (perfil, publicaciones, métricas, comentarios) más responder comentarios.
// No publica ni prepara publicaciones: eso no se hace por API.
// Reglas de la única escritura (responder_comentario):
// - Exige confirmar: true.
// - El texto pasa por las reglas de marca; si rompe una, no se llama a Meta.
import { z } from "zod";
import { LIMITE_LISTA_MAXIMO } from "./api.js";
import { revisarTextoPublico, validarId } from "./validaciones.js";
import { triarComentarios } from "../../agents/triaje-comentarios.js";

const ok = (datos) => ({ content: [{ type: "text", text: JSON.stringify(datos, null, 2) }] });
const fallo = (mensaje) => ({ content: [{ type: "text", text: mensaje }], isError: true });

const LECTURA = { readOnlyHint: true, openWorldHint: true };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

const errorDeTexto = (problemas) =>
  fallo(`El texto no cumple las reglas de la marca, no se envió nada a Instagram:\n- ${problemas.join("\n- ")}`);

export function crearHerramientas(meta) {
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
      descripcion: "Comentarios de una publicación de @vow_ar: ID, texto, usuario, fecha, likes y una categoría (consulta, pregunta, aporte, apoyo, ruido), ordenados de lo más urgente a lo menos, con el conteo por categoría.",
      esquema: {
        publicacion: z.string().describe("ID de la publicación."),
        limite: z.number().int().min(1).max(LIMITE_LISTA_MAXIMO).optional().describe("Cuántos traer (por defecto 25)."),
      },
      anotaciones: LECTURA,
      manejar: async ({ publicacion, limite }) => ok(triarComentarios(await meta.comentarios(validarId(publicacion, "ID de publicación"), limite))),
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
