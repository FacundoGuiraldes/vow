// Texto legible de un flujo, para mostrarlo en la terminal antes de aprobarlo.
export function resumenDePlan(plan) {
  return plan.dias.map((d) => `${d.fecha} · ${d.formato}\n  ${d.contenido}`).join("\n");
}
