// Reel "el logo se dibuja": un marcador dibuja el logo de VOW sobre papel hueso, y el video cierra con la pregunta
// "¿Y vos? ¿Qué te prometés? Cumplilo." (MP4 vertical 1080x1920, 30 fps, sin audio).
// Uso: node src/disenio/reel-logo.js [carpeta de salida]
// El logo es el real (el mismo SVG de la landing): se lo va descubriendo con trazos de máscara que siguen sus formas.
// El guion se revisa con las reglas de marca antes de dibujar: si alguna frase las rompe, no se genera nada.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ANCHO, ALTO, CUADROS_POR_SEGUNDO, grabar } from "./video.js";
import { cifrasNoPermitidas, revisarReglas, revisarTextoAlPublico } from "../agents/reglas-marca.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");
const COLOR = { hueso: "#ECE8E1", negro: "#0A0A0A", bordo: "#7A1F24" };

// ---- Guion ----
export const TEXTO_GANCHO = ["Esto lo dibujo", "cada vez", "que cumplo."]; // aparece desde el primer cuadro
export const TEXTO_PROMESA = ["Una promesa", "con vos."]; // cuando el logo termina de dibujarse
// Cierre: cada línea entra en su momento (segundos desde que empieza la escena final)
export const CIERRE = [
  { texto: "¿Y vos?", entra: 0 },
  { texto: "¿Qué te", entra: 1.0 },
  { texto: "prometés?", entra: 1.0 },
  { texto: "Cumplilo.", entra: 2.6 },
];
export const PIE_CIERRE = "Drop 01 en 2027";

export const SEGUNDOS_PAPEL = 9.6; // la escena del dibujo
export const SEGUNDOS_CIERRE = 4.6; // la escena final
export const DURACION = SEGUNDOS_PAPEL + SEGUNDOS_CIERRE;

export const TEXTOS = [...TEXTO_GANCHO, ...TEXTO_PROMESA, ...CIERRE.map((c) => c.texto), PIE_CIERRE].join(" ");

export function revisarGuion(texto = TEXTOS) {
  return [
    ...revisarReglas(texto),
    ...revisarTextoAlPublico(texto),
    ...cifrasNoPermitidas(texto).map((cifra) => ({ regla: "cifra que no está en los datos", fragmento: cifra })),
  ];
}

// ---- Geometría del logo (en las coordenadas del SVG: viewBox "308 128 492 518") ----
// Cada trazo es una línea quebrada que sigue el centro de una parte del logo; `ancho` es el grosor de la máscara.
export const TRAZOS = [
  { nombre: "pata izquierda de la V", ancho: 92, puntos: [[356, 185], [556, 645]] },
  { nombre: "pata derecha de la V", ancho: 84, puntos: [[555, 628], [713, 290]] },
  { nombre: "eje de la flecha", ancho: 62, puntos: [[470, 452], [730, 202]] },
  { nombre: "trazo curvo de arriba", ancho: 54, puntos: [[317, 138], [350, 168], [383, 188], [420, 194], [450, 193], [480, 192], [508, 194], [540, 204], [568, 216], [600, 232], [626, 251]] },
];
// La punta de la flecha se descubre con un círculo que crece desde este centro
export const PUNTA = { centro: [735, 200], radio: 96, desde: [730, 202], hasta: [792, 142] };

// Cuándo se dibuja cada parte (segundos desde el inicio): [empieza, termina]
// Orden: primero el trazo curvo, después la V, y la flecha al final (es lo que más sube).
export const TIEMPOS = { curva: [1.0, 2.5], trazos: [[2.7, 4.1], [4.2, 5.4], [5.5, 6.8]], punta: [6.8, 7.3], sello: [7.7, 8.1] };
const ORDEN_TRAZOS = [0, 1, 2]; // los tres primeros; la punta y la curva van aparte

const suave = (x) => { const v = Math.min(1, Math.max(0, x)); return v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2; };
const avance = (t, [desde, hasta]) => suave((t - desde) / (hasta - desde));
const mezcla = ([ax, ay], [bx, by], k) => [ax + (bx - ax) * k, ay + (by - ay) * k];

