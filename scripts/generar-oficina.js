// Arma lo que la oficina (el juego de VOW HQ) sabe de los documentos del repo: piezas, estrategia, depósito, pendientes y archivos.
// Corre en cada build de la web (web/package.json) y escribe web/public/oficina/datos.json + los archivos de las piezas.
// Todo se deduce de los documentos con reglas fijas, sin IA: si un documento cambia, el juego cambia en el próximo deploy.
// Lo que depende de la base (estado de cada pieza, charla, lo que se marca en el juego) lo trae el juego en vivo de /api/programacion/oficina.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const iso = (dmy) => dmy.split("/").reverse().join("-");
const leer = (ruta) => readFileSync(ruta, "utf8");
const listar = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

// "publicado" si el Estado dice que salió; "por filmar" si falta filmar; "programado" si ya está cargado; si no, "por aprobar"
export function clasificarEstado(texto) {
  const t = String(texto).toLowerCase();
  if (/publicad/.test(t)) return "publicado";
  if (/falta filmar|por filmar/.test(t)) return "por filmar";
  if (/programad|cargado en el bot/.test(t)) return "programado";
  return "por aprobar";
}

// Una pieza sale de su .md: "# Formato · dd/mm/aaaa · pilar" más **Título:** y **Estado:**
export function leerPieza(md) {
  const cab = /^#\s+(.+?)\s+·\s+(\d{2}\/\d{2}\/\d{4})(?:\s+·\s+(.+))?$/m.exec(md);
  if (!cab) return null;
  const campo = (nombre) => new RegExp(`^\\*\\*${nombre}:\\*\\*\\s*(.+)$`, "m").exec(md)?.[1].trim() ?? "";
  const estado = campo("Estado");
  const cuerpo = md.split("\n").filter((l) => !/^# |^\*\*(Título|Estado):\*\*/.test(l)).join("\n").replace(/^\s+/, "");
  const pieza = {
    fecha: iso(cab[2]),
    formato: cab[1].trim().toLowerCase(),
    titulo: campo("Título") || cab[1].trim(),
    estado: clasificarEstado(estado),
    nota: estado.replace(/\*\*/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").slice(0, 220).trim(),
    texto: cuerpo.trim().slice(0, 3000),
  };
  const pendientes = /^## Pendiente\s*\n((?:- .+\n?)+)/m.exec(md)?.[1].split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()) ?? [];
  return { pieza, pendientes };
}

// Las tablas "| Dato | Valor |" de cada producto del stock: entrega y pendientes
export function leerStock(md) {
  const deposito = { gorras: "", medias: "", shakers: "", venta: "Sin definir" };
  const agenda = [];
  const secciones = md.split(/^### /m).slice(1);
  for (const sec of secciones) {
    const nombre = sec.split("\n")[0].split("·")[0].trim().toLowerCase();
    const clave = ["gorras", "medias", "shakers"].find((k) => nombre.startsWith(k.slice(0, 4)));
    if (!clave) continue;
    const fila = /^\|\s*Entrega(?: estimada)?\s*\|\s*(.+?)\s*\|/m.exec(sec)?.[1].replace(/\*\*/g, "") ?? "";
    deposito[clave] = fila || "sin dato";
    const f = /(\d{2})\/(\d{2})\/(\d{4})/.exec(fila);
    if (f) agenda.push({ f: `${f[3]}-${f[2]}-${f[1]}`, h: "", sala: "deposito", t: `Llegan ${clave === "medias" ? "las medias" : clave === "gorras" ? "las gorras" : "los shakers"}` });
  }
  const llegada = /entre el (\d{1,2}) y el (\d{1,2})\/(\d{2})\/(\d{4})/.exec(md);
  if (llegada) agenda.push({ f: `${llegada[4]}-${llegada[3]}-${llegada[1].padStart(2, "0")}`, h: "", sala: "deposito", t: "Empiezan a llegar medias y shakers (estimado)" });
  const pend = /^## Por confirmar\s*\n((?:- .+\n?)+)/m.exec(md)?.[1].split("\n").filter((l) => l.startsWith("- ")).map((l) => ({ sala: "deposito", t: `Confirmar: ${l.slice(2).replace(/\*/g, "").trim().replace(/^(.{0,140})\s.*$/s, (m, a) => (m.length > 150 ? `${a}…` : m))}` })) ?? [];
  return { deposito, agenda, pendientes: pend };
}

const lista = (valor) => (Array.isArray(valor) ? valor.join(", ") : String(valor ?? ""));
export function textoDelPlan(plan, nombre) {
  const sal = [`# Plan ${nombre}`, "", plan.resumen ?? ""];
  for (const p of plan.piezas ?? []) {
    sal.push("", `## ${p.fecha} · ${p.formato} · ${p.pilar}`, `**Gancho:** ${p.gancho}`);
    const filas = [["Ganchos alternativos", lista(p.ganchos_alternativos)], ["Guion", p.guion], ["Texto en pantalla", lista(p.texto_en_pantalla)], ["Epígrafe", p.epigrafe], ["Palabras clave", lista(p.palabras_clave)], ["CTA", p.cta], ["Recursos", lista(p.recursos)], ["Por qué", p.justificacion], ["Referencias", lista((p.referencias ?? []).map((r) => (typeof r === "string" ? r : r.url ?? r.cuenta ?? "")))]];
    for (const [k, v] of filas) if (v) sal.push(`**${k}:** ${v}`);
  }
  return sal.join("\n");
}

// Lunes a las 8: el Estratega arma el plan solo. Se calcula la próxima fecha desde "hoy" en el navegador, no acá.
export function generar({ raiz, destino, hoy = new Date().toISOString().slice(0, 10) }) {
  const docs = join(raiz, "docs");
  const D = { actualizado: hoy, piezas: [], agenda: [], pendientes: [], deposito: {}, bot: { modo: "simulación", publica: false }, sistema: { tests: "sin datos", evals: "sin datos" }, recepcion: { productos: "" }, estrategia: {}, planTexto: "", informeTexto: "" };
  const MED = { piezas: {} };

  rmSync(join(destino, "medios"), { recursive: true, force: true });
  mkdirSync(join(destino, "medios"), { recursive: true });

  for (const nombre of listar(join(docs, "piezas")).filter((n) => n.endsWith(".md"))) {
    const r = leerPieza(leer(join(docs, "piezas", nombre)));
    if (!r) continue;
    D.piezas.push(r.pieza);
    if (r.pieza.estado !== "publicado") D.agenda.push({ f: r.pieza.fecha, h: "", sala: "diseno", t: `${r.pieza.titulo} (${r.pieza.formato})` });
    // Los archivos: la carpeta con el mismo nombre que el .md, o "<fecha>-laminas"
    const base = nombre.replace(/\.md$/, "");
    const carpeta = [join(docs, "piezas", base), join(docs, "piezas", `${r.pieza.fecha}-laminas`)].find((c) => existsSync(c) && statSync(c).isDirectory());
    if (!carpeta) continue;
    const clave = `${r.pieza.fecha}_${r.pieza.formato}`;
    const sub = join(destino, "medios", clave);
    mkdirSync(sub, { recursive: true });
    const imgs = [], vids = [];
    for (const arch of listar(carpeta)) {
      const ext = arch.split(".").pop().toLowerCase();
      if (!["png", "jpg", "jpeg", "mp4"].includes(ext)) continue;
      copyFileSync(join(carpeta, arch), join(sub, basename(arch)));
      (ext === "mp4" ? vids : imgs).push(`medios/${clave}/${arch}`);
    }
    MED.piezas[clave] = { ...(imgs.length ? { imgs: imgs.sort((a, b) => a.localeCompare(b, "es", { numeric: true })) } : {}), ...(vids.length ? { vid: vids[0] } : {}), md: r.pieza.texto };
  }
  D.piezas.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const stock = join(docs, "productos", "stock-inicial.md");
  if (existsSync(stock)) {
    const s = leerStock(leer(stock));
    D.deposito = s.deposito;
    D.agenda.push(...s.agenda);
    D.pendientes.push(...s.pendientes);
  }
  const drop = join(raiz, "src", "data", "drop-01.js");
  if (existsSync(drop)) {
    const n = (leer(drop).match(/slug:\s*"/g) ?? []).length;
    D.recepcion.productos = `${n} en estado concepto (Drop 01, 2027)`;
  }

  const plan = listar(join(docs, "planes")).filter((n) => /^plan-\d{4}-\d{2}-\d{2}\.json$/.test(n)).at(-1);
  if (plan) {
    const nombre = plan.slice(5, 15);
    D.estrategia.plan = nombre;
    D.planTexto = textoDelPlan(JSON.parse(leer(join(docs, "planes", plan))), nombre);
  }
  const informe = listar(join(docs, "investigacion")).filter((n) => /^informe-\d{4}-\d{2}-\d{2}\.md$/.test(n)).at(-1);
  if (informe) {
    D.estrategia.informe = informe.slice(8, 18);
    D.informeTexto = leer(join(docs, "investigacion", informe));
  }
  D.agenda.sort((a, b) => a.f.localeCompare(b.f));
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, "datos.json"), JSON.stringify({ D, MED }));
  return { D, MED };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = resolve(fileURLToPath(import.meta.url), "..", "..");
  const { D } = generar({ raiz, destino: join(raiz, "web", "public", "oficina") });
  console.log(`Oficina: ${D.piezas.length} piezas, ${D.pendientes.length} pendientes, ${D.agenda.length} fechas.`);
}
