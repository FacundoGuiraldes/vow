// Reel "el logo se dibuja": una pluma recorre el contorno del logo de VOW sobre papel hueso, el relleno entra con un barrido,
// y el video cierra con la pregunta "¿Y vos? ¿Qué te prometés? Cumplilo." (MP4 vertical 1080x1920, 30 fps, sin audio).
// Uso: node src/disenio/reel-logo.js [carpeta de salida]
// El logo es el real (el mismo SVG de la landing). Tiene dos contornos: el trazo curvo de arriba y la V con la flecha.
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
// El detalle de marca: una línea bordó, trazada a mano, firma "Cumplilo." (cuándo empieza y cuánto dura, en segundos desde que entra esa línea)
export const FIRMA = { despues: 0.5, dura: 0.55 };

export const SEGUNDOS_PAPEL = 9.6; // la escena del dibujo
export const SEGUNDOS_CIERRE = 4.6; // la escena final
export const DURACION = SEGUNDOS_PAPEL + SEGUNDOS_CIERRE;
export const SEGUNDOS_TEXTO_PROMESA = 8.2; // desde acá el texto del gancho cambia a "Una promesa con vos."

export const TEXTOS = [...TEXTO_GANCHO, ...TEXTO_PROMESA, ...CIERRE.map((c) => c.texto)].join(" ");

export function revisarGuion(texto = TEXTOS) {
  return [
    ...revisarReglas(texto),
    ...revisarTextoAlPublico(texto),
    ...cifrasNoPermitidas(texto).map((cifra) => ({ regla: "cifra que no está en los datos", fragmento: cifra })),
  ];
}

// ---- Tiempos del dibujo (segundos desde el inicio): [empieza, termina] ----
// La pluma ya se mueve en el primer medio segundo (para que el gancho tenga movimiento desde el principio).
// Orden: primero el trazo curvo (contorno 0), después la V con la flecha (contorno 1), después entra el relleno y al final el sello.
export const TIEMPOS = { contornos: [[0.5, 2.0], [2.2, 6.4]], relleno: [6.5, 7.5], sello: [7.8, 8.2] };

const limitar = (x) => Math.min(1, Math.max(0, x));
// Arranca y frena suave
export const suave = (x) => { const v = limitar(x); return v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2; };
const avance = (t, [desde, hasta]) => suave((t - desde) / (hasta - desde));

// Cuánto avanzó el dibujo en el segundo t
export function avancesDelLogo(t) {
  return { contornos: TIEMPOS.contornos.map((i) => avance(t, i)), relleno: avance(t, TIEMPOS.relleno), sello: avance(t, TIEMPOS.sello) };
}

// Dónde está la pluma. Devuelve una descripción; la página calcula el punto sobre el contorno real del logo.
//   entrada: viene de afuera hacia el comienzo del primer contorno
//   contorno: dibujando el contorno `contorno`, a `avance` (0 a 1) de su largo
//   aire: levantada, viajando entre el final de un contorno y el comienzo del siguiente
//   salida: se retira hacia afuera al terminar el último contorno
export function marcadorEn(t) {
  const [c0, c1] = TIEMPOS.contornos;
  if (t < c0[0]) return { tipo: "entrada", k: suave(t / c0[0]), opacidad: limitar(t / 0.25) };
  if (t <= c0[1]) return { tipo: "contorno", contorno: 0, avance: avance(t, c0), opacidad: 1 };
  if (t < c1[0]) return { tipo: "aire", de: { contorno: 0, avance: 1 }, a: { contorno: 1, avance: 0 }, k: suave((t - c0[1]) / (c1[0] - c0[1])), opacidad: 1 };
  if (t <= c1[1]) return { tipo: "contorno", contorno: 1, avance: avance(t, c1), opacidad: 1 };
  return { tipo: "salida", desde: { contorno: 1, avance: 1 }, k: suave((t - c1[1]) / 0.8), opacidad: 1 - limitar((t - c1[1] - 0.4) / 0.4) };
}

// Entrada de un texto: aparece subiendo un poco, con frenado al final
export const entrada = (local, entra, duracion = 0.4) => 1 - (1 - limitar((local - entra) / duracion)) ** 3;

