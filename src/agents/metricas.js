// Cuentas de rendimiento sobre los datos que baja instagram.js.
// Idea central: un post suelto no dice nada (el mismo texto puede tener 595 mil o 13 mil vistas),
// así que todo se mide contra el tamaño de la cuenta y se resume con la MEDIANA, no con el promedio.

export function tipoDePublicacion(publicacion) {
  if (publicacion.media_type === "CAROUSEL_ALBUM") return "carrusel";
  if (publicacion.media_type === "IMAGE") return "imagen";
  if (publicacion.media_type === "VIDEO") return /\/reels?\//.test(publicacion.permalink ?? "") ? "reel" : "video";
  return "otro";
}

export function mediana(numeros) {
  const v = numeros.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Rasgos del texto del post (sirven después para ver qué estilo de texto rinde)
export function rasgosDelTexto(texto = "") {
  const limpio = String(texto ?? "").trim();
  const primeraLinea = limpio.split(/\r?\n/)[0] ?? "";
  return {
    palabras: limpio === "" ? 0 : limpio.split(/\s+/).length,
    primeraLinea,
    palabrasPrimeraLinea: primeraLinea === "" ? 0 : primeraLinea.split(/\s+/).length,
    hashtags: (limpio.match(/#[\p{L}\p{N}_]+/gu) ?? []).length,
    emojis: (limpio.match(/\p{Extended_Pictographic}/gu) ?? []).length,
    esPregunta: /\?/.test(primeraLinea),
  };
}

export function analizarPublicaciones({ seguidores, publicaciones }) {
  return publicaciones.map((p) => {
    const reacciones = (p.like_count ?? 0) + (p.comments_count ?? 0);
    const tieneVistas = Number.isFinite(p.view_count);
    return {
      tipo: tipoDePublicacion(p),
      fecha: p.timestamp,
      enlace: p.permalink,
      likes: p.like_count ?? null,
      comentarios: p.comments_count ?? null,
      vistas: tieneVistas ? p.view_count : null,
      // En % del tamaño de la cuenta: permite comparar cuentas chicas con enormes
      reaccionesPorSeguidor: seguidores ? reacciones / seguidores : null,
      vistasPorSeguidor: tieneVistas && seguidores ? p.view_count / seguidores : null,
      ...rasgosDelTexto(p.caption),
    };
  });
}

// Resumen por tipo de publicación, con medianas
export function resumirPorTipo(analizadas) {
  const grupos = {};
  for (const p of analizadas) (grupos[p.tipo] ??= []).push(p);
  return Object.fromEntries(
    Object.entries(grupos).map(([tipo, lista]) => [
      tipo,
      {
        cantidad: lista.length,
        medianaReaccionesPorSeguidor: mediana(lista.map((p) => p.reaccionesPorSeguidor)),
        medianaVistasPorSeguidor: mediana(lista.map((p) => p.vistasPorSeguidor)),
      },
    ])
  );
}

export function resumirCuenta(cuenta) {
  const publicaciones = analizarPublicaciones(cuenta);
  return {
    usuario: cuenta.usuario,
    seguidores: cuenta.seguidores,
    publicacionesAnalizadas: publicaciones.length,
    porTipo: resumirPorTipo(publicaciones),
    publicaciones,
  };
}
