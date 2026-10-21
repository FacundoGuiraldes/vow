// Editor de piezas: Facundo responde a una pieza con lo que quiere cambiar ("pasalo al viernes", "otro gancho") y Claude
// devuelve la pieza completa con ese cambio. Pasa por las mismas reglas de marca que el Estratega (validarPlan):
// una edición que las rompe se rechaza y no se guarda.
import { HERRAMIENTA_PLAN, MODELO_ESTRATEGA, construirSistema, extraerGanchosConocidos, validarPlan, HORA_MINIMA_PUBLICACION, HORA_MAXIMA_PUBLICACION } from "../agents/estratega.js";

const MAX_TOKENS_EDICION = 4096;
const INTENTOS_MAXIMOS = 2;
const ITEM = HERRAMIENTA_PLAN.input_schema.properties.piezas.items;

export const HERRAMIENTA_EDICION = {
  name: "actualizar_pieza",
  description: "Devuelve la pieza completa, con el cambio pedido aplicado y todo lo demás igual.",
  input_schema: {
    type: "object",
    required: [...ITEM.required, "que_cambio"],
    properties: { ...ITEM.properties, que_cambio: { type: "string", description: "Una frase corta que cuenta qué cambiaste." } },
  },
};

// Valida una pieza editada con las mismas reglas que el Estratega (la usan el editor con Claude y el chat). Devuelve la lista de errores.
export function crearValidadorEdicion({ leer, listar } = {}) {
  let conocidos = null;
  return async function validarEdicion({ fila, pieza, hoy }) {
    if (!conocidos) ({ conocidos } = extraerGanchosConocidos((await construirSistema(leer, { listar })).cerebro));
    // Se permite lo que la pieza ya tenía: editar un texto no vuelve a discutir si había producto o gente
    const recursos = { producto: fila.pieza.pilar === "producto en uso", gente: fila.pieza.pilar === "gente que entrena" };
    const { errores } = validarPlan({ resumen: "edición", piezas: [pieza] }, { piezas: 1, recursos, ganchosConocidos: conocidos });
    if (typeof pieza.fecha === "string" && pieza.fecha < hoy) errores.push(`La fecha ${pieza.fecha} ya pasó.`);
    return errores;
  };
}

export function crearEditor({ cliente, modelo = MODELO_ESTRATEGA, leer, listar } = {}) {
  if (!cliente) throw new Error("Falta el cliente de Anthropic para el editor.");

  return {
    // Devuelve { ok, pieza, hora, queCambio, errores, uso }
    async editarPieza({ fila, instruccion, hoy }) {
      const { cerebro, texto } = await construirSistema(leer, { listar });
      const system = `${texto}

=== AHORA NO ARMÁS UN PLAN ===
Estás editando UNA pieza que ya existe. Aplicá solamente el cambio que pide Facundo y dejá todo lo demás igual. Las reglas de arriba siguen valiendo para lo que escribas. Podés cambiar la fecha o la hora si te lo pide (la hora, entre ${HORA_MINIMA_PUBLICACION} y ${HORA_MAXIMA_PUBLICACION}; la fecha, de hoy en adelante). Si el cambio rompe una regla de la marca, aplicá la versión más cercana que sí la cumpla y contalo en que_cambio. Respondé llamando a la herramienta actualizar_pieza con la pieza completa.`;

      const actual = { ...fila.pieza, fecha: fila.fecha, hora: fila.hora };
      const mensajes = [
        {
          role: "user",
          content: `Hoy es ${hoy}. Pieza actual:\n${JSON.stringify(actual, null, 2)}\n\nCambio pedido por Facundo: ${instruccion}\n\nRespondé llamando a la herramienta actualizar_pieza.`,
        },
      ];
      const uso = { entrada: 0, salida: 0 };
      let bloque = null;

      for (let intento = 1; intento <= INTENTOS_MAXIMOS && !bloque; intento++) {
        const respuesta = await cliente.messages.create({
          model: modelo,
          max_tokens: MAX_TOKENS_EDICION,
          system,
          messages: mensajes,
          tools: [HERRAMIENTA_EDICION],
          tool_choice: { type: "auto" },
        });
        uso.entrada += respuesta.usage?.input_tokens ?? 0;
        uso.salida += respuesta.usage?.output_tokens ?? 0;
        bloque = respuesta.stop_reason === "max_tokens" ? null : (respuesta.content?.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_EDICION.name) ?? null);
        if (!bloque) {
          mensajes.push({ role: "assistant", content: respuesta.content ?? [] });
          mensajes.push({ role: "user", content: "Tenés que responder llamando a la herramienta actualizar_pieza." });
        }
      }
      if (!bloque) return { ok: false, errores: ["La IA no devolvió la pieza en el formato esperado. Probá de nuevo."], uso };

      const { que_cambio: queCambio = "", ...pieza } = bloque.input;
      const { conocidos } = extraerGanchosConocidos(cerebro);
      // Se permite lo que la pieza ya tenía: editar un texto no vuelve a discutir si había producto o gente
      const recursos = { producto: fila.pieza.pilar === "producto en uso", gente: fila.pieza.pilar === "gente que entrena" };
      const { errores } = validarPlan({ resumen: "edición", piezas: [pieza] }, { piezas: 1, recursos, ganchosConocidos: conocidos });
      if (typeof pieza.fecha === "string" && pieza.fecha < hoy) errores.push(`La fecha ${pieza.fecha} ya pasó.`);
      if (errores.length) return { ok: false, errores, uso };
      return { ok: true, pieza, hora: pieza.hora ?? fila.hora, queCambio, errores: [], uso };
    },
  };
}
