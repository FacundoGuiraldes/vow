---
name: vow-diseno-web
description: Reglas de diseño y movimiento para la web de VOW (landing, tienda, páginas legales). Usala antes de tocar web/src o web/index.html, o cuando se pida mejorar el diseño, animaciones, accesibilidad o contraste.
---

# Diseño web de VOW

Leé primero `docs/marca/guia-de-diseno-web.md`: es la fuente completa. Resumen para trabajar rápido:

1. **La identidad de VOW manda.** Paleta (negro, hueso, beige, gris topo, bordó), tipografías (Unbounded, Space Grotesk, Space Mono), estética de plano técnico (líneas punteadas, marcas +, numeración), esquinas rectas, voseo. Si una regla externa choca, se descarta.
2. **Movimiento (Emil Kowalski, MIT):** curvas `--ease-out` / `--ease-in-out` del `:root`, nunca `ease` genérico; 120–200 ms en botones y hovers, 300–500 ms en entradas; nada nace de `scale(0)`; `:active` con `scale(0.97)`; transicionar propiedades concretas, no `all`; hover solo bajo `(hover: hover) and (pointer: fine)`; entradas escalonadas; todo respeta `prefers-reduced-motion`.
3. **Cuidado con GSAP:** si GSAP anima el `transform` de un elemento, ese elemento no puede tener `transition: transform` ni `:active { transform }` en CSS (se pisan y queda trabado).
4. **Evitar (Impeccable, Apache 2.0):** texto sin contraste AA, jerarquía plana, tarjetas dentro de tarjetas, tres estilos de botón en la misma página, placeholders como etiqueta, espaciado al azar, cifras que cambian de ancho (`tabular-nums`).
5. **Referencia de webs de calidad (Taste):** una idea por pantalla, primer scroll que contesta qué es / para quién / qué hago, prueba de confianza cerca de la acción, formularios cortos.
6. **Antes de dar algo por terminado:** `npm --prefix web run build`, `npx playwright test -c e2e/playwright.config.ts` (incluye accesibilidad WCAG 2.1 AA y teclado) y revisar capturas a 390, 768 y 1440 px.

Las e2e dependen de la estructura (regiones, encabezados, nombres de enlaces): al agregar secciones, no repetir nombres accesibles de las existentes.
