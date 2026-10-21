// Arma el servicio de publicación programada con la configuración del entorno (Render).
// Si falta alguna variable obligatoria, no se monta nada: la API sigue funcionando igual y el log dice qué falta.
import { crearClienteMeta } from "../mcp/instagram/api.js";
import { crearEditor } from "./editor.js";
import { crearGeneradorImagen } from "./imagen-ia.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRutasProgramacion } from "./rutas.js";
import { crearServicio } from "./servicio.js";
import { crearClienteTelegram } from "./telegram.js";

export const VARIABLES_OBLIGATORIAS = ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_WEBHOOK_SECRETO", "PROGRAMACION_SECRETO", "URL_PUBLICA"];

export async function construirProgramacion({ pool, env = process.env, fetchFn = fetch } = {}) {
  const faltan = VARIABLES_OBLIGATORIAS.filter((nombre) => !env[nombre]);
  if (faltan.length) return { router: null, faltan };

  const repo = crearRepositorio(pool);
  const telegram = crearClienteTelegram({ token: env.TELEGRAM_TOKEN, chatId: env.TELEGRAM_CHAT_ID, fetchFn });
  const meta = env.INSTAGRAM_TOKEN && env.INSTAGRAM_USER_ID ? crearClienteMeta({ token: env.INSTAGRAM_TOKEN, idCuenta: env.INSTAGRAM_USER_ID, fetchFn }) : null;
  // Publicar de verdad exige pedirlo explícitamente: mientras tanto el sistema corre completo pero en simulación
  const permitirPublicar = env.INSTAGRAM_PERMITIR_PUBLICAR === "1" && meta !== null;

  let editor = null;
  if (env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    editor = crearEditor({ cliente: new Anthropic() });
  }

  // Imágenes con IA: opcional, sin claves las piezas se arman con archivos que manda Facundo.
  // Cloudflare (FLUX, con cupo gratis diario) tiene prioridad; Gemini solo sirve con plan pago de Google.
  let generadorImagen = null;
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    generadorImagen = crearGeneradorImagen({ proveedor: "cloudflare", accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN, fetchFn });
  } else if (env.GEMINI_API_KEY) {
    generadorImagen = crearGeneradorImagen({ proveedor: "gemini", apiKey: env.GEMINI_API_KEY, modelo: env.GEMINI_MODELO || undefined, fetchFn });
  }

  const servicio = crearServicio({ repo, telegram, meta, editor, generadorImagen, urlPublica: env.URL_PUBLICA, permitirPublicar });
  const router = crearRutasProgramacion({ servicio, repo, secretoApi: env.PROGRAMACION_SECRETO, secretoWebhook: env.TELEGRAM_WEBHOOK_SECRETO });
  return { router, servicio, telegram, permitirPublicar, edicionConIA: editor !== null, imagenesConIA: generadorImagen !== null };
}
