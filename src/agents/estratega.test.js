import test from "node:test";
import assert from "node:assert/strict";
import { planificarSemana, validarPlan, MAX_TOKENS_ESTRATEGA, construirSistema, leerUltimoInforme, extraerGanchosConocidos, HERRAMIENTA_PLAN, PALABRAS_MAXIMAS_GANCHO } from "./estratega.js";
import { revisarReglas } from "./reglas-marca.js";

const SEMANA = "2026-10-19";

// Una pieza que cumple todas las reglas, para modificarla en cada caso
const piezaValida = (cambios = {}) => ({
  fecha: "2026-10-20",
  formato: "reel",
  pilar: "promesa",
  gancho: "Una promesa para vos.",
  ganchos_alternativos: ["Prometé poco. Cumplí todo.", "Tu firma no se negocia.", "Lo escrito se cumple.", "Una línea. Un compromiso."],
  guion: "Texto sobre fondo hueso. Cada línea aparece sola, sin música fuerte.",
  texto_en_pantalla: ["Una promesa para vos.", "La escribís vos. Nadie más la lee."],
  epigrafe: "Es lo que sostiene todo lo demás. Anotate en la lista: link en la bio.",
  palabras_clave: ["promesa", "constancia", "entrenar"],
  cta: "Anotate en la lista de espera.",
  recursos: ["Diseño en colores de marca"],
  justificacion: "Presenta la idea central de la marca sin mostrar producto, que todavía no existe.",
  ...cambios,
});

const planValido = (piezas = [piezaValida()]) => ({ resumen: "Semana de presentación de la idea central.", piezas });

// Cliente falso: responde lo que le pidamos y guarda el pedido que recibió
const clienteFalso = (input, usage = { input_tokens: 1200, output_tokens: 800 }) => {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (pedido) => {
        pedidos.push(pedido);
        // Igual que la API real con Sonnet 5.5: no acepta forzar una herramienta
        if (["tool", "any"].includes(pedido.tool_choice?.type)) {
          throw new Error('400 tool_choice: type "tool" and "any" are not supported for this model.');
        }
        return {
          content: input === null ? [{ type: "text", text: "hola" }] : [{ type: "tool_use", id: "t1", name: "proponer_plan", input }],
          usage,
        };
      },
    },
  };
};

const leerFalso = async (ruta) => (String(ruta).includes("cerebro") ? "CEREBRO-DE-PRUEBA" : "REFERENCIAS-DE-PRUEBA");
const pedido = { semanaInicio: SEMANA, fase: "base", recursos: { producto: false, gente: false } };

test("un plan válido se acepta y informa cuántos tokens usó", async () => {
  const cliente = clienteFalso(planValido());
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
  assert.equal(r.plan.piezas.length, 1);
  assert.deepEqual(r.uso, { entrada: 1200, salida: 800 });
});

test("le pide el formato con la herramienta en modo auto (Sonnet 5.5 no acepta forzarla) y le pasa la marca y las referencias", async () => {
  const cliente = clienteFalso(planValido());
  await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  const enviado = cliente.pedidos[0];
  // La API real rechaza "tool" y "any" con este modelo (error 400): tiene que ser "auto"
  assert.deepEqual(enviado.tool_choice, { type: "auto" });
  assert.match(enviado.messages[0].content, /llamando a la herramienta proponer_plan/);
  assert.equal(enviado.tools[0].name, "proponer_plan");
  assert.match(enviado.system, /CEREBRO-DE-PRUEBA/);
  assert.match(enviado.system, /REFERENCIAS-DE-PRUEBA/);
  assert.match(enviado.messages[0].content, /2026-10-19/);
  assert.match(enviado.messages[0].content, /producto físico: no/);
});

test("el sistema lee los archivos reales de marca", async () => {
  const { texto: sistema } = await construirSistema();
  assert.match(sistema, /Cerebro de marca/);
  assert.match(sistema, /Vanquish/);
});

test("si la respuesta no trae el plan en el formato esperado, reintenta una vez y después lo descarta", async () => {
  const cliente = clienteFalso(null);
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, false);
  assert.equal(r.plan, null);
  assert.match(r.errores[0], /formato esperado/);
  assert.equal(cliente.pedidos.length, 2, "un intento y un reintento");
  assert.deepEqual(r.uso, { entrada: 2400, salida: 1600 }, "se suma el gasto de los dos intentos");
});

