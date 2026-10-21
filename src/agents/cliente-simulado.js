// Cliente que no llama a Claude: devuelve un plan de ejemplo que cumple las reglas.
// Sirve para probar el flujo completo gratis (npm run plan -- --simulado, npm run semana -- --simulado).
export const crearClienteSimulado = (semana) => ({
  messages: {
    create: async () => ({
      content: [
        {
          type: "tool_use",
          id: "simulado",
          name: "proponer_plan",
          input: {
            resumen: "Plan de ejemplo (modo simulado, no usa IA).",
            piezas: [
              {
                fecha: semana,
                formato: "reel",
                pilar: "proceso",
                gancho: "Una cosa por vez.",
                ganchos_alternativos: ["Hecho con calma. Hecho bien.", "Cada detalle cuenta.", "Lo simple se sostiene."],
                guion: "Video corto de texto sobre fondo hueso, una frase por vez.",
                texto_en_pantalla: ["Una cosa por vez.", "Sin apuro. Sin ruido."],
                produccion: "propio",
                instrucciones_ia: "",
                epigrafe: "Se hace despacio y se hace bien. Anotate en la lista: link en la bio.",
                palabras_clave: ["proceso", "constancia"],
                cta: "Anotate en la lista de espera.",
                recursos: ["Diseño en colores de marca"],
                justificacion: "Muestra el criterio de trabajo de la marca sin mostrar producto.",
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  },
});
