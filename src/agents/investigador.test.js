import test from "node:test";
import assert from "node:assert/strict";
import {
  analizarMercado,
  armarPedido,
  construirSistemaInvestigador,
  enlacesDeLosDatos,
  HERRAMIENTA_INFORME,
  informeAMarkdown,
  prepararDatos,
  validarInforme,
} from "./investigador.js";

const pub = (n, cambios = {}) => ({
  enlace: `https://www.instagram.com/reel/POST${n}/`,
  tipo: "reel",
  fecha: "2026-10-17T18:02:28+0000",
  likes: 1000 * n,
  comentarios: 10 * n,
  vistas: 50000 * n,
  reaccionesPorSeguidor: 0.0021564,
  vistasPorSeguidor: 0.0684321,
  primeraLinea: "New season. New routines.",
  palabras: 12,
  emojis: 0,
  hashtags: 1,
  ...cambios,
});

const datos = {
  fecha: "2026-10-19",
  cuentas: [
    { marca: "Gymshark", pais: "Reino Unido", usuario: "gymshark", seguidores: 8697137, porTipo: { reel: { cantidad: 3, medianaReaccionesPorSeguidor: 0.0021564, medianaVistasPorSeguidor: 0.0684321 } }, publicaciones: [pub(1), pub(2), pub(3)] },
    { marca: "Fuark", pais: "Argentina", usuario: "fuarkok", seguidores: 232775, porTipo: {}, publicaciones: [pub(4, { tipo: "carrusel", vistas: null })] },
  ],
};
const hipotesis = [
  { id: "a", nombre: "Idea A", descripcion: "…" },
  { id: "b", nombre: "Idea B", descripcion: "…" },
];
const enlacesConocidos = enlacesDeLosDatos(datos);
const e = (n) => `https://www.instagram.com/reel/POST${n}/`;

const informeValido = (cambios = {}) => ({
  resumen: "Los reels de la cuenta grande rinden más.",
  hallazgos: [{ titulo: "Reels", evidencia: "Mediana de 6,843 % de vistas sobre seguidores.", enlaces: [e(1)], confianza: "media" }],
  hipotesis: [
    { id: "a", veredicto: "respaldada", explicacion: "Los reels con texto corto rinden más.", enlaces: [e(1), e(2)], confianza: "baja" },
    { id: "b", veredicto: "no se puede medir con estos datos", explicacion: "Depende de la imagen, que la API no trae.", enlaces: [], confianza: "alta" },
  ],
  recomendaciones_para_estratega: ["Probar un video de texto sobre fondo negro."],
  limites: ["Muestra chica: 3 reels por cuenta."],
  ...cambios,
});

const clienteFalso = (input, usage = { input_tokens: 9000, output_tokens: 1500 }) => {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (pedido) => {
        pedidos.push(pedido);
        if (["tool", "any"].includes(pedido.tool_choice?.type)) throw new Error('400 tool_choice: type "tool" and "any" are not supported for this model.');
        return { content: input === null ? [{ type: "text", text: "hola" }] : [{ type: "tool_use", id: "t1", name: "entregar_informe", input }], usage };
      },
    },
  };
};
const leerFalso = async () => "CEREBRO-DE-PRUEBA";

test("un informe válido se acepta", () => {
  const r = validarInforme(informeValido(), { hipotesis, enlacesConocidos });
  assert.equal(r.ok, true, r.errores.join(" | "));
});

test("rechaza enlaces que no están en los datos (publicaciones inventadas)", () => {
  const inventado = informeValido({ hallazgos: [{ titulo: "x", evidencia: "y", enlaces: ["https://www.instagram.com/reel/INVENTADO/"], confianza: "alta" }] });
  const r = validarInforme(inventado, { hipotesis, enlacesConocidos });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((m) => m.includes("no está en los datos")));
});

test("un veredicto fuerte necesita al menos 2 publicaciones citadas, uno de 'no se puede medir' no", () => {
  const flojo = informeValido();
  flojo.hipotesis[0].enlaces = [e(1)];
  assert.ok(validarInforme(flojo, { hipotesis, enlacesConocidos }).errores.some((m) => m.includes("al menos 2")));
  const ok = validarInforme(informeValido(), { hipotesis, enlacesConocidos });
  assert.equal(ok.ok, true);
});

