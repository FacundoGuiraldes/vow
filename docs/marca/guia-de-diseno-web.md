# Guía de diseño web de VOW

Esta guía resume las reglas con las que se diseña y se revisa la web de VOW. Junta tres fuentes y las filtra por la identidad de la marca: **si una regla externa choca con la marca, gana la marca.**

Fuentes (se adoptan las ideas, no se instala nada de terceros):

- **Emil Kowalski**, "Design Engineering" (MIT): reglas de movimiento y detalle.
- **Impeccable** (Apache 2.0): lista de vicios del diseño genérico y criterios de pulido. No se instala la herramienta (descarga binarios, manda telemetría y agrega hooks); se toman sus principios.
- **Taste skill**: referencia de webs de calidad (jerarquía, ritmo, contraste, densidad).

## Lo que no se negocia (identidad VOW)

- Paleta: negro `#0A0A0A`, hueso `#ECE8E1`, beige, gris topo, bordó. Sin degradados de colores, sin sombras difusas, sin morado.
- Tipografías: Unbounded (títulos), Space Grotesk (texto), Space Mono (rótulos y datos).
- Estética de plano técnico: líneas punteadas, marcas de registro (+), numeración de secciones, etiquetas en mono. Taste y Impeccable suelen pedir "menos de dos tipografías" o "sin numeración": acá es parte de la marca y se queda.
- Esquinas rectas en botones y campos (el hero ya las usa; el resto se alinea).
- Voz: voseo rioplatense, sin urgencia falsa, sin cifras que no existan en datos.

## Movimiento (Emil Kowalski)

1. Animar solo lo que gana algo (orientación, respuesta a una acción). Lo que se ve muchas veces no se anima fuerte.
2. Curvas de salida, nunca `ease` genérico: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. Para movimiento en pantalla `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`.
3. Duraciones cortas: botones y hovers 120–200 ms, entradas 300–500 ms. Nada de UI por encima de 600 ms (el scrub del manifiesto es la excepción: lo mueve el scroll).
4. Nada nace de `scale(0)` ni de `opacity: 0` solo: entrar desde `translateY(12px)` y `opacity: 0` o desde `scale(0.96)`.
5. Los botones responden al apretar: `:active { transform: scale(0.97) }`.
6. Transicionar propiedades concretas (`transform`, `opacity`, `background-color`), nunca `transition: all`.
7. Hover solo bajo `@media (hover: hover) and (pointer: fine)`: en el celular no existe.
8. Listas y grupos entran escalonados (30–60 ms entre elementos), no todos juntos.
9. `prefers-reduced-motion`: se quita el movimiento y se mantiene el cambio de estado (colores, opacidad).

## Qué evitar (Impeccable)

- Texto que se pierde: el contraste mínimo es AA (4.5:1 en texto chico, 3:1 en grande). Revisar sobre el negro con opacidades.
- Jerarquía plana: cada pantalla tiene un solo elemento dominante.
- Tarjetas dentro de tarjetas, bordes en todo, íconos decorativos sin función.
- Botones con tres estilos distintos en la misma página.
- Placeholders que hacen de etiqueta (el campo siempre lleva su `label`).
- Espaciado al azar: escala de 4 / 8 / 16 / 24 / 32 / 48 / 64 / 96.
- Cifras que cambian de ancho al actualizarse: `font-variant-numeric: tabular-nums`.
- Títulos con una palabra huérfana: `text-wrap: balance`; párrafos largos con `text-wrap: pretty`.

## Qué tomar de las webs de referencia (Taste)

- Una idea por pantalla, con mucho aire alrededor del elemento principal.
- El primer scroll tiene que contestar tres cosas: qué es, para quién, qué hago ahora.
- Prueba de confianza cerca de la acción (cómo se paga, cómo llega, qué pasa con mis datos).
- Formularios cortos, con feedback inmediato y el botón siempre visible en celular.
- Contenido real antes que decoración: si falta foto de producto, se muestra el concepto con honestidad ("Imagen conceptual"), no una imagen inventada.

## Lista de revisión antes de publicar un cambio visual

- [ ] ¿Se lee todo a 390 px de ancho, sin scroll horizontal?
- [ ] ¿Contraste AA en todos los textos, también sobre negro y sobre la imagen?
- [ ] ¿Cada botón tiene estado hover, foco visible y `:active`?
- [ ] ¿Funciona con `prefers-reduced-motion` y sin JavaScript de animación?
- [ ] ¿Los campos tienen `label`, `autocomplete` y `inputmode` correctos?
- [ ] ¿Alguna cifra o promesa que no exista en los datos reales? Si la hay, se saca.
- [ ] `npm test` y los tests e2e en verde.