// Todo lo que hay que dibujar en el segundo t del video
export function estadoEn(t) {
  if (t < SEGUNDOS_PAPEL) {
    const promesa = t >= SEGUNDOS_TEXTO_PROMESA;
    const local = promesa ? t - SEGUNDOS_TEXTO_PROMESA : t;
    return {
      escena: "papel", fondo: COLOR.hueso, tinta: COLOR.negro, tamano: promesa ? 84 : 68,
      lineas: (promesa ? TEXTO_PROMESA : TEXTO_GANCHO).map((texto, i) => ({ texto, avance: entrada(local, i * 0.12) })),
      logo: { ...avancesDelLogo(t), marcador: marcadorEn(t) },
    };
  }
  const local = t - SEGUNDOS_PAPEL;
  const ultima = CIERRE.at(-1);
  return {
    escena: "cierre", fondo: COLOR.negro, tinta: COLOR.hueso, tamano: 112,
    lineas: CIERRE.map((c) => ({ texto: c.texto, avance: entrada(local, c.entra + (c.texto === "prometés?" ? 0.12 : 0)) })),
    firma: suave((local - ultima.entra - FIRMA.despues) / FIRMA.dura),
  };
}

// ---- Página ----
const fuente = (paquete, archivo) =>
  readFileSync(join(raiz, "node_modules", "@fontsource", paquete, "files", archivo)).toString("base64");
const logoSvg = readFileSync(join(raiz, "web", "src", "assets", "logo-mark.svg"), "utf8");
const TRAZADO = logoSvg.match(/ d="([^"]+)"/)[1];
// Cada contorno del logo empieza con una "M": se separan para dibujarlos de a uno
const CONTORNOS = TRAZADO.split(/(?=M )/).filter((c) => c.trim());