test("si la primera respuesta es texto y la segunda trae el plan, se acepta", async () => {
  const respuestas = [
    { content: [{ type: "text", text: "Acá va el plan..." }], usage: { input_tokens: 100, output_tokens: 50 } },
    { content: [{ type: "tool_use", id: "t2", name: "proponer_plan", input: planValido() }], usage: { input_tokens: 150, output_tokens: 700 } },
  ];
  const cliente = { messages: { create: async () => respuestas.shift() } };
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.uso, { entrada: 250, salida: 750 });
});

test("un plan sin piezas o con campos que faltan se rechaza", () => {
  assert.equal(validarPlan({ resumen: "x", piezas: [] }, { semanaInicio: SEMANA }).ok, false);
  const sinGancho = validarPlan(planValido([piezaValida({ gancho: "" })]), { semanaInicio: SEMANA });
  assert.equal(sinGancho.ok, false);
  assert.match(sinGancho.errores.join(" "), /falta gancho/);
});

test("rechaza formato o pilar inventados y fechas fuera de la semana", () => {
  const { ok, errores } = validarPlan(
    planValido([piezaValida({ formato: "tiktok", pilar: "humor", fecha: "2026-10-30" })]),
    { semanaInicio: SEMANA }
  );
  assert.equal(ok, false);
  assert.match(errores.join(" "), /formato inválido/);
  assert.match(errores.join(" "), /pilar inválido/);
  assert.match(errores.join(" "), /fuera de la semana/);
});

test("rechaza una pieza que rompe las reglas de marca", () => {
  const { ok, errores } = validarPlan(
    planValido([piezaValida({ gancho: "Sin excusas, quemá grasa", cta: "Comprá ya" })]),
    { semanaInicio: SEMANA }
  );
  assert.equal(ok, false);
  assert.match(errores.join(" "), /motivación vacía/);
  assert.match(errores.join(" "), /promesa de resultados físicos/);
  assert.match(errores.join(" "), /anotarse en la lista/);
});

test("rechaza cifras que no están en los datos cargados", () => {
  const { ok, errores } = validarPlan(
    planValido([piezaValida({ epigrafe: "Probamos 5 straps hasta que cedan. Anotate en la lista." })]),
    { semanaInicio: SEMANA }
  );
  assert.equal(ok, false);
  assert.match(errores.join(" "), /cifra "5"/);
});

test("no deja mostrar producto ni gente si todavía no hay", () => {
  const sinProducto = validarPlan(planValido([piezaValida({ pilar: "producto en uso" })]), {
    semanaInicio: SEMANA,
    recursos: { producto: false },
  });
  assert.match(sinProducto.errores.join(" "), /todavía no hay producto/);

  const conProducto = validarPlan(planValido([piezaValida({ pilar: "producto en uso" })]), {
    semanaInicio: SEMANA,
    recursos: { producto: true },
  });
  assert.equal(conProducto.ok, true);

  const sinGente = validarPlan(planValido([piezaValida({ pilar: "gente que entrena" })]), { semanaInicio: SEMANA });
  assert.match(sinGente.errores.join(" "), /no hay personas confirmadas/);
});

test("rechaza más de 5 piezas en la semana", () => {
  const piezas = Array.from({ length: 6 }, () => piezaValida());
  const { ok, errores } = validarPlan(planValido(piezas), { semanaInicio: SEMANA });
  assert.equal(ok, false);
  assert.match(errores.join(" "), /más de 5 piezas/);
});

test("un plan inválido devuelve los errores y no entrega el plan", async () => {
  const cliente = clienteFalso(planValido([piezaValida({ gancho: "Sin excusas" })]));
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, false);
  assert.equal(r.plan, null);
  assert.ok(r.propuesta, "se conserva la propuesta para poder mirarla");
  assert.match(r.errores.join(" "), /motivación vacía/);
});

