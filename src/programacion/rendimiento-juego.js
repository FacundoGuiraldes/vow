// Rendimiento de las últimas publicaciones de Instagram para la oficina (alcance, reacciones, guardados).
// Se guarda en memoria unos minutos: el juego consulta seguido y Meta tiene cupo.
export function crearRendimientoJuego({ meta, ttlMs = 15 * 60_000, limite = 9, ahora = () => Date.now() } = {}) {
  let guardado = null;
  const traer = async () => {
    const [perfil, publicaciones] = await Promise.all([meta.perfil(), meta.publicaciones(limite)]);
    const filas = await Promise.all(
      publicaciones.map(async (p) => {
        const m = await meta.metricas(p.id).catch(() => ({}));
        return {
          id: p.id, fecha: String(p.timestamp ?? "").slice(0, 10), tipo: p.media_product_type ?? p.media_type ?? null, permalink: p.permalink ?? null,
          gancho: String(p.caption ?? "").split("\n")[0].slice(0, 90),
          alcance: m.reach ?? null, vistas: m.views ?? null, me_gusta: m.likes ?? p.like_count ?? null, comentarios: m.comments ?? p.comments_count ?? null,
          guardados: m.saved ?? null, compartidos: m.shares ?? null, interacciones: m.total_interactions ?? null,
        };
      }),
    );
    const suma = (clave) => filas.reduce((total, f) => total + (Number(f[clave]) || 0), 0);
    return {
      actualizado: new Date(ahora()).toISOString(),
      cuenta: { usuario: perfil.username ?? null, seguidores: perfil.followers_count ?? null, publicaciones: perfil.media_count ?? null },
      totales: { alcance: suma("alcance"), interacciones: suma("interacciones"), me_gusta: suma("me_gusta"), guardados: suma("guardados") },
      publicaciones: filas,
    };
  };
  return {
    async obtener() {
      if (!meta) return null;
      if (guardado && ahora() - guardado.en < ttlMs) return guardado.datos;
      const datos = await traer();
      guardado = { en: ahora(), datos };
      return datos;
    },
  };
}
