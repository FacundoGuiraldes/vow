// Cómo se traduce un producto de un pedido de Tiendanube a lo que descuenta el Almacén del HQ.
// Regla: en Tiendanube, el campo SKU de cada variante tiene que ser uno de estos códigos:
//   gorra-negra · gorra-beige · shaker-negro · shaker-claro · medias · medias2 · medias3
//   packs (llevan colores, en este orden: gorra y después shaker):
//   pledge:negra (gorra+medias) · kept:claro (shaker+medias) · oath:negra,claro (gorra, shaker, medias)
import { CATALOGO } from "../programacion/inventario.js";

const GORRAS = new Set(["negra", "beige"]);
const SHAKERS = new Set(["negro", "claro"]);
const unidad = (valor) => String(valor ?? "").trim().toLowerCase();

// Devuelve { producto, gorra?, shaker? } o null si el código no es de VOW
export function productoDeSku(sku) {
  const codigo = unidad(sku);
  const solo = /^(gorra)-(negra|beige)$/.exec(codigo) ?? /^(shaker)-(negro|claro)$/.exec(codigo);
  if (solo) return { producto: solo[1], [solo[1]]: solo[2] };
  const [producto, resto = ""] = codigo.split(":");
  const def = CATALOGO[producto];
  if (!def) return null;
  const pide = def.usa.map(([g]) => g).filter((g) => g !== "medias");
  const colores = resto ? resto.split(",").map((c) => c.trim()) : [];
  if (colores.length !== pide.length) return null;
  const item = { producto };
  for (const [i, grupo] of pide.entries()) {
    if (!(grupo === "gorra" ? GORRAS : SHAKERS).has(colores[i])) return null;
    item[grupo] = colores[i];
  }
  return item;
}

// Del pedido de la API ({ products: [{ sku, quantity, name }] }) a los items del Almacén. Lo que no se reconoce queda aparte.
export function itemsDelPedido(pedido) {
  const items = [];
  const sinMapear = [];
  for (const p of Array.isArray(pedido?.products) ? pedido.products : []) {
    const base = productoDeSku(p?.sku);
    const cantidad = Number(p?.quantity);
    if (!base || !Number.isInteger(cantidad) || cantidad < 1) sinMapear.push(String(p?.name ?? p?.sku ?? "producto sin nombre").slice(0, 60));
    else items.push({ ...base, cantidad });
  }
  return { items, sinMapear };
}
