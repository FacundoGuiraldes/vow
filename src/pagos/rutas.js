// Rutas de la venta propia, bajo /api/programacion/ventas:
//   GET  /estado         si la venta está abierta y qué se vende (público: sin stock exacto)
//   POST /pedidos        arma un pedido y devuelve el link de pago de Mercado Pago (público, solo si la venta está abierta)
//   POST /mercadopago    aviso de Mercado Pago cuando cambia un pago (se valida con la firma)
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { CATALOGO, leerInventario } from "../programacion/inventario.js";
import { firmaValida } from "./mercadopago.js";
import { ErrorCodigo } from "../descuentos/codigos.js";
import { ErrorPedido, confirmarPago, crearPedido } from "./pedidos.js";

export function crearRutasVentas({ repo, mp, secretoWebhook, ventaAbierta = false, cotizarEnvio = null, codigos = null, urlPublica, urlLanding }) {
  const router = Router();
  const limitePedidos = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados pedidos. Probá en un minuto." } });

  const limiteCodigos = rateLimit({ windowMs: 60_000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados intentos. Probá en un minuto." } });

  router.get("/estado", async (req, res, siguiente) => {
    try {
      if (!ventaAbierta) return res.json({ abierta: false });
      const inv = await leerInventario(repo);
      const disponible = (producto) => CATALOGO[producto].usa.every(([grupo, n]) => Object.entries(inv.stock).filter(([sku]) => sku.startsWith(grupo)).reduce((a, [, c]) => a + c, 0) >= n);
      const hay = (sku) => inv.stock[sku] > 0;
      return res.json({
        abierta: true,
        envio: Boolean(cotizarEnvio),
        codigos: Boolean(codigos),
        // Qué colores hay (sí o no, sin cantidades) para cada cosa que pide color
        colores: { gorra: { negra: hay("gorra-negra"), beige: hay("gorra-beige") }, shaker: { negro: hay("shaker-negro"), claro: hay("shaker-claro") } },
        productos: Object.entries(CATALOGO).map(([id, p]) => ({ id, nombre: p.nombre, precio: p.precio, pide: p.usa.map(([g]) => g).filter((g) => g !== "medias"), disponible: disponible(id) })),
      });
    } catch (error) {
      return siguiente(error);
    }
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
