import { test, expect } from "../fixtures";
import { textos } from "../data/textos";
import { emailDePrueba, emailsInvalidos } from "../data/pruebas";
import { aislarLanding, mockearListaEspera } from "../support/mocks";

// Formulario de lista de espera con la API simulada: nunca llega a ninguna base.
test.describe("Formulario de lista de espera", { tag: "@funcional" }, () => {
  test.beforeEach(async ({ page, landing }) => {
    await aislarLanding(page);
    await landing.abrir();
  });

  test("con un email válido muestra el éxito, limpia el formulario y envía los datos esperados", async ({ page, formulario }) => {
    const api = await mockearListaEspera(page);
    const email = emailDePrueba();

    await formulario.anotarse(`  ${email}  `, "@vow_ar");

    await expect(formulario.mensaje).toHaveText(textos.form.success);
    await expect(formulario.email).toHaveValue("");
    await expect(formulario.instagram).toHaveValue("");
    expect(api.pedidos).toHaveLength(1);
    expect(api.ultimoCuerpo()).toEqual({ email, instagram: "@vow_ar", origen: "landing" });
  });

  // El parámetro ?origen= sirve para medir canales (por ejemplo, el QR de cada gimnasio).
  // Estos tests abren la landing con su propia URL, por eso no usan el beforeEach.
  const casosOrigen = [
    { nombre: "usa el origen de la URL", ruta: "/?origen=gym-olivos", esperado: "gym-olivos" },
    { nombre: "normaliza mayúsculas y espacios", ruta: "/?origen=%20Gym-Centro%20", esperado: "gym-centro" },
    { nombre: "sin parámetro usa 'landing'", ruta: "/", esperado: "landing" },
    { nombre: "un origen vacío usa 'landing'", ruta: "/?origen=", esperado: "landing" },
    { nombre: "un origen con caracteres raros usa 'landing'", ruta: "/?origen=%3Cscript%3E%20x", esperado: "landing" },
    { nombre: "un origen de más de 50 caracteres usa 'landing'", ruta: `/?origen=${"a".repeat(51)}`, esperado: "landing" },
  ];

  for (const caso of casosOrigen) {
    test(`origen: ${caso.nombre}`, async ({ page, landing, formulario }) => {
      await aislarLanding(page);
      const api = await mockearListaEspera(page);
      await landing.abrir(caso.ruta);

      await formulario.anotarse(emailDePrueba());

      await expect(formulario.mensaje).toHaveText(textos.form.success);
      expect(api.ultimoCuerpo()?.origen).toBe(caso.esperado);
    });
  }

  test("un email inválido se frena en el navegador sin llamar a la API", async ({ page, formulario }) => {
    const api = await mockearListaEspera(page);

    for (const email of emailsInvalidos) {
      await formulario.anotarse(email);

      await expect(formulario.mensaje).toHaveText(textos.form.invalidEmail);
      await expect(formulario.email).toHaveAttribute("aria-invalid", "true");
      await expect(formulario.email).toBeFocused();
    }
    expect(api.pedidos).toHaveLength(0);
  });

  test("un 400 de la API sobre el Instagram marca ese campo y le da el foco", async ({ page, formulario }) => {
    await mockearListaEspera(page, {
      status: 400,
      cuerpo: { error: textos.instagramInvalido, campo: "instagram" },
    });

    await formulario.anotarse(emailDePrueba(), "no válido!");

    await expect(formulario.mensaje).toHaveText(textos.instagramInvalido);
    await expect(formulario.instagram).toHaveAttribute("aria-invalid", "true");
    await expect(formulario.instagram).toBeFocused();
    await expect(formulario.email).not.toHaveAttribute("aria-invalid");
  });

  test("un error del servidor muestra el aviso de conexión", async ({ page, formulario }) => {
    await mockearListaEspera(page, { status: 500, cuerpo: { error: "Error simulado" } });

    await formulario.anotarse(emailDePrueba());

    await expect(formulario.mensaje).toHaveText(textos.form.error);
    await expect(formulario.enviar).toBeEnabled();
  });

  test("un 429 pide esperar un minuto", async ({ page, formulario }) => {
    await mockearListaEspera(page, { status: 429, cuerpo: { error: "Demasiados intentos." } });

    await formulario.anotarse(emailDePrueba());

    await expect(formulario.mensaje).toHaveText(textos.form.rateLimited);
  });

  test("mientras envía muestra el estado de carga y no permite un doble envío", async ({ page, formulario }) => {
    const api = await mockearListaEspera(page, { retener: true });
    await formulario.completar(emailDePrueba());

    await formulario.enviar.dblclick();
    await formulario.email.press("Enter");

    await expect(formulario.enviar).toBeDisabled();
    await expect(formulario.enviar).toHaveText(textos.form.sending);
    await expect(formulario.form).toHaveAttribute("aria-busy", "true");

    api.liberar();

    await expect(formulario.mensaje).toHaveText(textos.form.success);
    await expect(formulario.enviar).toBeEnabled();
    await expect(formulario.enviar).toHaveText(textos.form.submit);
    expect(api.pedidos).toHaveLength(1);
  });
});
