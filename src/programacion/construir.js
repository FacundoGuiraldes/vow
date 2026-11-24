// Arma el servicio de la oficina (VOW HQ y su chat) con la configuración del entorno (Render).
// Si falta alguna variable obligatoria, no se monta nada: la API sigue funcionando igual y el log dice qué falta.
import { crearClienteMeta } from "../mcp/instagram/api.js";
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
import { cargarStockInicial } from "./inventario.js";
import { MARCA_STOCK_INICIAL, STOCK_INICIAL } from "./stock-inicial.js";

export const VARIABLES_OBLIGATORIAS = ["PROGRAMACION_SECRETO", "URL_PUBLICA"];

export async function construirProgramacion({ pool, env = process.env, fetchFn = fetch } = {}) {
  const faltan = VARIABLES_OBLIGATORIAS.filter((nombre) => !env[nombre]);
  if (faltan.length) return { router: null, faltan };

  const repo = crearRepositorio(pool);
  // Carga única del stock real (queda una marca en la base: los reinicios no la repiten)
  try {
    if (await cargarStockInicial(repo, STOCK_INICIAL, { marca: MARCA_STOCK_INICIAL })) console.log("Stock inicial del Drop 00 cargado.");
  } catch (error) {
    console.error("No se pudo cargar el stock inicial:", error.message);
  }
  // Instagram solo se lee (rendimiento para el juego): el sistema no publica
  const meta = env.INSTAGRAM_TOKEN && env.INSTAGRAM_USER_ID ? crearClienteMeta({ token: env.INSTAGRAM_TOKEN, idCuenta: env.INSTAGRAM_USER_ID, fetchFn }) : null;

  // Chat con la IA (Gemini, plan gratis): opcional. Sin la clave, lo que escribe Facundo queda como novedad.
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
  // Por la API de Google si están las claves (funciona en Render gratis); si no, SMTP con contraseña de aplicación (Render gratis lo bloquea)
  const hayCorreo = Boolean(env.MAIL_USUARIO && (porApi || env.MAIL_CLAVE_APP));
  const correo = !hayCorreo ? null : porApi
    ? crearTransporteGmailApi({ usuario: env.MAIL_USUARIO, clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN, fetchFn })
    : crearTransporteGmail({ usuario: env.MAIL_USUARIO, clave: env.MAIL_CLAVE_APP });
  if (configValida && correo && env.URL_LANDING) {
    descuentos = crearEnvioDescuentos({
      codigos,
      listarEmails: async () => (await (soloAntesDelCorte
        ? pool.query("SELECT email FROM lista_espera WHERE creado_en < $1 ORDER BY id", [corte])
        : pool.query("SELECT email FROM lista_espera ORDER BY id"))).rows.map((r) => r.email),
      correo,
      porcentaje,
      dias,
      urlLanding: env.URL_LANDING.replace(/\/$/, ""),
    });
  }

  const servicio = crearServicio({ repo, llm, descuentos });
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
      arrepentimientos: crearArrepentimientos({
        repo,
        // Se avisa a VOW por mail (a la propia cuenta de VOW); sin correo configurado queda el registro en la base y el aviso en el log
        avisar: async (texto) => {
          if (!correo) return console.warn(`Arrepentimiento registrado (sin correo configurado para avisar): ${texto.replace(/\n/g, " | ")}`);
          const escapado = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
          await correo.enviar({ para: env.MAIL_USUARIO, asunto: "Botón de arrepentimiento: hay un pedido nuevo", html: `<p>${escapado}</p>`, texto });
        },
      }),
      // Cada pedido cobrado le llega a VOW por mail con qué mandar y a dónde (y queda en "Para enviar" en VOW HQ)
      avisarPedido: async ({ asunto, texto }) => {
        if (!correo) return console.warn(`Pedido pagado (sin correo configurado para avisar): ${texto.replace(/\n/g, " | ")}`);
        const escapado = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
        await correo.enviar({ para: env.MAIL_USUARIO, asunto, html: `<p>${escapado}</p>`, texto });
      },
      cotizarEnvio: Number.isInteger(costoFijo) && costoFijo > 0 ? async () => ({ costo: costoFijo, servicio: "Correo Argentino" }) : null,
      urlPublica: env.URL_PUBLICA.replace(/\/$/, ""),
      urlLanding: env.URL_LANDING.replace(/\/$/, ""),
    });
  }
  const router = crearRutasProgramacion({ servicio, repo, ventas, secretoApi: env.PROGRAMACION_SECRETO, secretoOficina: env.OFICINA_SECRETO || null, rendimiento: meta ? crearRendimientoJuego({ meta }) : null });
  return { router, servicio, chatConIA: llm !== null };
}
