// Le dice a Telegram a qué dirección mandar los mensajes del bot. Se corre una vez (y cada vez que cambie URL_PUBLICA):
//   npm run telegram:webhook
import "dotenv/config";
import { crearClienteTelegram } from "./telegram.js";

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRETO, URL_PUBLICA } = process.env;
const faltan = Object.entries({ TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRETO, URL_PUBLICA })
  .filter(([, valor]) => !valor)
  .map(([nombre]) => nombre);
if (faltan.length) {
  console.error(`Faltan en el .env: ${faltan.join(", ")}.`);
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,256}$/.test(TELEGRAM_WEBHOOK_SECRETO)) {
  console.error("TELEGRAM_WEBHOOK_SECRETO tiene que tener de 16 a 256 caracteres: solo letras, números, guion y guion bajo.");
  process.exit(1);
}

const direccion = `${URL_PUBLICA.replace(/\/$/, "")}/api/programacion/telegram`;
try {
  const telegram = crearClienteTelegram({ token: TELEGRAM_TOKEN, chatId: TELEGRAM_CHAT_ID });
  await telegram.configurarWebhook(direccion, TELEGRAM_WEBHOOK_SECRETO);
  await telegram.enviarMensaje("✅ El bot de VOW quedó conectado. Mandame /estado para ver cómo está todo, o /ayuda para ver los comandos.");
  console.log(`Webhook configurado: ${direccion}`);
} catch (error) {
  console.error(`No se pudo configurar el webhook: ${error.message}`);
  process.exit(1);
}
