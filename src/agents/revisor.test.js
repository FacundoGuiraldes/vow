import test from "node:test";
import assert from "node:assert/strict";
import { revisarPlan } from "./revisor.js";

const SEMANA = "2026-10-26";
const pieza = (cambios = {}) => ({
  fecha: "2026-10-27",
  formato: "reel",
  pilar: "proceso",
  gancho: "Una cosa por vez.",
  ganchos_alternativos: ["Hecho con calma. Hecho bien.", "Cada detalle cuenta.", "Lo simple se sostiene."],
  guion: "Texto sobre fondo hueso, una frase por vez.",
  texto_en_pantalla: ["Una cosa por vez.", "Sin apuro. Sin ruido."],
  epigrafe: "Se hace despacio y se hace bien. Anotate en la lista: link en la bio.",
  palabras_clave: ["proceso"],
  cta: "Anotate en la lista de espera.",
  recursos: ["Diseño en colores de marca"],
  justificacion: "Muestra el criterio de trabajo sin mostrar producto.",
  ...cambios,
});
const plan = (piezas = [pieza()]) => ({ resumen: "Plan de prueba.", piezas });

// Sin archivos reales: el cerebro, las referencias y las piezas definidas se leen de estos falsos
const contexto = (definidas = {}) => ({
  listar: async (carpeta) => (String(carpeta).includes("piezas") ? Object.keys(definidas) : []),
  leer: async (ruta) => definidas[String(ruta).split("/").pop()] ?? "CONTENIDO",
});

test("un plan que cumple las reglas se aprueba", async () => {
  const r = await revisarPlan(plan(), { semanaInicio: SEMANA, ...contexto() });
  assert.equal(r.aprobada, true);
  assert.deepEqual(r.problemas, []);
});

test("un plan editado a mano con una palabra prohibida se rechaza y dice cuál", async () => {
  const editado = plan([pieza({ gancho: "Dominá la barra." })]);
  const r = await revisarPlan(editado, { semanaInicio: SEMANA, ...contexto() });
  assert.equal(r.aprobada, false);
  assert.ok(r.problemas.some((p) => p.includes("barra")), r.problemas.join(" | "));
});

test("una pieza ya definida que apareció después choca con el plan (mismo formato y pilar en la semana)", async () => {
  const definidas = { "2026-10-28-reel-proceso.md": "# Reel · 28/10/2026 · pilar proceso\n\n## Láminas\n1. Otra frase distinta\n" };
  const r = await revisarPlan(plan(), { semanaInicio: SEMANA, ...contexto(definidas) });
  assert.equal(r.aprobada, false);
  assert.ok(r.problemas.some((p) => p.includes("ya definida")), r.problemas.join(" | "));
});

test("las piezas fuera de la semana indicada se rechazan", async () => {
  const r = await revisarPlan(plan([pieza({ fecha: "2026-11-20" })]), { semanaInicio: SEMANA, ...contexto() });
  assert.equal(r.aprobada, false);
});

test("no revisa por la cantidad pedida si no se la indican: usa la que trae el plan", async () => {
  const tres = plan([pieza({ fecha: "2026-10-26", pilar: "proceso" }), pieza({ fecha: "2026-10-28", formato: "carrusel", pilar: "promesa", gancho: "Cumplí lo pactado.", texto_en_pantalla: ["Cumplí lo pactado."] }), pieza({ fecha: "2026-10-30", formato: "imagen", pilar: "lanzamiento", gancho: "Lo que viene se sostiene.", texto_en_pantalla: ["Lo que viene se sostiene."] })]);
  const r = await revisarPlan(tres, { semanaInicio: SEMANA, ...contexto() });
  assert.ok(!r.problemas.some((p) => p.includes("Se pidieron")), r.problemas.join(" | "));
});

test("un plan vacío o roto no explota: se rechaza", async () => {
  assert.equal((await revisarPlan(null, { semanaInicio: SEMANA, ...contexto() })).aprobada, false);
  assert.equal((await revisarPlan({ resumen: "x", piezas: [] }, { semanaInicio: SEMANA, ...contexto() })).aprobada, false);
});
