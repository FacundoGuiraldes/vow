import test from "node:test";
import assert from "node:assert/strict";
import { revisarReglas, cifrasNoPermitidas } from "./reglas-marca.js";

const reglasDe = (texto) => revisarReglas(texto).map((p) => p.regla);

test("un texto en voseo, sobrio y sin promesas pasa", () => {
  assert.deepEqual(revisarReglas("Entrená por vos. Tu promesa. Anotate en la lista."), []);
  assert.deepEqual(revisarReglas("Anotate en la lista antes del Drop 01."), []);
});

test("rechaza la motivación vacía", () => {
  assert.deepEqual(reglasDe("Sin excusas, a entrenar"), ["motivación vacía"]);
  assert.deepEqual(reglasDe("Sé tu mejor versión"), ["motivación vacía"]);
});

test("rechaza promesas de resultados físicos o de salud", () => {
  for (const texto of ["Quemá grasa rápido", "Ganá músculo en un mes", "Evitá lesiones", "Te hace más fuerte"]) {
    assert.deepEqual(reglasDe(texto), ["promesa de resultados físicos"], texto);
  }
});

test("rechaza la urgencia falsa", () => {
  for (const texto of ["Últimas unidades", "Solo hoy", "No te lo pierdas"]) {
    assert.deepEqual(reglasDe(texto), ["urgencia falsa"], texto);
  }
});

test("rechaza presumir y el inglés innecesario", () => {
  assert.deepEqual(reglasDe("Modo bestia"), ["presumir"]);
  assert.deepEqual(reglasDe("No pain no gain"), ["inglés innecesario"]);
  assert.deepEqual(reglasDe("Un nuevo aesthetic"), ["inglés innecesario"]);
});

test("rechaza lo que no está en voseo, incluso con tilde", () => {
  assert.deepEqual(reglasDe("Tú puedes lograrlo"), ["no está en voseo"]);
  assert.deepEqual(reglasDe("Usted puede anotarse"), ["no está en voseo"]);
  assert.deepEqual(reglasDe("Si quieres, anótate"), ["no está en voseo"]);
});

test('"drop" solo se acepta como "Drop 01"', () => {
  assert.deepEqual(reglasDe("El drop abre pronto"), ['"drop" fuera de "Drop 01"']);
  assert.deepEqual(reglasDe("Drop 01"), []);
});

test("rechaza cadenas de exclamaciones y exceso de emojis", () => {
  assert.deepEqual(reglasDe("Anotate!!"), ["exceso de exclamaciones"]);
  assert.deepEqual(reglasDe("Vamos 🔥🔥"), ["demasiados emojis"]);
  assert.deepEqual(revisarReglas("Anotate en la lista ↓"), []);
});

test("las cifras solo se aceptan si están en los datos permitidos", () => {
  assert.deepEqual(cifrasNoPermitidas("Drop 01 abre pronto"), []);
  assert.deepEqual(cifrasNoPermitidas("Probamos 5 straps y 3,5 kilos"), ["5", "3,5"]);
  assert.deepEqual(cifrasNoPermitidas("Probamos 5 straps", ["5"]), []);
});

test("rechaza anunciar lo que falta", () => {
  assert.deepEqual(reglasDe("Todavía no hay prenda para mostrarte"), ["anuncia lo que falta"]);
  assert.deepEqual(reglasDe("Todavía no tenemos stock"), ["anuncia lo que falta"]);
  assert.deepEqual(revisarReglas("Todavía estamos diseñando la etiqueta"), []);
});