// Punto de una línea quebrada a una fracción `k` (0 a 1) de su largo
export function puntoEn(puntos, k) {
  const largos = puntos.slice(1).map((p, i) => Math.hypot(p[0] - puntos[i][0], p[1] - puntos[i][1]));
  let resto = Math.min(1, Math.max(0, k)) * largos.reduce((a, b) => a + b, 0);
  for (const [i, largo] of largos.entries()) {
    if (resto <= largo || i === largos.length - 1) return mezcla(puntos[i], puntos[i + 1], largo === 0 ? 0 : Math.min(1, resto / largo));
    resto -= largo;
  }
}

// Cuánto avanzó cada parte en el segundo t: [pata izq, pata der, eje, curva] y la punta (0 a 1)
export function avancesDelLogo(t) {
  return { trazos: [...TIEMPOS.trazos.map((i) => avance(t, i)), avance(t, TIEMPOS.curva)], punta: avance(t, TIEMPOS.punta) };
}

export const SALIDA_DEL_MARCADOR = [900, 700]; // por dónde entra y sale el marcador (coordenadas del SVG)
const EXTREMOS = [
  { tiempo: TIEMPOS.curva, punto: (k) => puntoEn(TRAZOS[3].puntos, k) },
  ...ORDEN_TRAZOS.map((i, n) => ({ tiempo: TIEMPOS.trazos[n], punto: (k) => puntoEn(TRAZOS[i].puntos, k) })),
  { tiempo: TIEMPOS.punta, punto: (k) => mezcla(PUNTA.desde, PUNTA.hasta, k) },
];

// Dónde está la punta del marcador en el segundo t, y qué tan visible está (coordenadas del SVG)
export function marcadorEn(t) {
  const primero = EXTREMOS[0];
  if (t < primero.tiempo[0]) {
    const k = suave((t - 0.4) / (primero.tiempo[0] - 0.4));
    return { punto: mezcla(SALIDA_DEL_MARCADOR, primero.punto(0), k), opacidad: Math.min(1, Math.max(0, t / 0.4)) };
  }
  for (const [i, e] of EXTREMOS.entries()) {
    if (t <= e.tiempo[1]) return { punto: e.punto(avance(t, e.tiempo)), opacidad: 1 };
    const siguiente = EXTREMOS[i + 1];
    if (siguiente && t < siguiente.tiempo[0]) {
      // entre un trazo y el siguiente el marcador viaja en el aire
      const k = (t - e.tiempo[1]) / (siguiente.tiempo[0] - e.tiempo[1]);
      return { punto: mezcla(e.punto(1), siguiente.punto(0), suave(k)), opacidad: 1 };
    }
  }
  // terminó: se retira hacia la salida y se desvanece
  const ultimo = EXTREMOS.at(-1);
  const k = suave((t - ultimo.tiempo[1]) / 0.8);
  return { punto: mezcla(ultimo.punto(1), SALIDA_DEL_MARCADOR, k), opacidad: 1 - Math.min(1, Math.max(0, (t - ultimo.tiempo[1] - 0.4) / 0.4)) };
}

// Entrada de un texto: aparece subiendo un poco, con frenado al final
const entrada = (local, entra, duracion = 0.4) => 1 - (1 - Math.min(1, Math.max(0, (local - entra) / duracion))) ** 3;

