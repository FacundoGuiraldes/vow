// Acceso a la base (Postgres) de la publicación programada. La lógica vive en servicio.js y solo habla con esta interfaz:
// repositorio-memoria.js implementa la misma y se usa en los tests. Las fechas salen como "AAAA-MM-DD" (texto), no como Date.
import { randomBytes } from "node:crypto";

const COLUMNAS = `id, to_char(semana, 'YYYY-MM-DD') AS semana, to_char(fecha, 'YYYY-MM-DD') AS fecha, hora, pieza, estado,
  to_char(confirmada_el, 'YYYY-MM-DD') AS confirmada_el, contenedor, permalink, mensajes, error, intentos`;

// Solo estas columnas se pueden cambiar con actualizarPieza (nunca se arma SQL con nombres que vienen de afuera)
const EDITABLES = ["fecha", "hora", "pieza", "estado", "confirmada_el", "contenedor", "permalink", "error", "intentos"];

// `prefijoEstado` separa las claves de bot_estado: los tests de punta a punta lo usan para no tocar el estado real (pausa, etc.)
export function crearRepositorio(pool, { prefijoEstado = "" } = {}) {
  const clave = (nombre) => `${prefijoEstado}${nombre}`;
  const filas = async (sql, parametros = []) => (await pool.query(sql, parametros)).rows;
  const una = async (sql, parametros = []) => (await filas(sql, parametros))[0] ?? null;

  return {
    // Guarda las piezas de una semana. Lo que estaba sin aprobar de esa semana se cancela (llegó un plan nuevo).
    async crearPiezas(semana, piezas) {
      await pool.query(
        "UPDATE piezas_programadas SET estado = 'cancelada', actualizado_en = now() WHERE semana = $1 AND estado IN ('propuesta', 'aprobada')",
        [semana],
      );
      const creadas = [];
      for (const { fecha, hora, pieza } of piezas) {
        creadas.push(
          await una(`INSERT INTO piezas_programadas (semana, fecha, hora, pieza) VALUES ($1, $2, $3, $4::jsonb) RETURNING ${COLUMNAS}`, [
            semana,
            fecha,
            hora,
            JSON.stringify(pieza),
          ]),
        );
      }
      return creadas;
    },

    // Una pieza suelta (la que arma el chat para un día): no toca las otras piezas de la semana
    async crearPiezaSuelta({ semana, fecha, hora, pieza }) {
      return una(`INSERT INTO piezas_programadas (semana, fecha, hora, pieza) VALUES ($1, $2, $3, $4::jsonb) RETURNING ${COLUMNAS}`, [semana, fecha, hora, JSON.stringify(pieza)]);
    },

    obtenerPieza: (id) => una(`SELECT ${COLUMNAS} FROM piezas_programadas WHERE id = $1`, [id]),

    piezasDelDia: (fecha) => filas(`SELECT ${COLUMNAS} FROM piezas_programadas WHERE fecha = $1 AND estado <> 'cancelada' ORDER BY hora, id`, [fecha]),

    piezasEntre: (desde, hasta) =>
      filas(`SELECT ${COLUMNAS} FROM piezas_programadas WHERE fecha BETWEEN $1 AND $2 AND estado <> 'cancelada' ORDER BY fecha, hora, id`, [desde, hasta]),

    piezasDeSemana: (semana) => filas(`SELECT ${COLUMNAS} FROM piezas_programadas WHERE semana = $1 ORDER BY fecha, hora, id`, [semana]),

    async actualizarPieza(id, cambios) {
      const claves = Object.keys(cambios).filter((clave) => EDITABLES.includes(clave));
      if (claves.length === 0) return this.obtenerPieza(id);
      const asignaciones = claves.map((clave, i) => (clave === "pieza" ? `pieza = $${i + 2}::jsonb` : `${clave} = $${i + 2}`));
      const valores = claves.map((clave) => (clave === "pieza" ? JSON.stringify(cambios[clave]) : cambios[clave]));
      return una(`UPDATE piezas_programadas SET ${asignaciones.join(", ")}, actualizado_en = now() WHERE id = $1 RETURNING ${COLUMNAS}`, [id, ...valores]);
    },

    // Pasa de un estado a otro SOLO si sigue en alguno de los estados de `desde`. Devuelve true si lo logró.
    // Es lo que evita que dos corridas simultáneas hagan lo mismo (por ejemplo, publicar dos veces).
    async reclamar(id, desde, hacia) {
      const resultado = await pool.query(
        "UPDATE piezas_programadas SET estado = $3, actualizado_en = now() WHERE id = $1 AND estado = ANY($2::text[]) RETURNING id",
        [id, desde, hacia],
      );
      return resultado.rowCount === 1;
    },

    // Guarda el ID de un mensaje de Telegram de la pieza: así una respuesta a ese mensaje se sabe de qué pieza es
    async agregarMensaje(id, mensajeId) {
      await pool.query("UPDATE piezas_programadas SET mensajes = mensajes || to_jsonb($2::bigint) WHERE id = $1", [id, mensajeId]);
    },

    piezaPorMensaje: (mensajeId) => una(`SELECT ${COLUMNAS} FROM piezas_programadas WHERE mensajes @> to_jsonb($1::bigint) LIMIT 1`, [mensajeId]),

    // Archivos (fotos y videos) de una pieza. Se sirven por una dirección pública con un token imposible de adivinar.
    async agregarMedio({ piezaId, tipo, mime, datos }) {
      const token = randomBytes(24).toString("hex");
      const fila = await una(
        `INSERT INTO piezas_medios (pieza_id, orden, tipo, mime, datos, token)
         VALUES ($1, COALESCE((SELECT MAX(orden) FROM piezas_medios WHERE pieza_id = $1), 0) + 1, $2, $3, $4, $5)
         RETURNING id, orden, tipo, mime, token`,
        [piezaId, tipo, mime, datos, token],
      );
      return fila;
    },

    mediosDePieza: (piezaId) =>
      filas("SELECT id, orden, tipo, mime, token, octet_length(datos) AS bytes FROM piezas_medios WHERE pieza_id = $1 ORDER BY orden", [piezaId]),

    medioPorToken: (token) => una("SELECT tipo, mime, datos FROM piezas_medios WHERE token = $1", [token]),

    async borrarMedios(piezaId) {
      await pool.query("DELETE FROM piezas_medios WHERE pieza_id = $1", [piezaId]);
    },

    async crearRecordatorio({ piezaId, fecha, enviado = false }) {
      await pool.query("INSERT INTO recordatorios (pieza_id, fecha, enviado_en) VALUES ($1, $2, CASE WHEN $3 THEN now() END)", [piezaId, fecha, enviado]);
    },

    // Recordatorios sin enviar cuya fecha ya llegó, de piezas que siguen vivas
    recordatoriosPendientes: (hasta) =>
      filas(
        `SELECT r.id, r.pieza_id, to_char(r.fecha, 'YYYY-MM-DD') AS fecha
           FROM recordatorios r JOIN piezas_programadas p ON p.id = r.pieza_id
          WHERE r.enviado_en IS NULL AND r.fecha <= $1 AND p.estado NOT IN ('publicada', 'cancelada', 'manual', 'fallida')
          ORDER BY r.fecha, r.id`,
        [hasta],
      ),

    async marcarRecordatorioEnviado(id) {
      await pool.query("UPDATE recordatorios SET enviado_en = now() WHERE id = $1", [id]);
    },

    async borrarRecordatoriosPendientes(piezaId) {
      await pool.query("DELETE FROM recordatorios WHERE pieza_id = $1 AND enviado_en IS NULL", [piezaId]);
    },

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
