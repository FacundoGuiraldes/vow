import { test, expect } from "../fixtures";
import { aislarLanding } from "../support/mocks";

test.describe("Productos del Drop 00", { tag: "@funcional" }, () => {
  test.beforeEach(async ({ page }) => {
    await aislarLanding(page);
  });

  test("muestra solo gorra, medias y shaker con su foto", async ({ landing, catalogo }) => {
    await landing.abrir();
    await expect(catalogo.productos).toHaveCount(3);
    for (const nombre of ["Gorra", "Medias", "Shaker"]) {
      await expect(catalogo.producto(nombre).getByRole("img").first()).toBeAttached();
    }
  });

  test("cambiar de color cambia la foto", async ({ landing, catalogo }) => {
    await landing.abrir();
    const medias = catalogo.producto("Medias");
    const foto = medias.getByRole("img");
    await expect(foto).toHaveAttribute("src", /medias-negro-1/);
    await medias.getByRole("button", { name: "Medias beige" }).click();
    await expect(foto).toHaveAttribute("src", /medias-beige-1/);
    await expect(medias.getByRole("button", { name: "Medias beige" })).toHaveAttribute("aria-pressed", "true");
  });
});
