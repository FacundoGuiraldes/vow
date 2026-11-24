// Rutas HTTP del bot y la oficina, todas bajo /api/programacion:
//   POST /tick           ya no hace nada (antes publicaba): se deja para que un cron viejo no reciba un 404
//   POST /plan           lo llama el workflow del lunes con el flujo semanal ya armado por los agentes (clave)
//   GET  /plan/:semana   ¿esa semana ya tiene flujo? (clave)
//   GET  /novedades      lo que Facundo le contó al bot y todavía no leyó el Estratega (clave)
//   GET  /oficina        todo lo que muestra el juego de la oficina: flujo, charla, novedades, estrategia, stock y rendimiento (clave)
//   GET  /oficina/documentos  los documentos del repo (estrategia, depósito): privados, solo con clave
//   POST /oficina/accion lo que hace el juego: chat, estrategia, stock, ventas, pendientes y notas (clave)
import { createHash, timingSafeEqual } from "node:crypto";
import { Router, json } from "express";
import { rateLimit } from "express-rate-limit";
import { esFechaISO } from "./fechas.js";
import { ErrorAccion, aplicarAccion, armarEstadoOficina } from "./oficina.js";
import { leerOperacion } from "./operacion.js";
import { crearDocumentosOficina } from "./oficina-documentos.js";

const FORMATOS = ["reel", "carrusel", "imagen", "story"];
const LIMITE_PUBLICACIONES = 7;

const huella = (texto) => createHash("sha256").update(String(texto)).digest();
const iguales = (a, b) => timingSafeEqual(huella(a), huella(b));

// Valida lo mínimo del flujo que manda el workflow (el contenido ya lo validó el Estratega)
export function validarPlanEntrante(cuerpo) {
  if (!esFechaISO(cuerpo?.semana)) return "Falta semana (AAAA-MM-DD).";
  const dias = cuerpo?.plan?.dias;
  if (!Array.isArray(dias) || dias.length === 0 || dias.length > LIMITE_PUBLICACIONES) return `El flujo tiene que traer de 1 a ${LIMITE_PUBLICACIONES} publicaciones.`;
  for (const [i, dia] of dias.entries()) {
    if (!esFechaISO(dia?.fecha) || !FORMATOS.includes(dia?.formato) || typeof dia?.contenido !== "string" || !dia.contenido.trim()) return `La publicación ${i + 1} no tiene fecha, formato y contenido.`;
  }
  if (cuerpo.novedades_usadas !== undefined && !(Array.isArray(cuerpo.novedades_usadas) && cuerpo.novedades_usadas.every(Number.isInteger))) return "novedades_usadas tiene que ser una lista de números.";
  return null;
}

export function crearRutasProgramacion({ servicio, repo, secretoApi, secretoOficina = null, rendimiento = null, ventas = null, limitePorMinuto = 120, documentosOficina = null }) {
  const router = Router();
  router.use(json({ limit: "256kb" }));

  const limitador = rateLimit({ windowMs: 60_000, limit: limitePorMinuto, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados pedidos." } });
  router.use(limitador);

  const conClave = (req, res, siguiente) => {
    if (!secretoApi) return res.status(503).json({ error: "PROGRAMACION_SECRETO no está configurado." });
    const [tipo, clave] = String(req.headers.authorization ?? "").split(" ");
    if (tipo !== "Bearer" || !clave || !iguales(clave, secretoApi)) return res.status(401).json({ error: "No autorizado." });
    return siguiente();
  };

  // Venta propia con Mercado Pago (src/pagos)
  if (ventas) router.use("/ventas", ventas);

  // Antes publicaba lo que tocaba; ahora el bot no publica nada. Contesta ok sin tocar la base (así un cron viejo no gasta cupo de Neon).
  router.post("/tick", conClave, (req, res) => res.json({ ok: true, nota: "El bot ya no publica: este aviso no hace nada." }));

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

  // ¿La semana ya tiene flujo? Lo usa el workflow del lunes, que se programa varias veces, para no armar dos
  router.get("/plan/:semana", conClave, async (req, res, siguiente) => {
    try {
      if (!esFechaISO(req.params.semana)) return res.status(400).json({ error: "La semana tiene que ser AAAA-MM-DD." });
      const flujo = await servicio.leerFlujo(req.params.semana);
      return res.json({ existe: flujo !== null, publicaciones: flujo?.dias.length ?? 0 });
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

  // Los documentos de la oficina ya no están en la web pública: salen de acá y solo con clave
  const documentos = documentosOficina ?? crearDocumentosOficina();
  router.get("/oficina/documentos", conClaveOficina, (req, res, siguiente) => {
    try {
      res.set("Cache-Control", "no-store").json(documentos.documentos());
    } catch (error) {
      siguiente(error);
    }
  });
  router.get("/oficina", conClaveOficina, async (req, res, siguiente) => {
    try {
      const estado = await armarEstadoOficina({ repo, servicio, rendimiento });
      res.set("Cache-Control", "no-store").json(req.query.v === estado.version ? { version: estado.version, sin_cambios: true } : estado);
    } catch (error) {
      siguiente(error);
    }
  });

  const pendientes = new Set(); // trabajos en segundo plano que siguen en curso (los tests los esperan)
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

  router.use((error, req, res, siguiente) => {
    void siguiente;
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "El pedido no es un JSON válido." });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "El pedido es demasiado grande." });
    console.error(`Error en el bot: ${error.message}`);
    return res.status(500).json({ error: "Error interno." });
  });

  router.esperarPendientes = () => Promise.all([...pendientes]);
  return router;
}
