import type { Page, Request, Route } from "@playwright/test";

const RUTA_SALUD = "**/api/salud";
const RUTA_LISTA_ESPERA = "**/api/lista-espera";

const json = (route: Route, status: number, cuerpo: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(cuerpo) });

export async function mockearSalud(page: Page) {
  await page.route(RUTA_SALUD, (route) => json(route, 200, { ok: true }));
}

// Landing aislada: salud simulada, sin depender de la API real.
export async function aislarLanding(page: Page) {
  await mockearSalud(page);
}

// Respuesta simulada para la lista de espera. Guarda los pedidos para poder revisar qué se envió.
// Con `retener: true` la respuesta queda pendiente hasta llamar a `liberar()` (para ver el estado de carga).
export async function mockearListaEspera(
  page: Page,
  { status = 200, cuerpo = { mensaje: "ok" } as unknown, retener = false } = {}
) {
  const pedidos: Request[] = [];
  let liberar = () => {};
  const liberado = retener ? new Promise<void>((resolver) => (liberar = resolver)) : Promise.resolve();

  await page.route(RUTA_LISTA_ESPERA, async (route) => {
    pedidos.push(route.request());
    await liberado;
    await json(route, status, cuerpo);
  });

  return {
    pedidos,
    liberar: () => liberar(),
    ultimoCuerpo: () => pedidos.at(-1)?.postDataJSON() as Record<string, unknown> | undefined,
  };
}
