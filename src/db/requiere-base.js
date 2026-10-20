// Ayuda para los tests que usan la base real (Neon): si no hay DATABASE_URL, se saltean en vez de fallar.
// En CI (GitHub Actions define CI=true) NO se saltean: si el secreto falta, tienen que fallar fuerte para que nadie lo note tarde.
import "dotenv/config";
import { test } from "node:test";

// Devuelve el motivo para saltear (texto) o false si hay que correr los tests
export function motivoParaSaltear(entorno = process.env) {
  if (entorno.DATABASE_URL) return false;
  if (entorno.CI) return false;
  return "falta DATABASE_URL: estos tests usan la base real (cargala en el .env para correrlos)";
}

export const SIN_BASE = motivoParaSaltear();

// Igual que test(), pero se saltea sola cuando no hay base
export const pruebaConBase = (nombre, fn) => test(nombre, { skip: SIN_BASE }, fn);
