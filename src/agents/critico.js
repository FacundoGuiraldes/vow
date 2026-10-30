// Crítico: segunda lectura de un plan que ya pasó las reglas duras. Las reglas duras dicen qué NO se puede hacer;
// el Crítico mide si la pieza es BUENA: si es concreta, si alguien se la mandaría a un amigo, si el gancho frena,
// si pide una sola cosa clara. Es el método "generar, criticar, mejorar": el Estratega corrige con la crítica en la mano.
// Solo puntúa y sugiere: no cambia nada por su cuenta.

export const CRITERIOS = {
  concrecion: "Se puede decir qué se ve en el primer segundo (un detalle, un color, una muestra, una pregunta con opciones). 1 = solo frases abstractas o de póster.",
  compartible: "Alguien se la mandaría a un amigo o la guardaría (Instagram pesa más los envíos y guardados que los likes). 1 = no da ninguna razón para compartirla ni guardarla.",
  gancho: "El gancho frena el scroll en 3 segundos y se entiende solo, sin contexto. 1 = suena a eslogan o no dice nada.",
  hacer_posible: "Facundo la puede hacer esta semana con lo que tiene (material_a_producir realista, sin producto que no existe). 1 = depende de algo que no hay.",
  marca: "Suena a VOW: sobrio, voseo, verdadero, sin teaser vacío ni tono de coaching. 1 = podría ser de cualquier marca motivacional.",
};
export const NOMBRES_CRITERIOS = Object.keys(CRITERIOS);
export const PUNTAJE_MINIMO_PROMEDIO = 3.5;
export const PUNTAJE_MINIMO_CRITERIO = 2;
const MAX_TOKENS_CRITICA = 3000;

export const HERRAMIENTA_CRITICA = {
  name: "evaluar_plan",
  description: "Puntúa cada pieza del plan de 1 a 5 en cada criterio y sugiere cómo mejorar las flojas.",
  input_schema: {
    type: "object",
    required: ["piezas"],
    properties: {
      piezas: {
        type: "array",
        items: {
          type: "object",
          required: [...NOMBRES_CRITERIOS, "mejora"],
          properties: {
            ...Object.fromEntries(NOMBRES_CRITERIOS.map((c) => [c, { type: "integer", minimum: 1, maximum: 5, description: CRITERIOS[c] }])),
            mejora: { type: "string", description: "Qué cambiar, concreto y accionable (qué mostrar, qué preguntar, cómo reescribir el gancho). Vacío si todas las notas son 4 o 5." },
          },
        },
      },
    },
  },
};

export const SISTEMA_CRITICO = `Sos el editor crítico de contenido de VOW, marca argentina de indumentaria y accesorios para entrenar, antes del lanzamiento y con una cuenta chica. Recibís un plan de la semana que ya cumple las reglas duras de la marca. Tu trabajo es decir, sin condescendencia, qué tan bueno es.

Puntuá cada pieza de 1 a 5 en cada criterio (${NOMBRES_CRITERIOS.join(", ")}):
${NOMBRES_CRITERIOS.map((c) => `- ${c}: ${CRITERIOS[c]}`).join("\n")}

Además de los criterios, tené presente la psicología de marketing de VOW: la pieza tiene que dar algo antes de pedir (un detalle, una observación que se reconoce, una pregunta útil), pedir UNA sola cosa, apoyarse en una prueba (algo que se ve) y no en adjetivos, y no usar urgencia, escasez, cifras ni prueba social que no sean reales. Una pieza que solo pide anotarse sin haber dado nada no pasa de 2 en compartible. Una pieza que se parece a "Atate el compromiso. Salí." o "Lo que firmás con vos no se rompe" es un póster: concreción y gancho no pasan de 2.

Sé exigente: un 5 es raro, un 3 es "pasable pero olvidable". Si una pieza es una frase sobre la promesa sobre un fondo liso, concreción y compartible no pasan de 2. En "mejora" escribí un cambio concreto (qué se ve, qué se pregunta, qué gancho probar), nunca "hacerlo más impactante". Respondé llamando a la herramienta evaluar_plan, con una entrada por pieza y en el mismo orden.`;

const promedio = (valores) => valores.reduce((a, b) => a + b, 0) / valores.length;

// Devuelve { ok, piezas: [{ promedio, puntajes, mejora, floja }], flojas: [índices], uso }
export async function criticarPlan(plan, { cliente, modelo, contexto = "" } = {}) {
  const uso = { entrada: 0, salida: 0 };
  if (!cliente || !Array.isArray(plan?.piezas) || plan.piezas.length === 0) return { ok: false, piezas: [], flojas: [], uso };
  const respuesta = await cliente.messages.create({
    model: modelo,
    max_tokens: MAX_TOKENS_CRITICA,
    system: SISTEMA_CRITICO,
    messages: [{ role: "user", content: `${contexto ? `Contexto: ${contexto}\n\n` : ""}Plan a evaluar:\n${JSON.stringify(plan, null, 2)}\n\nRespondé llamando a la herramienta evaluar_plan.` }],
    tools: [HERRAMIENTA_CRITICA],
    tool_choice: { type: "auto" },
  });
  uso.entrada += respuesta.usage?.input_tokens ?? 0;
  uso.salida += respuesta.usage?.output_tokens ?? 0;
  const bloque = respuesta.stop_reason === "max_tokens" ? null : respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_CRITICA.name);
  const lista = bloque?.input?.piezas;
  // Una crítica incompleta o con notas fuera de rango no se usa: mejor no criticar que criticar con datos rotos
  if (!Array.isArray(lista) || lista.length !== plan.piezas.length) return { ok: false, piezas: [], flojas: [], uso };
  const piezas = [];
  for (const item of lista) {
    const puntajes = Object.fromEntries(NOMBRES_CRITERIOS.map((c) => [c, item?.[c]]));
    if (!Object.values(puntajes).every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) return { ok: false, piezas: [], flojas: [], uso };
    const prom = promedio(Object.values(puntajes));
    const floja = prom < PUNTAJE_MINIMO_PROMEDIO || Object.values(puntajes).some((n) => n <= PUNTAJE_MINIMO_CRITERIO);
    piezas.push({ promedio: Number(prom.toFixed(2)), puntajes, mejora: String(item.mejora ?? "").trim(), floja });
  }
  return { ok: true, piezas, flojas: piezas.flatMap((p, i) => (p.floja ? [i] : [])), uso };
}

// Texto que se le devuelve al Estratega para que mejore solo las piezas flojas
export function pedidoDeMejora(critica) {
  const lineas = critica.flojas.map((i) => {
    const p = critica.piezas[i];
    const bajos = Object.entries(p.puntajes).filter(([, n]) => n <= 3).map(([c, n]) => `${c} ${n}/5`).join(", ");
    return `- Pieza ${i + 1} (promedio ${p.promedio}; flojo en: ${bajos || "general"}): ${p.mejora || "hacela más concreta"}`;
  });
  return `Un editor crítico leyó el plan y encontró piezas flojas:\n${lineas.join("\n")}\n\nReescribí el plan completo llamando de nuevo a proponer_plan: mejorá esas piezas con lo que pide la crítica (algo concreto que se vea, más compartible, un gancho que frene) y dejá las demás igual. Las reglas de la marca siguen valiendo.`;
}
