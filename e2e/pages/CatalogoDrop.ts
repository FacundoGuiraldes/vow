import type { Locator, Page } from "@playwright/test";
import { textos } from "../data/textos";

// Sección "Los productos" (Drop 00): una tarjeta por producto, con fotos y selector de color.
export class CatalogoDrop {
  readonly seccion: Locator;
  readonly productos: Locator;

  constructor(readonly page: Page) {
    this.seccion = page.getByRole("region", { name: textos.regiones.drop, exact: true });
    this.productos = this.seccion.getByRole("article");
  }

  producto(nombre: string): Locator {
    return this.productos.filter({ hasText: nombre });
  }
}