test("exige una fecha de inicio válida y un cliente", async () => {
  await assert.rejects(() => planificarSemana({ ...pedido, semanaInicio: "mañana" }, { cliente: clienteFalso({}) }), /AAAA-MM-DD/);
  await assert.rejects(() => planificarSemana(pedido, {}), /cliente/);
});

test("acepta el gancho aprobado por Facundo", () => {
  const r = validarPlan(planValido([piezaValida({ gancho: "Escribí tu promesa. Después cumplila." })]), { semanaInicio: SEMANA });
  assert.equal(r.ok, true, r.errores.join(" | "));
});

test("rechaza los ganchos que Facundo descartó (tutorial y anunciar lo que falta)", () => {
  const tutorial = validarPlan(planValido([piezaValida({ gancho: "Cómo escribir una promesa que puedas cumplir." })]), { semanaInicio: SEMANA });
  assert.match(tutorial.errores.join(" "), /suena a tutorial/);

  const falta = validarPlan(planValido([piezaValida({ gancho: "Todavía no hay prenda para mostrarte. Hay una idea." })]), { semanaInicio: SEMANA });
  assert.match(falta.errores.join(" "), /anuncia lo que falta/);
});

test("rechaza ganchos con tono de lista de consejos", () => {
  for (const gancho of ["5 tips para entrenar", "Tips para empezar", "Guía para tu promesa"]) {
    const r = validarPlan(planValido([piezaValida({ gancho })]), { semanaInicio: SEMANA });
    assert.match(r.errores.join(" "), /suena a tutorial|cifra/, gancho);
  }
});

test("un gancho largo no es un gancho fuerte: máximo 12 palabras", () => {
  const largo = "Escribí una promesa para vos y para nadie más porque nadie la va a leer jamás";
  const r = validarPlan(planValido([piezaValida({ gancho: largo })]), { semanaInicio: SEMANA });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /palabras \(máximo 12\)/);
});

test("respeta la cantidad de piezas pedida (por defecto 2)", () => {
  const tres = planValido([
    piezaValida(),
    piezaValida({ fecha: "2026-10-21", pilar: "proceso" }),
    piezaValida({ fecha: "2026-10-22", pilar: "lanzamiento" }),
  ]);
  const porDefecto = validarPlan(tres, { semanaInicio: SEMANA });
  assert.match(porDefecto.errores.join(" "), /Se pidieron 2 piezas y el plan trae 3/);
  assert.equal(validarPlan(tres, { semanaInicio: SEMANA, piezas: 3 }).ok, true);
});

test("le informa a la IA cuántas piezas pedir", async () => {
  const cliente = clienteFalso(planValido());
  await planificarSemana({ ...pedido, piezas: 1 }, { cliente, leer: leerFalso, listar: async () => [] });
  assert.match(cliente.pedidos[0].messages[0].content, /Cantidad de piezas: 1/);
  const porDefecto = clienteFalso(planValido());
  await planificarSemana(pedido, { cliente: porDefecto, leer: leerFalso, listar: async () => [] });
  assert.match(porDefecto.pedidos[0].messages[0].content, /Cantidad de piezas: 2/);
});

test("las instrucciones incluyen el estilo de ganchos de la marca", async () => {
  const { texto: sistema } = await construirSistema();
  assert.match(sistema, /Fuerza y compromiso/);
  assert.match(sistema, /Escribí tu promesa\. Después cumplila\./);
  assert.match(sistema, /Descartados por Facundo/);
});

// --- Ganchos alternativos, ganchos conocidos y variedad ---
const conocidosReales = async () => {
  const { cerebro } = await construirSistema();
  return extraerGanchosConocidos(cerebro);
};

test("lee del cerebro de marca los ganchos aprobados, pendientes y descartados", async () => {
  const { aprobados, conocidos } = await conocidosReales();
  assert.equal(aprobados.length, 8);
  assert.ok(aprobados.includes("Cumplite a vos primero"));
  assert.ok(aprobados.includes("Para los que cumplen"));
  assert.ok(!aprobados.includes("Escribí tu promesa. Después cumplila."), "pasó a descartados");
  assert.ok(aprobados.includes("Firmá lo que vas a sostener"));
  assert.ok(conocidos.includes("Nadie te está mirando. Entrená igual."), "los descartados también cuentan como conocidos");
  assert.ok(conocidos.length > aprobados.length);
});

