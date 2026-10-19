import test from "node:test";
import assert from "node:assert/strict";
import { planificarSemana, validarPlan, construirSistema, extraerGanchosConocidos, HERRAMIENTA_PLAN, PALABRAS_MAXIMAS_GANCHO } from "./estratega.js";
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
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
  assert.equal(r.plan.piezas.length, 1);
  assert.deepEqual(r.uso, { entrada: 1200, salida: 800 });
});

test("le pide el formato con la herramienta en modo auto (Sonnet 5.5 no acepta forzarla) y le pasa la marca y las referencias", async () => {
  const cliente = clienteFalso(planValido());
  await planificarSemana(pedido, { cliente, leer: leerFalso });
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
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso });
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
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso });
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
  const r = await planificarSemana(pedido, { cliente, leer: leerFalso });
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
  await planificarSemana({ ...pedido, piezas: 1 }, { cliente, leer: leerFalso });
  assert.match(cliente.pedidos[0].messages[0].content, /Cantidad de piezas: 1/);
  const porDefecto = clienteFalso(planValido());
  await planificarSemana(pedido, { cliente: porDefecto, leer: leerFalso });
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
  assert.ok(aprobados.includes("Para los que cumplen"));
  assert.ok(aprobados.includes("Escribí tu promesa. Después cumplila."));
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
  const { texto } = await construirSistema(leerFalso);
  assert.match(texto, /a sí misma y cumple/);
  assert.match(texto, /elementos del gimnasio/);
  assert.match(texto, /le habla a quien la mira/i);
});
