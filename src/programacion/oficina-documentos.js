// Los documentos de la oficina (estrategia, depósito y pendientes) son privados: salen solo de la API y con clave.
// Antes se publicaban como archivos abiertos de la web (/oficina/datos.json) y cualquiera podía leerlos sin la clave.
//   documentos()  → { D } armado desde docs/ del repo (se guarda unos minutos)
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generar } from "../../scripts/generar-oficina.js";

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const VIGENCIA_DOCUMENTOS_MS = 10 * 60 * 1000;

export function crearDocumentosOficina({ raiz = RAIZ, directorio = join(tmpdir(), "vow-oficina-privada"), ahora = Date.now, armar = generar } = {}) {
  let guardado = null;
  const leer = () => {
    if (!guardado || ahora() - guardado.cuando > VIGENCIA_DOCUMENTOS_MS) {
      mkdirSync(directorio, { recursive: true });
      guardado = { ...armar({ raiz, destino: directorio }), cuando: ahora() };
    }
    return guardado;
  };
  return {
    documentos() {
      const { D } = leer();
      return { D };
    },
  };
}
