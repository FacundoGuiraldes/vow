import { test, expect } from "../fixtures";
import { textos } from "../data/textos";

// De punta a punta contra la API local y la base dev, sin mocks. Requiere E2E_ALLOW_DB_WRITES=dev
// (el fixture baseDev saltea el test si falta y falla si el entorno no es seguro).
test.describe("Integración con la API local y la base dev", { tag: "@integracion" }, () => {
  test("anotarse desde la landing guarda el registro normalizado en la base", async ({ landing, formulario, baseDev }) => {
    const email = baseDev.emailUnico();
    await landing.abrir();

    await formulario.anotarse(email, "@E2E.Prueba");

    await expect(formulario.mensaje).toHaveText(textos.form.success);
    expect(await baseDev.registro(email)).toEqual({ email, instagram: "e2e.prueba", origen: "landing" });
  });

  test("el catálogo muestra los productos de la base en orden", async ({ landing, catalogo, baseDev }) => {
    const nombres = await baseDev.nombresDelDrop(1);
    expect(nombres.length).toBeGreaterThan(0);

    await landing.abrir();

    await expect(catalogo.productos).toHaveCount(nombres.length);
    for (const [i, nombre] of nombres.entries()) {
      await expect(catalogo.productos.nth(i)).toContainText(nombre);
    }
  });
});
