// Arma el servicio de publicación programada con la configuración del entorno (Render).
// Si falta alguna variable obligatoria, no se monta nada: la API sigue funcionando igual y el log dice qué falta.
import { crearClienteMeta } from "../mcp/instagram/api.js";
import { crearEditor, crearValidadorEdicion } from "./editor.js";
import { crearGeneradorImagen } from "./imagen-ia.js";
import { crearLLMGemini } from "./llm-gemini.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRendimientoJuego } from "./rendimiento-juego.js";
import { crearClienteTiendanube } from "../tiendanube/cliente.js";
import { procesarAviso } from "../tiendanube/procesar.js";
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

  // Chat con la IA (Gemini, plan gratis): opcional. Sin la clave, responder a una pieza usa el editor con Claude y lo demás son novedades.
  const llm = env.GEMINI_API_KEY ? crearLLMGemini({ apiKey: env.GEMINI_API_KEY, modelo: env.GEMINI_MODELO_CHAT || undefined, fetchFn }) : null;

  const servicio = crearServicio({ repo, telegram, meta, editor, generadorImagen, llm, validarEdicion: llm ? crearValidadorEdicion() : null, urlPublica: env.URL_PUBLICA, permitirPublicar });
  // Ventas de Tiendanube al Almacén: solo si están las tres claves de la app
  let tiendanube = null;
  if (env.TIENDANUBE_CLIENT_SECRET && env.TIENDANUBE_ACCESS_TOKEN && env.TIENDANUBE_STORE_ID) {
    const cliente = crearClienteTiendanube({ storeId: env.TIENDANUBE_STORE_ID, token: env.TIENDANUBE_ACCESS_TOKEN, contacto: env.TIENDANUBE_CONTACTO || "vow2026ar@gmail.com", fetchFn });
    tiendanube = { secreto: env.TIENDANUBE_CLIENT_SECRET, procesar: (aviso) => procesarAviso({ repo, cliente, aviso }) };
  }
  const router = crearRutasProgramacion({ servicio, repo, tiendanube, secretoApi: env.PROGRAMACION_SECRETO, secretoOficina: env.OFICINA_SECRETO || null, secretoWebhook: env.TELEGRAM_WEBHOOK_SECRETO, permitirPublicar, rendimiento: meta ? crearRendimientoJuego({ meta }) : null });
  // Al arrancar se revisa la bandeja de Telegram (un poco después, para no pisar a la copia anterior mientras termina de cerrar)
  setTimeout(() => servicio.recuperarActualizaciones().catch((error) => console.error(`No se pudo revisar la bandeja de Telegram: ${error.message}`)), 90_000).unref();
  return { router, servicio, telegram, permitirPublicar, edicionConIA: editor !== null, imagenesConIA: generadorImagen !== null, chatConIA: llm !== null };
}
