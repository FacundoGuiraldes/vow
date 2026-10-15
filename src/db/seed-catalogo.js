import { fileURLToPath } from "node:url";
import { crearPool } from "./conexion.js";
import { drop01 } from "../data/drop-01.js";

const CONSULTA = `
  INSERT INTO productos
    (drop_numero, numero, slug, nombre, categoria, descripcion, colores, destacado, estado, imagen)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (slug) DO UPDATE SET
    drop_numero = EXCLUDED.drop_numero,
    numero = EXCLUDED.numero,
    nombre = EXCLUDED.nombre,
    categoria = EXCLUDED.categoria,
    descripcion = EXCLUDED.descripcion,
    colores = EXCLUDED.colores,
    destacado = EXCLUDED.destacado,
    estado = EXCLUDED.estado,
    imagen = EXCLUDED.imagen
`;

export async function seedCatalogo(pool, productos = drop01) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    for (const p of productos) {
      await cliente.query(CONSULTA, [
        p.drop_numero,
        p.numero,
        p.slug,
        p.nombre,
        p.categoria,
        p.descripcion,
        p.colores,
        p.destacado,
        p.estado,
        p.imagen,
      ]);
    }
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
  return productos.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = crearPool();
  try {
    const total = await seedCatalogo(pool);
    console.log(`Seed OK: ${total} productos cargados o actualizados`);
  } catch (error) {
    console.error(`No se pudo cargar el catálogo: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
