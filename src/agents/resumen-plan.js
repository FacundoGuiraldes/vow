// Texto legible de un plan, para mostrarlo en la terminal antes de aprobarlo.
export function resumenDePlan(plan) {
  const lineas = [plan.resumen, ""];
  for (const pieza of plan.piezas) {
    lineas.push(`${pieza.fecha} · ${pieza.formato} · ${pieza.pilar}`, `  Gancho: ${pieza.gancho}`);
    for (const alternativo of pieza.ganchos_alternativos ?? []) lineas.push(`    · ${alternativo}`);
    lineas.push(`  Por qué: ${pieza.justificacion}`);
    if (pieza.referencias?.length) lineas.push(`  Referencias: ${pieza.referencias.join(", ")}`);
  }
  return lineas.join("\n");
}