// Todo lo que hay que dibujar en el segundo t del video
export function estadoEn(t) {
  if (t < SEGUNDOS_PAPEL) {
    const logoTerminado = t >= TIEMPOS.punta[1];
    const lineas = (logoTerminado && t >= 8.2 ? TEXTO_PROMESA : TEXTO_GANCHO);
    const local = logoTerminado && t >= 8.2 ? t - 8.2 : t;
    return {
      escena: "papel", fondo: COLOR.hueso, tinta: COLOR.negro, tamano: logoTerminado && t >= 8.2 ? 84 : 68,
      lineas: lineas.map((texto, i) => ({ texto, avance: entrada(local, i * 0.12) })),
      logo: { ...avancesDelLogo(t), sello: avance(t, TIEMPOS.sello), marcador: marcadorEn(t) },
    };
  }
  const local = t - SEGUNDOS_PAPEL;
  const ultima = CIERRE.at(-1);
  return {
    escena: "cierre", fondo: COLOR.negro, tinta: COLOR.hueso, tamano: 112,
    lineas: CIERRE.map((c, i) => ({ texto: c.texto, avance: entrada(local, c.entra + (c.texto === "prometés?" ? 0.12 : 0)) })),
    acento: entrada(local, ultima.entra + 0.5, 0.3),
    pie: { texto: PIE_CIERRE, avance: entrada(local, ultima.entra + 0.9, 0.3) },
  };
}

// ---- Página ----
const fuente = (paquete, archivo) =>
  readFileSync(join(raiz, "node_modules", "@fontsource", paquete, "files", archivo)).toString("base64");
const logoSvg = readFileSync(join(raiz, "web", "src", "assets", "logo-mark.svg"), "utf8");
const FORMA_DEL_LOGO = logoSvg.match(/<path[^>]*\/>/)[0];

const LOGO_ANCHO = 640; // px en pantalla
const LOGO_IZQUIERDA = (ANCHO - LOGO_ANCHO) / 2;
const LOGO_ARRIBA = 640;
const ESCALA = LOGO_ANCHO / 492;
const aPantalla = ([x, y]) => [LOGO_IZQUIERDA + (x - 308) * ESCALA, LOGO_ARRIBA + (y - 128) * ESCALA];

