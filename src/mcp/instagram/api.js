// Cliente mínimo de la API oficial de Meta (Instagram con inicio de sesión de Facebook) para la cuenta de VOW.
// Lee perfil, publicaciones, métricas y comentarios, y puede crear contenedores, publicarlos y responder
// comentarios. No decide nada: las reglas (qué se puede publicar y cuándo) viven en herramientas.js.
// El token nunca sale de acá: no aparece en respuestas ni en mensajes de error.
import { VERSION_API, explicarError } from "../../agents/instagram.js";

const BASE = `https://graph.facebook.com/${VERSION_API}`;

const CAMPOS_PERFIL = "username,name,biography,website,followers_count,follows_count,media_count";
const CAMPOS_PUBLICACION = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
const CAMPOS_COMENTARIO = "id,text,username,timestamp,like_count";
// Métricas vigentes para posts y reels (impressions está deprecada para lo publicado desde julio de 2024)
export const METRICAS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];

export const LIMITE_LISTA_MAXIMO = 50;

// Errores de Meta en un mensaje que se entienda. Los códigos 100 y 110 tienen otro sentido fuera de
// business_discovery, así que acá no se usa ese texto.
export function explicarErrorMeta(error) {
  const codigo = error?.code;
  if ([190, 10, 200, 4, 17, 32, 613].includes(codigo)) return explicarError(error);
  return `Meta rechazó el pedido (código ${codigo ?? "desconocido"}): ${error?.message ?? "sin detalle"}`;
}

export function crearClienteMeta({ token, idCuenta, fetchFn = fetch } = {}) {
  async function pedir(metodo, ruta, parametros = {}) {
    if (!token) throw new Error("Falta el token de Instagram (INSTAGRAM_TOKEN en el .env).");
    if (!idCuenta) throw new Error("Falta el ID de la cuenta de Instagram (INSTAGRAM_USER_ID en el .env).");

    const params = new URLSearchParams({ ...parametros, access_token: token });
    const url = new URL(`${BASE}/${ruta}`);
    const opciones = { method: metodo };
    // En GET los parámetros van en la dirección; en POST, en el cuerpo (así el token no queda en la URL)
    if (metodo === "GET") url.search = params.toString();
    else opciones.body = params;

    let respuesta;
    try {
      respuesta = await fetchFn(url, opciones);
    } catch {
      // No se muestra el error original: puede incluir la dirección con el token
      throw new Error("No se pudo conectar con la API de Meta.");
    }
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok || datos?.error) throw new Error(explicarErrorMeta(datos?.error));
    return datos;
  }

  const limitar = (n, porDefecto) => Math.min(Math.max(1, Math.trunc(Number(n)) || porDefecto), LIMITE_LISTA_MAXIMO);

  return {
    perfil: () => pedir("GET", idCuenta, { fields: CAMPOS_PERFIL }),

    publicaciones: async (limite = 12) =>
      (await pedir("GET", `${idCuenta}/media`, { fields: CAMPOS_PUBLICACION, limit: limitar(limite, 12) })).data ?? [],

    metricas: async (idPublicacion) => {
      const { data = [] } = await pedir("GET", `${idPublicacion}/insights`, { metric: METRICAS.join(",") });
      return Object.fromEntries(data.map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? null]));
    },

    comentarios: async (idPublicacion, limite = 25) =>
      (await pedir("GET", `${idPublicacion}/comments`, { fields: CAMPOS_COMENTARIO, limit: limitar(limite, 25) })).data ?? [],

    // Cupo de publicación por API en las últimas 24 h
    cupo: async () => {
      const { data = [] } = await pedir("GET", `${idCuenta}/content_publishing_limit`, { fields: "quota_usage,config" });
      const fila = data[0] ?? {};
      return { usado: fila.quota_usage ?? null, total: fila.config?.quota_total ?? null };
    },

    crearContenedor: async (parametros) => (await pedir("POST", `${idCuenta}/media`, parametros)).id,

    estadoContenedor: async (idContenedor) =>
      (await pedir("GET", idContenedor, { fields: "status_code" })).status_code ?? null,

    publicar: async (idContenedor) => {
      const { id } = await pedir("POST", `${idCuenta}/media_publish`, { creation_id: idContenedor });
      const { permalink = null } = await pedir("GET", id, { fields: "permalink" });
      return { id, permalink };
    },

    responder: async (idComentario, mensaje) => (await pedir("POST", `${idComentario}/replies`, { message: mensaje })).id,
  };
}
