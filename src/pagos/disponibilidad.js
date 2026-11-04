// Lo que la web puede ofrecer según el stock que queda: qué se puede sumar y cuánto como máximo. Sin cantidades exactas por encima del tope.
import { CATALOGO } from "../programacion/inventario.js";

export const TOPE_POR_COMPRA = 5; // unidades de un mismo producto por línea del carrito
// Del stock de cada SKU se informa hasta acá: alcanza para cualquier línea (5 × lo más que usa un producto, 3 pares) y no revela cuánto hay por encima
const TOPE_INFORMADO = TOPE_POR_COMPRA * 3;

// stock: { sku: unidades } ya descontado lo que otros pedidos sin pagar tienen apartado
export function disponibilidadDe(stock) {
  const hay = (sku) => (stock[sku] ?? 0) > 0;
  const deGrupo = (grupo) => Object.entries(stock).filter(([sku]) => sku.startsWith(grupo)).reduce((a, [, c]) => a + c, 0);
  return {
    // Qué colores hay (sí o no) para cada cosa que pide color
    colores: { gorra: { negra: hay("gorra-negra"), beige: hay("gorra-beige") }, shaker: { negro: hay("shaker-negro"), claro: hay("shaker-claro") } },
    // Unidades de cada SKU que la web puede usar (con tope): nunca deja pedir más (el servidor lo vuelve a revisar al pagar)
    maximos: Object.fromEntries(Object.entries(stock).map(([sku, n]) => [sku, Math.max(0, Math.min(TOPE_INFORMADO, n))])),
    productos: Object.entries(CATALOGO).map(([id, p]) => ({
      id, nombre: p.nombre, precio: p.precio,
      pide: p.usa.map(([g]) => g).filter((g) => g !== "medias"),
      usa: p.usa, // [grupo, unidades por cada uno]
      disponible: p.usa.every(([grupo, n]) => deGrupo(grupo) >= n),
    })),
  };
}
