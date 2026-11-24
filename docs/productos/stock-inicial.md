# Drop 00 · stock inicial de accesorios

**Estado:** pedidos hechos, nada llegó todavía. Llegada estimada de los tres productos: entre el 2 y el 4/11/2026 (las gorras, el 04/11).

El **Drop 00** es una tanda chica de accesorios hechos en Argentina para vender y presentar la marca antes del Drop 01. No es parte del Drop 01 (7 productos de ropa y accesorios, en estado concepto, lanzamiento en 2027) y no está en `src/data/drop-01.js`.

## Reglas mientras no lleguen

- **No hay fotos de producto.** Los mockups son diseños para el proveedor: no se presentan como fotos en la landing, en Instagram ni en el catálogo. Tampoco se generan imágenes con IA.
- `imagen` queda en `null` hasta que Facundo saque las fotos reales (luz natural, producto real, sin filtros fuertes).
- Escasez solo si es real: el stock es el de este archivo.
- Venta por Instagram (@vow_ar). No hay carrito ni pago online, y no se construye un checkout.

## Productos

Todo es producción argentina: no pasa por Aduana. Facundo factura como monotributista.

### Gorras · CapShop, pedido #568 (20/10/2026)

| Dato | Valor |
|---|---|
| Modelo del proveedor | GP60162 (tipo dad hat, aspecto lavado) |
| Cantidad | 20: 10 negras y 10 beige |
| Negra | Isotipo VOW bordado al frente y "VOW" bordado en el lateral izquierdo, hilo blanco |
| Beige | Isotipo VOW bordado al frente y "VOW" bordado en el lateral izquierdo, hilo negro |
| Costo | $14.400 por unidad con bordados; 20 u = $288.000 + envío Correo Argentino $18.500 = **$306.500** (**$15.325 por gorra**) |
| Pago | Seña de $153.250 acreditada. Saldo de $153.250 pendiente |
| Entrega estimada | 04/11/2026 |

### Medias · MarfayTextil

| Dato | Valor |
|---|---|
| Cantidad | 11 docenas = 132 pares |
| Costo | $32.500 la docena = **$357.500** (**$2.708 por par**, envío incluido) |
| Pago | Anticipo de $178.750. Saldo de $178.750 pendiente |
| Diseño | Caña 3/4. Isotipo y "VOW" tejidos juntos en el lateral externo superior (isotipo ~55% del ancho de la caña, VOW ~65%). Planta lisa |
| Talles | Grande (37-40) y Súper (41-44) |
| Entrega | **Por confirmar** |

| Estilo | Base | Isotipo y texto |
|---|---|---|
| 1 · Negro Profundo | `#0A0A0A` | Hueso `#ECE8E1` |
| 2 · Hueso | `#ECE8E1` | Negro Profundo `#0A0A0A` |
| 3 · Beige Orgánico | `#CDBFA6` | Negro Profundo `#0A0A0A` |

**Reparto por color y talle: por confirmar.** Lo anotado es 5 docenas de Negro (30 pares por talle), 3 de Hueso (18 por talle) y 3 de Beige (18 por talle), pero una docena puede haber quedado de un solo talle. No usarlo en el catálogo hasta que Facundo lo confirme.

### Shakers · Faurear

| Dato | Valor |
|---|---|
| Cantidad | 20: 10 negros con logo claro y 10 claros (hueso/crema) con logo negro. Ambos con tapa negra |
| Logo | Isotipo con "VOW" debajo |
| Costo | **$125.400** ($6.270 por unidad) |
| Calidad | Facundo vio la muestra: es buena |
| Ficha del proveedor (Faurear) | Capacidad de **700 ml**, resorte mezclador de acero inoxidable, tapa con pico rebatible, logo personalizado |
| Material del vaso y método del logo | **Por confirmar** (la ficha no lo dice). No afirmar "libre de BPA" sin confirmarlo |
| Medidas y peso | **Por medir** con el producto en mano (necesario para Envío Nube y el packaging) |
| Entrega | **Por confirmar** |
| Pago | **Por confirmar** si está completo |

## Inversión

| Producto | Cantidad | Costo por unidad | Total |
|---|---|---|---|
| Gorras | 20 | $15.325 (con envío) | $306.500 |
| Medias | 132 pares | $2.708 por par | $357.500 |
| Shakers | 20 | $6.270 | $125.400 |
| **Total** | | | **$789.400** |

## Stock real del Drop 00 (contado el 24/11/2026)

| Producto | Cantidad |
|---|---|
| Gorra negra | 9 |
| Gorra beige | 9 |
| Shaker negro | 10 |
| Shaker transparente (en el sistema: "claro") | 10 |
| Medias negras (Grande 37-40 / Súper 41-44) | 30 / 30 |
| Medias hueso (Grande / Súper) | 18 / 18 |
| Medias beige (Grande / Súper) | 17 / 18 (Facundo se queda un par Grande) |

El sistema carga este stock una sola vez al arrancar (`src/programacion/stock-inicial.js`).

## Precios y packs (definidos para el Drop 00)

Costos por unidad: gorra $15.325, medias $2.708, shaker $6.270. Precios pensados para una marca que recién arranca: por debajo de las marcas grandes en lo que se compara directo, con los packs como forma de subir el ticket.

| Producto | Precio de lista |
|---|---|
| Gorra | $27.900 |
| Medias (par) | $8.900 |
| Shaker | $11.900 |

| Pack | Incluye | Precio |
|---|---|---|
| **Pledge** | Gorra + par de medias | $32.900 |
| **Kept** | Shaker + par de medias | $17.900 |
| **Oath** | Gorra + par de medias + shaker | $44.900 |
| Medias x2 (sin nombre) | 2 pares | $15.900 |
| Medias x3 (sin nombre) | 3 pares | $22.900 |

- Los nombres Pledge, Kept y Oath están decididos por Facundo. Solo se nombran los packs que combinan productos distintos.
- Con 18 gorras y 20 shakers, como mucho se arman 18 packs que lleven gorra y 20 que lleven shaker, en total entre todos.
- Las medias se eligen por color (negro, hueso, beige) y talle (Grande 37-40, Súper 41-44) en la tienda, la Caja y el bot.

## Por confirmar

- Cuándo se abre la venta del Drop 00 y cuánto detalle se muestra. Hoy lo público es solo "Drop 00 en 2026" (y "Drop 01 en 2027"), sin meses ni días.
- Shakers: material del vaso, método del logo, medidas, peso, entrega y estado del pago. La capacidad ya está (700 ml).
- Entrega de las medias.
- Composición y etiquetado de medias y gorras (composición de fibras, origen y cuidado). Las medias no llevan etiqueta tejida: ver si alcanza con un *hangtag* impreso y consultarlo con un contador.
- Precios finales de venta.
