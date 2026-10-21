import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearPieza } from "./ayuda-pruebas.js";
import { textoPieza, textoPlanSemanal, textoRecordatorio } from "./mensajes.js";

const INDICACION = "Imagen vertical 4:5 de 1080x1350, fondo negro #0A0A0A con mucho espacio vacío y luz suave. Texto exacto: DROP 01. 2027.";
const fila = (extra = {}, id = 1) => ({ id, fecha: "2026-10-31", hora: "19:00", estado: "propuesta", pieza: crearPieza({ fecha: "2026-10-31", ...extra }) });
const conIA = (extra = {}) => fila({ formato: "imagen", produccion: "ia", instrucciones_ia: INDICACION, material_a_producir: ["Imagen tipográfica de Drop 01"], ...extra });

describe("cómo se hace cada pieza (propio / IA / mixto)", () => {
  test("una pieza con IA muestra cómo hacerla, la indicación para copiar y qué crear", () => {
    const texto = textoPieza(conIA());
    assert.match(texto, /🛠️ Cómo hacerla: creada con IA/);
    assert.match(texto, /🤖 Indicación para tu IA \(copiala y pegala\):\nImagen vertical 4:5/);
    assert.match(texto, /🎨 Para crear con IA:\n {2}• Imagen tipográfica de Drop 01/);
    assert.doesNotMatch(texto, /Para filmar o sacar fotos/);
  });

  test("una pieza propia, o de un plan viejo sin el dato, queda como antes y no muestra indicación de IA", () => {
    const propia = textoPieza(fila({ produccion: "propio" }));
    assert.match(propia, /Cómo hacerla: con video o fotos propios/);
    assert.match(propia, /🎬 Para filmar o sacar fotos:/);
    assert.doesNotMatch(propia, /Indicación para tu IA/);
    const { produccion, instrucciones_ia: indicacion, ...vieja } = crearPieza({ fecha: "2026-10-31" });
    void produccion;
    void indicacion;
    const textoViejo = textoPieza({ id: 1, fecha: "2026-10-31", hora: "19:00", pieza: vieja });
    assert.doesNotMatch(textoViejo, /Cómo hacerla/);
    assert.match(textoViejo, /Para filmar o sacar fotos/);
  });

  test("una pieza mixta usa el título mixto, y si la indicación está vacía no inventa el bloque", () => {
    assert.match(textoPieza(conIA({ produccion: "mixto" })), /🎬 Para filmar y crear con IA:/);
    assert.doesNotMatch(textoPieza(conIA({ instrucciones_ia: "  " })), /Indicación para tu IA/);
  });

  test("una indicación larguísima se recorta y el mensaje sigue entrando en Telegram", () => {
    const texto = textoPieza(conIA({ instrucciones_ia: "palabra ".repeat(2000) }));
    assert.ok(texto.length <= 4096);
    assert.match(texto, /…/);
  });

  test("el plan semanal marca las piezas con IA y avisa dónde está la indicación; si todo es propio, queda el texto de siempre", () => {
    const plan = (filas) => textoPlanSemanal({ semana: "2026-10-26", resumen: "Resumen.", filas, hoy: "2026-10-26" });
    const mezcla = plan([fila({ material_a_producir: ["Plano de pies"] }, 1), conIA({}, 2)]);
    assert.match(mezcla, /Tenés que producir \(filmar, sacar fotos o crear con IA\)/);
    assert.match(mezcla, /\(imagen\) \[creada con IA\]: Imagen tipográfica de Drop 01/);
    assert.match(mezcla, /\(reel\): Plano de pies/);
    assert.match(mezcla, /La indicación para la IA de cada pieza está en su tarjeta/);
    const propias = plan([fila({ material_a_producir: ["Plano de pies"] })]);
    assert.match(propias, /Tenés que filmar o sacar fotos para:/);
    assert.doesNotMatch(propias, /IA/);
  });

  test("el recordatorio de 3 días antes lleva la indicación para la IA y el título según cómo se hace", () => {
    const ia = textoRecordatorio(conIA(), 3);
    assert.match(ia, /Tenés que crear con IA:/);
    assert.match(ia, /Indicación para tu IA/);
    assert.match(ia, /mandame el archivo respondiendo a este mensaje/);
    const propia = textoRecordatorio(fila({ material_a_producir: ["Plano de pies"] }), 3);
    assert.match(propia, /Tenés que filmar o sacar fotos:/);
    assert.doesNotMatch(propia, /Indicación para tu IA/);
  });
});
