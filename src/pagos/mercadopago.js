// Cobro con Mercado Pago Checkout Pro: el comprador paga en la página de Mercado Pago, así que los datos de la tarjeta nunca pasan por nuestro servidor.
// Acá solo hay tres cosas: crear la preferencia de pago, consultar un pago y validar la firma de los avisos.
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.mercadopago.com";

// Mercado Pago firma cada aviso: x-signature = "ts=...,v1=..." con HMAC-SHA256 del texto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export function firmaValida({ secreto, firma, requestId, dataId }) {
  if (!secreto || typeof firma !== "string") return false;
  const partes = Object.fromEntries(firma.split(",").map((p) => p.trim().split("=").map((x) => x.trim())).filter((p) => p.length === 2));
  if (!partes.ts || !/^[a-f0-9]{64}$/i.test(partes.v1 ?? "")) return false;
  const manifiesto = [dataId ? `id:${String(dataId).toLowerCase()};` : "", requestId ? `request-id:${requestId};` : "", `ts:${partes.ts};`].join("");
  const esperada = createHmac("sha256", secreto).update(manifiesto).digest();
  const recibida = Buffer.from(partes.v1, "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

export function crearClienteMercadoPago({ accessToken, fetchFn = fetch }) {
  if (!accessToken) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
  async function pedir(ruta, opciones = {}) {
    const respuesta = await fetchFn(`${BASE}${ruta}`, {
      ...opciones,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...opciones.headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) throw Object.assign(new Error(`Mercado Pago respondió ${respuesta.status} en ${ruta.split("?")[0]}`), { estado: respuesta.status });
    return respuesta.json();
  }
  return {
    // preferencia: { items: [{ title, quantity, unit_price }], external_reference, payer, back_urls, notification_url, ... }
    crearPreferencia: (preferencia) => pedir("/checkout/preferences", { method: "POST", headers: { "X-Idempotency-Key": preferencia.external_reference }, body: JSON.stringify({ ...preferencia, items: preferencia.items.map((i) => ({ ...i, currency_id: "ARS" })) }) }),
    // Devuelve null si el pago no existe (por ejemplo, la simulación del panel usa un número inventado)
    obtenerPago: (id) => pedir(`/v1/payments/${encodeURIComponent(id)}`).catch((error) => { if (error.estado === 404) return null; throw error; }),
  };
}
