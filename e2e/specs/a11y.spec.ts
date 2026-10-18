import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { textos } from "../data/textos";
import { emailDePrueba } from "../data/pruebas";
import { aislarLanding, mockearListaEspera } from "../support/mocks";

const NORMAS_WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Violaciones = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

// Página completa, sin excepciones. Los análisis corren arriba de todo, antes de scrollear, así que el
// manifiesto se mide en su estado inicial (palabras sin revelar), que es su peor caso de contraste (#17).
async function analizar(page: Page): Promise<Violaciones> {
  const { violations } = await new AxeBuilder({ page }).withTags(NORMAS_WCAG).analyze();
  return violations;
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

  // WCAG 2.5.3 (Label in Name, #16): el nombre accesible de cada control tiene que incluir su texto visible,
  // para que quien usa control por voz pueda nombrarlo como lo ve. Axe solo lo revisa con la regla experimental
  // label-content-name-mismatch, que no entra en los tags WCAG: por eso se pide aparte, sobre toda la página.
  test("los controles incluyen su texto visible en el nombre accesible (WCAG 2.5.3)", async ({ page }) => {
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
