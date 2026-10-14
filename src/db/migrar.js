import { fileURLToPath } from "node:url";
import { crearPool } from "./conexion.js";

export async function migrar(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lista_espera (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
      instagram TEXT,
      origen TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query("ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS instagram text");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = crearPool();
  try {
    await migrar(pool);
    console.log("Migración OK: tabla lista_espera lista");
  } catch (error) {
    console.error(`No se pudo migrar: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
