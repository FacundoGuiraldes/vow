// Tiendanube firma cada aviso (webhook): HMAC-SHA256 en hexadecimal del cuerpo exacto, con el "client secret" de la app, en x-linkedstore-hmac-sha256.
import { createHmac, timingSafeEqual } from "node:crypto";

export function firmaValida(cuerpoCrudo, firma, secreto) {
  if (!secreto || !Buffer.isBuffer(cuerpoCrudo) || typeof firma !== "string" || !/^[a-f0-9]{64}$/i.test(firma)) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpoCrudo).digest();
  const recibida = Buffer.from(firma, "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}