test("los ganchos aprobados cumplen las reglas del código (marca y código no se contradicen)", async () => {
  const { aprobados } = await conocidosReales();
  for (const gancho of aprobados) {
    assert.deepEqual(revisarReglas(gancho), [], gancho);
    assert.ok(gancho.trim().split(/\s+/).length <= PALABRAS_MAXIMAS_GANCHO, gancho);
  }
});

test("rechaza ganchos alternativos que copian un ejemplo del cerebro de marca", async () => {
  const { conocidos } = await conocidosReales();
  const plan = planValido([piezaValida({ ganchos_alternativos: ["Para los que cumplen.", "Tu firma no se negocia.", "Lo escrito se cumple."] })]);
  const r = validarPlan(plan, { semanaInicio: SEMANA, ganchosConocidos: conocidos });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(" "), /copia un ejemplo del cerebro de marca/);
});

test("pide al menos 3 alternativos, sin repetidos y que cumplan las reglas", () => {
  const pocos = validarPlan(planValido([piezaValida({ ganchos_alternativos: ["Uno solo."] })]), { semanaInicio: SEMANA });
  assert.match(pocos.errores.join(" "), /al menos 3 ganchos alternativos/);

  const repetido = validarPlan(planValido([piezaValida({ ganchos_alternativos: ["Tu firma no se negocia.", "tu firma no se negocia", "Lo escrito se cumple."] })]), { semanaInicio: SEMANA });
  assert.match(repetido.errores.join(" "), /repetido/);

  const malo = validarPlan(planValido([piezaValida({ ganchos_alternativos: ["Sin excusas, a entrenar", "Cómo cumplir una promesa", "Lo escrito se cumple."] })]), { semanaInicio: SEMANA });
  assert.match(malo.errores.join(" "), /motivación vacía/);
  assert.match(malo.errores.join(" "), /suena a tutorial/);
});

test("el gancho principal puede ser uno aprobado, pero no más de uno por plan", async () => {
  const { conocidos } = await conocidosReales();
  const uno = planValido([
    piezaValida({ gancho: "Para los que cumplen" }),
    piezaValida({ fecha: "2026-10-22", pilar: "proceso", gancho: "Firmá con vos. Cumplí." }),
  ]);
  assert.equal(validarPlan(uno, { semanaInicio: SEMANA, ganchosConocidos: conocidos }).ok, true);

  const dos = planValido([
    piezaValida({ gancho: "Para los que cumplen" }),
    piezaValida({ fecha: "2026-10-22", pilar: "proceso", gancho: "Escribí tu promesa. Después cumplila." }),
  ]);
  const r = validarPlan(dos, { semanaInicio: SEMANA, ganchosConocidos: conocidos });
  assert.match(r.errores.join(" "), /Más de un gancho principal sale de la lista/);
});

test("con 2 piezas, los pilares tienen que ser distintos", () => {
  const dosIguales = planValido([piezaValida(), piezaValida({ fecha: "2026-10-22" })]);
  const r = validarPlan(dosIguales, { semanaInicio: SEMANA });
  assert.match(r.errores.join(" "), /pilar "promesa" aparece 2 veces/);
});

test("las instrucciones piden ganchos nuevos y alternativos", async () => {
  const { texto } = await construirSistema();
  assert.match(texto, /A lo sumo UNO de los ganchos principales/);
  assert.match(texto, /4 alternativos/);
});

test("rechaza piezas que explican la marca por dentro, pero lo deja en el guion", () => {
  const dentro = validarPlan(planValido([piezaValida({ texto_en_pantalla: ["Nuestra paleta: beige y bordó."] })]), { semanaInicio: SEMANA });
  assert.equal(dentro.ok, false);
  assert.ok(dentro.errores.some((e) => e.includes("explica la marca por dentro")));
  const enGuion = validarPlan(planValido([piezaValida({ guion: "Cada slide muestra un color de la paleta, con Unbounded para el título." })]), { semanaInicio: SEMANA });
  assert.equal(enGuion.ok, true, enGuion.errores.join(" | "));
});

