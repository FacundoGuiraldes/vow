#!/usr/bin/env bash
# Levanta la API (puerto 3000) y la landing (puerto 5173) en segundo plano.
# Lo corre el Codespace cada vez que arranca; también se puede correr a mano: npm run dev
set -u
cd "$(dirname "$0")/.."
mkdir -p .devcontainer/logs

puerto_ocupado() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

if [ ! -f .env ]; then
  echo "Falta el archivo .env (copiá .env.example y completalo). La API no se va a poder conectar a la base."
fi

if puerto_ocupado 3000; then
  echo "La API ya está corriendo en el puerto 3000."
else
  setsid nohup npm run servidor > .devcontainer/logs/api.log 2>&1 &
  echo "API iniciada en el puerto 3000 (log: .devcontainer/logs/api.log)."
fi

if puerto_ocupado 5173; then
  echo "La landing ya está corriendo en el puerto 5173."
else
  setsid nohup npm --prefix web run dev -- --port 5173 --strictPort > .devcontainer/logs/landing.log 2>&1 &
  echo "Landing iniciada en el puerto 5173 (log: .devcontainer/logs/landing.log)."
fi
