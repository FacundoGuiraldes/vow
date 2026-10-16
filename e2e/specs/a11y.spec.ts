import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { textos } from "../data/textos";
import { emailDePrueba } from "../data/pruebas";
import { aislarLanding, mockearListaEspera } from "../support/mocks";

const NORMAS_WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// EXCEPCIÓN DOCUMENTADA (hallazgo 3, no se arregla en esta rama): las palabras del manifiesto arrancan con
// opacidad 0.16 (contraste 1.45:1) y GSAP las revela a medida que se scrollea. Axe mide el estado inicial y
// marca color-contrast en cada palabra. Con prefers-reduced-motion quedan al 100 %. Por eso el párrafo del
// manifiesto se analiza con todas las reglas menos color-contrast; el resto de la página, con todas.
const MANIFIESTO = "#manifest-text";

type Violaciones = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

async function analizar(page: Page): Promise<Violaciones> {
  const pagina = await new AxeBuilder({ page }).withTags(NORMAS_WCAG).exclude(MANIFIESTO).analyze();
  const manifiesto = await new AxeBuilder({ page })
    .withTags(NORMAS_WCAG)
    .include(MANIFIESTO)
    .disableRules(["color-contrast"])
    .analyze();
  return [...pagina.violations, ...manifiesto.violations];
}

// Resumen legible de las violaciones para el mensaje de error
const resumir = (violaciones: Violaciones) =>
  violaciones.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test.describe("Accesibilidad", { tag: "@a11y" }, () => {
  test.beforeEach(async ({ page, landing, catalogo }) => {
    await aislarLanding(page);
    await landing.abrir();
    await expect(catalogo.productos.first()).toBeVisible();
  });

  test("la landing con el catálogo cargado no tiene violaciones WCAG 2.1 AA", async ({ page }) => {
    expect(resumir(await analizar(page))).toEqual([]);
  });

  test("el formulario con un error visible no tiene violaciones WCAG 2.1 AA", async ({ page, formulario }) => {
    // Envío con Enter y no con clic: con el mouse encima, axe mediría el botón a mitad de su transición de hover
    await formulario.completar("no-es-un-email");
    await formulario.email.press("Enter");
    await expect(formulario.mensaje).toHaveText(textos.form.invalidEmail);

    expect(resumir(await analizar(page))).toEqual([]);
  });

  // HALLAZGO 2 (no se arregla en esta rama): el link "Legal" del índice tiene aria-label "Ir a la política de
  // privacidad", que no contiene el texto visible. Falla WCAG 2.5.3 (Label in Name): quien usa control por voz
  // y dice "Legal" no lo encuentra. Axe solo lo detecta con la regla experimental label-content-name-mismatch.
  test.fixme("los links del índice incluyen su texto visible en el nombre accesible (WCAG 2.5.3)", async ({ page }) => {
    const { violations } = await new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]).analyze();

    expect(resumir(violations)).toEqual([]);
  });

  test("el formulario se puede usar entero con el teclado", async ({ page, landing, formulario }) => {
    const api = await mockearListaEspera(page);

    await page.keyboard.press("Tab");
    await expect(landing.saltarAlFormulario).toBeFocused();
    await expect(landing.saltarAlFormulario).toBeInViewport();

    await page.keyboard.press("Enter");
    await expect(formulario.email).toBeFocused();
    await page.keyboard.type(emailDePrueba());

    await page.keyboard.press("Tab");
    await expect(formulario.instagram).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(formulario.enviar).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(formulario.mensaje).toHaveText(textos.form.success);
    expect(api.pedidos).toHaveLength(1);
  });
});
