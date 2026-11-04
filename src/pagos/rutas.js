// Rutas de la venta propia, bajo /api/programacion/ventas:
//   GET  /estado         si la venta está abierta y qué se vende (público: sin stock exacto)
//   GET  /eventos        lo mismo que /estado, en vivo (text/event-stream): llega solo cada vez que cambia el stock o una reserva
//   POST /pedidos        arma un pedido y devuelve el link de pago de Mercado Pago (público, solo si la venta está abierta)
//   POST /arrepentimiento  botón de arrepentimiento: devuelve el código de revocación (público, funciona aunque la venta esté cerrada)
//   POST /mercadopago    aviso de Mercado Pago cuando cambia un pago (se valida con la firma)
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { alCambiarElStock } from "../programacion/stock-eventos.js";
import { firmaValida } from "./mercadopago.js";
import { ErrorCodigo } from "../descuentos/codigos.js";
import { ErrorArrepentimiento } from "./arrepentimiento.js";
import { disponibilidadDe } from "./disponibilidad.js";
import { ErrorPedido, confirmarPago, crearPedido, stockDisponible } from "./pedidos.js";

export function crearRutasVentas({ repo, mp, secretoWebhook, ventaAbierta = false, cotizarEnvio = null, codigos = null, consultaCodigo = null, arrepentimientos = null, urlPublica, urlLanding, intervaloEventosMs = 10_000 }) {
  const router = Router();
  const limitePedidos = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados pedidos. Probá en un minuto." } });

  // Más estricto: para que nadie pueda ir probando mails de otras personas
  const limiteConsulta = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados intentos. Probá en un minuto." } });
  const limiteCodigos = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados intentos. Probá en un minuto." } });

  // Lo que ve la web: qué hay y de qué color, sin cantidades. Descuenta lo que otros pedidos sin pagar tienen apartado.
  async function armarEstado() {
    if (!ventaAbierta) return { abierta: false };
    const { colores, maximos, productos } = disponibilidadDe(await stockDisponible(repo));
    return { abierta: true, envio: Boolean(cotizarEnvio), codigos: Boolean(codigos), consultaCodigo: Boolean(codigos && consultaCodigo), colores, maximos, productos };
  }

  router.get("/estado", async (req, res, siguiente) => {
    try {
      return res.set("Cache-Control", "no-store").json(await armarEstado());
    } catch (error) {
      return siguiente(error);
    }
  });

  // En vivo: manda el estado al conectarse y de nuevo apenas cambia algo. Además revisa cada tanto (vencen las reservas con el tiempo, y otro proceso puede haber movido el stock).
  router.get("/eventos", async (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders?.();
    let ultimo = "";
    let ocupado = false;
    let pendiente = false;
    const enviar = async () => {
      if (ocupado) { pendiente = true; return; }
      ocupado = true;
      try {
        do {
          pendiente = false;
          const texto = JSON.stringify(await armarEstado());
          if (texto !== ultimo) {
            ultimo = texto;
            res.write(`event: estado\ndata: ${texto}\n\n`);
          }
        } while (pendiente);
      } catch (error) {
        console.error(`Error armando el estado en vivo: ${error.message}`);
      } finally {
        ocupado = false;
      }
    };
    const dejarDeEscuchar = alCambiarElStock(enviar);
    const revisar = setInterval(enviar, intervaloEventosMs);
    const latido = setInterval(() => res.write(": latido\n\n"), 25_000);
    req.on("close", () => { dejarDeEscuchar(); clearInterval(revisar); clearInterval(latido); });
    res.write("retry: 3000\n\n");
    await enviar();
  });

  // Para que quien compra vea cuánto descuenta su código antes de pagar (no lo gasta: eso pasa al pagar)
  router.post("/codigo", limiteCodigos, async (req, res, siguiente) => {
    try {
      if (!ventaAbierta || !codigos) return res.status(503).json({ error: "Los códigos de descuento todavía no están disponibles." });
      const { porcentaje } = await codigos.validar(req.body?.codigo);
      return res.json({ ok: true, porcentaje });
    } catch (error) {
      if (error instanceof ErrorCodigo) return res.status(error.estado).json({ error: error.message });
      return siguiente(error);
    }
  });

  router.post("/mi-codigo", limiteConsulta, async (req, res, siguiente) => {
    try {
      if (!ventaAbierta || !codigos || !consultaCodigo) return res.status(503).json({ error: "Todavía no está disponible." });
      return res.json(await consultaCodigo.consultar(req.body?.email));
    } catch (error) {
      if (error instanceof ErrorCodigo) return res.status(error.estado).json({ error: error.message });
      return siguiente(error);
    }
  });

  router.post("/arrepentimiento", limiteConsulta, async (req, res, siguiente) => {
    try {
      if (!arrepentimientos) return res.status(503).json({ error: "No pudimos registrarlo. Escribinos por mail y te damos el código." });
      return res.status(201).json(await arrepentimientos.registrar(req.body));
    } catch (error) {
      if (error instanceof ErrorArrepentimiento) return res.status(error.estado).json({ error: error.message });
      return siguiente(error);
    }
  });

  router.post("/pedidos", limitePedidos, async (req, res, siguiente) => {
    try {
      if (!ventaAbierta || !mp) return res.status(503).json({ error: "La venta todavía no está abierta." });
      return res.status(201).json(await crearPedido({ repo, mp, cuerpo: req.body, cotizarEnvio, codigos, urlPublica, urlLanding }));
    } catch (error) {
      if (error instanceof ErrorPedido) return res.status(error.estado).json({ error: error.message });
      return siguiente(error);
    }
  });

  // Se procesa antes de contestar: si algo falla contesta 500 y Mercado Pago reintenta solo
  router.post("/mercadopago", async (req, res, siguiente) => {
    try {
      if (!mp || !secretoWebhook) return res.sendStatus(503);
      const dataId = String(req.query["data.id"] ?? req.body?.data?.id ?? "");
      if (!firmaValida({ secreto: secretoWebhook, firma: String(req.headers["x-signature"] ?? ""), requestId: String(req.headers["x-request-id"] ?? ""), dataId })) return res.sendStatus(401);
      if (req.body?.type !== "payment" || !/^\d{1,20}$/.test(dataId)) return res.status(200).json({ ok: true, resultado: "ignorado" });
      const pago = await mp.obtenerPago(dataId);
      if (!pago) return res.status(200).json({ ok: true, resultado: "ignorado" }); // un pago que no existe no se reintenta
      return res.status(200).json({ ok: true, resultado: await confirmarPago({ repo, pago, codigos }) });
    } catch (error) {
      console.error(`Error con un aviso de Mercado Pago (Mercado Pago reintenta): ${error.message}`);
      return siguiente(error);
    }
  });

  return router;
}
