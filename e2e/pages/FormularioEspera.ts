import type { Locator, Page } from "@playwright/test";
import { textos } from "../data/textos";

// Sección "ACCESO": formulario de lista de espera.
export class FormularioEspera {
  readonly seccion: Locator;
  readonly form: Locator;
  readonly email: Locator;
  readonly instagram: Locator;
  readonly enviar: Locator;
  readonly mensaje: Locator;
  readonly linkPrivacidad: Locator;

  constructor(readonly page: Page) {
    this.seccion = page.getByRole("region", { name: textos.regiones.acceso, exact: true });
    // El <form> no tiene nombre accesible (no se expone con rol "form"): es el único form de la sección
    this.form = this.seccion.locator("form");
    this.email = this.seccion.getByLabel("Email", { exact: true });
    this.instagram = this.seccion.getByLabel("Tu Instagram", { exact: true });
    // Único botón del formulario: su nombre cambia entre "ENVIAR" y "ENVIANDO..."
    this.enviar = this.seccion.getByRole("button");
    this.mensaje = this.seccion.getByRole("status");
    this.linkPrivacidad = this.seccion.getByRole("link", { name: textos.regiones.privacidad, exact: true });
  }

  async completar(email: string, instagram?: string) {
    await this.email.fill(email);
    if (instagram !== undefined) await this.instagram.fill(instagram);
  }

  async anotarse(email: string, instagram?: string) {
    await this.completar(email, instagram);
    await this.enviar.click();
  }
}
