// Aviso interno de "cambió el stock": lo emiten el Almacén/Caja y los pedidos, y lo escucha la web en vivo (GET /ventas/eventos).
import { EventEmitter } from "node:events";

const emisor = new EventEmitter();
emisor.setMaxListeners(0); // una escucha por navegador abierto

export const avisarCambioDeStock = () => emisor.emit("cambio");
export function alCambiarElStock(escucha) {
  emisor.on("cambio", escucha);
  return () => emisor.off("cambio", escucha);
}
