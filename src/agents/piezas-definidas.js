import { readdir, readFile } from "node:fs/promises";

// Piezas que ya están decididas (docs/piezas/AAAA-MM-DD-nombre.md). El Estratega las conoce
// para no repetir su idea, su formato ni sus frases.
//
// Formato esperado de cada archivo:
//   # Carrusel · 27/10/2026 · pilar promesa
//   ## Láminas
//   1. Frase uno
//   2. Frase dos

export const RUTA_PIEZAS = new URL("../../docs/piezas/", import.meta.url);
const NOMBRE_VALIDO = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

// Las frases de cierre que invitan a la lista se pueden repetir en todas las piezas
const esInvitacionALaLista = (frase) => /lista/i.test(frase);

export function parsearPieza(nombre, texto) {
  const titulo = texto.match(/^#\s+(.+?)\s+·\s+(\d{2})\/(\d{2})\/(\d{4})\s+·\s+pilar\s+(.+?)\s*$/m);
  const inicio = texto.indexOf("## Láminas");
  const frases = [];
  if (inicio !== -1) {
    const siguiente = texto.indexOf("\n## ", inicio + 5);
    const seccion = texto.slice(inicio, siguiente === -1 ? undefined : siguiente);
    for (const linea of seccion.split("\n")) {
      const m = linea.match(/^\d+\.\s+(.+?)\s*$/);
      if (m && !esInvitacionALaLista(m[1])) frases.push(m[1]);
    }
  }
  return {
    nombre,
    texto,
    formato: titulo ? titulo[1].toLowerCase() : null,
    fecha: titulo ? `${titulo[4]}-${titulo[3]}-${titulo[2]}` : null,
    pilar: titulo ? titulo[5].toLowerCase() : null,
    frases,
  };
}

// Devuelve [] si no hay carpeta o archivos: sin piezas definidas todo sigue como antes.
export async function leerPiezasDefinidas({ leer = (ruta) => readFile(ruta, "utf8"), listar = (carpeta) => readdir(carpeta) } = {}) {
  try {
    const nombres = (await listar(RUTA_PIEZAS)).filter((n) => NOMBRE_VALIDO.test(n)).sort();
    const piezas = [];
    for (const nombre of nombres) {
      try {
        piezas.push(parsearPieza(nombre, await leer(new URL(nombre, RUTA_PIEZAS))));
      } catch {
        // un archivo que no se puede leer no frena a los demás
      }
    }
    return piezas;
  } catch {
    return [];
  }
}

const aDias = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
export const diasEntre = (a, b) => Math.abs(aDias(a) - aDias(b));
