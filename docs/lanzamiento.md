# Lanzamiento del Drop 00

Guía viva del lanzamiento: qué está listo, qué falta y en qué orden se hace el día de abrir la venta. Se actualiza a medida que se cierran pendientes.

**Drop 00** es el primer lanzamiento: stock real (gorras, shakers y medias) vendido con la tienda propia de VOW. **Drop 01** es la colección que sigue (el catálogo de 7 piezas que hoy muestra la landing).

## Dónde estamos hoy

| Área | Estado |
|---|---|
| Landing y lista de espera | Publicada y monitoreada. Al 29/10/2026 había 39 personas anotadas (la tabla `lista_espera` es la fuente de verdad). |
| Tienda propia con Mercado Pago (Checkout Pro) | Terminada y probada de punta a punta con un Mercado Pago simulado. **Cerrada al público** (`VENTA_ABIERTA` sin activar). |
| Stock | Almacén de VOW HQ con gorras, shakers (10 negros y 10 claros) y medias. Es la única fuente de verdad: el pago aprobado descuenta solo. |
| Código de descuento de la lista de espera | Terminado: 10 %, un solo uso, personal, vence a los `DESCUENTO_LISTA_DIAS` días (14) de generado. Cada código pertenece a un drop. |
| Mail con el código | Terminado, por la API de Gmail desde la cuenta de VOW. Técnicamente perfecto (10/10 en mail-tester), pero **cae en spam** porque el remitente es nuevo. |
| "Consultá tu código" en la tienda | Terminado: quien se anotó escribe su mail y ve su código sin depender del mail. Solo funciona con la venta abierta. |
| Publicación automática de Instagram | Reloj armado en cron-job.org (cada minuto, con respaldo en GitHub Actions) y `INSTAGRAM_PERMITIR_PUBLICAR=1`. Falta confirmar con una publicación real. |
| Envío | Por ahora retiro en persona o costo fijo (`ENVIO_COSTO_FIJO`). Cotización automática con MiCorreo pendiente. |

## Cómo funcionan los códigos

- **Drop 00:** toda persona anotada en la lista de espera hasta el lanzamiento recibe un código del 10 % válido solo en el Drop 00. Lo recibe por mail (lo dispara Facundo a mano desde el bot de Telegram) o lo ve en "Consultá tu código".
- **Drop 01:** como agradecimiento, esas mismas personas (las anotadas **antes** del lanzamiento del 00) reciben un código nuevo del 10 % válido solo en el Drop 01. El código del 00 deja de servir en ese momento, se haya usado o no. Quien se anote después del lanzamiento del 00 no recibe código del 01.
- **No acumulables:** cada persona tiene un solo código por drop y el pedido admite un único código.
- **Para pasar al Drop 01:** en Render se cambia `DROP_ACTUAL=01` y se carga `LISTA_CORTE` con la fecha de lanzamiento del Drop 00 (por ejemplo `2026-11-14T00:00:00-03:00`, en hora de Argentina). Sin `LISTA_CORTE`, los códigos quedan apagados y el log lo avisa.

## Antes de abrir la venta

Pendientes que bloquean o conviene cerrar antes de vender:

- [ ] **Compra real de punta a punta con Mercado Pago.** Hace falta una cuenta vendedora de prueba con sus propias credenciales (una cuenta real no puede cobrarle a un comprador de prueba). Confirmar que llega el aviso, se descuenta el stock y el código queda usado. Las compras de prueba se anulan después para que el stock coincida con el físico.
- [ ] **Textos legales.** La política de privacidad solo cubre la lista de espera: hay que ampliarla (pedidos, domicilios, códigos) y sumar términos de venta y botón de arrepentimiento. Conviene que los revise un abogado o contador.
- [ ] **Envío.** Decidir: retiro + costo fijo, o cotización con MiCorreo (requiere sus credenciales y el peso y las medidas de cada producto).
- [ ] **Fotos reales** de los productos para la tienda.
- [ ] **Stock real cargado** y ventas de prueba anuladas, para que el Almacén coincida con lo que hay en mano.
- [ ] **Precios finales** en el sistema (el servidor nunca toma precios del navegador).
- [ ] **Publicación de Instagram confirmada** con una publicación real (el token de Meta vence cada 60 días).

## El día del lanzamiento

1. Revisar que el último deploy de Render diga "Live" y que `GET /api/programacion/ventas/estado` responda `{"abierta":false}` (con la venta cerrada solo muestra eso).
2. Poner `VENTA_ABIERTA=1` en Render. El servicio se reinicia solo.
3. Probar "Consultá tu código" con un mail propio que esté en la lista. Tiene que mostrar el código y el campo de la tienda lo tiene que aceptar.
4. Mandar los mails desde el bot de Telegram en tandas chicas (5 a 10 personas): `ver`, después `enviar` confirmando la cantidad. La respuesta de cada mail se mira antes de seguir con más.
5. Avisar en Instagram que los anotados tienen un 10 % y que lo pueden consultar en la tienda con el mail con el que se anotaron. Así nadie depende de que el mail llegue a la bandeja.
6. Anotar la fecha y hora del lanzamiento: es el `LISTA_CORTE` del Drop 01.

## Mails y spam

- El mail está bien armado, pero un remitente nuevo en Gmail empieza sin reputación. Lo que ayuda: tandas chicas, que la gente responda o marque "no es spam", y avisar por Instagram antes.
- "Consultá tu código" existe justamente para no depender del mail.
- **Más adelante:** para mandar novedades a toda la lista conviene un dominio propio y un servicio de envío (por ejemplo Resend) con SPF/DKIM/DMARC del dominio. Es opcional para el Drop 00.
- Hay una baja manual: quien responda pidiendo la baja se borra de la lista.

## Después del Drop 00

- Pasar a `DROP_ACTUAL=01` con `LISTA_CORTE` (ver arriba) y mandar los códigos de agradecimiento.
- Medir el rendimiento de @vow_ar con datos propios (`npm run rendimiento`) y ajustar el plan de contenido.
- Evaluar agentes de atención al cliente e inventario cuando haya volumen.

## Ideas abiertas (sin fecha)

- Consulta de marca en el INPI.
- Dominio propio para la landing, el mail y la API (mejora reputación de mail y quita el `.pages.dev`).
- Pasar la API a un plan que no se duerma, si el volumen lo justifica.
