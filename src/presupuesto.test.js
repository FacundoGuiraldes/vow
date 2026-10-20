import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AVISAR_DESDE, ErrorPresupuesto, TOPE_MENSUAL_USD_POR_DEFECTO, conPresupuesto, estadoDelMes, gastoDelMes,
  libroEnDisco, libroNuevo, mesDe, registrarMovimiento, topeDesdeEntorno,
} from "./presupuesto.js";

// 1.000.000 tokens de entrada = US$ 2; 100.000 de salida = US$ 1  (precios de orquestador.js)
const USO_DE_3_USD = { entrada: 1_000_000, salida: 100_000 };
const fecha = (iso) => new Date(iso);

test("mesDe cuenta el mes con la hora de Argentina, no con UTC", () => {
  assert.equal(mesDe(fecha("2026-10-19T12:00:00Z")), "2026-10");
  assert.equal(mesDe(fecha("2026-11-01T01:00:00Z")), "2026-10"); // 22 hs del 31/10 en Buenos Aires
  assert.equal(mesDe(fecha("2026-11-01T03:00:00Z")), "2026-11"); // 00 hs del 1/11 en Buenos Aires
});

test("registrarMovimiento calcula el costo, anota el mes y no modifica el libro original", () => {
  const original = libroNuevo();
  const libro = registrarMovimiento(original, { fecha: fecha("2026-10-19T12:00:00Z"), origen: "plan", uso: USO_DE_3_USD });
  assert.equal(original.movimientos.length, 0);
  assert.deepEqual(libro.movimientos, [
    { fecha: "2026-10-19T12:00:00.000Z", mes: "2026-10", origen: "plan", entrada: 1_000_000, salida: 100_000, costoUSD: 3 },
  ]);
});

test("gastoDelMes suma solo los movimientos de ese mes", () => {
  let libro = libroNuevo();
  libro = registrarMovimiento(libro, { fecha: fecha("2026-09-30T12:00:00Z"), origen: "a", uso: USO_DE_3_USD });
  libro = registrarMovimiento(libro, { fecha: fecha("2026-10-02T12:00:00Z"), origen: "a", uso: USO_DE_3_USD });
  libro = registrarMovimiento(libro, { fecha: fecha("2026-10-03T12:00:00Z"), origen: "b", uso: { entrada: 500_000, salida: 0 } });
  assert.equal(gastoDelMes(libro, "2026-10"), 4);
  assert.equal(gastoDelMes(libro, "2026-09"), 3);
  assert.equal(gastoDelMes(libro, "2026-08"), 0);
});

test("estadoDelMes: quedan dólares hasta el tope y al llegar justo al tope ya está agotado", () => {
  const libro = registrarMovimiento(libroNuevo(), { fecha: fecha("2026-10-02T12:00:00Z"), origen: "a", uso: USO_DE_3_USD });
  assert.deepEqual(estadoDelMes(libro, { mes: "2026-10", topeUSD: 5 }), { mes: "2026-10", topeUSD: 5, gastado: 3, restante: 2, agotado: false });
  assert.deepEqual(estadoDelMes(libro, { mes: "2026-10", topeUSD: 3 }), { mes: "2026-10", topeUSD: 3, gastado: 3, restante: 0, agotado: true });
  assert.deepEqual(estadoDelMes(libro, { mes: "2026-10", topeUSD: 2 }), { mes: "2026-10", topeUSD: 2, gastado: 3, restante: 0, agotado: true });
});

test("topeDesdeEntorno usa el de por defecto, acepta un número válido y se queja de lo demás", () => {
  assert.equal(TOPE_MENSUAL_USD_POR_DEFECTO, 5);
  assert.equal(topeDesdeEntorno({}), 5);
  assert.equal(topeDesdeEntorno({ TOPE_MENSUAL_USD: "" }), 5);
  assert.equal(topeDesdeEntorno({ TOPE_MENSUAL_USD: "12.5" }), 12.5);
  for (const malo of ["abc", "0", "-3", "Infinity"]) {
    assert.throws(() => topeDesdeEntorno({ TOPE_MENSUAL_USD: malo }), /TOPE_MENSUAL_USD tiene que ser un número mayor que 0/, malo);
  }
});

