# Psicología de marketing aplicada a VOW

Adaptación de la skill **Marketing Psychology** de Corey Haines (repo `coreyhaines31/marketingskills`, licencia MIT, © 2025 Corey Haines). Se tomaron los modelos útiles para una marca chica de gym en Argentina y se descartó lo que choca con las reglas de VOW. No se instaló el paquete: solo se adaptan las ideas.

## Filtro de VOW (manda sobre cualquier modelo)

Estas reglas ya viven en `src/agents/reglas-marca.js` y valen para todo lo que se publique:

1. Voseo rioplatense, tono directo, sin humo.
2. **Nada de urgencia o escasez falsa.** La escasez se usa solo si es real y verificable (stock cargado, fecha de cierre real).
3. **Toda cifra tiene que existir en los datos** (stock, anotados, precios, fechas). Si no hay dato, no hay cifra.
4. Máximo un emoji, sin teaser vacío, sin promesas que no se puedan cumplir.
5. Nada de patrones oscuros: no se esconde información, no se pre-selecciona algo que cueste plata, no hay cuenta regresiva inventada.

Prueba rápida antes de publicar: *¿la persona haría la misma elección si viera todo lo que sabemos nosotros?* Si no, no se publica.

## Modelos que sí usamos y cómo

| Modelo | Qué es | Cómo se aplica en VOW |
|---|---|---|
| Reciprocidad | Dar valor primero genera ganas de devolver | Contenido útil de entrenamiento antes de pedir nada; el código de descuento de la lista de espera es un regalo real, no un anzuelo |
| Compromiso y coherencia | Un primer paso chico lleva al siguiente | Anotarse con el mail (paso 1) → seguir en Instagram → comprar en el Drop 00. Un solo pedido por paso |
| Prueba social | Lo que hacen otros orienta | Mostrar anotados, fotos de clientes y comentarios **solo cuando sean reales y verificables**. Con 39 anotados hoy no conviene mostrar el número; se muestra cuando impresione y sea cierto |
| Autoridad | Quien sabe, inspira confianza | Entrenadores y gimnasios reales que usen la ropa, con permiso por escrito. Sin "expertos" inventados |
| Escasez real | Lo limitado se valora | Primera tanda con stock cargado: "quedan N" saliendo del dato. Sin stock real, no se dice |
| Aversión a la pérdida | Duele más perder que ganar | "Tu código vence el [fecha]" (es verdad: 14 días). Nunca "última chance" si no lo es |
| Efecto dotación | Lo que siento mío lo valoro más | El código es "tuyo" y personal; mostrarlo en la tienda ("Consultá tu código") lo hace propio |
| Efecto Zeigarnik | Lo incompleto queda en la cabeza | Series de posts con continuación real ("el jueves mostramos el short"), solo si el jueves se cumple |
| Pratfall (admitir un defecto) | Mostrar un límite genera confianza | "Es una marca nueva, la primera tanda es chica": se dice tal cual |
| Efecto de anclaje | El primer precio sirve de referencia | Mostrar el precio sin descuento y el precio con código, ambos reales |
| Contabilidad mental | $3 por día se siente distinto que $90 por mes | Solo si el cálculo es verdadero y se explica; no se usa para esconder el precio total |
| Ley de Hick | Menos opciones, decisión más fácil | Un solo llamado a la acción por pantalla (hoy: "Unirse"); formularios cortos |
| Energía de activación | Cuanto más fácil el primer paso, más gente lo da | Anotarse pide solo el mail; Instagram es opcional |
| Modelo de Fogg | Conducta = motivación + capacidad + estímulo | Cada pieza pide una acción chica y clara, con el enlace a un toque |
| Regla de pico y final | Se recuerda el momento más fuerte y el final | Cuidar el mensaje de "sumado a la lista", el mail con el código y el empaque del pedido |
| Objetivo gradual | Se acelera al sentir progreso | Barra de pasos en la tienda (carrito → datos → pago) |
| Sesgo del statu quo | Cambiar cuesta | Sacar fricción: pago con Mercado Pago, retiro en persona como opción simple |
| Efecto marco | Cómo se dice cambia cómo se entiende | Decir lo que ganás, no lo que perdés, salvo cuando la pérdida es real (vencimiento del código) |
| Exposición repetida | Ver algo seguido genera familiaridad | Mismos colores, mismas fuentes, mismo tono; constancia de publicación |

## Modelos que NO usamos (o solo con mucho cuidado)

- **Señuelo (decoy)**: crear una opción mala para empujar otra. Con un catálogo chico y honesto no hace falta.
- **Puerta en la cara / pie en la puerta agresivo**: manipula por contraste. No.
- **Cuenta regresiva y "quedan pocas unidades" sin dato**: prohibido por la regla 2.
- **Efecto bandwagon con números inflados** ("miles ya se sumaron"): prohibido por la regla 3.
- **Sunk cost / culpa**: nunca se le hace sentir mal a nadie por no comprar.
- **Pre-seleccionar extras de pago** (opt-out): no.

## Cómo se aplica en el día a día

**Posts de Instagram.** Antes de aprobar una pieza se revisa:

- ¿El gancho (primeras palabras) promete algo concreto y cumplible? (el estratega ya limita a 12 palabras)
- ¿Pide una sola acción? (guardar, mandar a alguien, anotarse)
- ¿Cada cifra sale de un dato real?
- ¿Hay prueba (foto, número, caso real) en vez de adjetivos?

**Lista de espera y lanzamiento.**

- Quien se anota recibe valor real: aviso del lanzamiento y un código personal para el Drop 00 (y otro para el Drop 01 si se anotó antes del 00).
- Mensajes con fecha real de vencimiento del código; cuando no hay fecha confirmada de lanzamiento, no se inventa.
- Después de comprar: agradecimiento, qué pasa ahora y cuándo llega. Un buen final de experiencia vale más que un descuento.

**Web.** Un llamado principal por pantalla; bloque de confianza (cómo pagás, cómo recibís, qué hacemos con tus datos) cerca del formulario y de la tienda; texto de producto con lo que es, no con lo que "sentirás".

## Cómo probar si funciona

Un cambio de mensaje por vez, con una métrica clara (mirar `docs/rendimiento`): anotados por origen (`?origen=`), guardados y enviados por alcance en Instagram, y compras con código. Si una técnica no mueve el número en dos o tres piezas, se descarta.
