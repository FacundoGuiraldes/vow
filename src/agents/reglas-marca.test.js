import test from "node:test";
import assert from "node:assert/strict";
import { revisarReglas, revisarGuion, revisarTextoAlPublico, cifrasNoPermitidas } from "./reglas-marca.js";

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

test("rechaza nombrar elementos del gimnasio, pero no el producto", () => {
  for (const texto of ["Tu palabra primero. Después la barra.", "Sin mancuernas no hay promesa", "Más pesas", "Los fierros no mienten"]) {
    assert.deepEqual(reglasDe(texto), ["nombra elementos del gimnasio"], texto);
  }
  assert.deepEqual(revisarReglas("Grips y straps hechos para entrenar"), []);
  assert.deepEqual(revisarReglas("Una barrera menos"), []);
});

test("la promesa no se escribe a mano ni en papel", () => {
  assert.deepEqual(reglasDe("Escribila a mano con lapicera"), ["promesa en papel"]);
  assert.deepEqual(reglasDe("Una cartulina beige"), ["promesa en papel"]);
  assert.deepEqual(revisarReglas("Escribí tu promesa. Después cumplila."), []);
});

test("lo que ve el público no explica la marca por dentro", () => {
  assert.deepEqual(revisarTextoAlPublico("Beige y bordó: nuestra paleta").map((p) => p.regla), ["explica la marca por dentro"]);
  assert.deepEqual(revisarTextoAlPublico("La tipografía es Unbounded").length, 1);
  assert.deepEqual(revisarTextoAlPublico("Firmá lo que vas a sostener"), []);
});

test("el guion puede nombrar algo para descartarlo, pero no para pedirlo", () => {
  const reglas = (t) => revisarGuion(t).map((p) => p.regla);
  assert.deepEqual(reglas("No aparece papel, lapicera ni nada escrito a mano."), []);
  assert.deepEqual(reglas("Tercera lámina: el link. No se habla de lo que todavía no hay."), []);
  assert.deepEqual(reglas("Entran unas manos que escriben con lapicera."), ["promesa en papel"]);
  assert.deepEqual(reglas("Primera lámina: todavía no hay prenda, pero llega."), ["anuncia lo que falta"]);
  // el resto de las reglas no se perdona nunca, ni con negación
  assert.deepEqual(reglas("No es una pieza para decir modo bestia."), ["presumir"]);
});
