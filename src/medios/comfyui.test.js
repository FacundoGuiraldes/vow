import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteComfyUI, llenarFlujo, ErrorComfyUI } from "./comfyui.js";

const PLANTILLA = JSON.stringify({ 6: { class_type: "CLIPTextEncode", inputs: { text: "{{PROMPT}}" } } });
const resp = (cuerpo, { ok = true, status = 200, bytes = null } = {}) => ({ ok, status, json: async () => cuerpo, arrayBuffer: async () => bytes ?? new ArrayBuffer(0), headers: { get: () => "video/mp4" } });
const sinEspera = { dormir: async () => {}, intervaloMs: 0 };

describe("ComfyUI", () => {
  test("llena {{PROMPT}} con la descripción y el estilo de VOW, aun con comillas", () => {
    const flujo = llenarFlujo(PLANTILLA, 'Un "short" negro');
    assert.match(flujo[6].inputs.text, /^Un "short" negro\. /);
    assert.match(flujo[6].inputs.text, /negro profundo/);
  });

  test("envía el flujo, espera el resultado y baja el video", async () => {
    const llamadas = [];
    let consultas = 0;
    const fetchFn = async (url, opc) => {
      llamadas.push(url);
      if (url.endsWith("/prompt")) { assert.ok(JSON.parse(opc.body).prompt[6]); return resp({ prompt_id: "abc" }); }
      if (url.includes("/history/abc")) return resp(++consultas < 2 ? {} : { abc: { status: { status_str: "success" }, outputs: { 9: { images: [{ filename: "vow video.mp4", subfolder: "", type: "output" }, { filename: "prev.png", type: "temp" }] } } } });
      if (url.includes("/view?")) return resp({}, { bytes: new Uint8Array([1, 2, 3]).buffer });
      throw new Error(`inesperado ${url}`);
    };
    const { archivos } = await crearClienteComfyUI({ fetchFn, ...sinEspera }).generar({ plantilla: PLANTILLA, descripcion: "una gorra" });
    assert.equal(archivos.length, 1);
    assert.equal(archivos[0].nombre, "vow_video.mp4");
    assert.deepEqual([...archivos[0].bytes], [1, 2, 3]);
    assert.equal(llamadas.filter((u) => u.includes("/view?")).length, 1);
  });

  test("errores claros: sin ComfyUI abierto, flujo sin {{PROMPT}}, pedido rechazado, falla al generar, tiempo agotado", async () => {
    const caido = crearClienteComfyUI({ fetchFn: async () => { throw new Error("ECONNREFUSED"); }, ...sinEspera });
    await assert.rejects(caido.generar({ plantilla: PLANTILLA, descripcion: "x" }), /¿Está abierto\?/);
    await assert.rejects(caido.generar({ plantilla: "{}", descripcion: "x" }), /\{\{PROMPT\}\}/);
    await assert.rejects(caido.generar({ plantilla: PLANTILLA, descripcion: "  " }), ErrorComfyUI);
    const rechaza = crearClienteComfyUI({ fetchFn: async () => resp({ error: { message: "modelo no encontrado" } }, { ok: false, status: 400 }), ...sinEspera });
    await assert.rejects(rechaza.generar({ plantilla: PLANTILLA, descripcion: "x" }), /modelo no encontrado/);
    const falla = crearClienteComfyUI({ fetchFn: async (u) => (u.endsWith("/prompt") ? resp({ prompt_id: "z" }) : resp({ z: { status: { status_str: "error" } } })), ...sinEspera });
    await assert.rejects(falla.generar({ plantilla: PLANTILLA, descripcion: "x" }), /falló al generar/);
    let t = 0;
    const lento = crearClienteComfyUI({ fetchFn: async (u) => (u.endsWith("/prompt") ? resp({ prompt_id: "z" }) : resp({})), ...sinEspera, maxEsperaMs: 5, ahora: () => (t += 3) });
    await assert.rejects(lento.generar({ plantilla: PLANTILLA, descripcion: "x" }), /tardó demasiado/);
  });
});
