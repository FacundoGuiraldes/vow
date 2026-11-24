// Cliente que no llama a Claude: devuelve un flujo de ejemplo que cumple las reglas.
// Sirve para probar el flujo completo gratis (npm run plan -- --simulado, npm run semana -- --simulado).
const sumar = (fechaISO, dias) => {
  const f = new Date(`${fechaISO}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
};

export const crearClienteSimulado = (semana) => ({
  messages: {
    create: async () => ({
      content: [
        {
          type: "tool_use",
          id: "simulado",
          name: "proponer_flujo",
          input: {
            dias: [
              { fecha: semana, formato: "story", contenido: "Pregunta con dos opciones para quien entrena: qué prefiere hacer primero en la semana. Se ven las dos opciones sobre fondo liso." },
              { fecha: sumar(semana, 2), formato: "reel", contenido: "Video corto del proceso de trabajo de la marca: una mesa con muestras de tela y un lápiz, sin mostrar producto terminado." },
              { fecha: sumar(semana, 4), formato: "carrusel", contenido: "Carrusel de tres láminas con situaciones que quien entrena reconoce, una por lámina, y una última que invita a sumarse a la lista de espera." },
            ],
          },
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  },
});
