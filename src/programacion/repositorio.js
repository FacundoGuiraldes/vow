// Acceso a la base (Postgres) de la oficina. La lógica vive en servicio.js y solo habla con esta interfaz:
// repositorio-memoria.js implementa la misma y se usa en los tests. Las fechas salen como "AAAA-MM-DD" (texto), no como Date.

export function crearRepositorio(pool, { prefijoEstado = "" } = {}) {
  const clave = (nombre) => `${prefijoEstado}${nombre}`;
  const filas = async (sql, parametros = []) => (await pool.query(sql, parametros)).rows;
  const una = async (sql, parametros = []) => (await filas(sql, parametros))[0] ?? null;

  return {
    async leerEstado(nombre) {
      return (await una("SELECT valor FROM bot_estado WHERE clave = $1", [clave(nombre)]))?.valor ?? null;
    },

    async guardarEstado(nombre, valor) {
      await pool.query(
        "INSERT INTO bot_estado (clave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()",
        [clave(nombre), JSON.stringify(valor)],
      );
    },

    // Cambia el valor SOLO si era distinto. Devuelve true si lo cambió: quien lo logra "se queda" con la tarea del día.
    async tomarEstado(nombre, valor) {
      const resultado = await pool.query(
        `INSERT INTO bot_estado (clave, valor) VALUES ($1, $2::jsonb)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now() WHERE bot_estado.valor <> EXCLUDED.valor
         RETURNING clave`,
        [clave(nombre), JSON.stringify(valor)],
      );
      return resultado.rowCount === 1;
    },

    async agregarNovedad(texto) {
      await pool.query("INSERT INTO novedades (texto) VALUES ($1)", [texto]);
    },

    // Las últimas novedades (usadas o no), para mostrarlas en el juego de la oficina
    novedadesRecientes: (limite = 20) =>
      filas("SELECT id, texto, to_char(creado_en AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS fecha, usada_en IS NOT NULL AS usada FROM novedades ORDER BY id DESC LIMIT $1", [limite]),

    novedadesPendientes: () => filas("SELECT id, texto FROM novedades WHERE usada_en IS NULL ORDER BY id"),

    async marcarNovedadesUsadas(ids) {
      if (ids.length) await pool.query("UPDATE novedades SET usada_en = now() WHERE id = ANY($1::int[]) AND usada_en IS NULL", [ids]);
    },
  };
}
