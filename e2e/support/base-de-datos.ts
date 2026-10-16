import { crearPool } from "../../src/db/conexion.js";
import { motivoParaNoEscribir } from "./entorno";

// Patrón de los emails que crea la suite: e2e-<corrida>-<aleatorio>@vow-pruebas.invalid
// (".invalid" es un dominio reservado: no puede existir un email real así).
export const DOMINIO_DE_PRUEBA = "vow-pruebas.invalid";
export const PATRON_EMAILS_E2E = `e2e-%@${DOMINIO_DE_PRUEBA}`;

// Antigüedad mínima para el barrido global: más que la duración máxima razonable de una corrida, así nunca
// borra registros de otra corrida que esté en curso al mismo tiempo (cada corrida limpia lo suyo al terminar).
export const ANTIGUEDAD_BARRIDO = "2 hours";

export function abrirBaseDev() {
  const motivo = motivoParaNoEscribir();
  if (motivo) {
    throw new Error(`No se abre la base para escribir: ${motivo}.`);
  }
  return crearPool();
}
