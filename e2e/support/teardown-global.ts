import { motivoParaNoEscribir } from "./entorno";
import { abrirBaseDev, ANTIGUEDAD_BARRIDO, PATRON_EMAILS_E2E } from "./base-de-datos";

// Red de seguridad: si alguna corrida anterior se cortó antes de limpiar, borra sus emails de prueba.
// Solo toca emails con el patrón e2e y de más de ANTIGUEDAD_BARRIDO, para no pisar corridas en curso.
export default async function teardownGlobal() {
  if (motivoParaNoEscribir()) return;

  const pool = abrirBaseDev();
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM lista_espera WHERE email LIKE $1 AND creado_en < now() - $2::interval`,
      [PATRON_EMAILS_E2E, ANTIGUEDAD_BARRIDO]
    );
    if (rowCount) console.log(`Barrido e2e: ${rowCount} registros de prueba viejos borrados.`);
  } finally {
    await pool.end();
  }
}
