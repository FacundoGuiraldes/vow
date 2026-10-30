// Uso (en la PC con ComfyUI abierto):  npm run comfyui -- flujo.json "descripción de la imagen o el video"
// Guarda el resultado en salida/comfyui/. No publica nada: el archivo se sube después por el flujo de aprobación de siempre.
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crearClienteComfyUI } from "./comfyui.js";

const [archivoFlujo, ...resto] = process.argv.slice(2);
const descripcion = resto.join(" ").trim();
if (!archivoFlujo || !descripcion) {
  console.error('Uso: npm run comfyui -- flujo.json "descripción"\nEl flujo se exporta desde ComfyUI con "Save (API Format)" y lleva {{PROMPT}} donde va la descripción (ver docs/operacion/comfyui.md).');
  process.exit(1);
}
try {
  const cliente = crearClienteComfyUI({ url: process.env.COMFYUI_URL || undefined });
  console.log("Generando… (un video puede tardar varios minutos)");
  const { archivos } = await cliente.generar({ plantilla: readFileSync(archivoFlujo, "utf8"), descripcion });
  mkdirSync("salida/comfyui", { recursive: true });
  for (const a of archivos) {
    const destino = join("salida/comfyui", `${Date.now()}-${a.nombre}`);
    writeFileSync(destino, a.bytes);
    console.log(`Listo: ${destino}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
