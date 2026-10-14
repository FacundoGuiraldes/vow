import "dotenv/config";
import pg from "pg";

export function crearPool(url = process.env.DATABASE_URL) {
  if (!url) {
    throw new Error("Falta DATABASE_URL en el .env");
  }
  return new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
}
