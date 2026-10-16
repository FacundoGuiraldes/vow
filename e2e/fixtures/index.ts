import { test as base, expect } from "@playwright/test";
import { LandingPage } from "../pages/LandingPage";
import { FormularioEspera } from "../pages/FormularioEspera";
import { CatalogoDrop } from "../pages/CatalogoDrop";
import { emailDePrueba } from "../data/pruebas";
import { esHostLocal, motivoParaNoEscribir } from "../support/entorno";
import { abrirBaseDev } from "../support/base-de-datos";

type RegistroListaEspera = { email: string; instagram: string | null; origen: string | null };

type BaseDev = {
  // Email único de esta corrida; se borra de la base al terminar el test
  emailUnico: () => string;
  registro: (email: string) => Promise<RegistroListaEspera | undefined>;
  nombresDelDrop: (drop: number) => Promise<string[]>;
};

type Fixtures = {
  guardiaDeEscritura: void;
  erroresDeConsola: string[];
  landing: LandingPage;
  formulario: FormularioEspera;
  catalogo: CatalogoDrop;
  baseDev: BaseDev;
};

const METODOS_DE_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

export const test = base.extend<Fixtures>({
  // Automática en todos los tests: cualquier pedido que no sea de lectura a una API que no sea local
  // se corta y hace fallar el test. Ningún test puede escribir en producción, ni por error.
  // Los mocks de page.route tienen prioridad sobre esta ruta del contexto, así que no la afectan.
  guardiaDeEscritura: [
    async ({ context }, use) => {
      const bloqueados: string[] = [];
      await context.route("**/api/**", async (route) => {
        const pedido = route.request();
        if (!METODOS_DE_LECTURA.has(pedido.method()) && !esHostLocal(pedido.url())) {
          bloqueados.push(`${pedido.method()} ${new URL(pedido.url()).origin}${new URL(pedido.url()).pathname}`);
          return route.abort("blockedbyclient");
        }
        return route.fallback();
      });
      await use();
      expect(bloqueados, "Pedidos de escritura bloqueados hacia una API no local").toEqual([]);
    },
    { auto: true },
  ],

  erroresDeConsola: async ({ page }, use) => {
    const errores: string[] = [];
    page.on("console", (mensaje) => {
      if (mensaje.type() === "error") errores.push(mensaje.text());
    });
    page.on("pageerror", (error) => errores.push(error.message));
    await use(errores);
  },

  landing: async ({ page }, use) => use(new LandingPage(page)),
  formulario: async ({ page }, use) => use(new FormularioEspera(page)),
  catalogo: async ({ page }, use) => use(new CatalogoDrop(page)),

  // Acceso a la base dev para los tests de integración. Sin permiso explícito se saltea el test;
  // si el entorno no es seguro (sitio publicado o base de producción) falla antes de tocar nada.
  baseDev: async ({}, use, testInfo) => {
    if (process.env.E2E_ALLOW_DB_WRITES !== "dev") {
      testInfo.skip(true, "Integración desactivada: definí E2E_ALLOW_DB_WRITES=dev para correrla contra la base dev.");
    }
    const motivo = motivoParaNoEscribir();
    if (motivo) throw new Error(`Integración bloqueada: ${motivo}.`);

    const pool = abrirBaseDev();
    const creados: string[] = [];
    try {
      await use({
        emailUnico: () => {
          const email = emailDePrueba();
          creados.push(email);
          return email;
        },
        registro: async (email) => {
          const { rows } = await pool.query(
            "SELECT email, instagram, origen FROM lista_espera WHERE email = $1",
            [email]
          );
          return rows[0];
        },
        nombresDelDrop: async (drop) => {
          const { rows } = await pool.query(
            "SELECT nombre FROM productos WHERE drop_numero = $1 ORDER BY numero",
            [drop]
          );
          return rows.map((fila: { nombre: string }) => fila.nombre);
        },
      });
    } finally {
      // Limpieza: solo lo que creó este test, por email exacto
      if (creados.length > 0) {
        await pool.query("DELETE FROM lista_espera WHERE email = ANY($1)", [creados]);
      }
      await pool.end();
    }
  },
});

export { expect };
