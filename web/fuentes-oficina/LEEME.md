# Fuentes del juego VOW HQ

`web/public/oficina/index.html` es un archivo generado. Se arma con:

    python3 web/fuentes-oficina/asm.py

Partes: `head.html` (CSS), `v1_base.js` (escena, edificios y orden), `v2_mundo.js` (terreno, cielo, día/noche), `v3_edif.js` (edificios), `v4_gente.js` (personajes), `camara.js`, `logo.js`, `ui.js` (paneles, burbujas, protocolo con el servidor) y `old_main.html`, de donde `asm.py` toma por número de línea los tramos de lógica de datos (al editarlo, conservá la cantidad de líneas).

Requiere three.js r128 (se carga desde cdnjs). Después de ensamblar, revisá `git diff` del index.html.
