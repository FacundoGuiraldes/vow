// Rutas HTTP de la publicación programada, todas bajo /api/programacion:
//   POST /telegram       webhook del bot (lo llama Telegram; se valida con un secreto en el encabezado)
//   POST /tick           lo llaman cron-job.org y GitHub Actions: manda el aviso de las 8 y publica lo que toque (clave)
//   POST /plan           lo llama el workflow del lunes con el plan ya armado por los agentes (clave)
//   GET  /novedades      lo que Facundo le contó al bot y todavía no leyó el Estratega (clave)
//   GET  /oficina       todo lo que muestra el juego de la oficina: piezas, medios, charla, novedades y rendimiento (clave)
//   POST /oficina/accion lo que hace el juego: aprobar una pieza, pedir otra sugerencia, marcar pendientes, anotar en el cuaderno (clave)
//   POST /tiendanube    aviso de Tiendanube cuando se paga o se cancela un pedido: descuenta o devuelve el stock del Almacén (se valida con la firma)
//   GET  /medios/:token  el archivo de una pieza: Meta lo descarga desde acá (el token es imposible de adivinar)
import { createHash, timingSafeEqual } from "node:crypto";
import { Router, json, raw } from "express";
import { rateLimit } from "express-rate-limit";
import { esFechaISO, esHoraValida } from "./fechas.js";
import { ErrorAccion, aplicarAccion, armarEstadoOficina } from "./oficina.js";
import { leerOperacion } from "./operacion.js";
import { firmaValida } from "../tiendanube/firma.js";

const FORMATO_TOKEN = /^[a-f0-9]{48}$/;
const LIMITE_PIEZAS = 5;

const huella = (texto) => createHash("sha256").update(String(texto)).digest();
const iguales = (a, b) => timingSafeEqual(huella(a), huella(b));

// Valida lo mínimo del plan que manda el workflow (el contenido ya lo validó el Estratega)
export function validarPlanEntrante(cuerpo) {
  if (!esFechaISO(cuerpo?.semana)) return "Falta semana (AAAA-MM-DD).";
  const piezas = cuerpo?.plan?.piezas;
  if (!Array.isArray(piezas) || piezas.length === 0 || piezas.length > LIMITE_PIEZAS) return `El plan tiene que traer de 1 a ${LIMITE_PIEZAS} piezas.`;
  for (const [i, pieza] of piezas.entries()) {
    if (!esFechaISO(pieza?.fecha) || typeof pieza?.formato !== "string" || typeof pieza?.gancho !== "string") return `La pieza ${i + 1} no tiene fecha, formato y gancho.`;
    if (pieza.hora !== undefined && !esHoraValida(pieza.hora)) return `La pieza ${i + 1} tiene una hora inválida.`;
  }
  if (cuerpo.novedades_usadas !== undefined && !(Array.isArray(cuerpo.novedades_usadas) && cuerpo.novedades_usadas.every(Number.isInteger))) return "novedades_usadas tiene que ser una lista de números.";
  return null;
}

// Entrega un archivo con soporte de Range: Meta puede pedir el video por partes
function entregar(req, res, { mime, datos }) {
  const total = datos.length;
  // helmet pone Cross-Origin-Resource-Policy: same-origin por defecto y el navegador bloquea el <video> y las <img> del juego (otro dominio).
  // Cada archivo tiene su propio token (uno nuevo si se reemplaza), así que el navegador puede guardarlo una hora sin volver a pedirlo en cada refresco del juego.
  // Los archivos solo se piden con su token de 48 caracteres (el mismo que usa Instagram), así que se permite verlos desde otro sitio.
  res.set({ "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-site" });
  const pedido = req.headers.range;
  if (!pedido) return res.status(200).set("Content-Length", String(total)).end(datos);

  const m = /^bytes=(\d*)-(\d*)$/.exec(pedido);
  if (!m || (m[1] === "" && m[2] === "")) return res.status(416).set("Content-Range", `bytes */${total}`).end();
  const inicio = m[1] === "" ? Math.max(0, total - Number(m[2])) : Number(m[1]);
  const fin = m[1] === "" || m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  if (inicio >= total || inicio > fin) return res.status(416).set("Content-Range", `bytes */${total}`).end();
  return res
    .status(206)
    .set({ "Content-Range": `bytes ${inicio}-${fin}/${total}`, "Content-Length": String(fin - inicio + 1) })
    .end(datos.subarray(inicio, fin + 1));
}

