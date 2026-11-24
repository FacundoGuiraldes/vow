import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generar, leerStock, textoDelPlan } from "./generar-oficina.js";

describe("generador de la oficina", () => {
  test("lee del stock las entregas y lo que falta confirmar", () => {
    const md = "Llegada estimada: entre el 2 y el 4/11/2026.\n\n### Gorras · CapShop\n\n| Dato | Valor |\n|---|---|\n| Entrega estimada | 04/11/2026 |\n\n### Shakers · Faurear\n\n| Dato | Valor |\n|---|---|\n| Entrega | **Por confirmar** |\n\n## Por confirmar\n\n- Precios finales.\n- Entrega de las medias.\n";
    const s = leerStock(md);
    assert.equal(s.deposito.gorras, "04/11/2026");
    assert.equal(s.deposito.shakers, "Por confirmar");
    assert.ok(s.agenda.some((a) => a.f === "2026-11-04" && /gorras/.test(a.t)));
    assert.deepEqual(s.pendientes.map((p) => p.t), ["Confirmar: Precios finales.", "Confirmar: Entrega de las medias."]);
  });

  test("el flujo se vuelve texto legible: un renglón por publicación", () => {
    const t = textoDelPlan({ dias: [{ fecha: "2026-10-22", formato: "reel", contenido: "Un plano de las manos." }] }, "2026-10-21");
    assert.match(t, /# Flujo de la semana del 2026-10-21/);
    assert.match(t, /- 2026-10-22 · reel: Un plano de las manos\./);
  });

  test("genera datos.json con el último flujo nuevo e ignora los planes viejos con piezas", () => {
    const raiz = mkdtempSync(join(tmpdir(), "oficina-"));
    mkdirSync(join(raiz, "docs", "planes"), { recursive: true });
    writeFileSync(join(raiz, "docs", "planes", "plan-2026-10-19.json"), JSON.stringify({ dias: [{ fecha: "2026-10-20", formato: "story", contenido: "Una story vieja pero nueva en formato." }] }));
    writeFileSync(join(raiz, "docs", "planes", "plan-2026-10-26.json"), JSON.stringify({ resumen: "x", piezas: [{ gancho: "viejo" }] }));
    const destino = join(raiz, "salida");
    const { D } = generar({ raiz, destino, hoy: "2026-10-26" });
    assert.equal(D.estrategia.plan, "2026-10-19");
    assert.match(D.planTexto, /story/);
    assert.equal(JSON.parse(readFileSync(join(destino, "datos.json"), "utf8")).D.actualizado, "2026-10-26");
  });
});