test("rechaza ganchos alternativos con elementos del gimnasio y recursos de papel y lapicera", () => {
  const gym = validarPlan(planValido([piezaValida({ ganchos_alternativos: ["Prometé poco. Cumplí todo.", "Tu palabra. Después la barra.", "Una línea. Un compromiso.", "Lo escrito se cumple."] })]), { semanaInicio: SEMANA });
  assert.ok(gym.errores.some((e) => e.includes("nombra elementos del gimnasio")));
  const papel = validarPlan(planValido([piezaValida({ recursos: ["Lapicera negra", "Cartulina beige"] })]), { semanaInicio: SEMANA });
  assert.ok(papel.errores.some((e) => e.includes("promesa en papel en los recursos")));
});

test("las instrucciones dicen que la promesa es de uno mismo y que no se nombran elementos del gym", async () => {
  const { texto } = await construirSistema(leerFalso, { listar: async () => [] });
  assert.match(texto, /a sí misma y cumple/);
  assert.match(texto, /elementos del gimnasio/);
  assert.match(texto, /le habla a quien la mira/i);
});

test("un guion que aclara qué no aparece se acepta; uno que lo pide se rechaza", () => {
  const bien = validarPlan(planValido([piezaValida({ guion: "Solo texto sobre fondo hueso. No aparece papel ni lapicera, y no se habla de lo que todavía no hay." })]), { semanaInicio: SEMANA });
  assert.equal(bien.ok, true, bien.errores.join(" | "));
  const mal = validarPlan(planValido([piezaValida({ guion: "Unas manos escriben con lapicera sobre papel." })]), { semanaInicio: SEMANA });
  assert.ok(mal.errores.some((e) => e.includes("promesa en papel")));
});

test("un guion que numera las láminas no se rechaza por cifras", () => {
  const guion = "Carrusel tipográfico. Lámina 1: el gancho. Lámina 2: una frase. Lámina 3: cierre con la invitación a la lista.";
  const r = validarPlan(planValido([piezaValida({ guion })]), { semanaInicio: SEMANA });
  assert.equal(r.ok, true, r.errores.join(" | "));
  const inventada = validarPlan(planValido([piezaValida({ guion: "Lámina 1: mostramos 5 straps." })]), { semanaInicio: SEMANA });
  assert.ok(inventada.errores.some((e) => e.includes('la cifra "5"')));
});

test("si hay un informe del Investigador, el Estratega lo lee y se apoya en él sin que gane sobre la marca", async () => {
  const listar = async () => ["informe-2026-10-12.md", "informe-2026-10-19.md", "informe-2026-10-20-simulado.md", "datos-2026-10-19.json", "hipotesis.json"];
  const leidos = [];
  const leer = async (ruta) => {
    leidos.push(String(ruta));
    return String(ruta).includes("informe") ? "HALLAZGOS-DE-PRUEBA" : "CONTENIDO";
  };
  const { texto } = await construirSistema(leer, { listar });
  assert.match(texto, /=== INVESTIGACIÓN DE MERCADO \(informe-2026-10-19\.md\) ===\nHALLAZGOS-DE-PRUEBA/);
  assert.ok(leidos.some((r) => r.endsWith("informe-2026-10-19.md")), "lee el más reciente");
  assert.ok(!leidos.some((r) => r.includes("simulado") || r.includes("2026-10-12")), "ignora el simulado y los viejos");
  assert.match(texto, /nunca gana sobre el cerebro de marca/);
  assert.match(texto, /no uses sus cifras en los textos/);
});

test("sin informe (o si no se puede leer), el Estratega trabaja como antes", async () => {
  const sinNada = await construirSistema(leerFalso, { listar: async () => ["hipotesis.json"] });
  assert.ok(!sinNada.texto.includes("=== INVESTIGACIÓN DE MERCADO"));
  const roto = await construirSistema(async (ruta) => { if (String(ruta).includes("informe")) throw new Error("no se puede leer"); return "CONTENIDO"; }, { listar: async () => ["informe-2026-10-19.md"] });
  assert.ok(!roto.texto.includes("=== INVESTIGACIÓN DE MERCADO"));
  const sinCarpeta = await leerUltimoInforme({ listar: async () => { throw new Error("ENOENT"); } });
  assert.equal(sinCarpeta, null);
});