export const htmlDelReel = () => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:"Unbounded";font-weight:800;src:url(data:font/woff2;base64,${fuente("unbounded", "unbounded-latin-800-normal.woff2")}) format("woff2")}
@font-face{font-family:"Space Mono";font-weight:400;src:url(data:font/woff2;base64,${fuente("space-mono", "space-mono-latin-400-normal.woff2")}) format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${ANCHO}px;height:${ALTO}px;overflow:hidden;position:relative}
#papel{position:absolute;inset:0}
/* Instagram tapa la parte de abajo (botones y epígrafe): lo importante va entre 250 y 1500 px */
#texto-papel{position:absolute;left:96px;right:96px;top:260px}
#bloque{position:absolute;left:96px;right:96px;top:300px;bottom:420px;display:flex;flex-direction:column;justify-content:center}
h1{font-family:"Unbounded",sans-serif;font-weight:800;line-height:1.08;word-spacing:.1em;text-transform:uppercase}
h1 span{display:block;white-space:nowrap}
#logo{position:absolute;left:${LOGO_IZQUIERDA}px;top:${LOGO_ARRIBA}px;width:${LOGO_ANCHO}px;height:${518 * ESCALA}px;overflow:visible}
#sello{position:absolute;left:${LOGO_IZQUIERDA}px;top:${LOGO_ARRIBA + 518 * ESCALA + 56}px;height:8px;background:${COLOR.bordo}}
#marcador{position:absolute;left:0;top:0}
#acento{height:8px;background:${COLOR.bordo};margin-top:56px}
#pie{margin-top:40px;font:400 34px "Space Mono",monospace;letter-spacing:.12em;text-transform:uppercase}
</style></head><body>
<div id="papel">
  <svg width="${ANCHO}" height="${ALTO}" style="position:absolute;inset:0;pointer-events:none"><filter id="grano"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .22  0 0 0 .09 0"/></filter><rect width="100%" height="100%" filter="url(#grano)"/></svg>
  <svg id="logo" viewBox="308 128 492 518" fill="${COLOR.negro}">
    <defs><mask id="m" maskUnits="userSpaceOnUse" x="300" y="120" width="520" height="540"><rect x="300" y="120" width="520" height="540" fill="black"/>
      ${TRAZOS.map((t, i) => `<path class="trazo" data-i="${i}" d="M ${t.puntos.map((p) => p.join(" ")).join(" L ")}" pathLength="1" fill="none" stroke="white" stroke-width="${t.ancho}" stroke-linejoin="round" stroke-dasharray="0 1"/>`).join("")}
      <circle id="punta" cx="${PUNTA.centro[0]}" cy="${PUNTA.centro[1]}" r="0" fill="white"/></mask></defs>
    <g mask="url(#m)">${FORMA_DEL_LOGO}</g>
  </svg>
  <div id="sello" style="width:0"></div>
  <svg id="marcador" width="1" height="1" style="overflow:visible"><g transform="rotate(35)"><rect x="-22" y="-300" width="44" height="262" rx="6" fill="${COLOR.negro}"/><rect x="-22" y="-300" width="44" height="34" rx="6" fill="${COLOR.bordo}"/><path d="M -22 -38 L 22 -38 L 6 0 L -6 0 Z" fill="#3a3a3a"/><path d="M -6 0 L 6 0 L 0 14 Z" fill="${COLOR.negro}"/></g></svg>
  <h1 id="texto-papel"></h1>
</div>
<div id="bloque" style="display:none"><h1 id="texto"></h1><div id="acento"></div><div id="pie"></div></div>
<script>
const A_PANTALLA = (p) => [${LOGO_IZQUIERDA} + (p[0] - 308) * ${ESCALA}, ${LOGO_ARRIBA} + (p[1] - 128) * ${ESCALA}];
const lineasHtml = (lineas) => lineas.map((l) => '<span style="opacity:' + l.avance + ';transform:translateY(' + (1 - l.avance) * 60 + 'px)">' + l.texto + "</span>").join("");
// Se llama una vez por cuadro con el estado completo de la escena
window.dibujar = (e) => {
  document.body.style.background = e.fondo;
  document.body.style.color = e.tinta;
  const enPapel = e.escena === "papel";
  document.getElementById("papel").style.display = enPapel ? "block" : "none";
  document.getElementById("bloque").style.display = enPapel ? "none" : "flex";
  if (enPapel) {
    const h1 = document.getElementById("texto-papel");
    h1.style.fontSize = e.tamano + "px";
    h1.innerHTML = lineasHtml(e.lineas);
    document.querySelectorAll(".trazo").forEach((t) => t.setAttribute("stroke-dasharray", e.logo.trazos[+t.dataset.i] + " 1"));
    document.getElementById("punta").setAttribute("r", e.logo.punta * ${PUNTA.radio});
    document.getElementById("sello").style.width = e.logo.sello * 120 + "px";
    const [x, y] = A_PANTALLA(e.logo.marcador.punto);
    const m = document.getElementById("marcador");
    m.style.transform = "translate(" + x + "px," + y + "px)";
    m.style.opacity = e.logo.marcador.opacidad;
  } else {
    const h1 = document.getElementById("texto");
    h1.style.fontSize = e.tamano + "px";
    h1.innerHTML = lineasHtml(e.lineas);
    document.getElementById("acento").style.width = e.acento * 96 + "px";
    const pie = document.getElementById("pie");
    pie.textContent = e.pie.texto;
    pie.style.opacity = e.pie.avance;
  }
};
</script></body></html>`;

// `segundos` permite grabar solo el principio (para probar sin esperar el video entero)
export async function generar(salida, { segundos = DURACION } = {}) {
  const problemas = revisarGuion();
  if (problemas.length) throw new Error(`Textos que rompen reglas de marca: ${JSON.stringify(problemas)}`);
  return grabar({
    archivo: join(salida, "reel-logo.mp4"),
    html: htmlDelReel(),
    cuadros: Math.round(Math.min(DURACION, segundos) * CUADROS_POR_SEGUNDO),
    argumentosDelCuadro: (cuadro) => [estadoEn(cuadro / CUADROS_POR_SEGUNDO)],
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const salida = process.argv[2] ?? join(raiz, "docs", "piezas", "2026-11-02-reel-logo");
  console.log(`Reel generado: ${await generar(salida)}`);
}
