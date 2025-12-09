// src/services/email.service.js
const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.mailUser,
    pass: env.mailPass,
  },
});

/**
 * Kirim email verifikasi
 * @param {Object} params
 * @param {string} params.to   - email tujuan
 * @param {string} params.link - link verifikasi lengkap
 */
async function sendVerificationEmail({ to, link }) {
  if (!env.mailUser || !env.mailPass) {
    console.error('[EMAIL] MAIL_USER / MAIL_PASS belum di-set di .env');
    return;
  }

  const mailOptions = {
    from: env.mailFrom,
    to,
    subject: 'Verifikasi Email - PDF AUTORAN',
    html: `
      <p>Halo,</p>
      <p>Terima kasih telah mendaftar di <b>PDF AUTORAN</b>.</p>
      <p>Silakan klik link berikut untuk verifikasi email Anda:</p>
      <p><a href="${link}" target="_blank">${link}</a></p>
      <p>Jika Anda tidak merasa mendaftar, abaikan email ini.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL] Verifikasi terkirim:', info.messageId);
  } catch (err) {
    console.error('[EMAIL] Gagal kirim verifikasi:', err.message);
  }
}

module.exports = {
  sendVerificationEmail,
};
