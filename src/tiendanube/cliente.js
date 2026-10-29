// Cliente mínimo de la API de Tiendanube (https://tiendanube.dev). Hace falta el token de acceso de la app instalada en la tienda.
const BASE = "https://api.tiendanube.com/v1";

export function crearClienteTiendanube({ storeId, token, contacto, fetchFn = fetch }) {
  if (!storeId || !token || !contacto) throw new Error("Faltan TIENDANUBE_STORE_ID, TIENDANUBE_ACCESS_TOKEN o TIENDANUBE_CONTACTO.");
  async function pedir(ruta, opciones = {}) {
    const respuesta = await fetchFn(`${BASE}/${storeId}${ruta}`, {
      ...opciones,
      headers: { Authentication: `bearer ${token}`, "User-Agent": `VOW (${contacto})`, "Content-Type": "application/json", ...opciones.headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) throw new Error(`Tiendanube respondió ${respuesta.status} en ${ruta}`);
    return respuesta.json();
  }
  return {
    obtenerPedido: (id) => pedir(`/orders/${encodeURIComponent(id)}`),
    listarWebhooks: () => pedir("/webhooks"),
    crearWebhook: (event, url) => pedir("/webhooks", { method: "POST", body: JSON.stringify({ event, url }) }),
  };
}
