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
  // Publicación programada de Instagram (src/programacion): piezas con su hora, estado y confirmación del día
  `CREATE TABLE IF NOT EXISTS piezas_programadas (
    id SERIAL PRIMARY KEY,
    semana DATE NOT NULL,
    fecha DATE NOT NULL,
    hora TEXT NOT NULL CHECK (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    pieza JSONB NOT NULL,
    estado TEXT NOT NULL DEFAULT 'propuesta' CHECK (estado IN
      ('propuesta', 'aprobada', 'confirmada', 'preparando', 'preparada', 'publicando', 'publicada', 'fallida', 'cancelada', 'manual')),
    confirmada_el DATE,
    contenedor TEXT,
    permalink TEXT,
    mensajes JSONB NOT NULL DEFAULT '[]',
    error TEXT,
    intentos INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS piezas_programadas_fecha ON piezas_programadas (fecha)",
  `CREATE TABLE IF NOT EXISTS piezas_medios (
    id SERIAL PRIMARY KEY,
    pieza_id INTEGER NOT NULL REFERENCES piezas_programadas (id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('imagen', 'video')),
    mime TEXT NOT NULL,
    datos BYTEA NOT NULL,
    token TEXT NOT NULL UNIQUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS recordatorios (
    id SERIAL PRIMARY KEY,
    pieza_id INTEGER NOT NULL REFERENCES piezas_programadas (id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    enviado_en TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS bot_estado (
    clave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS novedades (
    id SERIAL PRIMARY KEY,
    texto TEXT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    usada_en TIMESTAMPTZ
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
    console.log("Migración OK: tablas lista_espera, productos y publicación programada listas");
  } catch (error) {
    console.error(`No se pudo migrar: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
