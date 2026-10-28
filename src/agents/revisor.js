// Revisor: segunda mirada sobre un plan ya armado. No usa IA ni gasta plata.
// Vuelve a pasar el plan por las mismas reglas que usa el Estratega (marca, voseo, cifras, piezas ya
// definidas, ganchos copiados), con el contexto de HOY. Sirve para tres casos:
//   - un plan que alguien editó a mano después de generarlo,
//   - un plan guardado antes de que se agregara una regla nueva,
//   - una pieza definida (docs/piezas) que apareció después de planificar y ahora choca con el plan.
// Devuelve { aprobada, problemas }.
import { construirSistema, extraerGanchosConocidos, validarPlan, PIEZAS_POR_DEFECTO } from "./estratega.js";

export async function revisarPlan(plan, { semanaInicio, recursos = {}, piezas, leer, listar } = {}) {
  const { cerebro, piezas: piezasDefinidas } = await construirSistema(leer, { listar });
  const { conocidos: ganchosConocidos } = extraerGanchosConocidos(cerebro);
  // Si no se indica cuántas piezas se pidieron, se toma la cantidad que trae el plan
  const cantidad = piezas ?? (Array.isArray(plan?.piezas) ? plan.piezas.length : PIEZAS_POR_DEFECTO);
  const { ok, errores, advertencias } = validarPlan(plan, { semanaInicio, recursos, piezas: cantidad, ganchosConocidos, piezasDefinidas });
  return { aprobada: ok, problemas: errores, advertencias: advertencias ?? [] };
}
