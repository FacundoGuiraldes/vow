import { defineConfig, loadEnv } from 'vite';

// Mock de POST /api/waitlist para desarrollo local. Se desactiva si se define
// VITE_API_PROXY (ej. VITE_API_PROXY=http://localhost:3000) para usar el backend real.
function waitlistMock() {
  const seen = new Set();
  return {
    name: 'waitlist-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/waitlist', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          let data = {};
          try { data = JSON.parse(body); } catch {}
          const email = String(data.email || '').toLowerCase();
          const send = (status, payload) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            setTimeout(() => res.end(JSON.stringify(payload)), 600);
          };
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(422, { error: 'invalid_email' });
          if (seen.has(email)) return send(409, { error: 'already_registered' });
          if (!data.company) seen.add(email);
          console.log('[waitlist-mock]', data);
          send(201, { ok: true });
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: env.VITE_API_PROXY ? [] : [waitlistMock()],
    server: {
      host: true,
      proxy: env.VITE_API_PROXY ? { '/api': { target: env.VITE_API_PROXY, changeOrigin: true } } : undefined
    }
  };
});
