# Evals

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
