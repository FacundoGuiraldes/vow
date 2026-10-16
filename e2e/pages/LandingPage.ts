import type { Locator, Page } from "@playwright/test";
import { textos } from "../data/textos";

// Estructura general de la landing: hero, índice, secciones y footer.
export class LandingPage {
  readonly hero: Locator;
  readonly logo: Locator;
  readonly titulo: Locator;
  readonly wordmark: Locator;
  readonly ctaUnirse: Locator;
  readonly indice: Locator;
  readonly saltarAlFormulario: Locator;
  readonly footer: Locator;

  constructor(readonly page: Page) {
    this.hero = page.getByRole("region", { name: textos.hero.titulo });
    this.logo = this.hero.getByRole("img", { name: "VOW", exact: true });
    this.titulo = page.getByRole("heading", { level: 1 });
    // El wordmark gigante es decorativo (aria-hidden), así que se busca por su texto
    this.wordmark = this.hero.getByText("VOW", { exact: true });
    this.ctaUnirse = this.hero.getByRole("link", { name: textos.hero.cta, exact: true });
    this.indice = page.getByRole("navigation", { name: "Secciones" });
    this.saltarAlFormulario = page.getByRole("link", { name: "Saltar al formulario" });
    this.footer = page.getByRole("contentinfo");
  }

  async abrir(ruta = "/") {
    await this.page.goto(ruta);
  }

  region(nombre: string): Locator {
    return this.page.getByRole("region", { name: nombre, exact: true });
  }

  linkDelIndice(nombre: string): Locator {
    return this.indice.getByRole("link", { name: nombre, exact: true });
  }

  // Ancho total del documento contra el ancho visible: si es mayor, hay scroll horizontal
  async tieneScrollHorizontal(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  }
}