// Un libro en memoria y un cliente falso que cuenta cuántas veces lo llamaron
function armar({ topeUSD = 5, libro = libroNuevo(), uso = USO_DE_3_USD, ahora = () => fecha("2026-10-19T12:00:00Z"), fallaAlGuardar = false } = {}) {
  const estado = { libro, llamadas: [], avisos: [] };
  const cliente = {
    messages: {
      create: async (...argumentos) => {
        estado.llamadas.push(argumentos);
        return { content: [], usage: { input_tokens: uso.entrada, output_tokens: uso.salida } };
      },
    },
  };
  estado.cliente = conPresupuesto(cliente, {
    origen: "prueba",
    topeUSD,
    ahora,
    avisar: (texto) => estado.avisos.push(texto),
    leerLibro: async () => estado.libro,
    guardarLibro: async (nuevo) => {
      if (fallaAlGuardar) throw new Error("disco lleno");
      estado.libro = nuevo;
    },
  });
  return estado;
}

test("conPresupuesto pasa los argumentos y la respuesta tal cual y anota el gasto", async () => {
  const e = armar();
  const pedido = { model: "m", messages: [{ role: "user", content: "hola" }] };
  const respuesta = await e.cliente.messages.create(pedido);
  assert.deepEqual(e.llamadas, [[pedido]]);
  assert.deepEqual(respuesta, { content: [], usage: { input_tokens: 1_000_000, output_tokens: 100_000 } });
  assert.equal(e.libro.movimientos.length, 1);
  assert.equal(e.libro.movimientos[0].origen, "prueba");
  assert.equal(e.libro.movimientos[0].costoUSD, 3);
});

test("conPresupuesto corta ANTES de llamar cuando el mes llegó al tope", async () => {
  const lleno = registrarMovimiento(libroNuevo(), { fecha: fecha("2026-10-02T12:00:00Z"), origen: "a", uso: USO_DE_3_USD });
  const e = armar({ topeUSD: 3, libro: lleno });
  await assert.rejects(
    () => e.cliente.messages.create({}),
    (error) => {
      assert.ok(error instanceof ErrorPresupuesto);
      assert.match(error.message, /Tope mensual alcanzado: llevás US\$ 3\.00 de US\$ 3\.00 en 2026-10\. No se hizo la llamada\./);
      assert.match(error.message, /TOPE_MENSUAL_USD/);
      assert.equal(error.estado.agotado, true);
      return true;
    },
  );
  assert.equal(e.llamadas.length, 0); // no se gastó nada
  assert.equal(e.libro.movimientos.length, 1); // y no se anotó nada nuevo
});

test("conPresupuesto deja pasar si falta un centavo para el tope, y el siguiente ya se corta", async () => {
  const e = armar({ topeUSD: 4 }); // cada llamada cuesta 3
  await e.cliente.messages.create({}); // 0 de 4: pasa
  await e.cliente.messages.create({}); // 3 de 4: pasa (la llamada puede pasarse del tope, por eso el tope es un freno y no un límite exacto)
  await assert.rejects(() => e.cliente.messages.create({}), ErrorPresupuesto); // 6 de 4: se corta
  assert.equal(e.llamadas.length, 2);
});

test("conPresupuesto empieza de cero cuando cambia el mes", async () => {
  const lleno = registrarMovimiento(libroNuevo(), { fecha: fecha("2026-10-02T12:00:00Z"), origen: "a", uso: USO_DE_3_USD });
  const e = armar({ topeUSD: 3, libro: lleno, ahora: () => fecha("2026-11-02T12:00:00Z") });
  await e.cliente.messages.create({});
  assert.equal(e.llamadas.length, 1);
  assert.equal(e.libro.movimientos.at(-1).mes, "2026-11");
});

test("conPresupuesto avisa una sola vez al pasar del 80% del tope", async () => {
  assert.equal(AVISAR_DESDE, 0.8);
  const e = armar({ topeUSD: 10, uso: { entrada: 1_000_000, salida: 0 } }); // cada llamada cuesta 2
  for (let i = 0; i < 3; i++) await e.cliente.messages.create({}); // 2, 4, 6: nada
  assert.deepEqual(e.avisos, []);
  await e.cliente.messages.create({}); // 8 = 80%: avisa
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /llevás US\$ 8\.00 de US\$ 10\.00 del tope de 2026-10 \(80%\)/);
  await e.cliente.messages.create({}); // 10: ya había avisado, y ahora está agotado
  assert.equal(e.avisos.length, 1);
});

test("conPresupuesto no avisa si la llamada ya empezó por encima del 80%", async () => {
  const previo = registrarMovimiento(libroNuevo(), { fecha: fecha("2026-10-02T12:00:00Z"), origen: "a", uso: { entrada: 5_000_000, salida: 0 } }); // 10 de 12: ya pasó el 80% (9,60)
  const e = armar({ topeUSD: 12, libro: previo, uso: { entrada: 500_000, salida: 0 } });
  await e.cliente.messages.create({});
  assert.deepEqual(e.avisos, []);
});

