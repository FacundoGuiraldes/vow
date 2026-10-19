// Lectura de datos PÚBLICOS de cuentas profesionales de Instagram con la API oficial de Meta
// (campo "business_discovery"). Solo lee: no publica ni cambia nada.
//
// Qué trae la API: seguidores, y de cada publicación likes, comentarios, tipo, fecha, texto y link.
// Vistas solo en videos (y suman las pagas). NO trae la imagen ni el sonido, ni guardados ni
// compartidos de cuentas ajenas.

export const VERSION_API = "v26.0";
export const LIMITE_POR_DEFECTO = 25;
export const LIMITE_MAXIMO = 50;

const CAMPOS_PUBLICACION = "like_count,comments_count,view_count,media_type,timestamp,caption,permalink";

export function validarUsuario(usuario) {
  // Nombres de usuario de Instagram: letras, números, punto y guion bajo, hasta 30 caracteres
  if (typeof usuario !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(usuario)) {
    throw new Error(`Usuario de Instagram inválido: "${usuario}".`);
  }
  return usuario.toLowerCase();
}

export function armarCampos(usuario, limite = LIMITE_POR_DEFECTO) {
  const u = validarUsuario(usuario);
  const n = Math.min(Math.max(1, Math.trunc(Number(limite)) || LIMITE_POR_DEFECTO), LIMITE_MAXIMO);
  return `business_discovery.username(${u}){followers_count,media_count,media.limit(${n}){${CAMPOS_PUBLICACION}}}`;
}

// Traduce los errores de Meta a un mensaje que se entienda. Nunca incluye el token.
export function explicarError(error) {
  const codigo = error?.code;
  if (codigo === 190) return "El token venció o no es válido: generá uno nuevo.";
  if (codigo === 10 || codigo === 200) return "A la app le falta un permiso (por ejemplo instagram_manage_insights) o Meta pide revisarla.";
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613) return "Se pasó el límite de consultas de Meta: probá de nuevo en un rato.";
  if (codigo === 110 || codigo === 100) return "La cuenta no existe, no es profesional o no es pública.";
  return `Meta devolvió un error (código ${codigo ?? "desconocido"}): ${error?.message ?? "sin detalle"}`;
}

// Baja los datos públicos de UNA cuenta. `fetchFn` se inyecta para poder probar sin red.
export async function descargarCuenta(usuario, { token, idCuentaPropia, limite, fetchFn = fetch } = {}) {
  if (!token) throw new Error("Falta el token de Instagram (INSTAGRAM_TOKEN).");
  if (!idCuentaPropia) throw new Error("Falta el ID de la cuenta propia (INSTAGRAM_USER_ID).");
  const url = new URL(`https://graph.facebook.com/${VERSION_API}/${encodeURIComponent(idCuentaPropia)}`);
  url.searchParams.set("fields", armarCampos(usuario, limite));
  url.searchParams.set("access_token", token);

  let respuesta;
  try {
    respuesta = await fetchFn(url);
  } catch {
    // No se muestra el error original: puede incluir la dirección con el token
    throw new Error("No se pudo conectar con la API de Meta.");
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || datos?.error) {
    throw new Error(explicarError(datos?.error));
  }
  const cuenta = datos?.business_discovery;
  if (!cuenta) throw new Error("Meta respondió sin datos de la cuenta.");
  return {
    usuario: validarUsuario(usuario),
    seguidores: cuenta.followers_count ?? null,
    publicacionesTotales: cuenta.media_count ?? null,
    publicaciones: cuenta.media?.data ?? [],
  };
}
