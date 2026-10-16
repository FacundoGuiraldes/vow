import type { Locator, Page } from "@playwright/test";
import { textos } from "../data/textos";

// Sección "Drop 01": tarjeta de resumen y lista de productos que llega de la API.
export class CatalogoDrop {
  readonly seccion: Locator;
  readonly lista: Locator;
  readonly productos: Locator;
  readonly estado: Locator;
  readonly resumen: Locator;

  constructor(readonly page: Page) {
    this.seccion = page.getByRole("region", { name: textos.regiones.drop, exact: true });
    // La lista está oculta (hidden) hasta que llegan los productos, así que no aparece antes en el árbol accesible
    this.lista = this.seccion.getByRole("list", { name: textos.regiones.drop, exact: true });
    this.productos = this.lista.getByRole("listitem");
    this.estado = this.seccion.getByRole("status");
    this.resumen = this.seccion.getByRole("complementary", { name: textos.regiones.resumenDrop });
  }

  producto(nombre: string): Locator {
    return this.productos.filter({ hasText: nombre });
  }

  // Número grande de la tarjeta (decorativo): cantidad de productos o "—" si falló la carga
  contador(valor: string): Locator {
    return this.resumen.getByText(valor, { exact: true });
  }
}
