# Legal y confianza: qué está hecho y qué falta

Última revisión: 30/10/2026. **No es asesoramiento legal.** Antes de abrir la venta, que un abogado o contador revise las páginas legales de la web (páginas `web/privacidad/`, `web/terminos/`, `web/reembolsos/`, `web/cookies/` y `web/arrepentimiento/`; el home solo enlaza a ellas desde el pie).

## Ya está en la web

| Tema | Qué se hizo |
|---|---|
| Privacidad | Política ampliada: datos de lista de espera y de compra, base legal, proveedores, plazos, baja, derechos y autoridad de control (AAIP) |
| Términos y condiciones | Quién vende, precios, pago, entrega, códigos, arrepentimiento, propiedad intelectual, ley aplicable y Defensa del Consumidor |
| Reembolsos | Arrepentimiento de 10 días (art. 34, Ley 24.240), gastos de devolución a cargo de VOW, garantía legal (arts. 11 a 18), reembolso por el mismo medio de pago |
| Cookies | La web **no usa cookies ni almacenamiento local, ni analítica, ni contenido embebido**. Verificado en un navegador real (cero cookies, cero `localStorage`, un solo origen de red). Por eso no hay cartel de cookies |
| Tipografías | Se alojan en el propio sitio (antes se pedían a Google Fonts, que recibía la IP de cada visita) |
| Consentimiento | Lista de espera: casilla sin tildar de fábrica, obligatoria en el navegador **y en el servidor** (`consentimiento: true`). Tienda: casilla obligatoria de términos, reembolsos y privacidad antes de pagar |
| Botón de arrepentimiento | Enlace destacado en el pie y formulario `#arrepentimiento` sin registro. El servidor devuelve un código `ARR-XXXXXX` en el momento (la Res. 424/2020 pide informarlo dentro de 24 horas por el mismo medio) y avisa por mail a la cuenta de VOW. Los registros quedan en el estado `arrepentimientos` |
| Datos mínimos | Lista de espera: mail (obligatorio) e Instagram (opcional). Compra: nombre, mail, teléfono y, solo con envío, dirección. No hay cuentas ni datos de tarjeta |
| Accesibilidad | Prueba automática WCAG 2.1 AA en verde, formulario completo con teclado (incluida la casilla), foco visible, etiquetas en todos los campos, textos alternativos en las imágenes, botones con texto claro, `prefers-reduced-motion` |
| Reseñas y afirmaciones | No hay reseñas ni testimonios en la web. Se sacó "Primera tanda limitada" de la descripción para redes. El número de anotados no se muestra |

## Falta antes de abrir la venta (lo tiene que cargar Facundo)

Los datos del vendedor se cargan en `web/src/negocio.js`; lo que está en `null` no se muestra. Hoy se muestra solo marca, responsable, mail, Instagram y país.

1. **CUIT, razón social y condición frente al IVA** (monotributo o responsable inscripto) y **domicilio** de contacto. *Actualización 24/11/2026: CUIT, razón social y condición (Responsable Monotributo) ya están cargados desde la constancia de ARCA; el domicilio publicado es el de atención y retiro (Gdor. Marcelino Ugarte 2257, Olivos). Conviene que el contador confirme que alcanza como domicilio del proveedor.* La normativa de defensa del consumidor pide identificar al proveedor; sin estos datos no conviene vender.
2. **Inscripción como contribuyente** y facturación electrónica de las ventas. *Actualización 24/11/2026: Facundo ya agregó las categorías de monotributo para vender mercadería y tiene punto de venta habilitado para facturar. Queda emitir la factura de cada venta.*
3. **Registro de la base de datos** de la lista de espera ante la AAIP (Ley 25.326, Registro Nacional de Bases de Datos). Consultar con un abogado si corresponde y cuándo.
4. **Confirmar la política de devolución**: los textos prometen que VOW paga la devolución por arrepentimiento (lo dice la ley) y que el reembolso va por Mercado Pago. Confirmar plazos reales y quién atiende `vow2026ar@gmail.com`.
5. **Responder los arrepentimientos**: cada uno llega por mail a la cuenta de VOW con su código; hay que contestar por mail y coordinar la devolución.
6. **Derechos de las imágenes**: confirmar el origen de `web/public/img/coming-soon.webp` (¿imagen generada con IA, diseño propio o de un tercero?) y del logo. Si es de IA, revisar los términos de la herramienta para uso comercial. Cuando haya fotos reales de producto, tener la autorización de quien las saque y de las personas que aparezcan.
7. **Marca**: buscar y registrar "VOW" en el INPI (clases 25 y 35) para evitar un conflicto con una marca existente. *Actualización 24/11/2026: el trámite ya está solicitado y está en curso; se vende mientras tanto.*
8. **Fecha de lanzamiento**: la web anuncia el Drop 00 para el lunes 30 de noviembre de 2026 (cinta, etiqueta del hero, nota del hero, preguntas y descripción para redes) y el Drop 01 en 2027. *Después del lanzamiento hay que quitar el "lunes 30 de noviembre" de esos textos.* Si cambia el plan, actualizar `web/src/content.js` y `web/index.html`.
9. **Promesa del descuento**: la web dice que anotarse da un código para la primera compra. Hay que cumplirlo (ver `docs/lanzamiento.md`).
10. **Mails**: ya llevan opción de baja. Atender las bajas a tiempo y sacar de la lista a quien las pida.
11. **Si algún día se agrega analítica, píxeles o videos embebidos**: hay que actualizar la política de cookies y pedir consentimiento antes de activarlos.

## Riesgos que conviene tener presentes

- Un abogado debería validar el texto de arrepentimiento y garantías. La Resolución 424/2020 exige un enlace de acceso fácil y directo desde la página de inicio, en lugar destacado; hoy está en el pie con formato de botón.
- Mientras la venta esté cerrada, el formulario de arrepentimiento igual responde (no hace daño), pero sin compras no tiene uso.
- Las cifras y promesas públicas (descuento, fechas, stock) tienen que coincidir siempre con lo que se cumple.
- Los datos se guardan en proveedores del exterior (Neon, Render, Cloudflare, Google): la política lo dice.
- Para vender envíos hay que dar un plazo estimado realista y respetarlo.
