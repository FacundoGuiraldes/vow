import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const aqui = (ruta) => resolve(import.meta.dirname, ruta);

// Las variables se leen del .env de la raíz del repo. Vite solo expone al
// navegador las que empiezan con VITE_ (ej. VITE_API_URL); el resto no llega al bundle.
export default defineConfig({
  envDir: '..',
  build: {
    // Una página por documento legal además de la landing
    rollupOptions: {
      input: {
        main: aqui('index.html'),
        privacidad: aqui('privacidad/index.html'),
        terminos: aqui('terminos/index.html'),
        reembolsos: aqui('reembolsos/index.html'),
        cookies: aqui('cookies/index.html'),
        arrepentimiento: aqui('arrepentimiento/index.html')
      }
    }
  },
  server: {
    host: true,
    // Solo desarrollo: aceptar el dominio con el que GitHub Codespaces reenvía el puerto
    // (sin esto Vite responde "Blocked request. This host is not allowed").
    allowedHosts: ['.app.github.dev'],
    // Solo desarrollo: si VITE_API_URL está vacía, la landing llama a /api en su mismo origen;
    // esto lo reenvía a la API local (npm run servidor, puerto 3000).
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
