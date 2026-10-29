// El mail con el código de descuento, con el diseño de VOW (negro, hueso y beige; tipografía de la marca con respaldo para los programas de mail).
// Se manda desde la cuenta de Gmail de VOW por SMTP. Los programas de mail no leen CSS externo ni SVG: todo va en línea y el logo es un PNG de la landing.
import nodemailer from "nodemailer";

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const FECHA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });

export function armarMail({ codigo, porcentaje, vence, urlLanding, contacto, prueba = false }) {
  const hasta = vence ? FECHA.format(new Date(vence)) : null;
  const url = `${urlLanding.replace(/\/$/, "")}/#tienda`;
  const logo = `${urlLanding.replace(/\/$/, "")}/assets/logo-mail.png`;
  const asunto = `${prueba ? "[PRUEBA] " : ""}Tu ${porcentaje}% off en el Drop 00 de VOW`;
  const titulo = "'Unbounded','Arial Black',Arial,Helvetica,sans-serif";
  const cuerpo = "'Space Grotesk',Arial,Helvetica,sans-serif";
  const mono = "'Space Mono','Courier New',monospace";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapar(asunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&family=Unbounded:wght@800;900&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#0A0A0A;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0A0A0A;">Te anotaste en la lista de espera. Tu código es ${escapar(codigo)}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0A0A0A;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#0A0A0A;">
<tr><td style="padding:0 0 28px 0;"><img src="${escapar(logo)}" width="72" height="72" alt="VOW" style="display:block;border:0;border-radius:14px;"></td></tr>
<tr><td style="font-family:${mono};font-size:12px;letter-spacing:3px;color:#8C8378;padding-bottom:14px;">DROP 00 · LISTA DE ESPERA</td></tr>
<tr><td style="font-family:${titulo};font-weight:900;font-size:34px;line-height:1.08;color:#ECE8E1;padding-bottom:20px;">${porcentaje}% OFF<br>PARA EL<br>DROP 00.</td></tr>
<tr><td style="font-family:${cuerpo};font-size:16px;line-height:1.6;color:#CDBFA6;padding-bottom:28px;">Te anotaste en la lista de espera de VOW. Por eso tenés un <strong style="color:#ECE8E1;">${porcentaje}% off</strong> en tu compra del Drop 00.</td></tr>
<tr><td style="padding-bottom:28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #ECE8E1;"><tr><td align="center" style="padding:22px 12px;">
<div style="font-family:${mono};font-size:11px;letter-spacing:3px;color:#8C8378;padding-bottom:10px;">TU CÓDIGO</div>
<div style="font-family:${mono};font-weight:700;font-size:30px;letter-spacing:4px;color:#ECE8E1;">${escapar(codigo)}</div>
</td></tr></table></td></tr>
<tr><td style="padding-bottom:30px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#ECE8E1;"><a href="${escapar(url)}" style="display:inline-block;padding:16px 28px;font-family:${titulo};font-weight:800;font-size:13px;letter-spacing:2px;color:#0A0A0A;text-decoration:none;">IR A LA TIENDA</a></td></tr></table></td></tr>
<tr><td style="font-family:${cuerpo};font-size:14px;line-height:1.7;color:#CDBFA6;padding-bottom:24px;border-top:1px solid #1A1A1A;padding-top:24px;">
<strong style="color:#ECE8E1;">Cómo usarlo:</strong> armá tu pedido en la tienda, pegá el código en el campo <em>Código de descuento</em> y vas a ver el precio final antes de pagar.<br><br>
Es personal y de un solo uso${hasta ? `, y vale hasta el <strong style="color:#ECE8E1;">${escapar(hasta)}</strong>` : ""}. El descuento aplica a los productos; el envío no lleva descuento.</td></tr>
<tr><td style="font-family:${mono};font-size:11px;line-height:1.7;color:#8C8378;border-top:1px solid #1A1A1A;padding-top:20px;">Recibís este mail porque te anotaste en la lista de espera de VOW. Si no querés recibir más, escribinos a <a href="mailto:${escapar(contacto)}?subject=Baja" style="color:#CDBFA6;">${escapar(contacto)}</a> y te damos de baja.<br><br>VOW · Argentina</td></tr>
</table></td></tr></table></body></html>`;
  const texto = [
    `VOW · DROP 00`,
    ``,
    `Te anotaste en la lista de espera de VOW. Por eso tenés un ${porcentaje}% off en tu compra del Drop 00.`,
    ``,
    `TU CÓDIGO: ${codigo}`,
    ``,
    `Cómo usarlo: armá tu pedido en ${url}, pegá el código en el campo "Código de descuento" y vas a ver el precio final antes de pagar.`,
    `Es personal y de un solo uso${hasta ? `, y vale hasta el ${hasta}` : ""}. El descuento aplica a los productos; el envío no lleva descuento.`,
    ``,
    `Recibís este mail porque te anotaste en la lista de espera de VOW. Si no querés recibir más, escribinos a ${contacto} y te damos de baja.`,
  ].join("\n");
  return { asunto, html, texto };
}

// Cuenta de Gmail con "contraseña de aplicación" (no la contraseña normal)
export function crearTransporteGmail({ usuario, clave }) {
  if (!usuario || !clave) throw new Error("Faltan MAIL_USUARIO o MAIL_CLAVE_APP.");
  const transporte = nodemailer.createTransport({ service: "gmail", auth: { user: usuario, pass: clave } });
  return {
    desde: `VOW <${usuario}>`,
    contacto: usuario,
    enviar: ({ para, asunto, html, texto }) => transporte.sendMail({ from: `VOW <${usuario}>`, to: para, subject: asunto, html, text: texto, headers: { "List-Unsubscribe": `<mailto:${usuario}?subject=Baja>` } }),
  };
}
