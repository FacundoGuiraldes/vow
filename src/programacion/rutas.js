// Rutas HTTP de la publicación programada, todas bajo /api/programacion:
//   POST /telegram       webhook del bot (lo llama Telegram; se valida con un secreto en el encabezado)
//   POST /tick           lo llaman cron-job.org y GitHub Actions: manda el aviso de las 8 y publica lo que toque (clave)
//   POST /plan           lo llama el workflow del lunes con el plan ya armado por los agentes (clave)
//   GET  /novedades      lo que Facundo le contó al bot y todavía no leyó el Estratega (clave)
//   GET  /estado        resumen para el juego de la oficina: piezas, pausa y novedades recientes (clave)
//   GET  /medios/:token  el archivo de una pieza: Meta lo descarga desde acá (el token es imposible de adivinar)
import { createHash, timingSafeEqual } from "node:crypto";
import { Router, json } from "express";
import { rateLimit } from "express-rate-limit";
import { esFechaISO, esHoraValida } from "./fechas.js";

const FORMATO_TOKEN = /^[a-f0-9]{48}$/;
const LIMITE_PIEZAS = 5;
const DIA_MS = 86_400_000;
const fechaISO = (ms) => new Date(ms).toISOString().slice(0, 10);

// Lo que el juego de la oficina puede mostrar del bot. A propósito NO incluye la charla con el bot ni los archivos: el repo es público.
export async function armarEstado(repo, ahora = Date.now()) {
  const [piezas, novedades, recordatorios, pausa] = await Promise.all([
    repo.piezasEntre(fechaISO(ahora - 21 * DIA_MS), fechaISO(ahora + 45 * DIA_MS)),
    repo.novedadesRecientes(20),
    repo.recordatoriosPendientes(fechaISO(ahora + 45 * DIA_MS)),
    repo.leerEstado("pausa"),
  ]);
  return {
    generado: new Date(ahora).toISOString(),
    pausa: pausa === true,
    recordatorios_pendientes: recordatorios.length,
    piezas: piezas.map((p) => ({
      id: p.id, fecha: p.fecha, hora: p.hora, estado: p.estado, formato: p.pieza?.formato ?? null, gancho: p.pieza?.gancho ?? null,
      confirmada_el: p.confirmada_el ?? null, permalink: p.permalink ?? null, error: p.error ?? null,
    })),
    novedades: novedades.map((n) => ({ id: n.id, fecha: n.fecha, texto: String(n.texto).slice(0, 240), usada: n.usada === true })),
  };
}

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
  res.set({ "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
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

export function crearRutasProgramacion({ servicio, repo, secretoApi, secretoWebhook, limitePorMinuto = 120 }) {
  const router = Router();
  const pendientes = new Set(); // procesamientos del webhook que siguen en curso (los tests los esperan)
  router.use(json({ limit: "256kb" }));

  const limitador = rateLimit({ windowMs: 60_000, limit: limitePorMinuto, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados pedidos." } });
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
      // Telegram reenvía lo que no contestamos a tiempo: un update_id ya visto no se vuelve a procesar
      const ultimo = Number(await repo.leerEstado("ultimo_update")) || 0;
      if (!Number.isInteger(actualizacion?.update_id) || actualizacion.update_id <= ultimo) return res.sendStatus(200);
      await repo.guardarEstado("ultimo_update", actualizacion.update_id);
      res.sendStatus(200); // se contesta ya: editar con la IA puede tardar más de lo que Telegram espera
      const trabajo = servicio.manejarActualizacion(actualizacion).catch((error) => console.error(`Error en el bot de Telegram: ${error.message}`));
      pendientes.add(trabajo);
      trabajo.finally(() => pendientes.delete(trabajo));
    } catch (error) {
      siguiente(error);
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
      res.json({ novedades: await repo.novedadesPendientes() });
    } catch (error) {
      siguiente(error);
    }
  });

  router.get("/estado", conClave, async (req, res, siguiente) => {
    try {
      res.json(await armarEstado(repo));
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
    if (error.type === "entity.too.large") return res.status(413).json({ error: "El pedido es demasiado grande." });
    console.error(`Error en la publicación programada: ${error.message}`);
    return res.status(500).json({ error: "Error interno." });
  });

  router.esperarPendientes = () => Promise.all([...pendientes]);
  return router;
}
