// Cliente de Gemini (plan gratis de Google AI Studio) para el chat: manda la charla con las herramientas disponibles, ejecuta las
// que el modelo pide y repite hasta que responde con texto. `fetchFn` se inyecta para probar sin red. La clave viaja en un
// encabezado (nunca en la dirección) y no aparece en los errores.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const MODELO_CHAT_POR_DEFECTO = "gemini-3.6-flash";
export const PASOS_MAXIMOS = 6; // vueltas modelo → herramienta → modelo antes de cortar

export class ErrorLLM extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorLLM";
  }
}

const textoDe = (contenido) =>
  (contenido?.parts ?? [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();

// Fallas que se arreglan solas en segundos (red caída un instante, servidor de Google ocupado): se reintenta antes de molestar a Facundo
const ESPERAS_ENTRE_REINTENTOS = [800, 2500];
const SE_REINTENTA = new Set([500, 502, 503, 504]);
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export function crearLLMGemini({ apiKey, modelo = MODELO_CHAT_POR_DEFECTO, fetchFn = fetch, pasosMaximos = PASOS_MAXIMOS, esperar = dormir } = {}) {
  async function pedir(cuerpo) {
    if (!apiKey) throw new ErrorLLM("Falta GEMINI_API_KEY en el servicio.");
    let respuesta;
    for (let intento = 0; ; intento++) {
      let cayo = false;
      try {
        respuesta = await fetchFn(`${BASE}/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(cuerpo),
        });
        cayo = SE_REINTENTA.has(respuesta.status);
      } catch {
        cayo = true;
        respuesta = null;
      }
      if (!cayo) break;
      if (intento >= ESPERAS_ENTRE_REINTENTOS.length) {
        if (!respuesta) throw new ErrorLLM("No se pudo conectar con la IA.");
        break;
      }
      await esperar(ESPERAS_ENTRE_REINTENTOS[intento]);
    }
    const datos = await respuesta.json().catch(() => null);
    if (respuesta.status === 429) throw new ErrorLLM("Se agotó el cupo gratis de la IA por ahora. Probá en un rato.");
    if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorLLM(`Google no aceptó la clave de la IA (${respuesta.status}). Revisá GEMINI_API_KEY.`);
    if (!respuesta.ok) throw new ErrorLLM(`La IA rechazó el pedido (${respuesta.status}${datos?.error?.message ? `: ${String(datos.error.message).slice(0, 160)}` : ""}).`);
    if (datos?.promptFeedback?.blockReason) throw new ErrorLLM("La IA no aceptó ese mensaje. Probá decirlo de otra forma.");
    return datos;
  }

  return {
    modelo,
    // historial: [{ rol: "usuario" | "asistente", texto }] terminando en el mensaje nuevo de Facundo.
    // ejecutar(nombre, argumentos) corre una herramienta y devuelve un objeto con el resultado. Devuelve el texto final.
    async conversar({ sistema, historial, herramientas, ejecutar }) {
      const contenidos = historial.map((m) => ({ role: m.rol === "usuario" ? "user" : "model", parts: [{ text: m.texto }] }));
      for (let paso = 0; paso < pasosMaximos; paso++) {
        const datos = await pedir({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: contenidos,
          tools: herramientas.length ? [{ functionDeclarations: herramientas }] : undefined,
          generationConfig: { temperature: 0.3 },
        });
        const candidato = datos?.candidates?.[0];
        const contenido = candidato?.content;
        if (!contenido?.parts?.length) {
          if (candidato?.finishReason && candidato.finishReason !== "STOP") throw new ErrorLLM("La IA no pudo responder a eso. Probá decirlo de otra forma.");
          throw new ErrorLLM("La IA no devolvió ninguna respuesta. Probá de nuevo.");
        }
        const llamadas = contenido.parts.filter((p) => p.functionCall);
        if (!llamadas.length) return textoDe(contenido);

        // Se reenvía lo que dijo el modelo tal cual vino (los modelos nuevos exigen devolver sus firmas internas)
        contenidos.push(contenido);
        const respuestas = [];
        for (const { functionCall } of llamadas) {
          let resultado;
          try {
            resultado = await ejecutar(functionCall.name, functionCall.args ?? {});
          } catch (error) {
            resultado = { error: `No se pudo ejecutar: ${error.message}` };
          }
          respuestas.push({ functionResponse: { name: functionCall.name, response: resultado ?? {} } });
        }
        contenidos.push({ role: "user", parts: respuestas });
      }
      throw new ErrorLLM("La IA dio demasiadas vueltas sin llegar a una respuesta. Probá de nuevo con un pedido más simple.");
    },
  };
}
