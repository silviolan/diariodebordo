'use strict';

/**
 * Envio de e-mail OPCIONAL.
 * Só é ativado se as variáveis SMTP_* estiverem definidas no ambiente.
 * Sem elas, tudo funciona normalmente — apenas não envia notificações.
 */

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (_e) {
  /* dependência ausente — segue desativado */
}

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT || 587);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM || USER;
const APP_URL = (process.env.APP_URL || '').trim();

let transporter = null;
if (nodemailer && HOST && USER && PASS) {
  transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user: USER, pass: PASS },
  });
  console.log('[mailer] Notificações por e-mail ATIVADAS (servidor ' + HOST + ').');
} else {
  console.log('[mailer] Notificações por e-mail desativadas (variáveis SMTP_* não definidas).');
}

function isEnabled() {
  return Boolean(transporter);
}

async function sendAnnouncement(announcement, recipients) {
  if (!transporter || !recipients || !recipients.length) return;

  const parts = [announcement.title, ''];
  if (announcement.body) parts.push(announcement.body, '');
  if (announcement.link) parts.push('Link: ' + announcement.link, '');
  if (APP_URL) parts.push('Acesse o diário: ' + APP_URL, '');
  parts.push('— Raíz Digital · Diário de bordo');

  await transporter.sendMail({
    from: FROM,
    to: FROM, // remetente também no "to"; equipe vai em cópia oculta
    bcc: recipients, // preserva a privacidade dos e-mails
    subject: `[Raíz Digital] ${announcement.title}`,
    text: parts.join('\n'),
  });
}

module.exports = { isEnabled, sendAnnouncement };
