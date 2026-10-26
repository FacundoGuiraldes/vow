// Copia al repo (docs/operacion/) lo que se editó desde el juego y el bot, que vive en la base del servicio.
// Lo corre el workflow "Sincronizar operación". Si no cambió nada no escribe nada.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { markdownDeOperacion } from "../src/programacion/operacion.js";

const url = process.env.URL_PUBLICA?.replace(/\/$/, "");
const clave = process.env.PROGRAMACION_SECRETO;
const destino = process.env.DESTINO ?? join(process.cwd(), "docs", "operacion");
if (!url || !clave) {
  console.log("Faltan los secretos URL_PUBLICA y PROGRAMACION_SECRETO: no hago nada.");
  process.exit(0);
}

const respuesta = await fetch(`${url}/api/programacion/oficina`, { headers: { Authorization: `Bearer ${clave}` } });
if (!respuesta.ok) {
  console.error(`El servicio respondió ${respuesta.status}. No se sincronizó.`);
  process.exit(1);
}
const { operacion } = await respuesta.json();
if (!operacion) {
  console.error("El servicio todavía no devuelve la operación (¿falta desplegar la última versión?).");
  process.exit(1);
}

mkdirSync(destino, { recursive: true });
const archivos = { "estado.json": `${JSON.stringify(operacion, null, 2)}\n`, "estado.md": markdownDeOperacion(operacion) };
let cambiaron = 0;
for (const [nombre, contenido] of Object.entries(archivos)) {
  const ruta = join(destino, nombre);
  if (existsSync(ruta) && readFileSync(ruta, "utf8") === contenido) continue;
  writeFileSync(ruta, contenido);
  cambiaron++;
}
console.log(cambiaron ? `Operación actualizada en ${destino}.` : "Sin cambios.");
