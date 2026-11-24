# Fuentes del juego VOW HQ

`web/public/oficina/index.html` es un archivo generado. Se arma con:

    python3 web/fuentes-oficina/asm.py

Partes: `head.html` (CSS), `v1_base.js` (escena, edificios y orden), `v2_mundo.js` (terreno, cielo, día/noche), `v3_edif.js` (edificios), `v4_gente.js` (personajes), `camara.js`, `logo.js`, `ui.js` (paneles, burbujas, protocolo con el servidor) y `old_main.html` (utilidades y lógica de datos: lectura de `/api/programacion/oficina`, notas, cumplir). `asm.py` toma de ahí por número de línea el tramo de utilidades (líneas 1 a 47) y el resto es la lógica de datos; si agregás o sacás líneas en las primeras 47, ajustá el rango en `asm.py`.

El juego solo lee el flujo semanal (`flujo` de la API) y no tiene piezas, aprobaciones ni subida de archivos.

Requiere three.js r128 (se carga desde cdnjs). Después de ensamblar, revisá `git diff` del index.html.
