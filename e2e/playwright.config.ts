import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { baseURL, esLocal } from "./support/entorno";

// Un id por corrida, compartido con los workers (heredan el entorno del proceso principal).
// En CI se usa el id de la ejecución de GitHub Actions para que sea rastreable.
process.env.E2E_RUN_ID ??= process.env.GITHUB_RUN_ID
  ? `gh${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`
  : randomUUID().slice(0, 8);

const enCI = !!process.env.CI;

// Contra un sitio publicado solo corren los @smoke, en todos los projects, pase lo que pase en la línea de comandos.
const soloSmoke = esLocal ? {} : { grep: /@smoke/ };
// Accesibilidad e integración alcanzan con un navegador.
const soloEnChromium = /@a11y|@integracion/;

export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  globalTeardown: "./support/teardown-global.ts",
  fullyParallel: true,
  forbidOnly: enCI,
  retries: enCI ? 2 : 0,
  workers: enCI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  use: {
    baseURL,
    locale: "es-AR",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, ...soloSmoke },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
      grepInvert: soloEnChromium,
      ...soloSmoke,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
      grepInvert: soloEnChromium,
      ...soloSmoke,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grepInvert: soloEnChromium, ...soloSmoke },
  ],
  // Solo en local: API (con la base del .env, que tiene que ser dev) y landing compilada como en producción.
  // VITE_API_URL vacía a la fuerza: la landing llama a /api en su mismo origen y Vite lo reenvía a la API local,
  // aunque el .env apunte a otra API.
  webServer: esLocal
    ? [
        {
          command: "npm run servidor",
          cwd: "..",
          url: "http://localhost:3000/api/salud",
          reuseExistingServer: !enCI,
          timeout: 60_000,
        },
        {
          command: "npm --prefix web run build && npm --prefix web run preview -- --port 4173 --strictPort",
          cwd: "..",
          url: "http://localhost:4173",
          env: { VITE_API_URL: "" },
          reuseExistingServer: !enCI,
          timeout: 120_000,
        },
      ]
    : undefined,
});
