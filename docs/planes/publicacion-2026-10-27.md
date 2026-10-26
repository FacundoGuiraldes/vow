# Plan de publicación · martes 27/10/2026 · carrusel de la promesa

**Estado:** propuesta para aprobación final de Facundo. No se publica nada hasta que él lo apruebe. La pieza es la ya aprobada en `docs/piezas/2026-10-27-carrusel-promesa.md`; este plan agrega el detalle de salida y la revisión de diseño.

## Por qué esta pieza
- Es la segunda publicación de fondo de la cuenta y desarrolla el pilar promesa, que el carrusel de presentación (19/10) dejó abierto con dos láminas guardadas a propósito.
- Formato carrusel: es el que mejor interacción sobre alcance tuvo hasta ahora (6.13% contra 3.47% del reel, `docs/rendimiento/rendimiento-2026-10-21.md`). Es una muestra de una sola pieza por tipo: se toma como señal, no como conclusión.
- No muestra producto ni personas, así que no depende de material por filmar ni choca con las reglas del Drop 00.

## Calendario
| Cuándo | Qué | Responsable |
|---|---|---|
| Domingo 25/10 y lunes 26/10 | Facundo mira las 5 láminas y aprueba o pide cambios | Facundo |
| Martes 27/10, 12:00 aprox. (hora argentina) | Publicación del carrusel. El primer carrusel salió a las 12:02 y funcionó; se repite el horario para comparar | Facundo |
| Martes 27/10, primeras 2 horas | Responder los comentarios con voseo, breve y sin exclamaciones | Facundo |
| Jueves 29/10 | Medir alcance e interacciones con un informe de rendimiento (docs/rendimiento/) y comparar con el carrusel del 19/10 | Equipo de ejecución |

## Láminas (revisadas una por una)
| N.º | Texto | Fondo | Revisión |
|---|---|---|---|
| 1 | Cumplite a vos primero | negro | Gancho aprobado. Portada oscura a propósito para contrastar en la grilla con la presentación (clara). Lectura clara, acento bordó mínimo |
| 2 | Lo que firmás con vos no se rompe | hueso | Gancho aprobado |
| 3 | El trabajo diario no busca aplausos | negro | Gancho aprobado |
| 4 | Construí en silencio. Que hable el tiempo | hueso | Gancho aprobado. Ya aparece en la lámina 5 de la presentación del 19/10: repetición deliberada, que refuerza la idea |
| 5 | Anotate en la lista de espera. | beige, "link en la bio" | Única acción de la pieza |

Controles de diseño sobre las imágenes ya generadas (láminas 1 y 5 vistas): una frase por lámina, mucho espacio vacío, logo abajo a la izquierda, bordó solo como línea corta. Tipografía y colores de la landing. Sin ilustraciones, producto ni personas.

Un detalle para mirar antes de aprobar: en la tipografía Unbounded en peso fuerte, algunas letras (E, M) muestran un corte chico en el trazo en las láminas 1 y 5. Si a Facundo no le gusta, se ajusta el peso en `src/disenio/carrusel.js` y se regenera con `npm run laminas`. No se tocó nada.

## Epígrafe (listo para pegar)
> Lo que te prometés a vos no necesita público. Anotate en la lista de espera: link en la bio.

Variante más corta, por si prefiere:
> Una promesa con vos. Anotate en la lista de espera: link en la bio.

## Texto alternativo de las imágenes (accesibilidad)
1. Fondo negro con el texto "Cumplite a vos primero".
2. Fondo hueso con el texto "Lo que firmás con vos no se rompe".
3. Fondo negro con el texto "El trabajo diario no busca aplausos".
4. Fondo hueso con el texto "Construí en silencio. Que hable el tiempo".
5. Fondo beige con el texto "Anotate en la lista de espera. Link en la bio".

## Revisión contra el cerebro de marca
- Voseo en todo el texto, sin signos de exclamación, sin emojis, sin motivación vacía.
- Sin resultados físicos, sin urgencia falsa, sin elementos de gimnasio, sin "voto".
- Cifras: ninguna en el texto de la pieza.
- No se nombra el Drop 00 ni productos, precios o stock.
- Una sola acción: anotarse en la lista de espera.
- Ganchos 1 a 4 son los aprobados por Facundo; no se inventó ninguno.

## Checklist de publicación
- [ ] Facundo aprobó las 5 láminas
- [ ] Subir en orden 1 a 5, sin música ni etiquetas
- [ ] Pegar el epígrafe y cargar el texto alternativo
- [ ] Confirmar que el link de la bio lleva a la lista de espera
- [ ] Publicar a las 12:00 aprox.
- [ ] Responder comentarios las primeras 2 horas

## Si Facundo prefiere otra pieza para el martes
Hay un reel armado en `docs/piezas/2026-11-02-reel-promesa.md` (para el 2/11). Adelantarlo exigiría filmar antes del martes; no se recomienda.
