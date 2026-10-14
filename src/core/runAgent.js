import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function runAgent(agent, input, { maxTurns = 6, maxTokens = 1024 } = {}) {
  const messages = [{ role: "user", content: input }];
  const tools = agent.tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
  const uso = { entrada: 0, salida: 0, turnos: 0 };

  for (let turno = 0; turno < maxTurns; turno++) {
    const res = await client.messages.create({
      model: agent.model,
      max_tokens: maxTokens,
      system: agent.system,
      messages,
      ...(tools.length > 0 && { tools }),
    });

    uso.entrada += res.usage.input_tokens;
    uso.salida += res.usage.output_tokens;
    uso.turnos += 1;

    if (res.stop_reason !== "tool_use") {
      const texto = res.content
        .filter((bloque) => bloque.type === "text")
        .map((bloque) => bloque.text)
        .join("\n");
      return { texto, uso };
    }

    messages.push({ role: "assistant", content: res.content });

    const resultados = [];
    for (const bloque of res.content.filter((b) => b.type === "tool_use")) {
      let contenido;
      try {
        const herramienta = agent.tools.find((t) => t.name === bloque.name);
        contenido = JSON.stringify(await herramienta.run(bloque.input));
      } catch (error) {
        contenido = JSON.stringify({ error: error.message });
      }
      resultados.push({
        type: "tool_result",
        tool_use_id: bloque.id,
        content: contenido,
      });
    }
    messages.push({ role: "user", content: resultados });
  }

  throw new Error("Se superó el máximo de turnos");
}
