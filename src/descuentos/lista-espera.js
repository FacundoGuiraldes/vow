// Beneficio para quienes se anotaron en la lista de espera: un código único por persona, enviado por mail con el diseño de VOW.
// Se dispara a mano: primero una prueba a un mail, después el envío real (en tandas, para no pasarse del límite diario de Gmail).
import { ErrorCodigo } from "./codigos.js";
import { armarMail } from "./correo.js";

const MAX_POR_TANDA = 80;

export function crearEnvioDescuentos({ codigos, listarEmails, correo, porcentaje, dias = 14, urlLanding, ahora = () => Date.now(), pausaMs = 1500, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const pendientes = async () => {
    const [emails, enviados] = await Promise.all([listarEmails(), codigos.emailsConEnvio()]);
    return { anotados: emails.length, pendientes: emails.filter((e) => !enviados.has(e)) };
  };

  return {
    porcentaje,
    async estado() {
      const { anotados, pendientes: faltan } = await pendientes();
      const r = await codigos.resumen();
      return { anotados, pendientes: faltan.length, enviados: r.enviados, usados: r.usados, porcentaje, dias };
    },

    // Manda el mail de ejemplo a una sola casilla, con un código de muestra que NO sirve para comprar
    async prueba(destino) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino ?? "")) throw new Error("Ese mail de destino no es válido.");
      const venceEn = new Date(ahora() + dias * 86_400_000).toISOString();
      const mail = armarMail({ codigo: "VOW-EJEMPL", drop: codigos.dropActual, porcentaje, vence: venceEn, urlLanding, contacto: correo.contacto, prueba: true });
      await correo.enviar({ para: destino, ...mail });
      return { enviadoA: destino };
    },

    // esperados: cuántos pendientes dijo Facundo que había; si no coincide, no se manda nada (evita mandar con datos viejos)
    async enviar({ esperados }) {
      const { pendientes: faltan } = await pendientes();
      if (!Number.isInteger(esperados) || esperados !== faltan.length) throw new Error(`Hay ${faltan.length} personas por avisar y se pidió enviar a ${esperados}. Revisá el estado y confirmá la cantidad.`);
      const tanda = faltan.slice(0, MAX_POR_TANDA);
      const venceEn = new Date(ahora() + dias * 86_400_000).toISOString();
      const mapa = await codigos.asegurarCodigos({ emails: tanda, porcentaje, venceEn });
      const fallidos = [];
      let enviados = 0;
      for (const email of tanda) {
        try {
          await correo.enviar({ para: email, ...armarMail({ codigo: mapa[email].codigo, drop: codigos.dropActual, porcentaje, vence: mapa[email].vence, urlLanding, contacto: correo.contacto }) });
          await codigos.marcarEnviado(email);
          enviados += 1;
        } catch (error) {
          fallidos.push({ email, motivo: String(error.message).slice(0, 120) });
        }
        await dormir(pausaMs);
      }
      return { enviados, fallidos, quedan: faltan.length - enviados };
    },
  };
}

// "Consultá tu código": quien se anotó escribe su mail en la tienda y ve su código al instante, sin depender de que llegue un mail.
// Solo devuelve algo si ese mail está en la lista de espera. El código es el mismo que recibiría por mail (uno por persona).
export function crearConsultaCodigo({ codigos, existeEmail, porcentaje, dias = 14, ahora = () => Date.now() }) {
  return {
    async consultar(emailCrudo) {
      const email = String(emailCrudo ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new ErrorCodigo("Escribí el mail con el que te anotaste.");
      if (!(await existeEmail(email))) throw new ErrorCodigo("No encontramos ese mail en la lista de espera. Revisá que sea el mismo con el que te anotaste.", 404);
      const venceEn = new Date(ahora() + dias * 86_400_000).toISOString();
      const { [email]: dato } = await codigos.asegurarCodigos({ emails: [email], porcentaje, venceEn });
      const usado = await codigos.estadoDe(dato.codigo);
      if (usado.usado) throw new ErrorCodigo("Ese código ya se usó.", 409);
      return { codigo: dato.codigo, porcentaje: usado.porcentaje, vence: dato.vence };
    },
  };
}
