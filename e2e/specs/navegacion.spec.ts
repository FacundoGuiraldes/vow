import { test, expect } from "../fixtures";
import { textos } from "../data/textos";
import { ANCHO_MINIMO_INDICE } from "../data/pruebas";
import { aislarLanding } from "../support/mocks";

test.describe("Navegación y anclas", { tag: "@funcional" }, () => {
  test.beforeEach(async ({ page, landing }) => {
    await aislarLanding(page);
    await landing.abrir();
  });

  test("el botón UNIRSE lleva al formulario y deja el foco en el email", async ({ landing, formulario }) => {
    await landing.ctaUnirse.click();

    await expect(formulario.email).toBeFocused();
    await expect(formulario.email).toBeInViewport();
  });

  test("el índice lleva al Drop 01 y lo marca como sección activa", async ({ page, landing }) => {
    test.skip((page.viewportSize()?.width ?? 0) < ANCHO_MINIMO_INDICE, "El índice solo existe desde 1200 px de ancho.");
    const linkDrop = landing.linkDelIndice("Ir al Drop 01");
    const seccionDrop = landing.region(textos.regiones.drop);

    await expect(landing.linkDelIndice("Ir a la sección 01")).toHaveAttribute("aria-current", "true");
    await linkDrop.click();

    await expect(seccionDrop).toBeFocused();
    await expect(seccionDrop).toBeInViewport();
    await expect(linkDrop).toHaveAttribute("aria-current", "true");
    await expect(landing.linkDelIndice("Ir a la sección 01")).not.toHaveAttribute("aria-current");
  });

  test("el link a la política de privacidad abre la página propia en otra pestaña", async ({ page, formulario }) => {
    const [pestania] = await Promise.all([page.context().waitForEvent("page"), formulario.linkPrivacidad.click()]);

    await pestania.waitForLoadState();
    await expect(pestania).toHaveURL(/\/privacidad\/$/);
    await expect(pestania.getByRole("heading", { level: 1, name: textos.privacidad })).toBeVisible();
  });

  test("el pie enlaza a todos los documentos legales y al botón de arrepentimiento", async ({ page }) => {
    const legal = page.getByRole("navigation", { name: "Legal", exact: true });

    for (const nombre of ["Privacidad", "Términos", "Reembolsos", "Cookies", "Botón de arrepentimiento"]) {
      await expect(legal.getByRole("link", { name: nombre })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Botón de arrepentimiento" }).first()).toBeVisible();
  });

  test("la cinta se puede pausar", async ({ page }) => {
    const pausa = page.getByRole("button", { name: "Pausar cinta" });
    test.skip(!(await pausa.isVisible()), "Con movimiento reducido no hay cinta que pausar.");

    await pausa.click();

    await expect(page.getByRole("button", { name: "Reanudar cinta" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Páginas legales", { tag: "@funcional" }, () => {
  for (const [ruta, titulo] of [
    ["/privacidad/", "Política de privacidad"],
    ["/terminos/", "Términos y condiciones"],
    ["/reembolsos/", "Reembolsos y devoluciones"],
    ["/cookies/", "Política de cookies"],
    ["/arrepentimiento/", "Botón de arrepentimiento"],
  ] as const) {
    test(`${ruta} tiene su título, volver al inicio y el pie`, async ({ page }) => {
      await page.goto(ruta);

      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      await expect(page.getByRole("link", { name: /Volver a VOW/ })).toHaveAttribute("href", "/");
      await expect(page.getByRole("navigation", { name: "Legal", exact: true })).toBeVisible();
    });
  }

  test("el botón de arrepentimiento devuelve el código", async ({ page }) => {
    await page.route("**/api/programacion/ventas/arrepentimiento", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ codigo: "ARR-ABC123" }) }),
    );
    await page.goto("/arrepentimiento/");

    await page.getByLabel("Nombre y apellido").fill("Ana Pérez");
    await page.getByLabel(/Mail con el que compraste/).fill("ana@example.com");
    await page.getByRole("button", { name: /Arrepentirme|Enviar|Solicitar/ }).click();

    await expect(page.locator("#arrepentimiento-msg")).toContainText("ARR-ABC123");
  });
});
