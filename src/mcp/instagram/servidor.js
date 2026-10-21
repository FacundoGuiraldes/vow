// Servidor MCP (por stdio) para gestionar la cuenta de Instagram de VOW desde Claude Code.
// Se registra en .mcp.json. Lee INSTAGRAM_TOKEN, INSTAGRAM_USER_ID e INSTAGRAM_PERMITIR_PUBLICAR del .env.
// Importante: por stdio, stdout es el canal del protocolo. Nada de console.log: los avisos van a stderr.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { crearClienteMeta } from "./api.js";
import { crearHerramientas } from "./herramientas.js";

export function crearServidor(env = process.env, { fetchFn } = {}) {
  const meta = crearClienteMeta({ token: env.INSTAGRAM_TOKEN, idCuenta: env.INSTAGRAM_USER_ID, fetchFn });
  const servidor = new McpServer({ name: "vow-instagram", version: "1.0.0" });
  for (const h of crearHerramientas(meta, { permitirPublicar: env.INSTAGRAM_PERMITIR_PUBLICAR === "1" })) {
    servidor.registerTool(
      h.nombre,
      { title: h.titulo, description: h.descripcion, inputSchema: h.esquema, annotations: h.anotaciones },
      h.manejar
    );
  }
  return servidor;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // El .env de la raíz del repo, sin depender de la carpeta desde donde se lance; quiet para no escribir en stdout
  dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });
  if (!process.env.INSTAGRAM_TOKEN) console.error("[vow-instagram] Falta INSTAGRAM_TOKEN en el .env: las herramientas van a responder con error.");
  await crearServidor().connect(new StdioServerTransport());
}