const LOGO_ANCHO = 640; // px en pantalla
const LOGO_IZQUIERDA = (ANCHO - LOGO_ANCHO) / 2;
const LOGO_ARRIBA = 640;
const ESCALA = LOGO_ANCHO / 492;
const ALTO_LOGO = 518 * ESCALA;
const SALIDA = [900, 700]; // por dónde entra y sale la pluma (coordenadas del SVG del logo)

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
#logo{position:absolute;left:${LOGO_IZQUIERDA}px;top:${LOGO_ARRIBA}px;width:${LOGO_ANCHO}px;height:${ALTO_LOGO}px;overflow:visible}
#sello{position:absolute;left:${LOGO_IZQUIERDA}px;top:${LOGO_ARRIBA + ALTO_LOGO + 56}px;height:8px;background:${COLOR.bordo}}
#pluma{position:absolute;left:0;top:0;overflow:visible;filter:drop-shadow(12px 16px 9px rgba(40,30,20,.25))}
#firma{position:absolute;overflow:visible}
</style></head><body>
<div id="papel">
  <svg width="${ANCHO}" height="${ALTO}" style="position:absolute;inset:0;pointer-events:none"><filter id="grano"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .3  0 0 0 0 .27  0 0 0 0 .22  0 0 0 .09 0"/></filter><rect width="100%" height="100%" filter="url(#grano)"/></svg>
  <svg id="logo" viewBox="308 128 492 518">
    <defs>
      <linearGradient id="barrido" gradientUnits="userSpaceOnUse" x1="308" y1="646" x2="800" y2="128"><stop id="barrido-a" offset="0" stop-color="white"/><stop id="barrido-b" offset="0" stop-color="black"/></linearGradient>
      <mask id="relleno-mascara" maskUnits="userSpaceOnUse" x="300" y="120" width="520" height="540"><rect x="300" y="120" width="520" height="540" fill="url(#barrido)"/></mask>
    </defs>
    <path id="relleno" d="${TRAZADO}" fill="${COLOR.negro}" fill-rule="evenodd" mask="url(#relleno-mascara)"/>
    ${CONTORNOS.map((c, i) => `<path class="contorno" data-i="${i}" d="${c}" pathLength="1" fill="none" stroke="${COLOR.negro}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0 1"/>`).join("")}
  </svg>
  <div id="sello" style="width:0"></div>
  <svg id="pluma" width="1" height="1" style="opacity:0"><defs><linearGradient id="cuerpo" x1="0" x2="1"><stop offset="0" stop-color="#151515"/><stop offset=".45" stop-color="#4a4a4a"/><stop offset="1" stop-color="#151515"/></linearGradient></defs>
    <g transform="rotate(38)"><path d="M -4 0 L 4 0 L 10 -34 L -10 -34 Z" fill="#2a2a2a"/><rect x="-14" y="-240" width="28" height="208" rx="9" fill="url(#cuerpo)"/><rect x="-14" y="-110" width="28" height="12" fill="${COLOR.bordo}"/><rect x="-14" y="-240" width="28" height="40" rx="9" fill="${COLOR.bordo}"/></g></svg>
  <h1 id="texto-papel"></h1>
</div>
<div id="bloque" style="display:none"><h1 id="texto"></h1></div>
<svg id="firma" width="10" height="10" style="display:none"><path d="M 2 14 C 70 4, 130 22, 210 10 S 330 16, 398 6" pathLength="1" fill="none" stroke="${COLOR.bordo}" stroke-width="12" stroke-linecap="round" stroke-dasharray="0 1"/></svg>
<script>
const SALIDA = ${JSON.stringify(SALIDA)};
const contornos = [...document.querySelectorAll(".contorno")];
// Un punto sobre un contorno del logo, a una fracción de su largo (coordenadas del SVG del logo)
const sobre = ({ contorno, avance }) => {
  const c = contornos[contorno];
  const p = c.getPointAtLength(avance * c.getTotalLength());
  return [p.x, p.y];
};
const mezcla = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const puntoDeLaPluma = (m) => {
  if (m.tipo === "entrada") return mezcla(SALIDA, sobre({ contorno: 0, avance: 0 }), m.k);
  if (m.tipo === "contorno") return sobre(m);
  if (m.tipo === "aire") return mezcla(sobre(m.de), sobre(m.a), m.k);
  return mezcla(sobre(m.desde), SALIDA, m.k);
};
const aPantalla = (p) => [${LOGO_IZQUIERDA} + (p[0] - 308) * ${ESCALA}, ${LOGO_ARRIBA} + (p[1] - 128) * ${ESCALA}];
const lineasHtml = (lineas) => lineas.map((l) => '<span style="opacity:' + l.avance + ';transform:translateY(' + (1 - l.avance) * 60 + 'px)">' + l.texto + "</span>").join("");

// Se llama una vez por cuadro con el estado completo de la escena
window.dibujar = (e) => {
  document.body.style.background = e.fondo;
  document.body.style.color = e.tinta;
  const enPapel = e.escena === "papel";
  document.getElementById("papel").style.display = enPapel ? "block" : "none";
  document.getElementById("bloque").style.display = enPapel ? "none" : "flex";
  const firma = document.getElementById("firma");
  firma.style.display = enPapel ? "none" : "block";
  if (enPapel) {
    const h1 = document.getElementById("texto-papel");
    h1.style.fontSize = e.tamano + "px";
    h1.innerHTML = lineasHtml(e.lineas);
    contornos.forEach((c) => {
      c.setAttribute("stroke-dasharray", e.logo.contornos[+c.dataset.i] + " 1");
      // El contorno desaparece cuando el relleno lo reemplaza (el logo final es el original exacto) y no se ve hasta que la pluma lo empieza
      // (con la punta redonda, un trazo de largo cero dejaría un puntito)
      c.style.opacity = e.logo.contornos[+c.dataset.i] > 0 ? 1 - e.logo.relleno : 0;
    });
    // Barrido diagonal del relleno (de abajo a la izquierda hacia la punta de la flecha), con borde suave
    const k = e.logo.relleno;
    document.getElementById("barrido-a").setAttribute("offset", Math.min(1, Math.max(0, k * 1.25 - 0.25)));
    document.getElementById("barrido-b").setAttribute("offset", Math.min(1, k * 1.25));
    document.getElementById("sello").style.width = e.logo.sello * 120 + "px";
    const [x, y] = aPantalla(puntoDeLaPluma(e.logo.marcador));
    const pluma = document.getElementById("pluma");
    pluma.style.transform = "translate(" + x + "px," + y + "px)";
    pluma.style.opacity = e.logo.marcador.opacidad;
  } else {
    const h1 = document.getElementById("texto");
    h1.style.fontSize = e.tamano + "px";
    h1.innerHTML = lineasHtml(e.lineas);
    // La firma va justo debajo de "Cumplilo.", del largo de esa palabra
    const ultima = h1.lastElementChild;
    const rango = document.createRange();
    rango.selectNodeContents(ultima);
    const caja = rango.getBoundingClientRect();
    firma.style.left = caja.left + "px";
    firma.style.top = (caja.bottom + 22) + "px";
    firma.style.width = caja.width + "px";
    firma.style.height = "30px";
    firma.setAttribute("viewBox", "0 0 400 30");
    firma.setAttribute("preserveAspectRatio", "none");
    firma.querySelector("path").setAttribute("stroke-dasharray", e.firma + " 1");
    firma.style.opacity = e.firma > 0 ? ultima.style.opacity : 0; // sin avance no se ve (la punta redonda dejaría puntitos)
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
