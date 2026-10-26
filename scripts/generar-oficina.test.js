import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clasificarEstado, generar, leerPieza, leerStock, notaCorta, textoDelPlan } from "./generar-oficina.js";

describe("generador de la oficina", () => {
  test("clasifica el estado de una pieza por lo que dice su documento", () => {
    assert.equal(clasificarEstado("publicado el 19/10/2026 a las 12:02"), "publicado");
    assert.equal(clasificarEstado("guion definido. Falta filmar las tomas"), "por filmar");
    assert.equal(clasificarEstado("video cargado en el bot"), "programado");
    assert.equal(clasificarEstado("aprobado por Facundo (textos); falta su aprobación final"), "por aprobar");
  });

  test("la nota de una pieza queda en una frase, sin rutas ni enlaces", () => {
    assert.equal(notaCorta("publicado el 19/10/2026 a las 12:02 (hora argentina): https://x.com/p/1. Carrusel de 7 láminas en `docs/a/`."), "Publicado el 19/10/2026");
    assert.equal(notaCorta("**aprobado** por Facundo (textos). Láminas generadas en `docs/piezas/x/` (falta su aprobación)."), "aprobado por Facundo (textos).");
  });

  test("lee una pieza: formato, fecha, título, estado y pendientes", () => {
    const md = "# Carrusel · 27/10/2026 · pilar promesa\n\n**Título:** Carrusel de la promesa\n**Estado:** aprobado (textos).\n\n## Láminas\n1. Uno\n\n## Pendiente\n- Publicar con aprobación\n- Regenerar láminas\n";
    const { pieza, pendientes } = leerPieza(md);
    assert.deepEqual([pieza.fecha, pieza.formato, pieza.titulo, pieza.estado], ["2026-10-27", "carrusel", "Carrusel de la promesa", "por aprobar"]);
    assert.ok(pieza.texto.includes("## Láminas") && !pieza.texto.includes("**Estado:**"));
    assert.deepEqual(pendientes, ["Publicar con aprobación", "Regenerar láminas"]);
    assert.equal(leerPieza("sin cabecera"), null);
  });

  test("lee del stock las entregas y lo que falta confirmar", () => {
    const md = "Llegada estimada: entre el 2 y el 4/11/2026.\n\n### Gorras · CapShop\n\n| Dato | Valor |\n|---|---|\n| Entrega estimada | 04/11/2026 |\n\n### Shakers · Faurear\n\n| Dato | Valor |\n|---|---|\n| Entrega | **Por confirmar** |\n\n## Por confirmar\n\n- Precios finales.\n- Entrega de las medias.\n";
    const s = leerStock(md);
    assert.equal(s.deposito.gorras, "04/11/2026");
    assert.equal(s.deposito.shakers, "Por confirmar");
    assert.ok(s.agenda.some((a) => a.f === "2026-11-04" && /gorras/.test(a.t)));
    assert.deepEqual(s.pendientes.map((p) => p.t), ["Confirmar: Precios finales.", "Confirmar: Entrega de las medias."]);
  });

  test("el plan se vuelve texto legible con todos sus campos", () => {
    const t = textoDelPlan({ resumen: "Dos piezas.", piezas: [{ fecha: "2026-10-22", formato: "reel", pilar: "proceso", gancho: "Salí.", guion: "Un plano.", texto_en_pantalla: ["A", "B"] }] }, "2026-10-21");
    assert.match(t, /# Plan 2026-10-21/);
    assert.match(t, /\*\*Gancho:\*\* Salí\./);
    assert.match(t, /\*\*Texto en pantalla:\*\* A, B/);
  });

  test("genera datos.json y copia los archivos de las piezas", () => {
    const raiz = mkdtempSync(join(tmpdir(), "oficina-"));
    mkdirSync(join(raiz, "docs", "piezas", "2026-10-27-laminas"), { recursive: true });
    writeFileSync(join(raiz, "docs", "piezas", "2026-10-27-laminas", "lamina-2.png"), "x");
    writeFileSync(join(raiz, "docs", "piezas", "2026-10-27-laminas", "lamina-10.png"), "x");
    writeFileSync(join(raiz, "docs", "piezas", "2026-10-27-carrusel.md"), "# Carrusel · 27/10/2026 · pilar promesa\n\n**Estado:** falta aprobar\n");
    const destino = join(raiz, "salida");
    const { D, MED } = generar({ raiz, destino, hoy: "2026-10-26" });
    assert.equal(D.piezas.length, 1);
    assert.deepEqual(MED.piezas["2026-10-27_carrusel"].imgs, ["medios/2026-10-27_carrusel/lamina-2.png", "medios/2026-10-27_carrusel/lamina-10.png"]);
    assert.ok(existsSync(join(destino, "medios", "2026-10-27_carrusel", "lamina-2.png")));
    assert.equal(JSON.parse(readFileSync(join(destino, "datos.json"), "utf8")).D.actualizado, "2026-10-26");
  });
});
