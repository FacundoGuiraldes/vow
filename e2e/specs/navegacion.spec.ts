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

  test("el link a la política de privacidad lleva a la sección y actualiza la URL", async ({ page, landing, formulario }) => {
    const privacidad = landing.region(textos.regiones.privacidad);

    await formulario.linkPrivacidad.click();

    await expect(privacidad).toBeFocused();
    await expect(privacidad.getByRole("heading", { name: textos.regiones.privacidad })).toBeInViewport();
    await expect(page).toHaveURL(/#privacidad$/);
  });

  test("entrar directo a /#privacidad muestra la política", async ({ landing, browserName }) => {
    // HALLAZGO 4 (no se arregla en esta rama): en Firefox a veces la página queda en ACCESO, antes de la política
    // (1 de 6 corridas en local). La landing reposiciona por tiempo (load, fonts.ready y 800 ms); si el layout
    // sigue cambiando después, el scroll queda corto. En Chromium y WebKit pasó 10 de 10.
    test.fixme(browserName === "firefox", "Intermitente en Firefox: ver hallazgo 4.");
    const privacidad = landing.region(textos.regiones.privacidad);

    await landing.abrir("/#privacidad");

    await expect(privacidad.getByRole("heading", { name: textos.regiones.privacidad })).toBeInViewport();
    await expect(privacidad).toBeFocused();
  });
});
