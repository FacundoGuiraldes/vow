import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { crearPool } from "../db/conexion.js";

export const MENSAJE_EXITO = "¡Listo! Ya estás en la lista de espera de VOW.";

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_MAXIMO_EMAIL = 254;
const LARGO_MAXIMO_ORIGEN = 100;

export const leerOrigenes = (valor = "") =>
  valor
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean);

export function validarPedido(cuerpo = {}) {
  const { email, origen } = cuerpo ?? {};

  if (email === undefined || email === null || (typeof email === "string" && email.trim() === "")) {
    return { error: "Ingresá tu email." };
  }
  if (typeof email !== "string") {
    return { error: "El email no tiene un formato válido." };
  }

  const emailNormalizado = email.trim().toLowerCase();
  if (emailNormalizado.length >= LARGO_MAXIMO_EMAIL) {
    return { error: `El email tiene que tener menos de ${LARGO_MAXIMO_EMAIL} caracteres.` };
  }
  if (!FORMATO_EMAIL.test(emailNormalizado)) {
    return { error: "El email no tiene un formato válido." };
  }

  if (origen !== undefined && origen !== null) {
    if (typeof origen !== "string" || origen.trim().length > LARGO_MAXIMO_ORIGEN) {
      return { error: `El origen tiene que ser un texto de hasta ${LARGO_MAXIMO_ORIGEN} caracteres.` };
    }
  }

  return { email: emailNormalizado, origen: origen?.trim() || null };
}

export function crearApp({
  pool,
  origenesPermitidos = leerOrigenes(process.env.ALLOWED_ORIGINS),
  limitePorMinuto = 5,
} = {}) {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (origen, responder) => responder(null, !origen || origenesPermitidos.includes(origen)),
      methods: ["POST"],
    })
  );
  app.use(express.json({ limit: "10kb" }));

  const limitador = rateLimit({
    windowMs: 60 * 1000,
    limit: limitePorMinuto,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Probá de nuevo en un minuto." },
  });

  app.post("/api/lista-espera", limitador, async (req, res) => {
    const { email, origen, error } = validarPedido(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    await pool.query(
      "INSERT INTO lista_espera (email, origen) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
      [email, origen]
    );

    res.status(200).json({ mensaje: MENSAJE_EXITO });
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
    console.error(`Error en la lista de espera: ${error.code ?? "sin código"} ${error.message}`);
    res.status(500).json({ error: "No pudimos registrarte. Probá de nuevo en unos minutos." });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origenesPermitidos = leerOrigenes(process.env.ALLOWED_ORIGINS);
  if (origenesPermitidos.length === 0) {
    console.warn("ALLOWED_ORIGINS está vacío: ningún sitio va a poder llamar a la API desde el navegador.");
  }

  const puerto = Number(process.env.PORT) || 3000;
  const app = crearApp({ pool: crearPool(), origenesPermitidos });
  app.listen(puerto, () => {
    console.log(`API de lista de espera escuchando en http://localhost:${puerto}`);
  });
}
