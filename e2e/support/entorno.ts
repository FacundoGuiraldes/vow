// Dónde corre la suite y qué está permitido. Lo usan la config, los fixtures y el teardown global.
// Regla: contra cualquier host que no sea local solo corren los @smoke (lectura), y escribir en la base
// requiere API local + permiso explícito + que la base no sea la de producción.

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const URL_LOCAL_POR_DEFECTO = "http://localhost:4173";

export const baseURL = (process.env.E2E_BASE_URL || URL_LOCAL_POR_DEFECTO).replace(/\/+$/, "");

export const esHostLocal = (url: string): boolean => HOSTS_LOCALES.has(new URL(url).hostname);

export const esLocal = esHostLocal(baseURL);

// En local la landing reenvía /api a la API local (proxy de Vite), así que la API está en el mismo origen.
// Contra un sitio publicado hay que decir dónde está la API (la landing de Cloudflare no sirve /api).
export function urlDeLaApi(): string {
  if (esLocal) return baseURL;
  const url = process.env.E2E_API_URL;
  if (!url) {
    throw new Error("Contra un sitio publicado hay que definir E2E_API_URL (URL base de la API, sin barra final).");
  }
  return url.replace(/\/+$/, "");
}

// Neon usa el mismo host con y sin "-pooler" para la misma rama: se comparan sin ese sufijo.
const normalizarHost = (host: string): string => host.trim().toLowerCase().replace(/-pooler(?=\.)/, "");

// Devuelve el motivo por el que NO se puede escribir en la base, o null si está permitido.
// Nunca incluye la URL ni el host de la base en el mensaje.
export function motivoParaNoEscribir(): string | null {
  if (!esLocal) {
    return "la base URL no es local: contra un sitio publicado no se escribe nunca";
  }
  if (process.env.E2E_ALLOW_DB_WRITES !== "dev") {
    return "falta E2E_ALLOW_DB_WRITES=dev (permiso explícito para escribir en la base dev)";
  }
  const urlBase = process.env.DATABASE_URL;
  if (!urlBase) {
    return "falta DATABASE_URL";
  }
  const hostProduccion = process.env.E2E_PROD_DB_HOST?.trim();
  if (hostProduccion) {
    let hostActual: string;
    try {
      hostActual = new URL(urlBase).hostname;
    } catch {
      return "DATABASE_URL no es una URL válida";
    }
    if (normalizarHost(hostActual) === normalizarHost(hostProduccion)) {
      return "DATABASE_URL apunta al host de producción (E2E_PROD_DB_HOST)";
    }
  }
  return null;
}

// Identificador de esta corrida: va en cada email de prueba para poder rastrear qué corrida lo creó.
export const idDeCorrida = (): string => process.env.E2E_RUN_ID ?? "local";
