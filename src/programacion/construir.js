// Arma el servicio de publicación programada con la configuración del entorno (Render).
// Si falta alguna variable obligatoria, no se monta nada: la API sigue funcionando igual y el log dice qué falta.
import { crearClienteMeta } from "../mcp/instagram/api.js";
import { crearEditor, crearValidadorEdicion } from "./editor.js";
import { crearGeneradorImagen } from "./imagen-ia.js";
import { crearLLMGemini } from "./llm-gemini.js";
import { crearRepositorio } from "./repositorio.js";
import { crearRendimientoJuego } from "./rendimiento-juego.js";
import { crearGestorCodigos } from "../descuentos/codigos.js";
import { crearTransporteGmail, crearTransporteGmailApi } from "../descuentos/correo.js";
import { crearConsultaCodigo, crearEnvioDescuentos } from "../descuentos/lista-espera.js";
import { crearClienteMercadoPago } from "../pagos/mercadopago.js";
import { crearRutasVentas } from "../pagos/rutas.js";
import { crearArrepentimientos } from "../pagos/arrepentimiento.js";
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

  // Códigos de descuento para la lista de espera: los códigos funcionan siempre; el envío de mails exige la cuenta de Gmail de VOW
  // Cada drop tiene sus códigos. Del Drop 01 en adelante solo reciben código quienes se anotaron antes de LISTA_CORTE (el día que se lanzó el Drop 00)
  const drop = env.DROP_ACTUAL || "00";
  const corte = env.LISTA_CORTE ? new Date(env.LISTA_CORTE) : null;
  const dropValido = /^\d{2}$/.test(drop) && (drop === "00" || (corte !== null && !Number.isNaN(corte.getTime())));
  if (!dropValido) console.error("DROP_ACTUAL tiene que ser de dos cifras (00, 01...) y, desde el 01, hace falta LISTA_CORTE con la fecha de lanzamiento del Drop 00 (por ejemplo 2026-11-14T00:00:00-03:00): los códigos de la lista de espera quedan apagados.");
  const codigos = crearGestorCodigos({ repo, dropActual: dropValido ? drop : "00" });
  const soloAntesDelCorte = drop !== "00" && corte !== null && !Number.isNaN(corte.getTime());
  let descuentos = null;
  let consultaCodigo = null;
  const porApi = Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
  const porcentaje = Number(env.DESCUENTO_LISTA_PORCENTAJE || 10);
  const dias = Number(env.DESCUENTO_LISTA_DIAS || 14);
  const configValida = dropValido && Number.isInteger(porcentaje) && porcentaje >= 1 && porcentaje <= 60 && Number.isInteger(dias) && dias >= 1;
  if (!configValida) console.error("DESCUENTO_LISTA_PORCENTAJE (1 a 60) y DESCUENTO_LISTA_DIAS tienen que ser números enteros: los códigos de la lista de espera quedan apagados.");
  if (configValida && pool) {
    // "Consultá tu código" en la tienda: no necesita mail ni dominio, solo la lista de espera
    consultaCodigo = crearConsultaCodigo({ codigos, existeEmail: async (email) => (await (soloAntesDelCorte
      ? pool.query("SELECT 1 FROM lista_espera WHERE email = $1 AND creado_en < $2", [email, corte])
      : pool.query("SELECT 1 FROM lista_espera WHERE email = $1", [email]))).rowCount > 0, porcentaje, dias });
  }
  if (configValida && env.MAIL_USUARIO && (porApi || env.MAIL_CLAVE_APP) && env.URL_LANDING) {
    descuentos = crearEnvioDescuentos({
      codigos,
      listarEmails: async () => (await (soloAntesDelCorte
        ? pool.query("SELECT email FROM lista_espera WHERE creado_en < $1 ORDER BY id", [corte])
        : pool.query("SELECT email FROM lista_espera ORDER BY id"))).rows.map((r) => r.email),
      // Por la API de Google si están las claves (funciona en Render gratis); si no, SMTP con contraseña de aplicación (Render gratis lo bloquea)
      correo: porApi
        ? crearTransporteGmailApi({ usuario: env.MAIL_USUARIO, clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN, fetchFn })
        : crearTransporteGmail({ usuario: env.MAIL_USUARIO, clave: env.MAIL_CLAVE_APP }),
      porcentaje,
      dias,
      urlLanding: env.URL_LANDING.replace(/\/$/, ""),
    });
  }

  const servicio = crearServicio({ repo, telegram, meta, editor, generadorImagen, llm, validarEdicion: llm ? crearValidadorEdicion() : null, urlPublica: env.URL_PUBLICA, permitirPublicar, descuentos });
  // Venta propia con Mercado Pago: con las claves puestas se arma, pero no se abre hasta que VENTA_ABIERTA sea "1"
  let ventas = null;
  if (env.MERCADOPAGO_ACCESS_TOKEN && env.MERCADOPAGO_WEBHOOK_SECRETO && env.URL_LANDING) {
    const costoFijo = Number(env.ENVIO_COSTO_FIJO);
    ventas = crearRutasVentas({
      repo,
      mp: crearClienteMercadoPago({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN, fetchFn }),
      secretoWebhook: env.MERCADOPAGO_WEBHOOK_SECRETO,
      ventaAbierta: env.VENTA_ABIERTA === "1",
      codigos,
      consultaCodigo,
      arrepentimientos: crearArrepentimientos({ repo, avisar: (texto) => telegram.enviarMensaje(texto) }),
      cotizarEnvio: Number.isInteger(costoFijo) && costoFijo > 0 ? async () => ({ costo: costoFijo, servicio: "Correo Argentino" }) : null,
      urlPublica: env.URL_PUBLICA.replace(/\/$/, ""),
      urlLanding: env.URL_LANDING.replace(/\/$/, ""),
    });
  }
  const router = crearRutasProgramacion({ servicio, repo, ventas, secretoApi: env.PROGRAMACION_SECRETO, secretoOficina: env.OFICINA_SECRETO || null, secretoWebhook: env.TELEGRAM_WEBHOOK_SECRETO, permitirPublicar, rendimiento: meta ? crearRendimientoJuego({ meta }) : null });
  // Al arrancar se revisa la bandeja de Telegram (un poco después, para no pisar a la copia anterior mientras termina de cerrar)
  setTimeout(() => servicio.recuperarActualizaciones().catch((error) => console.error(`No se pudo revisar la bandeja de Telegram: ${error.message}`)), 90_000).unref();
  return { router, servicio, telegram, permitirPublicar, edicionConIA: editor !== null, imagenesConIA: generadorImagen !== null, chatConIA: llm !== null };
}
