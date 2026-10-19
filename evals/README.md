# Evals

Hay dos tipos: las **offline** (siempre, gratis, en el CI) y las **online** con la IA real (a mano, gastan plata).

## Offline

Casos fijos para saber si un cambio en las reglas de marca, el Revisor o el Estratega **empeora algo que antes andaba**. No usan IA ni red: cuestan US$ 0 y corren en el CI junto con `npm test`.

```
npm run evals
```

| Archivo | Qué contiene |
|---|---|
| `casos-revisor.json` | Planes completos con el resultado esperado (aprobar o rechazar, y por qué motivo). Incluye los falsos positivos reales que ya corregimos (PR #29, #32, #39). |
| `frases-por-regla.json` | Una frase por cada palabra de cada regla de marca, y frases comunes que **no** tienen que disparar ninguna regla. |
| `ejecutar.js` | El ejecutor. También avisa si alguna regla de marca no tiene ningún caso que la dispare. |
| `evals.test.js` | Hace que `npm test` falle si alguna eval falla, y prueba el propio ejecutor. |

## Cómo agregar un caso

- **Una falla real nueva** (la IA fue rechazada por una regla que se pasó de estricta, o aprobada cuando no debía): agregá un caso a `casos-revisor.json` que reproduzca la falla *antes* de corregir el código. Tiene que fallar, y después de corregir pasar.
- **Una regla nueva**: sumá su frase a `disparan` y al menos un caso de rechazo. Si no, `npm test` falla avisando que la regla no tiene caso.

## Cómo se comprobó que las evals sirven

Se sacó de a una cada palabra de cada regla (mutation testing) y se corrió `npm run evals`: de 44 variantes, 42 hacen fallar las evals. Las 2 restantes son equivalentes (no cambian el comportamiento): `modo bestia` ya lo detecta `bestia`, y `no pain,? no gain` ya lo detecta `gains?`.

## Online: con la IA real

Le piden al Estratega los pedidos de `pedidos-estratega.json` (con y sin producto, con y sin gente, distintas fases) y miden qué porcentaje de planes cumple las reglas, cuánto cuesta cada uno y **qué rechazó más**. Sirven para comparar antes y después de tocar un prompt o una regla.

```
npm run evals:online -- --simulado            # prueba el flujo sin gastar
npm run evals:online                          # con Claude: unos US$ 0,05 por plan, tope de US$ 0,50
npm run evals:online -- --solo base-con-gente --repeticiones 3
npm run evals:online -- --guardar-linea-base  # guarda este resultado como referencia
```

- **Tope de gasto** (`--tope-usd`): si se llega a ese número, el resto de los pedidos se omite.
- **Errores técnicos aparte**: un corte de red no cuenta como plan malo.
- **Línea base** (`linea-base-online.json`): se compara cada corrida contra la última que aceptaste. Como la IA varía, solo avisa si la tasa de aprobación baja más de 15 puntos o el costo por plan sube más de 50 %.
- Los informes completos quedan en `evals/resultados/` (no se suben al repo) e incluyen, de cada plan rechazado, **lo que la IA propuso** y cuántos intentos hizo: sin eso un rechazo es solo un número. Desde GitHub: Actions > **Evals con IA real**.