test("conPresupuesto no anota nada si la llamada a la IA falla", async () => {
  const e = armar();
  e.cliente = conPresupuesto(
    { messages: { create: async () => { throw new Error("sin red"); } } },
    { origen: "x", topeUSD: 5, leerLibro: async () => e.libro, guardarLibro: async (l) => { e.libro = l; }, avisar: () => {} },
  );
  await assert.rejects(() => e.cliente.messages.create({}), /sin red/);
  assert.equal(e.libro.movimientos.length, 0);
});

test("conPresupuesto devuelve la respuesta aunque no pueda anotar el gasto, y lo avisa", async () => {
  const e = armar({ fallaAlGuardar: true });
  const respuesta = await e.cliente.messages.create({});
  assert.ok(respuesta.usage);
  assert.equal(e.avisos.length, 1);
  assert.match(e.avisos[0], /No se pudo anotar el gasto.*disco lleno.*por debajo del real/);
});

test("conPresupuesto vuelve a leer el libro antes de anotar, para no pisar el gasto de otro comando", async () => {
  let libro = libroNuevo();
  const otro = registrarMovimiento(libroNuevo(), { fecha: fecha("2026-10-19T11:00:00Z"), origen: "otro", uso: USO_DE_3_USD });
  const cliente = conPresupuesto(
    { messages: { create: async () => { libro = otro; return { usage: { input_tokens: 0, output_tokens: 0 } }; } } }, // mientras esperábamos, otro anotó
    { origen: "yo", topeUSD: 50, ahora: () => fecha("2026-10-19T12:00:00Z"), leerLibro: async () => libro, guardarLibro: async (l) => { libro = l; }, avisar: () => {} },
  );
  await cliente.messages.create({});
  assert.deepEqual(libro.movimientos.map((m) => m.origen), ["otro", "yo"]);
});

test("libroEnDisco: si no existe arranca vacío, y lo que se guarda se vuelve a leer", async () => {
  const carpeta = await mkdtemp(join(tmpdir(), "vow-libro-"));
  const { leer, guardar } = libroEnDisco(join(carpeta, "sub", "libro.json")); // la subcarpeta no existe: se crea
  assert.deepEqual(await leer(), libroNuevo());
  const libro = registrarMovimiento(libroNuevo(), { fecha: fecha("2026-10-19T12:00:00Z"), origen: "plan", uso: USO_DE_3_USD });
  await guardar(libro);
  assert.deepEqual(await leer(), libro);
  assert.ok((await readFile(join(carpeta, "sub", "libro.json"), "utf8")).endsWith("}\n"));
});

test("libroEnDisco avisa si el archivo está roto en vez de empezar de cero y perder el gasto", async () => {
  const carpeta = await mkdtemp(join(tmpdir(), "vow-libro-"));
  const { guardar, leer } = libroEnDisco(join(carpeta, "libro.json"));
  await guardar(libroNuevo());
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(carpeta, "libro.json"), "{ esto no es json");
  await assert.rejects(() => leer(), SyntaxError);
});

test("crearClienteReal se queja si el tope del .env es inválido, antes de gastar nada", async () => {
  const { crearClienteReal } = await import("./cliente-real.js");
  await assert.rejects(() => crearClienteReal("prueba", { env: { TOPE_MENSUAL_USD: "mucho" } }), /TOPE_MENSUAL_USD tiene que ser un número mayor que 0/);
});

test("corteLimpio muestra solo el mensaje del tope y sale con 1; lo demás pasa de largo", async () => {
  const { corteLimpio } = await import("./cliente-real.js");
  const escrito = [];
  const salidas = [];
  const opciones = { escribir: (t) => escrito.push(t), salir: (c) => { salidas.push(c); return "salió"; } };

  assert.equal(await corteLimpio(Promise.resolve(42), opciones), 42); // lo que sale bien se devuelve igual
  assert.deepEqual([escrito, salidas], [[], []]);

  assert.equal(await corteLimpio(Promise.reject(new ErrorPresupuesto("Tope mensual alcanzado: x", {})), opciones), "salió");
  assert.deepEqual(escrito, ["Tope mensual alcanzado: x"]);
  assert.deepEqual(salidas, [1]);

  await assert.rejects(() => corteLimpio(Promise.reject(new Error("otro problema")), opciones), /otro problema/);
  assert.deepEqual(salidas, [1]); // un error común no sale ni escribe
  assert.equal(escrito.length, 1);
});
