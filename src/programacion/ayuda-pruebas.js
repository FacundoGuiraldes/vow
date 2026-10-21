// Piezas de apoyo para los tests de la publicación programada: una pieza real de ejemplo, un Telegram y un Meta falsos
// (anotan lo que se les pidió) y un reloj que se mueve a mano. Ningún test toca la red, la base ni la cuenta real.
import { crearValidadorEdicion } from "./editor.js";
import { crearRepositorioMemoria } from "./repositorio-memoria.js";
import { crearServicio } from "./servicio.js";

export const CHAT = 42;
export const URL_PUBLICA = "https://vow.example.com";

// Una pieza que pasa todas las reglas de marca (sale de un plan real del Estratega)
export const crearPieza = (extra = {}) => ({
  fecha: "2026-10-30",
  hora: "19:00",
  formato: "reel",
  pilar: "gente que entrena",
  gancho: "Atate el compromiso. Salí.",
  ganchos_alternativos: ["Cumplí sin avisarle a nadie", "Llegá callado. Cumplí igual", "Sostené lo que te prometiste", "Hacelo hoy. Hacelo en silencio"],
  guion: "Un solo plano continuo, vertical, filmado por Facundo con el celular apoyado en el piso o en un banco, sin mostrar la cara. Primer cuadro: sus pies y las manos atando el cordón.",
  texto_en_pantalla: ["Atate el compromiso.", "Salí.", "Una promesa con vos.", "Lista de espera: link en la bio."],
  epigrafe: "Nadie ve este momento y es el que cuenta. Una promesa con vos. Anotate en la lista de espera: link en la bio.",
  palabras_clave: ["promesa", "constancia", "entrenar", "compromiso", "lista de espera"],
  cta: "Anotarse en la lista de espera (link en la bio).",
  recursos: ["Celular vertical y un lugar donde apoyarlo", "Luz natural"],
  material_a_producir: ["Pies y manos atando el cordón, plano vertical"],
  justificacion: "Muestra gente entrenando de verdad y un proceso real, sin físico y sin producto.",
  ...extra,
});

export const crearPlan = (piezas) => ({ resumen: "Plan de prueba.", piezas });

export function crearTelegramFalso() {
  const enviados = [];
  const archivos = new Map();
  const quitados = [];
  let siguiente = 100;
  return {
    chatId: String(CHAT),
    enviados,
    archivos,
    quitados,
    async enviarMensaje(texto, opciones = {}) {
      const id = siguiente++;
      enviados.push({ id, texto, ...opciones });
      return id;
    },
    async enviarFoto(foto, opciones = {}) {
      const id = siguiente++;
      const fileId = `foto-ia-${id}`;
      archivos.set(fileId, foto); // igual que Telegram: la foto enviada se puede volver a bajar con su file_id
      enviados.push({ id, texto: opciones.texto ?? "", foto: true, fileId, ...opciones });
      return { id, fileId };
    },
    async escribiendo() {},
    async enviarA(destino, texto) {
      enviados.push({ destino, texto });
    },
    async quitarBotones(mensajeId) { quitados.push(mensajeId); },
    async responderBoton() {},
    async descargarArchivo(fileId) {
      if (!archivos.has(fileId)) throw new Error("No existe ese archivo.");
      return archivos.get(fileId);
    },
    ultimo: () => enviados.at(-1),
    textos: () => enviados.map((e) => e.texto),
    // Último mensaje que tenga ese texto adentro
    buscar: (fragmento) => [...enviados].reverse().find((e) => e.texto.includes(fragmento)),
    cantidad: (fragmento) => enviados.filter((e) => e.texto.includes(fragmento)).length,
  };
}

export function crearMetaFalso() {
  const llamadas = [];
  const estado = { contenedor: "FINISHED", fallaAlPublicar: false, cupo: { usado: 0, total: 100 } };
  return {
    llamadas,
    estado,
    async cupo() {
      return estado.cupo;
    },
    async crearContenedor(parametros) {
      llamadas.push(["crearContenedor", parametros]);
      return `contenedor-${llamadas.length}`;
    },
    async estadoContenedor() {
      return estado.contenedor;
    },
    async publicar(contenedor) {
      llamadas.push(["publicar", contenedor]);
      if (estado.fallaAlPublicar) throw new Error("Meta rechazó la publicación.");
      return { id: "1789", permalink: "https://www.instagram.com/p/ABC123/" };
    },
    veces: (nombre) => llamadas.filter(([n]) => n === nombre).length,
  };
}

// Escenario completo: servicio + repositorio en memoria + Telegram y Meta falsos + reloj manual
export function crearEscenario({ fecha = "2026-10-30", hora = "08:00", permitirPublicar = true, editor = null, sinMeta = false, generadorImagen = null, llm = null } = {}) {
  const reloj = { fecha, hora };
  const repo = crearRepositorioMemoria();
  const telegram = crearTelegramFalso();
  const meta = sinMeta ? null : crearMetaFalso();
  const servicio = crearServicio({ repo, telegram, meta, editor, generadorImagen, llm, validarEdicion: llm ? crearValidadorEdicion() : null, ahora: () => ({ ...reloj }), urlPublica: URL_PUBLICA, permitirPublicar });
  let mensajeEntrante = 5000;

  const actualizacion = {
    boton: (dato, mensajeId = 1, chat = CHAT) => ({ callback_query: { id: "cb", data: dato, message: { message_id: mensajeId, chat: { id: chat } } } }),
    texto: (texto, { respondeA = null, chat = CHAT } = {}) => ({
      message: { message_id: mensajeEntrante++, chat: { id: chat }, text: texto, ...(respondeA ? { reply_to_message: { message_id: respondeA } } : {}) },
    }),
    video: (fileId, { respondeA = null } = {}) => ({
      message: { message_id: mensajeEntrante++, chat: { id: CHAT }, video: { file_id: fileId, mime_type: "video/mp4", file_size: 1000 }, ...(respondeA ? { reply_to_message: { message_id: respondeA } } : {}) },
    }),
    foto: (fileId, { respondeA = null } = {}) => ({
      message: { message_id: mensajeEntrante++, chat: { id: CHAT }, photo: [{ file_id: `${fileId}-chica`, file_size: 10 }, { file_id: fileId, file_size: 100 }], ...(respondeA ? { reply_to_message: { message_id: respondeA } } : {}) },
    }),
  };

  return {
    reloj,
    repo,
    telegram,
    meta,
    servicio,
    actualizacion,
    mover: (nuevaHora, nuevaFecha) => {
      reloj.hora = nuevaHora;
      if (nuevaFecha) reloj.fecha = nuevaFecha;
    },
    mandar: (cuerpo) => servicio.manejarActualizacion(cuerpo),
    // Deja una pieza del día lista (aprobada) y devuelve su fila
    async cargarPieza(extra = {}, semana = "2026-10-26") {
      await servicio.recibirPlan({ semana, plan: crearPlan([crearPieza(extra)]) });
      const [fila] = await repo.piezasDeSemana(semana);
      return fila;
    },
  };
}
