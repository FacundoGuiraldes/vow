// El flujo de cada semana: planificar -> revisar -> (aprobación de una persona) -> guardar el plan.
// Después se sumarán acá el Creador y las láminas. El Investigador sigue aparte (npm run investigar / analizar):
// su informe se hace cada tanto y el Estratega siempre lee el último.
import { planificarSemana } from "../agents/estratega.js";
import { revisarPlan } from "../agents/revisor.js";

export const PASOS = ["planificar", "revisar", "aprobar-plan", "guardar-plan"];

// `escribir(nombreDeArchivo, texto)` se inyecta: en la terminal escribe en docs/planes/, en las pruebas guarda en memoria.
export function armarPasos({ opciones, cliente, leer, listar, escribir, sufijo = "" }) {
  const { semana, fase = "base", recursos = {}, notas = "", piezas } = opciones;
  return [
    {
      nombre: "planificar",
      correr: async () => {
        const r = await planificarSemana({ semanaInicio: semana, fase, recursos, notas, piezas }, { cliente, leer, listar, criticar: true });
        return { ok: r.ok, salida: r.plan, uso: r.uso, errores: r.errores };
      },
    },
    {
      nombre: "revisar",
      correr: async ({ salidas }) => {
        const r = await revisarPlan(salidas.planificar, { semanaInicio: semana, recursos, leer, listar });
        return { ok: r.aprobada, salida: { aprobada: r.aprobada }, errores: r.problemas };
      },
    },
    { nombre: "aprobar-plan", tipo: "aprobacion" },
    {
      nombre: "guardar-plan",
      correr: async ({ salidas }) => {
        const archivo = `plan-${semana}${sufijo}.json`;
        await escribir(archivo, JSON.stringify(salidas.planificar, null, 2) + "\n");
        return { salida: { archivo } };
      },
    },
  ];
}
