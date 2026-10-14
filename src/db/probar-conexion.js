import { crearPool } from "./conexion.js";

const pool = crearPool();

try {
  const inicio = Date.now();
  const { rows } = await pool.query("SELECT version() AS version, current_database() AS base");
  console.log("Conexión OK");
  console.log(`Base: ${rows[0].base}`);
  console.log(`Versión: ${rows[0].version.split(" ").slice(0, 2).join(" ")}`);
  console.log(`Tiempo: ${Date.now() - inicio} ms`);
} catch (error) {
  console.error(`No se pudo conectar: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
