import { test, expect } from "../fixtures";
import { productosDrop01, textos } from "../data/textos";
import { productoMalicioso } from "../data/pruebas";
import { mockearCatalogo, mockearCatalogoConError, mockearSalud } from "../support/mocks";

test.describe("Catálogo del Drop 01", { tag: "@funcional" }, () => {
  test.beforeEach(async ({ page }) => {
    await mockearSalud(page);
  });

  test("con la API caída muestra el aviso de error y oculta la lista", async ({ page, landing, catalogo }) => {
    await mockearCatalogoConError(page, 500);
    await landing.abrir();

    await expect(catalogo.estado).toHaveText(textos.catalogo.error);
    await expect(catalogo.estado).toBeVisible();
    await expect(catalogo.lista).toHaveCount(0);
    await expect(catalogo.contador("—")).toBeVisible();
  });

  test("sin productos muestra un mensaje visible de catálogo vacío", async ({ page, landing, catalogo }) => {
    await mockearCatalogo(page, []);
    await landing.abrir();

    await expect(catalogo.estado).toHaveText(/El Drop 01 se abre pronto/);
    const caja = await catalogo.estado.boundingBox();
    expect(caja?.width ?? 0, "el mensaje de estado no tiene que ser solo para lectores de pantalla").toBeGreaterThan(1);
    await expect(catalogo.contador("00")).toBeVisible();
  });

  test("muestra el HTML que venga de la API como texto, sin ejecutarlo", async ({ page, landing, catalogo }) => {
    await mockearCatalogo(page, [productoMalicioso, ...productosDrop01.slice(1)]);
    await landing.abrir();

    await expect(catalogo.productos).toHaveCount(productosDrop01.length);
    await expect(catalogo.seccion.getByText(productoMalicioso.nombre, { exact: true })).toBeVisible();
    await expect(catalogo.seccion.getByText(productoMalicioso.descripcion, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as { __xss?: boolean }).__xss)).toBeUndefined();
  });
});
