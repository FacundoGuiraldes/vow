import { test, expect } from "../fixtures";
import { textos } from "../data/textos";
import { anchosResponsive, ANCHO_MINIMO_INDICE } from "../data/pruebas";
import { aislarLanding } from "../support/mocks";

test.describe("Responsive y movimiento reducido", { tag: "@funcional" }, () => {
  test.beforeEach(async ({ page }) => {
    await aislarLanding(page);
  });

  test("sin scroll horizontal en todos los anchos y con el índice solo en escritorio", async ({ page, landing, catalogo }) => {
    for (const ancho of anchosResponsive) {
      await test.step(`${ancho} px`, async () => {
        await page.setViewportSize({ width: ancho, height: 900 });
        await landing.abrir();
        await expect(catalogo.productos.first()).toBeVisible();

        expect(await landing.tieneScrollHorizontal(), `scroll horizontal a ${ancho} px`).toBe(false);
        if (ancho >= ANCHO_MINIMO_INDICE) await expect(landing.indice).toBeVisible();
        else await expect(landing.indice).toBeHidden();
        await expect(landing.ctaUnirse).toBeVisible();
      });
    }
  });

  test.describe("con prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("no arranca el scroll suave ni las animaciones de entrada", async ({ page, landing }) => {
      await landing.abrir();
      await expect(landing.titulo).toHaveText(textos.hero.titulo);

      // La landing marca <html> con "no-motion" y no inicia Lenis (que agregaría la clase "lenis")
      const raiz = page.locator("html");
      await expect(raiz).toHaveClass(/\bno-motion\b/);
      await expect(raiz).not.toHaveClass(/\blenis\b/);
      // GSAP deja estilos en línea en lo que anima: sin animaciones, el hero no tiene ninguno
      await expect(landing.ctaUnirse).not.toHaveAttribute("style");
      await expect(landing.titulo).not.toHaveAttribute("style");
      await expect(landing.ctaUnirse).toHaveCSS("opacity", "1");
    });
  });
});
