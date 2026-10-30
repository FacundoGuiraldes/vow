# Imágenes y video con ComfyUI (gratis, en tu PC)

Alternativa gratuita a servicios pagos como Higgsfield. **ComfyUI** (GPL-3.0) corre en tu computadora y genera con modelos abiertos, por ejemplo **Wan 2.2** (Apache 2.0, uso comercial permitido según su ficha). No manda tus prompts a ningún servicio de terceros ni cuesta por uso. Lo que sí necesita es una **placa de video**: el Wan 2.2 de 5B corre en placas tipo RTX 4090 (unos 9 minutos por 5 segundos en 720p); la versión grande pide 80 GB de memoria de video. Sin placa potente no hay video local.

## Qué se integró en el repo

- `src/medios/comfyui.js`: cliente que le habla a ComfyUI por su API (`COMFYUI_URL`, por defecto `http://127.0.0.1:8188`).
- `npm run comfyui -- flujo.json "descripción"`: genera y guarda el archivo en `salida/comfyui/`. **No publica nada.**
- El estilo de VOW se agrega detrás de cada descripción (igual que con las imágenes). El logo y los textos no los dibuja la IA.
- No está conectado al servidor de Render: ese servidor no alcanza tu PC. Es una herramienta tuya, en tu computadora.

## Cómo usarlo

1. Instalá ComfyUI (app de escritorio o desde https://github.com/comfyanonymous/ComfyUI) y descargá el modelo que quieras usar (Wan 2.2 5B desde su plantilla de ComfyUI).
2. Armá el flujo en ComfyUI, en el cuadro de texto del prompt escribí `{{PROMPT}}` y exportalo con **Save (API Format)** a un archivo, por ejemplo `flujo-wan.json`.
3. Con ComfyUI abierto: `npm run comfyui -- flujo-wan.json "gorra negra sobre fondo de concreto, luz suave"`.
4. Revisá el resultado en `salida/comfyui/`. Si te sirve, subilo por el flujo de aprobación de siempre (Telegram / VOW HQ). Nada se publica sin tu confirmación del día.

## Límites

- Probado con pruebas automáticas que simulan a ComfyUI; **no probado contra un ComfyUI real** (este entorno no tiene placa de video). La primera corrida real puede pedir ajustes (por ejemplo, el tipo de nodo que guarda el video).
- Revisá la licencia de cada modelo antes de usarlo comercialmente. LTX-Video, por ejemplo, exige licencia paga si la empresa factura 10 millones de dólares o más al año.
- Todo contenido generado con IA se revisa antes de usarlo: sin urgencia ni escasez falsa y sin cifras que no existan.
