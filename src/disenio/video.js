// Graba un video a partir de una página animada: Playwright dibuja cada cuadro y ffmpeg los une en un MP4 sin audio.
// Lo usan los reels (reel.js y reel-logo.js). Quien lo llama pone el HTML y decide qué argumentos tiene cada cuadro.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright-core";

export const ANCHO = 1080;
export const ALTO = 1920;
export const CUADROS_POR_SEGUNDO = 30;

// html: la página; debe definir window.dibujar(...argumentos)
// cuadros: cuántos cuadros grabar; argumentosDelCuadro(n): lo que se le pasa a window.dibujar en el cuadro n
// Si alguna línea de texto (h1 > span) es más ancha que su bloque, frena: el texto quedaría cortado en el video.
export async function grabar({ archivo, html, cuadros, argumentosDelCuadro }) {
  mkdirSync(dirname(archivo), { recursive: true });
  const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let ffmpeg;
  try {
    const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
    await pagina.setContent(html);
    await pagina.evaluate(() => document.fonts.ready);

    // ffmpeg recibe los cuadros como imágenes por la entrada estándar y arma el MP4 (sin audio: la música se pone desde Instagram)
    ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(CUADROS_POR_SEGUNDO), "-i", "-",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", "-an", archivo], { stdio: ["pipe", "inherit", "inherit"] });
    const termino = new Promise((resolver, rechazar) => {
      ffmpeg.on("error", rechazar);
      ffmpeg.on("close", (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`ffmpeg terminó con código ${codigo}`))));
    });
    termino.catch(() => {}); // si se frena antes de tiempo, que el cierre forzado de ffmpeg no cuente como error sin atender

    for (let cuadro = 0; cuadro < cuadros; cuadro++) {
      await pagina.evaluate((argumentos) => window.dibujar(...argumentos), argumentosDelCuadro(cuadro));
      // (cada línea es un bloque del ancho del margen: si el texto es más ancho que el bloque, scrollWidth lo delata)
      const desbordes = await pagina.evaluate(() => [...document.querySelectorAll("h1 > span")].filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent));
      if (desbordes.length) throw new Error(`Cuadro ${cuadro}: se sale del margen: ${desbordes.join(" | ")}`);
      if (!ffmpeg.stdin.write(await pagina.screenshot({ type: "png" }))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    }
    ffmpeg.stdin.end();
    await termino;
  } finally {
    ffmpeg?.kill("SIGKILL"); // si ya terminó no hace nada; si se frenó por un error, no lo deja colgado esperando cuadros
    await navegador.close();
  }
  return archivo;
}