test("el informe real del repo llega al Estratega", async () => {
  const { texto } = await construirSistema();
  assert.match(texto, /=== INVESTIGACIÓN DE MERCADO \(informe-\d{4}-\d{2}-\d{2}\.md\) ===/);
  assert.match(texto, /## Hallazgos/);
});

const definida = { nombre: "2026-10-27-carrusel-promesa.md", formato: "carrusel", fecha: "2026-10-27", pilar: "promesa", frases: ["Cumplite a vos primero", "Lo que firmás con vos no se rompe"], texto: "# Carrusel · 27/10/2026 · pilar promesa" };

test("no repite el formato y el pilar de una pieza ya definida en fechas cercanas", () => {
  const repetida = validarPlan(planValido([piezaValida({ fecha: "2026-10-28", formato: "carrusel", pilar: "promesa" })]), { semanaInicio: "2026-10-26", piezasDefinidas: [definida] });
  assert.ok(repetida.errores.some((e) => e.includes("ya definida del 2026-10-27")));
  const otroPilar = validarPlan(planValido([piezaValida({ fecha: "2026-10-28", formato: "carrusel", pilar: "proceso" })]), { semanaInicio: "2026-10-26", piezasDefinidas: [definida] });
  assert.ok(!otroPilar.errores.some((e) => e.includes("ya definida")));
  const otraSemana = validarPlan(planValido([piezaValida({ fecha: "2026-11-09", formato: "carrusel", pilar: "promesa" })]), { semanaInicio: "2026-11-09", piezasDefinidas: [definida] });
  assert.ok(!otraSemana.errores.some((e) => e.includes("ya definida")));
});

test("no reutiliza las frases de una pieza ya definida, ni como gancho, alternativo ni texto en pantalla", () => {
  const principal = validarPlan(planValido([piezaValida({ gancho: "Cumplite a vos primero" })]), { semanaInicio: SEMANA, piezasDefinidas: [definida] });
  assert.ok(principal.errores.some((e) => e.includes("reutiliza una frase")));
  const alternativo = validarPlan(planValido([piezaValida({ ganchos_alternativos: ["Prometé poco. Cumplí todo.", "Tu firma no se negocia.", "Lo que firmás con vos no se rompe", "Una línea. Un compromiso."] })]), { semanaInicio: SEMANA, piezasDefinidas: [definida] });
  assert.ok(alternativo.errores.some((e) => e.includes("reutiliza una frase")));
  const enPantalla = validarPlan(planValido([piezaValida({ texto_en_pantalla: ["Cumplite a vos primero.", "Otra"] })]), { semanaInicio: SEMANA, piezasDefinidas: [definida] });
  assert.ok(enPantalla.errores.some((e) => e.includes("reutiliza una frase")));
});

test("el Estratega conoce las piezas definidas: están en las instrucciones y en el pedido de esa semana", async () => {
  const listar = async (carpeta) => (String(carpeta).includes("piezas") ? ["2026-10-27-carrusel-promesa.md"] : []);
  const leer = async (ruta) => (String(ruta).includes("carrusel-promesa") ? "# Carrusel · 27/10/2026 · pilar promesa\n\n## Láminas\n1. Cumplite a vos primero\n" : "CONTENIDO");
  const { texto } = await construirSistema(leer, { listar });
  assert.match(texto, /=== PIEZAS YA DEFINIDAS ===\n# Carrusel · 27\/10\/2026/);
  assert.match(texto, /no repitas su idea/);
  const cliente = clienteFalso(planValido([piezaValida({ fecha: "2026-10-30", formato: "reel", pilar: "proceso", gancho: "Construí sin que te vean" })]));
  const r = await planificarSemana({ semanaInicio: "2026-10-26", fase: "base", recursos: {}, piezas: 1 }, { cliente, leer, listar });
  assert.ok(cliente.pedidos[0].messages[0].content.includes("Esa semana ya hay definidas: carrusel del 2026-10-27 (pilar promesa)"));
  assert.equal(r.ok, true, (r.errores ?? []).join(" | "));
});

test("una propuesta que repite una pieza definida se rechaza al planificar", async () => {
  const listar = async (carpeta) => (String(carpeta).includes("piezas") ? ["2026-10-27-carrusel-promesa.md"] : []);
  const leer = async (ruta) => (String(ruta).includes("carrusel-promesa") ? "# Carrusel · 27/10/2026 · pilar promesa\n\n## Láminas\n1. Cumplite a vos primero\n" : "CONTENIDO");
  const cliente = clienteFalso(planValido([piezaValida({ fecha: "2026-10-28", formato: "carrusel", pilar: "promesa" })]));
  const r = await planificarSemana({ semanaInicio: "2026-10-26", fase: "base", recursos: {}, piezas: 1 }, { cliente, leer, listar });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes("ya definida")));
});

