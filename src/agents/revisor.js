// Revisor: segunda mirada sobre un flujo ya armado. No usa IA ni gasta plata.
// Vuelve a pasar el flujo por las mismas reglas que usa el Estratega (forma, semana, marca, voseo, cifras). Sirve para
// un flujo que alguien editó a mano y para uno guardado antes de que se agregara una regla nueva.
// Devuelve { aprobada, problemas }.
import { validarPlan } from "./estratega.js";

export async function revisarPlan(plan, { semanaInicio } = {}) {
  const { ok, errores } = validarPlan(plan, { semanaInicio });
  return { aprobada: ok, problemas: errores, advertencias: [] };
}
