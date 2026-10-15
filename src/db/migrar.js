import { fileURLToPath } from "node:url";
import { crearPool } from "./conexion.js";

const SENTENCIAS = [
  `CREATE TABLE IF NOT EXISTS lista_espera (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    instagram TEXT,
    origen TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  "ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS instagram text",
  `CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    drop_numero INTEGER NOT NULL DEFAULT 1,
    numero INTEGER NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL CHECK (categoria IN ('ropa', 'accesorio')),
    descripcion TEXT NOT NULL,
    colores TEXT[] NOT NULL DEFAULT '{}',
    destacado BOOLEAN NOT NULL DEFAULT false,
    estado TEXT NOT NULL DEFAULT 'concepto' CHECK (estado IN ('concepto', 'proximamente', 'disponible')),
    imagen TEXT,
    UNIQUE (drop_numero, numero)
  )`,
];

export async function migrar(pool) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('vow-migrar'))");
    for (const sentencia of SENTENCIAS) {
      await cliente.query(sentencia);
    }
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = crearPool();
  try {
    await migrar(pool);
    console.log("Migración OK: tablas lista_espera y productos listas");
  } catch (error) {
    console.error(`No se pudo migrar: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
