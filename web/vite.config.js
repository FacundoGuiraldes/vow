import { defineConfig } from 'vite';

// Las variables se leen del .env de la raíz del repo. Vite solo expone al
// navegador las que empiezan con VITE_ (ej. VITE_API_URL); el resto no llega al bundle.
export default defineConfig({
  envDir: '..',
  server: {
    host: true
  }
});
