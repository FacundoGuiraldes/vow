// Le pide a Tiendanube que avise a VOW cuando se paga o se cancela un pedido. Se corre una vez (y si cambia URL_PUBLICA):
//   npm run tiendanube:webhooks
import "dotenv/config";
import { crearClienteTiendanube } from "./cliente.js";
import { EVENTOS } from "./procesar.js";

const { TIENDANUBE_STORE_ID, TIENDANUBE_ACCESS_TOKEN, TIENDANUBE_CONTACTO, URL_PUBLICA } = process.env;
const faltan = Object.entries({ TIENDANUBE_STORE_ID, TIENDANUBE_ACCESS_TOKEN, URL_PUBLICA }).filter(([, v]) => !v).map(([n]) => n);
if (faltan.length) {
  console.error(`Faltan en el .env: ${faltan.join(", ")}.`);
  process.exit(1);
}
const direccion = `${URL_PUBLICA.replace(/\/$/, "")}/api/programacion/tiendanube`;
if (!direccion.startsWith("https://")) {
  console.error("URL_PUBLICA tiene que empezar con https://: Tiendanube solo manda avisos a direcciones seguras.");
  process.exit(1);
}
try {
  const cliente = crearClienteTiendanube({ storeId: TIENDANUBE_STORE_ID, token: TIENDANUBE_ACCESS_TOKEN, contacto: TIENDANUBE_CONTACTO || "vow2026ar@gmail.com" });
  const existentes = await cliente.listarWebhooks();
  for (const evento of EVENTOS) {
    if (existentes.some((w) => w.event === evento && w.url === direccion)) console.log(`Ya estaba: ${evento}`);
    else {
      await cliente.crearWebhook(evento, direccion);
      console.log(`Configurado: ${evento} → ${direccion}`);
    }
  }
} catch (error) {
  console.error(`No se pudo configurar: ${error.message}`);
  process.exit(1);
}
