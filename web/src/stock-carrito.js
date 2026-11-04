// Cuántas unidades se pueden sumar al carrito según lo que informa el servidor. Funciones puras: se prueban desde src/pagos.
// maximos: { sku: unidades } (con tope); productos: [{ id, usa: [[grupo, porUnidad]] }]; línea del carrito: { producto, cantidad, gorra?, shaker? }

export const TOPE_POR_LINEA = 5; // unidades de un mismo producto por línea del carrito (igual que el servidor)

const skuDe = (grupo, linea) => (grupo === 'medias' ? 'medias' : `${grupo}-${linea[grupo]}`);

// Lo que descuenta una línea de cada SKU
export function unidadesDeLinea(producto, linea) {
  const uso = {};
  for (const [grupo, porUnidad] of producto.usa) {
    const sku = skuDe(grupo, linea);
    uso[sku] = (uso[sku] ?? 0) + porUnidad * linea.cantidad;
  }
  return uso;
}

// Lo que ya hay en el carrito, por SKU
export function usoDelCarrito(carrito, productos, salvo = null) {
  const uso = {};
  for (const linea of carrito) {
    if (linea === salvo) continue;
    const producto = productos.find((p) => p.id === linea.producto);
    if (!producto) continue;
    for (const [sku, n] of Object.entries(unidadesDeLinea(producto, linea))) uso[sku] = (uso[sku] ?? 0) + n;
  }
  return uso;
}

// Cuántas unidades más de ese producto (con esos colores) se pueden sumar, descontando lo que ya está en el carrito
export function maximoParaSumar(producto, colores, maximos, carrito, productos) {
  const yaEnCarrito = usoDelCarrito(carrito, productos);
  let tope = Infinity;
  for (const [grupo, porUnidad] of producto.usa) {
    const sku = skuDe(grupo, colores);
    const queda = (maximos[sku] ?? 0) - (yaEnCarrito[sku] ?? 0);
    tope = Math.min(tope, Math.floor(queda / porUnidad));
  }
  return Number.isFinite(tope) ? Math.max(0, Math.min(TOPE_POR_LINEA, tope)) : 0;
}

// Si el stock bajó con el carrito armado: recorta las líneas que ya no alcanzan. Devuelve true si cambió algo.
export function ajustarCarrito(carrito, productos, maximos) {
  let cambio = false;
  for (let i = 0; i < carrito.length; i += 1) {
    const linea = carrito[i];
    const producto = productos.find((p) => p.id === linea.producto);
    if (!producto) { carrito.splice(i, 1); i -= 1; cambio = true; continue; }
    const resto = carrito.filter((_, j) => j < i);
    const permitido = maximoParaSumar(producto, linea, maximos, resto, productos);
    if (permitido >= linea.cantidad) continue;
    cambio = true;
    if (permitido <= 0) { carrito.splice(i, 1); i -= 1; } else linea.cantidad = permitido;
  }
  return cambio;
}
