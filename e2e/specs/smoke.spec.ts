import { test, expect } from "../fixtures";
import { textos } from "../data/textos";
import { urlDeLaApi } from "../support/entorno";

// Solo lectura y sin mocks: sirven contra la landing local y contra la publicada.
// Tiempos largos porque la API gratuita de Render puede tardar cerca de un minuto en despertar.
test.describe("Smoke", { tag: "@smoke" }, () => {
  test.describe.configure({ timeout: 120_000 });

  test("la landing carga con el hero completo y sin errores en consola", async ({ page, landing, erroresDeConsola }) => {
    await landing.abrir();

    await expect(page).toHaveTitle("VOW | Lista de espera");
    await expect(landing.titulo).toHaveText(textos.hero.titulo);
    await expect(landing.logo).toBeVisible();
    await expect(landing.wordmark).toBeVisible();
    await expect(landing.ctaUnirse).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(erroresDeConsola).toEqual([]);
  });

  test("se ven las secciones principales y el footer", async ({ landing }) => {
    await landing.abrir();

    for (const nombre of Object.values(textos.regiones).filter((n) => n !== textos.regiones.resumenDrop)) {
      await expect(landing.region(nombre), `sección "${nombre}"`).toBeAttached();
    }
    await expect(landing.footer).toBeAttached();
  });

  test("el catálogo del Drop 01 muestra los productos que devuelve la API", async ({ page, landing, catalogo }) => {
    const respuesta = page.waitForResponse((r) => r.url().includes("/api/productos?drop=1"), { timeout: 90_000 });
    await landing.abrir();

    const { productos } = (await (await respuesta).json()) as { productos: { nombre: string }[] };
    expect(productos.length).toBeGreaterThan(0);
    await expect(catalogo.productos).toHaveCount(productos.length);
    await expect(catalogo.producto(productos[0].nombre)).toBeVisible();
  });

  test("GET /api/salud responde ok", async ({ request }) => {
    const respuesta = await request.get(`${urlDeLaApi()}/api/salud`, { timeout: 90_000 });

    expect(respuesta.status()).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true });
  });
});
