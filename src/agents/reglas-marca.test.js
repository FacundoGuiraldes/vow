import test from "node:test";
import assert from "node:assert/strict";
import { revisarReglas, revisarGuion, revisarTextoAlPublico, cifrasNoPermitidas, contextoDeCifra, CIFRAS_PERMITIDAS } from "./reglas-marca.js";

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

test("numerar las láminas o escenas no cuenta como una cifra, pero una cifra suelta sí", () => {
  assert.deepEqual(cifrasNoPermitidas("Lámina 1: el gancho. Lámina 2: la frase. Story 3 y 4. Paso 5."), []);
  assert.deepEqual(cifrasNoPermitidas("Lámina 2: probamos 5 straps"), ["5"]);
  assert.deepEqual(cifrasNoPermitidas("Slide 1 a 3 con Drop 01"), []);
});

test("los marcadores de lista de un guion no cuentan como cifras, pero una cifra dentro de la frase sí", () => {
  assert.deepEqual(cifrasNoPermitidas("1) Aparece el gancho. 2) Entra la frase. 3) Sin ruido. 4) Cierre."), []);
  assert.deepEqual(cifrasNoPermitidas("Primero:\n1. Fondo negro\n2. Frase sola\n3. Cierre"), []);
  assert.deepEqual(cifrasNoPermitidas("1) Probamos 5 straps"), ["5"]);
  assert.deepEqual(cifrasNoPermitidas("Cuesta 3.500 pesos"), ["3.500"]);
  assert.deepEqual(cifrasNoPermitidas("Drop 01 abre pronto"), []);
});

test("las únicas cifras de la marca son 01 (Drop 01) y 2027 (el año del lanzamiento)", () => {
  assert.deepEqual(CIFRAS_PERMITIDAS, ["01", "2027"]);
  assert.deepEqual(cifrasNoPermitidas("Drop 01 en 2027."), []);
  assert.deepEqual(cifrasNoPermitidas("Drop 01 en 2028."), ["2028"]);
  assert.deepEqual(cifrasNoPermitidas("Sale en marzo de 2027."), []); // el año es dato real
  assert.deepEqual(cifrasNoPermitidas("Sale el 15 de marzo de 2027."), ["15"]); // un día inventado no
  assert.deepEqual(cifrasNoPermitidas("Somos 500."), ["500"]);
});

test("contextoDeCifra muestra el pedacito de texto donde está el número, con puntos suspensivos si se corta", () => {
  assert.equal(contextoDeCifra("uno dos tres cuatro 5 seis siete ocho nueve", "5", 6), "…uatro 5 seis…");
  assert.equal(contextoDeCifra("abcdefghij 12 klmnopqrst", "12", 2), "…j 12 k…");
});

test("contextoDeCifra no pone puntos suspensivos si el texto entra entero", () => {
  assert.equal(contextoDeCifra("Plano fijo de 3 segundos", "3"), "Plano fijo de 3 segundos");
});

test("contextoDeCifra busca el número suelto: el 3 de 13 no cuenta", () => {
  assert.equal(contextoDeCifra("hay 13 cosas y 3 más", "3", 3), "…y 3 má…");
});

test("contextoDeCifra devuelve una sola línea y cambia las comillas dobles por simples (para no romper el formato del error)", () => {
  assert.equal(contextoDeCifra("línea uno\n\n  línea 7 dos", "7", 100), "línea uno línea 7 dos");
  assert.equal(contextoDeCifra('dice "faltan 3 días" en pantalla', "3", 100), "dice 'faltan 3 días' en pantalla");
});

test("contextoDeCifra aguanta números con punto o coma y un número que no está en el texto", () => {
  assert.equal(contextoDeCifra("cuesta 12,5 pesos", "12,5", 100), "cuesta 12,5 pesos");
  assert.equal(contextoDeCifra("sin numero", "9"), "sin numero");
  assert.equal(contextoDeCifra("x 3", "3", 1), "…3");
});

test("contextoDeCifra no confunde el 5 de 3,5 ni el 3 de 30 con el número que se busca", () => {
  assert.equal(contextoDeCifra("cuesta 3,5 y hay 5 más", "5", 3), "…ay 5 má…");
  assert.equal(contextoDeCifra("hay 30 cosas y 3 más", "3", 3), "…y 3 má…");
});
