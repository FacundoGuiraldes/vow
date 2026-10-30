import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { crearPool } from "../db/conexion.js";

export const MENSAJE_EXITO = "¡Listo! Ya estás en la lista de espera de VOW.";
export const MENSAJE_INSTAGRAM_INVALIDO =
  "El usuario de Instagram tiene que tener de 1 a 30 caracteres y usar solo letras, números, punto y guion bajo.";

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_INSTAGRAM = /^[a-z0-9._]{1,30}$/;
const LARGO_MAXIMO_EMAIL = 254;
const LARGO_MAXIMO_ORIGEN = 100;
const FORMATO_SLUG = /^[a-z0-9-]{1,60}$/;
const FORMATO_DROP = /^[1-9][0-9]{0,8}$/;
const COLUMNAS_PUBLICAS =
  "drop_numero, numero, slug, nombre, categoria, descripcion, colores, destacado, estado, imagen";
const CACHE_CATALOGO = "public, max-age=300";

export const leerOrigenes = (valor = "") =>
  valor
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean);

// Un sitio de Cloudflare Pages (algo.pages.dev) tiene vistas previas en <rama>.algo.pages.dev y <hash>.algo.pages.dev:
// si el sitio principal está permitido, sus vistas previas también (solo las de ese proyecto).
export function origenPermitido(origen, permitidos = []) {
  if (!origen) return true;
  if (permitidos.includes(origen)) return true;
  let url;
  try {
    url = new URL(origen);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return permitidos.some((p) => {
    try {
      const base = new URL(p);
      return base.protocol === "https:" && base.hostname.endsWith(".pages.dev") && url.hostname.endsWith(`.${base.hostname}`);
    } catch {
      return false;
    }
  });
}

function validarEmail(email) {
  if (email === undefined || email === null || (typeof email === "string" && email.trim() === "")) {
    return { error: "Ingresá tu email." };
  }
  if (typeof email !== "string") {
    return { error: "El email no tiene un formato válido." };
  }

  const normalizado = email.trim().toLowerCase();
  if (normalizado.length >= LARGO_MAXIMO_EMAIL) {
    return { error: `El email tiene que tener menos de ${LARGO_MAXIMO_EMAIL} caracteres.` };
  }
  if (!FORMATO_EMAIL.test(normalizado)) {
    return { error: "El email no tiene un formato válido." };
  }
  return { valor: normalizado };
}

function validarInstagram(instagram) {
  if (instagram === undefined || instagram === null || (typeof instagram === "string" && instagram.trim() === "")) {
    return { valor: null };
  }
  if (typeof instagram !== "string") {
    return { error: MENSAJE_INSTAGRAM_INVALIDO };
  }

  const normalizado = instagram.trim().replace(/^@/, "").toLowerCase();
  if (!FORMATO_INSTAGRAM.test(normalizado)) {
    return { error: MENSAJE_INSTAGRAM_INVALIDO };
  }
  return { valor: normalizado };
}

function validarOrigen(origen) {
  if (origen === undefined || origen === null) {
    return { valor: null };
  }
  if (typeof origen !== "string" || origen.trim().length > LARGO_MAXIMO_ORIGEN) {
    return { error: `El origen tiene que ser un texto de hasta ${LARGO_MAXIMO_ORIGEN} caracteres.` };
  }
  return { valor: origen.trim() || null };
}

export const MENSAJE_CONSENTIMIENTO = "Tildá la casilla para aceptar la política de privacidad y recibir el aviso del lanzamiento.";

export function validarPedido(cuerpo = {}) {
  const { email, instagram, origen, consentimiento } = cuerpo ?? {};

  const resultadoEmail = validarEmail(email);
  if (resultadoEmail.error) {
    return { error: resultadoEmail.error, campo: "email" };
  }

  const resultadoInstagram = validarInstagram(instagram);
  if (resultadoInstagram.error) {
    return { error: resultadoInstagram.error, campo: "instagram" };
  }

  const resultadoOrigen = validarOrigen(origen);
  if (resultadoOrigen.error) {
    return { error: resultadoOrigen.error, campo: "origen" };
  }

  // Consentimiento expreso (Ley 25.326): sin la casilla tildada no se guarda nada
  if (consentimiento !== true) {
    return { error: MENSAJE_CONSENTIMIENTO, campo: "consentimiento" };
  }

  return {
    email: resultadoEmail.valor,
    instagram: resultadoInstagram.valor,
    origen: resultadoOrigen.valor,
  };
}

export function leerDrop(valor) {
  if (valor === undefined) {
    return { valor: null };
  }
  if (typeof valor !== "string" || !FORMATO_DROP.test(valor)) {
    return { error: "El parámetro drop tiene que ser un número entero positivo." };
  }
  return { valor: Number(valor) };
}

export function crearApp({
  pool,
  origenesPermitidos = leerOrigenes(process.env.ALLOWED_ORIGINS),
  limitePorMinuto = 5,
  limiteCatalogoPorMinuto = 60,
  programacion = null,
} = {}) {
  const app = express();

  if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: (origen, responder) => responder(null, origenPermitido(origen, origenesPermitidos)),
      methods: ["GET", "POST"],
    })
  );
  // La publicación programada (bot de Telegram, aviso de las 8, publicador) va ANTES del parser de 10 kb:
  // el plan de la semana pesa más, así que su router trae el suyo.
  if (programacion) app.use("/api/programacion", programacion);
  // Si la venta no está configurada en este servidor, la landing igual pregunta si está abierta: se le contesta que no (sin un 404 en la consola)
  app.get("/api/programacion/ventas/estado", (req, res) => res.json({ abierta: false }));
  app.use(express.json({ limit: "10kb" }));

  app.get("/api/salud", (req, res) => {
    res.status(200).json({ ok: true });
  });

  const limitador = rateLimit({
    windowMs: 60 * 1000,
    limit: limitePorMinuto,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Probá de nuevo en un minuto." },
  });

  app.post("/api/lista-espera", limitador, async (req, res) => {
    const { email, instagram, origen, error, campo } = validarPedido(req.body);
    if (error) {
      return res.status(400).json({ error, campo });
    }

    await pool.query(
      "INSERT INTO lista_espera (email, instagram, origen) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
      [email, instagram, origen]
    );

    res.status(200).json({ mensaje: MENSAJE_EXITO });
  });

  const limitadorCatalogo = rateLimit({
    windowMs: 60 * 1000,
    limit: limiteCatalogoPorMinuto,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados pedidos. Probá de nuevo en un minuto." },
  });

  app.get("/api/productos", limitadorCatalogo, async (req, res) => {
    const { valor: drop, error } = leerDrop(req.query.drop);
    if (error) {
      return res.status(400).json({ error });
    }

    const { rows } =
      drop === null
        ? await pool.query(`SELECT ${COLUMNAS_PUBLICAS} FROM productos ORDER BY drop_numero, numero`)
        : await pool.query(
            `SELECT ${COLUMNAS_PUBLICAS} FROM productos WHERE drop_numero = $1 ORDER BY drop_numero, numero`,
            [drop]
          );

    res.set("Cache-Control", CACHE_CATALOGO);
    res.status(200).json({ productos: rows });
  });

  app.get("/api/productos/:slug", limitadorCatalogo, async (req, res) => {
    const { slug } = req.params;
    if (!FORMATO_SLUG.test(slug)) {
      return res.status(400).json({
        error: "El identificador del producto solo puede tener letras minúsculas, números y guiones (hasta 60).",
      });
    }

    const { rows } = await pool.query(`SELECT ${COLUMNAS_PUBLICAS} FROM productos WHERE slug = $1`, [slug]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.set("Cache-Control", CACHE_CATALOGO);
    res.status(200).json({ producto: rows[0] });
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Ruta no encontrada." });
  });

  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: "El pedido no es un JSON válido." });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "El pedido es demasiado grande." });
    }
    const esCatalogo = req.path.startsWith("/api/productos");
    console.error(`Error en ${esCatalogo ? "el catálogo" : "la lista de espera"}: ${error.code ?? "sin código"} ${error.message}`);
    res.status(500).json({
      error: esCatalogo
        ? "No pudimos cargar el catálogo. Probá de nuevo en unos minutos."
        : "No pudimos registrarte. Probá de nuevo en unos minutos.",
    });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origenesPermitidos = leerOrigenes(process.env.ALLOWED_ORIGINS);
  if (origenesPermitidos.length === 0) {
    console.warn("ALLOWED_ORIGINS está vacío: ningún sitio va a poder llamar a la API desde el navegador.");
  }

  const puerto = Number(process.env.PORT) || 3000;
  const pool = crearPool();
  const { construirProgramacion } = await import("../programacion/construir.js");
  const { router: programacion, faltan, permitirPublicar, edicionConIA } = await construirProgramacion({ pool });
  if (programacion) {
    console.log(`Publicación programada activa (${permitirPublicar ? "publica de verdad" : "modo simulación"}; edición con IA: ${edicionConIA ? "sí" : "no"}).`);
  } else {
    console.log(`Publicación programada apagada: faltan ${faltan.join(", ")}.`);
  }
  const app = crearApp({ pool, origenesPermitidos, programacion });
  app.listen(puerto, () => {
    console.log(`API de VOW escuchando en http://localhost:${puerto}`);
  });
}