test("tiene que responder todas las hipótesis, una sola vez y solo las pedidas", () => {
  const falta = informeValido();
  falta.hipotesis.pop();
  assert.ok(validarInforme(falta, { hipotesis, enlacesConocidos }).errores.some((m) => m.includes('Falta responder la hipótesis "b"')));
  const repetida = informeValido();
  repetida.hipotesis.push({ ...repetida.hipotesis[0] });
  assert.ok(validarInforme(repetida, { hipotesis, enlacesConocidos }).errores.some((m) => m.includes("repetida")));
  const ajena = informeValido();
  ajena.hipotesis.push({ id: "zzz", veredicto: "mixta", explicacion: "x", enlaces: [e(1), e(2)], confianza: "baja" });
  assert.ok(validarInforme(ajena, { hipotesis, enlacesConocidos }).errores.some((m) => m.includes("no es una de las hipótesis pedidas")));
});

test("rechaza veredictos y confianzas inventados, hallazgos sin evidencia y falta de límites", () => {
  const malo = informeValido({ limites: [] });
  malo.hipotesis[0].veredicto = "genial";
  malo.hipotesis[1].confianza = "total";
  malo.hallazgos[0].enlaces = [];
  const { errores } = validarInforme(malo, { hipotesis, enlacesConocidos });
  assert.ok(errores.some((m) => m.includes("veredicto inválido")));
  assert.ok(errores.some((m) => m.includes("confianza inválida")));
  assert.ok(errores.some((m) => m.includes("sin publicaciones citadas")));
  assert.ok(errores.some((m) => m.includes("Faltan los límites")));
});

test("prepara los datos más cortos, en porcentajes y con la primera línea acotada", () => {
  const largo = { ...datos, cuentas: [{ ...datos.cuentas[0], publicaciones: [pub(1, { primeraLinea: "x".repeat(500) })] }] };
  const p = prepararDatos(largo);
  assert.equal(p.cuentas[0].publicaciones[0].primera_linea.length, 200);
  assert.equal(p.cuentas[0].publicaciones[0].vistas_pct_seguidores, 6.843);
  assert.equal(p.cuentas[0].porTipo.reel.mediana_reacciones_pct_seguidores, 0.216);
  assert.equal(prepararDatos(datos).cuentas[1].publicaciones[0].vistas, null);
});

test("las instrucciones incluyen las reglas de evidencia, los límites de los datos y la marca", async () => {
  const s = await construirSistemaInvestigador(leerFalso);
  assert.match(s, /Afirmá solo lo que los datos sostienen/);
  assert.match(s, /no se puede medir con estos datos/);
  assert.match(s, /incluyen las pagas/);
  assert.match(s, /la imagen, el sonido/);
  assert.match(s, /CEREBRO-DE-PRUEBA/);
  const pedido = armarPedido({ datos, hipotesis });
  assert.match(pedido, /"id":"a"/);
  assert.match(pedido, /POST1/);
});

test("analiza con la herramienta en modo auto, suma los tokens y devuelve el informe", async () => {
  const cliente = clienteFalso(informeValido());
  const r = await analizarMercado({ datos, hipotesis }, { cliente, leer: leerFalso });
  assert.equal(r.ok, true, (r.errores ?? []).join(" | "));
  assert.deepEqual(r.uso, { entrada: 9000, salida: 1500 });
  assert.equal(cliente.pedidos[0].tool_choice.type, "auto");
  assert.equal(cliente.pedidos[0].tools[0].name, HERRAMIENTA_INFORME.name);
});

test("si la IA contesta con texto reintenta una vez y después descarta", async () => {
  const cliente = clienteFalso(null);
  const r = await analizarMercado({ datos, hipotesis }, { cliente, leer: leerFalso });
  assert.equal(r.ok, false);
  assert.equal(cliente.pedidos.length, 2);
  assert.match(r.errores[0], /formato esperado/);
});

test("un informe con enlaces inventados no se entrega", async () => {
  const mal = informeValido({ hallazgos: [{ titulo: "x", evidencia: "y", enlaces: ["https://www.instagram.com/p/FALSO/"], confianza: "alta" }] });
  const r = await analizarMercado({ datos, hipotesis }, { cliente: clienteFalso(mal), leer: leerFalso });
  assert.equal(r.ok, false);
  assert.equal(r.informe, null);
  assert.ok(r.propuesta);
});

test("exige cliente y datos", async () => {
  await assert.rejects(analizarMercado({ datos, hipotesis }, {}), /Falta el cliente/);
  await assert.rejects(analizarMercado({ datos: { cuentas: [] }, hipotesis }, { cliente: clienteFalso({}) }), /No hay datos/);
});

test("el informe se puede leer en Markdown, con nombres de las ideas y enlaces", () => {
  const md = informeAMarkdown(informeValido(), { hipotesis, fecha: "2026-10-19" });
  assert.match(md, /^# Informe de investigación · 2026-10-19/);
  assert.match(md, /\*\*Idea A\*\*: respaldada \(confianza baja\)/);
  assert.match(md, /POST1/);
  assert.match(md, /## Límites/);
});
