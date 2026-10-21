import { test } from "node:test";
import assert from "node:assert/strict";
import { crearClienteTelegram, ErrorTelegram, LIMITE_MENSAJE } from "./telegram.js";

const respuestaJSON = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

function clienteConRespuestas(...respuestas) {
  const pedidos = [];
  const fetchFn = async (url, opciones) => {
    pedidos.push({ url: String(url), cuerpo: opciones?.body ? JSON.parse(opciones.body) : null });
    const siguiente = respuestas.shift();
    return typeof siguiente === "function" ? siguiente() : siguiente;
  };
  return { cliente: crearClienteTelegram({ token: "123:ABC", chatId: 42, fetchFn }), pedidos };
}

test("enviarMensaje manda el texto con botones y devuelve el ID del mensaje", async () => {
  const { cliente, pedidos } = clienteConRespuestas(respuestaJSON({ ok: true, result: { message_id: 77 } }));
  const id = await cliente.enviarMensaje("Hola", { botones: [[{ texto: "Sí", dato: "si:1" }]], responderA: 5 });
  assert.equal(id, 77);
  assert.equal(pedidos[0].url, "https://api.telegram.org/bot123:ABC/sendMessage");
  assert.equal(pedidos[0].cuerpo.chat_id, 42);
  assert.deepEqual(pedidos[0].cuerpo.reply_markup, { inline_keyboard: [[{ text: "Sí", callback_data: "si:1" }]] });
  assert.equal(pedidos[0].cuerpo.reply_parameters.message_id, 5);
});

test("recorta los mensajes que pasan el límite de Telegram", async () => {
  const { cliente, pedidos } = clienteConRespuestas(respuestaJSON({ ok: true, result: { message_id: 1 } }));
  await cliente.enviarMensaje("x".repeat(LIMITE_MENSAJE + 500));
  assert.equal(pedidos[0].cuerpo.text.length, LIMITE_MENSAJE);
});

test("un error de Telegram sale con su descripción y sin el token", async () => {
  const { cliente } = clienteConRespuestas(respuestaJSON({ ok: false, error_code: 400, description: "chat not found" }, 400));
  await assert.rejects(cliente.enviarMensaje("Hola"), (error) => {
    assert.ok(error instanceof ErrorTelegram);
    assert.match(error.message, /chat not found/);
    assert.ok(!error.message.includes("123:ABC"));
    return true;
  });
});

test("si no hay conexión, el error no filtra la dirección con el token", async () => {
  const cliente = crearClienteTelegram({
    token: "123:ABC",
    chatId: 42,
    fetchFn: async () => {
      throw new Error("fetch failed https://api.telegram.org/bot123:ABC/sendMessage");
    },
  });
  await assert.rejects(cliente.enviarMensaje("Hola"), (error) => {
    assert.equal(error.message, "No se pudo conectar con Telegram.");
    return true;
  });
});

test("descargarArchivo pide la ruta y baja el contenido", async () => {
  const { cliente, pedidos } = clienteConRespuestas(
    respuestaJSON({ ok: true, result: { file_path: "videos/file_1.mp4", file_size: 4 } }),
    new Response(Buffer.from("abcd")),
  );
  const datos = await cliente.descargarArchivo("FILEID");
  assert.equal(datos.toString(), "abcd");
  assert.equal(pedidos[0].cuerpo.file_id, "FILEID");
  assert.equal(pedidos[1].url, "https://api.telegram.org/file/bot123:ABC/videos/file_1.mp4");
});

test("descargarArchivo explica cuando el archivo pesa más de 20 MB", async () => {
  const { cliente } = clienteConRespuestas(respuestaJSON({ ok: false, error_code: 400, description: "Bad Request: file is too big" }, 400));
  await assert.rejects(cliente.descargarArchivo("GRANDE"), /pesa más de 20 MB/);
});

test("configurarWebhook manda la dirección y el secreto", async () => {
  const { cliente, pedidos } = clienteConRespuestas(respuestaJSON({ ok: true, result: true }));
  await cliente.configurarWebhook("https://vow.example.com/api/programacion/telegram", "secreto-largo-1234");
  assert.equal(pedidos[0].url, "https://api.telegram.org/bot123:ABC/setWebhook");
  assert.equal(pedidos[0].cuerpo.secret_token, "secreto-largo-1234");
  assert.deepEqual(pedidos[0].cuerpo.allowed_updates, ["message", "callback_query"]);
});

test("chatId queda como texto para compararlo con el de los mensajes", () => {
  assert.equal(crearClienteTelegram({ token: "t", chatId: 42 }).chatId, "42");
  assert.equal(crearClienteTelegram({ token: "t" }).chatId, null);
});

test("enviarFoto sube la imagen con texto y botones, y devuelve el ID del mensaje y el file_id de la foto más grande", async () => {
  let pedido;
  const fetchFn = async (url, opciones) => {
    pedido = { url: String(url), formulario: opciones.body };
    return respuestaJSON({ ok: true, result: { message_id: 90, photo: [{ file_id: "chica" }, { file_id: "grande" }] } });
  };
  const cliente = crearClienteTelegram({ token: "123:ABC", chatId: 42, fetchFn });
  const resultado = await cliente.enviarFoto(Buffer.from([1, 2, 3]), { texto: "Mirá", botones: [[{ texto: "Usar", dato: "ia_usar:1" }]], responderA: 7 });
  assert.deepEqual(resultado, { id: 90, fileId: "grande" });
  assert.equal(pedido.url, "https://api.telegram.org/bot123:ABC/sendPhoto");
  assert.equal(pedido.formulario.get("chat_id"), "42");
  assert.equal(pedido.formulario.get("caption"), "Mirá");
  assert.equal((await pedido.formulario.get("photo").arrayBuffer()).byteLength, 3);
  assert.deepEqual(JSON.parse(pedido.formulario.get("reply_markup")), { inline_keyboard: [[{ text: "Usar", callback_data: "ia_usar:1" }]] });
  assert.equal(JSON.parse(pedido.formulario.get("reply_parameters")).message_id, 7);
});

test("enviarFoto no filtra el token cuando falla", async () => {
  const cliente = crearClienteTelegram({ token: "123:ABC", chatId: 42, fetchFn: async () => { throw new Error("falló https://api.telegram.org/bot123:ABC/sendPhoto"); } });
  await assert.rejects(cliente.enviarFoto(Buffer.from([1])), (error) => error instanceof ErrorTelegram && !error.message.includes("123:ABC"));
  const rechazado = crearClienteTelegram({ token: "123:ABC", chatId: 42, fetchFn: async () => respuestaJSON({ ok: false, description: "Bad Request" }, 400) });
  await assert.rejects(rechazado.enviarFoto(Buffer.from([1])), /Telegram rechazó sendPhoto: Bad Request/);
});
