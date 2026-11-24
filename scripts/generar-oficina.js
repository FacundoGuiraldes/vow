// Arma lo que la oficina (el juego de VOW HQ) sabe de los documentos del repo: estrategia, depósito y pendientes.
// Ya NO corre en el build de la web: lo que arma es privado. La API lo usa (src/programacion/oficina-documentos.js) y lo entrega solo con clave.
// Todo se deduce de los documentos con reglas fijas, sin IA: si un documento cambia, el juego cambia en el próximo deploy.
// Lo que depende de la base (flujo semanal, charla, lo que se marca en el juego) lo trae el juego en vivo de /api/programacion/oficina.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const iso = (dmy) => dmy.split("/").reverse().join("-");
const leer = (ruta) => readFileSync(ruta, "utf8");
const listar = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

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
  const primera = (t) => { const c = t.replace(/\*/g, "").trim(); const f = c.split(/(?<=\.)\s/)[0]; return f.length > 110 ? `${f.slice(0, 107).trim()}…` : f; };
  const pend = /^## Por confirmar\s*\n((?:- .+\n?)+)/m.exec(md)?.[1].split("\n").filter((l) => l.startsWith("- ")).map((l) => ({ sala: "deposito", t: `Confirmar: ${primera(l.slice(2))}` })) ?? [];
  return { deposito, agenda, pendientes: pend };
}

// El flujo de la semana como texto legible: un renglón por publicación
export function textoDelPlan(plan, nombre) {
  const sal = [`# Flujo de la semana del ${nombre}`, ""];
  for (const d of plan.dias ?? []) sal.push(`- ${d.fecha} · ${d.formato}: ${d.contenido}`);
  return sal.join("\n");
}

// Lunes a las 8: el Estratega arma el plan solo. Se calcula la próxima fecha desde "hoy" en el navegador, no acá.
export function generar({ raiz, destino, hoy = new Date().toISOString().slice(0, 10) }) {
  const docs = join(raiz, "docs");
  const D = { actualizado: hoy, agenda: [], pendientes: [], deposito: {}, bot: { modo: "simulación", publica: false }, sistema: { tests: "sin datos", evals: "sin datos" }, recepcion: { productos: "" }, estrategia: {}, planTexto: "", informeTexto: "" };

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

  // Solo valen los flujos nuevos (con "dias"): los planes viejos con piezas ya no se muestran
  const planes = listar(join(docs, "planes")).filter((n) => /^plan-\d{4}-\d{2}-\d{2}\.json$/.test(n));
  for (const plan of planes.reverse()) {
    const contenido = JSON.parse(leer(join(docs, "planes", plan)));
    if (!Array.isArray(contenido.dias)) continue;
    D.estrategia.plan = plan.slice(5, 15);
    D.planTexto = textoDelPlan(contenido, D.estrategia.plan);
    break;
  }
  const informe = listar(join(docs, "investigacion")).filter((n) => /^informe-\d{4}-\d{2}-\d{2}\.md$/.test(n)).at(-1);
  if (informe) {
    D.estrategia.informe = informe.slice(8, 18);
    D.informeTexto = leer(join(docs, "investigacion", informe));
  }
  D.agenda.sort((a, b) => a.f.localeCompare(b.f));
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, "datos.json"), JSON.stringify({ D }));
  return { D };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = resolve(fileURLToPath(import.meta.url), "..", "..");
  const { D } = generar({ raiz, destino: join(tmpdir(), "vow-oficina-prueba") });
  console.log(`Oficina: ${D.pendientes.length} pendientes, ${D.agenda.length} fechas.`);
}