export function crearRutasProgramacion({ servicio, repo, secretoApi, secretoOficina = null, secretoWebhook, rendimiento = null, tiendanube = null, permitirPublicar = false, limitePorMinuto = 120 }) {
  const router = Router();
  const pendientes = new Set(); // procesamientos del webhook que siguen en curso (los tests los esperan)
  // Se guarda el cuerpo crudo: la firma de Tiendanube se calcula sobre los bytes exactos que mandó
  router.use(json({ limit: "256kb", verify: (req, res, buf) => { req.cuerpoCrudo = buf; } }));

  const limitador = rateLimit({ windowMs: 60_000, limit: limitePorMinuto, skip: (req) => req.path.startsWith("/medios/"), standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados pedidos." } });
  router.use(limitador);

  const conClave = (req, res, siguiente) => {
    if (!secretoApi) return res.status(503).json({ error: "PROGRAMACION_SECRETO no está configurado." });
    const [tipo, clave] = String(req.headers.authorization ?? "").split(" ");
    if (tipo !== "Bearer" || !clave || !iguales(clave, secretoApi)) return res.status(401).json({ error: "No autorizado." });
    return siguiente();
  };

  router.post("/telegram", async (req, res, siguiente) => {
    try {
      if (!secretoWebhook || !iguales(req.headers["x-telegram-bot-api-secret-token"] ?? "", secretoWebhook)) return res.sendStatus(401);
      const actualizacion = req.body;
      if (!Number.isInteger(actualizacion?.update_id)) return res.sendStatus(200);
      // Primero se GUARDA el mensaje y recién después se le contesta OK a Telegram: si el servicio se cae a mitad de camino,
      // el mensaje queda pendiente y se recupera solo (servicio.recuperarActualizaciones). Un update_id ya visto no se repite.
      if (!(await repo.registrarActualizacion(actualizacion.update_id, actualizacion))) return res.sendStatus(200);
      res.sendStatus(200); // se contesta ya: editar con la IA puede tardar más de lo que Telegram espera
      const trabajo = servicio
        .manejarActualizacion(actualizacion)
        // solo se marca si terminó bien: si falló, queda pendiente y se reintenta (hasta 3 veces)
        .then(() => repo.marcarActualizacionProcesada(actualizacion.update_id))
        .catch((error) => console.error(`Error en el bot de Telegram (queda pendiente): ${error.message}`));
      pendientes.add(trabajo);
      trabajo.finally(() => pendientes.delete(trabajo));
    } catch (error) {
      siguiente(error);
    }
  });

  // Tiendanube avisa de un pedido pagado o cancelado. Se procesa antes de contestar: si algo falla contesta 500 y Tiendanube reintenta solo.
  router.post("/tiendanube", async (req, res, siguiente) => {
    try {
      if (!tiendanube) return res.sendStatus(503);
      if (!firmaValida(req.cuerpoCrudo, String(req.headers["x-linkedstore-hmac-sha256"] ?? ""), tiendanube.secreto)) return res.sendStatus(401);
      const resultado = await tiendanube.procesar({ event: req.body?.event, id: req.body?.id });
      return res.status(200).json({ ok: true, resultado });
    } catch (error) {
      console.error(`Error con un aviso de Tiendanube (Tiendanube reintenta): ${error.message}`);
      return siguiente(error);
    }
  });

  router.post("/tick", conClave, async (req, res, siguiente) => {
    try {
      res.json(await servicio.tick());
    } catch (error) {
      siguiente(error);
    }
  });

  router.post("/plan", conClave, async (req, res, siguiente) => {
    try {
      if (req.body?.error) {
        if (!esFechaISO(req.body.semana)) return res.status(400).json({ error: "Falta semana (AAAA-MM-DD)." });
        await servicio.avisarFalloDelPlan({ semana: req.body.semana, error: String(req.body.error).slice(0, 1500) });
        return res.status(202).json({ avisado: true });
      }
      const problema = validarPlanEntrante(req.body);
      if (problema) return res.status(400).json({ error: problema });
      const { semana, plan, novedades_usadas: novedadesUsadas = [] } = req.body;
      return res.status(201).json(await servicio.recibirPlan({ semana, plan, novedadesUsadas }));
    } catch (error) {
      return siguiente(error);
    }
  });

  router.get("/novedades", conClave, async (req, res, siguiente) => {
    try {
      // El foco y las notas de estrategia que Facundo fijó en el juego o con el bot también son para el Estratega
      const { campos } = await leerOperacion(repo);
      res.json({ novedades: await repo.novedadesPendientes(), foco: campos["estrategia.foco"] ?? "", notas_estrategia: campos["estrategia.notas"] ?? "" });
    } catch (error) {
      siguiente(error);
    }
  });

  // La oficina entra con su propia clave (OFICINA_SECRETO) o con la de la programación
  const conClaveOficina = (req, res, siguiente) => {
    const claves = [secretoOficina, secretoApi].filter(Boolean);
    if (!claves.length) return res.status(503).json({ error: "OFICINA_SECRETO no está configurado." });
    const [tipo, clave] = String(req.headers.authorization ?? "").split(" ");
    if (tipo !== "Bearer" || !clave || !claves.some((c) => iguales(clave, c))) return res.status(401).json({ error: "No autorizado." });
    return siguiente();
  };

  router.get("/oficina", conClaveOficina, async (req, res, siguiente) => {
    try {
      const estado = await armarEstadoOficina({ repo, rendimiento, permitirPublicar });
      res.set("Cache-Control", "no-store").json(req.query.v === estado.version ? { version: estado.version, sin_cambios: true } : estado);
    } catch (error) {
      siguiente(error);
    }
  });

  const segundoPlano = (trabajo) => {
    pendientes.add(trabajo);
    trabajo.finally(() => pendientes.delete(trabajo));
  };
  router.post("/oficina/accion", conClaveOficina, async (req, res, siguiente) => {
    try {
      res.json(await aplicarAccion({ repo, servicio, rendimiento, segundoPlano }, req.body));
    } catch (error) {
      if (error instanceof ErrorAccion) return res.status(error.estado).json({ error: error.message });
      return siguiente(error);
    }
  });

  // Archivo subido desde el juego: el cuerpo es el archivo mismo (image/jpeg, video/mp4 o video/quicktime)
  const LIMITE_ARCHIVO = "40mb";
  router.post("/oficina/archivo", conClaveOficina, raw({ type: ["image/jpeg", "video/mp4", "video/quicktime"], limit: LIMITE_ARCHIVO }), async (req, res, siguiente) => {
    try {
      const id = Number(req.query.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Falta el id de la pieza." });
      const mime = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      const resultado = await servicio.adjuntarDesdeJuego(id, { mime, datos: Buffer.isBuffer(req.body) ? req.body : null, reemplazar: req.query.reemplazar === "1" });
      if (!resultado.ok) return res.status(409).json({ error: resultado.motivo });
      res.json(resultado);
    } catch (error) {
      siguiente(error);
    }
  });

  router.get("/medios/:token", async (req, res, siguiente) => {
    try {
      if (!FORMATO_TOKEN.test(req.params.token)) return res.sendStatus(404);
      const medio = await repo.medioPorToken(req.params.token);
      if (!medio) return res.sendStatus(404);
      return entregar(req, res, medio);
    } catch (error) {
      return siguiente(error);
    }
  });

  router.use((error, req, res, siguiente) => {
    void siguiente;
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "El pedido no es un JSON válido." });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "El archivo es demasiado grande (máximo 40 MB)." });
    console.error(`Error en la publicación programada: ${error.message}`);
    return res.status(500).json({ error: "Error interno." });
  });

  router.esperarPendientes = () => Promise.all([...pendientes]);
  return router;
}
