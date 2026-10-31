// Los documentos de la oficina (piezas, estrategia, depósito, pendientes y archivos de las piezas) son privados:
// salen solo de la API y con clave. Antes se publicaban como archivos abiertos de la web (/oficina/datos.json) y
// cualquiera podía leerlos sin la clave.
//   documentos()  → { D, MED } armado desde docs/ del repo (se guarda unos minutos)
//   Los archivos de las piezas (<img>, <video>) no pueden mandar el encabezado Authorization, así que cada uno sale
//   con un enlace firmado que vence: la firma solo la puede hacer quien tiene la clave.
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generar } from "../../scripts/generar-oficina.js";

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const VIGENCIA_ENLACE_MS = 12 * 60 * 60 * 1000;
const VIGENCIA_DOCUMENTOS_MS = 10 * 60 * 1000;
const NOMBRE_SEGURO = /^[^/\\\0]+$/;

const firmar = (secreto, clave, archivo, vence) => createHmac("sha256", secreto).update(`${clave}/${archivo}|${vence}`).digest("hex");

export function crearDocumentosOficina({ secreto, raiz = RAIZ, directorio = join(tmpdir(), "vow-oficina-privada"), ahora = Date.now, armar = generar } = {}) {
  let guardado = null;
  const leer = () => {
    if (!guardado || ahora() - guardado.cuando > VIGENCIA_DOCUMENTOS_MS) {
      mkdirSync(directorio, { recursive: true });
      guardado = { ...armar({ raiz, destino: directorio }), cuando: ahora() };
    }
    return guardado;
  };

  // Los archivos de MED salen como "medios/<clave>/<archivo>": se reemplazan por su enlace firmado
  const enlace = (ruta) => {
    const [, clave, ...resto] = String(ruta).split("/");
    const archivo = resto.join("/");
    const vence = ahora() + VIGENCIA_ENLACE_MS;
    return `/api/programacion/oficina/medios/${encodeURIComponent(clave)}/${encodeURIComponent(archivo)}?e=${vence}&f=${firmar(secreto, clave, archivo, vence)}`;
  };

  return {
    documentos() {
      const { D, MED } = leer();
      const piezas = Object.fromEntries(
        Object.entries(MED.piezas).map(([clave, m]) => [clave, { ...m, ...(m.imgs ? { imgs: m.imgs.map(enlace) } : {}), ...(m.vid ? { vid: enlace(m.vid) } : {}) }]),
      );
      return { D, MED: { piezas } };
    },
    // Devuelve la ruta del archivo si la firma es válida y no venció; si no, null
    archivo(clave, archivo, vence, firma) {
      if (!NOMBRE_SEGURO.test(clave) || !NOMBRE_SEGURO.test(archivo) || clave.startsWith(".") || archivo.startsWith(".")) return null;
      const e = Number(vence);
      if (!Number.isInteger(e) || e < ahora() || typeof firma !== "string" || !/^[a-f0-9]{64}$/.test(firma)) return null;
      if (!timingSafeEqual(Buffer.from(firma, "hex"), Buffer.from(firmar(secreto, clave, archivo, e), "hex"))) return null;
      leer();
      const ruta = join(directorio, "medios", clave, archivo);
      return existsSync(ruta) ? ruta : null;
    },
  };
}