test("un guion con pasos numerados como 1) 2) 3) no se rechaza por cifras", () => {
  const guion = "Reel corto de texto. 1) Aparece el gancho. 2) Entra la segunda frase. 3) Tercera frase. 4) Cierre sobre fondo hueso.";
  const r = validarPlan(planValido([piezaValida({ guion })]), { semanaInicio: SEMANA });
  assert.equal(r.ok, true, r.errores.join(" | "));
});

// Cliente que contesta una lista de respuestas en orden (con su stop_reason) y guarda los pedidos
const clienteEnSecuencia = (respuestas) => {
  const pedidos = [];
  return {
    pedidos,
    messages: {
      create: async (pedido) => {
        pedidos.push(pedido);
        const r = respuestas[Math.min(pedidos.length - 1, respuestas.length - 1)];
        const content = r.texto ? [{ type: "text", text: "hola" }] : [{ type: "tool_use", id: "t1", name: "proponer_plan", input: r.input }];
        return { content, stop_reason: r.stop_reason ?? "tool_use", usage: { input_tokens: 100, output_tokens: r.salida ?? 50 } };
      },
    },
  };
};

test("pide espacio de sobra para el plan (más de 4096 tokens)", async () => {
  const cliente = clienteEnSecuencia([{ input: planValido() }]);
  await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(cliente.pedidos[0].max_tokens, MAX_TOKENS_ESTRATEGA);
  assert.ok(MAX_TOKENS_ESTRATEGA > 4096);
});

test("si la respuesta se corta por el límite de tokens, no valida el plan a medias: reintenta con el doble de espacio", async () => {
  // Lo que llega cortado no tiene piezas: antes se informaba "El plan no tiene piezas", que despistaba
  const cliente = clienteEnSecuencia([{ input: { resumen: "plan a medias" }, stop_reason: "max_tokens", salida: MAX_TOKENS_ESTRATEGA }, { input: planValido(), salida: 3000 }]);
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, true);
  assert.equal(cliente.pedidos.length, 2);
  assert.equal(cliente.pedidos[1].max_tokens, MAX_TOKENS_ESTRATEGA * 2);
  assert.deepEqual(r.uso, { entrada: 200, salida: MAX_TOKENS_ESTRATEGA + 3000 }); // se cuenta lo gastado en los dos intentos
  assert.equal(cliente.pedidos[1].messages.length, 1); // no se reenvía la herramienta a medias
});

test("si se corta las dos veces, el error dice que se cortó (no 'no tiene piezas') y se informa el gasto", async () => {
  const cortado = { input: { resumen: "a medias" }, stop_reason: "max_tokens", salida: 8192 };
  const cliente = clienteEnSecuencia([cortado, cortado]);
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errores, ["La respuesta se cortó por el límite de tokens: el plan quedó incompleto."]);
  assert.equal(r.propuesta, undefined);
  assert.equal(r.uso.salida, 16384);
});

test("un plan que termina justo bien (stop_reason tool_use) no se reintenta", async () => {
  const cliente = clienteEnSecuencia([{ input: planValido() }]);
  await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(cliente.pedidos.length, 1);
});

test("el motivo del fallo es el del último intento: cortada una vez y después solo texto, no dice que se cortó", async () => {
  const cliente = clienteEnSecuencia([{ input: { resumen: "a medias" }, stop_reason: "max_tokens", salida: 8192 }, { texto: true }]);
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso, listar: async () => [] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errores, ["La respuesta no trajo el plan en el formato esperado."]);
});
