import { runAgent } from "./core/runAgent.js";
import { asistentePrueba } from "./agents/asistente-prueba.js";

const { texto, uso } = await runAgent(
  asistentePrueba,
  "Decime en una frase por qué conviene pedir muestras antes de hacer un pedido grande a una fábrica."
);

console.log(texto);
console.log(uso);
